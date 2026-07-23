"use client";
import { useState, useEffect, useCallback } from "react";
import { Building2, Camera, Loader2, Check, X } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Kanban "Falhas Gerenciais" — 2 colunas (Pendências / Resolvido). Os cards
// nascem automaticamente quando a Governanta marca como FALHA um item de
// natureza GERENCIAL numa inspeção (ver PATCH /api/inspecoes, ação
// avaliar_item, e packages/core, model HkManagerialFailureCard). Esta tela
// só lista e resolve — pedido explícito do Felipe: descrição da correção
// obrigatória, fotos opcionais.

type Card = {
  id: string;
  uhId: string;
  uhNumero: string;
  itemNome: string;
  descricao: string;
  status: "PENDENTE" | "RESOLVIDO";
  resolvedDescricao: string | null;
  resolvedPhotos: string[];
  resolvedAt: string | null;
  resolvedByNome: string | null;
  createdAt: string;
};

const MAX_FOTOS = 4;

function formatarData(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function FalhasGerenciaisView({ podeOperar }: { podeOperar: boolean }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvendo, setResolvendo] = useState<Card | null>(null);
  const [descricaoResolucao, setDescricaoResolucao] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const data = await apiFetch("/api/falhas-gerenciais").then((r) => r.json());
    setCards(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirResolucao(card: Card) {
    setResolvendo(card);
    setDescricaoResolucao("");
    setFotos([]);
    setErro(null);
  }

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || fotos.length >= MAX_FOTOS) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("pasta", "falhas-gerenciais");
      fd.append("tipo", "resolucao");
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Falha no upload.");
      const data = await res.json();
      setFotos((f) => [...f, data.url as string]);
    } catch {
      setErro("Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  }

  async function confirmarResolucao() {
    if (!resolvendo || descricaoResolucao.trim().length < 5) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await apiFetch("/api/falhas-gerenciais", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolver",
          cardId: resolvendo.id,
          resolvedDescricao: descricaoResolucao.trim(),
          resolvedPhotos: fotos,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      setResolvendo(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao resolver.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Carregando...</div>;
  }

  const pendentes = cards.filter((c) => c.status === "PENDENTE");
  const resolvidos = cards.filter((c) => c.status === "RESOLVIDO");

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-6 h-6 text-orange-600" />
        <h1 className="text-xl font-bold text-gray-900">Falhas Gerenciais</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Não conformidades de natureza gerencial identificadas nas inspeções — não pesam no score das camareiras.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-700">Pendências</h2>
            <span className="text-xs text-gray-400">({pendentes.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {pendentes.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Nenhuma falha gerencial pendente.</p>
            ) : (
              pendentes.map((card) => (
                <div key={card.id} className="rounded-xl border border-orange-200 bg-orange-50/50 p-3">
                  <p className="text-sm font-semibold text-gray-800">Unidade {card.uhNumero}</p>
                  <p className="text-sm text-gray-600">{card.itemNome}</p>
                  <p className="text-xs text-gray-500 mt-1">{card.descricao}</p>
                  <p className="text-[11px] text-gray-400 mt-1.5">{formatarData(card.createdAt)}</p>
                  <button
                    onClick={() => abrirResolucao(card)}
                    disabled={!podeOperar}
                    title={!podeOperar ? "Você não tem acesso para operar este módulo" : undefined}
                    className="mt-3 w-full py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
                  >
                    Marcar como resolvido
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex max-h-[75vh] flex-col rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-bold text-gray-700">Resolvido</h2>
            <span className="text-xs text-gray-400">({resolvidos.length})</span>
          </div>
          <div className="space-y-3 overflow-y-auto pr-1">
            {resolvidos.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Nenhuma falha resolvida ainda.</p>
            ) : (
              resolvidos.map((card) => (
                <div key={card.id} className="rounded-xl border border-green-200 bg-green-50/50 p-3">
                  <p className="text-sm font-semibold text-gray-800">Unidade {card.uhNumero}</p>
                  <p className="text-sm text-gray-600">{card.itemNome}</p>
                  <p className="text-xs text-gray-500 mt-1">{card.descricao}</p>
                  <div className="mt-2 rounded-lg bg-white/70 p-2 border border-green-100">
                    <p className="text-xs text-gray-700">{card.resolvedDescricao}</p>
                    {card.resolvedPhotos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {card.resolvedPhotos.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={url} src={url} alt="Evidência" className="h-12 w-12 object-cover rounded-lg border border-gray-200" />
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {card.resolvedAt && formatarData(card.resolvedAt)}{card.resolvedByNome ? ` · ${card.resolvedByNome}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {resolvendo && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end md:items-center md:justify-center" onClick={() => !salvando && setResolvendo(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">Resolver falha gerencial</h3>
                <button onClick={() => setResolvendo(null)} disabled={salvando}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Unidade {resolvendo.uhNumero} — {resolvendo.itemNome}
              </p>

              <p className="mb-1.5 text-xs font-medium text-gray-500">O que foi feito? *</p>
              <textarea
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                placeholder="Descreva a correção realizada..."
                value={descricaoResolucao}
                onChange={(e) => setDescricaoResolucao(e.target.value)}
              />

              <p className="mb-1.5 mt-3 text-xs font-medium text-gray-500">Fotos (opcional)</p>
              <div className="flex flex-wrap gap-2">
                {fotos.map((url) => (
                  <div key={url} className="h-14 w-14 overflow-hidden rounded-lg border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Evidência" className="h-full w-full object-cover" />
                  </div>
                ))}
                {fotos.length < MAX_FOTOS && (
                  <label className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={adicionarFoto} />
                  </label>
                )}
              </div>

              {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}

              <button
                onClick={confirmarResolucao}
                disabled={salvando || descricaoResolucao.trim().length < 5}
                className="mt-4 w-full py-3 rounded-xl bg-orange-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {salvando ? "Salvando..." : "Confirmar resolução"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
