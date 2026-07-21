'use client'

import { useMemo, useState } from 'react'
import { MapPin, Clock, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Panel, StatCard } from '@/components/ui-kit'
import { toast } from 'sonner'
import { diasDesde, formatarData, itensParaUnidade, ultimaInspecaoPorUnidade } from '@/lib/domain'
import { InspecaoWizard } from '@/components/inspecao-wizard'
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  InspecaoComUnidade,
  UnitOption,
} from '@/lib/types'

// Reconstrução do fluxo real da "Rota de Manutenção" recuperado do
// protótipo standalone "Bnb Manutenção" (PageManutencao no
// sistema-manutencao.html) — inspeção gamificada item a item, com foto na
// não conformidade. A versão anterior desta tela (mesma rota/nome) era só
// compartilhamento de lista via WhatsApp; foi substituída por completo —
// WhatsApp não entra na v2 (visão de comunicação futura é push
// notification). A execução item a item em si (steps 2 e 3) mora em
// components/inspecao-wizard.tsx, reaproveitada também pelo "Nova inspeção"
// de Controle de Inspeções (mesma expectativa de UX gamificada nas duas
// entradas — ver comentário em controle-inspecoes.tsx).

export function RotaManutencao({
  unidades,
  itens,
  inspecoes,
  atribuicoes,
  maxDias,
}: {
  unidades: UnitOption[]
  itens: ChecklistItem[]
  inspecoes: InspecaoComUnidade[]
  atribuicoes: AtribuicoesPorUnidade
  maxDias: number
}) {
  const [unidadeAtual, setUnidadeAtual] = useState<UnitOption | null>(null)

  const ultimaMap = useMemo(() => ultimaInspecaoPorUnidade(inspecoes), [inspecoes])

  const rota = useMemo(() => {
    return unidades
      .map((u) => {
        const ult = ultimaMap.get(u.id)
        const dias = ult ? diasDesde(ult.date) : null
        const prioridade = dias === null ? 999999 : dias
        return { unidade: u, ultima: ult, dias, prioridade }
      })
      .sort((a, b) => b.prioridade - a.prioridade)
  }, [unidades, ultimaMap])

  const pendentes = rota.filter((r) => r.dias === null || r.dias >= maxDias)

  const itensDaUnidade = useMemo(
    () => (unidadeAtual ? itensParaUnidade(unidadeAtual.id, itens, atribuicoes) : []),
    [unidadeAtual, itens, atribuicoes],
  )

  function iniciarInspecao(unidade: UnitOption) {
    const itensFiltrados = itensParaUnidade(unidade.id, itens, atribuicoes)
    if (itensFiltrados.length === 0) {
      toast.error('Essa unidade não tem itens de checklist atribuídos.')
      return
    }
    setUnidadeAtual(unidade)
  }

  function cancelarInspecao() {
    setUnidadeAtual(null)
  }

  if (unidadeAtual) {
    return (
      <InspecaoWizard
        unidade={unidadeAtual}
        itens={itensDaUnidade}
        onCancel={cancelarInspecao}
        onSaved={cancelarInspecao}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pendentes"
          value={pendentes.length}
          hint={`+ de ${maxDias} dias sem inspeção`}
          tone="warning"
          icon={<MapPin className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Nunca inspecionadas"
          value={rota.filter((r) => r.dias === null).length}
          hint="prioridade máxima"
          tone="danger"
          icon={<Clock className="h-[18px] w-[18px]" />}
        />
        <StatCard
          label="Unidades em dia"
          value={unidades.length - pendentes.length}
          hint="dentro do prazo"
          tone="success"
        />
      </div>

      <Panel
        title="Selecionar unidade"
        description="Toque numa unidade para iniciar a inspeção item a item"
      >
        {rota.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma unidade cadastrada.
          </p>
        ) : (
          <ol className="space-y-2">
            {rota.map((r) => (
              <li key={r.unidade.id}>
                <button
                  onClick={() => iniciarInspecao(r.unidade)}
                  className="flex w-full items-center gap-4 rounded-xl border border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      Unidade {r.unidade.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.ultima ? `Última: ${formatarData(r.ultima.date)}` : 'Nunca inspecionada'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      r.dias === null
                        ? 'border-destructive/30 bg-destructive/12 text-destructive'
                        : r.dias >= maxDias
                          ? 'border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]'
                          : 'border-[var(--success)]/30 bg-[var(--success)]/12 text-[var(--success)]'
                    }
                  >
                    {r.dias === null ? 'Urgente' : r.dias >= maxDias ? `${r.dias} dias` : 'Em dia'}
                  </Badge>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
