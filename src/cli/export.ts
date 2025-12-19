/**
 * CLI command for exporting evaluation results to JSON
 */

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { input, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import type { Difficulty, EvaluationOutcome, PromptFormat } from '../core/types'
import { closeDatabase, initDatabase } from '../db/client'

/**
 * Minimal evaluation data required for the visualizer
 * Excludes large fields like prompt, rawResponse, parsedMoves, reasoning
 */
interface VisualizerEvaluation {
  model: string
  difficulty: Difficulty
  promptFormats: PromptFormat[]
  outcome: EvaluationOutcome
  efficiency: number | null
  inferenceTimeMs: number
  costUsd: number | null
}

/**
 * Pre-aggregated data for efficient UI consumption
 * ~25-30 records instead of 1,200 individual evaluations
 */
interface CondensedRecord {
  model: string
  format: string
  totalEvals: number
  successes: number
  avgEfficiency: number
  avgInferenceTimeMs: number
  totalCostUsd: number
  byDifficulty: Record<
    string,
    {
      evals: number
      successes: number
      avgTimeMs: number
      avgEfficiency: number
    }
  >
}

/**
 * Condense raw evaluation data into aggregated model+format records
 */
function condenseData(raw: VisualizerEvaluation[]): CondensedRecord[] {
  const grouped = new Map<string, VisualizerEvaluation[]>()

  for (const r of raw) {
    const format =
      r.promptFormats.includes('edges') && r.promptFormats.includes('ascii')
        ? 'edges_ascii'
        : r.promptFormats[0]
    const key = `${r.model}|${format}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }

  const results: CondensedRecord[] = []

  for (const [key, evals] of grouped) {
    const parts = key.split('|')
    const model = parts[0] ?? ''
    const format = parts[1] ?? ''
    const successes = evals.filter((e) => e.outcome === 'success')

    // Group by difficulty
    const byDiff: Record<string, VisualizerEvaluation[]> = {}
    for (const e of evals) {
      const diff = e.difficulty
      if (!byDiff[diff]) byDiff[diff] = []
      byDiff[diff].push(e)
    }

    const byDifficulty: CondensedRecord['byDifficulty'] = {}
    for (const [diff, diffEvals] of Object.entries(byDiff)) {
      const diffSuccesses = diffEvals.filter((e) => e.outcome === 'success')
      byDifficulty[diff] = {
        evals: diffEvals.length,
        successes: diffSuccesses.length,
        avgTimeMs: diffEvals.reduce((a, e) => a + e.inferenceTimeMs, 0) / diffEvals.length,
        avgEfficiency:
          diffSuccesses.length > 0
            ? diffSuccesses.reduce((a, e) => a + (e.efficiency ?? 0), 0) / diffSuccesses.length
            : 0,
      }
    }

    results.push({
      model,
      format,
      totalEvals: evals.length,
      successes: successes.length,
      avgEfficiency:
        successes.length > 0
          ? successes.reduce((a, e) => a + (e.efficiency ?? 0), 0) / successes.length
          : 0,
      avgInferenceTimeMs: evals.reduce((a, e) => a + e.inferenceTimeMs, 0) / evals.length,
      totalCostUsd: evals.reduce((a, e) => a + (e.costUsd ?? 0), 0),
      byDifficulty,
    })
  }

  return results
}

function findDatabases(): string[] {
  const resultsDir = './results'
  if (!existsSync(resultsDir)) return []
  return readdirSync(resultsDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => `${resultsDir}/${f}`)
}

function getAllEvaluations(dbPath: string): VisualizerEvaluation[] {
  const db = initDatabase(dbPath)
  const query = db.query(
    'SELECT model, difficulty, prompt_formats, outcome, efficiency, inference_time_ms, cost_usd FROM evaluations',
  )
  const rows = query.all() as any[]
  closeDatabase()

  return rows.map((row) => ({
    model: row.model,
    difficulty: row.difficulty,
    promptFormats: JSON.parse(row.prompt_formats),
    outcome: row.outcome,
    efficiency: row.efficiency,
    inferenceTimeMs: row.inference_time_ms,
    costUsd: row.cost_usd,
  }))
}

async function run() {
  console.log(chalk.bold('\nLMIQ Results Export'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  // Find available databases
  const databases = findDatabases()
  if (databases.length === 0) {
    console.error(chalk.red('No databases found in ./results/'))
    console.error('Run `task evaluate` to create one')
    process.exit(1)
  }

  const databasePath = await select({
    message: 'Select evaluation database:',
    choices: databases.map((d) => ({ name: d, value: d })),
    pageSize: databases.length,
  })

  // Output path
  const outputPath = await input({
    message: 'Output JSON path:',
    default: './results/results.json',
  })

  // Load and export
  console.log()
  console.log('Exporting results...')

  const results = getAllEvaluations(databasePath)
  writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8')

  // Generate condensed mini version
  const condensed = condenseData(results)
  const miniOutputPath = outputPath.replace(/\.json$/, '-mini.json')
  writeFileSync(miniOutputPath, JSON.stringify(condensed, null, 2), 'utf-8')

  console.log()
  console.log(chalk.dim('─'.repeat(50)))
  console.log(chalk.bold('Export Complete'))
  console.log()
  console.log(chalk.dim('Full results:'))
  console.log(`  Records: ${results.length}`)
  console.log(`  Output: ${chalk.cyan(outputPath)}`)
  console.log()
  console.log(chalk.dim('Condensed results:'))
  console.log(`  Records: ${condensed.length}`)
  console.log(`  Output: ${chalk.cyan(miniOutputPath)}`)
  console.log()
}

export const exportCommand = new Command('export')
  .description('Export evaluation results to JSON for the UI')
  .action(async () => {
    try {
      await run()
    } catch (err) {
      if (err instanceof ExitPromptError) {
        console.log(chalk.yellow('\nCancelled'))
        process.exit(0)
      }
      throw err
    }
  })
