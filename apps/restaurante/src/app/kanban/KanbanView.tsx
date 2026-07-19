"use client";
import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Clock, MessageSquare, BedDouble, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Pedido = {
  id: string;
  clienteNome: string;
  uhNumero: string;
  tipo: "SINGLE" | "DOUBLE";
  status: "RECEBIDO" | "PREPARACAO" | "ENTREGA" | "FINALIZADO";
  observacoes: string | null;
  horarioEntrega: string | null;
  itens: { id: string; quantidade: number; menuItem: { nome: string; section: { nome: string } } }[];
};

const COLUNAS: { status: Pedido["status"]; titulo: string; cor: string; corHeader: string }[] = [
  { status: "RECEBIDO", titulo: "Pedido recebido", cor: "border-t-blue-400", corHeader: "text-blue-700" },
  { status: "PREPARACAO", titulo: "Em Preparação", cor: "border-t-amber-400", corHeader: "text-amber-700" },
  { status: "ENTREGA", titulo: "Em entrega", cor: "border-t-purple-400", corHeader: "text-purple-700" },
  { status: "FINALIZADO", titulo: "Finalizado", cor: "border-t-green-400", corHeader: "text-green-700" },
];

const ORDEM: Pedido["status"][] = ["RECEBIDO", "PREPARACAO", "ENTREGA", "FINALIZADO"];

export function KanbanView() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await apiFetch("/api/pedidos?escopo=kanban");
    if (res.ok) setPedidos(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 30_000); // cozinha deixa a tela aberta
    return () => clearInterval(id);
  }, [carregar]);

  async function mover(pedido: Pedido, direcao: 1 | -1) {
    const idx = ORDEM.indexOf(pedido.status);
    const novo = ORDEM[idx + direcao];
    if (!novo) return;
    // A baixa de estoque acontece ao FINALIZAR — confirmação explícita.
    if (novo === "FINALIZADO" && !confirm(`Finalizar entrega da UH ${pedido.uhNumero}? Isso dá baixa no estoque dos itens.`)) return;
    setMovendo(pedido.id);
    setErro(null);
    const res = await apiFetch("/api/pedidos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pedido.id, status: novo }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error || `Erro ${res.status}`);
    }
    setMovendo(null);
    carregar();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pedidos do dia</h1>
          <p className="text-sm text-gray-500">Cafés da manhã confirmados pelos hóspedes</p>
        </div>
        <button onClick={() => { setLoading(true); carregar(); }} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{erro}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUNAS.map((col) => {
            const doStatus = pedidos.filter((p) => p.status === col.status);
            return (
              <div key={col.status} className={`bg-gray-100/70 rounded-xl border-t-4 ${col.cor} p-3 min-h-[120px]`}>
                <div className="flex items-baseline justify-between mb-3 px-1">
                  <h2 className={`text-sm font-bold uppercase tracking-wide ${col.corHeader}`}>{col.titulo}</h2>
                  <span className="text-xs font-semibold text-gray-400">{doStatus.length}</span>
                </div>
                <div className="space-y-2.5">
                  {doStatus.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-4">Nenhum pedido</p>
                  )}
                  {doStatus.map((p) => {
                    const idx = ORDEM.indexOf(p.status);
                    return (
                      <div key={p.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-gray-900 truncate">{p.clienteNome}</p>
                          {p.horarioEntrega && (
                            <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 flex-shrink-0">
                              <Clock className="w-3 h-3" /> {p.horarioEntrega}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <BedDouble className="w-3 h-3" /> UH {p.uhNumero} · {p.tipo === "DOUBLE" ? "Double" : "Single"}
                        </p>
                        <ul className="mt-2 space-y-0.5">
                          {p.itens.map((i) => (
                            <li key={i.id} className="text-xs text-gray-700 flex justify-between gap-2">
                              <span className="truncate">{i.menuItem.nome}</span>
                              <span className="font-semibold flex-shrink-0">×{i.quantidade}</span>
                            </li>
                          ))}
                        </ul>
                        {p.observacoes && (
                          <p className="mt-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded px-2 py-1 flex items-start gap-1">
                            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" /> {p.observacoes}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                          <button
                            onClick={() => mover(p, -1)}
                            disabled={idx === 0 || movendo === p.id || p.status === "FINALIZADO"}
                            className="flex items-center gap-0.5 text-xs font-medium text-gray-400 hover:text-gray-700 disabled:opacity-0 py-1 px-1.5"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                          </button>
                          {idx < ORDEM.length - 1 && (
                            <button
                              onClick={() => mover(p, 1)}
                              disabled={movendo === p.id}
                              className={`flex items-center gap-0.5 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors disabled:opacity-50 ${
                                ORDEM[idx + 1] === "FINALIZADO"
                                  ? "bg-green-600 text-white hover:bg-green-700"
                                  : "bg-amber-600 text-white hover:bg-amber-700"
                              }`}
                            >
                              {movendo === p.id ? "..." : ORDEM[idx + 1] === "FINALIZADO" ? "Finalizar" : "Avançar"}
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
