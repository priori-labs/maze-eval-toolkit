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
 * Evaluation data for the UI viewer
 * Includes fields needed for solution replay and details view
 */
interface VisualizerEvaluation {
  id: string
  mazeId: string
  model: string
  difficulty: Difficulty
  promptFormats: PromptFormat[]
  outcome: EvaluationOutcome
  efficiency: number | null
  inferenceTimeMs: number
  costUsd: number | null
  testSetId: string
  testSetName: string
  // Solution details
  parsedMoves: string[] | null
  rawResponse: string
  reasoning: string | null
  solutionLength: number | null
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
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

interface TestSetInfo {
  id: string
  name: string
}

function getTestSets(dbPath: string): TestSetInfo[] {
  const db = initDatabase(dbPath)
  const query = db.query(
    'SELECT DISTINCT test_set_id, test_set_name FROM evaluations ORDER BY test_set_id',
  )
  const rows = query.all() as { test_set_id: string; test_set_name: string }[]
  closeDatabase()

  return rows.map((row) => ({
    id: row.test_set_id,
    name: row.test_set_name || row.test_set_id,
  }))
}

function getAllEvaluations(dbPath: string, testSetId?: string): VisualizerEvaluation[] {
  const db = initDatabase(dbPath)
  const sql = testSetId
    ? 'SELECT id, maze_id, model, difficulty, prompt_formats, outcome, efficiency, inference_time_ms, cost_usd, test_set_id, test_set_name, parsed_moves, raw_response, reasoning, solution_length, input_tokens, output_tokens, reasoning_tokens FROM evaluations WHERE test_set_id = ?'
    : 'SELECT id, maze_id, model, difficulty, prompt_formats, outcome, efficiency, inference_time_ms, cost_usd, test_set_id, test_set_name, parsed_moves, raw_response, reasoning, solution_length, input_tokens, output_tokens, reasoning_tokens FROM evaluations'
  const query = db.query(sql)
  const rows = (testSetId ? query.all(testSetId) : query.all()) as any[]
  closeDatabase()

  return rows.map((row) => ({
    id: row.id,
    mazeId: row.maze_id,
    model: row.model,
    difficulty: row.difficulty,
    promptFormats: JSON.parse(row.prompt_formats),
    outcome: row.outcome,
    efficiency: row.efficiency,
    inferenceTimeMs: row.inference_time_ms,
    costUsd: row.cost_usd,
    testSetId: row.test_set_id,
    testSetName: row.test_set_name,
    parsedMoves: row.parsed_moves ? JSON.parse(row.parsed_moves) : null,
    rawResponse: row.raw_response,
    reasoning: row.reasoning,
    solutionLength: row.solution_length,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
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

  // Find available test sets
  const testSets = getTestSets(databasePath)
  if (testSets.length === 0) {
    console.error(chalk.red('No test sets found in database'))
    process.exit(1)
  }

  const testSetChoices = [
    { name: 'All test sets', value: '__all__' },
    ...testSets.map((t) => ({
      name: t.name !== t.id ? `${t.name} (${t.id})` : t.id,
      value: t.id,
    })),
  ]

  const selectedTestSet = await select({
    message: 'Select test set to export:',
    choices: testSetChoices,
    pageSize: testSetChoices.length,
  })

  const testSetId = selectedTestSet === '__all__' ? undefined : selectedTestSet

  // Output path
  const defaultFileName = testSetId ? `results-${testSetId}.json` : 'results.json'
  const outputPath = await input({
    message: 'Output JSON path:',
    default: `./results/${defaultFileName}`,
  })

  // Load and export
  console.log()
  console.log('Exporting results...')

  const results = getAllEvaluations(databasePath, testSetId)
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
