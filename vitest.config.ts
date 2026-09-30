import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    // The host-half specs are pure Node. The mount spec builds its own jsdom
    // instance and installs it on globalThis, so it needs no jsdom environment
    // here — and a jsdom environment would break the node:fs reads it performs.
    environment: 'node',
  },
})
