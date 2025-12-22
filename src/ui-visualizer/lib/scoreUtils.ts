/**
 * Score calculation utilities for the visualizer
 */

import { ELITE_HUMAN_BASELINE, HUMAN_BASELINE, getEffectiveBaseline } from '@/core/difficulty'
import { getEffectivePromptFormat } from '@/core/prompt-format'
import { computeScores as computeCoreScores } from '@/core/scoring'
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
 * Uses centralized scoring utilities from @/core/scoring
 */
export function computeModelScores(
  evaluations: EvaluationResult[],
  customBaselines?: TestSetHumanBaselines,
): ModelScore {
  const model = evaluations[0]?.model || 'unknown'

  // Use centralized scoring
  const scores = computeCoreScores(evaluations, customBaselines)

  // Outcome distribution
  const outcomes: Record<string, number> = {}
  for (const e of evaluations) {
    outcomes[e.outcome] = (outcomes[e.outcome] || 0) + 1
  }

  return {
    model,
    shortModel: getShortModelName(model),
    totalEvals: scores.total,
    successes: scores.successes,
    accuracy: scores.accuracy,
    avgPathEfficiency: scores.avgPathEfficiency,
    avgTimeEfficiency: scores.avgTimeEfficiency,
    avgTimeEfficiencyElite: scores.avgTimeEfficiencyElite,
    avgLmiq: scores.avgLmiq,
    avgLmiqElite: scores.avgLmiqElite,
    avgInferenceTimeMs: scores.total > 0 ? scores.totalInferenceTimeMs / scores.total : 0,
    totalCost: scores.totalCost,
    energyEfficiency: scores.energyEfficiency,
    energyEfficiencyElite: scores.energyEfficiencyElite,
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
  ascii_block: '#38bdf8', // sky-400
  coordmatrix: '#a78bfa', // violet-400
  matrix2d: '#22d3ee', // cyan-400
  coordtoken: '#c084fc', // purple-400
  blockgrid: '#f59e0b', // amber-500
}

/**
 * Fixed format display order
 */
export const FORMAT_ORDER: PromptFormat[] = [
  'edges_ascii',
  'ascii_block',
  'edges',
  'adjacency',
  'coordtoken',
  'blockgrid',
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
 * Uses centralized scoring utilities from @/core/scoring
 */
export function computeModelFormatScores(
  evaluations: EvaluationResult[],
  format: PromptFormat,
  elite = false,
  customBaselines?: TestSetHumanBaselines,
): ModelFormatScore {
  const model = evaluations[0]?.model || 'unknown'

  // Use centralized scoring
  const scores = computeCoreScores(evaluations, customBaselines)

  // Select avg or elite based on parameter
  const avgTimeEfficiency = elite ? scores.avgTimeEfficiencyElite : scores.avgTimeEfficiency
  const avgLmiq = elite ? scores.avgLmiqElite : scores.avgLmiq
  const energyEfficiency = elite ? scores.energyEfficiencyElite : scores.energyEfficiency

  return {
    model,
    shortModel: getShortModelName(model),
    format,
    totalEvals: scores.total,
    successes: scores.successes,
    accuracy: scores.accuracy,
    avgPathEfficiency: scores.avgPathEfficiency,
    avgTimeEfficiency,
    avgLmiq,
    avgInferenceTimeMs: scores.total > 0 ? scores.totalInferenceTimeMs / scores.total : 0,
    totalCost: scores.totalCost,
    energyEfficiency,
  }
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
    const format = getEffectivePromptFormat(result.promptFormats)
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
