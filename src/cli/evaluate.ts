/**
 * CLI command for running model evaluations
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { checkbox, confirm, input, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import pLimit from 'p-limit'
import { v4 as uuidv4 } from 'uuid'
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
import { DIFFICULTIES, PROMPT_FORMATS } from '../core/types'
import { closeDatabase, initDatabase } from '../db/client'
import { createEvaluationResult, insertEvaluation } from '../db/queries'
import { createClient, evaluateMaze } from '../llm/openrouter'

interface EvaluateOptions {
  testSetPath: string
  model: string
  formats: PromptFormat[]
  concurrency: number
  outputPath: string
  limit: number | null
  apiKey: string
}

// Common models for quick selection
const COMMON_MODELS = [
  { name: 'Gemini 3 Pro Preview', value: 'google/gemini-3-pro-preview' },
  { name: 'GPT-5.2', value: 'openai/gpt-5.2' },
  { name: 'GPT-4o', value: 'openai/gpt-4o' },
  { name: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
  { name: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
  { name: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' },
  { name: 'Grok 4.1 Fast', value: 'x-ai/grok-4.1-fast' },
  { name: 'Kimi K2 Thinking', value: 'moonshotai/kimi-k2-thinking' },
  { name: 'Deepseek 3.2', value: 'deepseek/deepseek-v3.2' },
]

function findTestSets(): string[] {
  const dataDir = './data'
  if (!existsSync(dataDir)) return []
  return readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${dataDir}/${f}`)
}

async function promptForOptions(): Promise<EvaluateOptions> {
  console.log(chalk.bold('\nLMIQ Model Evaluation'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  // Check for API key
  let apiKey = process.env.OPENROUTER_API_KEY || ''
  if (!apiKey) {
    apiKey = await input({
      message: 'OpenRouter API key:',
      validate: (value) => (value.length > 0 ? true : 'API key is required'),
    })
  } else {
    console.log(chalk.dim('Using OPENROUTER_API_KEY from environment\n'))
  }

  // Find available test sets
  const testSets = findTestSets()
  if (testSets.length === 0) {
    console.error(chalk.red('No test sets found in ./data/'))
    console.error('Run `task generate` to create one')
    process.exit(1)
  }

  const testSetPath = await select({
    message: 'Select test set:',
    choices: testSets.map((t) => ({ name: t, value: t })),
    pageSize: testSets.length,
  })

  // Model selection
  const modelChoice = await select({
    message: 'Select model:',
    choices: COMMON_MODELS,
    pageSize: COMMON_MODELS.length,
  })

  let model: string
  if (modelChoice === '__custom__') {
    model = await input({
      message: 'Enter OpenRouter model ID:',
      validate: (value) => (value.length > 0 ? true : 'Model ID is required'),
    })
  } else {
    model = modelChoice
  }

  // Format selection
  const formats = (await checkbox({
    message: 'Select prompt formats:',
    choices: PROMPT_FORMATS.map((f) => ({
      name: f,
      value: f,
      checked: f === 'ascii' || f === 'adjacency',
    })),
    required: true,
  })) as PromptFormat[]

  // Concurrency
  const concurrencyStr = await input({
    message: 'Concurrent requests:',
    default: '5',
    validate: (value) => {
      const num = Number.parseInt(value, 10)
      if (Number.isNaN(num) || num < 1) return 'Please enter a positive number'
      return true
    },
  })
  const concurrency = Number.parseInt(concurrencyStr, 10)

  // Output path
  const outputPath = await input({
    message: 'Output database path:',
    default: './results/eval.db',
  })

  // Load test set to show summary
  const content = readFileSync(testSetPath, 'utf-8')
  const testSet = JSON.parse(content) as TestSetFile

  console.log()
  console.log(chalk.dim('─'.repeat(50)))
  console.log(chalk.bold('Evaluation Summary:'))
  console.log(`  Test Set: ${testSet.name} (${testSet.summary.totalMazes} mazes)`)
  console.log(`  Model: ${model}`)
  console.log(`  Formats: ${formats.join(', ')}`)
  console.log(`  Concurrency: ${concurrency}`)
  console.log(`  Output: ${outputPath}`)
  console.log()

  const confirmed = await confirm({
    message: 'Start evaluation?',
    default: true,
  })

  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'))
    process.exit(0)
  }

  return {
    testSetPath,
    model,
    formats,
    concurrency,
    outputPath,
    limit: null,
    apiKey,
  }
}

async function runEvaluation(options: EvaluateOptions) {
  const { testSetPath, model, formats, concurrency, outputPath, limit: limitArg, apiKey } = options

  // Load test set
  console.log('\nLoading test set...')
  let testSet: TestSetFile
  try {
    const content = readFileSync(testSetPath, 'utf-8')
    testSet = JSON.parse(content) as TestSetFile
  } catch (err) {
    console.error(chalk.red(`Failed to load test set: ${err}`))
    process.exit(1)
  }

  console.log(`Test Set: ${testSet.name}`)
  console.log(`Total Mazes: ${testSet.summary.totalMazes}`)
  console.log()

  // Collect all mazes to evaluate
  const mazesToEvaluate: Array<{
    maze: MazeWithPrompts
    difficulty: Difficulty
  }> = []
  for (const difficulty of DIFFICULTIES) {
    const mazes = testSet.mazes[difficulty]
    if (mazes && mazes.length > 0) {
      for (const maze of mazes) {
        mazesToEvaluate.push({ maze, difficulty })
      }
    }
  }

  // Apply limit if specified
  const evaluationList = limitArg ? mazesToEvaluate.slice(0, limitArg) : mazesToEvaluate

  console.log(`Mazes to evaluate: ${evaluationList.length}`)
  console.log()

  // Initialize database
  const db = initDatabase(outputPath)

  // Generate unique run ID for this evaluation batch
  const runId = uuidv4()
  console.log(`Run ID: ${chalk.cyan(runId)}`)
  console.log()

  // Setup log file
  const logDir = './debug'
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  const logPath = `${logDir}/eval-${runId}.log`
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
  const ansiRegex = /\x1b\[[0-9;]*m/g
  const log = (msg: string) => {
    console.log(msg)
    // Strip ANSI color codes for file output
    const plainMsg = msg.replace(ansiRegex, '')
    appendFileSync(logPath, `${plainMsg}\n`)
  }

  // Log header
  log('LMIQ Evaluation Log')
  log(`Run ID: ${runId}`)
  log(`Model: ${model}`)
  log(`Formats: ${formats.join(', ')}`)
  log(`Started: ${new Date().toISOString()}`)
  log('─'.repeat(50))

  // Create OpenRouter client
  const client = createClient(apiKey)

  // Setup concurrency limiter
  const limit = pLimit(concurrency)

  // Track progress
  let completed = 0
  let successes = 0
  let failures = 0
  let parseErrors = 0
  let emptyResponses = 0
  let tokenLimits = 0
  let apiErrors = 0
  let constraintViolations = 0
  let totalCost = 0
  const startTime = Date.now()

  // Evaluate each maze
  const total = evaluationList.length
  const totalStr = String(total)
  const evaluationPromises = evaluationList.map(({ maze, difficulty }) =>
    limit(async () => {
      // Generate prompt with selected formats
      const prompt = generatePrompt(maze, formats, maze.specialInstructions)

      const startedAt = new Date().toISOString()
      let result: EvaluationResult

      try {
        // Call OpenRouter
        const response = await evaluateMaze(client, model, prompt)
        const completedAt = new Date().toISOString()

        // Determine outcome
        let outcome: EvaluationOutcome
        let validation = null

        if (!response.rawResponse || response.rawResponse.trim() === '') {
          // Model returned empty content
          if (response.finishReason === 'length') {
            // Hit token limit while reasoning
            outcome = 'token_limit'
            tokenLimits++
          } else {
            outcome = 'empty_response'
            emptyResponses++
          }
        } else if (response.parseError || !response.parsedMoves) {
          outcome = 'parse_error'
          parseErrors++
        } else {
          // Validate the solution with constraint checking
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
            failures++
          } else if (validation.reachesGoal) {
            // Check constraint satisfaction
            if (validation.constraintsSatisfied === false) {
              outcome = 'constraint_violated'
              constraintViolations++
            } else {
              outcome = 'success'
              successes++
            }
          } else {
            outcome = 'failure'
            failures++
          }
        }

        result = createEvaluationResult({
          runId,
          testSetId: testSet.id,
          mazeId: maze.id,
          model,
          difficulty,
          prompt,
          promptFormats: formats,
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
          shortestPath: maze.shortestPath,
          efficiency: validation?.efficiency ?? null,
        })

        // Track cost
        if (response.stats.costUsd !== null) {
          totalCost += response.stats.costUsd
        }

        // Insert into database and increment counter
        insertEvaluation(db, result)
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
        const stepsStr = response.parsedMoves
          ? `${response.parsedMoves.length} steps (shortest = ${maze.shortestPath})`
          : '-'
        log(
          `${prefix} ${difficulty.padEnd(10)} ${timeStr}  ${costStr.padStart(
            8,
          )}  ${tokensStr}  ${outcomeColor(outcome.padEnd(12))} ${stepsStr}`,
        )
      } catch (err) {
        // API error
        const completedAt = new Date().toISOString()
        const errorMsg = err instanceof Error ? err.message : String(err)

        result = createEvaluationResult({
          runId,
          testSetId: testSet.id,
          mazeId: maze.id,
          model,
          difficulty,
          prompt,
          promptFormats: formats,
          startedAt,
          completedAt,
          inputTokens: null,
          outputTokens: null,
          reasoningTokens: null,
          costUsd: null,
          inferenceTimeMs: Date.now() - new Date(startedAt).getTime(),
          rawResponse: errorMsg,
          parsedMoves: null,
          reasoning: null,
          outcome: 'api_error',
          movesExecuted: null,
          finalPosition: null,
          solutionLength: null,
          shortestPath: maze.shortestPath,
          efficiency: null,
        })

        apiErrors++

        // Insert into database and increment counter
        insertEvaluation(db, result)
        completed++

        // Log error
        const prefix = `[${String(completed).padStart(totalStr.length)}/${totalStr}]`
        const errTimeStr = `${((Date.now() - new Date(startedAt).getTime()) / 1000).toFixed(
          1,
        )}s`.padStart(7)
        log(
          `${prefix} ${difficulty.padEnd(10)} ${errTimeStr}  ${'-'.padStart(
            8,
          )}  ${'-'.padStart(12)}  ${chalk.red('api_error'.padEnd(12))} ${errorMsg}`,
        )
      }

      return result
    }),
  )

  // Wait for all evaluations
  await Promise.all(evaluationPromises)

  // Close database
  closeDatabase()

  // Print summary
  const totalTime = Date.now() - startTime
  log('')
  log(chalk.dim('─'.repeat(50)))
  log(chalk.bold('Summary'))
  log(`Model: ${chalk.cyan(model)}`)
  log(`Maze Formats: ${chalk.dim(formats.join(', '))}`)
  log('')
  log(`Total: ${completed}`)
  log(`Successes: ${chalk.green(successes)} (${((successes / completed) * 100).toFixed(1)}%)`)
  log(`Failures: ${chalk.red(failures)}`)
  log(`Constraint Violations: ${chalk.yellow(constraintViolations)}`)
  log(`Parse Errors: ${chalk.yellow(parseErrors)}`)
  log(`Empty Responses: ${chalk.yellow(emptyResponses)}`)
  log(`Token Limits: ${chalk.yellow(tokenLimits)}`)
  log(`API Errors: ${chalk.red(apiErrors)}`)
  log(`Total Time: ${(totalTime / 1000).toFixed(1)}s`)
  log(`Total Cost: ${chalk.cyan(`$${totalCost.toFixed(4)}`)}`)
  log('')
  log(`Results saved to: ${chalk.cyan(outputPath)}`)
  log(`Log saved to: ${chalk.cyan(logPath)}`)
}

export const evaluateCommand = new Command('evaluate')
  .description('Run model evaluation on a test set')
  .option('-t, --test-set <path>', 'Path to test set JSON file')
  .option('-m, --model <model>', 'OpenRouter model identifier')
  .option('-c, --concurrency <number>', 'Concurrent requests')
  .option('-o, --output <path>', 'SQLite database path')
  .option('-f, --formats <list>', 'Comma-separated prompt formats')
  .option('-k, --api-key <key>', 'OpenRouter API key (or set OPENROUTER_API_KEY)')
  .option('--dry-run', 'Parse test set without making API calls')
  .option('--limit <number>', 'Limit number of mazes to evaluate')
  .option('-i, --interactive', 'Run in interactive mode (default if no options provided)')
  .action(async (options) => {
    // Determine if we should run interactive mode
    const hasOptions = options.testSet || options.model
    const interactive = options.interactive || !hasOptions

    if (interactive && !options.dryRun) {
      try {
        const evalOptions = await promptForOptions()
        await runEvaluation(evalOptions)
      } catch (err) {
        if (err instanceof ExitPromptError) {
          console.log(chalk.yellow('\nCancelled'))
          process.exit(0)
        }
        throw err
      }
      return
    }

    // Non-interactive mode
    const testSetPath = options.testSet as string
    const model = options.model as string
    const concurrency = options.concurrency ? Number.parseInt(options.concurrency, 10) : 5
    const outputPath = (options.output as string) || './results/eval.db'
    const formatsStr = (options.formats as string) || 'ascii,adjacency'
    const apiKey = (options.apiKey as string) || process.env.OPENROUTER_API_KEY
    const dryRun = options.dryRun as boolean
    const limitArg = options.limit ? Number.parseInt(options.limit, 10) : null

    // Validate required options in non-interactive mode
    if (!testSetPath) {
      console.error(chalk.red('Test set path required. Use -t or --test-set'))
      process.exit(1)
    }
    if (!model) {
      console.error(chalk.red('Model required. Use -m or --model'))
      process.exit(1)
    }

    // Parse and validate formats
    const formats = formatsStr.split(',').map((f) => f.trim()) as PromptFormat[]
    for (const f of formats) {
      if (!PROMPT_FORMATS.includes(f)) {
        console.error(chalk.red(`Invalid format: ${f}`))
        console.error(`Valid formats: ${PROMPT_FORMATS.join(', ')}`)
        process.exit(1)
      }
    }

    // Validate API key
    if (!dryRun && !apiKey) {
      console.error(chalk.red('API key required. Set OPENROUTER_API_KEY or use --api-key'))
      process.exit(1)
    }

    console.log(chalk.bold('LMIQ Model Evaluation'))
    console.log(chalk.dim('─'.repeat(50)))
    console.log(`Model: ${chalk.cyan(model)}`)
    console.log(`Test Set: ${testSetPath}`)
    console.log(`Formats: ${formats.join(', ')}`)
    console.log(`Concurrency: ${concurrency}`)
    console.log(`Output: ${outputPath}`)
    if (dryRun) console.log(chalk.yellow('DRY RUN - No API calls will be made'))
    console.log()

    if (dryRun) {
      // Load and show dry run info
      const content = readFileSync(testSetPath, 'utf-8')
      const testSet = JSON.parse(content) as TestSetFile
      const mazesToEvaluate: Array<{ difficulty: Difficulty }> = []
      for (const difficulty of DIFFICULTIES) {
        const mazes = testSet.mazes[difficulty]
        if (mazes && mazes.length > 0) {
          for (let i = 0; i < mazes.length; i++) {
            mazesToEvaluate.push({ difficulty })
          }
        }
      }
      const evaluationList = limitArg ? mazesToEvaluate.slice(0, limitArg) : mazesToEvaluate

      console.log(chalk.yellow('Dry run complete. Would evaluate:'))
      for (const difficulty of DIFFICULTIES) {
        const count = evaluationList.filter((m) => m.difficulty === difficulty).length
        if (count > 0) {
          console.log(`  ${difficulty}: ${count}`)
        }
      }
      return
    }

    await runEvaluation({
      testSetPath,
      model,
      formats,
      concurrency,
      outputPath,
      limit: limitArg,
      apiKey: apiKey!,
    })
  })
