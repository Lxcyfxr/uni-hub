import { describe, expect, it } from 'vitest'
import {
  applyCloze,
  cardOrds,
  clozeNumbers,
  hasContent,
  mediaRefs,
  plainTitle,
  renameMediaRefs,
  renderCard,
  rewriteCssMedia,
  rewriteMedia,
  stripHtml,
  type RenderNotetype
} from '@shared/anki-render'

const basic: RenderNotetype = {
  kind: 'standard',
  fields: ['Front', 'Back'],
  css: '',
  templates: [
    { name: 'K1', qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' },
    { name: 'K2', qfmt: '{{#Back}}{{Back}}{{/Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Front}}' }
  ]
}

const cloze: RenderNotetype = {
  kind: 'cloze',
  fields: ['Text', 'Extra'],
  css: '',
  templates: [{ name: 'C', qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Extra}}' }]
}

describe('Vorlagen', () => {
  it('setzt Felder und FrontSide ein', () => {
    expect(renderCard(basic, ['Hauptstadt?', 'Berlin'], 0)).toEqual({ question: 'Hauptstadt?', answer: 'Hauptstadt?<hr id=answer>Berlin' })
  })

  it('erzeugt die umgekehrte Karte nur bei gefüllter Rückseite', () => {
    expect(cardOrds(basic, ['Frage', 'Antwort'])).toEqual([0, 1])
    expect(cardOrds(basic, ['Frage', '<br>'])).toEqual([0])
  })

  it('kennt bedingte Abschnitte', () => {
    const nt: RenderNotetype = { ...basic, templates: [{ name: 'x', qfmt: '{{#Back}}mit{{/Back}}{{^Back}}ohne{{/Back}}', afmt: '' }] }
    expect(renderCard(nt, ['a', 'b'], 0).question).toBe('mit')
    expect(renderCard(nt, ['a', ''], 0).question).toBe('ohne')
  })

  it('wendet Filter von rechts nach links an und ignoriert type', () => {
    const nt: RenderNotetype = { ...basic, templates: [{ name: 'x', qfmt: '{{text:Front}}|{{type:Back}}', afmt: '' }] }
    expect(renderCard(nt, ['<b>fett</b>', 'x'], 0).question).toBe('fett|')
  })

  it('zählt Bilder und Ton als Inhalt', () => {
    expect(hasContent('<img src="a.png">')).toBe(true)
    expect(hasContent('[sound:a.mp3]')).toBe(true)
    expect(hasContent('  <br> ')).toBe(false)
  })
})

describe('Lückentext', () => {
  const values = ['Der {{c1::Bizeps::Muskel}} beugt den {{c2::Ellenbogen}}', '']

  it('findet die Lückennummern und erzeugt je eine Karte', () => {
    expect(clozeNumbers(values)).toEqual([1, 2])
    expect(cardOrds(cloze, values)).toEqual([0, 1])
  })

  it('verdeckt nur die aktive Lücke und nutzt den Hinweis', () => {
    expect(renderCard(cloze, values, 0).question).toBe('Der <span class="cloze">[Muskel]</span> beugt den Ellenbogen')
    expect(renderCard(cloze, values, 1).question).toBe('Der Bizeps beugt den <span class="cloze">[...]</span>')
  })

  it('zeigt in der Antwort die Lösung', () => {
    expect(applyCloze('{{c1::A}} und {{c2::B}}', 1, true)).toBe('<span class="cloze">A</span> und B')
  })

  it('erzeugt ohne Lücke keine Karte', () => {
    expect(cardOrds(cloze, ['kein Cloze', ''])).toEqual([])
  })
})

describe('Texte', () => {
  it('entfernt HTML und Entitäten', () => {
    expect(stripHtml('<b>Hallo</b>&nbsp;&amp; Welt<br>neu')).toBe('Hallo & Welt neu')
  })

  it('macht aus Lücken Klartext für Listen', () => {
    expect(plainTitle('<b>Hallo</b> {{c1::Welt}}')).toBe('Hallo Welt')
  })
})

describe('Medien', () => {
  it('biegt lokale Verweise auf das App-Protokoll um, fremde bleiben', () => {
    const out = rewriteMedia('<img src="a%20b.jpg"><img src="https://x.de/y.png"><img src="data:image/png;base64,AAA">[sound:s.mp3]', 'ns1')
    expect(out).toContain('src="unihub-media://ns1/a%20b.jpg"')
    expect(out).toContain('src="https://x.de/y.png"')
    expect(out).toContain('src="data:image/png;base64,AAA"')
    expect(out).toContain('<audio controls src="unihub-media://ns1/s.mp3"></audio>')
  })

  it('schreibt auch Schriften und Hintergründe im CSS um', () => {
    expect(rewriteCssMedia('@font-face{src:url("_f.ttf")} a{background:url(https://x/y.png)}', 'ns')).toBe(
      '@font-face{src:url("unihub-media://ns/_f.ttf")} a{background:url(https://x/y.png)}'
    )
  })

  it('listet referenzierte Dateien (ohne eingebettete und externe)', () => {
    expect(mediaRefs('<img alt="x" src="a%20b.jpg"> [sound:s.mp3] <img src="data:image/png;base64,AAA"><img src="http://a/b.png">')).toEqual(['a b.jpg', 's.mp3'])
  })

  it('benennt Verweise für den Export um', () => {
    expect(renameMediaRefs('<img src="a.png"> [sound:b.mp3]', new Map([['a.png', 'x_a.png']]))).toBe('<img src="x_a.png"> [sound:b.mp3]')
  })
})
