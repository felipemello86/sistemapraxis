"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CheckSquare, Square, ArrowUpDown, Lock, Unlock, CheckCircle2, Edit2, Check, X, Clock, Camera, ShieldCheck, ChevronRight, AlertTriangle, BedDouble, ChevronLeft, Undo2, Wrench, Trash2, MessageCircle, MessageCirclePlus, Paperclip, Flag } from "lucide-react";
import { formatarTempo } from "@/lib/scoring";
import { apiFetch } from "@/lib/apiFetch";
import { uploadFoto } from "@/lib/uploadFoto";
import QueixaDetailModal from "@/components/QueixaDetailModal";
import ManutencaoHojeModal from "@/components/ManutencaoHojeModal";
import UHDetailModal from "@/components/UHDetailModal";
import JustificativaModal from "@/components/JustificativaModal";

// Portado de apps/housekeeping/src/app/selecao/SelecaoView.tsx (v1). Mesma UI
// e comportamento. Diferenças desta fatia:
//   - `role` vem por prop (definido no server component da rota), em vez do
//     hook `useSession()` do next-auth — v2 não usa next-auth, a sessão é
//     lida no servidor via cookie único da suíte.
//   - fetch cru → apiFetch (prefixa o basePath "/governance").

type UHSel = {
  uhId: string;
  numero: string;
  liberada: boolean;
  liberadaEm: string | null;
  temReserva: boolean;
  emManutencao: boolean;
  manutencaoDescricao: string | null;
  // Bloqueio pra reservas — automático (NC urgente registrada, ver
  // packages/core/src/maintenanceUrgente.ts) ou manual (ver
  // apps/housekeeping/src/app/api/bloqueio/route.ts). Só indicador visual
  // aqui, não gateia a liberação pra limpeza (decisão do Felipe).
  bloqueada: boolean;
  bloqueioDescricao: string | null;
  assignmentId: string | null;
  camareiraId: string | null;
  camareiraNome: string | null;
  assignmentStatus: string | null;
  observacoes: string | null;
  comentario: string | null;
  comentarioPorNome: string | null;
  comentarioEm: string | null;
  // Prioridade — flag com motivo obrigatório (ex.: hóspede VIP, pedido
  // especial), exibida do mesmo jeito nas demais telas (pedido explícito do
  // Felipe: "sempre").
  prioridade: boolean;
  prioridadeDescricao: string | null;
  prioridadePorNome: string | null;
  prioridadeEm: string | null;
  queixas: { id: string; titulo: string; tipo: string; descricao: string; pontosDescontados: number | null; anexos: QueixaAnexo[]; createdAt: string }[];
  lateCheckout: boolean;
  lateCheckoutHora: string | null;
  lateCheckoutPorNome: string | null;
  // Itens do checklist de Manutenção aplicáveis a essa UH — alimenta o
  // seletor obrigatório do modal "Solicitar manutenção" (pedido explícito do
  // Felipe: todo defeito precisa ser associado a um item real do cadastro).
  itensManutencao: { id: string; name: string; category: string }[];
};

type QueixaAnexo = { url: string; fileName: string; fileSize?: number };

type UH = { id: string; numero: string };

const TIPO_QUEIXA_LABEL: Record<string, string> = {
  LIMPEZA: "Limpeza", MANUTENCAO: "Manutenção", LAVANDERIA: "Lavanderia", OUTRA: "Outra",
};

const STATUS_COLOR: Record<string, string> = {
  PENDENTE: "text-gray-400",
  LIBERADO: "text-yellow-600",
  EM_ANDAMENTO: "text-blue-600",
  CONCLUIDO: "text-orange-600",
  INSPECIONADO: "text-green-600",
};

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando",
  LIBERADO: "Liberada",
  EM_ANDAMENTO: "Em limpeza",
  CONCLUIDO: "Em Inspeção",
  INSPECIONADO: "Liberado para check-in",
};

export default function SelecaoView({ role, podeOperar }: { role: string; podeOperar: boolean }) {
  // somenteLeitura é restrição de CARGO (Manutenção só visualiza aqui);
  // podeOperar é a restrição de ACESSO AO MÓDULO (ver comentário em
  // apps/maintenance/src/app/page.tsx) — visualização sempre liberada, só
  // operar fica bloqueado. Os botões de ação checam os dois.
  const somenteLeitura = role === "MANUTENCAO";
  const tituloSemAcesso = "Você não tem acesso para operar este módulo";
  // Comentário na UH é restrito a MASTER/GERENTE/ATENDIMENTO (decisão
  // explícita do Felipe) — diferente de somenteLeitura, que também libera
  // GOVERNANTA pras demais ações desta tela.
  const podeComentar = ["MASTER", "GERENTE", "ATENDIMENTO"].includes(role);
  // Desbloqueio manual da UH — pedido explícito do Felipe: Atendimento,
  // Governança, Gerente e Master (mesmo conjunto de roles que já tem
  // permissão pra ação "desbloquear" no PATCH /api/selecao-uhs).
  const podeDesbloquear = ["MASTER", "GERENTE", "ATENDIMENTO", "GOVERNANTA"].includes(role);
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [data, setData] = useState(hoje);
  const [modo, setModo] = useState<"selecao" | "liberacao">("selecao");

  const [todasUHs, setTodasUHs] = useState<UH[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [ascending, setAscending] = useState(true);

  const [uhsLiberacao, setUHsLiberacao] = useState<UHSel[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"numero" | "status">("numero");
  const [detalheAssignmentId, setDetalheAssignmentId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [liberandoId, setLiberandoId] = useState<string | null>(null);
  const [desfazendoId, setDesfazendoId] = useState<string | null>(null);
  const [desbloqueandoId, setDesbloqueandoId] = useState<string | null>(null);
  const [confirmandoDesfazer, setConfirmandoDesfazer] = useState<string | null>(null);
  const [renovandoId, setRenovandoId] = useState<string | null>(null);
  const [confirmandoRenovar, setConfirmandoRenovar] = useState<string | null>(null);
  // "Liberar sem inspeção" / "Limpeza sem Registro" — pedido do Felipe
  // (04/08/2026), mesmo conjunto de roles de podeDesbloquear
  // (Governanta/Gerente/Atendimento/Master). Guardam a UHSel inteira porque
  // as duas ações precisam de uhId + (quando existe) assignmentId.
  const [liberandoSemInspecao, setLiberandoSemInspecao] = useState<UHSel | null>(null);
  const [enviandoLiberacaoSemInspecao, setEnviandoLiberacaoSemInspecao] = useState(false);
  const [limpezaSemRegistro, setLimpezaSemRegistro] = useState<UHSel | null>(null);
  const [enviandoLimpezaSemRegistro, setEnviandoLimpezaSemRegistro] = useState(false);
  const [manutencaoModal, setManutencaoModal] = useState<UHSel | null>(null);
  const [manutencaoDescricaoInput, setManutencaoDescricaoInput] = useState("");
  const [manutencaoItemIdInput, setManutencaoItemIdInput] = useState("");
  // Urgência e prioridade — mesma pergunta obrigatória dos outros pontos de
  // entrada de NC (pedido explícito do Felipe, 04/08/2026).
  const [manutencaoUrgenteInput, setManutencaoUrgenteInput] = useState<boolean | null>(null);
  const [manutencaoPrioridadeInput, setManutencaoPrioridadeInput] = useState<boolean | null>(null);
  // Popup "Manutenção de hoje" (pedido explícito do Felipe, 04/08/2026) —
  // diferente de manutencaoModal (formulário pra ABRIR uma nova
  // manutenção): este é só leitura dos cards já programados pra essa UH
  // hoje, aberto ao clicar na flag quando ela já está ligada. Substituiu o
  // comportamento anterior de desligar a manutenção na hora do clique, sem
  // nenhuma confirmação.
  const [manutencaoHojeModal, setManutencaoHojeModal] = useState<UHSel | null>(null);
  const [encerrandoManutencao, setEncerrandoManutencao] = useState(false);
  const [queixaModal, setQueixaModal] = useState<UHSel | null>(null);
  const [queixaTituloInput, setQueixaTituloInput] = useState("");
  const [queixaTipoInput, setQueixaTipoInput] = useState<"LIMPEZA" | "MANUTENCAO" | "LAVANDERIA" | "OUTRA">("LIMPEZA");
  const [queixaDescricaoInput, setQueixaDescricaoInput] = useState("");
  const [enviandoQueixa, setEnviandoQueixa] = useState(false);
  const [queixaAnexos, setQueixaAnexos] = useState<QueixaAnexo[]>([]);
  const [enviandoAnexoQueixa, setEnviandoAnexoQueixa] = useState(false);
  const [erroAnexoQueixa, setErroAnexoQueixa] = useState<string | null>(null);
  const [queixaDetalheId, setQueixaDetalheId] = useState<string | null>(null);
  const [queixaEscolherEntre, setQueixaEscolherEntre] = useState<UHSel["queixas"] | null>(null);
  const [lateCheckoutModal, setLateCheckoutModal] = useState<UHSel | null>(null);
  const [lateCheckoutHoraInput, setLateCheckoutHoraInput] = useState("");
  const [salvandoLateCheckout, setSalvandoLateCheckout] = useState(false);

  function abrirBalaoQueixas(queixas: UHSel["queixas"]) {
    if (queixas.length === 1) setQueixaDetalheId(queixas[0].id);
    else setQueixaEscolherEntre(queixas);
  }

  function abrirLateCheckout(uh: UHSel) {
    setLateCheckoutHoraInput(uh.lateCheckoutHora ?? "");
    setLateCheckoutModal(uh);
  }

  async function confirmarLateCheckout() {
    if (!lateCheckoutModal || !lateCheckoutHoraInput || !podeOperar) return;
    setSalvandoLateCheckout(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ativar_late_checkout",
        data,
        uhId: lateCheckoutModal.uhId,
        horaSaida: lateCheckoutHoraInput,
      }),
    });
    setSalvandoLateCheckout(false);
    setLateCheckoutModal(null);
    carregar();
  }

  async function desativarLateCheckout() {
    if (!lateCheckoutModal || !podeOperar) return;
    setSalvandoLateCheckout(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "desativar_late_checkout", data, uhId: lateCheckoutModal.uhId }),
    });
    setSalvandoLateCheckout(false);
    setLateCheckoutModal(null);
    carregar();
  }

  // Prioridade — mesmo padrão do Late Check-out acima (modal com campo
  // obrigatório), mas com texto livre em vez de horário. Diferente do
  // comentário (opcional, edição inline), aqui o motivo é sempre exigido
  // pra ativar (pedido explícito do Felipe).
  const [prioridadeModal, setPrioridadeModal] = useState<UHSel | null>(null);
  const [prioridadeDescricaoInput, setPrioridadeDescricaoInput] = useState("");
  const [salvandoPrioridade, setSalvandoPrioridade] = useState(false);

  function abrirPrioridade(uh: UHSel) {
    setPrioridadeDescricaoInput(uh.prioridadeDescricao ?? "");
    setPrioridadeModal(uh);
  }

  async function confirmarPrioridade() {
    if (!prioridadeModal || !prioridadeDescricaoInput.trim() || !podeOperar) return;
    setSalvandoPrioridade(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_prioridade",
        data,
        uhId: prioridadeModal.uhId,
        descricao: prioridadeDescricaoInput.trim(),
      }),
    });
    setSalvandoPrioridade(false);
    setPrioridadeModal(null);
    carregar();
  }

  async function removerPrioridade() {
    if (!prioridadeModal || !podeOperar) return;
    setSalvandoPrioridade(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remover_prioridade", data, uhId: prioridadeModal.uhId }),
    });
    setSalvandoPrioridade(false);
    setPrioridadeModal(null);
    carregar();
  }

  const [editandoComentarioId, setEditandoComentarioId] = useState<string | null>(null);
  const [comentarioInput, setComentarioInput] = useState("");
  const [modoReedicao, setModoReedicao] = useState(false);

  useEffect(() => { carregar(); }, [data]);

  async function carregar() {
    setLoading(true);
    const [uhsR, selR] = await Promise.all([
      apiFetch("/api/uhs").then((r) => r.json()),
      apiFetch(`/api/selecao-uhs?data=${data}`).then((r) => r.json()),
    ]);

    const lista: UH[] = Array.isArray(uhsR) ? uhsR : [];
    setTodasUHs(lista);

    if (selR.confirmado) {
      setModo("liberacao");
      setUHsLiberacao(selR.uhs ?? []);
      setModoReedicao(false);
    } else {
      setModo("selecao");
      const ids: string[] = (selR.uhs ?? []).map((u: UHSel) => u.uhId);
      setSelecionadas(ids.length === 0 ? new Set(lista.map((u) => u.id)) : new Set(ids));
      setModoReedicao(ids.length > 0);
    }
    setLoading(false);
  }

  function toggle(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function salvarSelecao() {
    if (!podeOperar) return;
    setSalvando(true);
    await apiFetch("/api/selecao-uhs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, uhIds: Array.from(selecionadas) }),
    });
    setSalvando(false);
  }

  async function confirmar() {
    if (!podeOperar) return;
    setSalvando(true);
    await apiFetch("/api/selecao-uhs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, uhIds: Array.from(selecionadas) }),
    });
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmar", data }),
    });
    setSalvando(false);
    carregar();
  }

  async function reeditar() {
    if (!podeOperar) return;
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reeditar", data }),
    });
    setModoReedicao(true);
    carregar();
  }

  async function desistirEdicao() {
    if (!podeOperar) return;
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirmar", data }),
    });
    setModoReedicao(false);
    carregar();
  }

  async function toggleReserva(uh: UHSel) {
    if (!podeOperar) return;
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_reserva", data, uhId: uh.uhId }),
    });
    carregar();
  }

  function toggleManutencao(uh: UHSel) {
    // UH já em manutenção → abre o popup "Manutenção de hoje" (leitura dos
    // cards programados + botão opcional de encerrar), em vez de desligar
    // na hora do clique (pedido explícito do Felipe, 04/08/2026 — também
    // acaba adicionando uma confirmação que não existia antes). Quem não
    // pode operar ainda assim consegue ver o popup, só sem o botão de
    // encerrar (checado dentro do próprio popup/handler).
    if (uh.emManutencao) {
      setManutencaoHojeModal(uh);
      return;
    }
    if (!podeOperar) return;
    setManutencaoDescricaoInput("");
    setManutencaoItemIdInput("");
    setManutencaoUrgenteInput(null);
    setManutencaoPrioridadeInput(null);
    setManutencaoModal(uh);
  }

  async function confirmarManutencao(
    uh: UHSel,
    descricao: string | null,
    checklistItemId: string | null,
    // Só usados no caminho "solicitar" (novo registro) — pedido explícito
    // do Felipe, 04/08/2026: esse atalho passou a perguntar urgência e
    // prioridade também, igual aos outros pontos de entrada de NC.
    // encerrarManutencaoHoje (desligar) não passa esses dois — a ação
    // "desligar" no servidor nem olha pra eles.
    urgente?: boolean,
    prioridade?: boolean,
  ) {
    if (!podeOperar) return;
    setManutencaoModal(null);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_manutencao", data, uhId: uh.uhId, descricao, checklistItemId, urgente, prioridade }),
    });
    // Ligar marca a UH em manutenção na hora (sem aprovação — pedido
    // explícito do Felipe) e já cria a NC no item real escolhido. carregar()
    // já traz emManutencao=true refletido no badge, sem precisar de aviso.
    carregar();
  }

  // Encerrar a partir do popup "Manutenção de hoje" — reaproveita o mesmo
  // PATCH toggle_manutencao que já desligava a flag (confirmarManutencao),
  // só que agora atrás de um clique explícito de confirmação dentro do
  // popup, em vez do clique direto na flag.
  async function encerrarManutencaoHoje(uh: UHSel) {
    if (!podeOperar) return;
    setEncerrandoManutencao(true);
    try {
      await confirmarManutencao(uh, null, null);
    } finally {
      setEncerrandoManutencao(false);
      setManutencaoHojeModal(null);
    }
  }

  function abrirQueixa(uh: UHSel) {
    setQueixaTituloInput("");
    setQueixaTipoInput("LIMPEZA");
    setQueixaDescricaoInput("");
    setQueixaAnexos([]);
    setErroAnexoQueixa(null);
    setQueixaModal(uh);
  }

  // Anexo é opcional — pode ser foto, PDF etc. (resourceType=auto deixa o
  // Cloudinary detectar sozinho, ver /api/upload). Enviado assim que
  // escolhido; a URL só é usada no PATCH final, junto com o resto da queixa.
  async function uploadAnexoQueixa(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErroAnexoQueixa("Arquivo muito grande (máximo 8 MB).");
      return;
    }
    setErroAnexoQueixa(null);
    setEnviandoAnexoQueixa(true);
    try {
      const json = await uploadFoto(file, { tipo: "queixa", pasta: "queixas", resourceType: "auto" });
      setQueixaAnexos((prev) => [...prev, { url: json.url, fileName: json.originalName ?? file.name, fileSize: json.fileSize }]);
    } catch (e) {
      setErroAnexoQueixa(e instanceof Error ? e.message : "Falha ao enviar o anexo.");
    } finally {
      setEnviandoAnexoQueixa(false);
    }
  }

  async function registrarQueixa() {
    if (!queixaModal || !queixaTituloInput.trim() || !queixaDescricaoInput.trim() || !podeOperar) return;
    setEnviandoQueixa(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "registrar_queixa",
        data,
        uhId: queixaModal.uhId,
        titulo: queixaTituloInput.trim(),
        tipo: queixaTipoInput,
        descricao: queixaDescricaoInput.trim(),
        anexos: queixaAnexos,
      }),
    });
    setEnviandoQueixa(false);
    setQueixaModal(null);
    setQueixaAnexos([]);
    carregar();
  }

  async function salvarComentario(uh: UHSel) {
    if (!podeOperar) return;
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_comentario", data, uhId: uh.uhId, comentario: comentarioInput }),
    });
    setEditandoComentarioId(null);
    carregar();
  }

  async function liberarUH(uh: UHSel) {
    if (uh.liberada || !podeOperar) return;
    setLiberandoId(uh.uhId);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "liberar", data, uhId: uh.uhId, assignmentId: uh.assignmentId }),
    });
    setLiberandoId(null);
    carregar();
  }

  async function desbloquearUH(uh: UHSel) {
    if (!podeOperar || !podeDesbloquear) return;
    setDesbloqueandoId(uh.uhId);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "desbloquear", data, uhId: uh.uhId }),
    });
    setDesbloqueandoId(null);
    carregar();
  }

  async function confirmarLiberarSemInspecao(justificativa: string) {
    if (!liberandoSemInspecao || !podeOperar) return;
    setEnviandoLiberacaoSemInspecao(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "liberar_sem_inspecao",
        uhId: liberandoSemInspecao.uhId,
        assignmentId: liberandoSemInspecao.assignmentId,
        justificativa,
      }),
    });
    setEnviandoLiberacaoSemInspecao(false);
    setLiberandoSemInspecao(null);
    carregar();
  }

  async function confirmarLimpezaSemRegistro(justificativa: string) {
    if (!limpezaSemRegistro || !podeOperar) return;
    setEnviandoLimpezaSemRegistro(true);
    await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "limpeza_sem_registro",
        uhId: limpezaSemRegistro.uhId,
        assignmentId: limpezaSemRegistro.assignmentId,
        justificativa,
      }),
    });
    setEnviandoLimpezaSemRegistro(false);
    setLimpezaSemRegistro(null);
    carregar();
  }

  async function renovarUH(uh: UHSel) {
    if (!podeOperar) return;
    setConfirmandoRenovar(null);
    setRenovandoId(uh.uhId);
    const res = await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "renovar", data, uhId: uh.uhId, assignmentId: uh.assignmentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Não foi possível renovar. A limpeza pode já ter sido iniciada.");
    }
    setRenovandoId(null);
    carregar();
  }

  async function desfazerLiberacao(uh: UHSel) {
    if (!podeOperar) return;
    setConfirmandoDesfazer(null);
    setDesfazendoId(uh.uhId);
    const res = await apiFetch("/api/selecao-uhs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "desfazer_liberacao", data, uhId: uh.uhId, assignmentId: uh.assignmentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? "Não foi possível desfazer. A limpeza pode já ter sido iniciada.");
    }
    setDesfazendoId(null);
    carregar();
  }

  const sortedTodasUHs = [...todasUHs].sort((a, b) =>
    ascending ? a.numero.localeCompare(b.numero, undefined, { numeric: true })
              : b.numero.localeCompare(a.numero, undefined, { numeric: true })
  );

  const STATUS_ORDER: Record<string, number> = {
    PENDENTE: 0, LIBERADO: 1, EM_ANDAMENTO: 2, CONCLUIDO: 3, INSPECIONADO: 4,
  };

  const uhsFiltradas = !filtroStatus
    ? uhsLiberacao
    : filtroStatus === "__RESERVA__"
      ? uhsLiberacao.filter((u) => u.temReserva)
      : filtroStatus === "__MANUTENCAO__"
        ? uhsLiberacao.filter((u) => u.emManutencao)
        : filtroStatus === "__BLOQUEADA__"
          ? uhsLiberacao.filter((u) => u.bloqueada)
          : uhsLiberacao.filter((u) => (u.assignmentStatus ?? "PENDENTE") === filtroStatus);

  const sortedLiberacao = [...uhsFiltradas].sort((a, b) => {
    if (sortBy === "status") {
      const sa = STATUS_ORDER[a.assignmentStatus ?? "PENDENTE"] ?? 99;
      const sb = STATUS_ORDER[b.assignmentStatus ?? "PENDENTE"] ?? 99;
      return ascending ? sa - sb : sb - sa;
    }
    return ascending
      ? a.numero.localeCompare(b.numero, undefined, { numeric: true })
      : b.numero.localeCompare(a.numero, undefined, { numeric: true });
  });

  const totalLiberadas = uhsLiberacao.filter((u) => u.liberada || (u.assignmentStatus !== null && u.assignmentStatus !== "PENDENTE")).length;
  const totalSel = uhsLiberacao.length;

  const statusPresentes = Array.from(new Set(uhsLiberacao.map((u) => u.assignmentStatus ?? "PENDENTE")));
  const comReserva = uhsLiberacao.filter((u) => u.temReserva).length;
  const emManutencaoCount = uhsLiberacao.filter((u) => u.emManutencao).length;
  const bloqueadaCount = uhsLiberacao.filter((u) => u.bloqueada).length;
  const FILTROS_ESPECIAIS: { key: string; label: string; count: number; cor: string }[] = [
    // Bloqueio (NC urgente ou manual) primeiro — é o status mais crítico.
    // Só indicador/filtro visual, não gateia a liberação pra limpeza.
    ...(bloqueadaCount > 0     ? [{ key: "__BLOQUEADA__",  label: "Bloqueada",     count: bloqueadaCount,    cor: "bloqueada" }] : []),
    ...(comReserva > 0        ? [{ key: "__RESERVA__",    label: "Com Reserva",   count: comReserva,        cor: "reserva" }] : []),
    ...(emManutencaoCount > 0 ? [{ key: "__MANUTENCAO__", label: "Em Manutenção", count: emManutencaoCount, cor: "manutencao" }] : []),
  ];

  const FILTROS: { key: string | null; label: string; count?: number }[] = [
    { key: null,              label: "Todos",        count: uhsLiberacao.length },
    { key: "PENDENTE",        label: "Aguardando" },
    { key: "LIBERADO",        label: "Liberada" },
    { key: "EM_ANDAMENTO",    label: "Em limpeza" },
    { key: "CONCLUIDO",       label: "Em Inspeção" },
    { key: "INSPECIONADO",    label: "Check-in" },
  ].filter((f) => f.key === null || statusPresentes.includes(f.key as string));

  if (loading) return <div className="p-4 text-gray-400">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-2xl">

      {lateCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-indigo-500" />
              <h2 className="text-base font-bold text-gray-900">Late Check-out</h2>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              UH <strong>{lateCheckoutModal.numero}</strong> — essa UH não será liberada automaticamente ao meio-dia. Informe o horário de saída combinado com o hóspede.
            </p>
            <label className="block text-xs text-gray-500 font-medium mb-1">Hora de saída</label>
            <input
              autoFocus
              type="time"
              value={lateCheckoutHoraInput}
              onChange={(e) => setLateCheckoutHoraInput(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {lateCheckoutModal.lateCheckout && (
              <p className="text-xs text-gray-400 mt-2">
                Marcado por {lateCheckoutModal.lateCheckoutPorNome ?? "—"}.
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setLateCheckoutModal(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              {lateCheckoutModal.lateCheckout && (
                <button
                  disabled={salvandoLateCheckout || !podeOperar}
                  title={!podeOperar ? tituloSemAcesso : undefined}
                  onClick={desativarLateCheckout}
                  className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Desativar
                </button>
              )}
              <button
                disabled={!lateCheckoutHoraInput || salvandoLateCheckout || !podeOperar}
                title={!podeOperar ? tituloSemAcesso : undefined}
                onClick={confirmarLateCheckout}
                className="flex-1 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {prioridadeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Flag className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-gray-900">Prioridade</h2>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              UH <strong>{prioridadeModal.numero}</strong> — marque esta UH como prioritária pro dia. Informe o motivo (obrigatório); ele também aparece nas demais telas (Minhas UHs, Atribuição, Limpeza e Governança).
            </p>
            <label className="block text-xs text-gray-500 font-medium mb-1">Motivo</label>
            <textarea
              autoFocus
              rows={3}
              value={prioridadeDescricaoInput}
              onChange={(e) => setPrioridadeDescricaoInput(e.target.value)}
              placeholder="Ex.: hóspede VIP, pedido especial de horário..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {prioridadeModal.prioridade && (
              <p className="text-xs text-gray-400 mt-2">
                Marcado por {prioridadeModal.prioridadePorNome ?? "—"}.
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setPrioridadeModal(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              {prioridadeModal.prioridade && (
                <button
                  disabled={salvandoPrioridade || !podeOperar}
                  title={!podeOperar ? tituloSemAcesso : undefined}
                  onClick={removerPrioridade}
                  className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remover
                </button>
              )}
              <button
                disabled={!prioridadeDescricaoInput.trim() || salvandoPrioridade || !podeOperar}
                title={!podeOperar ? tituloSemAcesso : undefined}
                onClick={confirmarPrioridade}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {manutencaoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="w-5 h-5 text-orange-500" />
              <h2 className="text-base font-bold text-gray-900">Solicitar manutenção</h2>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              UH <strong>{manutencaoModal.numero}</strong> — selecione o item com defeito e descreva o problema. A solicitação vai pro Atendimento decidir.
            </p>
            <label className="block text-xs font-medium text-gray-500 mb-1">Item com defeito</label>
            <select
              autoFocus
              value={manutencaoItemIdInput}
              onChange={(e) => setManutencaoItemIdInput(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            >
              <option value="">Selecione um item…</option>
              {manutencaoModal.itensManutencao.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.category} — {item.name}
                </option>
              ))}
            </select>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descrição do problema</label>
            <textarea
              value={manutencaoDescricaoInput}
              onChange={(e) => setManutencaoDescricaoInput(e.target.value)}
              placeholder="Ex: Torneira com vazamento, ar-condicionado com defeito…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
              rows={3}
            />
            <div className="mt-3 rounded-lg border-2 border-red-300 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-700 mb-1.5">É uma falha impeditiva ao uso (urgente)? *</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setManutencaoUrgenteInput(true)}
                  className={`py-2 rounded-lg border text-sm font-medium ${manutencaoUrgenteInput === true ? "border-red-600 bg-red-100 text-red-700" : "border-gray-300 text-gray-600"}`}
                >
                  Sim, urgente
                </button>
                <button
                  onClick={() => setManutencaoUrgenteInput(false)}
                  className={`py-2 rounded-lg border text-sm font-medium ${manutencaoUrgenteInput === false ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}
                >
                  Não
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border-2 border-violet-300 bg-violet-50 p-3">
              <p className="text-xs font-bold text-violet-700 mb-1.5">É um defeito prioritário? *</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setManutencaoPrioridadeInput(true)}
                  className={`py-2 rounded-lg border text-sm font-medium ${manutencaoPrioridadeInput === true ? "border-violet-600 bg-violet-100 text-violet-700" : "border-gray-300 text-gray-600"}`}
                >
                  Sim, prioritário
                </button>
                <button
                  onClick={() => setManutencaoPrioridadeInput(false)}
                  className={`py-2 rounded-lg border text-sm font-medium ${manutencaoPrioridadeInput === false ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"}`}
                >
                  Não
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setManutencaoModal(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                disabled={
                  !manutencaoDescricaoInput.trim() ||
                  !manutencaoItemIdInput ||
                  manutencaoUrgenteInput === null ||
                  manutencaoPrioridadeInput === null ||
                  !podeOperar
                }
                title={!podeOperar ? tituloSemAcesso : undefined}
                onClick={() =>
                  confirmarManutencao(
                    manutencaoModal,
                    manutencaoDescricaoInput.trim(),
                    manutencaoItemIdInput,
                    manutencaoUrgenteInput ?? undefined,
                    manutencaoPrioridadeInput ?? undefined,
                  )
                }
                className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Enviar solicitação
              </button>
            </div>
          </div>
        </div>
      )}

      {queixaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h2 className="text-base font-bold text-gray-900">Registrar queixa do hóspede</h2>
            </div>
            <p className="text-sm text-gray-500 mb-3">UH <strong>{queixaModal.numero}</strong> — selecione o tipo e descreva o que o hóspede relatou.</p>

            <label className="block text-xs text-gray-500 font-medium mb-1">Título da queixa</label>
            <input
              type="text"
              autoFocus
              value={queixaTituloInput}
              onChange={(e) => setQueixaTituloInput(e.target.value)}
              placeholder="Ex.: Absorvente embaixo da cama"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <p className="text-xs text-gray-400 -mt-2 mb-3">Esse é o título que vai aparecer no card em Avaliações.</p>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {([
                { tipo: "LIMPEZA", label: "Limpeza", cor: "bg-red-500 border-red-500" },
                { tipo: "MANUTENCAO", label: "Manutenção", cor: "bg-orange-500 border-orange-500" },
                { tipo: "LAVANDERIA", label: "Lavanderia", cor: "bg-blue-500 border-blue-500" },
                { tipo: "OUTRA", label: "Outra", cor: "bg-gray-500 border-gray-500" },
              ] as const).map((opt) => (
                <button
                  key={opt.tipo}
                  onClick={() => setQueixaTipoInput(opt.tipo)}
                  className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    queixaTipoInput === opt.tipo
                      ? `${opt.cor} text-white`
                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {queixaTipoInput === "LIMPEZA" ? (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                Desconta 30 pontos da camareira atribuída a esta UH hoje.
              </p>
            ) : queixaTipoInput === "MANUTENCAO" ? (
              <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-3">
                Envia um alerta no Telegram pra Gerente e Manutenção.
              </p>
            ) : queixaTipoInput === "LAVANDERIA" ? (
              <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
                Envia um alerta no Telegram pra Gerente e Lavanderia.
              </p>
            ) : (
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
                Envia um alerta no Telegram pra Gerente.
              </p>
            )}

            <textarea
              value={queixaDescricaoInput}
              onChange={(e) => setQueixaDescricaoInput(e.target.value)}
              placeholder="O que o hóspede relatou…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              rows={3}
            />

            <div className="mt-3">
              <p className="text-xs text-gray-500 font-medium mb-1.5">Anexo (opcional)</p>
              {queixaAnexos.length > 0 && (
                <div className="space-y-1 mb-2">
                  {queixaAnexos.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
                      <Paperclip className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                      <span className="flex-1 truncate text-gray-600">{a.fileName}</span>
                      <button onClick={() => setQueixaAnexos((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {erroAnexoQueixa && <p className="text-xs text-red-500 mb-1.5">{erroAnexoQueixa}</p>}
              <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2 border ${enviandoAnexoQueixa ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                <Paperclip className="w-4 h-4 flex-shrink-0" />
                <span>{enviandoAnexoQueixa ? "Enviando…" : "Anexar arquivo"}</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={uploadAnexoQueixa}
                  disabled={enviandoAnexoQueixa}
                />
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setQueixaModal(null)}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                disabled={!queixaTituloInput.trim() || !queixaDescricaoInput.trim() || enviandoQueixa || !podeOperar}
                title={!podeOperar ? tituloSemAcesso : undefined}
                onClick={registrarQueixa}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {enviandoQueixa ? "Registrando…" : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Seleção e Liberação</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {modo === "selecao"
            ? "Selecione as UHs do dia e confirme."
            : "Libere as UHs conforme ficarem prontas."}
        </p>
      </div>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="label mb-0">Data</span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${modo === "selecao" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
            {modo === "selecao" ? "Seleção" : "Liberação"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const d = new Date(data + "T12:00:00");
              d.setDate(d.getDate() - 1);
              setData(d.toISOString().slice(0, 10));
            }}
            className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => (document.getElementById("selecao-date-input") as HTMLInputElement)?.showPicker?.()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center bg-gray-50 text-gray-700"
            >
              {new Date(data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </button>
            <input
              id="selecao-date-input"
              type="date"
              value={data}
              onChange={(e) => { if (e.target.value) setData(e.target.value); }}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              tabIndex={-1}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const d = new Date(data + "T12:00:00");
              d.setDate(d.getDate() + 1);
              setData(d.toISOString().slice(0, 10));
            }}
            className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {modo === "selecao" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-3 items-center">
              <button onClick={() => setSelecionadas(new Set(todasUHs.map((u) => u.id)))} className="text-sm text-blue-600 hover:underline">Selecionar todas</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setSelecionadas(new Set())} className="text-sm text-gray-500 hover:underline">Limpar</button>
              <span className="text-sm text-gray-400">{selecionadas.size} de {todasUHs.length}</span>
            </div>
            <button onClick={() => setAscending(!ascending)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
              <ArrowUpDown className="w-4 h-4" />
              {ascending ? "A → Z" : "Z → A"}
            </button>
          </div>

          <div className="space-y-2 mb-6">
            {sortedTodasUHs.map((uh) => {
              const sel = selecionadas.has(uh.id);
              return (
                <button key={uh.id} onClick={() => !somenteLeitura && toggle(uh.id)}
                  className={`w-full card flex items-center gap-3 text-left transition-colors ${sel ? "border-blue-400 bg-blue-50" : "hover:bg-gray-50"}`}>
                  {sel ? <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" /> : <Square className="w-5 h-5 text-gray-300 flex-shrink-0" />}
                  <span className={`font-medium ${sel ? "text-blue-800" : "text-gray-700"}`}>{uh.numero}</span>
                </button>
              );
            })}
          </div>

          {!somenteLeitura && (
            <div className="flex gap-3 flex-wrap">
              <button onClick={confirmar} disabled={salvando || selecionadas.size === 0 || !podeOperar} title={!podeOperar ? tituloSemAcesso : undefined} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                <Check className="w-4 h-4" />
                {salvando ? "Confirmando..." : `Confirmar seleção (${selecionadas.size} UHs)`}
              </button>
              {modoReedicao && (
                <button onClick={desistirEdicao} disabled={!podeOperar} title={!podeOperar ? tituloSemAcesso : undefined} className="btn-secondary flex items-center gap-2 text-gray-600 disabled:opacity-50">
                  <X className="w-4 h-4" />
                  Desistir da edição
                </button>
              )}
            </div>
          )}
        </>
      )}

      {modo === "liberacao" && (
        <>
          <div className="card mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 font-medium">UHs liberadas hoje</span>
              <span className="font-bold text-blue-600">{totalLiberadas} / {totalSel}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${totalLiberadas === totalSel && totalSel > 0 ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: totalSel > 0 ? `${(totalLiberadas / totalSel) * 100}%` : "0%" }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setAscending(!ascending)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                {ascending ? "↑" : "↓"}
              </button>
              <button
                onClick={() => setSortBy(sortBy === "numero" ? "status" : "numero")}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  sortBy === "status"
                    ? "border-blue-400 text-blue-600 bg-blue-50"
                    : "border-gray-300 text-gray-500 hover:text-blue-600"
                }`}
              >
                {sortBy === "numero" ? "Ordenar por status" : "Ordenar por UH"}
              </button>
              {FILTROS_ESPECIAIS.map((f) => {
                const ativo = filtroStatus === f.key;
                const corAtivo = f.cor === "bloqueada"
                  ? "bg-red-800 text-white border-red-800"
                  : f.cor === "reserva"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-orange-500 text-white border-orange-500";
                const corInativo = f.cor === "bloqueada"
                  ? "bg-white text-red-800 border-red-400 hover:border-red-500"
                  : f.cor === "reserva"
                    ? "bg-white text-red-600 border-red-300 hover:border-red-400"
                    : "bg-white text-orange-600 border-orange-300 hover:border-orange-400";
                return (
                  <button
                    key={f.key}
                    onClick={() => setFiltroStatus(ativo ? null : f.key)}
                    className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${ativo ? corAtivo : corInativo}`}
                  >
                    {f.label} <span className={ativo ? "opacity-75" : "opacity-60"}>({f.count})</span>
                  </button>
                );
              })}
            </div>
            <button onClick={reeditar} className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 flex-shrink-0">
              <Edit2 className="w-4 h-4" />
              Editar seleção
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {FILTROS.map((f) => {
              const ativo = filtroStatus === f.key;
              const count = f.count !== undefined
                ? f.count
                : uhsLiberacao.filter((u) => (u.assignmentStatus ?? "PENDENTE") === f.key).length;
              return (
                <button
                  key={String(f.key)}
                  onClick={() => setFiltroStatus(f.key)}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    ativo
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {f.label} <span className={ativo ? "opacity-75" : "text-gray-400"}>({count})</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            {sortedLiberacao.map((uh) => {
              const liberada = uh.liberada || (uh.assignmentStatus !== null && uh.assignmentStatus !== "PENDENTE");
              const concluida = ["CONCLUIDO", "INSPECIONADO"].includes(uh.assignmentStatus ?? "");
              const isLiberando = liberandoId === uh.uhId;

              const temDetalhe = uh.assignmentId !== null;

              return (
                <div key={uh.uhId}
                  className={`card flex items-start gap-3 transition-colors ${liberada ? "bg-gray-50" : "bg-white"}`}>

                  <button
                    onClick={() => !liberada && !somenteLeitura && liberarUH(uh)}
                    disabled={liberada || isLiberando || somenteLeitura}
                    className={`flex-shrink-0 mt-0.5 transition-colors ${
                      concluida ? "text-green-500 cursor-default"
                      : liberada ? "text-yellow-500 cursor-default"
                      : "text-gray-300 hover:text-blue-500 cursor-pointer"
                    }`}
                    title={liberada ? "Já liberada" : "Clique para liberar"}
                  >
                    {concluida
                      ? <CheckCircle2 className="w-6 h-6" />
                      : liberada
                        ? <Unlock className="w-6 h-6" />
                        : <Lock className="w-6 h-6" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">

                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="text-left"
                        onClick={() => temDetalhe && setDetalheAssignmentId(uh.assignmentId)}
                      >
                        <span className={`font-bold text-base ${liberada ? "text-gray-500" : "text-gray-900"}`}>
                          {uh.numero}
                        </span>
                      </button>
                      <div className="text-right flex-shrink-0">
                        {uh.assignmentStatus
                          ? <span className={`text-xs font-medium ${STATUS_COLOR[uh.assignmentStatus] ?? "text-gray-400"}`}>
                              {STATUS_LABEL[uh.assignmentStatus] ?? uh.assignmentStatus}
                            </span>
                          : <span className="text-xs text-gray-300">Não atribuída</span>
                        }
                        {liberada && uh.liberadaEm && (
                          <p className="text-xs text-gray-400">{format(new Date(uh.liberadaEm), "HH:mm")}</p>
                        )}
                      </div>
                    </div>

                    {(uh.prioridade || uh.bloqueada || uh.emManutencao || uh.temReserva || uh.queixas.length > 0 || (uh.lateCheckout && !liberada)) && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {uh.prioridade && (
                          <span
                            title={uh.prioridadeDescricao ?? undefined}
                            className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5"
                          >
                            <Flag className="w-3 h-3" /> Prioridade
                          </span>
                        )}
                        {uh.bloqueada && (
                          <span
                            title={uh.bloqueioDescricao ?? undefined}
                            className="flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-100 border border-red-300 rounded-full px-2 py-0.5"
                          >
                            <Lock className="w-3 h-3" /> Bloqueada
                          </span>
                        )}
                        {uh.emManutencao && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                            <Wrench className="w-3 h-3" /> Manutenção
                          </span>
                        )}
                        {uh.temReserva && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                            <BedDouble className="w-3 h-3" /> Reserva
                          </span>
                        )}
                        {uh.queixas.length > 0 && (
                          <button
                            onClick={() => abrirBalaoQueixas(uh.queixas)}
                            title={uh.queixas.map((q) => q.titulo).join(" · ")}
                            className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded-full px-2 py-0.5 hover:bg-red-200 transition-colors"
                          >
                            <AlertTriangle className="w-3 h-3" /> Queixa{uh.queixas.length > 1 ? "s" : ""} ({uh.queixas.length})
                          </button>
                        )}
                        {uh.lateCheckout && !liberada && (
                          <button
                            onClick={() => abrirLateCheckout(uh)}
                            title={`Marcado por ${uh.lateCheckoutPorNome ?? "—"}`}
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-100 border border-indigo-300 rounded-full px-2 py-0.5 hover:bg-indigo-200 transition-colors"
                          >
                            <Clock className="w-3 h-3" /> Late Check-out até {uh.lateCheckoutHora}
                          </button>
                        )}
                      </div>
                    )}
                    {uh.bloqueada && uh.bloqueioDescricao && (
                      <p className="text-xs text-red-800 bg-red-50 rounded-lg px-2 py-1 mt-1 border border-red-200">
                        {uh.bloqueioDescricao}
                      </p>
                    )}
                    {uh.bloqueada && podeDesbloquear && (
                      <button
                        onClick={() => desbloquearUH(uh)}
                        disabled={!podeOperar || desbloqueandoId === uh.uhId}
                        title={!podeOperar ? tituloSemAcesso : "Remover o bloqueio desta UH"}
                        className="flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900 mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Unlock className="w-3 h-3" />
                        {desbloqueandoId === uh.uhId ? "Desbloqueando..." : "Desbloquear UH"}
                      </button>
                    )}
                    {uh.emManutencao && uh.manutencaoDescricao && (
                      <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1 mt-1 border border-orange-100">
                        {uh.manutencaoDescricao}
                      </p>
                    )}

                    {podeDesbloquear && !somenteLeitura && (uh.assignmentStatus ?? "PENDENTE") !== "INSPECIONADO" && (
                      <button
                        onClick={() => setLiberandoSemInspecao(uh)}
                        disabled={!podeOperar}
                        title={!podeOperar ? tituloSemAcesso : "Liberar pra check-in pulando a inspeção"}
                        className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-800 mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ShieldCheck className="w-3 h-3" /> Liberar sem inspeção
                      </button>
                    )}
                    {podeDesbloquear && !somenteLeitura && uh.assignmentId && !["CONCLUIDO", "INSPECIONADO"].includes(uh.assignmentStatus ?? "") && (
                      <button
                        onClick={() => setLimpezaSemRegistro(uh)}
                        disabled={!podeOperar}
                        title={!podeOperar ? tituloSemAcesso : "Registrar limpeza que a camareira fez mas não registrou"}
                        className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckSquare className="w-3 h-3" /> Limpeza sem Registro
                      </button>
                    )}

                    {uh.prioridade && (
                      <button
                        className="w-full text-left mt-1.5"
                        onClick={() => podeComentar && abrirPrioridade(uh)}
                      >
                        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2 py-1 border border-amber-200 flex items-start gap-1">
                          <Flag className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                          <span>
                            <span className="font-semibold">Prioridade: </span>
                            {uh.prioridadeDescricao}
                            {uh.prioridadePorNome && (
                              <span className="block text-[10px] text-amber-500 mt-0.5">— {uh.prioridadePorNome}</span>
                            )}
                          </span>
                        </p>
                      </button>
                    )}

                    {editandoComentarioId === uh.uhId ? (
                      <div className="mt-1.5 flex items-start gap-1.5">
                        <textarea
                          autoFocus
                          value={comentarioInput}
                          onChange={(e) => setComentarioInput(e.target.value)}
                          placeholder="Comentário sobre a UH…"
                          className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50"
                          rows={2}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); salvarComentario(uh); } }}
                        />
                        <div className="flex flex-col gap-1">
                          <button onClick={() => salvarComentario(uh)}
                            disabled={!podeOperar}
                            title={!podeOperar ? tituloSemAcesso : undefined}
                            className="p-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditandoComentarioId(null)}
                            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : uh.comentario ? (
                      <button
                        className="w-full text-left mt-1.5"
                        onClick={() => podeComentar && (setEditandoComentarioId(uh.uhId), setComentarioInput(uh.comentario ?? ""))}
                      >
                        <p className="text-xs text-blue-800 bg-blue-50 rounded-lg px-2 py-1 border border-blue-200 flex items-start gap-1">
                          <MessageCircle className="w-3 h-3 mt-0.5 flex-shrink-0 text-blue-500" />
                          <span>
                            {uh.comentario}
                            {uh.comentarioPorNome && (
                              <span className="block text-[10px] text-blue-400 mt-0.5">— {uh.comentarioPorNome}</span>
                            )}
                          </span>
                        </p>
                      </button>
                    ) : null}

                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <button
                        className="text-left min-w-0"
                        onClick={() => temDetalhe && setDetalheAssignmentId(uh.assignmentId)}
                      >
                        {uh.camareiraNome
                          ? <p className="text-xs text-gray-500 truncate">→ {uh.camareiraNome}</p>
                          : <p className="text-xs text-orange-400">Sem camareira atribuída</p>
                        }
                      </button>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {podeComentar && (
                          <button
                            onClick={() => { setEditandoComentarioId(uh.uhId); setComentarioInput(uh.comentario ?? ""); }}
                            title={uh.comentario ? "Editar comentário" : "Adicionar comentário"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              uh.comentario
                                ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                                : "text-gray-300 hover:text-blue-500 hover:bg-blue-50"
                            }`}
                          >
                            <MessageCirclePlus className="w-4 h-4" />
                          </button>
                        )}
                        {podeComentar && (
                          <button
                            onClick={() => abrirPrioridade(uh)}
                            title={uh.prioridade ? "Editar prioridade" : "Marcar como prioridade"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              uh.prioridade
                                ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                                : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"
                            }`}
                          >
                            <Flag className="w-4 h-4" />
                          </button>
                        )}
                        {podeComentar && (
                          <button
                            onClick={() => abrirQueixa(uh)}
                            title="Registrar queixa do hóspede"
                            className={`p-1.5 rounded-lg transition-colors ${
                              uh.queixas.length > 0
                                ? "bg-red-100 text-red-600 hover:bg-red-200"
                                : "text-gray-300 hover:text-red-500 hover:bg-red-50"
                            }`}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        )}
                        {podeComentar && !liberada && (
                          <button
                            onClick={() => abrirLateCheckout(uh)}
                            title={uh.lateCheckout ? `Late Check-out às ${uh.lateCheckoutHora}` : "Marcar Late Check-out"}
                            className={`p-1.5 rounded-lg transition-colors ${
                              uh.lateCheckout
                                ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                                : "text-gray-300 hover:text-indigo-500 hover:bg-indigo-50"
                            }`}
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        )}
                        {!somenteLeitura && (
                          <>
                            <button
                              onClick={() => toggleManutencao(uh)}
                              // Ver o popup "Manutenção de hoje" (UH já em
                              // manutenção) é sempre permitido — só abrir o
                              // formulário de NOVA manutenção exige
                              // podeOperar (pedido do Felipe, 04/08/2026).
                              disabled={!uh.emManutencao && !podeOperar}
                              title={
                                uh.emManutencao
                                  ? "Ver manutenção de hoje"
                                  : !podeOperar
                                    ? tituloSemAcesso
                                    : "Solicitar manutenção"
                              }
                              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                                uh.emManutencao
                                  ? "bg-orange-100 text-orange-600 hover:bg-orange-200"
                                  : "text-gray-300 hover:text-orange-400 hover:bg-orange-50"
                              }`}
                            >
                              <Wrench className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleReserva(uh)}
                              disabled={!podeOperar}
                              title={!podeOperar ? tituloSemAcesso : uh.temReserva ? "Remover reserva" : "Marcar com reserva"}
                              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                                uh.temReserva
                                  ? "bg-red-100 text-red-600 hover:bg-red-200"
                                  : "text-gray-300 hover:text-red-400 hover:bg-red-50"
                              }`}
                            >
                              <BedDouble className="w-4 h-4" />
                            </button>
                            {(!uh.assignmentStatus || ["PENDENTE", "LIBERADO", "EM_ANDAMENTO"].includes(uh.assignmentStatus)) && (
                              confirmandoRenovar === uh.uhId ? (
                                <div className="flex items-center gap-1">
                                  {uh.assignmentStatus === "EM_ANDAMENTO" ? (
                                    <span className="text-xs text-red-700 font-medium">⚠️ Limpeza iniciada! Excluir?</span>
                                  ) : (
                                    <span className="text-xs text-purple-700 font-medium">Excluir da lista?</span>
                                  )}
                                  <button onClick={() => renovarUH(uh)} disabled={renovandoId === uh.uhId || !podeOperar}
                                    title={!podeOperar ? tituloSemAcesso : undefined}
                                    className={`text-xs text-white px-2 py-1 rounded-lg disabled:opacity-40 ${uh.assignmentStatus === "EM_ANDAMENTO" ? "bg-red-600 hover:bg-red-700" : "bg-purple-600 hover:bg-purple-700"}`}>
                                    {renovandoId === uh.uhId ? "..." : "Sim"}
                                  </button>
                                  <button onClick={() => setConfirmandoRenovar(null)}
                                    className="text-xs text-gray-500 px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-100">
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmandoRenovar(uh.uhId)}
                                  disabled={!podeOperar}
                                  title={!podeOperar ? tituloSemAcesso : "Remover UH da lista do dia"}
                                  className="p-1.5 rounded-lg transition-colors text-gray-300 hover:text-purple-500 hover:bg-purple-50 disabled:opacity-40">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )
                            )}
                          </>
                        )}
                        {!liberada && !somenteLeitura ? (
                          <button onClick={() => liberarUH(uh)} disabled={isLiberando || !podeOperar}
                            title={!podeOperar ? tituloSemAcesso : undefined}
                            className="btn-primary text-sm py-1 px-3 disabled:opacity-50">
                            {isLiberando ? "..." : "Liberar"}
                          </button>
                        ) : (uh.assignmentStatus === "LIBERADO" || (uh.liberada && !uh.assignmentStatus)) && !somenteLeitura ? (
                          confirmandoDesfazer === uh.uhId ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-red-600 font-medium">Confirmar?</span>
                              <button onClick={() => desfazerLiberacao(uh)} disabled={desfazendoId === uh.uhId || !podeOperar}
                                title={!podeOperar ? tituloSemAcesso : undefined}
                                className="text-xs bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 disabled:opacity-40">
                                {desfazendoId === uh.uhId ? "..." : "Sim"}
                              </button>
                              <button onClick={() => setConfirmandoDesfazer(null)}
                                className="text-xs text-gray-500 px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-100">
                                Não
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmandoDesfazer(uh.uhId)}
                              disabled={!podeOperar}
                              title={!podeOperar ? tituloSemAcesso : undefined}
                              className="flex items-center gap-1 text-xs text-orange-600 border border-orange-300 px-2 py-1 rounded-lg hover:bg-orange-50 disabled:opacity-40">
                              <Undo2 className="w-3.5 h-3.5" /> Desfazer
                            </button>
                          )
                        ) : temDetalhe ? (
                          <button onClick={() => setDetalheAssignmentId(uh.assignmentId)}
                            className="text-gray-300 hover:text-blue-400">
                            <ChevronRight className="w-5 h-5" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-gray-400">
            * Ao clicar em "Editar seleção" você volta ao modo de seleção. UHs já liberadas mantêm seu status.
          </p>
        </>
      )}

      {detalheAssignmentId && (
        <UHDetailModal
          assignmentId={detalheAssignmentId}
          onClose={() => setDetalheAssignmentId(null)}
        />
      )}

      {liberandoSemInspecao && (
        <JustificativaModal
          titulo={`Liberar UH ${liberandoSemInspecao.numero} sem inspeção`}
          descricao="A UH será liberada direto pro check-in, pulando a etapa de inspeção."
          placeholder="Ex.: UH ociosa há muito tempo, urgência operacional..."
          confirmLabel="Liberar sem inspeção"
          corConfirm="bg-orange-500 hover:bg-orange-600"
          enviando={enviandoLiberacaoSemInspecao}
          onConfirmar={confirmarLiberarSemInspecao}
          onClose={() => setLiberandoSemInspecao(null)}
        />
      )}

      {limpezaSemRegistro && (
        <JustificativaModal
          titulo={`Registrar limpeza sem registro — UH ${limpezaSemRegistro.numero}`}
          descricao="Use quando a camareira limpou a UH mas não conseguiu registrar no app (celular descarregou, esqueceu etc.). A UH segue pra inspeção normalmente."
          placeholder="Ex.: Camareira confirmou que limpou, celular descarregou..."
          confirmLabel="Registrar limpeza"
          corConfirm="bg-amber-500 hover:bg-amber-600"
          enviando={enviandoLimpezaSemRegistro}
          onConfirmar={confirmarLimpezaSemRegistro}
          onClose={() => setLimpezaSemRegistro(null)}
        />
      )}

      {queixaEscolherEntre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setQueixaEscolherEntre(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-gray-900 mb-3">Qual queixa você quer ver?</p>
            <div className="space-y-1.5">
              {queixaEscolherEntre.map((q) => (
                <button
                  key={q.id}
                  onClick={() => { setQueixaDetalheId(q.id); setQueixaEscolherEntre(null); }}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-red-50 hover:border-red-200 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">{q.titulo}</p>
                  <p className="text-xs text-gray-400">{TIPO_QUEIXA_LABEL[q.tipo] ?? q.tipo}</p>
                </button>
              ))}
            </div>
            <button onClick={() => setQueixaEscolherEntre(null)} className="mt-3 w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {queixaDetalheId && (
        <QueixaDetailModal
          queixaId={queixaDetalheId}
          onClose={() => setQueixaDetalheId(null)}
        />
      )}

      {manutencaoHojeModal && (
        <ManutencaoHojeModal
          uh={manutencaoHojeModal}
          data={data}
          onClose={() => setManutencaoHojeModal(null)}
          onEncerrar={podeOperar ? () => encerrarManutencaoHoje(manutencaoHojeModal) : undefined}
          encerrando={encerrandoManutencao}
        />
      )}
    </div>
  );
}
