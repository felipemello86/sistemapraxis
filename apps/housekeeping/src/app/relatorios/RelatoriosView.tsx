"use client";
import { useState, useEffect } from "react";
import { FileText, Download, Calendar, BedDouble, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/relatorios/RelatoriosView.tsx (v1)
// 1:1 — única diferença é fetch → apiFetch (basePath /governance).

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

  async function abrirPDF(data: string) {
    setBaixando(data);
    try {
      const res = await apiFetch(`/api/relatorio-diario?data=${data}`);
      if (!res.ok) throw new Error("Erro ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Relatorio_Gerencial_${data}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
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
                    onClick={() => abrirPDF(dia.data)}
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
