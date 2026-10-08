import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@shared': resolve('src/shared') } }
})
