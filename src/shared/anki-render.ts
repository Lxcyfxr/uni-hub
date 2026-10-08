/**
 * Anki-kompatible Kartenvorlagen: Felder, Abschnitte, Lückentext, Medien.
 * Reine Funktionen ohne Abhängigkeiten – im Hauptprozess und in Tests nutzbar.
 */

export const FIELD_SEP = '\u001f'

export interface RenderNotetype {
  kind: 'standard' | 'cloze'
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
  css: string
}

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g
const HAS_MEDIA_RE = /<(img|audio|video|object|embed)\b|\[sound:/i

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|tr|h\d)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Kurztext für Listen/Suche: HTML weg, Lücken als Klartext. */
export function plainTitle(field: string): string {
  return stripHtml(field.replace(CLOZE_RE, (_m, _n, body: string) => body)).slice(0, 300)
}

export function clozeNumbers(fields: string[]): number[] {
  const found = new Set<number>()
  for (const f of fields) for (const m of f.matchAll(/\{\{c(\d+)::/g)) found.add(Number(m[1]))
  return [...found].sort((a, b) => a - b)
}

export function applyCloze(text: string, n: number, answer: boolean): string {
  return text.replace(CLOZE_RE, (_m, num: string, body: string, hint?: string) => {
    if (Number(num) !== n) return body
    return answer ? `<span class="cloze">${body}</span>` : `<span class="cloze">[${hint ?? '...'}]</span>`
  })
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Ein Feld zählt als gefüllt, wenn es Text oder Medien enthält. */
export function hasContent(value: string | undefined): boolean {
  if (!value) return false
  return stripHtml(value).length > 0 || HAS_MEDIA_RE.test(value)
}

interface Ctx {
  fields: Record<string, string>
  frontSide?: string
  clozeN?: number
  answer?: boolean
  tags?: string
  deck?: string
  cardName?: string
}

function expandSections(tpl: string, ctx: Ctx): string {
  let out = ''
  let i = 0
  const open = /\{\{([#^])\s*([^}]+?)\s*\}\}/g
  for (;;) {
    open.lastIndex = i
    const m = open.exec(tpl)
    if (!m) {
      out += tpl.slice(i)
      break
    }
    out += tpl.slice(i, m.index)
    const afterOpen = m.index + m[0].length
    const closeRe = new RegExp(`\\{\\{([#^/])\\s*${escapeRe(m[2])}\\s*\\}\\}`, 'g')
    closeRe.lastIndex = afterOpen
    let depth = 1
    let end = -1
    let endLen = 0
    for (let c = closeRe.exec(tpl); c; c = closeRe.exec(tpl)) {
      if (c[1] === '/') depth--
      else depth++
      if (depth === 0) {
        end = c.index
        endLen = c[0].length
        break
      }
    }
    if (end < 0) {
      // Unvollständiger Abschnitt: Marke verwerfen, Rest normal weiterverarbeiten
      i = afterOpen
      continue
    }
    const present = hasContent(ctx.fields[m[2]])
    if (m[1] === '#' ? present : !present) out += expandSections(tpl.slice(afterOpen, end), ctx)
    i = end + endLen
  }
  return out
}

function applyFilter(filter: string, value: string, ctx: Ctx): string {
  switch (filter) {
    case 'cloze':
      return applyCloze(value, ctx.clozeN ?? 1, !!ctx.answer)
    case 'text':
      return stripHtml(value)
    case 'hint':
      return hasContent(value) ? `<details class="hint"><summary>Hinweis</summary>${value}</details>` : ''
    case 'type':
    case 'tts':
      return ''
    default:
      return value
  }
}

export function renderTemplate(tpl: string, ctx: Ctx): string {
  return expandSections(tpl, ctx).replace(/\{\{([^{}#^/][^{}]*?)\}\}/g, (_m, spec: string) => {
    const parts = spec.split(':').map((s) => s.trim())
    const name = parts.pop() ?? ''
    let value: string
    switch (name) {
      case 'FrontSide':
        value = ctx.frontSide ?? ''
        break
      case 'Tags':
        value = ctx.tags ?? ''
        break
      case 'Deck':
        value = ctx.deck ?? ''
        break
      case 'Subdeck':
        value = (ctx.deck ?? '').split('::').pop() ?? ''
        break
      case 'Card':
        value = ctx.cardName ?? ''
        break
      default:
        value = ctx.fields[name] ?? ''
    }
    // Filter wirken von rechts (nah am Feld) nach links
    for (const f of parts.reverse()) value = applyFilter(f, value, ctx)
    return value
  })
}

export interface RenderedCard {
  question: string
  answer: string
}

export function renderCard(nt: RenderNotetype, values: string[], ord: number, extra: { tags?: string; deck?: string } = {}): RenderedCard {
  const fields: Record<string, string> = {}
  nt.fields.forEach((name, i) => (fields[name] = values[i] ?? ''))
  const tpl = nt.kind === 'cloze' ? nt.templates[0] : nt.templates[ord]
  if (!tpl) return { question: '', answer: '' }
  const base = { fields, tags: extra.tags, deck: extra.deck, cardName: tpl.name, clozeN: nt.kind === 'cloze' ? ord + 1 : undefined }
  const question = renderTemplate(tpl.qfmt, base)
  const answer = renderTemplate(tpl.afmt, { ...base, frontSide: question, answer: true })
  return { question, answer }
}

/** Welche Karten (ord) soll eine Notiz erzeugen? */
export function cardOrds(nt: RenderNotetype, values: string[]): number[] {
  if (nt.kind === 'cloze') return clozeNumbers(values).map((n) => n - 1)
  const ords: number[] = []
  nt.templates.forEach((_t, ord) => {
    if (hasContent(renderCard(nt, values, ord).question.replace(/<hr[^>]*>/gi, ''))) ords.push(ord)
  })
  return ords
}

/* ---------- Medien ---------- */

const isLocalRef = (u: string) => u.length > 0 && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//') && !u.startsWith('#')

function safeDecode(s: string): string {
  const plain = s.replace(/&amp;/g, '&')
  try {
    return decodeURIComponent(plain)
  } catch {
    return plain
  }
}

const MEDIA_ATTR_RE = /(<(?:img|audio|video|source|embed|object)\b[^>]*?\s(?:src|data)\s*=\s*)(["'])(.*?)\2/gi
const SOUND_RE = /\[sound:([^\]]+)\]/g
const CSS_URL_RE = /url\(\s*(["']?)([^)"']+)\1\s*\)/gi

export const mediaUrl = (ns: string, name: string) => `unihub-media://${ns}/${encodeURIComponent(name)}`

/** Lokale Dateiverweise in Kartentext auf das App-eigene Medien-Protokoll umbiegen. */
export function rewriteMedia(html: string, ns: string): string {
  return html
    .replace(MEDIA_ATTR_RE, (m, pre: string, q: string, u: string) => (isLocalRef(u) ? `${pre}${q}${mediaUrl(ns, safeDecode(u))}${q}` : m))
    .replace(SOUND_RE, (_m, f: string) => `<audio controls src="${mediaUrl(ns, f.trim())}"></audio>`)
}

export function rewriteCssMedia(css: string, ns: string): string {
  return css.replace(CSS_URL_RE, (m, q: string, u: string) => (isLocalRef(u) ? `url(${q}${mediaUrl(ns, safeDecode(u))}${q})` : m))
}

/** Dateinamen, die ein Feld referenziert (für den Export). */
export function mediaRefs(html: string): string[] {
  const names = new Set<string>()
  for (const m of html.matchAll(MEDIA_ATTR_RE)) if (isLocalRef(m[3])) names.add(safeDecode(m[3]))
  for (const m of html.matchAll(SOUND_RE)) names.add(m[1].trim())
  return [...names]
}

/** Dateiverweise in einem Feld umbenennen (Export bei Namenskollisionen). */
export function renameMediaRefs(html: string, map: Map<string, string>): string {
  const target = (n: string) => map.get(n) ?? n
  return html
    .replace(MEDIA_ATTR_RE, (m, pre: string, q: string, u: string) => (isLocalRef(u) ? `${pre}${q}${encodeURIComponent(target(safeDecode(u)))}${q}` : m))
    .replace(SOUND_RE, (_m, f: string) => `[sound:${target(f.trim())}]`)
}
