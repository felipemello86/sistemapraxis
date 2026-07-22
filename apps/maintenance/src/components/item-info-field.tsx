'use client'

import { useEffect, useState, useTransition } from 'react'
import { ChevronDown, History, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatarData } from '@/lib/domain'
import { salvarInfoItemAction } from '@/app/actions/data'
import { unwrapSafeAction } from '@/lib/safeAction'
import type { ItemInfoLogEntry } from '@/lib/types'

// Campo reaproveitado nos 3 lugares onde um IV (item de verificação) pode
// ser editado: UH 3D (spot), Inspeções (histórico do item) e Rota de
// Correção (etapa de descrição). Independente do status de conformidade —
// existe mesmo pra itens nunca inspecionados, por isso não fica dentro do
// fluxo de "editar status" de nenhuma dessas telas, com seu próprio botão
// de salvar. Ver comentário em MaintenanceItemInfo no schema Prisma.
export function ItemInfoField({
  uhId,
  checklistItemId,
  initialInfo,
  podeOperar,
  logs = [],
  className,
}: {
  uhId: string
  checklistItemId: string
  initialInfo: string | null
  podeOperar: boolean
  logs?: ItemInfoLogEntry[]
  className?: string
}) {
  const [valor, setValor] = useState(initialInfo ?? '')
  const [sujo, setSujo] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const [salvando, startTransition] = useTransition()

  useEffect(() => {
    setValor(initialInfo ?? '')
    setSujo(false)
  }, [initialInfo, uhId, checklistItemId])

  function salvar() {
    startTransition(async () => {
      try {
        unwrapSafeAction(await salvarInfoItemAction({ uhId, checklistItemId, info: valor }))
        toast.success('Informações do item salvas.')
        setSujo(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar informações do item.')
      }
    })
  }

  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Informações do item
      </label>
      <Textarea
        value={valor}
        onChange={(e) => {
          setValor(e.target.value)
          setSujo(e.target.value !== (initialInfo ?? ''))
        }}
        placeholder="Ex.: potência, fabricante, número de série..."
        className="min-h-16 rounded-xl"
        disabled={!podeOperar || salvando}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {logs.length > 0 ? (
          <button
            type="button"
            onClick={() => setHistoricoAberto((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <History className="h-3 w-3" />
            Histórico de alterações ({logs.length})
            <ChevronDown className={cn('h-3 w-3 transition-transform', historicoAberto && 'rotate-180')} />
          </button>
        ) : (
          <span />
        )}
        {podeOperar && sujo && (
          <Button size="sm" onClick={salvar} disabled={salvando} className="rounded-lg">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        )}
      </div>
      {historicoAberto && logs.length > 0 && (
        <ul className="mt-2 space-y-1.5 rounded-xl border border-border/70 bg-muted/30 p-2.5">
          {logs.map((l) => (
            <li key={l.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{l.authorName ?? 'Alguém'}</span>{' '}
              {l.previousInfo ? (
                <>
                  alterou de <span className="italic">&ldquo;{l.previousInfo}&rdquo;</span> para{' '}
                </>
              ) : (
                'preencheu com '
              )}
              {l.newInfo ? <span className="italic">&ldquo;{l.newInfo}&rdquo;</span> : <span className="italic">vazio</span>}
              {' — '}
              {formatarData(l.createdAt)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
