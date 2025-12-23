/**
 * CLI command for retrying failed evaluations
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { checkbox, confirm, input, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import pLimit from 'p-limit'
import { generatePrompt } from '../core/maze-renderer'
import { validateSolutionWithConstraints } from '../core/maze-solver'
import type {
  Difficulty,
  EvaluationOutcome,
  EvaluationResult,
  MazeWithPrompts,
  PromptFormat,
  TestSetFile,
} from '../core/types'
import { closeDatabase, initDatabase } from '../db/client'
import { updateEvaluation } from '../db/queries'
import { createClient, evaluateMaze } from '../llm/openrouter'
import { DB_DIR, findDatabases, getRunSummaries } from './utils'

const RETRYABLE_OUTCOMES: EvaluationOutcome[] = [
  'empty_response',
  'token_limit',
  'parse_error',
  'failure',
  'invalid_move',
  'timeout',
  'api_error',
  'constraint_violated',
]

function getEvaluationsToRetry(
  dbPath: string,
  runId: string,
  outcomes: string[],
): EvaluationResult[] {
  const db = initDatabase(dbPath)

  const placeholders = outcomes.map(() => '?').join(', ')
  const query = db.query(`
    SELECT * FROM evaluations
    WHERE run_id = ? AND outcome IN (${placeholders})
  `)

  const rows = query.all(runId, ...outcomes) as Array<Record<string, unknown>>

  const results = rows.map((row) => ({
    id: row.id as string,
    runId: row.run_id as string,
    testSetId: row.test_set_id as string,
    testSetName: row.test_set_name as string,
    mazeId: row.maze_id as string,
    model: row.model as string,
    difficulty: row.difficulty as Difficulty,
    prompt: row.prompt as string,
    promptFormats: JSON.parse(row.prompt_formats as string) as PromptFormat[],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string,
    inputTokens: row.input_tokens as number | null,
    outputTokens: row.output_tokens as number | null,
    reasoningTokens: row.reasoning_tokens as number | null,
    costUsd: row.cost_usd as number | null,
    inferenceTimeMs: row.inference_time_ms as number,
    rawResponse: row.raw_response as string,
    parsedMoves: row.parsed_moves ? JSON.parse(row.parsed_moves as string) : null,
    reasoning: row.reasoning as string | null,
    outcome: row.outcome as EvaluationOutcome,
    movesExecuted: row.moves_executed as number | null,
    finalPosition: row.final_position ? JSON.parse(row.final_position as string) : null,
    solutionLength: row.solution_length as number | null,
    shortestPath: row.shortest_path as number,
    efficiency: row.efficiency as number | null,
    isHuman: (row.is_human as number) === 1,
  }))

  closeDatabase()
  return results
}

function getEvaluationsByMazeId(dbPath: string, mazeId: string): EvaluationResult[] {
  const db = initDatabase(dbPath)

  // Exclude human evaluations (is_human = 1)
  const query = db.query(
    'SELECT * FROM evaluations WHERE maze_id = ? AND (is_human = 0 OR is_human IS NULL)',
  )
  const rows = query.all(mazeId) as Array<Record<string, unknown>>

  const results = rows.map((row) => ({
    id: row.id as string,
    runId: row.run_id as string,
    testSetId: row.test_set_id as string,
    testSetName: row.test_set_name as string,
    mazeId: row.maze_id as string,
    model: row.model as string,
    difficulty: row.difficulty as Difficulty,
    prompt: row.prompt as string,
    promptFormats: JSON.parse(row.prompt_formats as string) as PromptFormat[],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string,
    inputTokens: row.input_tokens as number | null,
    outputTokens: row.output_tokens as number | null,
    reasoningTokens: row.reasoning_tokens as number | null,
    costUsd: row.cost_usd as number | null,
    inferenceTimeMs: row.inference_time_ms as number,
    rawResponse: row.raw_response as string,
    parsedMoves: row.parsed_moves ? JSON.parse(row.parsed_moves as string) : null,
    reasoning: row.reasoning as string | null,
    outcome: row.outcome as EvaluationOutcome,
    movesExecuted: row.moves_executed as number | null,
    finalPosition: row.final_position ? JSON.parse(row.final_position as string) : null,
    solutionLength: row.solution_length as number | null,
    shortestPath: row.shortest_path as number,
    efficiency: row.efficiency as number | null,
    isHuman: (row.is_human as number) === 1,
  }))

  closeDatabase()
  return results
}

function loadTestSet(testSetId: string): TestSetFile | null {
  // Look for test set in ./test-sets/ directory
  const dataDir = './test-sets'
  if (!existsSync(dataDir)) return null

  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    try {
      const content = readFileSync(`${dataDir}/${file}`, 'utf-8')
      const testSet = JSON.parse(content) as TestSetFile
      if (testSet.id === testSetId) {
        return testSet
      }
    } catch {
      // Skip invalid files
    }
  }
  return null
}

function findMaze(testSet: TestSetFile, mazeId: string): MazeWithPrompts | null {
  for (const difficulty of Object.keys(testSet.mazes) as Difficulty[]) {
    const maze = testSet.mazes[difficulty].find((m) => m.id === mazeId)
    if (maze) return maze
  }
  return null
}

function loadMazeById(mazeId: string): { maze: MazeWithPrompts; testSet: TestSetFile } | null {
  const dataDir = './test-sets'
  if (!existsSync(dataDir)) return null

  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    try {
      const content = readFileSync(`${dataDir}/${file}`, 'utf-8')
      const testSet = JSON.parse(content) as TestSetFile
      const maze = findMaze(testSet, mazeId)
      if (maze) return { maze, testSet }
    } catch {
      // Skip invalid files
    }
  }
  return null
}

function formatOutcomes(outcomes: Record<string, number>): string {
  const parts: string[] = []
  if (outcomes.success) parts.push(chalk.green(`${outcomes.success} success`))
  if (outcomes.failure) parts.push(chalk.red(`${outcomes.failure} failure`))
  if (outcomes.parse_error) parts.push(chalk.yellow(`${outcomes.parse_error} parse_error`))
  if (outcomes.empty_response) parts.push(chalk.yellow(`${outcomes.empty_response} empty_response`))
  if (outcomes.token_limit) parts.push(chalk.yellow(`${outcomes.token_limit} token_limit`))
  if (outcomes.invalid_move) parts.push(chalk.red(`${outcomes.invalid_move} invalid_move`))
  if (outcomes.timeout) parts.push(chalk.yellow(`${outcomes.timeout} timeout`))
  if (outcomes.api_error) parts.push(chalk.red(`${outcomes.api_error} api_error`))
  if (outcomes.constraint_violated)
    parts.push(chalk.yellow(`${outcomes.constraint_violated} constraint_violated`))
  return parts.join(', ') || 'none'
}

interface RetryContext {
  apiKey: string
  databasePath: string
  evaluations: EvaluationResult[]
  getMaze: (mazeId: string) => MazeWithPrompts | null
  concurrency: number
}

async function executeRetry(ctx: RetryContext): Promise<void> {
  const { apiKey, databasePath, evaluations, getMaze, concurrency } = ctx

  // Create OpenRouter client
  const client = createClient(apiKey)

  // Setup concurrency limiter
  const limit = pLimit(concurrency)

  // Track progress
  let completed = 0
  let successes = 0
  let failures = 0
  let totalCost = 0
  const startTime = Date.now()

  console.log()
  console.log(chalk.bold('Retrying...'))
  console.log()

  // Setup debug log file
  const logDir = './debug'
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  const logPath = `${logDir}/retry-${Date.now()}.log`

  // Initialize database for updates
  const db = initDatabase(databasePath)

  // Retry each evaluation
  const total = evaluations.length
  const totalStr = String(total)

  const retryPromises = evaluations.map((evaluation) =>
    limit(async () => {
      // Find the maze
      const maze = getMaze(evaluation.mazeId)
      if (!maze) {
        console.log(chalk.red(`[ERROR] Could not find maze ${evaluation.mazeId} in test set`))
        return
      }

      // Generate prompt with original formats and special instructions
      const prompt = generatePrompt(maze, evaluation.promptFormats, maze.specialInstructions)
      const startedAt = new Date().toISOString()

      try {
        // Call OpenRouter
        const response = await evaluateMaze(client, evaluation.model, prompt)
        const completedAt = new Date().toISOString()

        // Determine outcome (same logic as evaluate.ts)
        let outcome: EvaluationOutcome
        let validation = null

        if (!response.rawResponse || response.rawResponse.trim() === '') {
          if (response.finishReason === 'length') {
            outcome = 'token_limit'
            appendFileSync(
              logPath,
              `\n--- TOKEN LIMIT DEBUG (maze: ${evaluation.mazeId}, difficulty: ${evaluation.difficulty}) ---\nFinish reason: ${response.finishReason}\nTokens: input=${response.stats.inputTokens}, output=${response.stats.outputTokens}, reasoning=${response.stats.reasoningTokens}\n--- END TOKEN LIMIT DEBUG ---\n\n`,
            )
          } else {
            outcome = 'empty_response'
            appendFileSync(
              logPath,
              `\n--- EMPTY RESPONSE DEBUG (maze: ${evaluation.mazeId}, difficulty: ${evaluation.difficulty}) ---\nFinish reason: ${response.finishReason}\nTokens: input=${response.stats.inputTokens}, output=${response.stats.outputTokens}, reasoning=${response.stats.reasoningTokens}\nRaw response: "${response.rawResponse}"\n--- END EMPTY RESPONSE DEBUG ---\n\n`,
            )
          }
        } else if (response.parseError || !response.parsedMoves) {
          outcome = 'parse_error'
          // Log parse error details to debug file
          appendFileSync(
            logPath,
            `\n--- PARSE ERROR DEBUG (maze: ${evaluation.mazeId}, difficulty: ${evaluation.difficulty}) ---\nError: ${response.parseError ?? 'No parsed moves'}\nRaw response:\n${response.rawResponse}\n--- END PARSE ERROR DEBUG ---\n\n`,
          )
        } else {
          validation = validateSolutionWithConstraints(
            maze.grid,
            maze.start,
            maze.goal,
            maze.shortestPath,
            response.parsedMoves,
            maze.requirementType
              ? {
                  requirementType: maze.requirementType,
                  requiredSolutionSubsequences: maze.requiredSolutionSubsequences,
                  requiredTiles: maze.requiredTiles,
                }
              : undefined,
          )

          if (!validation.isValid) {
            outcome = 'invalid_move'
          } else if (validation.reachesGoal) {
            // Check constraint satisfaction
            if (validation.constraintsSatisfied === false) {
              outcome = 'constraint_violated'
            } else {
              outcome = 'success'
              successes++
            }
          } else {
            outcome = 'failure'
          }
        }

        // Track cost
        if (response.stats.costUsd !== null) {
          totalCost += response.stats.costUsd
        }

        // Update the evaluation in place
        const updatedResult: EvaluationResult = {
          ...evaluation,
          startedAt,
          completedAt,
          inputTokens: response.stats.inputTokens,
          outputTokens: response.stats.outputTokens,
          reasoningTokens: response.stats.reasoningTokens,
          costUsd: response.stats.costUsd,
          inferenceTimeMs: response.stats.inferenceTimeMs,
          rawResponse: response.rawResponse,
          parsedMoves: response.parsedMoves,
          reasoning: response.reasoning,
          outcome,
          movesExecuted: validation?.pathLength ?? null,
          finalPosition: validation?.finalPosition ?? null,
          solutionLength: validation?.pathLength ?? null,
          efficiency: validation?.efficiency ?? null,
        }

        updateEvaluation(db, updatedResult)
        completed++

        // Log result
        const prefix = `[${String(completed).padStart(totalStr.length)}/${totalStr}]`
        const outcomeColor =
          outcome === 'success'
            ? chalk.green
            : outcome === 'parse_error' ||
                outcome === 'empty_response' ||
                outcome === 'token_limit' ||
                outcome === 'constraint_violated'
              ? chalk.yellow
              : chalk.red
        const timeStr = `${(response.stats.inferenceTimeMs / 1000).toFixed(1)}s`.padStart(7)
        const costStr =
          response.stats.costUsd !== null ? `$${response.stats.costUsd.toFixed(4)}` : '-'
        const tokensStr = `${response.stats.outputTokens ?? '-'} tokens`.padStart(12)
        const prevOutcome = chalk.dim(`was: ${evaluation.outcome}`)
        const modelShort = evaluation.model.split('/').pop() ?? evaluation.model
        console.log(
          `${prefix} ${modelShort.slice(0, 20).padEnd(20)} ${evaluation.difficulty.padEnd(10)} ${timeStr}  ${costStr.padStart(8)}  ${tokensStr}  ${outcomeColor(outcome.padEnd(14))} ${prevOutcome}`,
        )
      } catch (err) {
        // API error - keep original evaluation but log error
        completed++
        failures++
        const errorMsg = err instanceof Error ? err.message : String(err)
        const prefix = `[${String(completed).padStart(totalStr.length)}/${totalStr}]`
        console.log(
          `${prefix} ${evaluation.difficulty.padEnd(10)} ${chalk.red('ERROR')} ${errorMsg}`,
        )
      }
    }),
  )

  await Promise.all(retryPromises)

  // Close database
  closeDatabase()

  // Summary
  const totalTime = Date.now() - startTime
  console.log()
  console.log(chalk.dim('─'.repeat(50)))
  console.log(chalk.bold('Retry Summary'))
  console.log()
  console.log(`Total Retried: ${completed}`)
  console.log(`New Successes: ${chalk.green(successes)}`)
  console.log(`API Errors: ${chalk.red(failures)}`)
  console.log(`Total Time: ${(totalTime / 1000).toFixed(1)}s`)
  console.log(`Total Cost: ${chalk.cyan(`$${totalCost.toFixed(4)}`)}`)
  console.log()
}

async function runByMazeId(apiKey: string, databasePath: string): Promise<void> {
  // Get maze ID from user
  const mazeId = await input({
    message: 'Enter maze ID:',
    validate: (value) => (value.length > 0 ? true : 'Maze ID is required'),
  })

  // Load the maze
  const mazeResult = loadMazeById(mazeId)
  if (!mazeResult) {
    console.error(chalk.red(`Could not find maze ${mazeId} in any test set`))
    process.exit(1)
  }

  const { maze, testSet } = mazeResult
  console.log()
  console.log(`Found maze in test set: ${chalk.cyan(testSet.name)}`)
  console.log(`Difficulty: ${maze.difficulty}`)
  if (maze.requirementType) {
    console.log(`Constraint: ${maze.requirementType}`)
  }

  // Get all evaluations for this maze
  const evaluations = getEvaluationsByMazeId(databasePath, mazeId)
  if (evaluations.length === 0) {
    console.log(chalk.yellow('\nNo evaluations found for this maze'))
    process.exit(0)
  }

  // Group by model for display
  const modelCounts = new Map<string, number>()
  for (const e of evaluations) {
    modelCounts.set(e.model, (modelCounts.get(e.model) ?? 0) + 1)
  }

  console.log()
  console.log(`Found ${chalk.cyan(evaluations.length)} evaluations to retry:`)
  for (const [model, count] of modelCounts) {
    console.log(`  ${model}: ${count}`)
  }

  // Get concurrency
  const concurrencyStr = await input({
    message: 'Concurrent requests:',
    default: '3',
    validate: (value) => {
      const num = Number.parseInt(value, 10)
      if (Number.isNaN(num) || num < 1) return 'Please enter a positive number'
      return true
    },
  })
  const concurrency = Number.parseInt(concurrencyStr, 10)

  // Confirm
  console.log()
  const confirmed = await confirm({
    message: `Retry ${evaluations.length} evaluations for maze ${mazeId.slice(0, 8)}...?`,
    default: true,
  })

  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'))
    process.exit(0)
  }

  await executeRetry({
    apiKey,
    databasePath,
    evaluations,
    getMaze: () => maze, // All evaluations use the same maze
    concurrency,
  })
}

async function runByOutcome(apiKey: string, databasePath: string): Promise<void> {
  // Get run summaries
  const summaries = getRunSummaries(databasePath)
  if (summaries.length === 0) {
    console.log(chalk.yellow('No evaluation runs found in database.'))
    process.exit(0)
  }

  // Show runs and let user select
  console.log()
  const runChoices = summaries.map((s) => {
    const date = new Date(s.startedAt).toLocaleString()
    const label = `${s.model} - ${s.count} evals - ${date}`
    const detail = `  ${chalk.dim(s.runId.slice(0, 8))} | ${formatOutcomes(s.outcomes)}`
    return {
      name: `${label}\n${detail}`,
      value: s.runId,
    }
  })

  const selectedRunId = await select({
    message: 'Select run to retry:',
    choices: runChoices,
    pageSize: Math.min(runChoices.length * 2, 20),
  })

  const selectedRun = summaries.find((s) => s.runId === selectedRunId)!

  // Show which outcomes can be retried
  const retryableInRun = RETRYABLE_OUTCOMES.filter((o) => selectedRun.outcomes[o])
  if (retryableInRun.length === 0) {
    console.log(chalk.green('\nNo failed evaluations to retry in this run!'))
    process.exit(0)
  }

  console.log()
  const outcomeChoices = retryableInRun.map((outcome) => ({
    name: `${outcome} (${selectedRun.outcomes[outcome]})`,
    value: outcome,
    checked: outcome === 'empty_response' || outcome === 'token_limit',
  }))

  const selectedOutcomes = await checkbox({
    message: 'Select outcomes to retry:',
    choices: outcomeChoices,
    required: true,
  })

  if (selectedOutcomes.length === 0) {
    console.log(chalk.yellow('No outcomes selected.'))
    process.exit(0)
  }

  // Get evaluations to retry
  const evaluationsToRetry = getEvaluationsToRetry(databasePath, selectedRunId, selectedOutcomes)
  console.log()
  console.log(`Found ${chalk.cyan(evaluationsToRetry.length)} evaluations to retry`)

  // Load test set
  const testSet = loadTestSet(selectedRun.testSetId)
  if (!testSet) {
    console.error(chalk.red(`Could not find test set: ${selectedRun.testSetId}`))
    console.error('Make sure the test set JSON file exists in ./test-sets/')
    process.exit(1)
  }

  // Summary before retry
  console.log()
  console.log(chalk.bold('Retry Summary:'))
  console.log(`  Model: ${chalk.cyan(selectedRun.model)}`)
  console.log(`  Formats: ${chalk.dim(selectedRun.promptFormats.join(', '))}`)
  console.log(`  Outcomes: ${selectedOutcomes.join(', ')}`)
  console.log(`  Count: ${evaluationsToRetry.length}`)
  console.log()

  const confirmed = await confirm({
    message: `Retry ${evaluationsToRetry.length} evaluations?`,
    default: true,
  })

  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'))
    process.exit(0)
  }

  await executeRetry({
    apiKey,
    databasePath,
    evaluations: evaluationsToRetry,
    getMaze: (mazeId) => findMaze(testSet, mazeId),
    concurrency: 3,
  })
}

async function run() {
  console.log(chalk.bold('\nLMIQ Retry Evaluations'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  // Check for API key
  const apiKey = process.env.OPENROUTER_API_KEY || ''
  if (!apiKey) {
    console.error(chalk.red('OPENROUTER_API_KEY environment variable not set'))
    process.exit(1)
  }
  console.log(chalk.dim('Using OPENROUTER_API_KEY from environment\n'))

  // Find available databases
  const databases = findDatabases()
  if (databases.length === 0) {
    console.error(chalk.red(`No databases found in ${DB_DIR}/`))
    process.exit(1)
  }

  const databasePath = await select({
    message: 'Select evaluation database:',
    choices: databases.map((d) => ({ name: d, value: d })),
    pageSize: databases.length,
  })

  // Choose retry mode
  const mode = await select({
    message: 'Retry mode:',
    choices: [
      {
        name: 'Retry by maze ID - Re-evaluate all models for a specific maze',
        value: 'maze',
      },
      {
        name: 'Retry by outcome - Re-evaluate failed evaluations in a run',
        value: 'outcome',
      },
    ],
  })

  if (mode === 'maze') {
    await runByMazeId(apiKey, databasePath)
  } else {
    await runByOutcome(apiKey, databasePath)
  }
}

export const retryCommand = new Command('retry')
  .description('Retry failed evaluations from a previous run')
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
