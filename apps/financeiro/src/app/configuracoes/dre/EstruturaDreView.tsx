"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Plus, Trash2, Minus } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Subtela de Configurações > Estrutura da DRE — pedido do Felipe,
// 05/08/2026: "essa estrutura de DRE - categorias, super-categorias e
// relações de soma e subtração devem ser customizáveis... criar, editar,
// mover e subtrair todos os campos". Os 4 totais finais da DRE (Margem
// Bruta / Despesas / Geração de Caixa / Lucro-Prejuízo) continuam com esses
// nomes fixos — decisão explícita dele — mas a COMPOSIÇÃO é 100% editável
// aqui: quais blocos (super-categorias) entram em cada total, com que
// sinal, e quais categorias vivem em cada bloco.
//
// Movida pra sua própria subtela em 05/08/2026 (2ª rodada) — antes vivia
// direto em /configuracoes junto com o card de Cartões de Crédito, o que
// dava a impressão errada de que cartões faziam parte da estrutura da DRE.
// São telas de configuração distintas.

type Totalizador = "MARGEM_BRUTA" | "DESPESAS" | "LUCRO_PREJUIZO_EXTRA";

const TOTALIZADORES: { chave: Totalizador; titulo: string; formula: string }[] = [
  { chave: "MARGEM_BRUTA", titulo: "Margem Bruta", formula: "Soma dos blocos abaixo = Margem Bruta" },
  { chave: "DESPESAS", titulo: "Despesas", formula: "Soma dos blocos abaixo = Despesas. Geração de Caixa = Margem Bruta + Despesas." },
  { chave: "LUCRO_PREJUIZO_EXTRA", titulo: "Lucro / Prejuízo — entram direto, após Geração de Caixa", formula: "Soma dos blocos abaixo, somada à Geração de Caixa, fecha o Lucro/Prejuízo." },
];

type Bloco = { id: string; nome: string; ordem: number; totalizador: Totalizador; sinal: number; totalCategorias: number };
type Categoria = { id: string; nome: string; tipo: "RECEITA" | "DESPESA"; blocoId: string; ordem: number; ativo: boolean };

function NomeEditavel({ valor, onSalvar, className }: { valor: string; onSalvar: (v: string) => void; className?: string }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <input
      className={className ?? "text-sm font-medium text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none px-0.5 py-0.5 min-w-0"}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v.trim() !== valor && onSalvar(v.trim())}
    />
  );
}

export function EstruturaDreView() {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [novoBlocoNome, setNovoBlocoNome] = useState<Record<Totalizador, string>>({ MARGEM_BRUTA: "", DESPESAS: "", LUCRO_PREJUIZO_EXTRA: "" });
  const [novaCategoria, setNovaCategoria] = useState<Record<string, { nome: string; tipo: "RECEITA" | "DESPESA" }>>({});
  const [erro, setErro] = useState("");

  async function carregar() {
    setLoading(true);
    const [resB, resC] = await Promise.all([apiFetch("/api/blocos"), apiFetch("/api/categorias?todas=1")]);
    if (resB.ok) setBlocos(await resB.json());
    if (resC.ok) setCategorias(await resC.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function toggleAberto(id: string) {
    setAbertos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function patchBloco(id: string, data: Record<string, unknown>) {
    setErro("");
    const res = await apiFetch("/api/blocos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao salvar bloco.");
    }
    await carregar();
  }

  async function patchCategoria(id: string, data: Record<string, unknown>) {
    setErro("");
    const res = await apiFetch("/api/categorias", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...data }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao salvar categoria.");
    }
    await carregar();
  }

  async function criarBloco(totalizador: Totalizador) {
    const nome = novoBlocoNome[totalizador].trim();
    if (!nome) return;
    const maxOrdem = Math.max(0, ...blocos.filter((b) => b.totalizador === totalizador).map((b) => b.ordem));
    setErro("");
    const res = await apiFetch("/api/blocos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, totalizador, sinal: 1, ordem: maxOrdem + 1 }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao criar bloco.");
      return;
    }
    setNovoBlocoNome((prev) => ({ ...prev, [totalizador]: "" }));
    await carregar();
  }

  async function apagarBloco(bloco: Bloco) {
    if (bloco.totalCategorias > 0) return;
    if (!confirm(`Apagar o bloco "${bloco.nome}"?`)) return;
    setErro("");
    const res = await apiFetch(`/api/blocos?id=${bloco.id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao apagar bloco.");
    }
    await carregar();
  }

  async function moverBloco(bloco: Bloco, direcao: -1 | 1) {
    const doMesmoTotalizador = blocos.filter((b) => b.totalizador === bloco.totalizador).sort((a, b) => a.ordem - b.ordem);
    const idx = doMesmoTotalizador.findIndex((b) => b.id === bloco.id);
    const alvo = doMesmoTotalizador[idx + direcao];
    if (!alvo) return;
    await Promise.all([patchBloco(bloco.id, { ordem: alvo.ordem }), patchBloco(alvo.id, { ordem: bloco.ordem })]);
  }

  async function moverCategoria(cat: Categoria, direcao: -1 | 1) {
    const doMesmoBloco = categorias.filter((c) => c.blocoId === cat.blocoId).sort((a, b) => a.ordem - b.ordem);
    const idx = doMesmoBloco.findIndex((c) => c.id === cat.id);
    const alvo = doMesmoBloco[idx + direcao];
    if (!alvo) return;
    await Promise.all([patchCategoria(cat.id, { ordem: alvo.ordem }), patchCategoria(alvo.id, { ordem: cat.ordem })]);
  }

  async function criarCategoria(bloco: Bloco) {
    const rascunho = novaCategoria[bloco.id];
    if (!rascunho?.nome.trim()) return;
    const maxOrdem = Math.max(0, ...categorias.filter((c) => c.blocoId === bloco.id).map((c) => c.ordem));
    setErro("");
    const res = await apiFetch("/api/categorias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: rascunho.nome.trim(), tipo: rascunho.tipo, blocoId: bloco.id, ordem: maxOrdem + 1 }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro(d.error || "Erro ao criar categoria.");
      return;
    }
    setNovaCategoria((prev) => ({ ...prev, [bloco.id]: { nome: "", tipo: "DESPESA" } }));
    await carregar();
  }

  return (
    <div className="space-y-6">
      <Link href="/configuracoes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 w-fit">
        <ArrowLeft className="w-4 h-4" /> Configurações
      </Link>

      <div>
        <h1 className="text-lg font-bold text-gray-900">Estrutura da DRE</h1>
        <p className="text-sm text-gray-500 mt-1">
          Os 4 totais (Margem Bruta, Despesas, Geração de Caixa, Lucro/Prejuízo) são fixos. O que você controla aqui é a composição: quais
          blocos entram em cada total, se somam ou subtraem, e quais categorias vivem em cada bloco.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <>
          {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

          {TOTALIZADORES.map(({ chave, titulo, formula }) => {
            const blocosDoTotalizador = blocos.filter((b) => b.totalizador === chave).sort((a, b) => a.ordem - b.ordem);
            return (
              <div key={chave} className="space-y-2">
                <div>
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{titulo}</h2>
                  <p className="text-xs text-gray-400">{formula}</p>
                </div>

                {blocosDoTotalizador.map((bloco, idx) => {
                  const categoriasDoBloco = categorias.filter((c) => c.blocoId === bloco.id).sort((a, b) => a.ordem - b.ordem);
                  const aberto = abertos.has(bloco.id);
                  const rascunho = novaCategoria[bloco.id] ?? { nome: "", tipo: "DESPESA" as const };
                  return (
                    <div key={bloco.id} className="card">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col flex-shrink-0">
                          <button onClick={() => moverBloco(bloco, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-700 disabled:opacity-30" title="Mover pra cima">
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moverBloco(bloco, 1)} disabled={idx === blocosDoTotalizador.length - 1} className="text-gray-300 hover:text-gray-700 disabled:opacity-30" title="Mover pra baixo">
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button onClick={() => toggleAberto(bloco.id)} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                          {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        <NomeEditavel valor={bloco.nome} onSalvar={(v) => patchBloco(bloco.id, { nome: v })} className="text-sm font-semibold text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none px-0.5 py-0.5 flex-1 min-w-0" />

                        <button
                          onClick={() => patchBloco(bloco.id, { sinal: bloco.sinal === 1 ? -1 : 1 })}
                          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${bloco.sinal === 1 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                          title="Alternar entre somar e subtrair"
                        >
                          {bloco.sinal === 1 ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {bloco.sinal === 1 ? "soma" : "subtrai"}
                        </button>

                        <select
                          value={bloco.totalizador}
                          onChange={(e) => patchBloco(bloco.id, { totalizador: e.target.value })}
                          className="text-xs border border-gray-300 rounded-lg px-1.5 py-1 flex-shrink-0"
                          title="Mover pra outro total"
                        >
                          {TOTALIZADORES.map((t) => (
                            <option key={t.chave} value={t.chave}>
                              {t.titulo.split(" —")[0]}
                            </option>
                          ))}
                        </select>

                        <button
                          onClick={() => apagarBloco(bloco)}
                          disabled={bloco.totalCategorias > 0}
                          className="text-gray-300 hover:text-red-600 disabled:opacity-30 flex-shrink-0"
                          title={bloco.totalCategorias > 0 ? `Mova as ${bloco.totalCategorias} categoria(s) antes de apagar` : "Apagar bloco"}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {aberto && (
                        <div className="mt-3 pt-3 border-t border-gray-100 pl-9 space-y-1.5">
                          {categoriasDoBloco.map((cat, cidx) => (
                            <div key={cat.id} className={`flex items-center gap-2 ${!cat.ativo ? "opacity-40" : ""}`}>
                              <div className="flex flex-col flex-shrink-0">
                                <button onClick={() => moverCategoria(cat, -1)} disabled={cidx === 0} className="text-gray-300 hover:text-gray-700 disabled:opacity-30">
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button onClick={() => moverCategoria(cat, 1)} disabled={cidx === categoriasDoBloco.length - 1} className="text-gray-300 hover:text-gray-700 disabled:opacity-30">
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>
                              <NomeEditavel valor={cat.nome} onSalvar={(v) => patchCategoria(cat.id, { nome: v })} className="text-sm text-gray-700 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none px-0.5 py-0.5 flex-1 min-w-0" />
                              <button
                                onClick={() => patchCategoria(cat.id, { tipo: cat.tipo === "RECEITA" ? "DESPESA" : "RECEITA" })}
                                className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cat.tipo === "RECEITA" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                              >
                                {cat.tipo === "RECEITA" ? "receita" : "despesa"}
                              </button>
                              <select
                                value={cat.blocoId}
                                onChange={(e) => patchCategoria(cat.id, { blocoId: e.target.value })}
                                className="text-xs border border-gray-300 rounded-lg px-1.5 py-0.5 flex-shrink-0 max-w-[9rem]"
                                title="Mover pra outro bloco"
                              >
                                {blocos.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.nome}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => patchCategoria(cat.id, { ativo: !cat.ativo })}
                                className="text-[11px] text-gray-400 hover:text-gray-700 flex-shrink-0"
                                title={cat.ativo ? "Desativar (sai do seletor, mantém histórico)" : "Reativar"}
                              >
                                {cat.ativo ? "desativar" : "reativar"}
                              </button>
                            </div>
                          ))}

                          <div className="flex items-center gap-2 pt-1">
                            <input
                              className="input text-sm py-1 flex-1"
                              placeholder="Nova categoria..."
                              value={rascunho.nome}
                              onChange={(e) => setNovaCategoria((prev) => ({ ...prev, [bloco.id]: { ...rascunho, nome: e.target.value } }))}
                              onKeyDown={(e) => e.key === "Enter" && criarCategoria(bloco)}
                            />
                            <select
                              value={rascunho.tipo}
                              onChange={(e) => setNovaCategoria((prev) => ({ ...prev, [bloco.id]: { ...rascunho, tipo: e.target.value as "RECEITA" | "DESPESA" } }))}
                              className="text-xs border border-gray-300 rounded-lg px-1.5 py-1.5 flex-shrink-0"
                            >
                              <option value="DESPESA">despesa</option>
                              <option value="RECEITA">receita</option>
                            </select>
                            <button onClick={() => criarCategoria(bloco)} className="btn-secondary text-xs px-2 py-1.5 flex-shrink-0">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-2 pl-1">
                  <input
                    className="input text-sm py-1.5 flex-1 max-w-xs"
                    placeholder="Novo bloco..."
                    value={novoBlocoNome[chave]}
                    onChange={(e) => setNovoBlocoNome((prev) => ({ ...prev, [chave]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && criarBloco(chave)}
                  />
                  <button onClick={() => criarBloco(chave)} className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Bloco
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
