"use client";
import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { apiFetch } from "@/lib/apiFetch";

// Fase 1 do plano de PMS/Channel Manager (ver
// praxis-pms-channel-manager-plano.md) — primeira tela do módulo Recepção,
// só leitura de propósito: lista o que já existe em Reserva, seja criada
// manualmente (ainda não há tela pra isso) ou importada via webhook da
// Channex (ver packages/core/src/channel-manager/channex.ts). Criar/editar
// reserva pela tela é escopo de uma próxima versão.

type Reserva = {
  id: string;
  checkInData: string;
  checkOutData: string;
  status: "CONFIRMADA" | "CHECK_IN" | "CHECK_OUT" | "CANCELADA" | "NO_SHOW";
  canal: "DIRETO" | "AIRBNB" | "BOOKING" | "OUTRO";
  canalReservaId: string | null;
  adultos: number;
  criancas: number;
  uhTipoSolicitado: string | null;
  valorTotal: string | null;
  moeda: string;
  hospede: { nome: string; email: string | null; telefone: string | null };
  uh: { numero: string; tipo: string } | null;
};

const STATUS_LABEL: Record<Reserva["status"], string> = {
  CONFIRMADA: "Confirmada",
  CHECK_IN: "Check-in feito",
  CHECK_OUT: "Check-out feito",
  CANCELADA: "Cancelada",
  NO_SHOW: "No-show",
};

const STATUS_STYLE: Record<Reserva["status"], string> = {
  CONFIRMADA: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  CHECK_IN: "bg-green-50 text-green-700 ring-1 ring-green-200",
  CHECK_OUT: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  CANCELADA: "bg-red-50 text-red-700 ring-1 ring-red-200",
  NO_SHOW: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

const CANAL_LABEL: Record<Reserva["canal"], string> = {
  DIRETO: "Direto",
  AIRBNB: "Airbnb",
  BOOKING: "Booking.com",
  OUTRO: "Outro canal",
};

function formatarData(iso: string) {
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

export function ReservasView() {
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/reservas")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Falha ao carregar reservas");
        return res.json();
      })
      .then(setReservas)
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar reservas"));
  }, []);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Reservas</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Reservas confirmadas, canceladas ou em andamento — inclui as importadas automaticamente via Channex.
        </p>
      </div>

      {erro && (
        <div className="card border-red-200 bg-red-50 text-red-700 text-sm mb-4">{erro}</div>
      )}

      {!erro && reservas === null && (
        <div className="card text-sm text-gray-500">Carregando...</div>
      )}

      {reservas !== null && reservas.length === 0 && (
        <div className="card text-sm text-gray-500 text-center py-10">
          Nenhuma reserva ainda. Reservas feitas via Airbnb/Booking.com (uma vez conectadas) ou criadas manualmente vão aparecer aqui.
        </div>
      )}

      {reservas !== null && reservas.length > 0 && (
        <>
          {/* Tabela — desktop */}
          <div className="hidden md:block card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-3">Hóspede</th>
                  <th className="text-left font-medium px-4 py-3">UH</th>
                  <th className="text-left font-medium px-4 py-3">Check-in</th>
                  <th className="text-left font-medium px-4 py-3">Check-out</th>
                  <th className="text-left font-medium px-4 py-3">Hóspedes</th>
                  <th className="text-left font-medium px-4 py-3">Canal</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reservas.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.hospede.nome}</p>
                      {r.hospede.email && <p className="text-xs text-gray-400">{r.hospede.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.uh ? r.uh.numero : (
                        <span className="text-gray-400">
                          Não alocada{r.uhTipoSolicitado ? ` (${r.uhTipoSolicitado})` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatarData(r.checkInData)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatarData(r.checkOutData)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {r.adultos} adulto{r.adultos === 1 ? "" : "s"}
                      {r.criancas > 0 ? `, ${r.criancas} criança${r.criancas === 1 ? "" : "s"}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{CANAL_LABEL[r.canal]}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards — mobile */}
          <div className="md:hidden space-y-3">
            {reservas.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{r.hospede.nome}</p>
                    <p className="text-xs text-gray-400">
                      {r.uh ? `UH ${r.uh.numero}` : `Não alocada${r.uhTipoSolicitado ? ` (${r.uhTipoSolicitado})` : ""}`}
                    </p>
                  </div>
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                <div className="mt-3 text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>{formatarData(r.checkInData)} → {formatarData(r.checkOutData)}</span>
                  <span>{r.adultos} adulto{r.adultos === 1 ? "" : "s"}{r.criancas > 0 ? `, ${r.criancas} criança${r.criancas === 1 ? "" : "s"}` : ""}</span>
                  <span>{CANAL_LABEL[r.canal]}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
