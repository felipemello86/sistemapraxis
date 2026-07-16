"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X, Clock, Camera, ShieldCheck, CheckCircle2, AlertTriangle, WashingMachine } from "lucide-react";
import { formatarTempo } from "@/lib/scoring";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/components/UHDetailModal.tsx (v1).
// fetch(...) → apiFetch(...) — o resto é idêntico: a API /api/uh-detail
// já retorna exatamente o mesmo shape em v2 (ver route.ts).

type UHDetail = {
  uhNumero: string;
  camareiraNome: string;
  status: string;
  liberadaEm: string | null;
  session: {
    iniciadaEm: string;
    finalizadaEm: string | null;
    duracaoSegundos: number | null;
    fotos: string[];
    observacoes: string | null;
    comentarioCamareira: string | null;
    steps: { nome: string; ordem: number; iniciadoEm: string; finalizadoEm: string | null; duracaoSegundos: number | null }[];
    inspection: {
      iniciadaEm: string;
      finalizadaEm: string | null;
      totalFalhas: number;
      comentarioGovernanta: string | null;
      itens: { categoria: string; item: string; resultado: string; tipoFalha: string; observacao: string | null }[];
    } | null;
  } | null;
  falhasLavanderia: {
    id: string;
    descricao: string;
    reportadoPorNome: string;
    reportadoPorRole: string;
    fotoUrl: string | null;
    hora: string;
  }[];
};

const CAT_LABEL: Record<string, string> = {
  CAMA: "🛏️ Cama", BANHEIRO: "🚿 Banheiro", QUARTO: "🏠 Quarto", COZINHA: "🍳 Cozinha", GERAL: "✅ Geral",
};

function FotoThumb({ url, index, onOpen }: { url: string; index: number; onOpen: (u: string) => void }) {
  const [erro, setErro] = useState(false);
  if (erro || url.startsWith("/placeholder")) {
    return (
      <div className="aspect-square rounded-lg border border-gray-100 bg-gray-50 flex flex-col items-center justify-center text-gray-300">
        <Camera className="w-6 h-6 mb-1" />
        <span className="text-xs">Foto {index + 1}</span>
      </div>
    );
  }
  return (
    <button onClick={() => onOpen(url)} className="aspect-square rounded-lg overflow-hidden border border-gray-100 hover:opacity-80 transition-opacity">
      <img src={url} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" onError={() => setErro(true)} />
    </button>
  );
}

export default function UHDetailModal({ assignmentId, onClose }: { assignmentId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<UHDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/uh-detail?assignmentId=${assignmentId}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [assignmentId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const s = detail?.session;
  const falhasLav = detail?.falhasLavanderia ?? [];
  const falhas = s?.inspection?.itens.filter((i) => i.resultado === "FALHA") ?? [];
  const categorias = s?.inspection
    ? Array.from(new Set(s.inspection.itens.map((i) => i.categoria)))
    : [];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 md:inset-0 z-50 flex md:items-center md:justify-center pointer-events-none">
        <div className="pointer-events-auto w-full md:max-w-xl md:mx-4 bg-white rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <p className="font-bold text-lg text-gray-900">
                {loading ? "Carregando..." : `UH ${detail?.uhNumero}`}
              </p>
              {detail && <p className="text-sm text-gray-500">{detail.camareiraNome}</p>}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12 text-gray-400">Carregando...</div>
          ) : !s ? (
            <div className="flex-1 flex items-center justify-center py-12 text-gray-400">
              <div className="text-center">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Limpeza ainda não iniciada</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Horários */}
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                  <Clock className="w-4 h-4 text-blue-500" /> Horários
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Início da limpeza</span>
                    <span className="font-medium">{format(new Date(s.iniciadaEm), "HH:mm")}</span>
                  </div>

                  {s.steps.map((st) => (
                    <div key={st.ordem} className="flex justify-between text-sm pl-3 border-l-2 border-gray-100">
                      <span className="text-gray-400 truncate mr-2">{st.nome}</span>
                      <span className="text-gray-500 flex-shrink-0 text-right">
                        <span className="text-gray-400 text-xs mr-1">{format(new Date(st.iniciadoEm), "HH:mm")}</span>
                        {st.duracaoSegundos ? formatarTempo(st.duracaoSegundos) : st.finalizadoEm ? "—" : "em andamento"}
                      </span>
                    </div>
                  ))}

                  {s.finalizadaEm && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Fim da limpeza</span>
                      <span className="font-medium">{format(new Date(s.finalizadaEm), "HH:mm")}</span>
                    </div>
                  )}

                  {s.duracaoSegundos && (
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="text-gray-600 font-medium">Duração total</span>
                      <span className="font-bold text-blue-600">{formatarTempo(s.duracaoSegundos)}</span>
                    </div>
                  )}

                  {s.inspection?.iniciadaEm && (
                    <div className="flex justify-between text-sm pt-1 border-t border-gray-100">
                      <span className="text-gray-500">Inspeção iniciada</span>
                      <span className="font-medium">{format(new Date(s.inspection.iniciadaEm), "HH:mm")}</span>
                    </div>
                  )}
                  {s.inspection?.finalizadaEm && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Inspeção concluída</span>
                      <span className="font-medium">{format(new Date(s.inspection.finalizadaEm), "HH:mm")}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Fotos */}
              {s.fotos.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <Camera className="w-4 h-4 text-blue-500" /> Fotos ({s.fotos.length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {s.fotos.map((url, i) => (
                      <FotoThumb key={i} url={url} index={i} onOpen={setFotoAberta} />
                    ))}
                  </div>
                </div>
              )}

              {/* Falhas de Lavanderia */}
              {falhasLav.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-3">
                    <WashingMachine className="w-4 h-4 text-amber-500" />
                    Falhas de Lavanderia ({falhasLav.length})
                  </h3>
                  <div className="space-y-3">
                    {falhasLav.map((f) => (
                      <div key={f.id} className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-100 border-b border-amber-200">
                          <WashingMachine className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <span className="text-xs font-semibold text-amber-800">
                            🧺 Defeito de Enxoval — {f.hora}
                          </span>
                          <span className="ml-auto text-xs text-amber-600">
                            {f.reportadoPorRole === "CAMAREIRA" ? "Camareira" : "Governanta"} {f.reportadoPorNome.split(" ")[0]}
                          </span>
                        </div>
                        <div className="p-3">
                          <p className="text-sm text-amber-900">{f.descricao}</p>
                          {f.fotoUrl && (
                            <button
                              onClick={() => setFotoAberta(f.fotoUrl!)}
                              className="mt-2 w-full overflow-hidden rounded-lg border border-amber-200 hover:opacity-90 transition-opacity"
                            >
                              <img
                                src={f.fotoUrl}
                                alt="Foto do defeito"
                                className="w-full max-h-48 object-cover"
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comentário da camareira */}
              {s.comentarioCamareira && (
                <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-800 border border-blue-100">
                  <p className="font-medium mb-0.5">💬 Comentário da camareira</p>
                  <p>{s.comentarioCamareira}</p>
                </div>
              )}

              {/* Comentário da governanta */}
              {s.inspection?.comentarioGovernanta && (
                <div className="bg-indigo-50 rounded-lg px-3 py-2 text-sm text-indigo-800 border border-indigo-100">
                  <p className="font-medium mb-0.5">🔍 Comentário da governanta</p>
                  <p>{s.inspection.comentarioGovernanta}</p>
                </div>
              )}

              {/* Inspeção */}
              {s.inspection && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1">
                    <ShieldCheck className="w-4 h-4 text-blue-500" /> Inspeção
                  </h3>

                  {s.inspection.totalFalhas === 0 ? (
                    <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-lg px-3 py-2 mb-3">
                      <CheckCircle2 className="w-4 h-4" /> Sem falhas registradas
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 mb-3">
                      <AlertTriangle className="w-4 h-4" />
                      {s.inspection.totalFalhas} falha{s.inspection.totalFalhas !== 1 ? "s" : ""} registrada{s.inspection.totalFalhas !== 1 ? "s" : ""}
                    </div>
                  )}

                  <div className="space-y-3">
                    {categorias.map((cat) => {
                      const itens = s.inspection!.itens.filter((i) => i.categoria === cat);
                      return (
                        <div key={cat} className="card p-3">
                          <p className="text-xs font-bold text-gray-600 mb-2">{CAT_LABEL[cat] ?? cat}</p>
                          <div className="space-y-1.5">
                            {itens.map((it, idx) => (
                              <div key={idx} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${
                                it.resultado === "FALHA" ? "bg-red-50" : "bg-gray-50"
                              }`}>
                                <span className={`flex-shrink-0 mt-0.5 ${it.resultado === "FALHA" ? "text-red-500" : "text-green-500"}`}>
                                  {it.resultado === "FALHA" ? "✗" : "✓"}
                                </span>
                                <div className="min-w-0">
                                  <p className={it.resultado === "FALHA" ? "text-red-700 font-medium" : "text-gray-500"}>{it.item}</p>
                                  {it.observacao && <p className="text-red-400 mt-0.5 italic">"{it.observacao}"</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {s.observacoes && (
                <div className="bg-yellow-50 rounded-lg px-3 py-2 text-sm text-yellow-800">
                  <p className="font-medium mb-0.5">Observações</p>
                  <p>{s.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {fotoAberta && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setFotoAberta(null)}>
          <img src={fotoAberta} alt="Foto ampliada" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setFotoAberta(null)} className="absolute top-4 right-4 text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
}
