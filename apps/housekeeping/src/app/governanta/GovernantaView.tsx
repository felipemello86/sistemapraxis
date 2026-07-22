"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, AlertTriangle, ChevronRight, ClipboardCheck, ArrowLeft, UserX, Building2, MessageSquare, ThumbsUp, ThumbsDown, Pencil, Star, Undo2, Flag } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/g/[token]/GovernantaView.tsx (v1),
// mesclado com o resumo de apps/housekeeping/src/app/governanta/GovernantaAdmin.tsx.
// Fica tudo numa tela só, acessada por sessão (/governance/governanta) em vez
// do link público /g/[token] — mesma decisão de arquitetura da camareira
// (ver mudança de fluxo conversada com o Felipe).
//
// Fluxo de Finalização do Dia (ranking + exclusão de UH do score com
// justificativa + confirmação) portado em cima de /api/finalizacao-dia —
// ver comentário lá pras diferenças em relação ao v1 (sem PDF; push de "dia
// finalizado" vai pra todos os usuários do tenant, não só MASTER/governanta).
//
// Deliberadamente FORA desta fatia (ficam pra depois):
//   - Botões de reportar falha de lavanderia / solicitar bloqueio de UH
//     dentro da tela de inspeção (a camareira já tem os dela em
//     CamareiraView; a versão da governanta é replicação, não essencial
//     pro loop operacional).
//   - Configurar cobertura de folga (modal + link tokenizado pra substituta).

type Sessao = {
  id: string;
  finalizadaEm: string;
  duracaoSegundos: number;
  uh: { numero: string; tipo: string };
  camareira: { nome: string };
  assignment: { data: string };
  inspection: {
    id: string;
    finalizadaEm: string | null;
    totalFalhas: number;
    totalFalhasGerenciais?: number;
    comentarioGovernanta?: string | null;
    itens: {
      id: string;
      categoria: string;
      item: string;
      ordem: number;
      resultado: string;
      tipoFalha: string;
      observacao: string | null;
    }[];
  } | null;
};

type Solicitacao = {
  id: string;
  data: string;
  solicitacaoMensagem: string;
  solicitacaoTipo: string | null;
  solicitacaoFotos: string; // JSON array — ver parseFotos abaixo
  uh: { numero: string };
  camareira: { nome: string };
};

function parseFotos(fotosJson: string): string[] {
  try {
    const arr = JSON.parse(fotosJson);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const CATEGORIA_ICONS: Record<string, string> = {
  CAMA: "🛏️", BANHEIRO: "🚿", QUARTO: "🏠", COZINHA: "🍳", GERAL: "✅",
};

type UhRanking = {
  sessaoId: string;
  uhNumero: string;
  falhas: number;
  score: number;
  excluidoDoScore: boolean;
  justificativaExclusao: string | null;
  multiplaCamareira: boolean;
};

type CamareiraRanking = {
  camareiraId: string;
  nome: string;
  foto: string | null;
  totalUHs: number;
  totalFalhas: number;
  mediaScore: number | null;
  uhs: UhRanking[];
};

type FinalizacaoDia = {
  data: string;
  pronta: boolean;
  totalUHsAtribuidas: number;
  totalInspecionadas: number;
  finalizado: boolean;
  finalizadoEm: string | null;
  finalizadoPorNome: string | null;
  ranking: CamareiraRanking[];
};

type Fase = "lista" | "inspecao" | "finalizacao";

export default function GovernantaView({ role, podeOperar }: { role: string; podeOperar: boolean }) {
  // somenteLeitura é uma restrição de CARGO, pré-existente (Manutenção nunca
  // opera aqui) — continua escondendo os botões, como sempre fez.
  // podeOperar é a restrição de ACESSO AO MÓDULO (ver comentário em
  // apps/maintenance/src/app/page.tsx): visualização sempre liberada, então
  // aqui os botões ficam visíveis e desabilitados em vez de escondidos.
  const somenteLeitura = role === "MANUTENCAO";
  const tituloSemAcesso = "Você não tem acesso para operar este módulo";
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [fase, setFase] = useState<Fase>("lista");
  const [sessaoAtiva, setSessaoAtiva] = useState<Sessao | null>(null);
  const [inspecaoId, setInspecaoId] = useState<string | null>(null);
  const [itens, setItens] = useState<NonNullable<Sessao["inspection"]>["itens"]>([]);
  const [itemAtualIdx, setItemAtualIdx] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [comentarioGovernanta, setComentarioGovernanta] = useState("");
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [salvandoCorrecao, setSalvandoCorrecao] = useState(false);
  const [finalizacao, setFinalizacao] = useState<FinalizacaoDia | null>(null);
  const [confirmandoDia, setConfirmandoDia] = useState(false);
  const [excluindoUh, setExcluindoUh] = useState<string | null>(null);
  const [justificativaTexto, setJustificativaTexto] = useState("");
  const [salvandoExclusao, setSalvandoExclusao] = useState(false);

  const carregar = useCallback(async () => {
    const [insp, sol, fin] = await Promise.all([
      apiFetch("/api/inspecoes").then((r) => r.json()),
      apiFetch("/api/atribuicoes/solicitacoes").then((r) => r.json()),
      apiFetch("/api/finalizacao-dia").then((r) => r.json()),
    ]);
    setSessoes(Array.isArray(insp) ? insp : []);
    setSolicitacoes(Array.isArray(sol) ? sol : []);
    setFinalizacao(fin && typeof fin === "object" && !Array.isArray(fin) ? fin : null);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function decidir(assignmentId: string, aprovado: boolean) {
    if (!podeOperar) return;
    setDecidindo(assignmentId);
    await apiFetch("/api/atribuicoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decidir_alteracao", assignmentId, aprovado }),
    });
    setDecidindo(null);
    carregar();
  }

  async function salvarCorrecao() {
    if (!inspecaoId || !podeOperar) return;
    setSalvandoCorrecao(true);

    await Promise.all(
      itens.map((item) =>
        apiFetch("/api/inspecoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "avaliar_item",
            inspecaoId,
            itemId: item.id,
            resultado: item.resultado,
            tipoFalha: item.tipoFalha,
          }),
        })
      )
    );

    await apiFetch("/api/inspecoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "corrigir", inspecaoId }),
    });

    setSalvandoCorrecao(false);
    setModoEdicao(false);
    await carregar();
    const insp = await apiFetch("/api/inspecoes").then((r) => r.json());
    const sessaoFresca = (Array.isArray(insp) ? insp : []).find((s: Sessao) => s.id === sessaoAtiva?.id);
    if (sessaoFresca) setSessaoAtiva(sessaoFresca);
  }

  async function iniciarInspecao(s: Sessao) {
    setSessaoAtiva(s);
    setModoEdicao(false);

    if (s.inspection && !s.inspection.finalizadaEm) {
      setInspecaoId(s.inspection.id);
      setItens(s.inspection.itens);
      setItemAtualIdx(0);
    } else if (!s.inspection) {
      // Criar a inspeção é uma operação de escrita — sem acesso ao módulo,
      // não tem o que exibir ainda (a UH nem começou a ser inspecionada).
      if (!podeOperar) { setFase("lista"); setSessaoAtiva(null); return; }
      const res = await apiFetch("/api/inspecoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessaoId: s.id }),
      });
      const inspecao = await res.json();
      setInspecaoId(inspecao.id);
      setItens(inspecao.itens);
      setItemAtualIdx(0);
    } else {
      setInspecaoId(s.inspection.id);
      setItens(s.inspection.itens);
      setItemAtualIdx(0);
    }

    setFase("inspecao");
    await carregar();
  }

  async function avaliarItem(resultado: "OK" | "FALHA", tipoFalha?: "CAMAREIRA" | "GERENCIAL") {
    const item = itens[itemAtualIdx];
    if (!item || !inspecaoId || !podeOperar) return;

    setSalvando(true);
    await apiFetch("/api/inspecoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "avaliar_item",
        inspecaoId,
        itemId: item.id,
        resultado,
        tipoFalha: resultado === "FALHA" ? (tipoFalha || "CAMAREIRA") : "CAMAREIRA",
      }),
    });

    setItens((prev) => prev.map((i) =>
      i.id === item.id ? { ...i, resultado, tipoFalha: resultado === "FALHA" ? (tipoFalha || "CAMAREIRA") : "CAMAREIRA" } : i
    ));
    setSalvando(false);
    setItemAtualIdx((i) => Math.min(i + 1, itens.length));
  }

  async function finalizarInspecao() {
    if (!inspecaoId || !podeOperar) return;
    setFinalizando(true);
    await apiFetch("/api/inspecoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalizar", inspecaoId, comentarioGovernanta: comentarioGovernanta.trim() || null }),
    });
    setFinalizando(false);
    setSessaoAtiva(null);
    setComentarioGovernanta("");
    setFase("lista");
    await carregar();
  }

  async function excluirUh(sessaoId: string) {
    if (!justificativaTexto.trim() || !podeOperar) return;
    setSalvandoExclusao(true);
    await apiFetch("/api/finalizacao-dia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "excluir_uh", sessaoId, justificativa: justificativaTexto.trim() }),
    });
    setSalvandoExclusao(false);
    setExcluindoUh(null);
    setJustificativaTexto("");
    await carregar();
  }

  async function reincluirUh(sessaoId: string) {
    if (!podeOperar) return;
    await apiFetch("/api/finalizacao-dia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reincluir_uh", sessaoId }),
    });
    await carregar();
  }

  async function confirmarDia() {
    if (!finalizacao || !podeOperar) return;
    setConfirmandoDia(true);
    await apiFetch("/api/finalizacao-dia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmar_dia", data: finalizacao.data }),
    });
    setConfirmandoDia(false);
    await carregar();
  }

  const itemAtual = itens[itemAtualIdx];
  const progresso = itens.length > 0 ? (itemAtualIdx / itens.length) * 100 : 0;
  const falhasCamareira = itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "CAMAREIRA").length;
  const falhasGerenciais = itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "GERENCIAL").length;
  const totalFalhasAtual = falhasCamareira + falhasGerenciais;
  const todosAvaliados = itens.length > 0 && itemAtualIdx >= itens.length;
  const categorias = Array.from(new Set(itens.map((i) => i.categoria)));

  if (loading) {
    return <div className="p-4 text-gray-400">Carregando...</div>;
  }

  // ─── FINALIZAÇÃO DO DIA ──────────────────────────────────────────────────
  if (fase === "finalizacao" && finalizacao) {
    return (
      <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
        <div className="bg-indigo-700 text-white p-5 sticky top-0 z-10">
          <button onClick={() => setFase("lista")} className="flex items-center gap-1 text-sm opacity-80 hover:opacity-100 mb-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Flag className="w-5 h-5" /> Finalização do Dia
          </h2>
          <p className="text-sm opacity-80 mt-0.5">
            {finalizacao.finalizado
              ? `Finalizado por ${finalizacao.finalizadoPorNome ?? "—"}`
              : `${finalizacao.totalInspecionadas}/${finalizacao.totalUHsAtribuidas} UHs inspecionadas`}
          </p>
        </div>

        <div className="p-4">
          {finalizacao.ranking.length === 0 && (
            <div className="card text-center py-8 text-gray-400">Nenhuma UH pontuável hoje.</div>
          )}

          {finalizacao.ranking.map((cam, idx) => (
            <div key={cam.camareiraId} className="card mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg font-bold text-gray-400 w-7 flex-shrink-0">{idx + 1}º</span>
                  {cam.foto ? (
                    <img src={cam.foto} alt={cam.nome} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                      {cam.nome.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 truncate">{cam.nome}</p>
                    <p className="text-xs text-gray-500">{cam.totalUHs} UH(s) · {cam.totalFalhas} falha(s)</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-indigo-600 flex-shrink-0">{cam.mediaScore ?? "—"}</p>
              </div>

              <div className="space-y-1.5 mt-2">
                {cam.uhs.map((uh) => (
                  <div key={uh.sessaoId} className={`text-sm rounded-lg px-2 py-1.5 ${uh.excluidoDoScore ? "bg-gray-100 text-gray-400" : "bg-gray-50"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={uh.excluidoDoScore ? "line-through" : ""}>
                        UH {uh.uhNumero} {uh.multiplaCamareira ? "(mutirão)" : `— ${uh.score} pts`}
                        {uh.falhas > 0 && <span className="text-red-500 ml-1">· {uh.falhas} falha(s)</span>}
                      </span>
                      {!somenteLeitura && !finalizacao.finalizado && !uh.multiplaCamareira && (
                        uh.excluidoDoScore ? (
                          <button onClick={() => reincluirUh(uh.sessaoId)} disabled={!podeOperar} title={!podeOperar ? tituloSemAcesso : undefined} className="text-xs text-indigo-600 font-medium flex items-center gap-1 flex-shrink-0 disabled:opacity-40">
                            <Undo2 className="w-3 h-3" /> Reincluir
                          </button>
                        ) : (
                          <button onClick={() => { setExcluindoUh(uh.sessaoId); setJustificativaTexto(""); }} disabled={!podeOperar} title={!podeOperar ? tituloSemAcesso : undefined} className="text-xs text-red-500 font-medium flex-shrink-0 disabled:opacity-40">
                            Excluir do ranking
                          </button>
                        )
                      )}
                    </div>
                    {uh.excluidoDoScore && uh.justificativaExclusao && (
                      <p className="text-xs text-gray-400 mt-0.5 italic">Motivo: {uh.justificativaExclusao}</p>
                    )}
                    {excluindoUh === uh.sessaoId && (
                      <div className="mt-2 bg-white border border-gray-200 rounded-lg p-2">
                        <textarea
                          rows={2}
                          autoFocus
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                          placeholder="Justificativa obrigatória (ex: camareira ajudou em outra UH)..."
                          value={justificativaTexto}
                          onChange={(e) => setJustificativaTexto(e.target.value)}
                        />
                        <div className="flex gap-2 mt-1.5">
                          <button
                            onClick={() => { setExcluindoUh(null); setJustificativaTexto(""); }}
                            className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => excluirUh(uh.sessaoId)}
                            disabled={!justificativaTexto.trim() || salvandoExclusao || !podeOperar}
                            title={!podeOperar ? tituloSemAcesso : undefined}
                            className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold disabled:opacity-50"
                          >
                            {salvandoExclusao ? "Salvando..." : "Confirmar exclusão"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!finalizacao.finalizado && !somenteLeitura && (
            <>
              <button
                onClick={confirmarDia}
                disabled={confirmandoDia || !finalizacao.pronta || !podeOperar}
                title={!podeOperar ? tituloSemAcesso : undefined}
                className="btn-primary w-full mt-2 py-4 text-base disabled:opacity-50"
              >
                {confirmandoDia ? "Enviando..." : "✅ Confirmar e Finalizar o Dia"}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                Ao confirmar, o ranking do dia é enviado por notificação pra toda a equipe.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── TELA DE INSPEÇÃO ────────────────────────────────────────────────────
  if (fase === "inspecao" && sessaoAtiva) {
    const jaFinalizada = sessaoAtiva.inspection?.finalizadaEm != null;

    return (
      <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
        <div className="bg-indigo-700 text-white p-5 sticky top-0 z-10">
          <button onClick={() => setFase("lista")} className="flex items-center gap-1 text-sm opacity-80 hover:opacity-100 mb-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{sessaoAtiva.uh.numero}</h2>
              <p className="text-sm opacity-80">Camareira: {sessaoAtiva.camareira.nome}</p>
            </div>
            {!jaFinalizada && (
              <div className="text-right">
                <p className="text-2xl font-bold text-red-300">{totalFalhasAtual}</p>
                <p className="text-xs opacity-70">falha(s)</p>
              </div>
            )}
          </div>
          {!jaFinalizada && (
            <>
              <div className="mt-3 bg-indigo-600 rounded-full h-2">
                <div className="bg-white rounded-full h-2 transition-all duration-300" style={{ width: `${progresso}%` }} />
              </div>
              <p className="text-xs opacity-70 mt-1">{Math.min(itemAtualIdx + 1, itens.length)} de {itens.length} itens</p>
            </>
          )}
        </div>

        <div className="p-4">
          {jaFinalizada ? (
            modoEdicao ? (
              <div>
                <p className="text-sm text-gray-500 mb-3">Toque em cada item para alterar o resultado.</p>
                {categorias.map((cat) => (
                  <div key={cat} className="mb-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                      {CATEGORIA_ICONS[cat]} {cat}
                    </p>
                    <div className="space-y-2">
                      {itens.filter((i) => i.categoria === cat).map((item) => (
                        <div key={item.id} className="card py-3">
                          <p className="text-sm font-medium text-gray-800 mb-2">{item.item}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setItens((prev) => prev.map((i) => i.id === item.id ? { ...i, resultado: "OK", tipoFalha: "CAMAREIRA" } : i))}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${item.resultado === "OK" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}
                            >
                              ✓ OK
                            </button>
                            <button
                              onClick={() => setItens((prev) => prev.map((i) => i.id === item.id ? { ...i, resultado: "FALHA", tipoFalha: "CAMAREIRA" } : i))}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${item.resultado === "FALHA" && item.tipoFalha === "CAMAREIRA" ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500"}`}
                            >
                              ✗ Camareira
                            </button>
                            <button
                              onClick={() => setItens((prev) => prev.map((i) => i.id === item.id ? { ...i, resultado: "FALHA", tipoFalha: "GERENCIAL" } : i))}
                              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${item.resultado === "FALHA" && item.tipoFalha === "GERENCIAL" ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}
                            >
                              ✗ Gerencial
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => { setModoEdicao(false); setItens(sessaoAtiva.inspection!.itens); }}
                    className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium"
                  >
                    Cancelar
                  </button>
                  <button onClick={salvarCorrecao} disabled={salvandoCorrecao || !podeOperar} title={!podeOperar ? tituloSemAcesso : undefined} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50">
                    {salvandoCorrecao ? "Salvando..." : "Salvar correção"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {(() => {
                  const insp = sessaoAtiva.inspection!;
                  const fCam = insp.itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "CAMAREIRA").length;
                  const fGer = insp.itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "GERENCIAL").length;
                  const total = fCam + fGer;
                  return (
                    <div className={`card mb-4 text-center ${total === 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      {total === 0 ? (
                        <>
                          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                          <p className="font-bold text-green-700">Sem falhas! Aprovada.</p>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                          <p className="font-bold text-red-700">{total} falha(s) encontrada(s)</p>
                          <div className="flex justify-center gap-4 mt-1 text-xs">
                            {fCam > 0 && <span className="text-red-600 font-medium">{fCam} camareira</span>}
                            {fGer > 0 && <span className="text-orange-600 font-medium">{fGer} gerencial</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {sessaoAtiva.inspection!.itens.filter((i) => i.resultado === "FALHA").map((item) => (
                  <div key={item.id} className={`card mb-2 border-l-4 ${item.tipoFalha === "GERENCIAL" ? "border-l-orange-400" : "border-l-red-400"}`}>
                    <div className="flex items-center gap-2">
                      {item.tipoFalha === "GERENCIAL"
                        ? <Building2 className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        : <UserX className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      <div>
                        <p className="text-xs text-gray-500">{CATEGORIA_ICONS[item.categoria]} {item.categoria}</p>
                        <p className="text-sm font-medium">{item.item}</p>
                        <p className={`text-xs ${item.tipoFalha === "GERENCIAL" ? "text-orange-600" : "text-red-500"}`}>
                          {item.tipoFalha === "GERENCIAL" ? "Gerencial" : "Camareira"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {!somenteLeitura && (
                  <button
                    onClick={() => { setModoEdicao(true); setItens(sessaoAtiva.inspection!.itens); }}
                    disabled={!podeOperar}
                    title={!podeOperar ? tituloSemAcesso : undefined}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-indigo-300 text-indigo-600 font-medium text-sm disabled:opacity-40"
                  >
                    <Pencil className="w-4 h-4" /> Corrigir inspeção
                  </button>
                )}
              </div>
            )
          ) : todosAvaliados ? (
            <div>
              <div className={`card mb-4 text-center ${totalFalhasAtual === 0 ? "bg-green-50" : "bg-yellow-50"}`}>
                <p className="text-lg font-bold mb-1">
                  {totalFalhasAtual === 0 ? "🎉 Sem falhas!" : `⚠️ ${totalFalhasAtual} falha(s) encontrada(s)`}
                </p>
                {falhasCamareira > 0 && <p className="text-sm text-red-600 font-medium">{falhasCamareira} falha(s) da camareira</p>}
                {falhasGerenciais > 0 && <p className="text-sm text-orange-600 font-medium">{falhasGerenciais} falha(s) gerencial(is)</p>}
              </div>

              {itens.filter((i) => i.resultado === "FALHA").map((item) => (
                <div key={item.id} className={`card mb-2 border-l-4 ${item.tipoFalha === "GERENCIAL" ? "border-l-orange-400" : "border-l-red-400"}`}>
                  <div className="flex items-center gap-2">
                    {item.tipoFalha === "GERENCIAL"
                      ? <Building2 className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      : <UserX className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <div>
                      <p className="text-sm font-medium">{item.item}</p>
                      <p className={`text-xs ${item.tipoFalha === "GERENCIAL" ? "text-orange-600" : "text-red-500"}`}>
                        {item.tipoFalha === "GERENCIAL" ? "Falha gerencial" : "Falha camareira"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="card mt-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 font-medium mb-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Comentário da inspeção (opcional)
                </label>
                <textarea
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Observações gerais sobre a limpeza desta UH..."
                  value={comentarioGovernanta}
                  onChange={(e) => setComentarioGovernanta(e.target.value)}
                />
              </div>

              <button onClick={finalizarInspecao} disabled={finalizando || !podeOperar} title={!podeOperar ? tituloSemAcesso : undefined} className="btn-primary w-full mt-4 py-4 text-base disabled:opacity-50">
                {finalizando ? "Salvando..." : "✓ Finalizar Inspeção"}
              </button>
            </div>
          ) : (
            <div>
              {itemAtual && (
                <div className="card mb-4">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-2xl">{CATEGORIA_ICONS[itemAtual.categoria]}</span>
                    <div>
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{itemAtual.categoria}</p>
                      <h3 className="text-lg font-bold text-gray-900 mt-0.5">{itemAtual.item}</h3>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => avaliarItem("OK")}
                      disabled={salvando || !podeOperar}
                      title={!podeOperar ? tituloSemAcesso : undefined}
                      className="flex items-center justify-center gap-2 bg-green-100 text-green-700 font-bold py-4 rounded-xl hover:bg-green-200 transition-colors text-base w-full disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-5 h-5" /> OK — Aprovado
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => avaliarItem("FALHA", "CAMAREIRA")}
                        disabled={salvando || !podeOperar}
                        title={!podeOperar ? tituloSemAcesso : undefined}
                        className="flex items-center justify-center gap-1.5 bg-red-100 text-red-700 font-bold py-4 rounded-xl hover:bg-red-200 transition-colors text-sm disabled:opacity-50"
                      >
                        <UserX className="w-4 h-4" /> Falha Camareira
                      </button>
                      <button
                        onClick={() => avaliarItem("FALHA", "GERENCIAL")}
                        disabled={salvando || !podeOperar}
                        title={!podeOperar ? tituloSemAcesso : undefined}
                        className="flex items-center justify-center gap-1.5 bg-orange-100 text-orange-700 font-bold py-4 rounded-xl hover:bg-orange-200 transition-colors text-sm disabled:opacity-50"
                      >
                        <Building2 className="w-4 h-4" /> Falha Gerencial
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {itemAtualIdx > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Já avaliados — toque para corrigir</p>
                  <div className="space-y-1">
                    {itens.slice(0, itemAtualIdx).map((i, idx) => (
                      <button
                        key={i.id}
                        onClick={() => setItemAtualIdx(idx)}
                        className="w-full flex items-center gap-2 text-sm py-2 px-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                      >
                        {i.resultado === "OK" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <span className={i.resultado === "FALHA" ? "text-red-700 font-medium" : "text-gray-400"}>{i.item}</span>
                        {i.resultado === "FALHA" && (
                          <span className={`ml-auto text-xs ${i.tipoFalha === "GERENCIAL" ? "text-orange-500" : "text-red-500"}`}>
                            {i.tipoFalha === "GERENCIAL" ? "gerencial" : "camareira"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── LISTA ────────────────────────────────────────────────────────────────
  const pendentes = sessoes.filter((s) => !s.inspection?.finalizadaEm);
  const concluidas = sessoes.filter((s) => s.inspection?.finalizadaEm);

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Controle de Inspeções</h1>
        <p className="text-gray-500 text-sm mt-0.5">Acompanhe e realize as inspeções do dia</p>
      </div>

      {finalizacao?.finalizado && (
        <div
          className="card mb-4 border-l-4 border-l-green-400 bg-green-50/40 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setFase("finalizacao")}
        >
          <div>
            <p className="font-bold text-green-700 flex items-center gap-1.5"><Flag className="w-4 h-4" /> Dia finalizado</p>
            <p className="text-xs text-gray-500 mt-0.5">por {finalizacao.finalizadoPorNome} — toque pra ver o ranking</p>
          </div>
          <ChevronRight className="w-5 h-5 text-green-500 flex-shrink-0" />
        </div>
      )}
      {!finalizacao?.finalizado && finalizacao?.pronta && !somenteLeitura && (
        <div
          className="card mb-4 border-l-4 border-l-indigo-400 bg-indigo-50/40 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setFase("finalizacao")}
        >
          <div>
            <p className="font-bold text-indigo-700 flex items-center gap-1.5"><Flag className="w-4 h-4" /> Todas as UHs foram inspecionadas</p>
            <p className="text-xs text-gray-500 mt-0.5">Revise o ranking e finalize o dia</p>
          </div>
          <ChevronRight className="w-5 h-5 text-indigo-500 flex-shrink-0" />
        </div>
      )}

      {solicitacoes.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">
            ⚠️ Solicitações pendentes ({solicitacoes.length})
          </p>
          <div className="space-y-2">
            {solicitacoes.map((s) => {
              const ehSuperLimpeza = s.solicitacaoTipo === "SUPER_LIMPEZA";
              const fotos = parseFotos(s.solicitacaoFotos);
              return (
                <div
                  key={s.id}
                  className={`card border-l-4 ${ehSuperLimpeza ? "border-l-amber-400 bg-amber-50/40" : "border-l-orange-400"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 flex items-center gap-1">
                        {ehSuperLimpeza && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                        UH {s.uh.numero} <span className="font-normal text-gray-500 text-sm">— {s.camareira.nome}</span>
                      </p>
                      {ehSuperLimpeza && (
                        <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide mt-0.5">
                          Pedido de Super Limpeza ⭐️
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mt-0.5 italic">"{s.solicitacaoMensagem}"</p>
                      {fotos.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {fotos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={url}
                                alt={`Foto ${i + 1}`}
                                className="w-14 h-14 object-cover rounded-lg border border-gray-200"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {!somenteLeitura && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => decidir(s.id, true)}
                          disabled={decidindo === s.id || !podeOperar}
                          title={!podeOperar ? tituloSemAcesso : undefined}
                          className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200 disabled:opacity-40"
                        >
                          <ThumbsUp className="w-3 h-3" /> Aprovar
                        </button>
                        <button
                          onClick={() => decidir(s.id, false)}
                          disabled={decidindo === s.id || !podeOperar}
                          title={!podeOperar ? tituloSemAcesso : undefined}
                          className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 disabled:opacity-40"
                        >
                          <ThumbsDown className="w-3 h-3" /> {ehSuperLimpeza ? "Indeferir" : "Rejeitar"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-indigo-600">{pendentes.length}</p>
          <p className="text-sm text-gray-500">Aguardando inspeção</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{concluidas.length}</p>
          <p className="text-sm text-gray-500">Inspecionadas</p>
        </div>
      </div>

      <div className="space-y-3">
        {pendentes.length > 0 && <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Aguardando inspeção</p>}
        {pendentes.map((s) => (
          <div key={s.id} className="card border-l-4 border-l-indigo-400 cursor-pointer hover:shadow-md transition-shadow" onClick={() => iniciarInspecao(s)}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">{s.uh.numero}</h3>
                <p className="text-sm text-gray-500">por {s.camareira.nome}</p>
                {s.inspection && !s.inspection.finalizadaEm && <p className="text-xs text-blue-600">▶ Inspeção em andamento</p>}
              </div>
              <ChevronRight className="w-5 h-5 text-indigo-400" />
            </div>
          </div>
        ))}

        {concluidas.length > 0 && <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mt-4">Inspecionadas hoje</p>}
        {concluidas.map((s) => (
          <div
            key={s.id}
            className={`card cursor-pointer hover:shadow-md transition-shadow ${s.inspection!.totalFalhas > 0 ? "border-l-4 border-l-red-400" : "border-l-4 border-l-green-400"}`}
            onClick={() => iniciarInspecao(s)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold">{s.uh.numero}</h3>
                <p className="text-sm text-gray-500">por {s.camareira.nome}</p>
              </div>
              {s.inspection!.totalFalhas === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <div className="flex items-center gap-1 text-red-500">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-bold">{s.inspection!.totalFalhas}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {sessoes.length === 0 && (
          <div className="card text-center py-12 text-gray-400">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p>Nenhuma UH pronta para inspeção ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
