import type { InspecaoComUnidade } from '@/lib/types'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

/**
 * Cor determinística por categoria. As categorias são texto livre definido
 * pelo cliente (ChecklistItem.category), então não há uma lista fixa —
 * mapeamos por hash para manter a mesma cor sempre que a categoria se repete.
 */
export function corCategoria(categoria: string) {
  let hash = 0
  for (let i = 0; i < categoria.length; i++) {
    hash = (hash * 31 + categoria.charCodeAt(i)) | 0
  }
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length]
}

export function formatarData(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function diasDesde(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
}

/** Conta itens conformes/não conformes de uma inspeção. */
export function contarConformidade(insp: InspecaoComUnidade) {
  const total = insp.items.length
  const ok = insp.items.filter((i) => i.status === 'CONFORME').length
  return { ok, total, problema: total - ok }
}

/** Uma inspeção "tem pendências" se algum item foi marcado como não conforme. */
export function temPendencia(insp: InspecaoComUnidade) {
  return insp.items.some((i) => i.status === 'NAO_CONFORME')
}

export function labelResultado(insp: InspecaoComUnidade) {
  return temPendencia(insp) ? 'Com pendências' : 'Conforme'
}

/** Última inspeção por unidade (chave = Unit.id, string). */
export function ultimaInspecaoPorUnidade(inspecoes: InspecaoComUnidade[]) {
  const map = new Map<string, InspecaoComUnidade>()
  for (const insp of inspecoes) {
    const atual = map.get(insp.unitId)
    if (!atual || new Date(insp.date) > new Date(atual.date)) {
      map.set(insp.unitId, insp)
    }
  }
  return map
}
