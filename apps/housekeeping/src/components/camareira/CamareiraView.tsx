"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Clock, Camera, ChevronRight, Lock, Play, AlertCircle, X, MessageSquarePlus, BedDouble, MessageSquare, Wrench, ShieldAlert, WashingMachine } from "lucide-react";
import { formatarTempo } from "@/lib/scoring";

// Portado de apps/housekeeping/src/components/camareira/CamareiraView.tsx (v1).
// Mesma UI, mesmo comportamento. Diferença: o v1 aceitava uma prop `token`
// opcional pra suportar tanto sessão logada quanto link público do Telegram
// (mesmo componente pras duas rotas). Aqui, nesta primeira fatia portada,
// só existe o caminho de sessão logada — o link público por Telegram entra
// numa fatia futura, quando o bot for portado.

type Assignment = {
  id: string;
  status: string;
  liberadaEm: string | null;
  observacoes: string | null;
  solicitacaoMensagem: string | null;
  solicitacaoStatus: string | null;
  temReserva?: boolean;
  uh: { id: string; numero: string; tipo: string; status: string; emManutencao?: boolean; manutencaoDescricao?: string | null };
  program: { id: string; nome: string; tipo: string; steps: { id: string; titulo: string; descricao: string; ordem: number }[] } | null;
  cleaningSession: {
    id: string;
    iniciadaEm: string;
    finalizadaEm: string | null;
    steps: { id: string; stepId: string; ordem: number; iniciadoEm: string; finalizadoEm: string | null; step: { titulo: string; descricao: string } }[];
  } | null;
};

type Fase = "lista" | "limpeza" | "fotos" | "concluido";

const FOTO_TIPOS = ["cozinha", "cama", "toalhas", "banheiro"];
const FOTO_LABELS: Record<string, string> = {
  cozinha: "🍳 Cozinha",
  cama: "🛏️ Cama",
  toalhas: "🛁 Toalhas",
  banheiro: "🚿 Banheiro",
};

export default function CamareiraView() {
  const [data, setData] = useState<{ assignments: Assignment[]; user: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fase, setFase] = useState<Fase>("lista");
  const [assignmentAtivo, setAssignmentAtivo] = useState<Assignment | null>(null);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [stepAtualIdx, setStepAtualIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [inicioTime, setInicioTime] = useState<Date | null>(null);
  const [fotos, setFotos] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [comentarioCamareira, setComentarioCamareira] = useState("");
  const [solicitandoId, setSolicitandoId] = useState<string | null>(null);
  const [solicitacaoMsg, setSolicitacaoMsg] = useState("");
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [bloqueandoUH, setBloqueandoUH] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");
  const [enviandoBloqueio, setEnviandoBloqueio] = useState(false);
  const [reportandoLavanderia, setReportandoLavanderia] = useState(false);
  const [descricaoLavanderia, setDescricaoLavanderia] = useState("");
  const [fotoLavanderia, setFotoLavanderia] = useState<string | null>(null);
  const [uploadandoFotoLav, setUploadandoFotoLav] = useState(false);
  const [enviandoLavanderia, setEnviandoLavanderia] = useState(false);

  async function solicitarAlteracao(assignmentId: string) {
    if (!solicitacaoMsg.trim()) return;
    setEnviandoSolicitacao(true);
    await fetch("/api/atribuicoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solicitar_alteracao", assignmentId, mensagem: solicitacaoMsg.trim() }),
    });
    setSolicitandoId(null);
    setSolicitacaoMsg("");
    setEnviandoSolicitacao(false);
    carregar();
  }

  const carregar = useCallback(async () => {
    const res = await fetch("/api/sessoes");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Timer
  useEffect(() => {
    if (fase !== "limpeza" || !inicioTime) return;
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - inicioTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [fase, inicioTime]);

  async function iniciarLimpeza(a: Assignment) {
    setAssignmentAtivo(a);
    const inicio = new Date();
    setInicioTime(inicio);
    setElapsed(0);

    // Se já há sessão em andamento, retomar
    if (a.cleaningSession && !a.cleaningSession.finalizadaEm) {
      setSessaoId(a.cleaningSession.id);
      const stepPendente = a.cleaningSession.steps.findIndex((s) => !s.finalizadoEm);
      const programLength = a.program?.steps.length ?? 1;
      // Clampa para evitar índice fora dos bounds quando o programa mudou
      const safeIdx = stepPendente >= 0 ? Math.min(stepPendente, programLength - 1) : 0;
      setStepAtualIdx(safeIdx);
      setInicioTime(new Date(a.cleaningSession.iniciadaEm));
    } else {
      // Criar nova sessão
      const res = await fetch("/api/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: a.id }),
      });
      const sessao = await res.json();
      setSessaoId(sessao.id);
      setStepAtualIdx(0);
    }

    setFase("limpeza");
    await carregar();
  }

  async function concluirEtapa() {
    if (!assignmentAtivo || !sessaoId) return;

    // Usa o programa mais fresco (pode ter mudado após aprovação)
    const freshAssignment = data?.assignments.find((a) => a.id === assignmentAtivo.id);
    const totalSteps = (freshAssignment ?? assignmentAtivo).program?.steps.length ?? 0;
    const nextIdx = stepAtualIdx + 1;

    // Tenta marcar o step como concluído no banco — mas nunca bloqueia a UI nisto
    try {
      const json = await fetch("/api/sessoes").then((r) => r.json());
      const sessao = json.assignments?.find((a: Assignment) => a.id === assignmentAtivo.id)?.cleaningSession;
      const stepPendente = sessao?.steps?.find((s: any) => !s.finalizadoEm);
      if (stepPendente) {
        await fetch("/api/sessoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "concluir_step", sessaoId, stepId: stepPendente.id }),
        });
      }
    } catch {
      // Ignora falha na API — a UI avança de qualquer forma
    }

    // Sempre avança para o próximo step ou para a fase de fotos
    if (nextIdx >= totalSteps) {
      setFase("fotos");
    } else {
      setStepAtualIdx(nextIdx);
    }

    await carregar();
  }

  async function comprimirImagem(file: File, maxWidth = 1200, quality = 0.82): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  async function handleFotoUpload(tipo: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sessaoId) return;

    setUploading(tipo);
    setErroUpload(null);

    try {
      const fileComprimido = await comprimirImagem(file);
      const fd = new FormData();
      fd.append("file", fileComprimido);
      fd.append("sessaoId", sessaoId);
      fd.append("tipo", tipo);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      const { url } = await res.json();
      if (!url) throw new Error("URL não retornada pelo servidor");
      setFotos((prev) => ({ ...prev, [tipo]: [...(prev[tipo] ?? []), url] }));
    } catch (err: any) {
      setErroUpload(`Falha ao enviar foto. Tente novamente. (${err.message})`);
    } finally {
      setUploading(null);
    }
  }

  async function uploadFotoLavanderia(file: File) {
    setUploadandoFotoLav(true);
    try {
      const fileComprimido = await comprimirImagem(file);
      const fd = new FormData();
      fd.append("file", fileComprimido);
      fd.append("tipo", "lavanderia");
      fd.append("pasta", "lavanderia");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) setFotoLavanderia(data.url);
    } catch {}
    setUploadandoFotoLav(false);
  }

  async function reportarFalhaLavanderia() {
    if (!descricaoLavanderia.trim() || !assignmentAtivo) return;
    setEnviandoLavanderia(true);
    await fetch("/api/falha-lavanderia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uhNumero: assignmentAtivo.uh.numero, descricao: descricaoLavanderia.trim(), fotoUrl: fotoLavanderia }),
    });
    setEnviandoLavanderia(false);
    setReportandoLavanderia(false);
    setDescricaoLavanderia("");
    setFotoLavanderia(null);
  }

  async function solicitarBloqueio() {
    if (!motivoBloqueio.trim() || !assignmentAtivo) return;
    setEnviandoBloqueio(true);
    await fetch("/api/bloqueio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uhId: assignmentAtivo.uh.id, motivo: motivoBloqueio.trim() }),
    });
    setEnviandoBloqueio(false);
    setBloqueandoUH(false);
    setMotivoBloqueio("");
  }

  async function finalizarLimpeza() {
    if (!sessaoId) return;
    setConcluindo(true);

    const fotoUrls = Object.values(fotos).flat();
    await fetch("/api/sessoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalizar", sessaoId, fotos: fotoUrls, comentarioCamareira: comentarioCamareira.trim() || null }),
    });

    setConcluindo(false);
    setFase("concluido");
    await carregar();
  }

  const fotosTipos = FOTO_TIPOS;
  const fotosCompletas = fotosTipos.every((t) => (fotos[t]?.length ?? 0) > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Carregando...
        </div>
      </div>
    );
  }

  // ─── TELA DE CONCLUSÃO ───────────────────────────────────────────────────
  if (fase === "concluido") {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-6">
        <div className="text-center">
          <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{assignmentAtivo?.uh.numero} concluída!</h1>
          <p className="text-gray-600 mb-2">Tempo total: {formatarTempo(elapsed)}</p>
          <p className="text-sm text-gray-500 mb-6">A governanta será notificada para inspeção.</p>
          <button onClick={() => { setFase("lista"); setAssignmentAtivo(null); carregar(); }} className="btn-primary">
            Voltar às UHs
          </button>
        </div>
      </div>
    );
  }

  // ─── TELA DE FOTOS ──────────────────────────────────────────────────────
  if (fase === "fotos") {
    return (
      <><div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
        <div className="bg-blue-700 text-white rounded-xl p-4 mb-6">
          <p className="text-sm opacity-80">{assignmentAtivo?.uh.numero}</p>
          <h2 className="text-xl font-bold">Fotos obrigatórias</h2>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatarTempo(elapsed)}</span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Tire as fotos dos ambientes abaixo antes de finalizar.
        </p>

        {erroUpload && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0">⚠️</span>
            <span>{erroUpload}</span>
          </div>
        )}

        <div className="space-y-3">
          {fotosTipos.map((tipo) => {
            const lista = fotos[tipo] ?? [];
            const temFoto = lista.length > 0;
            return (
              <div key={tipo} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium">{FOTO_LABELS[tipo]}</p>
                    {temFoto ? (
                      <p className="text-xs text-green-600 mt-0.5">✓ {lista.length} foto{lista.length > 1 ? "s" : ""}</p>
                    ) : (
                      <p className="text-xs text-gray-400">Foto pendente</p>
                    )}
                  </div>
                  <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${temFoto ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"} ${uploading === tipo ? "opacity-50 pointer-events-none" : ""}`}>
                    <Camera className="w-4 h-4" />
                    {uploading === tipo ? "Enviando..." : temFoto ? "+ Adicionar" : "Tirar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFotoUpload(tipo, e)}
                      disabled={uploading === tipo}
                    />
                  </label>
                </div>
                {lista.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-1">
                    {lista.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`${tipo}-${idx}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => setFotos((prev) => ({ ...prev, [tipo]: prev[tipo].filter((_, i) => i !== idx) }))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Comentário antes de finalizar */}
        <div className="mt-4 card">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Comentário (opcional)
          </label>
          <textarea
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Alguma observação sobre o quarto ou a limpeza..."
            value={comentarioCamareira}
            onChange={(e) => setComentarioCamareira(e.target.value)}
          />
        </div>

        <button
          onClick={finalizarLimpeza}
          disabled={!fotosCompletas || concluindo}
          className="btn-success w-full mt-4 py-4 text-lg"
        >
          {concluindo ? "Finalizando..." : "✓ Finalizar UH"}
        </button>
        {!fotosCompletas && (
          <p className="text-xs text-center text-gray-400 mt-2">
            Tire todas as fotos para finalizar
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => { setReportandoLavanderia(true); setDescricaoLavanderia(""); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
          >
            <WashingMachine className="w-4 h-4" /> Falha Lavanderia
          </button>
          <button
            onClick={() => { setBloqueandoUH(true); setMotivoBloqueio(""); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50"
          >
            <ShieldAlert className="w-4 h-4" /> Bloquear UH
          </button>
        </div>
      </div>

      {/* Modal de lavanderia */}
      {reportandoLavanderia && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => { setReportandoLavanderia(false); setDescricaoLavanderia(""); setFotoLavanderia(null); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white w-full rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <WashingMachine className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-gray-800">Falha de Lavanderia</h3>
                </div>
                <button onClick={() => { setReportandoLavanderia(false); setDescricaoLavanderia(""); setFotoLavanderia(null); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Descreva o problema encontrado no enxoval (mancha, sujeira, dano, etc.):</p>
              <textarea
                rows={3}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Toalha com mancha de ferrugem, lençol rasgado, fronha amarelada..."
                value={descricaoLavanderia}
                onChange={(e) => setDescricaoLavanderia(e.target.value)}
              />
              {/* Foto do defeito */}
              <div className="mt-3">
                {fotoLavanderia ? (
                  <div className="relative">
                    <img src={fotoLavanderia} alt="Foto do defeito" className="w-full max-h-40 object-cover rounded-lg border border-amber-200" />
                    <button
                      onClick={() => setFotoLavanderia(null)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <p className="text-xs text-green-600 mt-1.5">✓ Foto do defeito adicionada</p>
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2.5 border ${uploadandoFotoLav ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    <Camera className="w-4 h-4 flex-shrink-0" />
                    <span>{uploadandoFotoLav ? "Enviando foto..." : "Adicionar foto do defeito (opcional)"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFotoLavanderia(f); e.target.value = ""; }}
                      disabled={uploadandoFotoLav}
                    />
                  </label>
                )}
              </div>
              <button
                onClick={reportarFalhaLavanderia}
                disabled={!descricaoLavanderia.trim() || enviandoLavanderia || uploadandoFotoLav}
                className="mt-3 w-full py-3 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-50"
              >
                {enviandoLavanderia ? "Enviando..." : "🧺 Reportar falha"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de bloqueio */}
      {bloqueandoUH && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setBloqueandoUH(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white w-full rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <h3 className="font-bold text-gray-800">Solicitar Bloqueio da UH</h3>
                </div>
                <button onClick={() => setBloqueandoUH(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                ⚠️ Esta ação notificará <strong>todos os usuários</strong> do hotel e bloqueará a UH imediatamente.
                Descreva o problema grave detectado:
              </p>
              <textarea
                rows={4}
                className="w-full border border-red-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Torneira com vazamento grave, danos estruturais, problema de segurança..."
                value={motivoBloqueio}
                onChange={(e) => setMotivoBloqueio(e.target.value)}
              />
              <button
                onClick={solicitarBloqueio}
                disabled={!motivoBloqueio.trim() || enviandoBloqueio}
                className="mt-3 w-full py-3 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50"
              >
                {enviandoBloqueio ? "Enviando..." : "🚨 Confirmar bloqueio"}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ─── TELA DE LIMPEZA (CHECKLIST) ─────────────────────────────────────────
  if (fase === "limpeza" && assignmentAtivo) {
    // Dados mais frescos do assignment (após carregar())
    const assignmentFresco = data?.assignments.find((a) => a.id === assignmentAtivo.id) ?? assignmentAtivo;
    const podeSolicitar =
      (!assignmentFresco.solicitacaoStatus || assignmentFresco.solicitacaoStatus === "REJEITADO") &&
      assignmentFresco.program?.tipo !== "LIMPEZA_COMPLETA";

    const steps = assignmentFresco.program?.steps ?? assignmentAtivo.program?.steps ?? [];
    const totalSteps = steps.length;
    // Clampa índice caso o programa tenha mudado e a sessão antiga tenha mais steps
    const safeStepIdx = Math.min(stepAtualIdx, Math.max(0, totalSteps - 1));
    const stepAtual = steps[safeStepIdx];
    const progresso = totalSteps > 0 ? (safeStepIdx / totalSteps) * 100 : 100;

    // Sem etapas: ir direto para fotos
    if (totalSteps === 0) {
      return (
        <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
          <div className="bg-blue-700 text-white p-5">
            <p className="text-sm opacity-80">{assignmentAtivo.uh.numero}</p>
            <p className="font-bold text-lg">{assignmentAtivo.program?.nome || "Limpeza"}</p>
            {assignmentAtivo.observacoes && (
              <div className="mt-2 bg-amber-100 text-amber-900 rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold">Observações: </span>{assignmentAtivo.observacoes}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 text-2xl font-mono font-bold">
              <Clock className="w-5 h-5" />
              {formatarTempo(elapsed)}
            </div>
          </div>
          <div className="p-4">
            <div className="card text-center py-8">
              <p className="text-gray-500 mb-4">Nenhuma etapa configurada para este programa.</p>
              <button
                onClick={() => setFase("fotos")}
                className="btn-success w-full py-4 text-base font-bold"
              >
                Registrar fotos e finalizar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
      <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
        {/* Header com timer */}
        <div className="bg-blue-700 text-white p-5 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm opacity-80">{assignmentAtivo.uh.numero}</p>
              <p className="text-xs opacity-60">{assignmentAtivo.program?.nome}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-2xl font-mono font-bold">
                <Clock className="w-5 h-5" />
                {formatarTempo(elapsed)}
              </div>
              <p className="text-xs opacity-60">Meta: 25 min</p>
            </div>
          </div>
          {/* Barra de progresso */}
          <div className="mt-3 bg-blue-600 rounded-full h-2">
            <div
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs opacity-70">Etapa {safeStepIdx + 1} de {totalSteps}</p>
            <div className="flex items-center gap-1.5">
              {podeSolicitar && (
                <button
                  onClick={() => { setSolicitandoId(assignmentAtivo.id); setSolicitacaoMsg(""); }}
                  className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded-lg transition-colors"
                >
                  <MessageSquarePlus className="w-3 h-3" /> Solicitar alteração
                </button>
              )}
              {assignmentFresco.solicitacaoStatus === "PENDENTE" && (
                <span className="text-xs bg-yellow-400/30 text-yellow-100 px-2 py-1 rounded-lg">⏳ Aguardando aprovação</span>
              )}
              {assignmentFresco.solicitacaoStatus === "APROVADO" && (
                <span className="text-xs bg-green-400/30 text-green-100 px-2 py-1 rounded-lg">✅ Alteração aprovada</span>
              )}
              {assignmentFresco.solicitacaoStatus === "REJEITADO" && (
                <span className="text-xs bg-red-400/30 text-red-100 px-2 py-1 rounded-lg">❌ Não aprovada</span>
              )}
              <button
                onClick={() => { setBloqueandoUH(true); setMotivoBloqueio(""); }}
                className="flex items-center gap-1 text-xs bg-red-500/40 hover:bg-red-500/60 text-white px-2 py-1 rounded-lg transition-colors"
              >
                <ShieldAlert className="w-3 h-3" /> Bloquear
              </button>
            </div>
          </div>
        </div>

        {/* Etapa atual */}
        {stepAtual && (
          <div className="p-4">
            <div className="card mb-4">
              <div className="flex items-start gap-3 mb-3">
                <span className="bg-blue-100 text-blue-700 text-sm font-bold rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                  {safeStepIdx + 1}
                </span>
                <div>
                  <h3 className="font-bold text-lg text-gray-900">{stepAtual.titulo}</h3>
                  {stepAtual.descricao && (() => {
                    const linhas = stepAtual.descricao.split("\n").filter(Boolean);
                    if (linhas.length === 1) return <p className="text-sm text-gray-600 mt-1 leading-relaxed">{stepAtual.descricao}</p>;
                    return (
                      <div className="text-sm text-gray-600 mt-1 leading-relaxed space-y-1">
                        {linhas.map((linha, i) => (
                          <p key={i}><span className="font-medium">{i + 1}.</span> {linha}</p>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <button
                onClick={concluirEtapa}
                className="btn-success w-full py-4 text-base font-bold flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                {safeStepIdx === totalSteps - 1 ? "Concluir e tirar fotos" : "Feito! Próxima etapa"}
              </button>
            </div>

            {/* Falha Lavanderia */}
            <button
              onClick={() => { setReportandoLavanderia(true); setDescricaoLavanderia(""); }}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
            >
              <WashingMachine className="w-4 h-4" /> Falha Lavanderia
            </button>

            {/* Etapas concluídas */}
            {safeStepIdx > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Concluídas</p>
                <div className="space-y-1">
                  {steps.slice(0, safeStepIdx).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm text-gray-400 py-1">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      {s.titulo}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comentário da camareira */}
            <div className="mt-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Comentário (opcional)
              </label>
              <textarea
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                placeholder="Alguma observação sobre o quarto ou a limpeza..."
                value={comentarioCamareira}
                onChange={(e) => setComentarioCamareira(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal de solicitação */}
      {solicitandoId && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setSolicitandoId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">Solicitar alteração</h3>
                <button onClick={() => setSolicitandoId(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Explique para a governanta o motivo da solicitação:</p>
              <textarea
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: O quarto está muito sujo, precisa de limpeza completa..."
                value={solicitacaoMsg}
                onChange={(e) => setSolicitacaoMsg(e.target.value)}
              />
              <button
                onClick={() => solicitarAlteracao(solicitandoId)}
                disabled={!solicitacaoMsg.trim() || enviandoSolicitacao}
                className="mt-3 w-full btn-primary"
              >
                {enviandoSolicitacao ? "Enviando..." : "Enviar solicitação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de lavanderia */}
      {reportandoLavanderia && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => { setReportandoLavanderia(false); setDescricaoLavanderia(""); setFotoLavanderia(null); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white w-full rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <WashingMachine className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-gray-800">Falha de Lavanderia</h3>
                </div>
                <button onClick={() => { setReportandoLavanderia(false); setDescricaoLavanderia(""); setFotoLavanderia(null); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Descreva o problema encontrado no enxoval (mancha, sujeira, dano, etc.):</p>
              <textarea
                rows={3}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Toalha com mancha de ferrugem, lençol rasgado, fronha amarelada..."
                value={descricaoLavanderia}
                onChange={(e) => setDescricaoLavanderia(e.target.value)}
              />
              {/* Foto do defeito */}
              <div className="mt-3">
                {fotoLavanderia ? (
                  <div className="relative">
                    <img src={fotoLavanderia} alt="Foto do defeito" className="w-full max-h-40 object-cover rounded-lg border border-amber-200" />
                    <button
                      onClick={() => setFotoLavanderia(null)}
                      className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <p className="text-xs text-green-600 mt-1.5">✓ Foto do defeito adicionada</p>
                  </div>
                ) : (
                  <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2.5 border ${uploadandoFotoLav ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    <Camera className="w-4 h-4 flex-shrink-0" />
                    <span>{uploadandoFotoLav ? "Enviando foto..." : "Adicionar foto do defeito (opcional)"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFotoLavanderia(f); e.target.value = ""; }}
                      disabled={uploadandoFotoLav}
                    />
                  </label>
                )}
              </div>
              <button
                onClick={reportarFalhaLavanderia}
                disabled={!descricaoLavanderia.trim() || enviandoLavanderia || uploadandoFotoLav}
                className="mt-3 w-full py-3 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-50"
              >
                {enviandoLavanderia ? "Enviando..." : "🧺 Reportar falha"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de bloqueio */}
      {bloqueandoUH && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setBloqueandoUH(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-white w-full rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                  <h3 className="font-bold text-gray-800">Solicitar Bloqueio da UH</h3>
                </div>
                <button onClick={() => setBloqueandoUH(false)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                ⚠️ Esta ação notificará <strong>todos os usuários</strong> do hotel e bloqueará a UH imediatamente.
                Descreva o problema grave detectado:
              </p>
              <textarea
                rows={4}
                className="w-full border border-red-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Torneira com vazamento grave, danos estruturais, problema de segurança..."
                value={motivoBloqueio}
                onChange={(e) => setMotivoBloqueio(e.target.value)}
              />
              <button
                onClick={solicitarBloqueio}
                disabled={!motivoBloqueio.trim() || enviandoBloqueio}
                className="mt-3 w-full py-3 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50"
              >
                {enviandoBloqueio ? "Enviando..." : "🚨 Confirmar bloqueio"}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ─── LISTA DE UHs ─────────────────────────────────────────────────────────
  const { assignments: rawAssignments, user } = data!;

  // UHs com reserva primeiro, depois ordem padrão
  const assignments = [...rawAssignments].sort((a, b) => {
    if (a.temReserva && !b.temReserva) return -1;
    if (!a.temReserva && b.temReserva) return 1;
    return 0;
  });

  const concluidas = assignments.filter((a) => ["CONCLUIDO", "INSPECIONADO"].includes(a.status)).length;
  const total = assignments.length;

  return (
    <><div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-blue-700 text-white p-5">
        <p className="text-sm opacity-80">Bom dia,</p>
        <h1 className="text-2xl font-bold">{user?.nome}</h1>
        <p className="text-sm opacity-80 mt-1">
          {concluidas} de {total} UHs concluídas
        </p>
        {total > 0 && (
          <div className="mt-2 bg-blue-600 rounded-full h-1.5">
            <div
              className="bg-white rounded-full h-1.5 transition-all"
              style={{ width: `${(concluidas / total) * 100}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {assignments.length === 0 && (
          <div className="card text-center text-gray-500 py-8">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p>Nenhuma UH atribuída para hoje.</p>
          </div>
        )}

        {assignments.map((a) => {
          const bloqueado = a.status === "PENDENTE";
          const emAndamento = a.status === "EM_ANDAMENTO" && a.cleaningSession && !a.cleaningSession.finalizadaEm;
          const concluido = ["CONCLUIDO", "INSPECIONADO"].includes(a.status);
          const liberado = a.status === "LIBERADO";

          return (
            <div key={a.id} className={`card ${bloqueado ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {bloqueado && <Lock className="w-4 h-4 text-gray-400" />}
                    {concluido && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    <h3 className="font-bold text-lg">{a.uh.numero}</h3>
                    {a.uh.emManutencao && (
                      <span className="flex items-center gap-1 text-xs font-bold text-white bg-orange-500 rounded-full px-2 py-0.5">
                        <Wrench className="w-3 h-3" /> MANUTENÇÃO
                      </span>
                    )}
                    {a.uh.emManutencao && a.uh.manutencaoDescricao && (
                      <p className="w-full text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1 mt-1">
                        {a.uh.manutencaoDescricao}
                      </p>
                    )}
                    {a.temReserva && (
                      <span className="flex items-center gap-1 text-xs font-bold text-white bg-red-500 rounded-full px-2 py-0.5">
                        <BedDouble className="w-3 h-3" /> RESERVA
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{a.program?.nome || "Sem programa"}</p>
                  {a.observacoes && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                      {a.observacoes}
                    </p>
                  )}
                  {bloqueado && <p className="text-xs text-orange-500 mt-1">⏳ Aguardando liberação</p>}
                  {emAndamento && <p className="text-xs text-blue-600 mt-1">▶ Em andamento</p>}
                  {liberado && <p className="text-xs text-green-600 mt-1">🟢 Liberada — toque para iniciar</p>}
                  {concluido && <p className="text-xs text-green-600 mt-1">✓ Concluída</p>}
                  {a.solicitacaoStatus === "PENDENTE" && (
                    <p className="text-xs text-blue-600 mt-1">⏳ Solicitação enviada — aguardando aprovação</p>
                  )}
                  {a.solicitacaoStatus === "APROVADO" && (
                    <p className="text-xs text-green-600 mt-1">✅ Alteração aprovada</p>
                  )}
                  {a.solicitacaoStatus === "REJEITADO" && (
                    <p className="text-xs text-red-500 mt-1">❌ Alteração não aprovada</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-end">
                  {!bloqueado && !concluido && (
                    <button
                      onClick={() => iniciarLimpeza(a)}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium ${
                        emAndamento ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                      }`}
                    >
                      {emAndamento ? "Continuar" : <><Play className="w-4 h-4" /> Iniciar</>}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                  {liberado && (!a.solicitacaoStatus || a.solicitacaoStatus === "REJEITADO") && a.program?.tipo !== "LIMPEZA_COMPLETA" && (
                    <button
                      onClick={() => { setSolicitandoId(a.id); setSolicitacaoMsg(""); }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600"
                    >
                      <MessageSquarePlus className="w-3 h-3" /> Solicitar alteração
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>

      {/* Modal fora do container max-w-lg para não sofrer restrição de largura */}
      {solicitandoId && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setSolicitandoId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-800">Solicitar alteração</h3>
                <button onClick={() => setSolicitandoId(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">Explique para a governanta o motivo da solicitação:</p>
              <textarea
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: O quarto está muito sujo, precisa de limpeza completa..."
                value={solicitacaoMsg}
                onChange={(e) => setSolicitacaoMsg(e.target.value)}
              />
              <button
                onClick={() => solicitarAlteracao(solicitandoId)}
                disabled={!solicitacaoMsg.trim() || enviandoSolicitacao}
                className="mt-3 w-full btn-primary"
              >
                {enviandoSolicitacao ? "Enviando..." : "Enviar solicitação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
