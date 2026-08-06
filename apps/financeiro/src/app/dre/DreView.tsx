"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "@/components/SeletorMes";

// Tela principal do módulo (requisito 1 do Felipe: "DRE viva") — mostra o
// mês atual por padrão, com navegação livre pra qualquer mês passado ou
// futuro (requisito 2). O cálculo em si (fórmula fixa, projeção de
// recorrência) vive inteiramente em @praxis/core (lib/finance/dre.ts);
// esta tela só chama /api/dre?mes=YYYY-MM (uma vez por período aberto) e
// desenha o resultado.
//
// Redesenho 05/08/2026 (pedido do Felipe, depois de ver a tela "ilegível"
// comparado à planilha dele): layout denso tipo tabela — sem cards com
// padding grande, container só com a largura da metade da tela, tudo
// cabendo sem rolagem vertical — mais colunas de comparação de período
// (adiciona quantas quiser, mês passado ou futuro, cada linha vira uma
// tabela com um valor por período). Rolagem HORIZONTAL é o único
// compromisso possível se a pessoa empilhar muitas colunas de comparação
// numa tela estreita — não dá pra garantir "sem rolagem nenhuma" com
// colunas ilimitadas.

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_PT_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

type DreLinha = {
  id: string;
  categoriaId: string | null;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  projetadaDeRecorrencia: boolean;
};

type DreCategoria = {
  categoriaId: string;
  nome: string;
  total: string;
  orcado: string | null;
  lancamentos: DreLinha[];
};

type Totalizador = "MARGEM_BRUTA" | "DESPESAS" | "LUCRO_PREJUIZO_EXTRA";

type DreBlocoResumo = {
  blocoId: string;
  nome: string;
  ordem: number;
  totalizador: Totalizador;
  total: string;
  orcado: string | null;
  categorias: DreCategoria[];
};

type DreResponse = {
  mes: string;
  blocos: DreBlocoResumo[];
  margemBrutaRS: string;
  margemBrutaPercent: string | null;
  despesasRS: string;
  geracaoDeCaixaRS: string;
  lucroPrejuizoRS: string;
  pendentesCategorizacao: DreLinha[];
  mesAnterior: string;
  mesSeguinte: string;
};

type Empreendimento = { id: string; nome: string };
type Unidade = { id: string; nome: string; empreendimentoId: string; empreendimento: string };
type CentroCustoTipo = "GERAL" | "EMPREENDIMENTO" | "UNIDADE";

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

// Aritmética de mês pura, sem depender de @praxis/core (esta é uma
// pontinha client — mesmo motivo dos outros arquivos client deste app que
// não importam o pacote inteiro: ele carrega `prisma` no módulo).
function mesAdjacenteLocal(mes: string, delta: number): string {
  const [anoStr, mesStr] = mes.split("-");
  let ano = Number(anoStr);
  let mesNum = Number(mesStr) + delta;
  while (mesNum > 12) {
    mesNum -= 12;
    ano += 1;
  }
  while (mesNum < 1) {
    mesNum += 12;
    ano -= 1;
  }
  return `${ano}-${String(mesNum).padStart(2, "0")}`;
}

function formatBRL(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelMes(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  return `${MESES_PT[mesNum - 1]} de ${ano}`;
}

function labelMesCurto(mes: string): string {
  const [ano, mesNum] = mes.split("-").map(Number);
  return `${MESES_PT_CURTO[mesNum - 1]}/${String(ano).slice(2)}`;
}

function formatDataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Largura fixa de cada coluna de valor — mesma pras linhas e pro cabeçalho,
// pra tudo alinhar como tabela de verdade.
const COL_VALOR = "w-24 flex-shrink-0 text-right";

function Celula({ valor, destaque }: { valor: string | null; destaque?: boolean }) {
  const n = valor == null ? null : Number(valor);
  const positivo = n == null || n >= 0;
  return (
    <div className={`${COL_VALOR} ${destaque ? "font-bold" : "font-medium"} text-xs ${n == null ? "text-gray-300" : positivo ? "text-green-700" : "text-red-600"}`}>
      {n == null ? "—" : formatBRL(valor)}
    </div>
  );
}

function LinhaTotal({ rotulo, valoresPorPeriodo, percentPorPeriodo }: { rotulo: string; valoresPorPeriodo: (string | null)[]; percentPorPeriodo?: (string | null)[] }) {
  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-2.5 py-1.5">
      <p className="flex-1 min-w-0 truncate font-bold text-xs text-gray-900">{rotulo}</p>
      {valoresPorPeriodo.map((v, i) => (
        <div key={i} className={COL_VALOR}>
          <Celula valor={v} destaque />
          {percentPorPeriodo?.[i] != null && <p className="text-[10px] text-gray-500">{Number(percentPorPeriodo[i]).toFixed(1)}%</p>}
        </div>
      ))}
    </div>
  );
}

// Nível 2 (pedido do Felipe, 06/08/2026): categoria também expande, e
// revela os lançamentos individuais daquele mês. Só faz sentido pro
// período PRIMÁRIO (periodos[0]) — com colunas de comparação abertas, cada
// categoria é UMA linha com N valores lado a lado, não N linhas.
function LinhaCategoriaDre({ nome, valoresPorPeriodo, lancamentos }: { nome: string; valoresPorPeriodo: (string | null)[]; lancamentos: DreLinha[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded text-left hover:bg-gray-50">
        {aberto ? <ChevronUp className="w-3 h-3 text-gray-300 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-gray-300 flex-shrink-0" />}
        <p className="flex-1 min-w-0 truncate text-xs text-gray-500">{nome}</p>
        {valoresPorPeriodo.map((v, i) => (
          <Celula key={i} valor={v} />
        ))}
      </button>

      {aberto && (
        <div className="ml-5 border-l border-gray-100 pl-2">
          {lancamentos.length === 0 ? (
            <p className="text-[11px] text-gray-400 py-1">Nenhum lançamento neste mês.</p>
          ) : (
            lancamentos.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-1.5 py-1">
                <p className="flex-1 min-w-0 truncate text-[11px] text-gray-600">
                  {l.descricao}
                  {l.projetadaDeRecorrencia && (
                    <span className="ml-1 text-gray-300" title="Ocorrência projetada de lançamento recorrente">
                      ↻
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-gray-400 w-8 flex-shrink-0 text-right">{formatDataCurta(l.dataEfetiva)}</p>
                <Celula valor={l.valor} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LinhaBloco({
  bloco, valoresPorPeriodo, categoriasCanonicas, valoresCategoriaPorPeriodo, lancamentosPorCategoria, destaque,
}: {
  bloco: { nome: string };
  valoresPorPeriodo: (string | null)[];
  categoriasCanonicas: { categoriaId: string; nome: string }[];
  valoresCategoriaPorPeriodo: (categoriaId: string) => (string | null)[];
  lancamentosPorCategoria: (categoriaId: string) => DreLinha[];
  destaque?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left ${destaque ? "bg-gray-100 hover:bg-gray-200" : "hover:bg-gray-50"}`}
      >
        {aberto ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <p className={`flex-1 min-w-0 truncate text-xs text-gray-800 ${destaque ? "font-bold" : "font-medium"}`}>{bloco.nome}</p>
        {valoresPorPeriodo.map((v, i) => (
          <Celula key={i} valor={v} destaque={destaque} />
        ))}
      </button>

      {aberto && (
        <div className="ml-5 border-l border-gray-100 pl-2">
          {categoriasCanonicas.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Nenhum lançamento categorizado.</p>
          ) : (
            categoriasCanonicas.map((c) => (
              <LinhaCategoriaDre key={c.categoriaId} nome={c.nome} valoresPorPeriodo={valoresCategoriaPorPeriodo(c.categoriaId)} lancamentos={lancamentosPorCategoria(c.categoriaId)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function DreView() {
  const [periodos, setPeriodos] = useState<string[]>([mesAtualSP()]);
  const [dados, setDados] = useState<Record<string, DreResponse | null>>({});
  const [loading, setLoading] = useState(true);
  // blocoId -> true quando TODAS as categorias ativas daquele bloco são
  // tipo=RECEITA — usado só pra dar destaque visual (mesmo "patamar" dos 4
  // totais) a blocos de receita, pedido do Felipe 05/08/2026. Vem de
  // /api/categorias (não do /api/dre) de propósito: essa info não pode
  // depender de quais categorias tiveram lançamento NO MÊS aberto — em
  // meses sem nada categorizado ainda (como Agosto/26 na hora do pedido),
  // bloco.categorias do /api/dre vem vazio e a detecção falharia.
  const [blocosReceita, setBlocosReceita] = useState<Set<string>>(new Set());

  // Centro de Custo (pedido do Felipe, 05/08/2026): Geral (default, soma de
  // tudo) | Empreendimento (rateia Administração/outros lançamentos entre
  // as unidades daquele prédio) | Unidade (idem, mas pra uma unidade só).
  // Ver lib/finance/centro-de-custo.ts em @praxis/core pra fórmula.
  const [centroCustoTipo, setCentroCustoTipo] = useState<CentroCustoTipo>("GERAL");
  const [centroCustoEmpreendimentoId, setCentroCustoEmpreendimentoId] = useState("");
  const [centroCustoUnidadeId, setCentroCustoUnidadeId] = useState("");
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  useEffect(() => {
    apiFetch("/api/empreendimentos")
      .then((res) => (res.ok ? res.json() : []))
      .then(setEmpreendimentos)
      .catch(() => {});
    apiFetch("/api/unidades")
      .then((res) => (res.ok ? res.json() : []))
      .then(setUnidades)
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/api/categorias")
      .then((res) => (res.ok ? res.json() : []))
      .then((categorias: { blocoId: string; tipo: string }[]) => {
        const porBloco = new Map<string, string[]>();
        for (const c of categorias) porBloco.set(c.blocoId, [...(porBloco.get(c.blocoId) ?? []), c.tipo]);
        const receita = new Set<string>();
        for (const [blocoId, tipos] of porBloco) if (tipos.length > 0 && tipos.every((t) => t === "RECEITA")) receita.add(blocoId);
        setBlocosReceita(receita);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    // Só aplica o filtro de Empreendimento/Unidade quando um alvo específico
    // já foi escolhido — enquanto isso, cai de volta pro Geral (evita erro
    // 400 no meio da troca de aba, antes do <select> ser preenchido).
    const params = new URLSearchParams();
    if (centroCustoTipo === "EMPREENDIMENTO" && centroCustoEmpreendimentoId) {
      params.set("centroCusto", "EMPREENDIMENTO");
      params.set("empreendimentoId", centroCustoEmpreendimentoId);
    } else if (centroCustoTipo === "UNIDADE" && centroCustoUnidadeId) {
      params.set("centroCusto", "UNIDADE");
      params.set("unidadeId", centroCustoUnidadeId);
    }
    Promise.all(
      periodos.map((mes) =>
        apiFetch(`/api/dre?mes=${mes}&${params.toString()}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => [mes, data] as const)
      )
    )
      .then((entradas) => setDados(Object.fromEntries(entradas)))
      .finally(() => setLoading(false));
  }, [periodos, centroCustoTipo, centroCustoEmpreendimentoId, centroCustoUnidadeId]);

  function mudarPeriodo(idx: number, novoMes: string) {
    setPeriodos((prev) => prev.map((m, i) => (i === idx ? novoMes : m)));
  }

  function adicionarPeriodo() {
    setPeriodos((prev) => [...prev, mesAdjacenteLocal(prev[prev.length - 1], -1)]);
  }

  function removerPeriodo(idx: number) {
    setPeriodos((prev) => prev.filter((_, i) => i !== idx));
  }

  const primario = dados[periodos[0]] ?? null;
  // Estrutura de blocos é do tenant, não do mês — todo período tem os
  // mesmos blocos; pega do primeiro que já carregou.
  const blocosCanonicos = Object.values(dados).find((d) => d)?.blocos ?? [];

  function valorBloco(blocoId: string, mes: string): string | null {
    return dados[mes]?.blocos.find((b) => b.blocoId === blocoId)?.total ?? null;
  }

  // Nível 1 de agrupamento (pedido do Felipe, 06/08/2026): Margem Bruta
  // continua com 1 linha por bloco configurado (Receita Bruta, Custos
  // Variáveis...). Despesas e Resultados Extras (LUCRO_PREJUIZO_EXTRA) viram
  // UMA linha só cada, mesclando as categorias de TODOS os blocos daquele
  // totalizador — "estrutura mínima": Receita Bruta, Custos Variáveis,
  // Margem Bruta, Despesas, Resultados Extras, Geração de Caixa,
  // Lucro/Prejuízo. As funções abaixo recebem uma LISTA de blocoIds (1 pra
  // Margem Bruta, N pra Despesas/Extras) e mesclam.
  function categoriasCanonicasDoGrupo(blocoIds: string[]): { categoriaId: string; nome: string }[] {
    const vistos = new Map<string, string>();
    for (const mes of periodos) {
      for (const blocoId of blocoIds) {
        const bloco = dados[mes]?.blocos.find((b) => b.blocoId === blocoId);
        bloco?.categorias.forEach((c) => vistos.set(c.categoriaId, c.nome));
      }
    }
    return Array.from(vistos, ([categoriaId, nome]) => ({ categoriaId, nome }));
  }

  function categoriaNoGrupo(blocoIds: string[], categoriaId: string, mes: string): DreCategoria | undefined {
    for (const blocoId of blocoIds) {
      const c = dados[mes]?.blocos.find((b) => b.blocoId === blocoId)?.categorias.find((c) => c.categoriaId === categoriaId);
      if (c) return c;
    }
    return undefined;
  }

  function valoresCategoriaDoGrupo(blocoIds: string[], categoriaId: string): (string | null)[] {
    return periodos.map((mes) => categoriaNoGrupo(blocoIds, categoriaId, mes)?.total ?? null);
  }

  function lancamentosCategoriaDoGrupo(blocoIds: string[], categoriaId: string): DreLinha[] {
    return categoriaNoGrupo(blocoIds, categoriaId, periodos[0])?.lancamentos ?? [];
  }

  const blocosDe = (t: Totalizador) => blocosCanonicos.filter((b) => b.totalizador === t);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <SeletorMes mes={periodos[0]} onChange={(m) => mudarPeriodo(0, m)} className="flex-shrink-0" />
        {periodos[0] !== mesAtualSP() && (
          <button onClick={() => mudarPeriodo(0, mesAtualSP())} className="text-xs text-blue-700 font-medium hover:underline flex-shrink-0">
            hoje
          </button>
        )}

        {periodos.slice(1).map((mes, i) => (
          <div key={i} className="flex items-center gap-1 bg-gray-100 rounded-lg pl-2 pr-1 py-1 flex-shrink-0">
            <input type="month" value={mes} onChange={(e) => e.target.value && mudarPeriodo(i + 1, e.target.value)} className="text-xs bg-transparent border-0 focus:outline-none w-[5.5rem]" />
            <button onClick={() => removerPeriodo(i + 1)} className="text-gray-400 hover:text-red-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <button onClick={adicionarPeriodo} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> Comparar
        </button>
      </div>

      {/* Geral / Empreendimento / Unidade (pedido do Felipe, 05/08/2026) —
          aplica o MESMO filtro a todas as colunas de comparação abertas
          acima. Ver lib/finance/centro-de-custo.ts pra fórmula do rateio. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(
            [
              ["GERAL", "Geral"],
              ["EMPREENDIMENTO", "Empreendimento"],
              ["UNIDADE", "Unidade"],
            ] as const
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setCentroCustoTipo(v)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-md ${centroCustoTipo === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {centroCustoTipo === "EMPREENDIMENTO" && (
          <select className="input text-xs py-1.5 w-48" value={centroCustoEmpreendimentoId} onChange={(e) => setCentroCustoEmpreendimentoId(e.target.value)}>
            <option value="">Selecione o empreendimento...</option>
            {empreendimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        )}

        {centroCustoTipo === "UNIDADE" && (
          <select className="input text-xs py-1.5 w-48" value={centroCustoUnidadeId} onChange={(e) => setCentroCustoUnidadeId(e.target.value)}>
            <option value="">Selecione a unidade...</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.empreendimento} — {u.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : !primario ? (
        <p className="text-red-600 text-sm">Erro ao carregar a DRE.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-fit space-y-2">
            {primario.pendentesCategorizacao.length > 0 && (
              <Link
                href="/lancamentos?pendentes=1"
                className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs font-medium">
                  {primario.pendentesCategorizacao.length} lançamento{primario.pendentesCategorizacao.length > 1 ? "s" : ""} sem categoria em {labelMes(periodos[0])} — toque pra categorizar
                </p>
              </Link>
            )}

            {/* Cabeçalho das colunas de período */}
            <div className="flex items-center gap-2 px-2.5">
              <div className="flex-1 min-w-0" />
              {periodos.map((mes, i) => (
                <p key={i} className={`${COL_VALOR} text-[10px] font-semibold text-gray-400 uppercase`}>
                  {labelMesCurto(mes)}
                </p>
              ))}
            </div>

            <div className="space-y-0.5">
              {blocosDe("MARGEM_BRUTA").map((b) => (
                <LinhaBloco
                  key={b.blocoId}
                  bloco={b}
                  valoresPorPeriodo={periodos.map((mes) => valorBloco(b.blocoId, mes))}
                  categoriasCanonicas={categoriasCanonicasDoGrupo([b.blocoId])}
                  valoresCategoriaPorPeriodo={(catId) => valoresCategoriaDoGrupo([b.blocoId], catId)}
                  lancamentosPorCategoria={(catId) => lancamentosCategoriaDoGrupo([b.blocoId], catId)}
                  destaque={blocosReceita.has(b.blocoId)}
                />
              ))}
              <LinhaTotal
                rotulo="Margem Bruta"
                valoresPorPeriodo={periodos.map((mes) => dados[mes]?.margemBrutaRS ?? null)}
                percentPorPeriodo={periodos.map((mes) => dados[mes]?.margemBrutaPercent ?? null)}
              />

              {(() => {
                const idsDespesas = blocosDe("DESPESAS").map((b) => b.blocoId);
                return (
                  <LinhaBloco
                    bloco={{ nome: "Despesas" }}
                    valoresPorPeriodo={periodos.map((mes) => dados[mes]?.despesasRS ?? null)}
                    categoriasCanonicas={categoriasCanonicasDoGrupo(idsDespesas)}
                    valoresCategoriaPorPeriodo={(catId) => valoresCategoriaDoGrupo(idsDespesas, catId)}
                    lancamentosPorCategoria={(catId) => lancamentosCategoriaDoGrupo(idsDespesas, catId)}
                  />
                );
              })()}

              <LinhaTotal rotulo="Geração de Caixa (Lucro Operacional)" valoresPorPeriodo={periodos.map((mes) => dados[mes]?.geracaoDeCaixaRS ?? null)} />

              {(() => {
                const idsExtras = blocosDe("LUCRO_PREJUIZO_EXTRA").map((b) => b.blocoId);
                const valoresExtras = periodos.map((mes) => {
                  const soma = (dados[mes]?.blocos ?? []).filter((b) => idsExtras.includes(b.blocoId)).reduce((acc, b) => acc + Number(b.total), 0);
                  return dados[mes] ? String(soma) : null;
                });
                return (
                  <LinhaBloco
                    bloco={{ nome: "Resultados Extras" }}
                    valoresPorPeriodo={valoresExtras}
                    categoriasCanonicas={categoriasCanonicasDoGrupo(idsExtras)}
                    valoresCategoriaPorPeriodo={(catId) => valoresCategoriaDoGrupo(idsExtras, catId)}
                    lancamentosPorCategoria={(catId) => lancamentosCategoriaDoGrupo(idsExtras, catId)}
                  />
                );
              })()}

              <LinhaTotal rotulo="Lucro / Prejuízo" valoresPorPeriodo={periodos.map((mes) => dados[mes]?.lucroPrejuizoRS ?? null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
