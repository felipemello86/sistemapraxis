'use client'

import { useMemo, useState } from 'react'
import {
  Search,
  ClipboardCheck,
  MessageCircle,
  Wrench,
  ClipboardList,
  CheckCircle2,
  CalendarClock,
  Pencil,
  Siren,
  History,
  Lock,
  LockOpen,
  Zap,
  ShoppingCart,
  FileText,
  CalendarCheck,
  PencilLine,
  Image,
  MapPin,
  ClipboardPenLine,
  ListChecks,
  Settings,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Panel, StatCard } from '@/components/ui-kit'
import type { LogEvento } from '@/lib/types'

// Tela "Log do Sistema" — pedido explícito do Felipe, motivado pela
// investigação do card órfão da 406-V ("tem alguma coisa estranha [...]
// Precisamos criar uma tela de log do sistema. Vc consegue criar essa tela
// já incluindo os logs antigos?"). Igual à tela equivalente de Housekeeping
// (apps/housekeeping/src/app/logs), NÃO existe uma tabela de auditoria
// dedicada — os eventos são reconstruídos em page.tsx a partir de dados que
// já têm timestamp/autor no banco (Inspeções, cards de Correção, edições de
// Informações do Item). Isso já cobre o histórico completo desde sempre
// (não é preciso "esperar" novos eventos pra aparecer aqui).
//
// Cobertura ampliada (pedido explícito do Felipe: "TODAS as ações
// relevantes", não só um subconjunto) — os 12 tipos abaixo, a partir de
// "programacao_fechada", vêm de AiEvent (ver emitEvent em @praxis/core),
// instrumentado direto nas Server Actions de apps/maintenance/src/app/
// actions/correcao.ts e data.ts. A extinta "limitação conhecida" de
// exclusão de item do catálogo nunca aparecer aqui não existe mais —
// updateItemAction/deleteItemAction (e createItemAction) já emitem
// "item_catalogo_editado" desde essa cobertura.

const TIPO_INFO: Record<
  LogEvento['tipo'],
  { label: string; icon: typeof ClipboardCheck; className: string }
> = {
  inspecao: { label: 'Inspeção completa', icon: ClipboardCheck, className: 'text-[var(--success)] bg-[var(--success)]/10' },
  relato_avulso: { label: 'Relato avulso', icon: MessageCircle, className: 'text-amber-600 bg-amber-100' },
  correcao_criada: { label: 'Não conformidade registrada', icon: Wrench, className: 'text-[var(--destructive)] bg-[var(--destructive)]/10' },
  correcao_triada: { label: 'Triagem', icon: ClipboardList, className: 'text-blue-600 bg-blue-100' },
  correcao_executada: { label: 'Reparo concluído', icon: CheckCircle2, className: 'text-[var(--success)] bg-[var(--success)]/10' },
  reagendamento: { label: 'Reagendamento', icon: CalendarClock, className: 'text-purple-600 bg-purple-100' },
  info_editada: { label: 'Informações do item', icon: Pencil, className: 'text-muted-foreground bg-accent' },
  programacao_fechada: { label: 'Programação fechada', icon: Lock, className: 'text-slate-700 bg-slate-200' },
  programacao_reaberta: { label: 'Programação reaberta', icon: LockOpen, className: 'text-amber-700 bg-amber-100' },
  card_urgente_adicionado: { label: 'Card urgente adicionado', icon: Zap, className: 'text-[var(--destructive)] bg-[var(--destructive)]/10' },
  material_comprado: { label: 'Material comprado', icon: ShoppingCart, className: 'text-blue-600 bg-blue-100' },
  cotacao_registrada: { label: 'Cotação registrada', icon: FileText, className: 'text-blue-600 bg-blue-100' },
  servico_agendado: { label: 'Serviço agendado', icon: CalendarCheck, className: 'text-purple-600 bg-purple-100' },
  spot_editado: { label: 'Spot editado', icon: PencilLine, className: 'text-muted-foreground bg-accent' },
  uh3d_imagem: { label: 'Imagem UH 3D', icon: Image, className: 'text-teal-600 bg-teal-100' },
  uh3d_spot: { label: 'Spot UH 3D', icon: MapPin, className: 'text-teal-600 bg-teal-100' },
  item_catalogo_editado: { label: 'Item de catálogo editado', icon: ClipboardPenLine, className: 'text-muted-foreground bg-accent' },
  atribuicao_editada: { label: 'Atribuição editada', icon: ListChecks, className: 'text-blue-600 bg-blue-100' },
  config_editada: { label: 'Configuração alterada', icon: Settings, className: 'text-muted-foreground bg-accent' },
}

const TIPO_FILTRO_OPCOES: { value: 'todos' | LogEvento['tipo']; label: string }[] = [
  { value: 'todos', label: 'Todos os eventos' },
  { value: 'inspecao', label: 'Inspeção completa' },
  { value: 'relato_avulso', label: 'Relato avulso' },
  { value: 'correcao_criada', label: 'Não conformidade registrada' },
  { value: 'correcao_triada', label: 'Triagem' },
  { value: 'correcao_executada', label: 'Reparo concluído' },
  { value: 'reagendamento', label: 'Reagendamento' },
  { value: 'info_editada', label: 'Informações do item' },
  { value: 'programacao_fechada', label: 'Programação fechada' },
  { value: 'programacao_reaberta', label: 'Programação reaberta' },
  { value: 'card_urgente_adicionado', label: 'Card urgente adicionado' },
  { value: 'material_comprado', label: 'Material comprado' },
  { value: 'cotacao_registrada', label: 'Cotação registrada' },
  { value: 'servico_agendado', label: 'Serviço agendado' },
  { value: 'spot_editado', label: 'Spot editado' },
  { value: 'uh3d_imagem', label: 'Imagem UH 3D' },
  { value: 'uh3d_spot', label: 'Spot UH 3D' },
  { value: 'item_catalogo_editado', label: 'Item de catálogo editado' },
  { value: 'atribuicao_editada', label: 'Atribuição editada' },
  { value: 'config_editada', label: 'Configuração alterada' },
]

// Sempre fuso America/Sao_Paulo, explícito — mesmo padrão já usado em
// page.tsx (agrupamento de commitments por dia) e em InspecaoComUnidade.date
// em outras telas. Sem isso, agrupar por dia batendo em `timestamp.slice(0,10)`
// pega a data em UTC: um evento das 21h-23h59 (horário de Brasília, UTC-3)
// vira o dia seguinte em UTC e aparece agrupado no dia errado.
function diaSP(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function formatarDataCompleta(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

function formatarHora(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso))
}

const PAGINA = 60

export function Logs({ eventos }: { eventos: LogEvento[] }) {
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | LogEvento['tipo']>('todos')
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(PAGINA)

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return eventos.filter((e) => {
      if (tipoFiltro !== 'todos' && e.tipo !== tipoFiltro) return false
      if (q && !e.uhNumero.toLowerCase().includes(q)) return false
      return true
    })
  }, [eventos, tipoFiltro, busca])

  const visiveis = filtrados.slice(0, limite)

  const grupos = useMemo(() => {
    const m = new Map<string, LogEvento[]>()
    for (const e of visiveis) {
      const dia = diaSP(e.timestamp)
      const lista = m.get(dia) ?? []
      lista.push(e)
      m.set(dia, lista)
    }
    return Array.from(m.entries())
  }, [visiveis])

  const contagemPorTipo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of eventos) m[e.tipo] = (m[e.tipo] ?? 0) + 1
    return m
  }, [eventos])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:max-w-2xl">
        <StatCard size="compact" label="Eventos no total" value={eventos.length} icon={<History className="h-4 w-4" />} />
        <StatCard size="compact" label="Inspeções" value={contagemPorTipo.inspecao ?? 0} tone="success" />
        <StatCard size="compact" label="Não conformidades" value={contagemPorTipo.correcao_criada ?? 0} tone="danger" />
        <StatCard size="compact" label="Reparos concluídos" value={contagemPorTipo.correcao_executada ?? 0} tone="success" />
      </div>

      <Panel
        title="Log do Sistema"
        description="Histórico completo — Inspeções, não conformidades, triagens, reparos, reagendamentos, programação do dia, compras, cotações, agendamentos, UH 3D, catálogo, atribuições e configurações. Reconstruído a partir dos próprios registros do sistema, sem apagar nada."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tipoFiltro} onValueChange={(v) => { setTipoFiltro((v as typeof tipoFiltro) ?? 'todos'); setLimite(PAGINA) }}>
              <SelectTrigger className="h-10 w-56 rounded-xl">
                <SelectValue>
                  {(v: string | null) => TIPO_FILTRO_OPCOES.find((o) => o.value === v)?.label ?? 'Todos os eventos'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIPO_FILTRO_OPCOES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-full max-w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setLimite(PAGINA) }}
                placeholder="Buscar UH"
                className="h-10 rounded-xl pl-9"
              />
            </div>
          </div>
        }
      >
        {filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhum evento encontrado.</p>
        ) : (
          <div className="space-y-6">
            {grupos.map(([dia, eventosDoDia]) => (
              <div key={dia}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatarDataCompleta(eventosDoDia[0].timestamp)}
                </p>
                <ul className="space-y-2 border-l border-border/70 pl-4">
                  {eventosDoDia.map((e) => {
                    const info = TIPO_INFO[e.tipo]
                    const Icon = info.icon
                    return (
                      <li key={e.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-border" />
                        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3">
                          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${info.className}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-xs">{info.label}</Badge>
                              <span className="text-sm font-semibold">UH {e.uhNumero}</span>
                              {e.itemNome && <span className="text-sm text-muted-foreground">— {e.itemNome}</span>}
                              {e.urgente && (
                                <span title="Não conformidade impeditiva ao uso (urgente)">
                                  <Siren className="h-3.5 w-3.5 text-[var(--destructive)]" />
                                </span>
                              )}
                            </div>
                            {e.detalhe && <p className="mt-1 text-sm text-muted-foreground">{e.detalhe}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatarHora(e.timestamp)}
                              {e.atorNome && <> · {e.atorNome}</>}
                            </p>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}

            {filtrados.length > visiveis.length && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => setLimite((v) => v + PAGINA)}>
                  Carregar mais ({filtrados.length - visiveis.length} restantes)
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}
