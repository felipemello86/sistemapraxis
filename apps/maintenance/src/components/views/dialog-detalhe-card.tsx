'use client'

import { BedDouble, CheckCircle2, Clock, History, Lock, Phone, Siren } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatarData } from '@/lib/domain'
import type { CorrectionCardView } from '@/lib/types'

// Popup de detalhamento da não conformidade — aberto ao clicar em qualquer
// card dos 3 kanbans de Correção (Aquisição/Serviços Externos/Execução,
// incluindo A Processar/A Fazer/Planejadas/Executadas). Pedido explícito do
// Felipe. Puramente client-side: CorrectionCardView já carrega tudo que
// existe sobre o card (ver lib/types.ts) — não precisa de nenhuma chamada
// nova ao servidor, só reorganiza os dados já carregados em seções legíveis.

function formatarHora(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

const SERVICO_LABEL: Record<string, string> = {
  A_CONTRATAR: 'A contratar',
  EM_NEGOCIACAO: 'Em negociação',
  AGENDADO: 'Agendado',
  EXECUTADO: 'Executado',
}

const EXECUCAO_LABEL: Record<string, string> = {
  A_FAZER: 'A Fazer',
  PLANEJADA: 'Planejada',
  EXECUTADA: 'Executada',
}

export function DialogDetalheCard({
  card,
  temReserva,
  onClose,
}: {
  card: CorrectionCardView | null
  temReserva: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={card !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {card && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-1.5">
                Unidade {card.uhName}
                {card.urgente && (
                  <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                    <Siren className="h-2.5 w-2.5" />
                    Urgente
                  </span>
                )}
                {temReserva && (
                  <span className="flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                    <BedDouble className="h-2.5 w-2.5" />
                    Reserva
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                {card.checklistItemName ?? 'Item removido do catálogo'}
                {card.checklistItemCategory ? ` · ${card.checklistItemCategory}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Descrição</p>
                <p>{card.comment || 'Sem descrição.'}</p>
              </div>

              {card.photos.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Fotos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {card.photos.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`Foto ${i + 1}`}
                        className="aspect-square rounded-lg border border-border/70 object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Registrado em {formatarHora(card.createdAt)}
              </p>

              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                <p className="text-xs font-medium text-muted-foreground">Triagem</p>
                {card.needsMaterial === null || card.needsExternalService === null ? (
                  <p className="text-xs text-muted-foreground">
                    Ainda não classificado — aguardando Manutenção em &quot;A Processar&quot;.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span>
                      Material: <strong>{card.needsMaterial ? 'sim' : 'não'}</strong>
                    </span>
                    <span>
                      Serviço externo: <strong>{card.needsExternalService ? 'sim' : 'não'}</strong>
                    </span>
                  </div>
                )}
              </div>

              {card.needsMaterial && (
                <div className="space-y-1.5 rounded-xl border border-border/70 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Aquisição</p>
                  <p className="text-xs">
                    {card.materialStatus === 'COMPRADO' ? 'Comprado' : 'A adquirir'}
                    {card.materialCompradoEm ? ` em ${formatarData(card.materialCompradoEm)}` : ''}
                  </p>
                  {card.materialReceiptPhoto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.materialReceiptPhoto}
                      alt="Cupom fiscal"
                      className="h-20 w-20 rounded-lg border border-border/70 object-cover"
                    />
                  )}
                </div>
              )}

              {card.needsExternalService && (
                <div className="space-y-1.5 rounded-xl border border-border/70 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Serviço Externo</p>
                  <p className="text-xs">Status: {SERVICO_LABEL[card.externalServiceStatus] ?? card.externalServiceStatus}</p>
                  {card.hiredSupplierNome && <p className="text-xs">Fornecedor: {card.hiredSupplierNome}</p>}
                  {card.scheduledDate && <p className="text-xs">Agendado pra {formatarData(card.scheduledDate)}</p>}
                  {card.quotes.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {card.quotes.length} cotação{card.quotes.length > 1 ? 'ões' : ''}
                    </p>
                  )}
                  {card.schedulingLogs.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <History className="h-3 w-3" />
                      Reagendado {card.schedulingLogs.length}x
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5 rounded-xl border border-border/70 p-3">
                <p className="text-xs font-medium text-muted-foreground">Execução</p>
                <p className="flex items-center gap-1.5 text-xs">
                  Status: {EXECUCAO_LABEL[card.executionStatus] ?? card.executionStatus}
                  {!card.previsto && (
                    <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                      Não previsto
                    </span>
                  )}
                </p>
                {card.blockForReservation && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    UH bloqueada pra reservas
                  </p>
                )}
                {card.executedDescription && (
                  <>
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--success)]">
                      <CheckCircle2 className="h-3 w-3" />
                      O que foi feito
                    </p>
                    <p className="text-xs">{card.executedDescription}</p>
                  </>
                )}
                {card.executedAt && (
                  <p className="text-xs text-muted-foreground">
                    Executado em {formatarHora(card.executedAt)}
                    {card.executedByName ? ` por ${card.executedByName}` : ''}
                  </p>
                )}
                {card.executedPhotos.length > 0 && (
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {card.executedPhotos.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt={`Evidência ${i + 1}`}
                        className="aspect-square rounded-lg border border-border/70 object-cover"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
