import { describe, expect, it } from 'vitest'
import { isAppUrl, isLoginPopup, isSafeExternalUrl, isWebNavigation } from '@shared/urls'

describe('isSafeExternalUrl', () => {
  it('erlaubt nur https', () => {
    expect(isSafeExternalUrl('https://github.com/Lxcyfxr')).toBe(true)
    expect(isSafeExternalUrl('http://example.org')).toBe(false)
  })

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'smb://angreifer/freigabe',
    '\\\\angreifer\\freigabe\\x.exe',
    'ms-msdt:/id PCWDiagnostic',
    'search-ms:query=x',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vscode://file/x',
    'mailto:a@b.de',
    'https://',
    'kein url',
    ''
  ])('lehnt %s ab', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false)
  })

  it('lehnt Adressen mit Zugangsdaten ab (Täuschung über den Rechnernamen)', () => {
    expect(isSafeExternalUrl('https://charite.de@angreifer.example/')).toBe(false)
    expect(isSafeExternalUrl('https://user:pw@example.org/')).toBe(false)
  })
})

describe('isWebNavigation', () => {
  it('lässt nur http(s) zu', () => {
    expect(isWebNavigation('https://lehre.charite.de/')).toBe(true)
    expect(isWebNavigation('http://intern.charite.de/')).toBe(true)
    expect(isWebNavigation('file:///C:/geheim.html')).toBe(false)
    expect(isWebNavigation('ms-word:ofe|u|https://x')).toBe(false)
  })
})

describe('isLoginPopup', () => {
  it('erlaubt Anmeldeanbieter und deren Unterdomänen über https', () => {
    expect(isLoginPopup('https://login.microsoftonline.com/common/oauth2')).toBe(true)
    expect(isLoginPopup('https://sso.charite.de/idp')).toBe(true)
    expect(isLoginPopup('https://amboss.com/login')).toBe(true)
    expect(isLoginPopup('https://next.amboss.com/de')).toBe(true)
  })

  it('erkennt Nachahmer-Domains und fremde Schemata', () => {
    expect(isLoginPopup('https://charite.de.angreifer.example/')).toBe(false)
    expect(isLoginPopup('https://notcharite.de/')).toBe(false)
    expect(isLoginPopup('https://angreifer.example/?u=https://charite.de/')).toBe(false)
    expect(isLoginPopup('http://login.microsoftonline.com/')).toBe(false)
    expect(isLoginPopup('file:///charite.de')).toBe(false)
  })
})

describe('isAppUrl', () => {
  const fileUrl = 'file:///D:/Apps/Uni-Hub/resources/app.asar/out/renderer/index.html'

  it('erkennt installiert nur die eigene index.html (Fragment/Query egal)', () => {
    expect(isAppUrl(fileUrl, { fileUrl })).toBe(true)
    expect(isAppUrl(`${fileUrl}#/todo?x=1`, { fileUrl })).toBe(true)
    expect(isAppUrl('file:///D:/Apps/Uni-Hub/resources/app.asar/out/renderer/andere.html', { fileUrl })).toBe(false)
    expect(isAppUrl('file:///C:/Users/x/Downloads/boese.html', { fileUrl })).toBe(false)
    expect(isAppUrl('https://example.org/', { fileUrl })).toBe(false)
  })

  it('erkennt in der Entwicklung nur den Vite-Server', () => {
    const devUrl = 'http://localhost:5173/'
    expect(isAppUrl('http://localhost:5173/', { fileUrl, devUrl })).toBe(true)
    expect(isAppUrl('http://localhost:5173/src/main.tsx', { fileUrl, devUrl })).toBe(true)
    expect(isAppUrl('http://localhost:5174/', { fileUrl, devUrl })).toBe(false)
    expect(isAppUrl('http://localhost.angreifer.example:5173/', { fileUrl, devUrl })).toBe(false)
    expect(isAppUrl('file:///C:/boese.html', { fileUrl, devUrl })).toBe(false)
  })
})
