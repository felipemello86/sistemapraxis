"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Link2, Copy, Check, Trash2, User, BedDouble } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Pedido = {
  id: string;
  token: string;
  clienteNome: string;
  uhNumero: string;
  tipo: "SINGLE" | "DOUBLE";
  status: string;
  horarioEntrega: string | null;
  createdAt: string;
  itens: { id: string; quantidade: number; menuItem: { nome: string } }[];
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  LINK_ENVIADO: { label: "Aguardando hóspede", cls: "bg-gray-100 text-gray-600" },
  RECEBIDO: { label: "Pedido recebido", cls: "bg-blue-100 text-blue-700" },
  PREPARACAO: { label: "Em preparação", cls: "bg-amber-100 text-amber-700" },
  ENTREGA: { label: "Em entrega", cls: "bg-purple-100 text-purple-700" },
  FINALIZADO: { label: "Finalizado", cls: "bg-green-100 text-green-700" },
};

function linkPublico(token: string) {
  // O link do hóspede passa pelo gateway (domínio público), não pelo deploy
  // direto do módulo — mesmo caminho que o rewrite /restaurante/* já cobre.
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br";
  return `${base}/restaurante/pedido/${token}`;
}

// O botão copiar não copia só a URL: monta a mensagem pronta pro Atendimento
// colar direto no chat com o hóspede (WhatsApp etc).
function mensagemPronta(p: { clienteNome: string; uhNumero: string; token: string }) {
  const primeiroNome = p.clienteNome.split(" ")[0];
  return [
    `Olá, ${primeiroNome}! ☀️`,
    "",
    `Preparamos um link especial pra você montar o seu café da manhã: é só escolher seus itens favoritos e o horário em que prefere receber na UH ${p.uhNumero}.`,
    "",
    linkPublico(p.token),
    "",
    "Qualquer dúvida, é só chamar a gente por aqui. Bom apetite! 🥐",
  ].join("\n");
}

export function LinksView() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [nome, setNome] = useState("");
  const [uh, setUh] = useState("");
  const [tipo, setTipo] = useState<"SINGLE" | "DOUBLE">("SINGLE");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function carregar() {
    const res = await apiFetch("/api/pedidos?escopo=links");
    if (res.ok) setPedidos(await res.json());
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function gerar() {
    if (!nome.trim() || !uh.trim()) return;
    setGerando(true);
    setErro(null);
    const res = await apiFetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteNome: nome, uhNumero: uh, tipo }),
    });
    const data = await res.json();
    setGerando(false);
    if (!res.ok) {
      setErro(data.error || `Erro ${res.status}`);
      return;
    }
    setNome("");
    setUh("");
    setTipo("SINGLE");
    await carregar();
    copiar(data);
  }

  async function copiar(p: { clienteNome: string; uhNumero: string; token: string }) {
    const msg = mensagemPronta(p);
    try {
      await navigator.clipboard.writeText(msg);
      setCopiado(p.token);
      setTimeout(() => setCopiado(null), 2500);
    } catch {
      // clipboard bloqueado (http) — mostra a mensagem pro usuário copiar na mão
      prompt("Copie a mensagem:", msg);
    }
  }

  async function excluir(id: string, nomeCliente: string) {
    if (!confirm(`Cancelar o pedido de ${nomeCliente}?`)) return;
    await apiFetch(`/api/pedidos?id=${id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Gerar Link de Pedido</h1>
        <p className="text-sm text-gray-500">Crie o link do café da manhã e envie ao hóspede</p>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Nome do hóspede</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: Marina Souza" />
          </div>
          <div>
            <label className="label">UH</label>
            <input className="input" value={uh} onChange={(e) => setUh(e.target.value)} placeholder="ex: 304-I" />
          </div>
          <div>
            <label className="label">Café</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(["SINGLE", "DOUBLE"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                    tipo === t ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t === "SINGLE" ? "Single" : "Double"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-4">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <button onClick={gerar} disabled={gerando || !nome.trim() || !uh.trim()} className="btn-primary flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            {gerando ? "Gerando..." : "Gerar link"}
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Links recentes</p>
      {loading ? (
        <p className="text-gray-500 text-sm">Carregando...</p>
      ) : pedidos.length === 0 ? (
        <div className="card text-center text-gray-500 text-sm py-8">Nenhum link gerado ainda.</div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((p) => {
            const st = STATUS_LABEL[p.status] ?? { label: p.status, cls: "bg-gray-100 text-gray-600" };
            return (
              <div key={p.id} className="card flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-gray-400" /> {p.clienteNome}
                    </span>
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <BedDouble className="w-3.5 h-3.5" /> UH {p.uhNumero}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 border border-gray-200">
                      {p.tipo === "DOUBLE" ? "Double" : "Single"}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Gerado em {format(new Date(p.createdAt), "dd/MM HH:mm")}
                    {p.horarioEntrega ? ` · entrega ${p.horarioEntrega}` : ""}
                    {p.itens.length > 0 ? ` · ${p.itens.reduce((s, i) => s + i.quantidade, 0)} item(ns)` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => copiar(p)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    title="Copiar mensagem pronta pro hóspede"
                  >
                    {copiado === p.token ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {p.status === "LINK_ENVIADO" && (
                    <button
                      onClick={() => excluir(p.id, p.clienteNome)}
                      className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Cancelar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
