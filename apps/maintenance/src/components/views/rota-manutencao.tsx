'use client'

import { useMemo, useState } from 'react'
import { MapPin, Send, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Panel, StatCard } from '@/components/ui-kit'
import {
  diasDesde,
  formatarData,
  ultimaInspecaoPorUnidade,
} from '@/lib/domain'
import type { InspecaoComUnidade, UnitOption } from '@/lib/types'

const LIMITE_DIAS = 90

export function RotaManutencao({
  unidades,
  inspecoes,
}: {
  unidades: UnitOption[]
  inspecoes: InspecaoComUnidade[]
}) {
  const [telefone, setTelefone] = useState('')
  const ultimaMap = useMemo(
    () => ultimaInspecaoPorUnidade(inspecoes),
    [inspecoes],
  )

  const rota = useMemo(() => {
    return unidades
      .map((u) => {
        const ult = ultimaMap.get(u.id)
        const dias = ult ? diasDesde(ult.date) : null
        const prioridade =
          dias === null ? 999 : dias // nunca inspecionada = prioridade máxima
        return { unidade: u, ultima: ult, dias, prioridade }
      })
      .filter((r) => r.dias === null || r.dias >= LIMITE_DIAS)
      .sort((a, b) => b.prioridade - a.prioridade)
  }, [unidades, ultimaMap])

  const mensagem = useMemo(() => {
    const linhas = rota
      .slice(0, 15)
      .map((r, i) => {
        const quando =
          r.dias === null
            ? 'nunca inspecionada'
            : `há ${r.dias} dias`
        return `${i + 1}. Unidade ${r.unidade.name} — ${quando}`
      })
      .join('\n')
    return `*BNB Flex — Rota de Manutenção*\n\nUnidades prioritárias para inspeção:\n\n${linhas}`
  }, [rota])

  function enviarWhatsApp() {
    const tel = telefone.replace(/\D/g, '')
    const base = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
      : `https://wa.me/?text=${encodeURIComponent(mensagem)}`
    const url = base
    if (typeof window !== 'undefined') {
      if (window.self !== window.top) {
        window.open(url, '_blank')
      } else {
        window.location.href = url
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Na rota"
          value={rota.length}
          hint={`+ de ${LIMITE_DIAS} dias sem inspeção`}
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
          value={unidades.length - rota.length}
          hint="dentro do prazo"
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          title="Rota priorizada"
          description="Ordenada pelo tempo desde a última inspeção"
          className="lg:col-span-2"
        >
          {rota.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todas as unidades estão em dia. Ótimo trabalho.
            </p>
          ) : (
            <ol className="space-y-2">
              {rota.map((r, i) => (
                <li
                  key={r.unidade.id}
                  className="flex items-center gap-4 rounded-xl border border-border/70 px-4 py-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      Unidade {r.unidade.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.ultima
                        ? `Última: ${formatarData(r.ultima.date)}`
                        : 'Nunca inspecionada'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      r.dias === null
                        ? 'border-destructive/30 bg-destructive/12 text-destructive'
                        : 'border-[var(--warning)]/30 bg-[var(--warning)]/12 text-[var(--warning)]'
                    }
                  >
                    {r.dias === null ? 'Urgente' : `${r.dias} dias`}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          title="Enviar por WhatsApp"
          description="Compartilhe a rota com a equipe"
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tel">Telefone (opcional)</Label>
              <Input
                id="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="+55 11 99999-9999"
                className="h-10 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para escolher o contato no WhatsApp.
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/50 p-3">
              <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {mensagem.length > 280
                  ? `${mensagem.slice(0, 280)}...`
                  : mensagem}
              </p>
            </div>

            <Button
              onClick={enviarWhatsApp}
              disabled={rota.length === 0}
              className="h-11 w-full rounded-xl"
            >
              <Send className="h-4 w-4" />
              Enviar rota
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
