'use client'

import { useMemo, useState } from 'react'
import { HardHat, ListChecks, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KanbanAquisicao } from '@/components/views/kanban-aquisicao'
import { KanbanServicos } from '@/components/views/kanban-servicos'
import { KanbanExecucao } from '@/components/views/kanban-execucao'
import { DialogDetalheCard } from '@/components/views/dialog-detalhe-card'
import type { CorrectionCardView, CorrectionSummary, DailyCommitmentView, SupplierView } from '@/lib/types'

// "Correção" — substitui por completo a antiga Rota de Correção de passo
// único (era: escolher UH com pendência → escolher item → descrever reparo).
// Agora são 3 kanbans (abas), cada um cuidando de uma frente diferente da
// mesma não conformidade — um card PODE aparecer em mais de uma aba ao
// mesmo tempo (pedido explícito: card com material E serviço externo
// aparece em Aquisição E em Serviços Externos, cada frente avançando
// independente; só entra no Kanban de Execução quem não precisa de serviço
// externo). Ver comentário completo em cada arquivo de kanban.

type Aba = 'execucao' | 'aquisicao' | 'servicos'

export function Correcao({
  podeOperar,
  cards,
  suppliers,
  uhIdsSelecionadasHoje,
  uhIdsComReservaHoje,
  uhIdsLiberadasHoje,
  commitments,
  hojeSP,
  correcoesRecentes,
}: {
  podeOperar: boolean
  cards: CorrectionCardView[]
  suppliers: SupplierView[]
  uhIdsSelecionadasHoje: string[]
  uhIdsComReservaHoje: string[]
  uhIdsLiberadasHoje: string[]
  commitments: DailyCommitmentView[]
  hojeSP: string
  correcoesRecentes: CorrectionSummary[]
}) {
  const [aba, setAba] = useState<Aba>('execucao')
  // Popup de detalhamento da NC — compartilhado pelos 3 kanbans (pedido
  // explícito: clicar em qualquer card abre o detalhe completo). Ver
  // dialog-detalhe-card.tsx.
  const [cardDetalhe, setCardDetalhe] = useState<CorrectionCardView | null>(null)

  // Cards sem triagem (needsMaterial/needsExternalService null) — nascem
  // assim quando o módulo Governança registra a necessidade de manutenção
  // (camareira, governanta, flag da Seleção e Liberação — não cabe a essas
  // pessoas decidir isso, pedido explícito). Vivem na coluna "A Processar"
  // do Kanban Execução até o perfil Manutenção classificar; só depois
  // entram nos filtros normais abaixo.
  const cardsAProcessar = useMemo(
    () => cards.filter((c) => c.needsMaterial === null || c.needsExternalService === null),
    [cards],
  )
  const cardsAquisicao = useMemo(() => cards.filter((c) => c.needsMaterial === true), [cards])
  const cardsServicos = useMemo(() => cards.filter((c) => c.needsExternalService === true), [cards])
  const cardsExecucao = useMemo(
    () =>
      cards.filter(
        (c) =>
          c.needsMaterial !== null &&
          c.needsExternalService !== null &&
          !c.needsExternalService &&
          (!c.needsMaterial || c.materialStatus === 'COMPRADO'),
      ),
    [cards],
  )

  const commitmentHoje = useMemo(() => commitments.find((cm) => cm.data === hojeSP) ?? null, [commitments, hojeSP])

  const abas: { id: Aba; label: string; icon: typeof Package; total: number }[] = [
    { id: 'execucao', label: 'Execução', icon: ListChecks, total: cardsExecucao.length + cardsAProcessar.length },
    { id: 'aquisicao', label: 'Aquisição', icon: Package, total: cardsAquisicao.length },
    { id: 'servicos', label: 'Serviços Externos', icon: HardHat, total: cardsServicos.length },
  ]

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto border-b border-border/70 pb-px">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              aba === a.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <a.icon className="h-4 w-4" />
            {a.label}
            {a.total > 0 && (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold',
                  aba === a.id ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {a.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {aba === 'aquisicao' && (
        <KanbanAquisicao
          podeOperar={podeOperar}
          cards={cardsAquisicao}
          uhIdsComReservaHoje={uhIdsComReservaHoje}
          uhIdsLiberadasHoje={uhIdsLiberadasHoje}
          onVerDetalhe={setCardDetalhe}
        />
      )}
      {aba === 'servicos' && (
        <KanbanServicos
          podeOperar={podeOperar}
          cards={cardsServicos}
          suppliers={suppliers}
          uhIdsComReservaHoje={uhIdsComReservaHoje}
          uhIdsLiberadasHoje={uhIdsLiberadasHoje}
          onVerDetalhe={setCardDetalhe}
        />
      )}
      {aba === 'execucao' && (
        <KanbanExecucao
          podeOperar={podeOperar}
          cards={cardsExecucao}
          cardsAProcessar={cardsAProcessar}
          uhIdsSelecionadasHoje={uhIdsSelecionadasHoje}
          uhIdsComReservaHoje={uhIdsComReservaHoje}
          uhIdsLiberadasHoje={uhIdsLiberadasHoje}
          commitmentHoje={commitmentHoje}
          onVerDetalhe={setCardDetalhe}
        />
      )}

      <DialogDetalheCard
        card={cardDetalhe}
        temReserva={cardDetalhe ? uhIdsComReservaHoje.includes(cardDetalhe.uhId) : false}
        liberada={cardDetalhe ? uhIdsLiberadasHoje.includes(cardDetalhe.uhId) : false}
        onClose={() => setCardDetalhe(null)}
      />

      {correcoesRecentes.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Correções recentes</p>
          <div className="space-y-2">
            {correcoesRecentes.slice(0, 5).map((c) => (
              <div key={c.id} className="rounded-xl border border-border/70 px-3 py-2 text-sm">
                <span className="font-medium">Unidade {c.uhName}</span>
                {c.checklistItemName ? ` — ${c.checklistItemName}` : ''}
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
