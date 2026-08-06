"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Check, CheckCircle2, Circle, Repeat, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { SeletorMes } from "@/components/SeletorMes";

// Orçamento — redesenho de 06/08/2026 (pedido do Felipe): mesma árvore
// colapsável da tela DRE (Bloco -> Categoria -> Lançamentos), com a MESMA
// simplificação de estrutura mínima: Receita Bruta / Custos Variáveis
// continuam 1 linha por bloco configurado; Despesas e Resultados Extras
// (LUCRO_PREJUIZO_EXTRA) viram 1 linha só cada, mesclando as categorias de
// todos os blocos daquele totalizador. O 2º nível de cada categoria mostra
// 3 coisas (nesta ordem, pedido do Felipe): lançamentos JÁ REALIZADOS neste
// mês, lançamentos PREVISTOS (recorrentes ou pontuais, cumpridos ou não) e
// a PROVISÃO de gastos não definidos (editável, com consumido/restante).
//
// Os totais exibidos (Margem Bruta, Despesas, Geração de Caixa,
// Lucro/Prejuízo e os subtotais por categoria/bloco) são a PROJEÇÃO de
// fechamento do mês — realizado + previstos ainda pendentes + provisão
// restante — não só o que já aconteceu (isso é o que "a provisão
// sensibiliza os valores do Orçamento" significa, pedido do Felipe). Nada
// disso é gravado: tudo calculado ao vivo em lib/finance/orcamento.ts.

type Totalizador = "MARGEM_BRUTA" | "DESPESAS" | "LUCRO_PREJUIZO_EXTRA";
type Empreendimento = { id: string; nome: string };
type Unidade = { id: string; nome: string; empreendimentoId: string; empreendimento: string };
type CentroCustoTipo = "GERAL" | "EMPREENDIMENTO" | "UNIDADE";

type LancamentoRealizado = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  projetadaDeRecorrencia: boolean;
};

type Previsto = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: string;
  dataEfetiva: string;
  recorrente: boolean;
  cumprido: boolean;
  lancamentoRealId: string | null;
};

type OrcamentoCategoria = {
  categoriaId: string;
  nome: string;
  tipo: string;
  blocoId: string;
  realizadoRS: string;
  lancamentos: LancamentoRealizado[];
  previstos: Previsto[];
  totalPrevistosRS: string;
  provisaoRS: string | null;
  provisaoConsumidaRS: string;
  provisaoRestanteRS: string | null;
  projetadoRS: string;
};

type OrcamentoBloco = {
  blocoId: string;
  nome: string;
  ordem: number;
  totalizador: Totalizador;
  realizadoRS: string;
  projetadoRS: string;
  categorias: OrcamentoCategoria[];
};

type OrcamentoResponse = {
  mes: string;
  blocos: OrcamentoBloco[];
  margemBrutaProjetadoRS: string;
  margemBrutaProjetadoPercent: string | null;
  despesasProjetadoRS: string;
  geracaoDeCaixaProjetadoRS: string;
  lucroPrejuizoProjetadoRS: string;
};

function mesAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function mesAdjacente(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatBRL(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function labelMesCurto(mes: string): string {
  const NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES[m - 1]}/${String(ano).slice(2)}`;
}

const COL_VALOR = "w-28 flex-shrink-0 text-right";

function Celula({ valor, destaque }: { valor: string | null; destaque?: boolean }) {
  const n = valor == null ? null : Number(valor);
  const positivo = n == null || n >= 0;
  return (
    <div className={`${COL_VALOR} ${destaque ? "font-bold" : "font-medium"} text-xs ${n == null ? "text-gray-300" : positivo ? "text-green-700" : "text-red-600"}`}>
      {n == null ? "—" : formatBRL(valor)}
    </div>
  );
}

function LinhaTotal({ rotulo, valor, percent }: { rotulo: string; valor: string | null; percent?: string | null }) {
  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-2.5 py-1.5">
      <p className="flex-1 min-w-0 truncate font-bold text-xs text-gray-900">{rotulo}</p>
      <div className={COL_VALOR}>
        <Celula valor={valor} destaque />
        {percent != null && <p className="text-[10px] text-gray-500">{Number(percent).toFixed(1)}%</p>}
      </div>
    </div>
  );
}

function ValorInput({ valorInicial, onSalvar }: { valorInicial: string; onSalvar: (v: number) => void }) {
  const [valor, setValor] = useState(valorInicial);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => setValor(valorInicial), [valorInicial]);

  return (
    <div className="relative flex-shrink-0 w-28">
      <input
        type="number"
        step="0.01"
        min="0"
        className="input text-xs py-1.5 pr-6"
        value={valor}
        placeholder="0,00"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          if (valor !== "" && Number(valor) !== Number(valorInicial || 0)) {
            onSalvar(Number(valor));
            setSalvo(true);
            setTimeout(() => setSalvo(false), 1500);
          }
        }}
      />
      {salvo && <Check className="w-3.5 h-3.5 text-green-600 absolute right-1.5 top-1/2 -translate-y-1/2" />}
    </div>
  );
}

function LinhaRealizado({ lancamento }: { lancamento: LancamentoRealizado }) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1">
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className="text-xs text-gray-700 truncate">{lancamento.descricao}</p>
        {lancamento.projetadaDeRecorrencia && <Repeat className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" aria-label="Ocorrência projetada de recorrência" />}
      </div>
      <p className="text-[10px] text-gray-400 flex-shrink-0 w-8">{formatData(lancamento.dataEfetiva)}</p>
      <Celula valor={lancamento.valor} />
    </div>
  );
}

function LinhaPrevisto({ previsto }: { previsto: Previsto }) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1">
      {previsto.cumprido ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" aria-label="Cumprido" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" aria-label="Pendente" />
      )}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className="text-xs text-gray-600 truncate">{previsto.descricao}</p>
        {previsto.recorrente && <Repeat className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" aria-label="Recorrente" />}
      </div>
      <p className="text-[10px] text-gray-400 flex-shrink-0 w-8">{formatData(previsto.dataEfetiva)}</p>
      <Celula valor={previsto.valor} />
    </div>
  );
}

function LinhaCategoria({
  categoria,
  onIniciarFluxoProvisao,
  editavelProvisao,
}: {
  categoria: OrcamentoCategoria;
  onIniciarFluxoProvisao: (categoriaId: string, categoriaNome: string, valor: number) => void;
  editavelProvisao: boolean;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded-lg text-left hover:bg-gray-50">
        {aberto ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
        <p className="flex-1 min-w-0 truncate text-xs text-gray-700">{categoria.nome}</p>
        <Celula valor={categoria.projetadoRS} />
      </button>

      {aberto && (
        <div className="ml-5 border-l border-gray-100 pl-2 pb-1 space-y-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase px-1.5 pt-1">Realizado</p>
            {categoria.lancamentos.length === 0 ? (
              <p className="text-[11px] text-gray-400 px-1.5 py-0.5">Nada realizado ainda neste mês.</p>
            ) : (
              categoria.lancamentos.map((l) => <LinhaRealizado key={l.id} lancamento={l} />)
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase px-1.5">Previstos</p>
            {categoria.previstos.length === 0 ? (
              <p className="text-[11px] text-gray-400 px-1.5 py-0.5">Nenhum lançamento previsto pra este mês.</p>
            ) : (
              categoria.previstos.map((p) => <LinhaPrevisto key={p.id} previsto={p} />)
            )}
          </div>

          <div className="flex items-center gap-2 px-1.5 py-1 bg-gray-50 rounded-lg">
            <p className="flex-1 min-w-0 text-xs text-gray-600">Provisão (gastos não definidos){!editavelProvisao && " — fatia rateada"}</p>
            {categoria.provisaoRS != null && (
              <div className="text-[10px] text-gray-400 flex-shrink-0 text-right">
                <p>consumido {formatBRL(categoria.provisaoConsumidaRS)}</p>
                <p className={Number(categoria.provisaoRestanteRS) < 0 ? "text-red-600 font-medium" : ""}>restante {formatBRL(categoria.provisaoRestanteRS)}</p>
              </div>
            )}
            {editavelProvisao ? (
              <ValorInput valorInicial={categoria.provisaoRS ?? ""} onSalvar={(v) => onIniciarFluxoProvisao(categoria.categoriaId, categoria.nome, v)} />
            ) : (
              <Celula valor={categoria.provisaoRS} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaGrupo({
  nome,
  valor,
  categorias,
  onIniciarFluxoProvisao,
  editavelProvisao,
  destaque,
}: {
  nome: string;
  valor: string | null;
  categorias: OrcamentoCategoria[];
  onIniciarFluxoProvisao: (categoriaId: string, categoriaNome: string, valor: number) => void;
  editavelProvisao: boolean;
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
        <p className={`flex-1 min-w-0 truncate text-xs text-gray-800 ${destaque ? "font-bold" : "font-medium"}`}>{nome}</p>
        <Celula valor={valor} destaque={destaque} />
      </button>

      {aberto && (
        <div className="ml-5 border-l border-gray-100 pl-2">
          {categorias.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">Nenhuma categoria com movimento, previsão ou provisão neste mês.</p>
          ) : (
            categorias.map((c) => (
              <LinhaCategoria key={c.categoriaId} categoria={c} onIniciarFluxoProvisao={onIniciarFluxoProvisao} editavelProvisao={editavelProvisao} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Fluxo de confirmação da provisão (pedido do Felipe, 06/08/2026): ao
// salvar um valor de provisão, pergunta se replica pros meses seguintes
// (quantos) e, se algum desses meses já tiver provisão configurada,
// pergunta se sobrescreve. 3 etapas dentro do mesmo modal.
type EtapaFluxoProvisao = "replicar" | "quantidade" | "sobrescrever";
type FluxoProvisao = {
  categoriaId: string;
  categoriaNome: string;
  valor: number;
  etapa: EtapaFluxoProvisao;
  quantidadeMeses: number;
  mesesConflitantes: string[];
};

export function OrcamentoView() {
  const [mes, setMes] = useState(mesAtualSP());
  const [dados, setDados] = useState<OrcamentoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Geral / Empreendimento / Unidade (pedido do Felipe, 06/08/2026) — mesmo
  // filtro e mesmo componente da DreView. Ver lib/finance/centro-de-custo.ts.
  const [centroCustoTipo, setCentroCustoTipo] = useState<CentroCustoTipo>("GERAL");
  const [centroCustoEmpreendimentoId, setCentroCustoEmpreendimentoId] = useState("");
  const [centroCustoUnidadeId, setCentroCustoUnidadeId] = useState("");
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);

  const [fluxoProvisao, setFluxoProvisao] = useState<FluxoProvisao | null>(null);
  const [salvandoProvisao, setSalvandoProvisao] = useState(false);
  const [resultadoProvisao, setResultadoProvisao] = useState("");

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

  async function carregar() {
    setLoading(true);
    const params = new URLSearchParams({ mes });
    if (centroCustoTipo === "EMPREENDIMENTO" && centroCustoEmpreendimentoId) {
      params.set("centroCusto", "EMPREENDIMENTO");
      params.set("empreendimentoId", centroCustoEmpreendimentoId);
    } else if (centroCustoTipo === "UNIDADE" && centroCustoUnidadeId) {
      params.set("centroCusto", "UNIDADE");
      params.set("unidadeId", centroCustoUnidadeId);
    }
    const res = await apiFetch(`/api/orcamento?${params.toString()}`);
    setDados(res.ok ? await res.json() : null);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, centroCustoTipo, centroCustoEmpreendimentoId, centroCustoUnidadeId]);

  async function salvarProvisaoUnica(categoriaId: string, valor: number) {
    await apiFetch("/api/orcamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alvoTipo: "CATEGORIA", alvoChave: categoriaId, categoriaId, mes, valor }),
    });
    carregar();
  }

  function iniciarFluxoProvisao(categoriaId: string, categoriaNome: string, valor: number) {
    setResultadoProvisao("");
    setFluxoProvisao({ categoriaId, categoriaNome, valor, etapa: "replicar", quantidadeMeses: 11, mesesConflitantes: [] });
  }

  async function confirmarSemReplicar() {
    if (!fluxoProvisao) return;
    await salvarProvisaoUnica(fluxoProvisao.categoriaId, fluxoProvisao.valor);
    setFluxoProvisao(null);
  }

  async function avancarParaChecagem() {
    if (!fluxoProvisao) return;
    setSalvandoProvisao(true);
    try {
      const mesesAlvo = Array.from({ length: fluxoProvisao.quantidadeMeses }, (_, i) => mesAdjacente(mes, i + 1));
      const res = await apiFetch(`/api/orcamento/provisoes?categoriaId=${fluxoProvisao.categoriaId}&meses=${mesesAlvo.join(",")}`);
      const existentes = res.ok ? await res.json() : {};
      const conflitantes = mesesAlvo.filter((m) => existentes[m] != null);
      if (conflitantes.length > 0) {
        setFluxoProvisao((f) => (f ? { ...f, etapa: "sobrescrever", mesesConflitantes: conflitantes } : f));
      } else {
        await aplicarReplicacao(mesesAlvo, false);
      }
    } finally {
      setSalvandoProvisao(false);
    }
  }

  async function aplicarReplicacao(mesesAlvo: string[], sobrescrever: boolean) {
    if (!fluxoProvisao) return;
    setSalvandoProvisao(true);
    try {
      const res = await apiFetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alvoTipo: "CATEGORIA",
          alvoChave: fluxoProvisao.categoriaId,
          categoriaId: fluxoProvisao.categoriaId,
          mes,
          valor: fluxoProvisao.valor,
          mesesAdicionais: mesesAlvo,
          sobrescrever,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const aplicados = 1 + (data.aplicadosExtras ?? 0);
      const ignorados = data.ignoradosExtras ?? 0;
      setResultadoProvisao(`Provisão salva em ${aplicados} mês${aplicados !== 1 ? "es" : ""}${ignorados > 0 ? `, ${ignorados} mantido${ignorados !== 1 ? "s" : ""} sem alteração` : ""}.`);
      setFluxoProvisao(null);
      carregar();
    } finally {
      setSalvandoProvisao(false);
    }
  }

  const blocosDe = (t: Totalizador) => dados?.blocos.filter((b) => b.totalizador === t) ?? [];

  function categoriasDosBlocos(blocoIds: string[]): OrcamentoCategoria[] {
    return (dados?.blocos ?? []).filter((b) => blocoIds.includes(b.blocoId)).flatMap((b) => b.categorias);
  }

  const editavelProvisao = centroCustoTipo === "GERAL";

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-1.5">
        <SeletorMes mes={mes} onChange={setMes} />
        {mes !== mesAtualSP() && (
          <button onClick={() => setMes(mesAtualSP())} className="text-xs text-blue-700 font-medium hover:underline">
            hoje
          </button>
        )}
      </div>

      {/* Geral / Empreendimento / Unidade (mesmo padrão da tela DRE) */}
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

      <p className="text-xs text-gray-500">
        Os valores abaixo são a PROJEÇÃO de fechamento do mês (realizado + previstos pendentes + provisão restante). Abra uma categoria pra ver o detalhe.
      </p>

      {resultadoProvisao && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{resultadoProvisao}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : !dados ? (
        <p className="text-red-600 text-sm">Erro ao carregar o orçamento.</p>
      ) : (
        <div className="space-y-0.5">
          {blocosDe("MARGEM_BRUTA").map((b) => (
            <LinhaGrupo
              key={b.blocoId}
              nome={b.nome}
              valor={b.projetadoRS}
              categorias={b.categorias}
              onIniciarFluxoProvisao={iniciarFluxoProvisao}
              editavelProvisao={editavelProvisao}
            />
          ))}
          <LinhaTotal rotulo="Margem Bruta" valor={dados.margemBrutaProjetadoRS} percent={dados.margemBrutaProjetadoPercent} />

          <LinhaGrupo
            nome="Despesas"
            valor={dados.despesasProjetadoRS}
            categorias={categoriasDosBlocos(blocosDe("DESPESAS").map((b) => b.blocoId))}
            onIniciarFluxoProvisao={iniciarFluxoProvisao}
            editavelProvisao={editavelProvisao}
          />

          <LinhaTotal rotulo="Geração de Caixa (Lucro Operacional)" valor={dados.geracaoDeCaixaProjetadoRS} />

          <LinhaGrupo
            nome="Resultados Extras"
            valor={String(blocosDe("LUCRO_PREJUIZO_EXTRA").reduce((acc, b) => acc + Number(b.projetadoRS), 0))}
            categorias={categoriasDosBlocos(blocosDe("LUCRO_PREJUIZO_EXTRA").map((b) => b.blocoId))}
            onIniciarFluxoProvisao={iniciarFluxoProvisao}
            editavelProvisao={editavelProvisao}
          />

          <LinhaTotal rotulo="Lucro / Prejuízo" valor={dados.lucroPrejuizoProjetadoRS} />
        </div>
      )}

      {fluxoProvisao && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm">Provisão — {fluxoProvisao.categoriaNome}</h2>
              <button onClick={() => setFluxoProvisao(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {fluxoProvisao.etapa === "replicar" && (
              <>
                <p className="text-sm text-gray-600">
                  Valor definido: <span className="font-semibold text-gray-900">{formatBRL(fluxoProvisao.valor)}</span> em {labelMesCurto(mes)}. Deseja
                  replicar esse valor pros meses seguintes também?
                </p>
                <div className="flex gap-2">
                  <button onClick={confirmarSemReplicar} disabled={salvandoProvisao} className="btn-secondary flex-1 text-sm">
                    Só este mês
                  </button>
                  <button
                    onClick={() => setFluxoProvisao((f) => (f ? { ...f, etapa: "quantidade" } : f))}
                    disabled={salvandoProvisao}
                    className="btn-primary flex-1 text-sm"
                  >
                    Sim, replicar
                  </button>
                </div>
              </>
            )}

            {fluxoProvisao.etapa === "quantidade" && (
              <>
                <div>
                  <label className="label">Quantos meses à frente?</label>
                  <input
                    type="number"
                    min={1}
                    max={36}
                    className="input"
                    value={fluxoProvisao.quantidadeMeses}
                    onChange={(e) => setFluxoProvisao((f) => (f ? { ...f, quantidadeMeses: Math.max(1, Math.min(36, Number(e.target.value) || 1)) } : f))}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Replica {formatBRL(fluxoProvisao.valor)} de {labelMesCurto(mesAdjacente(mes, 1))} até{" "}
                    {labelMesCurto(mesAdjacente(mes, fluxoProvisao.quantidadeMeses))}.
                  </p>
                </div>
                <button onClick={avancarParaChecagem} disabled={salvandoProvisao} className="btn-primary w-full text-sm">
                  {salvandoProvisao ? "Verificando..." : "Continuar"}
                </button>
              </>
            )}

            {fluxoProvisao.etapa === "sobrescrever" && (
              <>
                <p className="text-sm text-gray-600">
                  Já existe provisão configurada em {fluxoProvisao.mesesConflitantes.length} mês{fluxoProvisao.mesesConflitantes.length !== 1 ? "es" : ""}:{" "}
                  <span className="font-medium text-gray-900">{fluxoProvisao.mesesConflitantes.map(labelMesCurto).join(", ")}</span>. Sobrescrever com{" "}
                  {formatBRL(fluxoProvisao.valor)}?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => aplicarReplicacao(Array.from({ length: fluxoProvisao.quantidadeMeses }, (_, i) => mesAdjacente(mes, i + 1)), false)}
                    disabled={salvandoProvisao}
                    className="btn-secondary flex-1 text-sm"
                  >
                    Manter os existentes
                  </button>
                  <button
                    onClick={() => aplicarReplicacao(Array.from({ length: fluxoProvisao.quantidadeMeses }, (_, i) => mesAdjacente(mes, i + 1)), true)}
                    disabled={salvandoProvisao}
                    className="btn-primary flex-1 text-sm"
                  >
                    {salvandoProvisao ? "Salvando..." : "Sobrescrever"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
