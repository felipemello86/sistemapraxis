"use client";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Send, CheckCircle2, Clock, CalendarOff, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Wrench, BedDouble } from "lucide-react";
import { formatarTempo } from "@/lib/scoring";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/atribuicao/AtribuicaoView.tsx (v1).
// Diferenças desta fatia:
//   - `role`/`userId` vêm por prop (server component), não useSession.
//   - fetch cru → apiFetch.
//   - Avatar usa User.foto (Cadastro de Usuários no gateway) quando
//     disponível, caindo pra inicial do nome quando null.
//   - /api/usuarios-locais → /api/usuarios (v2 não tem duplicação de User
//     local vs cadastro único, é a mesma pessoa/id em todo lugar).
//   - Notificação "notificar todas" segue existindo na API mas sem envio de
//     Telegram de fato (TODO na API) — o botão funciona, só não dispara nada
//     ainda.

type UH = { id: string; numero: string; tipo: string; status: string; emManutencao: boolean; manutencaoDescricao?: string | null };
type User = { id: string; nome: string; role: string; foto?: string | null };
type Program = { id: string; nome: string; tipo: string };
type Assignment = {
  id: string;
  status: string;
  liberadaEm: string | null;
  observacoes: string | null;
  uh: UH;
  camareira: User;
  program: Program | null;
  cleaningSession: {
    iniciadaEm: string;
    finalizadaEm: string | null;
    duracaoSegundos: number | null;
    comentarioCamareira: string | null;
    inspection: {
      totalFalhas: number;
      totalFalhasGerenciais: number;
      finalizadaEm: string | null;
      comentarioGovernanta: string | null;
    } | null;
  } | null;
};

function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className: string }) {
  if (foto) return <img src={foto} alt={nome} className={`${className} object-cover`} />;
  return (
    <div className={`${className} bg-blue-100 text-blue-700 font-bold flex items-center justify-center`}>
      {nome[0]?.toUpperCase()}
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDENTE:    { label: "Bloqueada",   color: "bg-gray-100 text-gray-500" },
  LIBERADO:    { label: "Liberada",    color: "bg-yellow-100 text-yellow-700" },
  EM_ANDAMENTO:{ label: "Em limpeza",  color: "bg-blue-100 text-blue-700" },
  CONCLUIDO:   { label: "Concluída",   color: "bg-green-100 text-green-700" },
  INSPECIONADO:{ label: "Inspecionada",color: "bg-purple-100 text-purple-700" },
};

function AssignmentCard({
  a, onRemover, programs, onChangeProgram, onChangeObservacoes, temReserva, outrasCamareiras,
}: {
  a: Assignment;
  onRemover?: (id: string) => void;
  programs: Program[];
  onChangeProgram?: (id: string, programId: string) => void;
  onChangeObservacoes?: (id: string, obs: string) => void;
  temReserva?: boolean;
  outrasCamareiras?: string[];
}) {
  const st = STATUS_LABELS[a.status] ?? { label: a.status, color: "bg-gray-100 text-gray-600" };
  const estaAtivo = a.status === "EM_ANDAMENTO";
  const concluido = ["CONCLUIDO", "INSPECIONADO"].includes(a.status);
  const podeRemover = !!onRemover && !concluido;
  const podeEditarPrograma = !!onChangeProgram && !estaAtivo && !concluido;
  const isEspecifica = a.program?.tipo === "LIMPEZA_COMPLETA";
  const podeEditarObs = !!onChangeObservacoes && isEspecifica && !concluido;
  const temMultiplasCamareiras = !!outrasCamareiras && outrasCamareiras.length > 0;

  return (
    <div className="card flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-gray-900">{a.uh.numero}</span>
          {a.uh.emManutencao && <span title="Em manutenção" className="flex items-center gap-0.5 text-xs text-orange-500 font-medium"><Wrench className="w-3 h-3" /> Manutenção</span>}
          {temReserva && !a.uh.emManutencao && <span title="Com reserva" className="flex items-center gap-0.5 text-xs text-blue-500 font-medium"><BedDouble className="w-3 h-3" /> Reserva</span>}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
        </div>
        {a.uh.emManutencao && a.uh.manutencaoDescricao && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-2 py-1 mt-1">
            {a.uh.manutencaoDescricao}
          </p>
        )}
        {temMultiplasCamareiras && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1">
            ⚠️ UH também atribuída a {outrasCamareiras!.join(", ")} — com mais de uma camareira, ninguém pontua por esta UH.
          </p>
        )}
        <p className="text-sm text-gray-600 mt-0.5">→ {a.camareira.nome}</p>
        {podeEditarPrograma ? (
          <select
            value={a.program?.id ?? ""}
            onChange={(e) => onChangeProgram(a.id, e.target.value)}
            className="mt-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 bg-white"
          >
            {programs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        ) : (
          a.program && <p className="text-xs text-gray-400 mt-0.5">{a.program.nome}</p>
        )}
        {podeEditarObs && (
          <textarea
            rows={2}
            placeholder="Observações para a camareira..."
            defaultValue={a.observacoes ?? ""}
            onBlur={(e) => onChangeObservacoes(a.id, e.target.value)}
            className="mt-1.5 w-full text-xs border border-amber-200 bg-amber-50 rounded px-2 py-1 text-gray-700 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        )}
        {!podeEditarObs && isEspecifica && a.observacoes && (
          <p className="mt-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
            {a.observacoes}
          </p>
        )}
        {a.cleaningSession && (
          <div className="mt-1.5 space-y-1">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {a.cleaningSession.duracaoSegundos && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatarTempo(a.cleaningSession.duracaoSegundos)}
                </span>
              )}
              {a.cleaningSession.inspection && (
                <span className={a.cleaningSession.inspection.totalFalhas > 0 || (a.cleaningSession.inspection.totalFalhasGerenciais ?? 0) > 0 ? "text-red-500" : "text-green-500"}>
                  {a.cleaningSession.inspection.totalFalhas === 0 && (a.cleaningSession.inspection.totalFalhasGerenciais ?? 0) === 0
                    ? "Sem falhas"
                    : [
                        a.cleaningSession.inspection.totalFalhas > 0 ? `${a.cleaningSession.inspection.totalFalhas} camareira` : "",
                        (a.cleaningSession.inspection.totalFalhasGerenciais ?? 0) > 0 ? `${a.cleaningSession.inspection.totalFalhasGerenciais} gerencial` : "",
                      ].filter(Boolean).join(" · ") + " falha(s)"
                  }
                </span>
              )}
            </div>
            {a.cleaningSession.comentarioCamareira && (
              <p className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                💬 Camareira: {a.cleaningSession.comentarioCamareira}
              </p>
            )}
            {a.cleaningSession.inspection?.comentarioGovernanta && (
              <p className="text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                🔍 Governanta: {a.cleaningSession.inspection.comentarioGovernanta}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {podeRemover && (
          <button onClick={() => onRemover(a.id)} className="text-gray-400 hover:text-red-500 p-1.5" title="Remover">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {concluido && <CheckCircle2 className="w-5 h-5 text-green-500" />}
      </div>
    </div>
  );
}

export default function AtribuicaoView({ role, userId }: { role: string; userId: string }) {
  const somenteLeitura = role === "MANUTENCAO";
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [coberturaAtiva, setCoberturaAtiva] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [uhs, setUHs] = useState<UH[]>([]);
  const [camareiras, setCamareiras] = useState<User[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificando, setNotificando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());
  const [novasUHs, setNovasUHs] = useState<string[]>([]);
  const [novaCamareira, setNovaCamareira] = useState("");
  const [novoPrograma, setNovoPrograma] = useState("");
  const [novasObservacoes, setNovasObservacoes] = useState("");
  const [reservaMap, setReservaMap] = useState<Record<string, boolean>>({});
  const [erroAtribuicao, setErroAtribuicao] = useState<string | null>(null);

  function toggleUH(id: string) {
    setNovasUHs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  useEffect(() => { carregar(); }, [data]);

  async function carregar() {
    setLoading(true);
    const hoje = format(new Date(), "yyyy-MM-dd");
    const [a, todasUHs, selR, c, p, cob] = await Promise.all([
      apiFetch(`/api/atribuicoes?data=${data}`).then((r) => r.json()),
      apiFetch("/api/uhs").then((r) => r.json()),
      apiFetch(`/api/selecao-uhs?data=${data}`).then((r) => r.json()),
      apiFetch("/api/usuarios").then((r) => r.json()),
      apiFetch("/api/programas").then((r) => r.json()),
      data === hoje ? apiFetch(`/api/cobertura-folga?data=${hoje}`).then((r) => r.json()) : Promise.resolve(null),
    ]);
    if (cob && userId && cob.governantaId === userId) {
      setCoberturaAtiva(true);
    } else {
      setCoberturaAtiva(false);
    }
    setAssignments(Array.isArray(a) ? a : []);
    const selUHs: any[] = selR.uhs ?? [];
    const selIds: string[] = selUHs.map((u: any) => u.uhId);
    const uhsFiltradas = selIds.length > 0
      ? todasUHs.filter((u: UH) => selIds.includes(u.id))
      : todasUHs;
    setUHs(uhsFiltradas);
    const rm: Record<string, boolean> = {};
    for (const su of selUHs) rm[su.uhId] = su.temReserva ?? false;
    setReservaMap(rm);
    const todos = Array.isArray(c) ? c : [];
    setCamareiras(todos.filter((u: User) => u.role === "CAMAREIRA"));
    const progs = Array.isArray(p) ? p : [];
    setPrograms(progs);
    if (!novoPrograma && progs.length > 0) setNovoPrograma(progs[0].id);
    setLoading(false);
  }

  async function criarAtribuicao() {
    if (novasUHs.length === 0 || !novaCamareira || !novoPrograma) return;
    setSalvando("new");
    setErroAtribuicao(null);
    const respostas = await Promise.all(
      novasUHs.map((uhId) =>
        apiFetch("/api/atribuicoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, uhId, camareiraId: novaCamareira, programId: novoPrograma, observacoes: novasObservacoes || null }),
        }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }))
      )
    );
    setSalvando(null);
    const falhas = respostas.filter((r) => !r.ok);
    if (falhas.length > 0) {
      setErroAtribuicao(falhas[0].body?.error || `Erro ${falhas[0].status} ao atribuir`);
      carregar();
      return;
    }
    setNovasUHs([]);
    carregar();
  }

  async function remover(id: string) {
    if (!confirm("Remover esta atribuição?")) return;
    await apiFetch(`/api/atribuicoes?id=${id}`, { method: "DELETE" });
    carregar();
  }

  async function alterarPrograma(id: string, programId: string) {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    await apiFetch("/api/atribuicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, uhId: a.uh.id, camareiraId: a.camareira.id, programId, observacoes: a.observacoes }),
    });
    carregar();
  }

  async function alterarObservacoes(id: string, observacoes: string) {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    await apiFetch("/api/atribuicoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, uhId: a.uh.id, camareiraId: a.camareira.id, programId: a.program?.id, observacoes: observacoes || null }),
    });
  }

  async function notificarDia() {
    setNotificando(true);
    await apiFetch("/api/atribuicoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "notificar_dia", data }),
    });
    setNotificando(false);
    alert("Notificações enviadas!");
  }

  // Quantas atribuições cada UH já tem hoje (pode ser mais de uma — mutirão
  // com mais de uma camareira, que faz a UH ficar sem pontuação pra ninguém,
  // ver aviso no AssignmentCard e a exclusão em api/scores/route.ts).
  const contagemPorUH = assignments.reduce<Record<string, number>>((acc, a) => {
    acc[a.uh.id] = (acc[a.uh.id] ?? 0) + 1;
    return acc;
  }, {});
  const uhsAtribuidas = new Set(assignments.map((a) => a.uh.id));
  // O seletor de "Adicionar atribuição" continua mostrando TODAS as UHs do
  // dia (não só as sem atribuição) — permite atribuir uma segunda camareira
  // à mesma UH quando necessário. UHs já atribuídas ganham um badge com a
  // contagem de camareiras.
  const uhsDisponiveis = uhs;
  const uhsSemAtribuicao = uhs.filter((u) => !uhsAtribuidas.has(u.id));

  const totalHoje    = uhs.length;
  const aAtribuir    = uhsSemAtribuicao.length;
  const atribuidas   = assignments.length;
  const bloqueadas   = assignments.filter((a) => a.status === "PENDENTE").length;
  const liberadas    = assignments.filter((a) => a.status === "LIBERADO").length;
  const emAndamento  = assignments.filter((a) => a.status === "EM_ANDAMENTO").length;
  const concluidas   = assignments.filter((a) => ["CONCLUIDO", "INSPECIONADO"].includes(a.status)).length;
  const pctConclusao = totalHoje > 0 ? Math.round((concluidas / totalHoje) * 100) : 0;

  const stats = [
    { label: "UHs de hoje",  value: totalHoje,          color: "text-gray-900" },
    { label: "A atribuir",   value: aAtribuir,           color: "text-orange-500" },
    { label: "Atribuídas",   value: atribuidas,          color: "text-gray-700" },
    { label: "Bloqueadas",   value: bloqueadas,          color: "text-gray-500" },
    { label: "Liberadas",    value: liberadas,           color: "text-yellow-600" },
    { label: "Em andamento", value: emAndamento,         color: "text-blue-600" },
    { label: "Concluídas",   value: concluidas,          color: "text-green-600" },
    { label: "% Conclusão",  value: `${pctConclusao}%`, color: pctConclusao === 100 ? "text-green-600" : "text-blue-600" },
  ];

  const porCamareira = assignments.reduce<Record<string, {
    id: string; nome: string; foto?: string | null;
    total: number; bloqueadas: number; liberadas: number; emAndamento: number; concluidas: number;
  }>>((acc, a) => {
    const id = a.camareira.id;
    if (!acc[id]) acc[id] = { id, nome: a.camareira.nome, foto: a.camareira.foto, total: 0, bloqueadas: 0, liberadas: 0, emAndamento: 0, concluidas: 0 };
    acc[id].total++;
    if (a.status === "PENDENTE")                               acc[id].bloqueadas++;
    else if (a.status === "LIBERADO")                          acc[id].liberadas++;
    else if (a.status === "EM_ANDAMENTO")                      acc[id].emAndamento++;
    else if (["CONCLUIDO", "INSPECIONADO"].includes(a.status)) acc[id].concluidas++;
    return acc;
  }, {});

  const camareirasComAtribuicao = Object.values(porCamareira).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Atribuição Diária</h1>
          <p className="text-sm text-gray-500 mt-0.5">Distribua as UHs entre as camareiras</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => { const d = new Date(data + "T12:00:00"); d.setDate(d.getDate() - 1); setData(format(d, "yyyy-MM-dd")); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="input w-auto" />
            <button onClick={() => { const d = new Date(data + "T12:00:00"); d.setDate(d.getDate() + 1); setData(format(d, "yyyy-MM-dd")); }} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {!somenteLeitura && (
            <button onClick={notificarDia} disabled={notificando || assignments.length === 0} className="btn-primary flex items-center gap-2 whitespace-nowrap">
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{notificando ? "Enviando..." : "Notificar todas"}</span>
              <span className="sm:hidden">{notificando ? "..." : "Notificar"}</span>
            </button>
          )}
        </div>
      </div>

      {coberturaAtiva && (
        <div className="card border-l-4 border-l-orange-400 bg-orange-50 mb-6">
          <div className="flex items-start gap-3">
            <CalendarOff className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800">Você está de folga hoje</p>
              <p className="text-sm text-orange-700 mt-0.5">
                Uma camareira está cobrindo suas atribuições. Você não pode adicionar ou remover atribuições neste dia.
              </p>
            </div>
          </div>
        </div>
      )}

      {!somenteLeitura && !coberturaAtiva && <div className="card mb-6">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Adicionar atribuição
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Camareira</label>
            <select value={novaCamareira} onChange={(e) => setNovaCamareira(e.target.value)} className="input">
              <option value="">Selecionar camareira</option>
              {camareiras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Programa</label>
            <select value={novoPrograma} onChange={(e) => { setNovoPrograma(e.target.value); setNovasObservacoes(""); }} className="input">
              {programs.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>

          {uhsDisponiveis.length > 0 && (
            <div className="col-span-full">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">
                  UHs <span className="text-gray-400 font-normal">(selecione uma ou mais)</span>
                </label>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setNovasUHs(uhsDisponiveis.map((u) => u.id))} className="text-blue-600 hover:underline">
                    Todas
                  </button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setNovasUHs([])} className="text-gray-500 hover:underline">
                    Limpar
                  </button>
                </div>
              </div>
              {(() => {
                const programaSelecionado = programs.find((p) => p.id === novoPrograma);
                const temManutencaoBloqueada = uhsDisponiveis.some(
                  (u) => u.emManutencao && programaSelecionado?.tipo === "ARRUMACAO"
                );
                return temManutencaoBloqueada ? (
                  <div className="mb-2 flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                    <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
                    UH(s) em manutenção não podem usar <strong>Arrumação Padrão</strong> — selecione <strong>Limpeza Específica</strong> para atribuí-las.
                  </div>
                ) : null;
              })()}
              <div className="flex flex-wrap gap-2">
                {uhsDisponiveis.map((u) => {
                  const sel = novasUHs.includes(u.id);
                  const programaSelecionado = programs.find((p) => p.id === novoPrograma);
                  const bloqueadaManutencao = u.emManutencao && programaSelecionado?.tipo === "ARRUMACAO";
                  const temReserva = reservaMap[u.id] ?? false;
                  const jaAtribuida = contagemPorUH[u.id] ?? 0;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => !bloqueadaManutencao && toggleUH(u.id)}
                      disabled={bloqueadaManutencao}
                      title={jaAtribuida > 0 ? `Já atribuída a ${jaAtribuida} camareira${jaAtribuida > 1 ? "s" : ""} hoje` : undefined}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all flex items-center gap-1.5 ${
                        bloqueadaManutencao
                          ? "bg-orange-50 border-orange-200 text-orange-400 cursor-not-allowed opacity-75"
                          : sel
                            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                            : "bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:text-blue-600"
                      }`}
                    >
                      {u.emManutencao && <Wrench className="w-3 h-3 flex-shrink-0" />}
                      {temReserva && !u.emManutencao && <BedDouble className="w-3 h-3 flex-shrink-0" />}
                      {u.numero}
                      {jaAtribuida > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-1 ${sel ? "bg-white/25" : "bg-amber-100 text-amber-700"}`}>
                          {jaAtribuida}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {programs.find((p) => p.id === novoPrograma)?.tipo === "LIMPEZA_COMPLETA" && (
            <div className="col-span-full">
              <label className="label">Observações <span className="text-amber-600">(o que precisa ser feito na Limpeza Específica)</span></label>
              <textarea
                rows={2}
                className="input resize-none"
                placeholder="Descreva o que precisa ser feito nestas UHs..."
                value={novasObservacoes}
                onChange={(e) => setNovasObservacoes(e.target.value)}
              />
            </div>
          )}

          <div className="col-span-full flex justify-end items-center gap-3">
            {erroAtribuicao && (
              <p className="text-sm text-red-600">{erroAtribuicao}</p>
            )}
            <button
              onClick={criarAtribuicao}
              disabled={novasUHs.length === 0 || !novaCamareira || !novoPrograma || salvando === "new"}
              className="btn-primary"
            >
              {salvando === "new"
                ? "Atribuindo..."
                : novasUHs.length > 0
                  ? `Atribuir ${novasUHs.length} UH${novasUHs.length > 1 ? "s" : ""}`
                  : "Selecione UHs"}
            </button>
          </div>
        </div>
      </div>}

      {camareirasComAtribuicao.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Camareiras</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {camareirasComAtribuicao.map((c) => {
              const pct = c.total > 0 ? Math.round((c.concluidas / c.total) * 100) : 0;
              return (
                <div key={c.id} className="card flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar nome={c.nome} foto={c.foto} className="w-12 h-12 rounded-full text-lg flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.nome}</p>
                      <p className="text-xs text-gray-500">{c.total} UH{c.total !== 1 ? "s" : ""} atribuída{c.total !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="bg-gray-50 rounded px-2 py-1.5 flex justify-between items-center">
                      <span className="text-gray-500">Bloqueadas</span>
                      <span className="font-bold text-gray-600 ml-1">{c.bloqueadas}</span>
                    </div>
                    <div className="bg-yellow-50 rounded px-2 py-1.5 flex justify-between items-center">
                      <span className="text-yellow-700">Liberadas</span>
                      <span className="font-bold text-yellow-700 ml-1">{c.liberadas}</span>
                    </div>
                    <div className="bg-blue-50 rounded px-2 py-1.5 flex justify-between items-center">
                      <span className="text-blue-700">Andamento</span>
                      <span className="font-bold text-blue-700 ml-1">{c.emAndamento}</span>
                    </div>
                    <div className="bg-green-50 rounded px-2 py-1.5 flex justify-between items-center">
                      <span className="text-green-700">Concluídas</span>
                      <span className="font-bold text-green-700 ml-1">{c.concluidas}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Conclusão</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="card text-center py-3 px-2">
            <p className={`text-xl md:text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : assignments.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p>Nenhuma atribuição para {format(new Date(data + "T12:00:00"), "dd/MM/yyyy")}.</p>
          <p className="text-xs mt-1">Use o formulário acima para adicionar.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {camareirasComAtribuicao.map((c) => {
            const uhsDaCamareira = assignments
              .filter((a) => a.camareira.id === c.id)
              .sort((a, b) => a.uh.numero.localeCompare(b.uh.numero, undefined, { numeric: true }));
            const colapsada = colapsadas.has(c.id);
            const toggleColapso = () => setColapsadas((prev) => {
              const next = new Set(prev);
              next.has(c.id) ? next.delete(c.id) : next.add(c.id);
              return next;
            });
            return (
              <div key={c.id}>
                <button onClick={toggleColapso} className="flex items-center gap-2 mb-2 w-full text-left group">
                  <Avatar nome={c.nome} foto={c.foto} className="w-6 h-6 rounded-full text-xs flex-shrink-0" />
                  <p className="text-sm font-semibold text-gray-700 flex-1">{c.nome}</p>
                  <span className="text-xs text-gray-400 group-hover:text-gray-600">
                    {colapsada ? `${uhsDaCamareira.length} UH${uhsDaCamareira.length !== 1 ? "s" : ""} oculta${uhsDaCamareira.length !== 1 ? "s" : ""}` : ""}
                  </span>
                  {colapsada
                    ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    : <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  }
                </button>
                {!colapsada && (
                  <div className="space-y-2">
                    {uhsDaCamareira.map((a) => (
                      <AssignmentCard
                        key={a.id}
                        a={a}
                        programs={programs}
                        onRemover={somenteLeitura ? undefined : remover}
                        onChangeProgram={somenteLeitura ? undefined : alterarPrograma}
                        onChangeObservacoes={somenteLeitura ? undefined : alterarObservacoes}
                        temReserva={reservaMap[a.uh.id] ?? false}
                        outrasCamareiras={assignments
                          .filter((o) => o.uh.id === a.uh.id && o.camareira.id !== a.camareira.id)
                          .map((o) => o.camareira.nome)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
