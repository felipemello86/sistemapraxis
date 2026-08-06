"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ChevronDown, ChevronRight, Check, Plus, EyeOff, Eye, X, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Cadastro de Empreendimentos e Unidades — pedido do Felipe, 05/08/2026:
// hierarquia Administração -> Empreendimento (= "Administração Local", ex.:
// prédio "Vicentina") -> Unidade (ex.: 101, 201, 203 dentro de Vicentina).
// Esse catálogo alimenta o seletor de Centro de Custo em Lançamentos e o
// seletor Empreendimento/Unidade na DRE — e o NÚMERO DE UNIDADES ATIVAS é o
// denominador do rateio de custos de Administração/Empreendimento (ver
// lib/finance/centro-de-custo.ts): desativar uma unidade aqui muda o rateio
// de toda a DRE na hora.

type Empreendimento = { id: string; nome: string; ativo: boolean; totalUnidades: number; totalUnidadesAtivas: number };
type Unidade = { id: string; nome: string; ativo: boolean; desativadaEm: string | null; empreendimentoId: string; empreendimento: string };

function mesAtualLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

function labelMesAno(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${m}/${ano}`;
}

function NomeEditavel({ valorInicial, onSalvar, className }: { valorInicial: string; onSalvar: (v: string) => void; className?: string }) {
  const [valor, setValor] = useState(valorInicial);
  const [salvo, setSalvo] = useState(false);
  useEffect(() => setValor(valorInicial), [valorInicial]);

  return (
    <div className="relative flex-1 min-w-0">
      <input
        className={className ?? "text-sm font-medium text-gray-900 bg-transparent border-0 focus:outline-none focus:bg-gray-50 rounded px-1 -mx-1 w-full"}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => {
          const v = valor.trim();
          if (v && v !== valorInicial) {
            onSalvar(v);
            setSalvo(true);
            setTimeout(() => setSalvo(false), 1500);
          } else {
            setValor(valorInicial);
          }
        }}
      />
      {salvo && <Check className="w-3.5 h-3.5 text-green-600 absolute right-1 top-1/2 -translate-y-1/2" />}
    </div>
  );
}

export function CentrosDeCustoView() {
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [novoEmpreendimento, setNovoEmpreendimento] = useState("");
  const [novaUnidadePorEmpreendimento, setNovaUnidadePorEmpreendimento] = useState<Record<string, string>>({});
  // Desativar uma Unidade exige escolher o mês/ano de corte (pedido do
  // Felipe, 05/08/2026, 2ª rodada) — o rateio continua contando ela até
  // esse mês (inclusive), só some do denominador a partir do mês seguinte.
  const [desativando, setDesativando] = useState<Unidade | null>(null);
  const [mesDesativacao, setMesDesativacao] = useState(mesAtualLocal());
  // Excluir (pedido do Felipe, 05/08/2026, 3ª rodada) — diferente de
  // desativar: apaga o cadastro de vez, não tem mês de corte, e o rateio de
  // TODOS os meses (passados e futuros) já sai recalculado com a nova
  // proporção. Sempre passa por essa confirmação, que explica a diferença.
  const [excluindo, setExcluindo] = useState<{ tipo: "empreendimento" | "unidade"; id: string; nome: string } | null>(null);

  async function carregar() {
    setLoading(true);
    const [resE, resU] = await Promise.all([apiFetch("/api/empreendimentos?todas=1"), apiFetch("/api/unidades?todas=1")]);
    if (resE.ok) setEmpreendimentos(await resE.json());
    if (resU.ok) setUnidades(await resU.json());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const unidadesPorEmpreendimento = useMemo(() => {
    const m = new Map<string, Unidade[]>();
    for (const u of unidades) m.set(u.empreendimentoId, [...(m.get(u.empreendimentoId) ?? []), u]);
    return m;
  }, [unidades]);

  function toggleExpandido(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function criarEmpreendimento() {
    if (!novoEmpreendimento.trim()) return;
    const res = await apiFetch("/api/empreendimentos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novoEmpreendimento.trim() }) });
    if (res.ok) {
      setNovoEmpreendimento("");
      carregar();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao criar empreendimento.");
    }
  }

  async function renomearEmpreendimento(id: string, nome: string) {
    await apiFetch("/api/empreendimentos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, nome }) });
    carregar();
  }

  async function toggleAtivoEmpreendimento(e: Empreendimento) {
    if (e.ativo && !confirm(`Desativar "${e.nome}"? As unidades dele também saem do rateio, mas o histórico de lançamentos é mantido.`)) return;
    await apiFetch("/api/empreendimentos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, ativo: !e.ativo }) });
    carregar();
  }

  async function criarUnidade(empreendimentoId: string) {
    const nome = (novaUnidadePorEmpreendimento[empreendimentoId] || "").trim();
    if (!nome) return;
    const res = await apiFetch("/api/unidades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, empreendimentoId }) });
    if (res.ok) {
      setNovaUnidadePorEmpreendimento((prev) => ({ ...prev, [empreendimentoId]: "" }));
      carregar();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao criar unidade.");
    }
  }

  async function renomearUnidade(id: string, nome: string) {
    await apiFetch("/api/unidades", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, nome }) });
    carregar();
  }

  async function toggleAtivoUnidade(u: Unidade) {
    if (u.ativo) {
      // Desativar exige mês/ano de corte — abre o modal em vez de desativar direto.
      setMesDesativacao(mesAtualLocal());
      setDesativando(u);
      return;
    }
    // Reativar não precisa de mês: volta a contar em todos os meses.
    await apiFetch("/api/unidades", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ativo: true }) });
    carregar();
  }

  async function confirmarDesativacao() {
    if (!desativando) return;
    const res = await apiFetch("/api/unidades", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: desativando.id, ativo: false, desativadaEm: mesDesativacao }),
    });
    if (res.ok) {
      setDesativando(null);
      carregar();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao desativar unidade.");
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    const url = excluindo.tipo === "empreendimento" ? `/api/empreendimentos?id=${excluindo.id}` : `/api/unidades?id=${excluindo.id}`;
    const res = await apiFetch(url, { method: "DELETE" });
    if (res.ok) {
      setExcluindo(null);
      carregar();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao excluir.");
    }
  }

  const totalUnidadesAtivas = empreendimentos.reduce((acc, e) => acc + e.totalUnidadesAtivas, 0);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 w-fit">
        <ArrowLeft className="w-4 h-4" /> Configurações
      </Link>

      <div>
        <h1 className="text-lg font-bold text-gray-900">Centros de Custo</h1>
        <p className="text-sm text-gray-500 mt-1">
          Empreendimentos (prédios) e suas Unidades. Um lançamento sem Empreendimento/Unidade é "Administração" e é rateado igualmente entre TODAS
          as {totalUnidadesAtivas} unidade{totalUnidadesAtivas !== 1 ? "s" : ""} ativas; um lançamento num Empreendimento é rateado só entre as
          unidades dele. Desativar uma unidade tira ela do rateio (mas mantém o histórico).
        </p>
      </div>

      <div className="card flex items-center gap-2">
        <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          className="input text-sm py-1.5 flex-1"
          placeholder="Novo empreendimento (ex.: Vicentina)"
          value={novoEmpreendimento}
          onChange={(e) => setNovoEmpreendimento(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criarEmpreendimento()}
        />
        <button onClick={criarEmpreendimento} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 flex-shrink-0">
          <Plus className="w-3.5 h-3.5" /> Adicionar
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : empreendimentos.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum empreendimento cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {empreendimentos.map((e) => {
            const unidadesDoEmpreendimento = unidadesPorEmpreendimento.get(e.id) ?? [];
            const aberto = expandidos.has(e.id);
            return (
              <div key={e.id} className={`card !p-0 overflow-hidden ${!e.ativo ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button onClick={() => toggleExpandido(e.id)} className="text-gray-400 hover:text-gray-900 flex-shrink-0">
                    {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <NomeEditavel valorInicial={e.nome} onSalvar={(nome) => renomearEmpreendimento(e.id, nome)} />
                  <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                    {e.totalUnidadesAtivas} unidade{e.totalUnidadesAtivas !== 1 ? "s" : ""} ativa{e.totalUnidadesAtivas !== 1 ? "s" : ""}
                    {e.totalUnidades !== e.totalUnidadesAtivas ? ` (${e.totalUnidades} no total)` : ""}
                  </span>
                  <button onClick={() => toggleAtivoEmpreendimento(e)} className="text-gray-300 hover:text-gray-700 flex-shrink-0" title={e.ativo ? "Desativar" : "Reativar"}>
                    {e.ativo ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setExcluindo({ tipo: "empreendimento", id: e.id, nome: e.nome })}
                    className="text-gray-300 hover:text-red-600 flex-shrink-0"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {aberto && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2 space-y-1">
                    {unidadesDoEmpreendimento.length === 0 ? (
                      <p className="text-xs text-gray-400 py-1 pl-6">Nenhuma unidade cadastrada.</p>
                    ) : (
                      unidadesDoEmpreendimento.map((u) => (
                        <div key={u.id} className={`flex items-center gap-2 pl-6 py-1 ${!u.ativo ? "opacity-50" : ""}`}>
                          <NomeEditavel valorInicial={u.nome} onSalvar={(nome) => renomearUnidade(u.id, nome)} className="text-sm text-gray-700 bg-transparent border-0 focus:outline-none focus:bg-white rounded px-1 -mx-1 w-full" />
                          {!u.ativo && u.desativadaEm && (
                            <span className="text-[11px] text-gray-400 flex-shrink-0 whitespace-nowrap">rateio até {labelMesAno(u.desativadaEm)}</span>
                          )}
                          <button onClick={() => toggleAtivoUnidade(u)} className="text-gray-300 hover:text-gray-700 flex-shrink-0" title={u.ativo ? "Desativar" : "Reativar"}>
                            {u.ativo ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setExcluindo({ tipo: "unidade", id: u.id, nome: u.nome })}
                            className="text-gray-300 hover:text-red-600 flex-shrink-0"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                    <div className="flex items-center gap-2 pl-6 pt-1">
                      <input
                        className="input text-xs py-1 flex-1"
                        placeholder="Nova unidade (ex.: 101)"
                        value={novaUnidadePorEmpreendimento[e.id] || ""}
                        onChange={(ev) => setNovaUnidadePorEmpreendimento((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                        onKeyDown={(ev) => ev.key === "Enter" && criarUnidade(e.id)}
                      />
                      <button onClick={() => criarUnidade(e.id)} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1 flex-shrink-0">
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {desativando && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Desativar "{desativando.nome}"</h2>
              <button onClick={() => setDesativando(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              A partir de qual mês o rateio deve PARAR de contar essa unidade? O próprio mês escolhido ainda conta — só o mês seguinte já exclui.
              Meses anteriores continuam contando ela normalmente na DRE.
            </p>
            <div>
              <label className="label">Mês de desativação</label>
              <input type="month" className="input" value={mesDesativacao} onChange={(e) => setMesDesativacao(e.target.value)} />
            </div>
            <button onClick={confirmarDesativacao} className="btn-danger w-full">
              Desativar a partir de {labelMesAno(mesDesativacao)}
            </button>
          </div>
        </div>
      )}

      {excluindo && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">
                Excluir {excluindo.tipo === "empreendimento" ? "empreendimento" : "unidade"} "{excluindo.nome}"?
              </h2>
              <button onClick={() => setExcluindo(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <span className="font-semibold text-gray-800">Desativar</span> só oculta {excluindo.tipo === "empreendimento" ? "o empreendimento" : "a unidade"} a
                partir de um mês escolhido, mas mantém o cadastro e o histórico — dá pra reativar depois.
              </p>
              <p>
                <span className="font-semibold text-red-700">Excluir</span> apaga o cadastro definitivamente. Não tem volta.{" "}
                {excluindo.tipo === "unidade"
                  ? "Lançamentos que estavam nessa unidade passam a contar como \"Administração\", e o rateio de TODOS os meses (passados e futuros) já sai recalculado com a nova proporção — sem o mês de graça que a desativação tem."
                  : "Só é possível excluir um empreendimento sem nenhuma unidade cadastrada nele. Lançamentos marcados direto nesse empreendimento passam a contar como \"Administração\", e o rateio de TODOS os meses já sai recalculado."}
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setExcluindo(null)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={confirmarExclusao} className="btn-danger flex-1">
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
