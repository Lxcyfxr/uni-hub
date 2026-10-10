import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0', isPackaged: true }, shell: {} }))
vi.mock('../src/main/links', () => ({ openExternalSafe: () => true }))

import { buildIssueUrl } from '../src/main/report'

describe('buildIssueUrl', () => {
  it('baut eine GitHub-Adresse mit kodiertem Titel und Text', () => {
    const u = new URL(buildIssueUrl('Fehler & mehr', 'Zeile 1\nZeile 2'))
    expect(u.origin + u.pathname).toBe('https://github.com/Lxcyfxr/uni-hub/issues/new')
    expect(u.searchParams.get('title')).toBe('Fehler & mehr')
    expect(u.searchParams.get('body')).toBe('Zeile 1\nZeile 2')
  })
  it('verlangt einen Titel', () => {
    expect(() => buildIssueUrl('   ', 'x')).toThrow('Titel')
  })
  it('lehnt zu lange Eingaben ab', () => {
    expect(() => buildIssueUrl('t'.repeat(201), '')).toThrow('Titel')
    expect(() => buildIssueUrl('t', 'x'.repeat(6001))).toThrow('Beschreibung')
    // Sonderzeichen werden mehrfach so lang kodiert und sprengen die Adresslänge
    expect(() => buildIssueUrl('t', 'ä'.repeat(3000))).toThrow('zu lang')
  })
  it('lehnt falsche Typen ab', () => {
    expect(() => buildIssueUrl(1, 'x')).toThrow()
    expect(() => buildIssueUrl('t', null)).toThrow()
  })
})
