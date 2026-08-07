// Transações Automatizadas — pedido do Felipe, 07/08/2026 (pergunta
// original: "é possível configurar o sistema para automatizar transações
// também? [...] eu cadastraria no sistema que todo dia 1º o sistema deve
// realizar um pix para JURANDIR ROBERTO DE FARIAS no valor de -R$468,00 a
// título de vale-transporte. Dia 1º o sistema dá início por conta própria
// ao processo de pagamento, cabendo ao perfil GERENTE apenas confirmar o
// valor em uma tela de TRANSAÇÕES. Após confirmação [...] cabendo ao
// perfil Master, titular da conta, apenas confirmar a transação").
//
// Fase 1 (decisão do Felipe depois de eu explicar que o Pluggy hoje só
// está integrado pra LEITURA — automatizar o Pix de verdade exigiria um
// contrato à parte de Iniciação de Pagamento): "Daria certo o sistema
// cadastrar as transações e o Master aprovar pelo internet banking do
// banco?" — sim. O fluxo é maker-checker em 2 etapas:
//   1. Cron diário (ver apps/financeiro/.../api/cron/transacoes-
//      automatizadas) gera a pendência sozinho, no dia configurado da
//      regra — sem nenhuma ação humana até aqui.
//   2. GERENTE confirma (ou ajusta) o valor na tela de Transações.
//   3. MASTER confirma que efetuou o Pix pelo internet banking dele — só
//      NESTE momento o sistema grava um FinanceLancamento normal (um
//      "previsto" MANUAL, igual qualquer outro lançamento futuro digitado
//      à mão). A Conciliação já casa esse previsto com a transação REAL
//      quando ela chegar do banco via Pluggy — nenhuma lógica nova lá.
//
// Rejeição é permitida em qualquer uma das duas etapas de aprovação (ex.:
// GERENTE percebe que o valor mudou e ainda não tem a regra atualizada, ou
// Master decide não pagar aquele mês) — a execução fica com um registro
// permanente (histórico), nunca é apagada.

import { Prisma } from "../../generated";
import { prisma } from "../prisma";
import { limitesDoMes } from "./mes";
import { validarCategoriaTipo } from "./sugestao-categoria";
import { sendPushToUser } from "../push";

export type StatusTransacaoExecucao = "AGUARDANDO_GERENTE" | "AGUARDANDO_MASTER" | "CONFIRMADA" | "REJEITADA";

export interface DadosTransacaoAutomatizada {
  descricao: string;
  favorecido: string;
  dadosBancarios: string;
  valor: number; // magnitude, sempre positiva — o sinal de saída é aplicado na hora de gerar o lançamento
  diaDoMes: number; // 1-31
  categoriaId: string;
  centroCustoTipo?: string; // ADMINISTRACAO (default) | EMPREENDIMENTO | UNIDADE
  propertyId?: string | null;
  uhId?: string | null;
  contaBancariaId?: string | null;
}

function validarDadosRegra(dados: DadosTransacaoAutomatizada) {
  if (!dados.descricao?.trim()) throw new Error("descricao é obrigatória");
  if (!dados.favorecido?.trim()) throw new Error("favorecido é obrigatório");
  if (!dados.dadosBancarios?.trim()) throw new Error("dadosBancarios é obrigatório (chave Pix ou banco/agência/conta)");
  if (!dados.valor || dados.valor <= 0) throw new Error("valor deve ser positivo (é sempre um pagamento — saída)");
  if (!Number.isInteger(dados.diaDoMes) || dados.diaDoMes < 1 || dados.diaDoMes > 31) throw new Error("diaDoMes deve ser um inteiro entre 1 e 31");
  const centroCustoTipo = dados.centroCustoTipo ?? "ADMINISTRACAO";
  if (!["ADMINISTRACAO", "EMPREENDIMENTO", "UNIDADE"].includes(centroCustoTipo)) {
    throw new Error("centroCustoTipo deve ser ADMINISTRACAO, EMPREENDIMENTO ou UNIDADE");
  }
  if (centroCustoTipo === "EMPREENDIMENTO" && !dados.propertyId) throw new Error("propertyId é obrigatório quando centroCustoTipo=EMPREENDIMENTO");
  if (centroCustoTipo === "UNIDADE" && !dados.uhId) throw new Error("uhId é obrigatório quando centroCustoTipo=UNIDADE");
}

export async function listarTransacoesAutomatizadas(tenantId: string) {
  return prisma.financeTransacaoAutomatizada.findMany({
    where: { tenantId },
    include: { categoria: { select: { nome: true } } },
    orderBy: [{ ativo: "desc" }, { diaDoMes: "asc" }],
  });
}

export async function criarTransacaoAutomatizada(tenantId: string, dados: DadosTransacaoAutomatizada, criadoPorNome: string) {
  validarDadosRegra(dados);

  const categoria = await prisma.financeCategoria.findUnique({ where: { id: dados.categoriaId } });
  if (!categoria || categoria.tenantId !== tenantId) throw new Error("Categoria não encontrada");
  // Sempre saída de dinheiro — mesma checagem de tipo usada em qualquer
  // outro lançamento (ver validarCategoriaTipo).
  validarCategoriaTipo(categoria, -Math.abs(dados.valor));

  const centroCustoTipo = dados.centroCustoTipo ?? "ADMINISTRACAO";
  let propertyId: string | null = null;
  let uhId: string | null = null;
  if (centroCustoTipo === "EMPREENDIMENTO") {
    const property = await prisma.property.findUnique({ where: { id: dados.propertyId! } });
    if (!property || property.tenantId !== tenantId) throw new Error("Empreendimento não encontrado");
    propertyId = dados.propertyId!;
  } else if (centroCustoTipo === "UNIDADE") {
    const uh = await prisma.uH.findUnique({ where: { id: dados.uhId! } });
    if (!uh || uh.tenantId !== tenantId) throw new Error("Unidade não encontrada");
    uhId = dados.uhId!;
  }

  return prisma.financeTransacaoAutomatizada.create({
    data: {
      tenantId,
      descricao: dados.descricao.trim(),
      favorecido: dados.favorecido.trim(),
      dadosBancarios: dados.dadosBancarios.trim(),
      valor: Math.abs(dados.valor),
      diaDoMes: dados.diaDoMes,
      categoriaId: dados.categoriaId,
      centroCustoTipo,
      propertyId,
      uhId,
      contaBancariaId: dados.contaBancariaId || null,
      criadoPorNome,
    },
  });
}

export async function atualizarTransacaoAutomatizada(tenantId: string, id: string, dados: Partial<DadosTransacaoAutomatizada & { ativo: boolean }>) {
  const existente = await prisma.financeTransacaoAutomatizada.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== tenantId) throw new Error("Transação automatizada não encontrada");

  // Edição parcial: só revalida os campos que vieram no body, reaproveita
  // os já gravados pra quem não veio (mesmo padrão de PATCH /api/lancamentos).
  const mesclado: DadosTransacaoAutomatizada = {
    descricao: dados.descricao ?? existente.descricao,
    favorecido: dados.favorecido ?? existente.favorecido,
    dadosBancarios: dados.dadosBancarios ?? existente.dadosBancarios,
    valor: dados.valor ?? Number(existente.valor),
    diaDoMes: dados.diaDoMes ?? existente.diaDoMes,
    categoriaId: dados.categoriaId ?? existente.categoriaId,
    centroCustoTipo: dados.centroCustoTipo ?? existente.centroCustoTipo,
    propertyId: dados.propertyId !== undefined ? dados.propertyId : existente.propertyId,
    uhId: dados.uhId !== undefined ? dados.uhId : existente.uhId,
    contaBancariaId: dados.contaBancariaId !== undefined ? dados.contaBancariaId : existente.contaBancariaId,
  };
  if (dados.descricao !== undefined || dados.favorecido !== undefined || dados.dadosBancarios !== undefined || dados.valor !== undefined || dados.diaDoMes !== undefined || dados.categoriaId !== undefined || dados.centroCustoTipo !== undefined) {
    validarDadosRegra(mesclado);
    const categoria = await prisma.financeCategoria.findUnique({ where: { id: mesclado.categoriaId } });
    if (!categoria || categoria.tenantId !== tenantId) throw new Error("Categoria não encontrada");
    validarCategoriaTipo(categoria, -Math.abs(mesclado.valor));
  }

  return prisma.financeTransacaoAutomatizada.update({
    where: { id },
    data: {
      descricao: mesclado.descricao.trim(),
      favorecido: mesclado.favorecido.trim(),
      dadosBancarios: mesclado.dadosBancarios.trim(),
      valor: Math.abs(mesclado.valor),
      diaDoMes: mesclado.diaDoMes,
      categoriaId: mesclado.categoriaId,
      centroCustoTipo: mesclado.centroCustoTipo,
      propertyId: mesclado.centroCustoTipo === "EMPREENDIMENTO" ? mesclado.propertyId : null,
      uhId: mesclado.centroCustoTipo === "UNIDADE" ? mesclado.uhId : null,
      contaBancariaId: mesclado.contaBancariaId || null,
      ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
    },
  });
}

/** Usuários de um role específico com acesso ao módulo FINANCE — pra onde
 * mandar o push de "tem transação esperando você" em cada etapa. */
async function usuariosParaNotificar(tenantId: string, role: string): Promise<string[]> {
  const usuarios = await prisma.user.findMany({
    where: { tenantId, ativo: true, role, moduleAccess: { some: { module: "FINANCE", enabled: true } } },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

/** Gera as pendências do dia — chamado pelo cron diário (idempotente: o
 * unique [transacaoAutomatizadaId, mesReferencia] garante que rodar de
 * novo no mesmo mês nunca duplica). Pega toda regra ATIVA cujo diaDoMes já
 * chegou neste mês (`<=` em vez de `===` de propósito: se o cron não rodar
 * exatamente no dia certo — deploy, falha momentânea — a pendência ainda
 * aparece assim que rodar de novo, em vez de sumir pro mês inteiro) e que
 * ainda não tem execução gerada para `mesReferencia`. Notifica os usuários
 * GERENTE por push quando cria alguma. */
export async function gerarExecucoesDoDia(tenantId: string, hoje: string): Promise<{ criadas: number }> {
  const mesReferencia = hoje.slice(0, 7);
  const diaHoje = Number(hoje.slice(8, 10));

  const regras = await prisma.financeTransacaoAutomatizada.findMany({
    where: { tenantId, ativo: true, diaDoMes: { lte: diaHoje } },
  });
  if (regras.length === 0) return { criadas: 0 };

  const jaGeradas = await prisma.financeTransacaoExecucao.findMany({
    where: { tenantId, mesReferencia, transacaoAutomatizadaId: { in: regras.map((r) => r.id) } },
    select: { transacaoAutomatizadaId: true },
  });
  const idsComExecucao = new Set(jaGeradas.map((e) => e.transacaoAutomatizadaId));
  const pendentes = regras.filter((r) => !idsComExecucao.has(r.id));
  if (pendentes.length === 0) return { criadas: 0 };

  await prisma.financeTransacaoExecucao.createMany({
    data: pendentes.map((r) => ({
      tenantId,
      transacaoAutomatizadaId: r.id,
      mesReferencia,
      valorSugerido: r.valor,
      status: "AGUARDANDO_GERENTE" as const,
    })),
  });

  const gerentes = await usuariosParaNotificar(tenantId, "GERENTE");
  const linhas = pendentes.map((r) => `${r.descricao} — ${formatBRLInterno(Number(r.valor))}`).join(", ");
  await Promise.all(
    gerentes.map((userId) =>
      sendPushToUser(userId, {
        title: `${pendentes.length} transação${pendentes.length > 1 ? "ões" : ""} aguardando confirmação`,
        body: linhas,
        data: { module: "FINANCE", screen: "transacoes" },
      })
    )
  );

  return { criadas: pendentes.length };
}

function formatBRLInterno(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface ExecucaoComRegra {
  id: string;
  mesReferencia: string;
  valorSugerido: string;
  valorConfirmado: string | null;
  status: StatusTransacaoExecucao;
  confirmadoGerentePorNome: string | null;
  confirmadoGerenteEm: Date | null;
  confirmadoMasterPorNome: string | null;
  confirmadoMasterEm: Date | null;
  motivoRejeicao: string | null;
  lancamentoId: string | null;
  createdAt: Date;
  regra: { id: string; descricao: string; favorecido: string; dadosBancarios: string; categoriaNome: string; contaBancariaId: string | null };
}

/** Lista execuções pra tela de Transações — pendentes (AGUARDANDO_*) e
 * histórico (CONFIRMADA/REJEITADA), sempre com os dados da regra
 * "achatados" junto (mesma convenção de /api/lancamentos: evita include
 * aninhado do lado do cliente). */
export async function listarExecucoes(tenantId: string, status?: StatusTransacaoExecucao[]): Promise<ExecucaoComRegra[]> {
  const execucoes = await prisma.financeTransacaoExecucao.findMany({
    where: { tenantId, ...(status && status.length > 0 ? { status: { in: status } } : {}) },
    include: { transacaoAutomatizada: { include: { categoria: { select: { nome: true } } } } },
    orderBy: [{ createdAt: "desc" }],
  });

  return execucoes.map((e) => ({
    id: e.id,
    mesReferencia: e.mesReferencia,
    valorSugerido: e.valorSugerido.toString(),
    valorConfirmado: e.valorConfirmado?.toString() ?? null,
    status: e.status as StatusTransacaoExecucao,
    confirmadoGerentePorNome: e.confirmadoGerentePorNome,
    confirmadoGerenteEm: e.confirmadoGerenteEm,
    confirmadoMasterPorNome: e.confirmadoMasterPorNome,
    confirmadoMasterEm: e.confirmadoMasterEm,
    motivoRejeicao: e.motivoRejeicao,
    lancamentoId: e.lancamentoId,
    createdAt: e.createdAt,
    regra: {
      id: e.transacaoAutomatizada.id,
      descricao: e.transacaoAutomatizada.descricao,
      favorecido: e.transacaoAutomatizada.favorecido,
      dadosBancarios: e.transacaoAutomatizada.dadosBancarios,
      categoriaNome: e.transacaoAutomatizada.categoria.nome,
      contaBancariaId: e.transacaoAutomatizada.contaBancariaId,
    },
  }));
}

/** Etapa 1 (GERENTE): confirma — ou ajusta — o valor sugerido. Passa a
 * pendência pra AGUARDANDO_MASTER e notifica os usuários MASTER por push. */
export async function confirmarValorGerente(tenantId: string, execucaoId: string, nomeUsuario: string, valorConfirmado: number): Promise<void> {
  if (!valorConfirmado || valorConfirmado <= 0) throw new Error("valorConfirmado deve ser positivo");

  const execucao = await prisma.financeTransacaoExecucao.findUnique({ where: { id: execucaoId }, include: { transacaoAutomatizada: true } });
  if (!execucao || execucao.tenantId !== tenantId) throw new Error("Transação não encontrada");
  if (execucao.status !== "AGUARDANDO_GERENTE") throw new Error(`Esta transação já está em "${execucao.status}" — não é mais possível confirmar o valor`);

  await prisma.financeTransacaoExecucao.update({
    where: { id: execucaoId },
    data: {
      valorConfirmado: Math.abs(valorConfirmado),
      status: "AGUARDANDO_MASTER",
      confirmadoGerentePorNome: nomeUsuario,
      confirmadoGerenteEm: new Date(),
    },
  });

  const masters = await usuariosParaNotificar(tenantId, "MASTER");
  await Promise.all(
    masters.map((userId) =>
      sendPushToUser(userId, {
        title: "Pagamento aguardando sua confirmação",
        body: `${execucao.transacaoAutomatizada.descricao} — ${formatBRLInterno(valorConfirmado)} pra ${execucao.transacaoAutomatizada.favorecido}`,
        data: { module: "FINANCE", screen: "transacoes" },
      })
    )
  );
}

/** Etapa 2 (MASTER): confirma que efetuou o Pix pelo internet banking dele
 * (Fase 1 — ver nota no topo do arquivo). Só AGORA nasce o
 * FinanceLancamento (um "previsto" MANUAL comum, dataVencimento = diaDoMes
 * da regra dentro do mesReferencia da execução) — a Conciliação casa esse
 * previsto com a transação real quando ela chegar do banco. */
export async function confirmarPagamentoMaster(tenantId: string, execucaoId: string, nomeUsuario: string): Promise<void> {
  const execucao = await prisma.financeTransacaoExecucao.findUnique({ where: { id: execucaoId }, include: { transacaoAutomatizada: true } });
  if (!execucao || execucao.tenantId !== tenantId) throw new Error("Transação não encontrada");
  if (execucao.status !== "AGUARDANDO_MASTER") throw new Error(`Esta transação está em "${execucao.status}" — não é mais possível confirmar o pagamento`);
  if (execucao.valorConfirmado == null) throw new Error("Valor ainda não foi confirmado pelo Gerente");

  const regra = execucao.transacaoAutomatizada;
  const { ultimoDia } = limitesDoMes(execucao.mesReferencia);
  const dataVencimento = `${execucao.mesReferencia}-${String(Math.min(regra.diaDoMes, ultimoDia)).padStart(2, "0")}`;

  const previsto = await prisma.financeLancamento.create({
    data: {
      tenantId,
      categoriaId: regra.categoriaId,
      descricao: regra.descricao,
      fornecedor: regra.favorecido,
      valor: new Prisma.Decimal(execucao.valorConfirmado).negated(),
      dataVencimento,
      origem: "MANUAL",
      centroCustoTipo: regra.centroCustoTipo,
      propertyId: regra.propertyId,
      uhId: regra.uhId,
      contaBancariaId: regra.contaBancariaId,
      observacoes: `Gerado por Transação Automatizada — confirmado por ${nomeUsuario} em ${new Date().toLocaleDateString("pt-BR")}. Dados bancários: ${regra.dadosBancarios}`,
      criadoPorNome: nomeUsuario,
    },
  });

  await prisma.financeTransacaoExecucao.update({
    where: { id: execucaoId },
    data: {
      status: "CONFIRMADA",
      confirmadoMasterPorNome: nomeUsuario,
      confirmadoMasterEm: new Date(),
      lancamentoId: previsto.id,
    },
  });
}

/** Rejeita em qualquer uma das duas etapas de aprovação — fica registrado
 * no histórico (nunca apagado), com o motivo se informado. */
export async function rejeitarExecucao(tenantId: string, execucaoId: string, nomeUsuario: string, motivo?: string): Promise<void> {
  const execucao = await prisma.financeTransacaoExecucao.findUnique({ where: { id: execucaoId } });
  if (!execucao || execucao.tenantId !== tenantId) throw new Error("Transação não encontrada");
  if (execucao.status !== "AGUARDANDO_GERENTE" && execucao.status !== "AGUARDANDO_MASTER") {
    throw new Error(`Esta transação já está em "${execucao.status}" — não é mais possível rejeitar`);
  }

  await prisma.financeTransacaoExecucao.update({
    where: { id: execucaoId },
    data: {
      status: "REJEITADA",
      motivoRejeicao: motivo?.trim() ? `${nomeUsuario}: ${motivo.trim()}` : `Rejeitado por ${nomeUsuario}`,
    },
  });
}
