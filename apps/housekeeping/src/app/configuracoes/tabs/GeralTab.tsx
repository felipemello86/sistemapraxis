"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/configuracoes/tabs/GeralTab.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico.

export default function GeralTab({ somenteLeitura = false }: { somenteLeitura?: boolean }) {
  const [form, setForm] = useState({
    hotelNome: "",
    notificationTime: "08:00",
    targetMinutes: 25,
    turnoInicioHora: "08:00",
    photoRequirements: ["cozinha", "cama", "toalhas", "banheiro"],
  });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    apiFetch("/api/configuracoes").then((r) => r.json()).then((d) => {
      setForm({
        hotelNome: d.hotelNome || "",
        notificationTime: d.notificationTime || "08:00",
        targetMinutes: d.targetMinutes || 25,
        turnoInicioHora: d.turnoInicioHora || "08:00",
        photoRequirements: d.photoRequirements ? JSON.parse(d.photoRequirements) : ["cozinha", "cama", "toalhas", "banheiro"],
      });
      setLoading(false);
    });
  }, []);

  async function salvar() {
    setSalvando(true);
    await apiFetch("/api/configuracoes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSalvando(false);
    setOk(true);
    setTimeout(() => setOk(false), 3000);
  }

  const allFotos = ["cozinha", "cama", "toalhas", "banheiro", "sala", "varanda", "geral"];

  if (loading) return <div className="text-gray-400">Carregando...</div>;

  return (
    <div className="max-w-lg space-y-6">
      <div className="card">
        <h3 className="font-semibold mb-4">Informações do estabelecimento</h3>
        <div>
          <label className="label">Nome do hotel/pousada</label>
          <input className="input" value={form.hotelNome} onChange={(e) => setForm({ ...form, hotelNome: e.target.value })} />
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-4">Programação</h3>
        <div className="space-y-4">
          <div>
            <label className="label">Horário de envio das notificações Telegram</label>
            <input type="time" className="input w-auto" value={form.notificationTime} onChange={(e) => setForm({ ...form, notificationTime: e.target.value })} />
          </div>
          <div>
            <label className="label">Tempo alvo de arrumação (minutos)</label>
            <input type="number" min={10} max={90} className="input w-auto" value={form.targetMinutes} onChange={(e) => setForm({ ...form, targetMinutes: +e.target.value })} />
            <p className="text-xs text-gray-400 mt-1">Meta de tempo para cálculo do score. Padrão: 25 min.</p>
          </div>
          <div>
            <label className="label">Início do turno</label>
            <input type="time" className="input w-auto" value={form.turnoInicioHora} onChange={(e) => setForm({ ...form, turnoInicioHora: e.target.value })} />
            <p className="text-xs text-gray-400 mt-1">
              Retaguarda usada no cálculo do score: nenhuma UH conta tempo pontuado antes desse horário, mesmo se já tiver sido liberada. Evita que a 1ª UH do dia seja penalizada por ter sido liberada de madrugada.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">Fotos obrigatórias</h3>
        <p className="text-sm text-gray-500 mb-3">Selecione quais fotos a camareira deve tirar ao finalizar a UH.</p>
        <div className="flex flex-wrap gap-2">
          {allFotos.map((f) => {
            const ativo = form.photoRequirements.includes(f);
            return (
              <button
                key={f}
                onClick={() =>
                  setForm({
                    ...form,
                    photoRequirements: ativo
                      ? form.photoRequirements.filter((x) => x !== f)
                      : [...form.photoRequirements, f],
                  })
                }
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors capitalize ${
                  ativo ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-300"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {somenteLeitura ? (
        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          👁 Modo somente leitura — alterações não são permitidas.
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button onClick={salvar} disabled={salvando} className="btn-primary">
            {salvando ? "Salvando..." : "Salvar configurações"}
          </button>
          {ok && <span className="text-green-600 text-sm">✓ Salvo!</span>}
        </div>
      )}
    </div>
  );
}
