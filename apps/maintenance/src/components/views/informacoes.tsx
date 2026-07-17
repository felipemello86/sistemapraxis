'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui-kit'
import {
  diasDesde,
  formatarData,
  labelResultado,
  temPendencia,
  ultimaInspecaoPorUnidade,
} from '@/lib/domain'
import type { InspecaoComUnidade, UnitOption } from '@/lib/types'

export function Informacoes({
  unidades,
  inspecoes,
}: {
  unidades: UnitOption[]
  inspecoes: InspecaoComUnidade[]
}) {
  const [busca, setBusca] = useState('')
  const ultimaMap = useMemo(
    () => ultimaInspecaoPorUnidade(inspecoes),
    [inspecoes],
  )

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return unidades
      .filter((u) => !q || u.name.toLowerCase().includes(q))
      .map((u) => {
        const ult = ultimaMap.get(u.id)
        return {
          unidade: u,
          ultima: ult,
          dias: ult ? diasDesde(ult.date) : null,
        }
      })
  }, [unidades, busca, ultimaMap])

  return (
    <div className="space-y-6">
      <Panel
        title="Informações das unidades"
        description="Situação detalhada de cada flat"
        action={
          <div className="relative w-full max-w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar unidade"
              className="h-10 rounded-xl pl-9"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Unidade</th>
                <th className="pb-3 pr-4 font-medium">Última inspeção</th>
                <th className="pb-3 pr-4 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {linhas.map(({ unidade, ultima, dias }) => (
                <tr key={unidade.id} className="hover:bg-accent/40">
                  <td className="py-3 pr-4 font-medium">{unidade.name}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {ultima ? (
                      <span>
                        {formatarData(ultima.date)}{' '}
                        <span className="text-xs">({dias} dias)</span>
                      </span>
                    ) : (
                      'Nunca inspecionada'
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {!ultima ? (
                      <Badge
                        variant="outline"
                        className="border-border bg-muted text-muted-foreground"
                      >
                        Pendente
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          temPendencia(ultima)
                            ? 'border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]'
                            : 'border-[var(--success)]/30 bg-[var(--success)]/12 text-[var(--success)]'
                        }
                      >
                        {labelResultado(ultima)}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhas.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma unidade encontrada.
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}
