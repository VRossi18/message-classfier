import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createDb(url: string) {
  const sql = postgres(url, { max: 10 })
  return { db: drizzle(sql, { schema }), sql }
}

export type Db = ReturnType<typeof createDb>['db']

export async function runMigrations(db: Db, folder = './drizzle') {
  await migrate(db, { migrationsFolder: folder })
}
