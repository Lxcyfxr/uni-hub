import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { UniApi } from '@shared/ipc'

const api: UniApi = {
  web: {
    show: (id, bounds) => ipcRenderer.invoke('web:show', id, bounds),
    hide: () => ipcRenderer.invoke('web:hide'),
    nav: (action) => ipcRenderer.invoke('web:nav', action)
  },
  todos: {
    list: () => ipcRenderer.invoke('todos:list'),
    add: (input) => ipcRenderer.invoke('todos:add', input),
    update: (id, input) => ipcRenderer.invoke('todos:update', id, input),
    setStatus: (id, status) => ipcRenderer.invoke('todos:setStatus', id, status),
    remove: (id) => ipcRenderer.invoke('todos:remove', id),
    categories: () => ipcRenderer.invoke('todos:categories'),
    addCategory: (name, color) => ipcRenderer.invoke('todos:addCategory', name, color),
    updateCategory: (id, name, color) => ipcRenderer.invoke('todos:updateCategory', id, name, color),
    removeCategory: (id) => ipcRenderer.invoke('todos:removeCategory', id)
  },
  calendar: {
    sources: () => ipcRenderer.invoke('calendar:sources'),
    addUrl: (name, url, color) => ipcRenderer.invoke('calendar:addUrl', name, url, color),
    importFile: () => ipcRenderer.invoke('calendar:importFile'),
    removeSource: (id) => ipcRenderer.invoke('calendar:removeSource', id),
    sync: (id) => ipcRenderer.invoke('calendar:sync', id),
    events: (from, to) => ipcRenderer.invoke('calendar:events', from, to),
    saveEvent: (input) => ipcRenderer.invoke('calendar:saveEvent', input),
    deleteEvent: (id) => ipcRenderer.invoke('calendar:deleteEvent', id),
    exportIcs: () => ipcRenderer.invoke('calendar:exportIcs')
  },
  docs: {
    list: () => ipcRenderer.invoke('docs:list'),
    importDialog: (folder) => ipcRenderer.invoke('docs:importDialog', folder),
    importPaths: (paths, folder) => ipcRenderer.invoke('docs:importPaths', paths, folder),
    pathForFile: (file) => webUtils.getPathForFile(file),
    update: (id, patch) => ipcRenderer.invoke('docs:update', id, patch),
    remove: (id) => ipcRenderer.invoke('docs:remove', id),
    search: (q) => ipcRenderer.invoke('docs:search', q),
    preview: (id) => ipcRenderer.invoke('docs:preview', id),
    showView: (id, bounds) => ipcRenderer.invoke('docs:showView', id, bounds),
    hideView: () => ipcRenderer.invoke('docs:hideView'),
    openExternal: (id) => ipcRenderer.invoke('docs:openExternal', id),
    reveal: (id) => ipcRenderer.invoke('docs:reveal', id),
    onImported: (cb) => {
      const handler = (_e: Electron.IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on('docs:imported', handler)
      return () => ipcRenderer.removeListener('docs:imported', handler)
    }
  },
  study: {
    list: () => ipcRenderer.invoke('study:list'),
    stats: () => ipcRenderer.invoke('study:stats'),
    addSubject: (name, color, exam) => ipcRenderer.invoke('study:addSubject', name, color, exam),
    updateSubject: (id, patch) => ipcRenderer.invoke('study:updateSubject', id, patch),
    removeSubject: (id) => ipcRenderer.invoke('study:removeSubject', id),
    addTopics: (subjectId, titles) => ipcRenderer.invoke('study:addTopics', subjectId, titles),
    renameTopic: (id, title) => ipcRenderer.invoke('study:renameTopic', id, title),
    toggleTopic: (id) => ipcRenderer.invoke('study:toggleTopic', id),
    removeTopic: (id) => ipcRenderer.invoke('study:removeTopic', id),
    logSession: (subjectId, topicId, minutes) => ipcRenderer.invoke('study:logSession', subjectId, topicId, minutes)
  },
  sessions: {
    reset: (id) => ipcRenderer.invoke('sessions:reset', id)
  },
  ui: {
    get: (key) => ipcRenderer.invoke('ui:get', key),
    set: (key, value) => ipcRenderer.invoke('ui:set', key, value)
  },
  app: {
    onNavigate: (cb) => {
      const handler = (_e: Electron.IpcRendererEvent, m: Parameters<typeof cb>[0]) => cb(m)
      ipcRenderer.on('app:navigate', handler)
      return () => ipcRenderer.removeListener('app:navigate', handler)
    },
    testNotification: () => ipcRenderer.invoke('app:testNotification'),
    getAutostart: () => ipcRenderer.invoke('app:getAutostart'),
    setAutostart: (enabled) => ipcRenderer.invoke('app:setAutostart', enabled),
    notify: (opts) => ipcRenderer.invoke('app:notify', opts)
  },
  anki: {
    decks: () => ipcRenderer.invoke('anki:decks'),
    notetypes: () => ipcRenderer.invoke('anki:notetypes'),
    createDeck: (name) => ipcRenderer.invoke('anki:createDeck', name),
    renameDeck: (id, name) => ipcRenderer.invoke('anki:renameDeck', id, name),
    deleteDeck: (id) => ipcRenderer.invoke('anki:deleteDeck', id),
    getNote: (id) => ipcRenderer.invoke('anki:getNote', id),
    saveNote: (input) => ipcRenderer.invoke('anki:saveNote', input),
    deleteNotes: (ids) => ipcRenderer.invoke('anki:deleteNotes', ids),
    browse: (query) => ipcRenderer.invoke('anki:browse', query),
    setSuspended: (cardId, suspended) => ipcRenderer.invoke('anki:setSuspended', cardId, suspended),
    preview: (nt, fields, ord, ns) => ipcRenderer.invoke('anki:preview', nt, fields, ord, ns),
    cardPreview: (cardId) => ipcRenderer.invoke('anki:cardPreview', cardId),
    next: (deckId) => ipcRenderer.invoke('anki:next', deckId),
    answer: (cardId, rating) => ipcRenderer.invoke('anki:answer', cardId, rating),
    importApkg: (keep) => ipcRenderer.invoke('anki:importApkg', keep),
    importText: (deckId, header) => ipcRenderer.invoke('anki:importText', deckId, header),
    exportDeck: (deckId, withProgress) => ipcRenderer.invoke('anki:exportDeck', deckId, withProgress),
    addImage: () => ipcRenderer.invoke('anki:addImage'),
    onProgress: (cb) => {
      const handler = (_e: Electron.IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on('anki:progress', handler)
      return () => ipcRenderer.removeListener('anki:progress', handler)
    },
    onDownload: (cb) => {
      const handler = (_e: Electron.IpcRendererEvent, ev: Parameters<typeof cb>[0]) => cb(ev)
      ipcRenderer.on('anki:download', handler)
      return () => ipcRenderer.removeListener('anki:download', handler)
    }
  }
}

contextBridge.exposeInMainWorld('uni', api)
