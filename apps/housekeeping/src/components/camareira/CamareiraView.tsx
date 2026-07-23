"use client";
import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, Clock, Camera, ChevronRight, ChevronLeft, ChevronDown, Lock, Play, AlertCircle, X, MessageSquarePlus, BedDouble, MessageSquare, Wrench, ShieldAlert, WashingMachine, Star, HelpCircle, Info } from "lucide-react";
import { formatarTempo } from "@/lib/scoring";
import { apiFetch } from "@/lib/apiFetch";
import GeoCheckin from "./GeoCheckin";

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
  solicitacaoTipo: string | null;
  temReserva?: boolean;
  uh: { id: string; numero: string; tipo: string; status: string; emManutencao?: boolean; manutencaoDescricao?: string | null };
  program: { id: string; nome: string; tipo: string; steps: { id: string; titulo: string; descricao: string; ordem: number }[] } | null;
  cleaningSession: {
    id: string;
    iniciadaEm: string;
    finalizadaEm: string | null;
    fotos: string; // JSON: { [tipo]: string[] }
    steps: { id: string; stepId: string; ordem: number; iniciadoEm: string; finalizadoEm: string | null; step: { titulo: string; descricao: string } }[];
  } | null;
  // Dados pra etapa obrigatória "Necessidade de Manutenção?" — ver fase
  // "manutencao" abaixo. manutencaoItens = itens de checklist da Manutenção
  // aplicáveis a essa UH; manutencaoPendentes = ids dos que já estão
  // NAO_CONFORME hoje (pra avisar "já registrado" antes da camareira
  // preencher a descrição à toa).
  manutencaoItens?: ItemChecklistManutencao[];
  manutencaoPendentes?: string[];
};

type ItemChecklistManutencao = { id: string; name: string; category: string };

type Fase = "lista" | "limpeza" | "manutencao" | "fotos" | "concluido";

const FOTO_TIPOS = ["cozinha", "cama", "toalhas", "banheiro"];
const MAX_FOTOS_MANUTENCAO = 4;
const FOTO_LABELS: Record<string, string> = {
  cozinha: "🍳 Cozinha",
  cama: "🛏️ Cama",
  toalhas: "🛁 Toalhas",
  banheiro: "🚿 Banheiro",
};

export default function CamareiraView({ podeOperar }: { podeOperar: boolean }) {
  const tituloSemAcesso = "Você não tem acesso para operar este módulo";
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
  const [superLimpezaId, setSuperLimpezaId] = useState<string | null>(null);
  const [superLimpezaMsg, setSuperLimpezaMsg] = useState("");
  const [superLimpezaFotos, setSuperLimpezaFotos] = useState<string[]>([]);
  const [enviandoSuperLimpeza, setEnviandoSuperLimpeza] = useState(false);
  const [uploadandoSuperLimpeza, setUploadandoSuperLimpeza] = useState(false);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [bloqueandoUH, setBloqueandoUH] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");
  const [enviandoBloqueio, setEnviandoBloqueio] = useState(false);
  const [reportandoLavanderia, setReportandoLavanderia] = useState(false);
  const [descricaoLavanderia, setDescricaoLavanderia] = useState("");
  const [fotoLavanderia, setFotoLavanderia] = useState<string | null>(null);
  const [uploadandoFotoLav, setUploadandoFotoLav] = useState(false);
  const [enviandoLavanderia, setEnviandoLavanderia] = useState(false);

  // Etapa obrigatória "Necessidade de Manutenção?" — entre o checklist e as
  // fotos de conclusão (ver bloco "TELA DE MANUTENÇÃO" abaixo). Sub-fluxo:
  // pergunta (Sim/Não) → [seleciona item → descreve + fotos] → resultado
  // (registrado ou já existia) → pergunta se quer registrar outro.
  const [manutencaoSubFase, setManutencaoSubFase] = useState<"pergunta" | "selecionar" | "descrever" | "resultado">("pergunta");
  const [itemManutencaoSelecionado, setItemManutencaoSelecionado] = useState<ItemChecklistManutencao | null>(null);
  const [descricaoManutencao, setDescricaoManutencao] = useState("");
  const [fotosManutencao, setFotosManutencao] = useState<string[]>([]);
  // Perguntas obrigatórias antes de concluir o registro (pedido explícito:
  // toda não conformidade nova precisa informar se vai precisar de material
  // e/ou de serviço externo pra sensibilizar corretamente os kanbans do
  // módulo de Manutenção). null = ainda não respondeu.
  const [precisaMaterialManutencao, setPrecisaMaterialManutencao] = useState<boolean | null>(null);
  const [precisaServicoManutencao, setPrecisaServicoManutencao] = useState<boolean | null>(null);
  const [uploadandoFotoManutencao, setUploadandoFotoManutencao] = useState(false);
  const [enviandoManutencao, setEnviandoManutencao] = useState(false);
  const [resultadoManutencao, setResultadoManutencao] = useState<{ jaRegistrado: boolean; itemNome: string } | null>(null);
  // Categorias (Banheiro, Cozinha, Estrutura do quarto...) começam
  // minimizadas na tela de seleção — expande só a que a camareira tocar,
  // pra lista longa de itens não ficar poluída/difícil de escanear.
  const [categoriasManutencaoAbertas, setCategoriasManutencaoAbertas] = useState<Set<string>>(new Set());
  // Registrados nesta sessão de "manutencao" (antes do próximo carregar()
  // trazer o /api/sessoes atualizado) — evita deixar selecionar de novo um
  // item que ela acabou de registrar, no mesmo loop.
  const [itensManutencaoRegistradosAgora, setItensManutencaoRegistradosAgora] = useState<Set<string>>(new Set());

  // Edição de fotos de uma UH já concluída (ver "Editar fotos" em Minhas
  // UHs) — editandoFotosId guarda o id da CleaningSession sendo editada, não
  // do assignment, porque é o que a action "editar_fotos" espera.
  const [editandoFotosId, setEditandoFotosId] = useState<string | null>(null);
  const [fotosEdicao, setFotosEdicao] = useState<Record<string, string[]>>({});
  const [uploadingEdicao, setUploadingEdicao] = useState<string | null>(null);
  const [salvandoFotosEdicao, setSalvandoFotosEdicao] = useState(false);
  const [erroEdicaoFotos, setErroEdicaoFotos] = useState<string | null>(null);

  async function solicitarAlteracao(assignmentId: string) {
    if (!solicitacaoMsg.trim() || !podeOperar) return;
    setEnviandoSolicitacao(true);
    await apiFetch("/api/atribuicoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "solicitar_alteracao", assignmentId, mensagem: solicitacaoMsg.trim() }),
    });
    setSolicitandoId(null);
    setSolicitacaoMsg("");
    setEnviandoSolicitacao(false);
    carregar();
  }

  // Pedido de Super Limpeza ⭐️ — mesma mecânica de solicitar_alteracao, só
  // que com tipo="SUPER_LIMPEZA" e fotos anexadas (a compressão de imagem é
  // a mesma função usada nas fotos obrigatórias de finalização, ver abaixo).
  async function handleFotoSuperLimpeza(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadandoSuperLimpeza(true);
    try {
      const fileComprimido = await comprimirImagem(file);
      const fd = new FormData();
      fd.append("file", fileComprimido);
      fd.append("tipo", "super_limpeza");
      fd.append("pasta", "super-limpeza");
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) setSuperLimpezaFotos((prev) => [...prev, json.url]);
    } catch {
      // Foto é opcional — falha silenciosa não impede o pedido.
    } finally {
      setUploadandoSuperLimpeza(false);
    }
  }

  async function solicitarSuperLimpeza(assignmentId: string) {
    if (!superLimpezaMsg.trim() || !podeOperar) return;
    setEnviandoSuperLimpeza(true);
    await apiFetch("/api/atribuicoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "solicitar_alteracao",
        assignmentId,
        mensagem: superLimpezaMsg.trim(),
        tipo: "SUPER_LIMPEZA",
        fotos: superLimpezaFotos,
      }),
    });
    setSuperLimpezaId(null);
    setSuperLimpezaMsg("");
    setSuperLimpezaFotos([]);
    setEnviandoSuperLimpeza(false);
    carregar();
  }

  const carregar = useCallback(async () => {
    const res = await apiFetch("/api/sessoes");
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
    if (!podeOperar) return;
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
      const res = await apiFetch("/api/sessoes", {
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
      const json = await apiFetch("/api/sessoes").then((r) => r.json());
      const sessao = json.assignments?.find((a: Assignment) => a.id === assignmentAtivo.id)?.cleaningSession;
      const stepPendente = sessao?.steps?.find((s: any) => !s.finalizadoEm);
      if (stepPendente) {
        await apiFetch("/api/sessoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "concluir_step", sessaoId, stepId: stepPendente.id }),
        });
      }
    } catch {
      // Ignora falha na API — a UI avança de qualquer forma
    }

    // Sempre avança para o próximo step ou para a etapa obrigatória de
    // manutenção (que antecede as fotos — ver iniciarEtapaManutencao)
    if (nextIdx >= totalSteps) {
      await iniciarEtapaManutencao();
    } else {
      setStepAtualIdx(nextIdx);
    }

    await carregar();
  }

  // ─── Etapa "Necessidade de Manutenção?" ────────────────────────────────
  // Entra logo após o checklist, antes das fotos obrigatórias. O tempo
  // gasto aqui não conta contra a camareira (ver comentário em
  // CleaningSession.manutencaoSegundosExcluidos no schema): iniciarEtapa
  // marca a entrada no servidor, finalizarEtapa fecha e soma o delta.
  async function iniciarEtapaManutencao() {
    setManutencaoSubFase("pergunta");
    setItemManutencaoSelecionado(null);
    setDescricaoManutencao("");
    setFotosManutencao([]);
    setResultadoManutencao(null);
    setItensManutencaoRegistradosAgora(new Set());
    setCategoriasManutencaoAbertas(new Set());
    setFase("manutencao");
    if (sessaoId) {
      try {
        await apiFetch("/api/sessoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "iniciar_manutencao", sessaoId }),
        });
      } catch {
        // Não bloqueia a UI — na pior hipótese o tempo desta etapa não é
        // descontado, mas ela continua conseguindo registrar normalmente.
      }
    }
  }

  async function finalizarEtapaManutencao() {
    if (sessaoId) {
      try {
        await apiFetch("/api/sessoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "concluir_manutencao", sessaoId }),
        });
      } catch {
        // idem — não bloqueia o avanço pra tela de fotos
      }
    }
    setFase("fotos");
    await carregar();
  }

  function responderPerguntaManutencao(necessario: boolean) {
    if (necessario) {
      setManutencaoSubFase("selecionar");
    } else {
      finalizarEtapaManutencao();
    }
  }

  function toggleCategoriaManutencao(categoria: string) {
    setCategoriasManutencaoAbertas((prev) => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria);
      else next.add(categoria);
      return next;
    });
  }

  function selecionarItemManutencao(item: ItemChecklistManutencao, pendentes: Set<string>) {
    if (pendentes.has(item.id) || itensManutencaoRegistradosAgora.has(item.id)) {
      setResultadoManutencao({ jaRegistrado: true, itemNome: item.name });
      setManutencaoSubFase("resultado");
      return;
    }
    setItemManutencaoSelecionado(item);
    setDescricaoManutencao("");
    setFotosManutencao([]);
    setPrecisaMaterialManutencao(null);
    setPrecisaServicoManutencao(null);
    setManutencaoSubFase("descrever");
  }

  async function handleFotoManutencao(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || fotosManutencao.length >= MAX_FOTOS_MANUTENCAO) return;
    setUploadandoFotoManutencao(true);
    try {
      const fileComprimido = await comprimirImagem(file);
      const fd = new FormData();
      fd.append("file", fileComprimido);
      fd.append("tipo", "manutencao");
      fd.append("pasta", "manutencao-camareira");
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.url) setFotosManutencao((prev) => [...prev, json.url]);
    } catch {
      // Foto é opcional — falha silenciosa não impede o registro.
    } finally {
      setUploadandoFotoManutencao(false);
    }
  }

  function removerFotoManutencao(idx: number) {
    setFotosManutencao((prev) => prev.filter((_, i) => i !== idx));
  }

  async function enviarManutencao() {
    if (
      !itemManutencaoSelecionado ||
      !assignmentAtivo ||
      descricaoManutencao.trim().length < 5 ||
      precisaMaterialManutencao === null ||
      precisaServicoManutencao === null
    )
      return;
    setEnviandoManutencao(true);
    try {
      const res = await apiFetch("/api/manutencao-reporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uhId: assignmentAtivo.uh.id,
          checklistItemId: itemManutencaoSelecionado.id,
          descricao: descricaoManutencao.trim(),
          fotos: fotosManutencao,
          needsMaterial: precisaMaterialManutencao,
          needsExternalService: precisaServicoManutencao,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Erro ${res.status}`);
      if (!json.jaRegistrado) {
        setItensManutencaoRegistradosAgora((prev) => new Set(prev).add(itemManutencaoSelecionado.id));
      }
      setResultadoManutencao({ jaRegistrado: !!json.jaRegistrado, itemNome: itemManutencaoSelecionado.name });
      setManutencaoSubFase("resultado");
    } catch {
      // Mantém na tela de descrição — a camareira pode tentar de novo.
    } finally {
      setEnviandoManutencao(false);
    }
  }

  function continuarAposResultadoManutencao(registrarOutro: boolean) {
    if (registrarOutro) {
      setItemManutencaoSelecionado(null);
      setDescricaoManutencao("");
      setFotosManutencao([]);
      setResultadoManutencao(null);
      setManutencaoSubFase("selecionar");
    } else {
      finalizarEtapaManutencao();
    }
  }

  // Antes disso, uma exceção dentro de img.onload (ex.: canvas.getContext("2d")
  // retornando null — acontece em fotos muito grandes, comuns em câmeras de
  // celular atuais) ou o canvas.toBlob simplesmente nunca chamar o callback
  // (bug conhecido do WebKit/Safari mobile pra canvas grandes) deixava essa
  // Promise pendurada pra sempre: handleFotoUpload ficava travado no
  // `await comprimirImagem(file)`, nunca chegava no catch/finally, e o botão
  // ficava preso em "Enviando..." pra sempre, sem erro nenhum aparecer.
  // Agora: qualquer falha (exceção ou callback que nunca dispara) cai num
  // fallback que resolve com o arquivo original sem compressão, e um timeout
  // de segurança garante que a Promise sempre se resolve em poucos segundos.
  async function comprimirImagem(file: File, maxWidth = 1200, quality = 0.82): Promise<File> {
    const tentativa = new Promise<File>((resolve) => {
      try {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        const falhar = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
        };
        img.onload = () => {
          try {
            URL.revokeObjectURL(objectUrl);
            const canvas = document.createElement("canvas");
            let { width, height } = img;
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(file);
              return;
            }
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
          } catch {
            resolve(file);
          }
        };
        img.onerror = falhar;
        img.src = objectUrl;
      } catch {
        resolve(file);
      }
    });

    const timeout = new Promise<File>((resolve) => {
      setTimeout(() => resolve(file), 8000);
    });

    return Promise.race([tentativa, timeout]);
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

      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
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

  // ─── Edição de fotos de UH já concluída ────────────────────────────────
  // Reaproveita comprimirImagem/upload iguais a handleFotoUpload — a única
  // diferença é que aqui a sessão já está finalizada, então em vez de
  // acumular em `fotos` (usado só durante o fluxo ativo de limpeza) e
  // enviar tudo junto no "finalizar", cada alteração fica só em memória
  // (fotosEdicao) até a camareira apertar "Salvar alterações", que manda o
  // mapa inteiro pra ação "editar_fotos".
  function abrirEdicaoFotos(a: Assignment) {
    if (!a.cleaningSession || !podeOperar) return;
    let parsed: Record<string, string[]> = {};
    try {
      const raw = JSON.parse(a.cleaningSession.fotos || "{}");
      // Sessões antigas/nunca editadas guardam "[]" (array vazio) — vira
      // objeto vazio aqui pra caber no mesmo formato { tipo: string[] }.
      parsed = Array.isArray(raw) ? {} : raw;
    } catch {
      parsed = {};
    }
    setFotosEdicao(parsed);
    setEditandoFotosId(a.cleaningSession.id);
    setErroEdicaoFotos(null);
  }

  async function handleFotoEdicaoUpload(tipo: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editandoFotosId) return;

    setUploadingEdicao(tipo);
    setErroEdicaoFotos(null);

    try {
      const fileComprimido = await comprimirImagem(file);
      const fd = new FormData();
      fd.append("file", fileComprimido);
      fd.append("sessaoId", editandoFotosId);
      fd.append("tipo", tipo);

      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      const { url } = await res.json();
      if (!url) throw new Error("URL não retornada pelo servidor");
      setFotosEdicao((prev) => ({ ...prev, [tipo]: [...(prev[tipo] ?? []), url] }));
    } catch (err: any) {
      setErroEdicaoFotos(`Falha ao enviar foto. Tente novamente. (${err.message})`);
    } finally {
      setUploadingEdicao(null);
    }
  }

  function removerFotoEdicao(tipo: string, idx: number) {
    setFotosEdicao((prev) => ({ ...prev, [tipo]: (prev[tipo] ?? []).filter((_, i) => i !== idx) }));
  }

  async function salvarEdicaoFotos() {
    if (!editandoFotosId || !podeOperar) return;
    setSalvandoFotosEdicao(true);
    setErroEdicaoFotos(null);
    try {
      const res = await apiFetch("/api/sessoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editar_fotos", sessaoId: editandoFotosId, fotos: fotosEdicao }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      setEditandoFotosId(null);
      await carregar();
    } catch (err: any) {
      setErroEdicaoFotos(`Falha ao salvar. Tente novamente. (${err.message})`);
    } finally {
      setSalvandoFotosEdicao(false);
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
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.url) setFotoLavanderia(data.url);
    } catch {}
    setUploadandoFotoLav(false);
  }

  async function reportarFalhaLavanderia() {
    if (!descricaoLavanderia.trim() || !assignmentAtivo) return;
    setEnviandoLavanderia(true);
    await apiFetch("/api/falha-lavanderia", {
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
    await apiFetch("/api/bloqueio", {
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
    await apiFetch("/api/sessoes", {
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

  // ─── TELA DE MANUTENÇÃO (etapa obrigatória, antes das fotos) ────────────
  // Pergunta Sim/Não → se Sim, loop de selecionar item / descrever + fotos /
  // resultado / "mais algum item?". O tempo aqui não conta contra a
  // camareira (ver iniciarEtapaManutencao/finalizarEtapaManutencao acima).
  if (fase === "manutencao" && assignmentAtivo) {
    const assignmentFrescoManut = data?.assignments.find((a) => a.id === assignmentAtivo.id) ?? assignmentAtivo;
    const itensDisponiveis = assignmentFrescoManut.manutencaoItens ?? [];
    const pendentesSet = new Set(assignmentFrescoManut.manutencaoPendentes ?? []);
    const itensPorCategoria = itensDisponiveis.reduce<Record<string, ItemChecklistManutencao[]>>((acc, it) => {
      (acc[it.category] ??= []).push(it);
      return acc;
    }, {});

    return (
      <><GeoCheckin /><div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
        <div className="bg-blue-700 text-white rounded-xl p-4 mb-6">
          <p className="text-sm opacity-80">{assignmentAtivo.uh.numero}</p>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Wrench className="w-5 h-5" /> Necessidade de manutenção
          </h2>
          <div className="flex items-center gap-1.5 mt-2 text-xs bg-white/15 rounded-lg px-2 py-1 w-fit">
            <Clock className="w-3.5 h-3.5" /> Tempo pausado nesta etapa
          </div>
        </div>

        {manutencaoSubFase === "pergunta" && (
          <div className="card text-center py-8">
            <HelpCircle className="w-10 h-10 text-blue-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-800 mb-1">
              Foi detectada necessidade de manutenção nesta UH?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Ar-condicionado, chuveiro, tomadas, móveis danificados, etc.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => responderPerguntaManutencao(false)}
                className="flex-1 py-4 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
              >
                Não
              </button>
              <button
                onClick={() => responderPerguntaManutencao(true)}
                className="flex-1 py-4 rounded-xl bg-orange-500 text-white font-bold hover:bg-orange-600"
              >
                Sim
              </button>
            </div>
          </div>
        )}

        {manutencaoSubFase === "selecionar" && (
          <>
            <button
              onClick={() => setManutencaoSubFase("pergunta")}
              className="flex items-center gap-1 text-sm text-gray-500 font-medium mb-3 hover:text-gray-700"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <p className="text-sm text-gray-600 mb-3">Selecione o item com necessidade de manutenção:</p>
            {Object.keys(itensPorCategoria).length === 0 ? (
              <div className="card text-center py-6">
                <p className="text-gray-500 mb-4">Nenhum item de checklist de manutenção cadastrado.</p>
                <button onClick={() => continuarAposResultadoManutencao(false)} className="btn-primary w-full py-3">
                  Continuar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(itensPorCategoria).map(([categoria, itens]) => {
                  const aberta = categoriasManutencaoAbertas.has(categoria);
                  return (
                    <div key={categoria} className="card !p-0 overflow-hidden">
                      <button
                        onClick={() => toggleCategoriaManutencao(categoria)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3.5"
                      >
                        <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{categoria}</span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400">{itens.length} item{itens.length > 1 ? "s" : ""}</span>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${aberta ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {aberta && (
                        <div className="border-t border-gray-100">
                          {itens.map((it) => {
                            const jaRegistrado = pendentesSet.has(it.id) || itensManutencaoRegistradosAgora.has(it.id);
                            return (
                              <button
                                key={it.id}
                                onClick={() => selecionarItemManutencao(it, pendentesSet)}
                                className={`w-full text-left flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 ${jaRegistrado ? "opacity-60" : ""}`}
                              >
                                <span className="font-medium text-gray-800">{it.name}</span>
                                {jaRegistrado ? (
                                  <span className="text-xs text-amber-600 font-medium flex items-center gap-1 flex-shrink-0">
                                    <Info className="w-3.5 h-3.5" /> Já registrado
                                  </span>
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {manutencaoSubFase === "descrever" && itemManutencaoSelecionado && (
          <>
            <div className="card mb-3">
              <p className="text-xs text-gray-500">Item selecionado</p>
              <p className="font-bold text-gray-800">{itemManutencaoSelecionado.name}</p>
            </div>
            <div className="card">
              <label className="block text-xs text-gray-500 font-medium mb-1.5">Descreva a falha detectada *</label>
              <textarea
                rows={4}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Ar-condicionado não gela, chuveiro sem água quente..."
                value={descricaoManutencao}
                onChange={(e) => setDescricaoManutencao(e.target.value)}
              />
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Fotos (opcional)</p>
                {fotosManutencao.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {fotosManutencao.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`foto-${idx}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => removerFotoManutencao(idx)}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                {fotosManutencao.length < MAX_FOTOS_MANUTENCAO && (
                  <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2.5 border ${uploadandoFotoManutencao ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                    <Camera className="w-4 h-4 flex-shrink-0" />
                    <span>{uploadandoFotoManutencao ? "Enviando foto..." : "Adicionar foto"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFotoManutencao}
                      disabled={uploadandoFotoManutencao}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="card mt-3">
              <p className="text-xs text-gray-500 font-medium mb-1.5">Precisa adquirir algum material? *</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => setPrecisaMaterialManutencao(true)}
                  className={`py-2.5 rounded-lg border font-medium text-sm ${precisaMaterialManutencao === true ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"}`}
                >
                  Sim
                </button>
                <button
                  onClick={() => setPrecisaMaterialManutencao(false)}
                  className={`py-2.5 rounded-lg border font-medium text-sm ${precisaMaterialManutencao === false ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"}`}
                >
                  Não
                </button>
              </div>
              <p className="text-xs text-gray-500 font-medium mb-1.5">Precisa contratar serviço externo? *</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPrecisaServicoManutencao(true)}
                  className={`py-2.5 rounded-lg border font-medium text-sm ${precisaServicoManutencao === true ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"}`}
                >
                  Sim
                </button>
                <button
                  onClick={() => setPrecisaServicoManutencao(false)}
                  className={`py-2.5 rounded-lg border font-medium text-sm ${precisaServicoManutencao === false ? "border-orange-500 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"}`}
                >
                  Não
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setManutencaoSubFase("selecionar")}
                disabled={enviandoManutencao}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-medium disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={enviarManutencao}
                disabled={
                  descricaoManutencao.trim().length < 5 ||
                  enviandoManutencao ||
                  uploadandoFotoManutencao ||
                  precisaMaterialManutencao === null ||
                  precisaServicoManutencao === null
                }
                className="flex-[2] py-3 rounded-xl bg-orange-500 text-white font-bold disabled:opacity-50"
              >
                {enviandoManutencao ? "Registrando..." : "Registrar falha"}
              </button>
            </div>
          </>
        )}

        {manutencaoSubFase === "resultado" && resultadoManutencao && (
          <div className="card text-center py-8">
            {resultadoManutencao.jaRegistrado ? (
              <>
                <Info className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-gray-800 mb-1">Não é necessário registrar</p>
                <p className="text-sm text-gray-500 mb-6">
                  A não-conformidade do item &ldquo;{resultadoManutencao.itemNome}&rdquo; já está registrada no sistema de Manutenção.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-gray-800 mb-1">Falha registrada</p>
                <p className="text-sm text-gray-500 mb-6">
                  &ldquo;{resultadoManutencao.itemNome}&rdquo; já consta como não conforme na Manutenção.
                </p>
              </>
            )}
            <p className="text-sm text-gray-700 font-medium mb-3">Deseja registrar falha em mais algum item?</p>
            <div className="flex gap-3">
              <button
                onClick={() => continuarAposResultadoManutencao(false)}
                className="flex-1 py-4 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-50"
              >
                Não, ir para fotos
              </button>
              <button
                onClick={() => continuarAposResultadoManutencao(true)}
                className="flex-1 py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700"
              >
                Sim
              </button>
            </div>
          </div>
        )}
      </div>
      </>
    );
  }

  // ─── TELA DE FOTOS ──────────────────────────────────────────────────────
  if (fase === "fotos") {
    return (
      <><GeoCheckin /><div className="min-h-screen bg-gray-50 p-4 max-w-lg mx-auto">
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

        {(!assignmentAtivo?.solicitacaoStatus || assignmentAtivo.solicitacaoStatus === "REJEITADO") && assignmentAtivo?.program?.tipo !== "SUPER_LIMPEZA" && (
          <button
            onClick={() => { setSuperLimpezaId(assignmentAtivo!.id); setSuperLimpezaMsg(""); setSuperLimpezaFotos([]); }}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-amber-400 bg-amber-50 text-amber-800 text-sm font-semibold hover:bg-amber-100"
          >
            <Star className="w-4 h-4 fill-current" /> Solicitar Super Limpeza
          </button>
        )}

        <div className="mt-3 flex gap-2">
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

      {/* Modal de Super Limpeza ⭐️ */}
      {superLimpezaId && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setSuperLimpezaId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500 fill-current" />
                  <h3 className="font-bold text-gray-800">Solicitar Super Limpeza</h3>
                </div>
                <button onClick={() => setSuperLimpezaId(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Explique pra governanta por que essa UH precisa de Super Limpeza (muita louça, quarto muito sujo, etc.). Se aprovado, vale 120 pts fixos, sem controle de tempo.
              </p>
              <textarea
                rows={4}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Muita louça acumulada, quarto muito sujo, hóspede deixou a UH deplorável..."
                value={superLimpezaMsg}
                onChange={(e) => setSuperLimpezaMsg(e.target.value)}
              />
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Fotos (opcional)</p>
                {superLimpezaFotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {superLimpezaFotos.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`foto-${idx}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => setSuperLimpezaFotos((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2.5 border ${uploadandoSuperLimpeza ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  <Camera className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadandoSuperLimpeza ? "Enviando foto..." : "Adicionar foto"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFotoSuperLimpeza}
                    disabled={uploadandoSuperLimpeza}
                  />
                </label>
              </div>
              <button
                onClick={() => solicitarSuperLimpeza(superLimpezaId)}
                disabled={!superLimpezaMsg.trim() || enviandoSuperLimpeza}
                className="mt-3 w-full py-3 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-50"
              >
                {enviandoSuperLimpeza ? "Enviando..." : "⭐️ Enviar solicitação"}
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

  // ─── TELA DE LIMPEZA (CHECKLIST) ─────────────────────────────────────────
  if (fase === "limpeza" && assignmentAtivo) {
    // Dados mais frescos do assignment (após carregar())
    const assignmentFresco = data?.assignments.find((a) => a.id === assignmentAtivo.id) ?? assignmentAtivo;
    const podeSolicitar =
      (!assignmentFresco.solicitacaoStatus || assignmentFresco.solicitacaoStatus === "REJEITADO") &&
      assignmentFresco.program?.tipo !== "LIMPEZA_COMPLETA";
    // Super Limpeza ⭐️ pode ser pedida em qualquer fase da limpeza — só não
    // se já tem uma solicitação em aberto (de qualquer tipo) ou se a UH já
    // está em Super Limpeza.
    const podeSuperLimpeza =
      (!assignmentFresco.solicitacaoStatus || assignmentFresco.solicitacaoStatus === "REJEITADO") &&
      assignmentFresco.program?.tipo !== "SUPER_LIMPEZA";
    const superLimpezaPendente = assignmentFresco.solicitacaoStatus === "PENDENTE" && assignmentFresco.solicitacaoTipo === "SUPER_LIMPEZA";
    const superLimpezaAprovada = assignmentFresco.solicitacaoStatus === "APROVADO" && assignmentFresco.solicitacaoTipo === "SUPER_LIMPEZA";
    const superLimpezaRejeitada = assignmentFresco.solicitacaoStatus === "REJEITADO" && assignmentFresco.solicitacaoTipo === "SUPER_LIMPEZA";
    const trocaPendente = assignmentFresco.solicitacaoStatus === "PENDENTE" && assignmentFresco.solicitacaoTipo !== "SUPER_LIMPEZA";
    const trocaAprovada = assignmentFresco.solicitacaoStatus === "APROVADO" && assignmentFresco.solicitacaoTipo !== "SUPER_LIMPEZA";
    const trocaRejeitada = assignmentFresco.solicitacaoStatus === "REJEITADO" && assignmentFresco.solicitacaoTipo !== "SUPER_LIMPEZA";

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
                onClick={iniciarEtapaManutencao}
                className="btn-success w-full py-4 text-base font-bold"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
      <GeoCheckin />
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
              {podeSuperLimpeza && (
                <button
                  onClick={() => { setSuperLimpezaId(assignmentAtivo.id); setSuperLimpezaMsg(""); setSuperLimpezaFotos([]); }}
                  className="flex items-center gap-1 text-xs bg-amber-400/90 hover:bg-amber-400 text-amber-950 font-semibold px-2 py-1 rounded-lg transition-colors"
                >
                  <Star className="w-3 h-3 fill-current" /> Super Limpeza
                </button>
              )}
              {trocaPendente && (
                <span className="text-xs bg-yellow-400/30 text-yellow-100 px-2 py-1 rounded-lg">⏳ Aguardando aprovação</span>
              )}
              {trocaAprovada && (
                <span className="text-xs bg-green-400/30 text-green-100 px-2 py-1 rounded-lg">✅ Alteração aprovada</span>
              )}
              {trocaRejeitada && (
                <span className="text-xs bg-red-400/30 text-red-100 px-2 py-1 rounded-lg">❌ Não aprovada</span>
              )}
              {superLimpezaPendente && (
                <span className="text-xs bg-amber-400/30 text-amber-100 px-2 py-1 rounded-lg">⭐️ Aguardando aprovação</span>
              )}
              {superLimpezaAprovada && (
                <span className="text-xs bg-green-400/30 text-green-100 px-2 py-1 rounded-lg">⭐️ Super Limpeza aprovada</span>
              )}
              {superLimpezaRejeitada && (
                <span className="text-xs bg-red-400/30 text-red-100 px-2 py-1 rounded-lg">❌ Super Limpeza indeferida</span>
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
                {safeStepIdx === totalSteps - 1 ? "Concluir etapas" : "Feito! Próxima etapa"}
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

      {/* Modal de Super Limpeza ⭐️ */}
      {superLimpezaId && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setSuperLimpezaId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500 fill-current" />
                  <h3 className="font-bold text-gray-800">Solicitar Super Limpeza</h3>
                </div>
                <button onClick={() => setSuperLimpezaId(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Explique pra governanta por que essa UH precisa de Super Limpeza (muita louça, quarto muito sujo, etc.). Se aprovado, vale 120 pts fixos, sem controle de tempo.
              </p>
              <textarea
                rows={4}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Muita louça acumulada, quarto muito sujo, hóspede deixou a UH deplorável..."
                value={superLimpezaMsg}
                onChange={(e) => setSuperLimpezaMsg(e.target.value)}
              />
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Fotos (opcional)</p>
                {superLimpezaFotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {superLimpezaFotos.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`foto-${idx}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => setSuperLimpezaFotos((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2.5 border ${uploadandoSuperLimpeza ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  <Camera className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadandoSuperLimpeza ? "Enviando foto..." : "Adicionar foto"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFotoSuperLimpeza}
                    disabled={uploadandoSuperLimpeza}
                  />
                </label>
              </div>
              <button
                onClick={() => solicitarSuperLimpeza(superLimpezaId)}
                disabled={!superLimpezaMsg.trim() || enviandoSuperLimpeza}
                className="mt-3 w-full py-3 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-50"
              >
                {enviandoSuperLimpeza ? "Enviando..." : "⭐️ Enviar solicitação"}
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
    <><GeoCheckin /><div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
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
                  {a.solicitacaoStatus === "PENDENTE" && a.solicitacaoTipo === "SUPER_LIMPEZA" && (
                    <p className="text-xs text-amber-600 mt-1">⭐️ Super Limpeza solicitada — aguardando aprovação</p>
                  )}
                  {a.solicitacaoStatus === "PENDENTE" && a.solicitacaoTipo !== "SUPER_LIMPEZA" && (
                    <p className="text-xs text-blue-600 mt-1">⏳ Solicitação enviada — aguardando aprovação</p>
                  )}
                  {a.solicitacaoStatus === "APROVADO" && a.solicitacaoTipo === "SUPER_LIMPEZA" && (
                    <p className="text-xs text-green-600 mt-1">⭐️ Super Limpeza aprovada</p>
                  )}
                  {a.solicitacaoStatus === "APROVADO" && a.solicitacaoTipo !== "SUPER_LIMPEZA" && (
                    <p className="text-xs text-green-600 mt-1">✅ Alteração aprovada</p>
                  )}
                  {a.solicitacaoStatus === "REJEITADO" && a.solicitacaoTipo === "SUPER_LIMPEZA" && (
                    <p className="text-xs text-red-500 mt-1">❌ Super Limpeza indeferida</p>
                  )}
                  {a.solicitacaoStatus === "REJEITADO" && a.solicitacaoTipo !== "SUPER_LIMPEZA" && (
                    <p className="text-xs text-red-500 mt-1">❌ Alteração não aprovada</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-end">
                  {!bloqueado && !concluido && (
                    <button
                      onClick={() => iniciarLimpeza(a)}
                      disabled={!podeOperar}
                      title={!podeOperar ? tituloSemAcesso : undefined}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${
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
                      disabled={!podeOperar}
                      title={!podeOperar ? tituloSemAcesso : undefined}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
                    >
                      <MessageSquarePlus className="w-3 h-3" /> Solicitar alteração
                    </button>
                  )}
                  {liberado && (!a.solicitacaoStatus || a.solicitacaoStatus === "REJEITADO") && a.program?.tipo !== "SUPER_LIMPEZA" && (
                    <button
                      onClick={() => { setSuperLimpezaId(a.id); setSuperLimpezaMsg(""); setSuperLimpezaFotos([]); }}
                      disabled={!podeOperar}
                      title={!podeOperar ? tituloSemAcesso : undefined}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 font-medium disabled:opacity-40"
                    >
                      <Star className="w-3 h-3 fill-current" /> Super Limpeza
                    </button>
                  )}
                  {concluido && a.cleaningSession && (
                    <button
                      onClick={() => abrirEdicaoFotos(a)}
                      disabled={!podeOperar}
                      title={!podeOperar ? tituloSemAcesso : undefined}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40"
                    >
                      <Camera className="w-3 h-3" /> Editar fotos
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

      {/* Modal de Super Limpeza ⭐️ */}
      {superLimpezaId && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => setSuperLimpezaId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500 fill-current" />
                  <h3 className="font-bold text-gray-800">Solicitar Super Limpeza</h3>
                </div>
                <button onClick={() => setSuperLimpezaId(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Explique pra governanta por que essa UH precisa de Super Limpeza (muita louça, quarto muito sujo, etc.). Se aprovado, vale 120 pts fixos, sem controle de tempo.
              </p>
              <textarea
                rows={4}
                className="w-full border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 resize-none"
                style={{ fontSize: "16px" }}
                placeholder="Ex.: Muita louça acumulada, quarto muito sujo, hóspede deixou a UH deplorável..."
                value={superLimpezaMsg}
                onChange={(e) => setSuperLimpezaMsg(e.target.value)}
              />
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Fotos (opcional)</p>
                {superLimpezaFotos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {superLimpezaFotos.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`foto-${idx}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        <button
                          onClick={() => setSuperLimpezaFotos((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className={`flex items-center gap-2 cursor-pointer text-sm rounded-lg px-3 py-2.5 border ${uploadandoSuperLimpeza ? "opacity-50 border-gray-200 bg-gray-50 text-gray-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  <Camera className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadandoSuperLimpeza ? "Enviando foto..." : "Adicionar foto"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFotoSuperLimpeza}
                    disabled={uploadandoSuperLimpeza}
                  />
                </label>
              </div>
              <button
                onClick={() => solicitarSuperLimpeza(superLimpezaId)}
                disabled={!superLimpezaMsg.trim() || enviandoSuperLimpeza}
                className="mt-3 w-full py-3 rounded-xl bg-amber-500 text-white font-bold disabled:opacity-50"
              >
                {enviandoSuperLimpeza ? "Enviando..." : "⭐️ Enviar solicitação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição de fotos — UH já concluída, camareira percebeu foto
          errada/no lugar errado (ver abrirEdicaoFotos). Mesmo padrão visual
          da tela de fotos obrigatórias (tela "fotos"), mas com "Remover" em
          cada foto já existente, não só nas recém-tiradas. */}
      {editandoFotosId && (
        <div className="fixed inset-x-0 bottom-0 top-0 z-50 flex items-end" onClick={() => !salvandoFotosEdicao && setEditandoFotosId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-gray-800">Editar fotos</h3>
                </div>
                <button onClick={() => setEditandoFotosId(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                Remova fotos erradas ou tire novas fotos pros ambientes abaixo.
              </p>

              {erroEdicaoFotos && (
                <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0">⚠️</span>
                  <span>{erroEdicaoFotos}</span>
                </div>
              )}

              <div className="space-y-3">
                {FOTO_TIPOS.map((tipo) => {
                  const lista = fotosEdicao[tipo] ?? [];
                  return (
                    <div key={tipo} className="card">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{FOTO_LABELS[tipo]}</p>
                          {lista.length > 0 ? (
                            <p className="text-xs text-green-600 mt-0.5">✓ {lista.length} foto{lista.length > 1 ? "s" : ""}</p>
                          ) : (
                            <p className="text-xs text-gray-400">Sem foto</p>
                          )}
                        </div>
                        <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 ${uploadingEdicao === tipo ? "opacity-50 pointer-events-none" : ""}`}>
                          <Camera className="w-4 h-4" />
                          {uploadingEdicao === tipo ? "Enviando..." : "+ Adicionar"}
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleFotoEdicaoUpload(tipo, e)}
                            disabled={uploadingEdicao === tipo}
                          />
                        </label>
                      </div>
                      {lista.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-1">
                          {lista.map((url, idx) => (
                            <div key={idx} className="relative">
                              <img src={url} alt={`${tipo}-${idx}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                              <button
                                onClick={() => removerFotoEdicao(tipo, idx)}
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

              <button
                onClick={salvarEdicaoFotos}
                disabled={salvandoFotosEdicao}
                className="btn-primary w-full mt-4 py-3"
              >
                {salvandoFotosEdicao ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
