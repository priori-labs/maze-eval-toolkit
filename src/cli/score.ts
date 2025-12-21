/**
 * CLI command for computing LMIQ scores from evaluation results
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { checkbox, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import { DIFFICULTIES, HUMAN_BRAIN_WATTS, LLM_GPU_WATTS, getEffectiveBaseline } from '../core'
import type {
  Difficulty,
  EvaluationResult,
  TestSetFile,
  TestSetHumanBaselines,
} from '../core/types'
import { closeDatabase, initDatabase } from '../db/client'
import { formatDuration } from './utils'

/**
 * Load custom baselines from a test set file by test set ID
 */
function loadTestSetBaselines(testSetId: string): TestSetHumanBaselines | undefined {
  const testSetsDir = './test-sets'
  if (!existsSync(testSetsDir)) return undefined

  const files = readdirSync(testSetsDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    try {
      const content = readFileSync(`${testSetsDir}/${file}`, 'utf-8')
      const testSet = JSON.parse(content) as TestSetFile
      if (testSet.id === testSetId) {
        return testSet.humanBaselines
      }
    } catch {
      // Ignore invalid files
    }
  }
  return undefined
}

interface ScoreOptions {
  databasePath: string
  models?: string[]
  runId?: string
  testSetId?: string
}

interface RunInfo {
  runId: string
  count: number
  startedAt: string
  successes: number
  promptFormats: string[]
}

interface DifficultyScores {
  total: number
  successes: number
  accuracy: number
  avgPathEfficiency: number
  avgTimeEfficiency: number
  avgTimeEfficiencyElite: number
  avgLmiq: number
  avgLmiqElite: number
  avgInferenceTimeMs: number
  totalCost: number
}

interface OverallScores {
  total: number
  successes: number
  accuracy: number
  adjustedAccuracy: number
  avgTimeEfficiency: number
  avgTimeEfficiencyElite: number
  avgLmiq: number
  avgLmiqElite: number
  energyEfficiency: number
  energyEfficiencyElite: number
  totalInferenceTimeMs: number
  totalCost: number
  promptFormats: string[]
  byDifficulty: Record<Difficulty, DifficultyScores>
}

/**
 * Get all evaluations from the database
 */
function getAllEvaluations(dbPath: string): EvaluationResult[] {
  const db = initDatabase(dbPath)
  const query = db.query('SELECT * FROM evaluations')
  const rows = query.all() as any[]
  closeDatabase()

  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    testSetId: row.test_set_id,
    testSetName: row.test_set_name,
    mazeId: row.maze_id,
    model: row.model,
    difficulty: row.difficulty,
    prompt: row.prompt,
    promptFormats: JSON.parse(row.prompt_formats),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    costUsd: row.cost_usd,
    inferenceTimeMs: row.inference_time_ms,
    rawResponse: row.raw_response,
    parsedMoves: row.parsed_moves ? JSON.parse(row.parsed_moves) : null,
    reasoning: row.reasoning,
    outcome: row.outcome,
    movesExecuted: row.moves_executed,
    finalPosition: row.final_position ? JSON.parse(row.final_position) : null,
    solutionLength: row.solution_length,
    shortestPath: row.shortest_path,
    efficiency: row.efficiency,
    isHuman: row.is_human === 1,
  }))
}

/**
 * Get unique models in the database
 */
function getUniqueModels(evaluations: EvaluationResult[]): string[] {
  return [...new Set(evaluations.map((e) => e.model))].sort()
}

/**
 * Get runs for a specific model
 */
function getRunsForModel(evaluations: EvaluationResult[], model: string): RunInfo[] {
  const modelEvals = evaluations.filter((e) => e.model === model)
  const runIds = [...new Set(modelEvals.map((e) => e.runId))]

  return runIds
    .map((runId) => {
      const runEvals = modelEvals.filter((e) => e.runId === runId)
      const successes = runEvals.filter((e) => e.outcome === 'success').length
      const startedAt = runEvals.reduce(
        (min, e) => (e.startedAt < min ? e.startedAt : min),
        runEvals[0]!.startedAt,
      )
      // Collect unique prompt formats for this run
      const formats = new Set<string>()
      for (const e of runEvals) {
        if (e.promptFormats) {
          for (const f of e.promptFormats) {
            formats.add(f)
          }
        }
      }
      return {
        runId,
        count: runEvals.length,
        startedAt,
        successes,
        promptFormats: [...formats],
      }
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)) // Most recent first
}

/**
 * Compute scores for a set of evaluations
 */
function computeScores(
  evaluations: EvaluationResult[],
  customBaselines?: TestSetHumanBaselines,
): OverallScores {
  const byDifficulty: Record<Difficulty, DifficultyScores> = {} as any

  // Initialize per-difficulty scores
  for (const difficulty of DIFFICULTIES) {
    const diffEvals = evaluations.filter((e) => e.difficulty === difficulty)
    if (diffEvals.length === 0) {
      byDifficulty[difficulty] = {
        total: 0,
        successes: 0,
        accuracy: 0,
        avgPathEfficiency: 0,
        avgTimeEfficiency: 0,
        avgTimeEfficiencyElite: 0,
        avgLmiq: 0,
        avgLmiqElite: 0,
        avgInferenceTimeMs: 0,
        totalCost: 0,
      }
      continue
    }

    const successes = diffEvals.filter((e) => e.outcome === 'success')
    const humanBaseline = getEffectiveBaseline(difficulty, customBaselines, false)
    const eliteBaseline = getEffectiveBaseline(difficulty, customBaselines, true)
    const humanTimeMs = humanBaseline.timeSeconds * 1000
    const eliteTimeMs = eliteBaseline.timeSeconds * 1000

    // Path efficiency for successes
    const pathEfficiencies = successes
      .map((e) => e.efficiency)
      .filter((e): e is number => e !== null)
    const avgPathEfficiency =
      pathEfficiencies.length > 0
        ? pathEfficiencies.reduce((a, b) => a + b, 0) / pathEfficiencies.length
        : 0

    // Time efficiency per task (capped at 1.0, 0 if failed) - vs avg human
    const timeEfficiencies = diffEvals.map((e) => {
      if (e.outcome !== 'success') return 0
      return Math.min(humanTimeMs / e.inferenceTimeMs, 1.0)
    })
    const avgTimeEfficiency = timeEfficiencies.reduce((a, b) => a + b, 0) / timeEfficiencies.length

    // Time efficiency per task - vs elite human
    const timeEfficienciesElite = diffEvals.map((e) => {
      if (e.outcome !== 'success') return 0
      return Math.min(eliteTimeMs / e.inferenceTimeMs, 1.0)
    })
    const avgTimeEfficiencyElite =
      timeEfficienciesElite.reduce((a, b) => a + b, 0) / timeEfficienciesElite.length

    // LMIQ score per task: time_efficiency × path_efficiency (0 if failed) - vs avg human
    const lmiqScores = diffEvals.map((e) => {
      if (e.outcome !== 'success') return 0
      const timeEff = Math.min(humanTimeMs / e.inferenceTimeMs, 1.0)
      const pathEff = e.efficiency !== null ? e.efficiency : 0
      return timeEff * pathEff
    })
    const avgLmiq = lmiqScores.reduce((a, b) => a + b, 0) / lmiqScores.length

    // LMIQ score - vs elite human
    const lmiqScoresElite = diffEvals.map((e) => {
      if (e.outcome !== 'success') return 0
      const timeEff = Math.min(eliteTimeMs / e.inferenceTimeMs, 1.0)
      const pathEff = e.efficiency !== null ? e.efficiency : 0
      return timeEff * pathEff
    })
    const avgLmiqElite = lmiqScoresElite.reduce((a, b) => a + b, 0) / lmiqScoresElite.length

    // Inference time and cost
    const totalInferenceTimeMs = diffEvals.reduce((a, e) => a + e.inferenceTimeMs, 0)
    const totalCost = diffEvals.reduce((a, e) => a + (e.costUsd ?? 0), 0)

    byDifficulty[difficulty] = {
      total: diffEvals.length,
      successes: successes.length,
      accuracy: successes.length / diffEvals.length,
      avgPathEfficiency,
      avgTimeEfficiency,
      avgTimeEfficiencyElite,
      avgLmiq,
      avgLmiqElite,
      avgInferenceTimeMs: totalInferenceTimeMs / diffEvals.length,
      totalCost,
    }
  }

  // Overall scores
  const total = evaluations.length
  const successes = evaluations.filter((e) => e.outcome === 'success')
  const accuracy = total > 0 ? successes.length / total : 0

  // Adjusted accuracy = accuracy × avg path efficiency for successes
  const allPathEfficiencies = successes
    .map((e) => e.efficiency)
    .filter((e): e is number => e !== null)
  const avgSuccessPathEfficiency =
    allPathEfficiencies.length > 0
      ? allPathEfficiencies.reduce((a, b) => a + b, 0) / allPathEfficiencies.length
      : 0
  const adjustedAccuracy = accuracy * avgSuccessPathEfficiency

  // Overall time efficiency (0 if failed, capped at 1.0 if success)
  let totalTimeEfficiency = 0
  let totalTimeEfficiencyElite = 0
  let timeEfficiencyCount = 0
  for (const e of evaluations) {
    if (e.outcome === 'success') {
      const humanBaseline = getEffectiveBaseline(e.difficulty, customBaselines, false)
      const eliteBaseline = getEffectiveBaseline(e.difficulty, customBaselines, true)
      const humanTimeMs = humanBaseline.timeSeconds * 1000
      const eliteTimeMs = eliteBaseline.timeSeconds * 1000
      totalTimeEfficiency += Math.min(humanTimeMs / e.inferenceTimeMs, 1.0)
      totalTimeEfficiencyElite += Math.min(eliteTimeMs / e.inferenceTimeMs, 1.0)
    }
    // Failed tasks contribute 0 to time efficiency
    timeEfficiencyCount++
  }
  const avgTimeEfficiency = timeEfficiencyCount > 0 ? totalTimeEfficiency / timeEfficiencyCount : 0
  const avgTimeEfficiencyElite =
    timeEfficiencyCount > 0 ? totalTimeEfficiencyElite / timeEfficiencyCount : 0

  // Overall LMIQ score
  let totalLmiq = 0
  let totalLmiqElite = 0
  for (const e of evaluations) {
    const humanBaseline = getEffectiveBaseline(e.difficulty, customBaselines, false)
    const eliteBaseline = getEffectiveBaseline(e.difficulty, customBaselines, true)
    const humanTimeMs = humanBaseline.timeSeconds * 1000
    const eliteTimeMs = eliteBaseline.timeSeconds * 1000
    const timeEff = Math.min(humanTimeMs / e.inferenceTimeMs, 1.0)
    const timeEffElite = Math.min(eliteTimeMs / e.inferenceTimeMs, 1.0)
    const pathEff = e.outcome === 'success' && e.efficiency !== null ? e.efficiency : 0
    totalLmiq += timeEff * pathEff
    totalLmiqElite += timeEffElite * pathEff
  }
  const avgLmiq = total > 0 ? totalLmiq / total : 0
  const avgLmiqElite = total > 0 ? totalLmiqElite / total : 0

  // Energy efficiency
  // Human: sum of (human_time_seconds × 20 watts) per difficulty
  // LLM: sum of (inference_time_seconds × 350 watts)
  let humanJoules = 0
  let eliteHumanJoules = 0
  let llmJoules = 0
  for (const e of evaluations) {
    const humanBaseline = getEffectiveBaseline(e.difficulty, customBaselines, false)
    const eliteBaseline = getEffectiveBaseline(e.difficulty, customBaselines, true)
    humanJoules += humanBaseline.timeSeconds * HUMAN_BRAIN_WATTS
    eliteHumanJoules += eliteBaseline.timeSeconds * HUMAN_BRAIN_WATTS
    llmJoules += (e.inferenceTimeMs / 1000) * LLM_GPU_WATTS
  }
  const energyEfficiency = llmJoules > 0 ? humanJoules / llmJoules : 0
  const energyEfficiencyElite = llmJoules > 0 ? eliteHumanJoules / llmJoules : 0

  // Total inference time and cost
  const totalInferenceTimeMs = evaluations.reduce((a, e) => a + e.inferenceTimeMs, 0)
  const totalCost = evaluations.reduce((a, e) => a + (e.costUsd ?? 0), 0)

  // Collect unique prompt formats used
  const allFormats = new Set<string>()
  for (const e of evaluations) {
    if (e.promptFormats) {
      for (const f of e.promptFormats) {
        allFormats.add(f)
      }
    }
  }
  const promptFormats = [...allFormats]

  return {
    total,
    successes: successes.length,
    accuracy,
    adjustedAccuracy,
    avgTimeEfficiency,
    avgTimeEfficiencyElite,
    avgLmiq,
    avgLmiqElite,
    energyEfficiency,
    energyEfficiencyElite,
    totalInferenceTimeMs,
    totalCost,
    promptFormats,
    byDifficulty,
  }
}

/**
 * Format percentage
 */
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Print score card
 */
function printScoreCard(
  modelName: string,
  scores: OverallScores,
  customBaselines?: TestSetHumanBaselines,
): void {
  const avgHumanAccuracy =
    DIFFICULTIES.reduce((a, d) => {
      const baseline = getEffectiveBaseline(d, customBaselines, false)
      return a + baseline.accuracy
    }, 0) / DIFFICULTIES.length

  console.log()
  console.log(
    chalk.bold(`LMIQ Score Card - ${modelName}`) +
      chalk.dim(` (maze formats: ${scores.promptFormats.join(', ')})`),
  )
  console.log(chalk.dim('─'.repeat(55)))
  console.log()

  // Basic metrics
  const accColor = scores.accuracy >= avgHumanAccuracy ? chalk.green : chalk.yellow
  console.log(`Accuracy              ${accColor(pct(scores.accuracy))}`)
  console.log(`Adjusted Accuracy     ${chalk.cyan(pct(scores.adjustedAccuracy))}`)

  // Time and Cost
  const aiTimeSeconds = scores.totalInferenceTimeMs / 1000
  console.log(`Time                  ${formatDuration(aiTimeSeconds)}`)
  console.log(`Cost                  $${scores.totalCost.toFixed(2)}`)

  // Comparison table
  console.log()
  console.log(chalk.dim('vs. Human Baselines:'))
  console.log(chalk.dim('                      vs. Avg Human    vs. Elite Human'))
  console.log(chalk.dim('                      ─────────────    ───────────────'))

  // Time Efficiency comparison
  const timeColor = scores.avgTimeEfficiency >= 0.5 ? chalk.green : chalk.yellow
  const timeColorElite = scores.avgTimeEfficiencyElite >= 0.5 ? chalk.green : chalk.yellow
  console.log(
    `Time Efficiency       ${timeColor(pct(scores.avgTimeEfficiency).padEnd(16))} ${timeColorElite(pct(scores.avgTimeEfficiencyElite))}`,
  )

  // LMIQ comparison
  const lmiqColor = scores.avgLmiq >= 0.5 ? chalk.green : chalk.yellow
  const lmiqColorElite = scores.avgLmiqElite >= 0.5 ? chalk.green : chalk.yellow
  console.log(
    `LMIQ Score            ${lmiqColor(pct(scores.avgLmiq).padEnd(16))} ${lmiqColorElite(pct(scores.avgLmiqElite))}`,
  )

  // Energy Efficiency comparison
  const energyColor = scores.energyEfficiency >= 1.0 ? chalk.green : chalk.yellow
  const energyColorElite = scores.energyEfficiencyElite >= 1.0 ? chalk.green : chalk.yellow
  console.log(
    `Energy Efficiency     ${energyColor(pct(scores.energyEfficiency).padEnd(16))} ${energyColorElite(pct(scores.energyEfficiencyElite))}`,
  )

  console.log()
  console.log(chalk.bold('By Difficulty:'))
  console.log(
    chalk.dim('               Accuracy   Time         Efficiency   LMIQ (avg)   LMIQ (elite)'),
  )

  for (const difficulty of DIFFICULTIES) {
    const ds = scores.byDifficulty[difficulty]
    if (ds.total === 0) continue

    const humanRef = getEffectiveBaseline(difficulty, customBaselines, false)
    const accStr = pct(ds.accuracy)
    const totalTimeSeconds = (ds.avgInferenceTimeMs * ds.total) / 1000
    const timeStr = formatDuration(totalTimeSeconds)
    const effStr = pct(ds.avgTimeEfficiency)
    const lmiqStr = pct(ds.avgLmiq)
    const lmiqEliteStr = pct(ds.avgLmiqElite)

    const accColor = ds.accuracy >= humanRef.accuracy ? chalk.green : chalk.red
    const effColor = ds.avgTimeEfficiency >= 0.5 ? chalk.green : chalk.red
    const lmiqColor = ds.avgLmiq >= humanRef.accuracy * 0.8 ? chalk.green : chalk.red
    const lmiqEliteColor = ds.avgLmiqElite >= humanRef.accuracy * 0.8 ? chalk.green : chalk.red

    console.log(
      `  ${difficulty.padEnd(12)} ${accColor(accStr.padEnd(10))} ${timeStr.padEnd(12)} ${effColor(effStr.padEnd(12))} ${lmiqColor(lmiqStr.padEnd(12))} ${lmiqEliteColor(lmiqEliteStr)}`,
    )
  }

  console.log()
  console.log(chalk.dim('─'.repeat(55)))
  console.log(`Total Evaluations: ${scores.total}`)
  console.log()
}

/**
 * Print human evaluation score card
 * Shows metrics that make sense for human performance
 */
function printHumanScoreCard(runName: string, evaluations: EvaluationResult[]): void {
  const total = evaluations.length
  const successes = evaluations.filter((e) => e.outcome === 'success')
  const accuracy = total > 0 ? successes.length / total : 0

  // Path efficiency for successes
  const pathEfficiencies = successes.map((e) => e.efficiency).filter((e): e is number => e !== null)
  const avgPathEfficiency =
    pathEfficiencies.length > 0
      ? pathEfficiencies.reduce((a, b) => a + b, 0) / pathEfficiencies.length
      : 0

  // LMIQ = accuracy × path_efficiency (humans are the time baseline, so time_efficiency = 1.0)
  const avgLmiq = accuracy * avgPathEfficiency

  // Total time spent (sum of all inference times which are human solve times)
  const totalTimeMs = evaluations.reduce((a, e) => a + e.inferenceTimeMs, 0)
  const totalTimeSeconds = totalTimeMs / 1000

  // Energy usage: human brain at 20W
  const energyJoules = totalTimeSeconds * HUMAN_BRAIN_WATTS
  const energyWh = energyJoules / 3600

  // By difficulty breakdown
  const byDifficulty: Record<
    Difficulty,
    { total: number; avgPathEfficiency: number; avgTimeSeconds: number }
  > = {} as any

  for (const difficulty of DIFFICULTIES) {
    const diffEvals = evaluations.filter((e) => e.difficulty === difficulty)
    if (diffEvals.length === 0) {
      byDifficulty[difficulty] = { total: 0, avgPathEfficiency: 0, avgTimeSeconds: 0 }
      continue
    }

    const diffEfficiencies = diffEvals
      .map((e) => e.efficiency)
      .filter((e): e is number => e !== null)
    const diffAvgEfficiency =
      diffEfficiencies.length > 0
        ? diffEfficiencies.reduce((a, b) => a + b, 0) / diffEfficiencies.length
        : 0

    const diffTotalTimeMs = diffEvals.reduce((a, e) => a + e.inferenceTimeMs, 0)
    const diffAvgTimeSeconds = diffTotalTimeMs / 1000 / diffEvals.length

    byDifficulty[difficulty] = {
      total: diffEvals.length,
      avgPathEfficiency: diffAvgEfficiency,
      avgTimeSeconds: diffAvgTimeSeconds,
    }
  }

  console.log()
  console.log(chalk.bold.magenta(`Human Evaluation - ${runName}`))
  console.log(chalk.dim('─'.repeat(55)))
  console.log()

  // Core metrics
  console.log(`Accuracy              ${chalk.green(pct(accuracy))}`)
  console.log(`Path Efficiency       ${chalk.cyan(pct(avgPathEfficiency))}`)
  console.log(`LMIQ Score            ${chalk.yellow(pct(avgLmiq))}`)
  console.log()

  // Time and energy
  console.log(`Total Time            ${chalk.cyan(formatDuration(totalTimeSeconds))}`)
  console.log(
    `Energy Usage          ${chalk.dim(`${energyJoules.toFixed(0)}J (${energyWh.toFixed(2)} Wh @ 20W brain)`)}`,
  )

  console.log()
  console.log(chalk.bold('By Difficulty:'))
  console.log(chalk.dim('               Count    Path Eff    Avg Time'))

  for (const difficulty of DIFFICULTIES) {
    const ds = byDifficulty[difficulty]
    if (ds.total === 0) continue

    const countStr = String(ds.total).padEnd(8)
    const effStr = pct(ds.avgPathEfficiency).padEnd(11)

    // Color based on efficiency
    const effColor =
      ds.avgPathEfficiency >= 0.9
        ? chalk.green
        : ds.avgPathEfficiency >= 0.7
          ? chalk.yellow
          : chalk.red

    console.log(
      `  ${difficulty.padEnd(12)} ${countStr} ${effColor(effStr)} ${formatDuration(ds.avgTimeSeconds)}`,
    )
  }

  console.log()
  console.log(chalk.dim('─'.repeat(55)))
  console.log(`Total Mazes: ${total}`)
  console.log()
}

/**
 * Print summary scores for all models and all runs
 */
function printAllModelsSummary(
  evaluations: EvaluationResult[],
  customBaselines?: TestSetHumanBaselines,
): void {
  const models = getUniqueModels(evaluations)
  const avgHumanAccuracy =
    DIFFICULTIES.reduce((a, d) => {
      const baseline = getEffectiveBaseline(d, customBaselines, false)
      return a + baseline.accuracy
    }, 0) / DIFFICULTIES.length

  console.log()
  console.log(chalk.bold('LMIQ Score Summary'))
  console.log(chalk.dim('─'.repeat(55)))
  console.log()

  for (const model of models) {
    // Get all runs for this model
    const runs = getRunsForModel(evaluations, model)
    if (runs.length === 0) continue

    // Check if this is a human evaluation (use isHuman flag or model prefix as fallback)
    const modelEvals = evaluations.filter((e) => e.model === model)
    const isHumanEval = modelEvals[0]?.isHuman === true || model.startsWith('human/')

    if (isHumanEval) {
      // Print human-specific summary for each run
      for (const run of runs) {
        const runEvals = evaluations.filter((e) => e.runId === run.runId)
        const runName = model.startsWith('human/') ? model.slice(6) : model
        printHumanScoreCard(runName, runEvals)
      }
      continue
    }

    // Model evaluation - use standard scoring
    console.log(chalk.bold(`${model}`))
    console.log(chalk.dim('─'.repeat(55)))

    // Compute scores for all runs and sort by accuracy (highest first)
    const runsWithScores = runs.map((run) => {
      const runEvals = evaluations.filter((e) => e.runId === run.runId)
      return { run, scores: computeScores(runEvals, customBaselines) }
    })
    runsWithScores.sort((a, b) => b.scores.accuracy - a.scores.accuracy)

    // Show each run
    for (const { run, scores } of runsWithScores) {
      // Calculate times
      const aiTimeSeconds = scores.totalInferenceTimeMs / 1000

      const date = new Date(run.startedAt).toLocaleString()
      console.log(chalk.dim(`Run: ${date} | formats: ${scores.promptFormats.join(', ')}`))
      console.log()

      // Basic metrics
      const accColor = scores.accuracy >= avgHumanAccuracy ? chalk.green : chalk.yellow
      console.log(`Accuracy              ${accColor(pct(scores.accuracy))}`)
      console.log(`Adjusted Accuracy     ${chalk.cyan(pct(scores.adjustedAccuracy))}`)
      console.log(`Time                  ${formatDuration(aiTimeSeconds)}`)
      console.log(`Cost                  $${scores.totalCost.toFixed(2)}`)

      // Comparison table
      console.log()
      console.log(chalk.dim('vs. Human Baselines:'))
      console.log(chalk.dim('                      vs. Avg Human    vs. Elite Human'))
      console.log(chalk.dim('                      ─────────────    ───────────────'))

      // Time Efficiency comparison
      const timeColor = scores.avgTimeEfficiency >= 0.5 ? chalk.green : chalk.yellow
      const timeColorElite = scores.avgTimeEfficiencyElite >= 0.5 ? chalk.green : chalk.yellow
      console.log(
        `Time Efficiency       ${timeColor(pct(scores.avgTimeEfficiency).padEnd(16))} ${timeColorElite(pct(scores.avgTimeEfficiencyElite))}`,
      )

      // LMIQ comparison
      const lmiqColor = scores.avgLmiq >= 0.5 ? chalk.green : chalk.yellow
      const lmiqColorElite = scores.avgLmiqElite >= 0.5 ? chalk.green : chalk.yellow
      console.log(
        `LMIQ Score            ${lmiqColor(pct(scores.avgLmiq).padEnd(16))} ${lmiqColorElite(pct(scores.avgLmiqElite))}`,
      )

      // Energy Efficiency comparison
      const energyColor = scores.energyEfficiency >= 1.0 ? chalk.green : chalk.yellow
      const energyColorElite = scores.energyEfficiencyElite >= 1.0 ? chalk.green : chalk.yellow
      console.log(
        `Energy Efficiency     ${energyColor(pct(scores.energyEfficiency).padEnd(16))} ${energyColorElite(pct(scores.energyEfficiencyElite))}`,
      )

      console.log()
    }
  }
}

function findDatabases(): string[] {
  const resultsDir = './results'
  if (!existsSync(resultsDir)) return []
  return readdirSync(resultsDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => `${resultsDir}/${f}`)
}

async function promptForOptions(): Promise<ScoreOptions> {
  console.log(chalk.bold('\nLMIQ Score Calculator'))
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

  // Load evaluations to get available models
  const evaluations = getAllEvaluations(databasePath)
  const models = getUniqueModels(evaluations)

  if (models.length === 0) {
    console.error(chalk.red('No evaluations found in database'))
    process.exit(1)
  }

  // Select models (multi-select)
  let selectedModels: string[] = []
  if (models.length === 1) {
    selectedModels = [models[0]!]
    console.log(chalk.dim(`Using model: ${selectedModels[0]}`))
  } else {
    const SUMMARIZE_ALL = '__summarize_all__'
    const modelChoices = [
      { name: chalk.bold('Summarize All'), value: SUMMARIZE_ALL },
      ...models.map((m) => ({ name: m, value: m })),
    ]
    selectedModels = await checkbox({
      message: 'Select models to score (space to select, enter to confirm):',
      choices: modelChoices,
      pageSize: modelChoices.length,
    })

    // If "Summarize All" selected or none selected, show all
    if (selectedModels.length === 0 || selectedModels.includes(SUMMARIZE_ALL)) {
      return { databasePath, models: undefined, runId: undefined }
    }
  }

  // If multiple models selected, skip run selection
  if (selectedModels.length > 1) {
    return { databasePath, models: selectedModels, runId: undefined }
  }

  // Single model selected - offer run selection
  const model = selectedModels[0]!
  let runId: string | undefined
  const runs = getRunsForModel(evaluations, model)

  if (runs.length === 1) {
    runId = runs[0]!.runId
    console.log(chalk.dim(`Using run: ${runId}`))
  } else {
    const runChoices = runs.map((r) => {
      const date = new Date(r.startedAt).toLocaleString()
      const successRate = ((r.successes / r.count) * 100).toFixed(0)
      const formatsStr = r.promptFormats.length > 0 ? r.promptFormats.join(', ') : 'unknown'
      return {
        name: `${date} - ${r.count} evals, ${successRate}% success, formats: ${formatsStr}\n  ${chalk.dim(r.runId)}`,
        value: r.runId,
      }
    })

    runId = await select({
      message: 'Select evaluation run:',
      choices: runChoices,
      pageSize: Math.min(runChoices.length * 2, 20),
    })
  }

  return { databasePath, models: selectedModels, runId }
}

async function runScoring(options: ScoreOptions): Promise<void> {
  const { databasePath, models, runId, testSetId } = options

  // Load all evaluations
  let evaluations = getAllEvaluations(databasePath)

  // Filter by test set if specified
  if (testSetId) {
    evaluations = evaluations.filter((e) => e.testSetId === testSetId)
  }

  if (evaluations.length === 0) {
    console.log(chalk.red('No evaluations found matching criteria'))
    return
  }

  // Load custom baselines from test set (if evaluations have a consistent testSetId)
  let customBaselines: TestSetHumanBaselines | undefined
  const testSetIds = [...new Set(evaluations.map((e) => e.testSetId))]
  if (testSetIds.length === 1 && testSetIds[0]) {
    customBaselines = loadTestSetBaselines(testSetIds[0])
    if (customBaselines) {
      console.log(chalk.cyan('Using custom human baselines for this test set'))
    }
  }

  // If no models specified, show summary for all models
  if (!models || models.length === 0) {
    printAllModelsSummary(evaluations, customBaselines)
    return
  }

  // Filter by selected models
  evaluations = evaluations.filter((e) => models.includes(e.model))

  // Filter by run ID if specified (only applies to single model)
  if (runId) {
    evaluations = evaluations.filter((e) => e.runId === runId)
  }

  if (evaluations.length === 0) {
    console.log(chalk.red('No evaluations found matching criteria'))
    return
  }

  // If multiple models selected, use summary view
  if (models.length > 1) {
    printAllModelsSummary(evaluations, customBaselines)
    return
  }

  // Single model - show detailed view
  const model = models[0]!

  // Check if this is a human evaluation (use isHuman flag or model prefix as fallback)
  const isHumanEval = evaluations[0]?.isHuman === true || model.startsWith('human/')

  if (isHumanEval) {
    // Extract run name from model (format: "human/{runName}")
    const runName = model.startsWith('human/') ? model.slice(6) : model
    printHumanScoreCard(runName, evaluations)
  } else {
    const scores = computeScores(evaluations, customBaselines)
    printScoreCard(model, scores, customBaselines)
  }
}

export const scoreCommand = new Command('score')
  .description('Compute LMIQ scores from evaluation results')
  .option('-d, --database <path>', 'Evaluation database path')
  .option('-m, --model <model>', 'Filter by model')
  .option('-r, --run-id <id>', 'Filter by run ID')
  .option('-t, --test-set <id>', 'Filter by test set ID')
  .option('-i, --interactive', 'Run in interactive mode (default if no options provided)')
  .action(async (options) => {
    // Determine if we should run interactive mode
    const hasOptions = options.database
    const interactive = options.interactive || !hasOptions

    if (interactive) {
      try {
        const scoreOptions = await promptForOptions()
        await runScoring(scoreOptions)
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
    const databasePath = options.database as string
    const model = options.model as string | undefined
    const models = model ? [model] : undefined
    const runId = options.runId as string | undefined
    const testSetId = options.testSet as string | undefined

    if (!existsSync(databasePath)) {
      console.error(chalk.red(`Database not found: ${databasePath}`))
      process.exit(1)
    }

    await runScoring({ databasePath, models, runId, testSetId })
  })
