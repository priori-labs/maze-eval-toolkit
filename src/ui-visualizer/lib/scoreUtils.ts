/**
 * Score calculation utilities for the visualizer
 */

import {
  ELITE_HUMAN_BASELINE,
  HUMAN_BASELINE,
  HUMAN_BRAIN_WATTS,
  LLM_GPU_WATTS,
  getEffectiveBaseline,
} from '@/core/difficulty'
import type {
  Difficulty,
  EvaluationOutcome,
  EvaluationResult,
  PromptFormat,
  TestSetHumanBaselines,
} from '@/core/types'

// Re-export for consumers that import from here
export { ELITE_HUMAN_BASELINE as ELITE_HUMAN_REFERENCE, HUMAN_BASELINE as HUMAN_REFERENCE }

/**
 * Aggregated scores for a single model
 */
export interface ModelScore {
  model: string
  shortModel: string
  totalEvals: number
  successes: number
  accuracy: number
  avgPathEfficiency: number
  avgTimeEfficiency: number
  avgTimeEfficiencyElite: number
  avgLmiq: number
  avgLmiqElite: number
  avgInferenceTimeMs: number
  totalCost: number
  energyEfficiency: number
  energyEfficiencyElite: number
  outcomes: Record<string, number>
}

/**
 * Scores for a model+format combination
 */
export interface ModelFormatScore {
  model: string
  shortModel: string
  format: PromptFormat
  totalEvals: number
  successes: number
  accuracy: number
  avgPathEfficiency: number
  avgTimeEfficiency: number
  avgLmiq: number
  avgInferenceTimeMs: number
  totalCost: number
  energyEfficiency: number
}

/**
 * Grouped data for charts: one model with all its format scores
 */
export interface ModelWithFormats {
  model: string
  shortModel: string
  formats: ModelFormatScore[] // sorted by accuracy descending
}

/**
 * Human baseline scores (computed from reference values)
 */
export interface HumanBaseline {
  accuracy: number
  timeEfficiency: number
  lmiq: number
  energyEfficiency: number
}

/**
 * Get short model name from full name
 */
export function getShortModelName(fullName: string): string {
  const parts = fullName.split('/')
  return parts[parts.length - 1] || fullName
}

/**
 * Compute scores for a set of evaluations
 */
export function computeModelScores(
  evaluations: EvaluationResult[],
  customBaselines?: TestSetHumanBaselines,
): ModelScore {
  const model = evaluations[0]?.model || 'unknown'
  const total = evaluations.length
  const successes = evaluations.filter((e) => e.outcome === 'success')

  // Path efficiency for successes
  const pathEfficiencies = successes.map((e) => e.efficiency).filter((e): e is number => e !== null)
  const avgPathEfficiency =
    pathEfficiencies.length > 0
      ? pathEfficiencies.reduce((a, b) => a + b, 0) / pathEfficiencies.length
      : 0

  // Time efficiency and LMIQ score per task
  let totalTimeEfficiency = 0
  let totalTimeEfficiencyElite = 0
  let totalLmiq = 0
  let totalLmiqElite = 0
  let totalHumanTimeMs = 0
  let totalHumanTimeMsElite = 0

  for (const e of evaluations) {
    const humanBaseline = getEffectiveBaseline(e.difficulty, customBaselines, false)
    const eliteBaseline = getEffectiveBaseline(e.difficulty, customBaselines, true)
    const humanTimeMs = humanBaseline.timeSeconds * 1000
    const eliteTimeMs = eliteBaseline.timeSeconds * 1000
    totalHumanTimeMs += humanTimeMs
    totalHumanTimeMsElite += eliteTimeMs

    if (e.outcome === 'success') {
      const timeEff = Math.min(humanTimeMs / e.inferenceTimeMs, 1.0)
      const timeEffElite = Math.min(eliteTimeMs / e.inferenceTimeMs, 1.0)
      totalTimeEfficiency += timeEff
      totalTimeEfficiencyElite += timeEffElite

      const pathEff = e.efficiency !== null ? e.efficiency : 0
      totalLmiq += timeEff * pathEff
      totalLmiqElite += timeEffElite * pathEff
    }
    // Failed tasks contribute 0 to time efficiency and LMIQ
  }

  // Inference time and cost
  const totalInferenceTimeMs = evaluations.reduce((a, e) => a + e.inferenceTimeMs, 0)
  const totalCost = evaluations.reduce((a, e) => a + (e.costUsd ?? 0), 0)

  // Energy efficiency: (human energy) / (LLM energy)
  // Human energy = human_time_seconds * HUMAN_BRAIN_WATTS
  // LLM energy = inference_time_seconds * LLM_GPU_WATTS
  const humanEnergyJoules = (totalHumanTimeMs / 1000) * HUMAN_BRAIN_WATTS
  const humanEnergyJoulesElite = (totalHumanTimeMsElite / 1000) * HUMAN_BRAIN_WATTS
  const llmEnergyJoules = (totalInferenceTimeMs / 1000) * LLM_GPU_WATTS
  const energyEfficiency = llmEnergyJoules > 0 ? humanEnergyJoules / llmEnergyJoules : 0
  const energyEfficiencyElite = llmEnergyJoules > 0 ? humanEnergyJoulesElite / llmEnergyJoules : 0

  // Outcome distribution
  const outcomes: Record<string, number> = {}
  for (const e of evaluations) {
    outcomes[e.outcome] = (outcomes[e.outcome] || 0) + 1
  }

  return {
    model,
    shortModel: getShortModelName(model),
    totalEvals: total,
    successes: successes.length,
    accuracy: total > 0 ? successes.length / total : 0,
    avgPathEfficiency,
    avgTimeEfficiency: total > 0 ? totalTimeEfficiency / total : 0,
    avgTimeEfficiencyElite: total > 0 ? totalTimeEfficiencyElite / total : 0,
    avgLmiq: total > 0 ? totalLmiq / total : 0,
    avgLmiqElite: total > 0 ? totalLmiqElite / total : 0,
    avgInferenceTimeMs: total > 0 ? totalInferenceTimeMs / total : 0,
    totalCost,
    energyEfficiency,
    energyEfficiencyElite,
    outcomes,
  }
}

/**
 * Aggregate all results by model
 */
export function aggregateByModel(
  results: EvaluationResult[],
  customBaselines?: TestSetHumanBaselines,
): ModelScore[] {
  const byModel = new Map<string, EvaluationResult[]>()

  for (const result of results) {
    const existing = byModel.get(result.model) || []
    existing.push(result)
    byModel.set(result.model, existing)
  }

  const scores: ModelScore[] = []
  for (const [_, evaluations] of byModel) {
    scores.push(computeModelScores(evaluations, customBaselines))
  }

  // Sort by accuracy descending
  return scores.sort((a, b) => b.accuracy - a.accuracy)
}

/**
 * Get all unique outcomes from results
 */
export function getUniqueOutcomes(results: EvaluationResult[]): EvaluationOutcome[] {
  const outcomes = new Set<EvaluationOutcome>()
  for (const r of results) {
    outcomes.add(r.outcome)
  }
  return [...outcomes]
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * Format time in ms
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Format cost in USD
 */
export function formatCost(usd: number | null): string {
  if (usd === null || usd === 0) return '-'
  return `$${usd.toFixed(4)}`
}

/**
 * Outcome colors for charts
 */
export const OUTCOME_COLORS: Record<string, string> = {
  success: '#22c55e', // green-500
  failure: '#ef4444', // red-500
  invalid_move: '#f97316', // orange-500
  parse_error: '#eab308', // yellow-500
  no_path_found: '#a855f7', // purple-500
  empty_response: '#6b7280', // gray-500
  token_limit: '#06b6d4', // cyan-500
  api_error: '#dc2626', // red-600
  constraint_violated: '#f59e0b', // amber-500
  timeout: '#78716c', // stone-500
}

/**
 * Format colors for charts
 */
export const FORMAT_COLORS: Record<PromptFormat, string> = {
  ascii: '#9ca3af', // gray-400
  block: '#4ade80', // green-400
  adjacency: '#fbbf24', // amber-400
  edges: '#f87171', // red-400
  edges_ascii: '#fb923c', // orange-400
  coordmatrix: '#a78bfa', // violet-400
  matrix2d: '#22d3ee', // cyan-400
  coordtoken: '#c084fc', // purple-400
}

/**
 * Fixed format display order
 */
export const FORMAT_ORDER: PromptFormat[] = [
  'edges_ascii',
  'edges',
  'adjacency',
  'coordtoken',
  'block',
  'ascii',
]

/**
 * Fixed model display order (by prefix matching)
 */
export const MODEL_ORDER_PREFIXES = ['gemini', 'gpt', 'claude', 'grok']

/**
 * Get model sort index based on MODEL_ORDER_PREFIXES
 */
export function getModelSortIndex(shortModel: string): number {
  const lowerModel = shortModel.toLowerCase()
  for (let i = 0; i < MODEL_ORDER_PREFIXES.length; i++) {
    if (lowerModel.includes(MODEL_ORDER_PREFIXES[i]!)) {
      return i
    }
  }
  // Models not matching any prefix go to the end
  return MODEL_ORDER_PREFIXES.length
}

/**
 * Compute scores for a model+format combination
 */
export function computeModelFormatScores(
  evaluations: EvaluationResult[],
  format: PromptFormat,
  elite = false,
  customBaselines?: TestSetHumanBaselines,
): ModelFormatScore {
  const model = evaluations[0]?.model || 'unknown'
  const total = evaluations.length
  const successes = evaluations.filter((e) => e.outcome === 'success')

  // Path efficiency for successes
  const pathEfficiencies = successes.map((e) => e.efficiency).filter((e): e is number => e !== null)
  const avgPathEfficiency =
    pathEfficiencies.length > 0
      ? pathEfficiencies.reduce((a, b) => a + b, 0) / pathEfficiencies.length
      : 0

  // Time efficiency and LMIQ score per task
  let totalTimeEfficiency = 0
  let totalLmiq = 0
  let totalHumanTimeMs = 0

  for (const e of evaluations) {
    const baseline = getEffectiveBaseline(e.difficulty, customBaselines, elite)
    const humanTimeMs = baseline.timeSeconds * 1000
    totalHumanTimeMs += humanTimeMs

    if (e.outcome === 'success') {
      const timeEff = Math.min(humanTimeMs / e.inferenceTimeMs, 1.0)
      totalTimeEfficiency += timeEff

      const pathEff = e.efficiency !== null ? e.efficiency : 0
      totalLmiq += timeEff * pathEff
    }
  }

  // Inference time and cost
  const totalInferenceTimeMs = evaluations.reduce((a, e) => a + e.inferenceTimeMs, 0)
  const totalCost = evaluations.reduce((a, e) => a + (e.costUsd ?? 0), 0)

  // Energy efficiency
  const humanEnergyJoules = (totalHumanTimeMs / 1000) * HUMAN_BRAIN_WATTS
  const llmEnergyJoules = (totalInferenceTimeMs / 1000) * LLM_GPU_WATTS
  const energyEfficiency = llmEnergyJoules > 0 ? humanEnergyJoules / llmEnergyJoules : 0

  // Calculate accuracy
  const accuracy = total > 0 ? successes.length / total : 0

  // Time efficiency averaged only over successful attempts
  const avgTimeEfficiency = successes.length > 0 ? totalTimeEfficiency / successes.length : 0

  // LMIQ = time_eff * path_eff * accuracy
  const avgLmiq = successes.length > 0 ? (totalLmiq / successes.length) * accuracy : 0

  return {
    model,
    shortModel: getShortModelName(model),
    format,
    totalEvals: total,
    successes: successes.length,
    accuracy,
    avgPathEfficiency,
    avgTimeEfficiency,
    avgLmiq,
    avgInferenceTimeMs: total > 0 ? totalInferenceTimeMs / total : 0,
    totalCost,
    energyEfficiency,
  }
}

/**
 * Determine the effective format from a promptFormats array
 * Handles combined formats like ["ascii", "edges"] -> "edges_ascii"
 */
function getEffectiveFormat(promptFormats: PromptFormat[]): PromptFormat | null {
  if (!promptFormats || promptFormats.length === 0) return null

  // Check for combined edges + ascii format (either order)
  if (promptFormats.length === 2) {
    const hasEdges = promptFormats.includes('edges')
    const hasAscii = promptFormats.includes('ascii')
    if (hasEdges && hasAscii) {
      return 'edges_ascii'
    }
  }

  // Single format or unrecognized combo - use first
  return promptFormats[0] ?? null
}

/**
 * Aggregate results by model and format
 */
export function aggregateByModelAndFormat(
  results: EvaluationResult[],
  elite = false,
  customBaselines?: TestSetHumanBaselines,
): ModelWithFormats[] {
  // Group by model, then by format
  const byModelFormat = new Map<string, Map<PromptFormat, EvaluationResult[]>>()

  for (const result of results) {
    // Get the effective format (handles combined formats)
    const format = getEffectiveFormat(result.promptFormats)
    if (!format) continue

    if (!byModelFormat.has(result.model)) {
      byModelFormat.set(result.model, new Map())
    }
    const formatMap = byModelFormat.get(result.model)!
    if (!formatMap.has(format)) {
      formatMap.set(format, [])
    }
    formatMap.get(format)!.push(result)
  }

  const modelResults: ModelWithFormats[] = []

  for (const [model, formatMap] of byModelFormat) {
    const formats: ModelFormatScore[] = []
    for (const [format, evals] of formatMap) {
      formats.push(computeModelFormatScores(evals, format, elite, customBaselines))
    }
    // Sort formats by fixed order
    formats.sort((a, b) => {
      const orderA = FORMAT_ORDER.indexOf(a.format)
      const orderB = FORMAT_ORDER.indexOf(b.format)
      // Formats not in FORMAT_ORDER go to the end
      const idxA = orderA === -1 ? FORMAT_ORDER.length : orderA
      const idxB = orderB === -1 ? FORMAT_ORDER.length : orderB
      return idxA - idxB
    })

    modelResults.push({
      model,
      shortModel: getShortModelName(model),
      formats,
    })
  }

  // Sort models by fixed order (google, gpt, claude, grok)
  return modelResults.sort((a, b) => {
    return getModelSortIndex(a.shortModel) - getModelSortIndex(b.shortModel)
  })
}

/**
 * Compute human baseline scores based on reference values
 * Human by definition has 100% time efficiency and path efficiency
 */
export function computeHumanBaseline(
  results: EvaluationResult[],
  elite = false,
  customBaselines?: TestSetHumanBaselines,
): HumanBaseline {
  // Weighted average of human accuracy by difficulty distribution in results
  const difficultyCount: Record<Difficulty, number> = {
    simple: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    nightmare: 0,
    horror: 0,
  }

  for (const r of results) {
    difficultyCount[r.difficulty]++
  }

  const total = results.length
  if (total === 0) {
    return { accuracy: 1.0, timeEfficiency: 1.0, lmiq: 1.0, energyEfficiency: 1.0 }
  }

  let weightedAccuracy = 0
  for (const diff of Object.keys(difficultyCount) as Difficulty[]) {
    const count = difficultyCount[diff]
    if (count > 0) {
      const baseline = getEffectiveBaseline(diff, customBaselines, elite)
      weightedAccuracy += (count / total) * baseline.accuracy
    }
  }

  // Human time efficiency = 1.0 (by definition, human is the reference)
  // Human path efficiency = 1.0 (assume optimal)
  // Human LMIQ = time_eff * path_eff * accuracy = 1 * 1 * accuracy
  // Human energy efficiency = 1.0 (reference point)

  return {
    accuracy: weightedAccuracy,
    timeEfficiency: 1.0,
    lmiq: weightedAccuracy,
    energyEfficiency: 1.0,
  }
}

/**
 * Find best model for a given metric
 */
export function findBestModel(
  modelFormats: ModelWithFormats[],
  metric: 'accuracy' | 'lmiq' | 'timeEfficiency' | 'energyEfficiency',
): { model: string; shortModel: string; format: PromptFormat; value: number } | null {
  let best: { model: string; shortModel: string; format: PromptFormat; value: number } | null = null

  for (const m of modelFormats) {
    for (const f of m.formats) {
      let value: number
      switch (metric) {
        case 'accuracy':
          value = f.accuracy
          break
        case 'lmiq':
          value = f.avgLmiq
          break
        case 'timeEfficiency':
          value = f.avgTimeEfficiency
          break
        case 'energyEfficiency':
          value = f.energyEfficiency
          break
      }
      if (!best || value > best.value) {
        best = { model: m.model, shortModel: m.shortModel, format: f.format, value }
      }
    }
  }

  return best
}
