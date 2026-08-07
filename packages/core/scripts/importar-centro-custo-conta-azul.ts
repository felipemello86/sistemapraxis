// Importa o CENTRO DE CUSTO (imóvel/UH) do Conta Azul pros lançamentos que
// ainda estão no default ADMINISTRACAO — pedido do Felipe, 06/08/2026:
// "aproveite também os dados de centro de custo" (mesma rodada de pedidos
// que gerou o backfill de recorrência).
//
// Diferente de importar-recorrencia-conta-azul.ts (que não pode escrever
// direto no histórico — `recorrente=true` tem semântica de projeção futura
// na DRE), centro de custo é só um campo descritivo/de rateio: gravar
// direto em FinanceLancamento já existentes é seguro (não duplica nada,
// não projeta nada) — mesmo espírito de importar-categorizacao-conta-azul.ts.
//
// Como funciona:
//   1. As colunas "Centro de Custo 1..4" do Conta Azul guardam o CÓDIGO do
//      imóvel, ex. "801 VI", "902 IA", "204 DO" — número da UH + 2 letras.
//      Comparado com o cadastro real (Property/UH, Configurações >
//      Unidades): a 1ª letra do sufixo bate com a letra final do campo
//      `numero` de cada UH (ex. UH "801-V" ↔ "801 VI", "902-I" ↔ "902 IA",
//      "204-D" ↔ "204 DO") — "V"=Bnb Flex Suites, "I"=Bnb Flex Comfort,
//      "D"=Bnb Flex Premium (confirmado comparando os 32 códigos distintos
//      do Conta Azul contra as 33 UHs cadastradas, 06/08/2026).
//   2. Cada linha do Conta Azul com Centro de Custo 1 preenchido (e
//      Situação Quitado/Conciliado) casa com um FinanceLancamento real já
//      existente, por data+valor E POR TEXTO (fornecedor/descrição têm que
//      ter pelo menos um token em comum) — ver nota de correção abaixo.
//   3. Só ATUALIZA lançamentos que ainda estão no estado "nunca mexido"
//      (centroCustoTipo=ADMINISTRACAO, sem propertyId nem uhId) — nunca
//      sobrescreve um centro de custo que o Felipe (ou outra rodada) já
//      tenha definido.
//
// CORREÇÃO (Felipe reportou, 07/08/2026: "não existe nenhum dado de
// pagamento entre FABIO NUNES e o 501-V"): a versão original só validava
// texto (fornecedor/descrição) quando havia MAIS DE UM candidato de
// data+valor — quando só existia UM lançamento real com aquela data+valor,
// ele era aceito direto, sem checar se o texto tinha QUALQUER relação com o
// centro de custo da linha. Como vários proprietários cobram o MESMO valor
// de aluguel (ex. R$2.300, comum a vários imóveis de donos diferentes), uma
// linha do Conta Azul de um imóvel podia "casar" por coincidência de
// data+valor com a ÚNICA transação real daquele dia — que na real era de
// OUTRO proprietário/imóvel. Além disso, nada impedia o MESMO lançamento
// real de ser escolhido por VÁRIAS linhas do Conta Azul (imóveis diferentes,
// mesmo valor/data) — a última processada vencia silenciosamente. Verificado
// ao vivo: 170 de 262 lançamentos (65%) do backfill original tinham
// descrição incompatível com o proprietário histórico da UH atribuída.
// Correção: (a) validação de texto agora é OBRIGATÓRIA em todo match, não só
// quando há ambiguidade; (b) cada lançamento real só pode ser consumido uma
// vez por execução (Set `usados`) — uma segunda linha que aponte pro mesmo
// real vira "conflito" (ignorado) em vez de sobrescrever.
//
// SORTEIO PRA CASOS GENÉRICOS (pedido do Felipe, 07/08/2026: descrições tipo
// "CHEQUE COMPENSADO UNICRED" não têm nome nenhum, então a validação de
// texto acima nunca confirma — mas o valor+data ainda são um sinal real de
// que ALGUMA UH devia esse aluguel naquele mês. Felipe: "o que eu faço na
// prática é atribuir aleatoriamente a qualquer UH respeitando a regra de não
// repetir o pagamento para a mesma UH"). Depois do PASSO 1 (matches
// confirmados por texto), um PASSO 2 pega as linhas que sobraram
// (ambíguas/sem-texto): se ainda existe algum lançamento real não consumido
// pra aquela data+valor, sorteia um deles pra essa linha — mas só se a UH da
// linha ainda não tiver sido usada no mês de competência dela (mesma regra
// de exclusividade mensal do motor de sugestão, sugestao-centro-custo.ts).
// Sorteio determinístico (semente = hash da própria linha), não meramente
// aleatório a cada rodada — origem fica marcada "sorteio" na amostra do
// relatório pra distinguir de um match confirmado por texto.
//
// TRAVA DE SEGURANÇA no sorteio: um candidato real só pode ser sorteado se
// ele for de fato "anônimo" (sem nome de pessoa identificável na descrição,
// tipo "CHEQUE COMPENSADO UNICRED" ou uma conta de energia) OU se o nome que
// aparece nele for o MESMO proprietário da UH sendo preenchida. Sem essa
// trava, o sorteio reintroduziria exatamente o bug original: um lançamento
// que já diz explicitamente "FABIO NUNES FERREIRA..." poderia ser sorteado
// pra UH de OUTRO proprietário só por coincidência de data+valor. O sorteio
// só decide entre candidatos onde a identidade é genuinamente desconhecida —
// nunca contraria uma identidade já revelada pelo texto.
//
// Uso (sempre roda em modo relatório primeiro — nada é gravado sem --apply):
//   cd packages/core
//   npx tsx scripts/importar-centro-custo-conta-azul.ts "/caminho/extrato_financeiro.xls"
//   npx tsx scripts/importar-centro-custo-conta-azul.ts "/caminho/extrato_financeiro.xls" --apply

import * as XLSX from "xlsx";
import { prisma } from "../src/prisma";
import { normalizarTexto } from "../src/finance/texto";

type LinhaContaAzul = {
  dataCompetencia: string; // YYYY-MM-DD
  descricao: string;
  fornecedor: string | null;
  valor: number;
  centroCustoBruto: string; // ex. "801 VI"
};

function parseDataBR(s: string): string | null {
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, a] = m;
  return `${a}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function somarDiasLocal(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tokens(s: string): string[] {
  return normalizarTexto(s)
    .replace(/\d+\s*\/\s*\d+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 4);
}

/** "801 VI" -> { numero: "801", letra: "V" } — só os 2 primeiros
 * componentes importam (o resto do sufixo, tipo o "I" de "VI", é ruído da
 * exportação do Conta Azul, não corresponde a nada no nosso cadastro). */
function parseCentroCustoBruto(s: string): { numero: string; letra: string } | null {
  const m = s.trim().match(/^(\d+)\s+([A-Za-z])/);
  if (!m) return null;
  return { numero: m[1], letra: m[2].toUpperCase() };
}

/** Hash determinístico simples (djb2) normalizado pra [0, 1) — mesma técnica
 * de sugestao-centro-custo.ts, usada aqui como semente do sorteio do PASSO 2
 * (ver nota de correção no topo do arquivo), pra que rodar o script de novo
 * produza sempre o mesmo resultado. */
function hashDeterministico01(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
}

function lerPlanilha(caminho: string): LinhaContaAzul[] {
  const wb = XLSX.readFile(caminho);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const linhas: LinhaContaAzul[] = [];
  for (const r of rows) {
    const situacao = String(r["Situação"] ?? "");
    if (!["Quitado", "Conciliado"].includes(situacao)) continue;
    const centroCustoBruto = r["Centro de Custo 1"] ? String(r["Centro de Custo 1"]) : null;
    if (!centroCustoBruto) continue;
    const dataCompetencia = parseDataBR(String(r["Data de competência"] ?? ""));
    const valorRaw = r["Valor (R$)"];
    if (!dataCompetencia || valorRaw === null || valorRaw === undefined || valorRaw === "") continue;
    linhas.push({
      dataCompetencia,
      descricao: String(r["Descrição"] ?? ""),
      fornecedor: r["Nome do fornecedor/cliente"] ? String(r["Nome do fornecedor/cliente"]) : null,
      valor: Number(valorRaw),
      centroCustoBruto,
    });
  }
  return linhas;
}

/** Extrai um nome de pessoa de descrições bancárias tipo "FABIO NUNES
 * FERREIRA DEBITO TRANSF PIX" ou "... CRED RECEBIMENTO PIX" — usado só pra
 * trava de segurança do sorteio (ver nota de correção acima): um lançamento
 * que já revela o nome de alguém não pode ser sorteado pra outro
 * proprietário. `null` se a descrição não seguir esse padrão (ex.: "CHEQUE
 * COMPENSADO UNICRED", contas de energia — essas SIM podem ser sorteadas). */
function extrairNomePix(descricao: string): string | null {
  const m = /^(.*?)\s+(DEBITO TRANSF PIX|CRED RECEBIMENTO PIX|DEBITO PAGAMENTO PIX)/i.exec(descricao || "");
  if (!m) return null;
  const nome = normalizarTexto(m[1]);
  if (nome.split(" ").length < 2) return null;
  return nome;
}

async function main() {
  const args = process.argv.slice(2);
  const caminho = args.find((a) => !a.startsWith("--"));
  const aplicar = args.includes("--apply");
  if (!caminho) {
    console.error('Uso: npx tsx scripts/importar-centro-custo-conta-azul.ts "<arquivo.xls>" [--apply]');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug: "bnbflex" } });
  if (!tenant) throw new Error('Tenant "bnbflex" não encontrado.');

  const uhs = await prisma.uH.findMany({ where: { tenantId: tenant.id }, select: { id: true, numero: true, propertyId: true } });
  const uhPorNumero = new Map(uhs.map((u) => [u.numero.toUpperCase(), u]));
  console.log(`${uhs.length} UH(s) cadastrada(s).`);

  console.log(`\nLendo ${caminho}...`);
  const linhas = lerPlanilha(caminho);
  console.log(`${linhas.length} linha(s) com Centro de Custo 1 realizada(s) (Quitado/Conciliado) no arquivo.\n`);

  // nome (normalizado) -> UHs onde esse nome é fornecedor/proprietário
  // conhecido no Conta Azul — trava de segurança do sorteio (ver nota acima).
  const nomeParaUh = new Map<string, Set<string>>();
  for (const linha of linhas) {
    if (!linha.fornecedor) continue;
    const parsed = parseCentroCustoBruto(linha.centroCustoBruto);
    if (!parsed) continue;
    const nome = normalizarTexto(linha.fornecedor);
    if (nome.split(" ").length < 2) continue;
    const uhCodigo = `${parsed.numero}-${parsed.letra}`;
    if (!nomeParaUh.has(nome)) nomeParaUh.set(nome, new Set());
    nomeParaUh.get(nome)!.add(uhCodigo);
  }

  const naoTocados = await prisma.financeLancamento.findMany({
    where: { tenantId: tenant.id, centroCustoTipo: "ADMINISTRACAO", propertyId: null, uhId: null },
    select: { id: true, descricao: true, fornecedor: true, valor: true, dataVencimento: true, dataCompetencia: true, contaBancaria: { select: { tipo: true } } },
  });
  console.log(`${naoTocados.length} lançamento(s) ainda em ADMINISTRACAO (candidatos a receber centro de custo).\n`);

  // uhId -> meses (YYYY-MM) já ocupados por um lançamento UNIDADE gravado de
  // verdade (fora deste backfill) — seed da regra "1 pagamento por UH por
  // mês" pro PASSO 2 (sorteio), ver nota de correção no topo.
  const jaGravados = await prisma.financeLancamento.findMany({
    where: { tenantId: tenant.id, centroCustoTipo: "UNIDADE", uhId: { not: null } },
    select: { uhId: true, dataVencimento: true, dataCompetencia: true },
  });
  const usadoNoMes = new Map<string, Set<string>>(); // uhId -> Set<mes>
  for (const j of jaGravados) {
    const mes = (j.dataCompetencia || j.dataVencimento).slice(0, 7);
    if (!usadoNoMes.has(j.uhId!)) usadoNoMes.set(j.uhId!, new Set());
    usadoNoMes.get(j.uhId!)!.add(mes);
  }

  const porChave = new Map<string, number[]>();
  naoTocados.forEach((l, i) => {
    const dataBase = l.dataCompetencia || l.dataVencimento;
    const valorCmp = l.contaBancaria?.tipo === "CREDIT" ? -Number(l.valor) : Number(l.valor);
    const chave = `${dataBase}|${valorCmp.toFixed(2)}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(i);
  });

  let semUhCorrespondente = 0;
  let semCandidato = 0;
  let ambiguo = 0;
  let semTexto = 0;
  let conflito = 0;
  let sorteados = 0;
  let reservado = 0;
  const atualizacoes: { id: string; uhId: string; amostra: string; origem: "texto" | "sorteio" }[] = [];
  const semUhAmostra = new Set<string>();
  const usados = new Set<number>(); // índices de `naoTocados` já consumidos nesta execução — impede que 2 linhas do Conta Azul assumam o mesmo lançamento real (ver nota de correção acima)
  const pendentesPasso2: { linha: LinhaContaAzul; uh: { id: string; numero: string } }[] = [];

  // PASSO 1 — matches confirmados por texto (fornecedor/descrição bate).
  for (const linha of linhas) {
    const parsed = parseCentroCustoBruto(linha.centroCustoBruto);
    if (!parsed) continue;
    const uh = uhPorNumero.get(`${parsed.numero}-${parsed.letra}`) ?? uhPorNumero.get(parsed.numero);
    if (!uh) {
      semUhCorrespondente++;
      semUhAmostra.add(linha.centroCustoBruto);
      continue;
    }

    let candidatosIdx: number[] = [];
    for (const delta of [0, 1, -1, 2, -2]) {
      const data = somarDiasLocal(linha.dataCompetencia, delta);
      const chave = `${data}|${linha.valor.toFixed(2)}`;
      const achados = (porChave.get(chave) ?? []).filter((i) => !usados.has(i));
      if (achados.length > 0) {
        candidatosIdx = achados;
        break;
      }
    }
    if (candidatosIdx.length === 0) {
      semCandidato++;
      continue;
    }

    // Validação de texto SEMPRE obrigatória (não só quando há ambiguidade) —
    // ver nota de correção no topo do arquivo. Fornecedor/descrição da linha
    // do Conta Azul precisa compartilhar pelo menos 1 token relevante (>= 4
    // letras) com o lançamento real candidato.
    const textoAlvo = normalizarTexto(`${linha.descricao} ${linha.fornecedor ?? ""}`);
    const comMatch = candidatosIdx.filter((i) => {
      const toks = tokens(`${naoTocados[i].descricao} ${naoTocados[i].fornecedor ?? ""}`);
      return toks.some((t) => textoAlvo.includes(t));
    });

    let escolhidoIdx: number | null = null;
    if (comMatch.length === 1) escolhidoIdx = comMatch[0];
    else {
      // Sem confirmação de texto (0 ou >1 candidatos bateram) — não descarta
      // mais: guarda pro PASSO 2 (sorteio, ver nota de correção). Conta
      // separado só pra fins de relatório.
      if (comMatch.length > 1) ambiguo++;
      else semTexto++;
      pendentesPasso2.push({ linha, uh });
      continue;
    }

    if (usados.has(escolhidoIdx)) {
      conflito++;
      continue;
    }
    usados.add(escolhidoIdx);

    const real = naoTocados[escolhidoIdx];
    atualizacoes.push({ id: real.id, uhId: uh.id, amostra: `${real.descricao} -> UH ${uh.numero} (texto)`, origem: "texto" });
    const mes = (real.dataCompetencia || real.dataVencimento).slice(0, 7);
    if (!usadoNoMes.has(uh.id)) usadoNoMes.set(uh.id, new Set());
    usadoNoMes.get(uh.id)!.add(mes);
  }

  // PASSO 2 — sorteio pros casos sem confirmação de texto (pedido do Felipe,
  // 07/08/2026, ver nota de correção): entre os lançamentos reais que ainda
  // sobraram pra aquela mesma data+valor, sorteia um pra essa linha — mas só
  // se a UH da linha ainda não tiver sido usada no mês de competência dela.
  for (const { linha, uh } of pendentesPasso2) {
    const mesLinha = linha.dataCompetencia.slice(0, 7);
    if (usadoNoMes.get(uh.id)?.has(mesLinha)) {
      reservado++; // essa UH já recebeu um pagamento nesse mês (via texto ou sorteio anterior) — não duplica
      continue;
    }

    let candidatosIdx: number[] = [];
    for (const delta of [0, 1, -1, 2, -2]) {
      const data = somarDiasLocal(linha.dataCompetencia, delta);
      const chave = `${data}|${linha.valor.toFixed(2)}`;
      const achados = (porChave.get(chave) ?? []).filter((i) => !usados.has(i));
      if (achados.length > 0) {
        candidatosIdx = achados;
        break;
      }
    }
    if (candidatosIdx.length === 0) continue; // nada sobrou pra sortear — já contado como semCandidato/ambíguo/semTexto acima

    // Trava de segurança (ver nota de correção acima): remove do sorteio
    // qualquer candidato cuja descrição já revele o nome de um proprietário
    // conhecido de OUTRA UH — o sorteio só decide entre candidatos
    // genuinamente anônimos (ou cujo nome já é o desse mesmo proprietário).
    const candidatosSeguros = candidatosIdx.filter((i) => {
      const nome = extrairNomePix(naoTocados[i].descricao);
      if (!nome) return true; // sem nome identificável — pode sortear
      const uhsDoNome = nomeParaUh.get(nome);
      if (!uhsDoNome) return true; // nome não é fornecedor conhecido de nenhuma UH — pode sortear
      return uhsDoNome.has(uh.numero.toUpperCase()) || uhsDoNome.has(uh.numero.split("-")[0]); // é o mesmo proprietário desta UH
    });
    if (candidatosSeguros.length === 0) continue; // só sobraram candidatos "de outro dono" — não sorteia, fica sem sugestão

    const semente = hashDeterministico01(`${linha.centroCustoBruto}|${linha.dataCompetencia}|${linha.valor}|${linha.descricao}`);
    const escolhidoIdx = candidatosSeguros[Math.floor(semente * candidatosSeguros.length)];
    usados.add(escolhidoIdx);
    sorteados++;

    const real = naoTocados[escolhidoIdx];
    atualizacoes.push({ id: real.id, uhId: uh.id, amostra: `${real.descricao} -> UH ${uh.numero} (sorteio)`, origem: "sorteio" });
    if (!usadoNoMes.has(uh.id)) usadoNoMes.set(uh.id, new Set());
    usadoNoMes.get(uh.id)!.add(mesLinha);
  }

  console.log("=== RELATÓRIO ===");
  console.log(`Match confirmado por texto:                                     ${atualizacoes.filter((a) => a.origem === "texto").length}`);
  console.log(`Match por sorteio (data+valor bateu, texto genérico):           ${sorteados}`);
  console.log(`  (dos quais ambíguos antes do sorteio: ${ambiguo}, sem texto nenhum: ${semTexto})`);
  console.log(`Não sorteado — UH já usada nesse mês (evita 2º pagamento):      ${reservado}`);
  console.log(`Conflito (lançamento real já consumido por outra linha):        ${conflito}`);
  console.log(`Sem candidato de lançamento no banco:                          ${semCandidato}`);
  console.log(`Código de Centro de Custo sem UH correspondente:                ${semUhCorrespondente}`);
  if (semUhAmostra.size > 0) console.log("  códigos sem UH:", [...semUhAmostra].slice(0, 20).join(", "));

  console.log("\nAmostra de 10 atualizações:");
  for (const a of atualizacoes.slice(0, 10)) console.log(`  ${a.amostra}`);

  if (!aplicar) {
    console.log("\n(modo relatório — nada foi gravado. Confira a amostra acima e rode de novo com --apply pra aplicar de verdade.)");
    await prisma.$disconnect();
    return;
  }

  console.log("\nAplicando...");
  let ok = 0;
  for (const a of atualizacoes) {
    await prisma.financeLancamento.update({ where: { id: a.id }, data: { centroCustoTipo: "UNIDADE", uhId: a.uhId, propertyId: null } });
    ok++;
  }
  console.log(`${ok} lançamento(s) atualizado(s) com centro de custo.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
