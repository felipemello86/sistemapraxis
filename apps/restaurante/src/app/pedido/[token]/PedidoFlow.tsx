"use client";
import { useMemo, useState } from "react";
import { Plus, Minus, ChevronLeft, ChevronRight, Check, Pencil, Clock, Coffee } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Fluxo público do hóspede: boas-vindas → seleção por seções → observações
// → horário → resumo/confirmação. Mobile-first (o hóspede abre no celular).

type Item = { id: string; nome: string; descricao: string | null };
type Secao = { id: string; nome: string; limiteSingle: number; items: Item[] };

const HORARIOS = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];

type Etapa = "boasvindas" | "selecao" | "observacoes" | "horario" | "resumo" | "confirmado";

export function PedidoFlow({
  token, clienteNome, uhNumero, tipo, editavel, jaConfirmado,
  observacoesIniciais, horarioInicial, itensIniciais, secoes,
}: {
  token: string;
  clienteNome: string;
  uhNumero: string;
  tipo: "SINGLE" | "DOUBLE";
  editavel: boolean;
  jaConfirmado: boolean;
  observacoesIniciais: string;
  horarioInicial: string | null;
  itensIniciais: Record<string, number>;
  secoes: Secao[];
}) {
  const [etapa, setEtapa] = useState<Etapa>("boasvindas");
  const [qtd, setQtd] = useState<Record<string, number>>(itensIniciais);
  const [obs, setObs] = useState(observacoesIniciais);
  const [horario, setHorario] = useState<string | null>(horarioInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const multiplicador = tipo === "DOUBLE" ? 2 : 1;
  const primeiroNome = clienteNome.split(" ")[0];

  const totalPorSecao = useMemo(() => {
    const tot = new Map<string, number>();
    for (const s of secoes) {
      tot.set(s.id, s.items.reduce((acc, i) => acc + (qtd[i.id] ?? 0), 0));
    }
    return tot;
  }, [qtd, secoes]);

  const totalItens = Object.values(qtd).reduce((a, b) => a + b, 0);

  function ajustar(secao: Secao, itemId: string, delta: number) {
    setQtd((prev) => {
      const atual = prev[itemId] ?? 0;
      const novo = Math.max(0, atual + delta);
      const limite = secao.limiteSingle * multiplicador;
      const totalSecao = secao.items.reduce((acc, i) => acc + (i.id === itemId ? novo : prev[i.id] ?? 0), 0);
      if (delta > 0 && totalSecao > limite) return prev;
      const next = { ...prev };
      if (novo === 0) delete next[itemId];
      else next[itemId] = novo;
      return next;
    });
  }

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const res = await apiFetch("/api/publico/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        itens: Object.entries(qtd).map(([menuItemId, quantidade]) => ({ menuItemId, quantidade })),
        observacoes: obs,
        horarioEntrega: horario,
      }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setErro(data.error || `Erro ${res.status}`);
      return;
    }
    setEtapa("confirmado");
  }

  if (!editavel) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-5xl mb-4">👩‍🍳</p>
          <h1 className="text-xl font-bold text-gray-800">Seu café já está em preparação!</h1>
          <p className="text-sm text-gray-500 mt-2">
            {primeiroNome}, seu pedido {horarioInicial ? `das ${horarioInicial}` : ""} já está com a nossa cozinha
            e não pode mais ser alterado. Qualquer coisa, fale com a recepção. 🥐
          </p>
        </div>
      </Shell>
    );
  }

  // ── Etapas ────────────────────────────────────────────────────────────────
  if (etapa === "boasvindas") {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-5xl mb-4">☀️</p>
          <h1 className="text-2xl font-bold text-gray-900">Bom dia, {primeiroNome}!</h1>
          <p className="text-gray-600 mt-3 leading-relaxed">
            Que bom ter você aqui. Preparamos um cardápio especial para o seu café da manhã
            {tipo === "DOUBLE" ? " para dois" : ""} — escolha seus favoritos e a gente entrega
            fresquinho na UH <strong>{uhNumero}</strong>, no horário que preferir.
          </p>
          {jaConfirmado && (
            <p className="text-sm text-gray-600 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 mt-4">
              Você já confirmou um pedido — pode revisar e alterar enquanto a cozinha não começar o preparo.
            </p>
          )}
          <button onClick={() => setEtapa("selecao")} className="btn-cta mt-8">
            Montar meu café <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </Shell>
    );
  }

  if (etapa === "selecao") {
    return (
      <Shell>
        <StepHeader titulo="Escolha seus itens" subtitulo={`Café ${tipo === "DOUBLE" ? "double — os limites valem em dobro" : "single"}`} />
        <div className="space-y-6">
          {secoes.map((s) => {
            const limite = s.limiteSingle * multiplicador;
            const usado = totalPorSecao.get(s.id) ?? 0;
            return (
              <div key={s.id}>
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="font-bold text-gray-800">{s.nome}</h2>
                  <span className={`text-xs font-medium ${usado >= limite ? "text-gray-900" : "text-gray-400"}`}>
                    {usado}/{limite}
                  </span>
                </div>
                <div className="space-y-2">
                  {s.items.map((i) => {
                    const q = qtd[i.id] ?? 0;
                    const lotado = usado >= limite;
                    return (
                      <div key={i.id} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${q > 0 ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white"}`}>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{i.nome}</p>
                          {i.descricao && <p className="text-xs text-gray-500 mt-0.5">{i.descricao}</p>}
                        </div>
                        {q === 0 ? (
                          <button
                            onClick={() => ajustar(s, i.id, 1)}
                            disabled={lotado}
                            className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center disabled:opacity-30 flex-shrink-0"
                            aria-label={`Adicionar ${i.nome}`}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => ajustar(s, i.id, -1)} className="w-8 h-8 rounded-full border border-gray-400 text-gray-700 flex items-center justify-center" aria-label="Remover um">
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-5 text-center font-bold text-gray-900">{q}</span>
                            <button onClick={() => ajustar(s, i.id, 1)} disabled={lotado} className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center disabled:opacity-30" aria-label="Adicionar mais um">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <NavButtons
          onBack={() => setEtapa("boasvindas")}
          onNext={() => setEtapa("observacoes")}
          nextDisabled={totalItens === 0}
          nextLabel={totalItens === 0 ? "Escolha ao menos um item" : "Continuar"}
        />
      </Shell>
    );
  }

  if (etapa === "observacoes") {
    return (
      <Shell>
        <StepHeader titulo="Alguma observação?" subtitulo="Alergias, preferências, ponto do ovo... (opcional)" />
        <textarea
          rows={4}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          placeholder="ex: sem lactose, por favor 🙏"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
        <NavButtons onBack={() => setEtapa("selecao")} onNext={() => setEtapa("horario")} nextLabel="Continuar" />
      </Shell>
    );
  }

  if (etapa === "horario") {
    return (
      <Shell>
        <StepHeader titulo="Que horas você quer receber?" subtitulo="Entregamos na sua UH, no horário escolhido" />
        <div className="grid grid-cols-2 gap-2">
          {HORARIOS.map((h) => (
            <button
              key={h}
              onClick={() => setHorario(h)}
              className={`flex items-center justify-center gap-2 rounded-xl border py-3 font-semibold transition-colors ${
                horario === h ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              <Clock className="w-4 h-4" /> {h}
            </button>
          ))}
        </div>
        <NavButtons
          onBack={() => setEtapa("observacoes")}
          onNext={() => setEtapa("resumo")}
          nextDisabled={!horario}
          nextLabel={horario ? "Revisar pedido" : "Escolha um horário"}
        />
      </Shell>
    );
  }

  if (etapa === "resumo") {
    return (
      <Shell>
        <StepHeader titulo="Confira seu pedido" subtitulo="Tudo certo? É só confirmar 🤍" />
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          <div className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Hóspede</p>
            <p className="font-medium text-gray-900">{clienteNome} · UH {uhNumero}</p>
            <p className="text-sm text-gray-500">Café {tipo === "DOUBLE" ? "double" : "single"}</p>
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Itens</p>
            <ul className="space-y-1">
              {secoes.flatMap((s) =>
                s.items
                  .filter((i) => (qtd[i.id] ?? 0) > 0)
                  .map((i) => (
                    <li key={i.id} className="flex justify-between text-sm">
                      <span className="text-gray-700">{i.nome}</span>
                      <span className="font-semibold text-gray-900">×{qtd[i.id]}</span>
                    </li>
                  ))
              )}
            </ul>
          </div>
          {obs.trim() && (
            <div className="p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Observações</p>
              <p className="text-sm text-gray-700">{obs}</p>
            </div>
          )}
          <div className="p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Entrega</p>
            <p className="font-medium text-gray-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-gray-500" /> {horario}
            </p>
          </div>
        </div>
        {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
        <div className="flex flex-col gap-2 mt-6">
          <button onClick={confirmar} disabled={enviando} className="btn-cta w-full justify-center">
            <Check className="w-5 h-5" /> {enviando ? "Enviando..." : "Confirmar pedido"}
          </button>
          <button onClick={() => setEtapa("selecao")} className="flex items-center justify-center gap-1.5 text-gray-600 font-medium py-2 text-sm">
            <Pencil className="w-4 h-4" /> Editar pedido
          </button>
        </div>
      </Shell>
    );
  }

  // confirmado
  return (
    <Shell>
      <div className="text-center">
        <p className="text-5xl mb-4">🥐</p>
        <h1 className="text-2xl font-bold text-gray-900">Pedido confirmado!</h1>
        <p className="text-gray-600 mt-3 leading-relaxed">
          Obrigado, {primeiroNome}! Seu café da manhã chega na UH <strong>{uhNumero}</strong> às{" "}
          <strong>{horario}</strong>. Bom apetite! ☕️
        </p>
        <button onClick={() => setEtapa("resumo")} className="mt-6 text-gray-600 font-medium text-sm underline">
          Rever meu pedido
        </button>
      </div>
    </Shell>
  );
}

// ── Componentes de apoio ──────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-md mx-auto px-5 py-8 pb-16">
        <div className="flex items-center justify-center gap-2 mb-8 text-gray-500">
          <Coffee className="w-5 h-5" />
          <span className="font-bold tracking-wide text-sm uppercase">Café da manhã</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function StepHeader({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-gray-900">{titulo}</h1>
      <p className="text-sm text-gray-500 mt-0.5">{subtitulo}</p>
    </div>
  );
}

function NavButtons({
  onBack, onNext, nextDisabled, nextLabel,
}: {
  onBack: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 mt-8">
      <button onClick={onBack} className="flex items-center gap-1 text-gray-500 font-medium py-3 px-2 text-sm">
        <ChevronLeft className="w-4 h-4" /> Voltar
      </button>
      <button onClick={onNext} disabled={nextDisabled} className="btn-cta flex-1 justify-center">
        {nextLabel} <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
