/**
 * Shared CLI utilities
 */

import { existsSync, readdirSync } from 'node:fs'
import type { PromptFormat } from '../core/types'
import { closeDatabase, initDatabase } from '../db/client'

/** Default database directory */
export const DB_DIR = './db'

/** Summary of an evaluation run */
export interface RunSummary {
  runId: string
  model: string
  testSetId: string
  promptFormats: PromptFormat[]
  /** First format (convenience field) */
  format: string
  count: number
  outcomes: Record<string, number>
  startedAt: string
}

/** Find all database files in the db directory */
export function findDatabases(): string[] {
  if (!existsSync(DB_DIR)) return []
  return readdirSync(DB_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => `${DB_DIR}/${f}`)
}

/** Get summaries of all evaluation runs in a database */
export function getRunSummaries(dbPath: string): RunSummary[] {
  const db = initDatabase(dbPath)

  const query = db.query(`
    SELECT
      run_id,
      model,
      test_set_id,
      prompt_formats,
      COUNT(*) as count,
      MIN(started_at) as started_at
    FROM evaluations
    GROUP BY run_id
    ORDER BY started_at DESC
  `)
  const rows = query.all() as Array<{
    run_id: string
    model: string
    test_set_id: string
    prompt_formats: string
    count: number
    started_at: string
  }>

  const summaries: RunSummary[] = []
  for (const row of rows) {
    const outcomeQuery = db.query(`
      SELECT outcome, COUNT(*) as count
      FROM evaluations
      WHERE run_id = ?
      GROUP BY outcome
    `)
    const outcomeRows = outcomeQuery.all(row.run_id) as Array<{
      outcome: string
      count: number
    }>

    const outcomes: Record<string, number> = {}
    for (const o of outcomeRows) {
      outcomes[o.outcome] = o.count
    }

    let promptFormats: PromptFormat[] = []
    try {
      promptFormats = JSON.parse(row.prompt_formats) as PromptFormat[]
    } catch {
      // Ignore parse errors
    }

    summaries.push({
      runId: row.run_id,
      model: row.model,
      testSetId: row.test_set_id || '',
      promptFormats,
      format: promptFormats[0] || 'unknown',
      count: row.count,
      outcomes,
      startedAt: row.started_at,
    })
  }

  closeDatabase()
  return summaries
}

/**
 * Format duration in seconds to human-readable string
 * e.g. 2094.8 -> "34m 55s", 7200 -> "2h", 45 -> "45s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  const hours = Math.floor(seconds / 3600)
  const mins = Math.round((seconds % 3600) / 60)
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}
