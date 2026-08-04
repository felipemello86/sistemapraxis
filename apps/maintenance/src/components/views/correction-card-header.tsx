'use client'

import { useState } from 'react'
import { BedDouble, Ban, Siren, Unlock, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { corCategoria } from '@/lib/domain'
import { retirarUrgenciaAction } from '@/app/actions/correcao'
import { unwrapSafeAction } from '@/lib/safeAction'
import { toast } from 'sonner'
import type { CorrectionCardView } from '@/lib/types'

// Cabeçalho compartilhado pelos cards dos 3 kanbans de Correção (Aquisição,
// Serviços Externos, Execução) — antes era duplicado (CardResumo em
// kanban-aquisicao.tsx, CardHeader em kanban-servicos.tsx, inline 5x em
// kanban-execucao.tsx). Consolidado aqui porque os dois pedidos do Felipe
// (badge de Reserva + popup de detalhamento ao clicar no card) precisam
// entrar em TODOS esses lugares — melhor escrever uma vez.
//
// onVerDetalhe (se passado) torna essa área clicável — abre o popup de
// detalhamento da NC (ver dialog-detalhe-card.tsx). Preventa/para a
// propagação do evento porque em alguns kanbans (Execução > "A Fazer" antes
// do fechamento) este cabeçalho fica dentro de um <label> que envolve um
// checkbox — sem isso, clicar no cabeçalho também marcaria/desmarcaria a
// seleção do card.
export function CorrectionCardHeader({
  card,
  temReserva,
  liberada,
  onVerDetalhe,
  extraBadge,
  children,
  podeOperar,
}: {
  card: CorrectionCardView
  temReserva?: boolean
  // UH já liberada pra limpeza hoje (Seleção e Liberação) — diferente de
  // "selecionada pra hoje" (ver uhIdsSelecionadasHoje em kanban-execucao.tsx):
  // uma UH pode estar selecionada e ainda não liberada. Pedido explícito do
  // Felipe pra dar essa visibilidade também nos cards de Correção.
  liberada?: boolean
  onVerDetalhe?: (card: CorrectionCardView) => void
  // Badge extra específico de um kanban (ex.: "Imprevisto" só existe na
  // Execução) — evita ter que reimplementar a linha inteira de badges só
  // pra acrescentar um a mais.
  extraBadge?: React.ReactNode
  children?: React.ReactNode
  // Controla o botão "Retirar Urgência" (pedido do Felipe, 01/08/2026) —
  // sem essa prop o botão fica escondido por segurança (mesmo padrão de
  // "esconder em vez de mostrar desabilitado" já usado nos outros botões
  // de ação desse componente).
  podeOperar?: boolean
}) {
  const [retirandoUrgencia, setRetirandoUrgencia] = useState(false)

  async function retirarUrgencia(e: React.MouseEvent) {
    // Esse botão fica dentro da área clicável do card (onVerDetalhe) —
    // sem isso o clique também abriria o popup de detalhe.
    e.preventDefault()
    e.stopPropagation()
    setRetirandoUrgencia(true)
    try {
      unwrapSafeAction(await retirarUrgenciaAction({ cardId: card.id }))
      toast.success('Urgência retirada do card.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao retirar a urgência.')
    } finally {
      setRetirandoUrgencia(false)
    }
  }

  return (
    <div
      className={
        onVerDetalhe
          ? '-m-1 space-y-1.5 rounded-lg p-1 transition-colors hover:bg-accent/50 cursor-pointer'
          : 'space-y-1.5'
      }
      onClick={
        onVerDetalhe
          ? (e) => {
              e.preventDefault()
              e.stopPropagation()
              onVerDetalhe(card)
            }
          : undefined
      }
      role={onVerDetalhe ? 'button' : undefined}
      tabIndex={onVerDetalhe ? 0 : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          <span className={card.canceladoPorLiberacao ? 'line-through decoration-2' : undefined}>
            Unidade {card.uhName}
          </span>
        </p>
        {card.checklistItemCategory && (
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{ borderColor: corCategoria(card.checklistItemCategory), color: corCategoria(card.checklistItemCategory) }}
          >
            {card.checklistItemCategory}
          </Badge>
        )}
      </div>
      {/* Linha própria pras flags (badges) — antes dividiam espaço com o
          título numa linha só e cortavam/eram cortadas em cards com várias
          flags juntas (pedido do Felipe, 01/08/2026: "as flags não estão
          cabendo no card"). flex-wrap deixa quebrar em quantas linhas
          precisar, em vez de estourar a largura do card. */}
      {(card.urgente || temReserva || liberada || card.canceladoPorLiberacao || extraBadge) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {card.urgente && (
            <span className="flex items-center gap-0.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
              <Siren className="h-2.5 w-2.5" />
              Urgente
            </span>
          )}
          {/* Pedido explícito do Felipe (01/08/2026): "para os cards
              classificados como URGÊNCIA, deve haver um botão de Retirar
              Urgência, para os casos em que o usuário entenda que não se
              trata mais de Urgência." Não desbloqueia uma UH já bloqueada
              por decisão do Atendimento — só cancela pedido pendente (ver
              retirarUrgenciaImpl). */}
          {card.urgente && podeOperar && (
            <button
              type="button"
              onClick={retirarUrgencia}
              disabled={retirandoUrgencia}
              title="Retirar a classificação de urgente deste card"
              className="flex items-center gap-0.5 rounded-full border border-destructive/30 px-1.5 py-0.5 text-[10px] font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <X className="h-2.5 w-2.5" />
              {retirandoUrgencia ? 'Retirando...' : 'Retirar urgência'}
            </button>
          )}
          {temReserva && (
            <span className="flex items-center gap-0.5 rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
              <BedDouble className="h-2.5 w-2.5" />
              Reserva
            </span>
          )}
          {liberada && (
            <span className="flex items-center gap-0.5 rounded-full bg-[var(--success)]/10 border border-[var(--success)]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--success)]">
              <Unlock className="h-2.5 w-2.5" />
              Liberada
            </span>
          )}
          {/* UH saiu da lista do dia em Housekeeping (ver
              cancelarCardsPorExclusaoDeUh, packages/core) — card cancelado,
              mas continua visível e executável (pedido explícito do Felipe,
              01/08/2026). Some no lugar do badge "Imprevisto" (extraBadge
              em kanban-execucao.tsx), já que este caso é mais específico. */}
          {card.canceladoPorLiberacao && (
            <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <Ban className="h-2.5 w-2.5" />
              UH removida do dia
            </span>
          )}
          {extraBadge}
        </div>
      )}
      <p className={`text-sm text-muted-foreground ${card.canceladoPorLiberacao ? 'line-through' : ''}`}>
        {card.checklistItemName ?? 'Item removido do catálogo'}
      </p>
      {card.comment && <p className="text-xs text-muted-foreground">{card.comment}</p>}
      {children}
    </div>
  )
}
