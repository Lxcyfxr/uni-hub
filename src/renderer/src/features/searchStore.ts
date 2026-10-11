import { create } from 'zustand'
import type { SearchKind } from '@shared/ipc'

/** Läuft die Suchleiste? Native Ansichten (Dienst-Tabs, Dokument-Viewer) liegen über dem DOM und müssen dann weichen. */
export const useOverlay = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open })
}))

export interface SearchTarget {
  kind: SearchKind
  id: number
  /** Nur Termine: Tag 'YYYY-MM-DD' */
  date?: string
}

/** Treffer, den der geöffnete Bereich beim Laden anspringen soll (Dokument auswählen, Termin zeigen). */
export const useSearchTarget = create<{ target: SearchTarget | null; set: (t: SearchTarget | null) => void }>((set) => ({
  target: null,
  set: (target) => set({ target })
}))
