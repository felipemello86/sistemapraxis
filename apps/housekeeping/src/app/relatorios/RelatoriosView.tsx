"use client";
import { useState, useEffect } from "react";
import { FileText, Download, Calendar, BedDouble, Loader2 } from "lucide-react";
import { apiFetch, apiUrl } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/relatorios/RelatoriosView.tsx (v1)
// — única diferença original era fetch → apiFetch (basePath /governance).
//
// "Baixar PDF" — 2 rodadas de conserto no mesmo dia (05/08/2026, pedido do
// Felipe):
//   1ª: trocamos fetch→blob→<a download>.click() por <a href target=_blank>
//       de verdade, porque o truque de blob nunca funcionou de forma
//       confiável no WKWebView do iOS. O Capacitor abre target=_blank no
//       Safari do sistema — mas aí a rota voltava "Unauthorized", porque o
//       cookie de sessão é httpOnly e escopado ao WebView do app, não
//       acompanha a navegação pro Safari.
//   2ª (esta): busca um token de vida curta (5min, /api/relatorio-diario/
//       token) ainda dentro do WebView autenticado, embute na URL, e SÓ
//       DEPOIS abre no Safari — a rota aceita esse token como alternativa
//       ao cookie (ver verifyDownloadToken em packages/core/src/session.ts).
//       A janela é aberta de forma SÍNCRONA no clique (window.open("",
//       "_blank") antes do await) e só recebe a URL final depois — abrir
//       depois de um await é tratado como pop-up não solicitado por várias
//       WebViews/navegadores e fica bloqueado.

type DiaRelatorio = { data: string; totalUHs: number };

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function RelatoriosView() {
  const [dias, setDias] = useState<DiaRelatorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/relatorios")
      .then((r) => r.json())
      .then((d) => { setDias(d); setLoading(false); });
  }, []);

  async function baixarPDF(data: string) {
    // Abre a aba/janela JÁ no clique (síncrono), antes de qualquer await —
    // senão o Safari/Capacitor trata como pop-up não solicitado e bloqueia.
    const win = window.open("", "_blank");
    setBaixando(data);
    try {
      const res = await apiFetch("/api/relatorio-diario/token");
      const json = await res.json();
      if (!res.ok || !json.token) throw new Error(json.error || "Erro ao gerar link de download");
      const url = apiUrl(`/api/relatorio-diario?data=${data}&token=${encodeURIComponent(json.token)}`);
      if (win) {
        win.location.href = url;
      } else {
        // Pop-up inicial bloqueado mesmo assim — tenta de novo diretamente
        // (ainda dentro do mesmo gesto de clique do usuário, na prática).
        window.open(url, "_blank");
      }
    } catch {
      win?.close();
      alert("Não foi possível gerar o relatório.");
    } finally {
      setBaixando(null);
    }
  }

  // Agrupa por mês/ano
  const porMes = dias.reduce<Record<string, DiaRelatorio[]>>((acc, d) => {
    const chave = d.data.slice(0, 7); // "yyyy-MM"
    if (!acc[chave]) acc[chave] = [];
    acc[chave].push(d);
    return acc;
  }, {});

  const meses = Object.keys(porMes).sort((a, b) => b.localeCompare(a));

  function labelMes(chave: string): string {
    const [ano, mes] = chave.split("-").map(Number);
    const d = new Date(ano, mes - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <FileText className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-sm text-gray-500">Histórico de relatórios gerenciais diários</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Carregando...</span>
        </div>
      ) : dias.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p>Nenhum relatório disponível.</p>
        </div>
      ) : (
        meses.map((mes) => (
          <div key={mes}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 capitalize">
              {labelMes(mes)}
            </h2>
            <div className="card divide-y divide-gray-50">
              {porMes[mes].map((dia) => (
                <div
                  key={dia.data}
                  className="flex items-center justify-between py-3 px-1 hover:bg-gray-50 rounded transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 capitalize">
                        {formatarData(dia.data)}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                        <BedDouble className="w-3 h-3" />
                        <span>{dia.totalUHs} UH{dia.totalUHs !== 1 ? "s" : ""} atribuída{dia.totalUHs !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => baixarPDF(dia.data)}
                    disabled={baixando === dia.data}
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50"
                  >
                    {baixando === dia.data ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Baixar PDF
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
