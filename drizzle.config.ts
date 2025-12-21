import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/drizzle-schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:./db/eval.db',
  },
} satisfies Config
