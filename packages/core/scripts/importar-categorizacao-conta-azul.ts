// Importa a categorização histórica do Conta Azul pros lançamentos
// pendentes (origem=PLUGGY, categoriaId=null) — pedido do Felipe,
// 05/08/2026: "exportar todos os dados que tenho no conta azul... fazer um
// script pra categorizar todo esse passivo".
//
// Como funciona (análise feita em cima do arquivo real que ele exportou,
// "extrato_financeiro (2).xls", 7514 linhas / 84 categorias distintas):
//
//   1. Lê a planilha, mantém só linhas "Quitado"/"Conciliado" (realizadas —
//      "Em aberto"/"Atrasado" são previsão, não correspondem a uma
//      transação real que a Pluggy teria sincronizado).
//   2. Pra cada lançamento pendente no banco, procura candidato(s) na
//      planilha com a MESMA Data de Competência (±1, depois ±2 dias — cobre
//      pequenas divergências de fuso/processamento) e o MESMO Valor
//      (sinal+centavos exatos).
//   3. Se achar 1 candidato só: usa a categoria dele, direto.
//   4. Se achar mais de um (comum — só (data+valor) colide em ~30% dos
//      casos, ex.: vários PIX de R$180 recebidos de hóspedes diferentes em
//      dias próximos): desempata comparando um "token" da Descrição/Nome do
//      Conta Azul (removendo número de parcela) contra a Descrição/Fornecedor
//      do lançamento da Pluggy — ex.: "Trello" bate dentro de "TRELLO.COM*
//      ATLASSIAN", "RODOLFO FALCAO DA SILVA" bate dentro de "RODOLFO FALCAO
//      DA SILVA CRED RECEBIMENTO PIX". Se ainda sobrar mais de um candidato
//      (ou nenhum), o lançamento fica pendente — não arrisca categorizar
//      errado.
//   5. Nome da categoria do Conta Azul -> categoria viva no Praxis: match
//      por nome normalizado (sem acento, minúsculo), com um pequeno mapa de
//      apelidos pra 2 casos que batem só por aproximação (ver
//      ALIAS_CATEGORIA). Categorias do Conta Azul sem correspondente óbvio
//      (Transferência de Entrada/Saída, Reembolso ao hóspede, Presente,
//      Aluguel de veículos, Saldo Inicial — juntas ~1% do arquivo) ficam de
//      fora deliberadamente (ver CATEGORIA_IGNORAR) — apareceriam num
//      relatório à parte pra você decidir se quer mapear na mão.
//
// Cada linha da planilha só é usada UMA vez (marca como "consumida" ao
// casar), pra não aplicar a mesma linha em dois lançamentos diferentes.
//
// Uso (sempre roda em modo relatório primeiro — nada é gravado sem --apply):
//   cd packages/core
//   npx tsx scripts/importar-categorizacao-conta-azul.ts "/caminho/extrato_financeiro.xls"
//   npx tsx scripts/importar-categorizacao-conta-azul.ts "/caminho/extrato_financeiro.xls" --apply

import * as XLSX from "xlsx";
import { prisma } from "../src/prisma";

type LinhaContaAzul = {
  dataCompetencia: string; // YYYY-MM-DD
  descricao: string;
  fornecedor: string | null;
  valor: number;
  categoria1: string | null;
};

function normalizar(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Ver item 5 do comentário do topo — casos que só batem por aproximação.
const ALIAS_CATEGORIA: Record<string, string> = {
  caucao: "caucao (flats)",
  tarifas: "taxas financeiras",
};

// Categorias do Conta Azul deliberadamente NÃO mapeadas — ver item 5.
const CATEGORIA_IGNORAR = new Set(
  ["saldo inicial", "transferencia de entrada", "transferencia de saida", "presente", "reembolso ao hospede", "aluguel de veiculos"].map(normalizar)
);

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

// Palavras "significativas" (>=4 letras, sem número de parcela tipo "1/10")
// pra usar como assinatura na hora de desempatar candidatos.
function tokens(s: string): string[] {
  return normalizar(s)
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
    const dataCompetencia = parseDataBR(String(r["Data de competência"] ?? ""));
    const valorRaw = r["Valor (R$)"];
    if (!dataCompetencia || valorRaw === null || valorRaw === undefined || valorRaw === "") continue;
    linhas.push({
      dataCompetencia,
      descricao: String(r["Descrição"] ?? ""),
      fornecedor: r["Nome do fornecedor/cliente"] ? String(r["Nome do fornecedor/cliente"]) : null,
      valor: Number(valorRaw),
      categoria1: r["Categoria 1"] ? String(r["Categoria 1"]) : null,
    });
  }
  return linhas;
}

async function main() {
  const args = process.argv.slice(2);
  const caminho = args.find((a) => !a.startsWith("--"));
  const aplicar = args.includes("--apply");
  if (!caminho) {
    console.error('Uso: npx tsx scripts/importar-categorizacao-conta-azul.ts "<arquivo.xls>" [--apply]');
    process.exit(1);
  }

  console.log(`Lendo ${caminho}...`);
  const linhas = lerPlanilha(caminho);
  console.log(`${linhas.length} linha(s) realizada(s) (Quitado/Conciliado) no arquivo.\n`);

  const categoriasVivas = await prisma.financeCategoria.findMany({ where: { ativo: true } });
  const categoriaIdPorNomeNorm = new Map<string, string>();
  for (const c of categoriasVivas) categoriaIdPorNomeNorm.set(normalizar(c.nome), c.id);

  function resolverCategoriaId(nomeContaAzul: string | null): { id: string | null; motivoFalha: string } {
    if (!nomeContaAzul) return { id: null, motivoFalha: "sem categoria no Conta Azul" };
    const norm = normalizar(nomeContaAzul);
    if (CATEGORIA_IGNORAR.has(norm)) return { id: null, motivoFalha: `"${nomeContaAzul}" (ignorada de propósito)` };
    const chave = ALIAS_CATEGORIA[norm] ?? norm;
    const id = categoriaIdPorNomeNorm.get(chave);
    if (!id) return { id: null, motivoFalha: `"${nomeContaAzul}" (sem correspondente na taxonomia atual)` };
    return { id, motivoFalha: "" };
  }

  // índice por (dataCompetencia|valor) -> índices das linhas candidatas
  const porChave = new Map<string, number[]>();
  // índices auxiliares só pra diagnóstico (ver abaixo) — só por valor, e só
  // por data, isolados, pra descobrir SE o problema em cada "sem candidato"
  // é de data (valor bate em outro dia) ou de valor (data bate com outro valor).
  const porValor = new Map<string, number[]>();
  const porData = new Map<string, number[]>();
  linhas.forEach((l, i) => {
    const chave = `${l.dataCompetencia}|${l.valor.toFixed(2)}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave)!.push(i);

    const chaveValor = l.valor.toFixed(2);
    if (!porValor.has(chaveValor)) porValor.set(chaveValor, []);
    porValor.get(chaveValor)!.push(i);

    if (!porData.has(l.dataCompetencia)) porData.set(l.dataCompetencia, []);
    porData.get(l.dataCompetencia)!.push(i);
  });
  const usadas = new Set<number>();

  function diffDias(a: string, b: string): number {
    const [a1, a2, a3] = a.split("-").map(Number);
    const [b1, b2, b3] = b.split("-").map(Number);
    const da = Date.UTC(a1, a2 - 1, a3);
    const db = Date.UTC(b1, b2 - 1, b3);
    return Math.round((da - db) / 86400000);
  }

  const pendentes = await prisma.financeLancamento.findMany({
    where: { origem: "PLUGGY", categoriaId: null },
    orderBy: { dataVencimento: "asc" },
    include: { contaBancaria: { select: { tipo: true } } },
  });
  console.log(`${pendentes.length} lançamento(s) pendente(s) de categorização no sistema.\n`);

  let confiantes = 0;
  let desambiguadosPorTexto = 0;
  let semCandidato = 0;
  let ambiguos = 0;
  let categoriaSemCorrespondente = 0;
  const semCorrespondenteContagem = new Map<string, number>();
  const atualizacoes: { id: string; categoriaId: string; origemLinha: LinhaContaAzul }[] = [];
  const semCandidatoAmostra: string[] = [];

  for (const l of pendentes) {
    const dataBase = l.dataCompetencia || l.dataVencimento;
    const textoAlvo = normalizar(`${l.descricao} ${l.fornecedor ?? ""}`);
    // Cartão de crédito (tipo=CREDIT): valor guardado como "quanto você deve"
    // (sempre positivo pra compra, é o que alimenta o "saldo da fatura" na
    // tela de Lançamentos). Conta corrente (tipo=BANK) e lançamento manual:
    // valor já vem com sinal de despesa/receita (negativo/positivo), igual
    // ao Conta Azul. Descoberto empiricamente 05/08/2026: toda compra de
    // cartão ficava "sem candidato" porque comparava R$34.99 (fatura) contra
    // -R$34.99 (Conta Azul) — nunca batiam. Aqui inverte só pra cartão, só
    // pra fins de comparação com o Conta Azul (não mexe no valor gravado).
    const valorAlvo = l.contaBancaria?.tipo === "CREDIT" ? -Number(l.valor) : Number(l.valor);

    let candidatosIdx: number[] = [];
    for (const delta of [0, 1, -1, 2, -2]) {
      const data = somarDiasLocal(dataBase, delta);
      const chave = `${data}|${valorAlvo.toFixed(2)}`;
      const achados = (porChave.get(chave) ?? []).filter((i) => !usadas.has(i));
      if (achados.length > 0) {
        candidatosIdx = achados;
        break;
      }
    }

    if (candidatosIdx.length === 0) {
      semCandidato++;
      if (semCandidatoAmostra.length < 20) {
        // diagnóstico: será que o valor bate em outra data (fora da janela
        // de ±2 dias), ou a data bate com outro valor (diferença de
        // centavos)? Ajuda a saber se é caso de aumentar a tolerância de
        // dias ou se o lançamento simplesmente não está no Conta Azul.
        const valorAlvoStr = valorAlvo.toFixed(2);
        const mesmoValorOutrasDatas = porValor.get(valorAlvoStr) ?? [];
        let menorDiffDias: number | null = null;
        for (const i of mesmoValorOutrasDatas) {
          const d = Math.abs(diffDias(linhas[i].dataCompetencia, dataBase));
          if (menorDiffDias === null || d < menorDiffDias) menorDiffDias = d;
        }
        const mesmaDataOutrosValores = porData.get(dataBase) ?? [];
        let menorDiffValor: number | null = null;
        for (const i of mesmaDataOutrosValores) {
          const d = Math.abs(linhas[i].valor - valorAlvo);
          if (menorDiffValor === null || d < menorDiffValor) menorDiffValor = d;
        }
        const diag =
          menorDiffDias !== null
            ? `valor R$${valorAlvoStr} existe em outra data, ${menorDiffDias}d de diferença`
            : menorDiffValor !== null
              ? `data ${dataBase} existe c/ outro valor, diff R$${menorDiffValor.toFixed(2)}`
              : `nem valor nem data aparecem no Conta Azul`;
        semCandidatoAmostra.push(
          `  [${l.id.slice(-6)}] ${dataBase} R$${valorAlvoStr} "${l.descricao}" ${l.fornecedor ?? ""} — ${diag}`
        );
      }
      continue;
    }

    let escolhidoIdx: number | null = null;
    if (candidatosIdx.length === 1) {
      escolhidoIdx = candidatosIdx[0];
      confiantes++;
    } else {
      const comMatch = candidatosIdx.filter((i) => {
        const toks = tokens(`${linhas[i].descricao} ${linhas[i].fornecedor ?? ""}`);
        return toks.some((t) => textoAlvo.includes(t));
      });
      if (comMatch.length === 1) {
        escolhidoIdx = comMatch[0];
        desambiguadosPorTexto++;
      } else {
        ambiguos++;
        continue;
      }
    }

    usadas.add(escolhidoIdx);
    const linha = linhas[escolhidoIdx];
    const { id: categoriaId, motivoFalha } = resolverCategoriaId(linha.categoria1);
    if (!categoriaId) {
      categoriaSemCorrespondente++;
      semCorrespondenteContagem.set(motivoFalha, (semCorrespondenteContagem.get(motivoFalha) ?? 0) + 1);
      continue;
    }

    atualizacoes.push({ id: l.id, categoriaId, origemLinha: linha });
  }

  console.log("=== RELATÓRIO ===");
  console.log(`Match direto (candidato único):              ${confiantes}`);
  console.log(`Match desambiguado por texto:                 ${desambiguadosPorTexto}`);
  console.log(`Categoria do Conta Azul sem correspondente:   ${categoriaSemCorrespondente}`);
  console.log(`Ambíguo (mais de 1 candidato, ficou pendente): ${ambiguos}`);
  console.log(`Sem candidato no Conta Azul:                   ${semCandidato}`);
  if (semCorrespondenteContagem.size > 0) {
    console.log("\nCategorias do Conta Azul sem correspondente (motivo -> quantidade):");
    for (const [motivo, n] of [...semCorrespondenteContagem.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${motivo}: ${n}`);
    }
  }
  console.log(`\n>>> Total que SERIA categorizado agora: ${atualizacoes.length} / ${pendentes.length} <<<`);

  if (semCandidatoAmostra.length > 0) {
    console.log(`\nAmostra de "sem candidato" (${semCandidatoAmostra.length} de ${semCandidato}), com diagnóstico:`);
    for (const linha of semCandidatoAmostra) console.log(linha);
  }

  console.log("\nAmostra de 10 matches (pra você conferir antes de aplicar):");
  for (const a of atualizacoes.slice(0, 10)) {
    const cat = categoriasVivas.find((c) => c.id === a.categoriaId);
    console.log(`  "${a.origemLinha.descricao}" (R$ ${a.origemLinha.valor}) -> categoria "${cat?.nome}"`);
  }

  if (!aplicar) {
    console.log("\n(modo relatório — nada foi gravado. Confira a amostra acima e rode de novo com --apply pra aplicar de verdade.)");
    await prisma.$disconnect();
    return;
  }

  console.log("\nAplicando...");
  let ok = 0;
  for (const a of atualizacoes) {
    await prisma.financeLancamento.update({ where: { id: a.id }, data: { categoriaId: a.categoriaId } });
    ok++;
  }
  console.log(`${ok} lançamento(s) categorizado(s) com sucesso.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
