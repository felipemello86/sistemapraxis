// Importa o SINAL DE RECORRÊNCIA do Conta Azul pra dentro do Financeiro —
// pedido do Felipe, 06/08/2026: "use a inteligência do sistema e o backup
// do conta azul para pré-configurar a recorrência (...) quero um setup
// inicial de recorrências fiel ao q eu tinha no conta azul. Atualmente está
// muito ruim essa herança."
//
// Espelha o MESMO algoritmo de casamento (data de competência ±0/1/2 dias +
// valor exato, desambiguado por token de texto quando há mais de um
// candidato) de importar-categorizacao-conta-azul.ts — só que em vez de
// aplicar uma Categoria num lançamento individual, aplica um sinal de
// RECORRÊNCIA num GRUPO de descrição (ver comentário em
// FinanceRegraRecorrencia, schema.prisma, pra por que não dá pra escrever
// `recorrente=true` direto num FinanceLancamento já existente).
//
// Passo a passo:
//   1. Lê a planilha, filtra só linhas "Com recorrência" e realizadas
//      (Quitado/Conciliado) — "Sem recorrência" e provisões futuras não
//      geram sinal nenhum aqui (ver comentário em sugestao-recorrencia.ts
//      sobre por que "Sem recorrência" não vira sinal negativo).
//   2. Pra cada uma, casa com um FinanceLancamento REAL já existente no
//      banco (mesma heurística data+valor+texto da categorização) — é
//      assim que descobrimos qual é o texto de descrição/fornecedor que a
//      PLUGGY realmente usa pra essa cobrança (o Conta Azul usa um label
//      próprio do Felipe, tipo "Aluguel 901", nada a ver com o texto bruto
//      do banco).
//   3. Agrupa os matches por chaveRecorrencia (descrição+fornecedor
//      normalizados do lançamento REAL, não do Conta Azul) e classifica a
//      frequência (MENSAL/ANUAL) a partir das datas de vencimento reais
//      encontradas — cai pra MENSAL (default) quando há poucos matches pra
//      detectar um padrão sozinho (mesmo assim confia no "Com recorrência"
//      explícito do Conta Azul).
//   4. Grava/atualiza FinanceRegraRecorrencia (upsert por tenantId+chave).
//
// Uso (sempre roda em modo relatório primeiro — nada é gravado sem --apply):
//   cd packages/core
//   npx tsx scripts/importar-recorrencia-conta-azul.ts "/caminho/extrato_financeiro.xls"
//   npx tsx scripts/importar-recorrencia-conta-azul.ts "/caminho/extrato_financeiro.xls" --apply

import * as XLSX from "xlsx";
import { prisma } from "../src/prisma";
import { normalizarTexto } from "../src/finance/texto";
import { chaveRecorrencia, detectarPadrao } from "../src/finance/sugestao-recorrencia";

type LinhaContaAzul = {
  dataCompetencia: string; // YYYY-MM-DD
  descricao: string;
  fornecedor: string | null;
  valor: number;
};

// Mesmos helpers de importar-categorizacao-conta-azul.ts (duplicados de
// propósito — scripts standalone, cada um lê a planilha do seu jeito).
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

function lerPlanilha(caminho: string): LinhaContaAzul[] {
  const wb = XLSX.readFile(caminho);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const linhas: LinhaContaAzul[] = [];
  for (const r of rows) {
    const situacao = String(r["Situação"] ?? "");
    if (!["Quitado", "Conciliado"].includes(situacao)) continue;
    if (String(r["Recorrência"] ?? "") !== "Com recorrência") continue;
    const dataCompetencia = parseDataBR(String(r["Data de competência"] ?? ""));
    const valorRaw = r["Valor (R$)"];
    if (!dataCompetencia || valorRaw === null || valorRaw === undefined || valorRaw === "") continue;
    linhas.push({
      dataCompetencia,
      descricao: String(r["Descrição"] ?? ""),
      fornecedor: r["Nome do fornecedor/cliente"] ? String(r["Nome do fornecedor/cliente"]) : null,
      valor: Number(valorRaw),
    });
  }
  return linhas;
}

async function main() {
  const args = process.argv.slice(2);
  const caminho = args.find((a) => !a.startsWith("--"));
  const aplicar = args.includes("--apply");
  if (!caminho) {
    console.error('Uso: npx tsx scripts/importar-recorrencia-conta-azul.ts "<arquivo.xls>" [--apply]');
    process.exit(1);
  }

  console.log(`Lendo ${caminho}...`);
  const linhas = lerPlanilha(caminho);
  console.log(`${linhas.length} linha(s) "Com recorrência" realizada(s) (Quitado/Conciliado) no arquivo.\n`);

  // Todos os FinanceLancamento já existentes (qualquer origem/categoria) —
  // é contra eles que casamos, pra descobrir a chaveRecorrencia REAL de
  // cada cobrança (ver passo 2 do comentário do topo).
  const tenant = await prisma.tenant.findFirst({ where: { slug: "bnbflex" } });
  if (!tenant) throw new Error('Tenant "bnbflex" não encontrado.');

  const lancamentos = await prisma.financeLancamento.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, descricao: true, fornecedor: true, valor: true, dataVencimento: true, dataCompetencia: true, contaBancaria: { select: { tipo: true } } },
  });
  console.log(`${lancamentos.length} lançamento(s) no banco pra casar.\n`);

  const porChave = new Map<string, number[]>();
  lancamentos.forEach((l, i) => {
    const dataBase = l.dataCompetencia || l.dataVencimento;
    // mesma inversão de sinal de cartão da categorização (comparação com o
    // Conta Azul, que usa a convenção "negativo=despesa" sempre).
    const valorCmp = l.contaBancaria?.tipo === "CREDIT" ? -Number(l.valor) : Number(l.valor);
    const chave = `${dataBase}|${valorCmp.toFixed(2)}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(i);
  });

  function diffDiasCmp(a: string, b: string): number {
    const [a1, a2, a3] = a.split("-").map(Number);
    const [b1, b2, b3] = b.split("-").map(Number);
    return Math.round((Date.UTC(a1, a2 - 1, a3) - Date.UTC(b1, b2 - 1, b3)) / 86400000);
  }
  void diffDiasCmp; // só documentando a mesma convenção; não usado diretamente aqui

  // grupo (chaveRecorrencia REAL) -> datas de vencimento dos lançamentos
  // reais que casaram com uma linha "Com recorrência" do Conta Azul.
  const gruposEncontrados = new Map<string, { datas: string[]; amostraDescricao: string }>();
  let semCandidato = 0;
  let ambiguo = 0;
  let match = 0;

  for (const linha of linhas) {
    let candidatosIdx: number[] = [];
    for (const delta of [0, 1, -1, 2, -2]) {
      const data = somarDiasLocal(linha.dataCompetencia, delta);
      const chave = `${data}|${linha.valor.toFixed(2)}`;
      const achados = porChave.get(chave) ?? [];
      if (achados.length > 0) {
        candidatosIdx = achados;
        break;
      }
    }
    if (candidatosIdx.length === 0) {
      semCandidato++;
      continue;
    }

    let escolhidoIdx: number | null = null;
    if (candidatosIdx.length === 1) {
      escolhidoIdx = candidatosIdx[0];
    } else {
      const textoAlvo = normalizarTexto(`${linha.descricao} ${linha.fornecedor ?? ""}`);
      const comMatch = candidatosIdx.filter((i) => {
        const toks = tokens(`${lancamentos[i].descricao} ${lancamentos[i].fornecedor ?? ""}`);
        return toks.some((t) => textoAlvo.includes(t));
      });
      if (comMatch.length === 1) escolhidoIdx = comMatch[0];
      else {
        ambiguo++;
        continue;
      }
    }

    match++;
    const real = lancamentos[escolhidoIdx];
    const chave = chaveRecorrencia(real.descricao, real.fornecedor);
    let grupo = gruposEncontrados.get(chave);
    if (!grupo) {
      grupo = { datas: [], amostraDescricao: real.descricao };
      gruposEncontrados.set(chave, grupo);
    }
    grupo.datas.push(real.dataVencimento);
  }

  console.log("=== RELATÓRIO ===");
  console.log(`Match (achou lançamento real correspondente): ${match}`);
  console.log(`Ambíguo (mais de 1 candidato, ignorado):       ${ambiguo}`);
  console.log(`Sem candidato no banco:                        ${semCandidato}`);
  console.log(`\nGrupos distintos de recorrência encontrados: ${gruposEncontrados.size}\n`);

  const regras: { chave: string; frequencia: "MENSAL" | "ANUAL"; amostras: number; amostraDescricao: string }[] = [];
  for (const [chave, grupo] of gruposEncontrados) {
    const padrao = detectarPadrao(grupo.datas);
    const frequencia = padrao?.frequencia ?? "MENSAL"; // poucos matches pra detectar padrão sozinho -> confia no "Com recorrência" explícito, assume MENSAL (default, e é o que domina o arquivo do Felipe)
    regras.push({ chave, frequencia, amostras: grupo.datas.length, amostraDescricao: grupo.amostraDescricao });
  }
  regras.sort((a, b) => b.amostras - a.amostras);

  console.log("Amostra de 15 regras que seriam gravadas:");
  for (const r of regras.slice(0, 15)) {
    console.log(`  "${r.amostraDescricao}" — ${r.frequencia} — ${r.amostras} lançamento(s) real(is) confirmando`);
  }

  if (!aplicar) {
    console.log("\n(modo relatório — nada foi gravado. Confira a amostra acima e rode de novo com --apply pra aplicar de verdade.)");
    await prisma.$disconnect();
    return;
  }

  console.log("\nAplicando (upsert por tenantId+chave)...");
  let ok = 0;
  for (const r of regras) {
    await prisma.financeRegraRecorrencia.upsert({
      where: { tenantId_chave: { tenantId: tenant.id, chave: r.chave } },
      create: { tenantId: tenant.id, chave: r.chave, recorrente: true, frequencia: r.frequencia, origem: "CONTA_AZUL", amostras: r.amostras },
      update: { recorrente: true, frequencia: r.frequencia, origem: "CONTA_AZUL", amostras: r.amostras },
    });
    ok++;
  }
  console.log(`${ok} regra(s) de recorrência gravada(s)/atualizada(s) em FinanceRegraRecorrencia.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
