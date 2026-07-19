"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X, AlertTriangle, FileText } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Detalhe de uma queixa de hóspede (ver GuestComplaint) — mesmo padrão de
// UHDetailModal.tsx: bottom-sheet no mobile, modal centralizado no desktop,
// busca o detalhe completo via API a partir de só um id. Aberto ao clicar
// no balão "Queixa(s)" em Seleção e Liberação ou na linha de queixa no
// detalhe da camareira em Performance.

type QueixaDetail = {
  id: string;
  titulo: string;
  tipo: string;
  descricao: string;
  data: string;
  uhNumero: string;
  camareiraNome: string | null;
  pontosDescontados: number | null;
  registradoPorNome: string;
  anexos: { url: string; fileName: string; fileSize?: number }[];
  createdAt: string;
};

function isImagem(url: string) {
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
}

const TIPO_BADGE: Record<string, { label: string; className: string }> = {
  LIMPEZA: { label: "Limpeza", className: "bg-red-100 text-red-700" },
  MANUTENCAO: { label: "Manutenção", className: "bg-orange-100 text-orange-700" },
  LAVANDERIA: { label: "Lavanderia", className: "bg-blue-100 text-blue-700" },
  OUTRA: { label: "Outra", className: "bg-gray-100 text-gray-700" },
};

export default function QueixaDetailModal({ queixaId, onClose }: { queixaId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<QueixaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/queixas?id=${queixaId}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [queixaId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 z-50 flex md:items-center md:justify-center pointer-events-none">
        <div className="pointer-events-auto w-full md:max-w-md md:mx-4 bg-white rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="font-bold text-lg text-gray-900 truncate">
                {loading ? "Carregando..." : detail?.titulo ?? "Queixa"}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12 text-gray-400">Carregando...</div>
          ) : !detail ? (
            <div className="flex-1 flex items-center justify-center py-12 text-gray-400">Queixa não encontrada.</div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  (TIPO_BADGE[detail.tipo] ?? TIPO_BADGE.OUTRA).className
                }`}>
                  {(TIPO_BADGE[detail.tipo] ?? TIPO_BADGE.OUTRA).label}
                </span>
                <span className="text-xs text-gray-400">UH {detail.uhNumero} · {detail.data}</span>
              </div>

              <p className="text-sm text-gray-700 whitespace-pre-wrap">{detail.descricao}</p>

              {detail.camareiraNome && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700">
                  <p className="font-medium">-{detail.pontosDescontados} pts — {detail.camareiraNome}</p>
                </div>
              )}

              {detail.anexos.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Anexos ({detail.anexos.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.anexos.map((a, i) =>
                      isImagem(a.url) ? (
                        <button
                          key={i}
                          onClick={() => setFotoAberta(a.url)}
                          className="aspect-square rounded-lg overflow-hidden border border-gray-100 hover:opacity-80 transition-opacity"
                        >
                          <img src={a.url} alt={a.fileName} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aspect-square rounded-lg border border-gray-100 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-100 p-1 text-center"
                        >
                          <FileText className="w-5 h-5 mb-1" />
                          <span className="text-[10px] truncate w-full">{a.fileName}</span>
                        </a>
                      )
                    )}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-gray-100 text-xs text-gray-400">
                <p>Registrado por {detail.registradoPorNome} às {format(new Date(detail.createdAt), "dd/MM/yyyy HH:mm")}</p>
                <p className="mt-1">Também aparece como card em Avaliações, dentro do Kanban de Tratamento.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {fotoAberta && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setFotoAberta(null)}>
          <img src={fotoAberta} alt="Anexo ampliado" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setFotoAberta(null)} className="absolute top-4 right-4 text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
}
