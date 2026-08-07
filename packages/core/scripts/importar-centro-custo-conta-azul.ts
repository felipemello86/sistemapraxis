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
//      existente, pelo mesmo algoritmo de data+valor+texto de
//      importar-categorizacao-conta-azul.ts.
//   3. Só ATUALIZA lançamentos que ainda estão no estado "nunca mexido"
//      (centroCustoTipo=ADMINISTRACAO, sem propertyId nem uhId) — nunca
//      sobrescreve um centro de custo que o Felipe (ou outra rodada) já
//      tenha definido.
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

  const naoTocados = await prisma.financeLancamento.findMany({
    where: { tenantId: tenant.id, centroCustoTipo: "ADMINISTRACAO", propertyId: null, uhId: null },
    select: { id: true, descricao: true, fornecedor: true, valor: true, dataVencimento: true, dataCompetencia: true, contaBancaria: { select: { tipo: true } } },
  });
  console.log(`${naoTocados.length} lançamento(s) ainda em ADMINISTRACAO (candidatos a receber centro de custo).\n`);

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
  const atualizacoes: { id: string; uhId: string; amostra: string }[] = [];
  const semUhAmostra = new Set<string>();

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
    if (candidatosIdx.length === 1) escolhidoIdx = candidatosIdx[0];
    else {
      const textoAlvo = normalizarTexto(`${linha.descricao} ${linha.fornecedor ?? ""}`);
      const comMatch = candidatosIdx.filter((i) => {
        const toks = tokens(`${naoTocados[i].descricao} ${naoTocados[i].fornecedor ?? ""}`);
        return toks.some((t) => textoAlvo.includes(t));
      });
      if (comMatch.length === 1) escolhidoIdx = comMatch[0];
      else {
        ambiguo++;
        continue;
      }
    }

    const real = naoTocados[escolhidoIdx];
    atualizacoes.push({ id: real.id, uhId: uh.id, amostra: `${real.descricao} -> UH ${uh.numero}` });
  }

  console.log("=== RELATÓRIO ===");
  console.log(`Match (achou lançamento + UH correspondentes): ${atualizacoes.length}`);
  console.log(`Ambíguo (mais de 1 candidato, ignorado):        ${ambiguo}`);
  console.log(`Sem candidato de lançamento no banco:            ${semCandidato}`);
  console.log(`Código de Centro de Custo sem UH correspondente: ${semUhCorrespondente}`);
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
