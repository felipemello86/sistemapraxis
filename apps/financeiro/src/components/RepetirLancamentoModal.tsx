"use client";
import { X } from "lucide-react";

// Popup "Repetir Lançamento" (pedido do Felipe, 06/08/2026, redesign da
// tela de Conciliações espelhando o Conta Azul) — configura a recorrência
// do lançamento proposto (previsto ou novo) na conciliação: toggle de
// habilitação, frequência (mensal/anual), quantidade de repetições
// (infinito ou N), 1º vencimento, forma de pagamento, conta de pagamento,
// observações. Puramente controlado — quem usa decide o que fazer com o
// `RepetirConfig` resultante (ex.: convertê-lo em
// recorrente/recorrenciaFrequencia/recorrenciaFimData ao chamar a API, ver
// lib/finance/mes.ts#calcularFimRecorrencia).

export type ContaParaSelect = { id: string; nome: string; instituicao?: string };

export interface RepetirConfig {
  habilitado: boolean;
  frequencia: "MENSAL" | "ANUAL";
  qtdeTipo: "infinito" | "numero";
  qtdeNumero: number; // só relevante se qtdeTipo === "numero"
  primeiroVencimento: string; // YYYY-MM-DD
  formaPagamento: string;
  contaBancariaId: string;
  observacoes: string;
}

export const FORMAS_PAGAMENTO = ["Dinheiro", "Pix", "Boleto", "Cartão de Crédito", "Cartão de Débito", "Transferência", "Débito Automático"];

export function repetirConfigPadrao(primeiroVencimento: string): RepetirConfig {
  return {
    habilitado: false,
    frequencia: "MENSAL",
    qtdeTipo: "infinito",
    qtdeNumero: 12,
    primeiroVencimento,
    formaPagamento: "",
    contaBancariaId: "",
    observacoes: "",
  };
}

export function resumoRepeticao(v: RepetirConfig): string {
  if (!v.habilitado) return "Repetir lançamento";
  const freq = v.frequencia === "MENSAL" ? "Mensal" : "Anual";
  const qtde = v.qtdeTipo === "infinito" ? "indefinidamente" : `${v.qtdeNumero}x`;
  return `${freq} · ${qtde}`;
}

export function RepetirLancamentoModal({
  open,
  onClose,
  value,
  onChange,
  contas,
}: {
  open: boolean;
  onClose: () => void;
  value: RepetirConfig;
  onChange: (v: RepetirConfig) => void;
  contas: ContaParaSelect[];
}) {
  if (!open) return null;

  function set<K extends keyof RepetirConfig>(k: K, v: RepetirConfig[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Repetir lançamento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="flex items-center justify-between gap-2 text-sm text-gray-700">
          Repetir este lançamento nos próximos meses (entra como esperado no Orçamento)
          <button
            type="button"
            onClick={() => set("habilitado", !value.habilitado)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${value.habilitado ? "bg-gray-900" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value.habilitado ? "translate-x-4.5" : "translate-x-1"}`} />
          </button>
        </label>

        {value.habilitado && (
          <>
            <div>
              <label className="label">Frequência</label>
              <div className="flex gap-2">
                {(["MENSAL", "ANUAL"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => set("frequencia", f)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${value.frequencia === f ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
                  >
                    {f === "MENSAL" ? "Mensal" : "Anual"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Quantidade de repetições</label>
              <div className="flex gap-2 items-center">
                <div className="flex gap-2 flex-1">
                  {(
                    [
                      ["infinito", "Infinito"],
                      ["numero", "Nº de vezes"],
                    ] as const
                  ).map(([v, rotulo]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("qtdeTipo", v)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${value.qtdeTipo === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"}`}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
                {value.qtdeTipo === "numero" && (
                  <input
                    className="input text-sm w-20 flex-shrink-0"
                    type="number"
                    min="1"
                    value={value.qtdeNumero}
                    onChange={(e) => set("qtdeNumero", Math.max(1, Number(e.target.value) || 1))}
                  />
                )}
              </div>
            </div>

            <div>
              <label className="label">1º vencimento</label>
              <input className="input" type="date" value={value.primeiroVencimento} onChange={(e) => set("primeiroVencimento", e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Também define o dia do mês em que a cobrança se repete.</p>
            </div>

            <div>
              <label className="label">Forma de pagamento (opcional)</label>
              <select className="input" value={value.formaPagamento} onChange={(e) => set("formaPagamento", e.target.value)}>
                <option value="">Não informar</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Conta de pagamento (opcional)</label>
              <select className="input" value={value.contaBancariaId} onChange={(e) => set("contaBancariaId", e.target.value)}>
                <option value="">Não informar</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.instituicao ? ` — ${c.instituicao}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Observações (opcional)</label>
              <textarea className="input" rows={2} value={value.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
            </div>
          </>
        )}

        <button onClick={onClose} className="btn-primary w-full">
          Concluído
        </button>
      </div>
    </div>
  );
}
