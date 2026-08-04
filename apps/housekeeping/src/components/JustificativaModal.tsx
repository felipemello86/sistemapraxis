"use client";
import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

// Modal genérico "ação requer justificativa" — pedido do Felipe (04/08/2026)
// pras novas ações administrativas "Liberar sem inspeção" e "Limpeza sem
// Registro" (Governanta/Gerente/Atendimento/Master), que exigem texto de
// justificativa antes de confirmar. Mesmo padrão de modal hand-rolled em
// bottom-sheet já usado em UHDetailModal.tsx/ManutencaoHojeModal.tsx (não há
// Dialog compartilhado em Housekeeping) — pensado pra ser reaproveitado em
// qualquer tela que precise desse mesmo formato (textarea obrigatória +
// confirmar/cancelar), não só nessas duas ações.

export default function JustificativaModal({
  titulo,
  descricao,
  placeholder = "Descreva o motivo...",
  confirmLabel = "Confirmar",
  corConfirm = "bg-blue-600 hover:bg-blue-700",
  enviando = false,
  onConfirmar,
  onClose,
}: {
  titulo: string;
  descricao?: string;
  placeholder?: string;
  confirmLabel?: string;
  // Classe Tailwind do botão de confirmação — cada ação usa uma cor pra se
  // diferenciar (ex.: laranja pra "Liberar sem inspeção", âmbar pra "Limpeza
  // sem Registro"), já que as duas convivem nas mesmas telas.
  corConfirm?: string;
  enviando?: boolean;
  onConfirmar: (justificativa: string) => void;
  onClose: () => void;
}) {
  const [justificativa, setJustificativa] = useState("");

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={() => !enviando && onClose()} />
      <div className="fixed inset-x-0 bottom-0 md:inset-0 z-50 flex md:items-center md:justify-center pointer-events-none">
        <div className="pointer-events-auto w-full md:max-w-md md:mx-4 bg-white rounded-t-2xl md:rounded-2xl shadow-xl">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <h3 className="font-bold text-gray-800">{titulo}</h3>
              </div>
              <button onClick={() => !enviando && onClose()} disabled={enviando}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            {descricao && <p className="text-sm text-gray-500 mb-3">{descricao}</p>}
            <label className="block text-xs text-gray-500 font-medium mb-1.5">Justificativa *</label>
            <textarea
              rows={3}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
              style={{ fontSize: "16px" }}
              placeholder={placeholder}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              disabled={enviando}
            />
            <button
              onClick={() => onConfirmar(justificativa.trim())}
              disabled={!justificativa.trim() || enviando}
              className={`mt-3 w-full py-3 rounded-xl text-white font-bold disabled:opacity-50 ${corConfirm}`}
            >
              {enviando ? "Enviando..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
