import dayjs from 'dayjs'
import type { Todo, TodoCategory, TodoStatus } from '@shared/ipc'
import { PALETTE as THEME_PALETTE, STATUS } from '../../theme/colors'

export const cleanErr = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export const PALETTE = THEME_PALETTE

/** Nächste noch wenig genutzte Farbe für eine neue Kategorie */
export function nextColor(categories: TodoCategory[]): string {
  const used = new Map<string, number>()
  categories.forEach((c) => used.set(c.color.toLowerCase(), (used.get(c.color.toLowerCase()) ?? 0) + 1))
  return [...PALETTE].sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0]
}

export const STATUS_META: Record<TodoStatus, { label: string; color: string }> = {
  open: { label: 'Offen', color: STATUS.open },
  doing: { label: 'In Bearbeitung', color: STATUS.doing },
  done: { label: 'Erledigt', color: STATUS.done }
}

export const STATUSES: TodoStatus[] = ['open', 'doing', 'done']

export const PRIORITY_LABEL = { 0: 'Niedrig', 1: 'Normal', 2: 'Hoch' } as const

/** Fälligkeit als kurzer Text mit Farbe (rot = überfällig) */
export function dueInfo(due: string | null, done: boolean): { text: string; color?: string } | null {
  if (!due) return null
  const d = dayjs(due).startOf('day')
  if (done) return { text: d.format('DD.MM.YYYY') }
  const diff = d.diff(dayjs().startOf('day'), 'day')
  if (diff < 0) return { text: `Überfällig · ${d.format('DD.MM.')}`, color: 'red' }
  if (diff === 0) return { text: 'Heute', color: 'orange' }
  if (diff === 1) return { text: 'Morgen', color: 'gold' }
  if (diff < 7) return { text: d.format('dddd'), color: 'blue' }
  return { text: d.format('DD.MM.YYYY') }
}

/** Wichtigstes zuerst: hohe Priorität, dann frühere Fälligkeit; Erledigte in Eingabereihenfolge. */
export function sortTodos(list: Todo[]): Todo[] {
  return [...list].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due < b.due ? -1 : 1
    return a.id - b.id
  })
}
