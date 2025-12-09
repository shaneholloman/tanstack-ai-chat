import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local first, fallback to .env
config({ path: '.env.local' })
config()

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in .env or .env.local')
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
})
