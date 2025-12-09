import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

// Deployment target: 'cloudflare' or 'bun' (default)
const isCloudflare = process.env.DEPLOY_TARGET === 'cloudflare'

const config = defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    // Use Cloudflare plugin for edge deployment, Nitro for Docker/self-hosted
    ...(isCloudflare
      ? [cloudflare({ viteEnvironment: { name: 'ssr' } })]
      : [nitro({ preset: 'bun' })]),
    viteReact(),
  ],
  optimizeDeps: {
    exclude: ['postgres', 'drizzle-orm'],
  },
})

export default config
