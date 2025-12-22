/**
 * Tests for LMIQ scoring calculations
 */

import { describe, expect, test } from 'bun:test'
import { HUMAN_BASELINE, HUMAN_BRAIN_WATTS, LLM_GPU_WATTS } from '../difficulty'
import {
  type ScoringEvaluation,
  computeHumanEnergy,
  computeLlmEnergy,
  computeLmiq,
  computeScores,
  computeScoresByDifficulty,
  computeTimeEfficiency,
} from '../scoring'

// Helper to create a mock evaluation
function createEval(overrides: Partial<ScoringEvaluation> = {}): ScoringEvaluation {
  return {
    difficulty: 'medium',
    outcome: 'success',
    inferenceTimeMs: 15000, // 15 seconds
    efficiency: 1.0, // Perfect path efficiency
    costUsd: 0.01,
    ...overrides,
  }
}

describe('computeTimeEfficiency', () => {
  test('returns 0 for failed evaluations', () => {
    const eval_ = createEval({ outcome: 'failure' })
    expect(computeTimeEfficiency(eval_, undefined, false)).toBe(0)
  })

  test('calculates correct efficiency when LLM is faster than human', () => {
    // Medium baseline is 30 seconds = 30000ms
    // LLM takes 15000ms, so timeEff = 30000/15000 = 2.0, capped at 1.0
    const eval_ = createEval({ inferenceTimeMs: 15000 })
    expect(computeTimeEfficiency(eval_, undefined, false)).toBe(1.0)
  })

  test('calculates correct efficiency when LLM is slower than human', () => {
    // Medium baseline is 30 seconds = 30000ms
    // LLM takes 60000ms, so timeEff = 30000/60000 = 0.5
    const eval_ = createEval({ inferenceTimeMs: 60000 })
    expect(computeTimeEfficiency(eval_, undefined, false)).toBe(0.5)
  })

  test('uses elite baseline when requested', () => {
    // Elite medium baseline is 15 seconds = 15000ms
    // LLM takes 30000ms, so timeEff = 15000/30000 = 0.5
    const eval_ = createEval({ inferenceTimeMs: 30000 })
    expect(computeTimeEfficiency(eval_, undefined, true)).toBe(0.5)
  })

  test('uses custom baselines when provided', () => {
    const eval_ = createEval({ inferenceTimeMs: 10000 })
    const customBaselines = {
      average: { timeSeconds: 20, accuracy: 0.95 },
    }
    // 20000ms / 10000ms = 2.0, capped at 1.0
    expect(computeTimeEfficiency(eval_, customBaselines, false)).toBe(1.0)
  })
})

describe('computeLmiq', () => {
  test('returns 0 for failed evaluations', () => {
    const eval_ = createEval({ outcome: 'failure' })
    expect(computeLmiq(eval_, undefined, false)).toBe(0)
  })

  test('calculates LMIQ as timeEfficiency * pathEfficiency', () => {
    // Fast enough for time efficiency = 1.0
    // Path efficiency = 0.8
    const eval_ = createEval({ inferenceTimeMs: 1000, efficiency: 0.8 })
    expect(computeLmiq(eval_, undefined, false)).toBe(0.8) // 1.0 * 0.8
  })

  test('caps path efficiency at 1.0', () => {
    // Legacy data might have efficiency > 1.0
    const eval_ = createEval({ inferenceTimeMs: 1000, efficiency: 1.5 })
    expect(computeLmiq(eval_, undefined, false)).toBe(1.0) // 1.0 * 1.0
  })

  test('handles null efficiency as 0', () => {
    const eval_ = createEval({ inferenceTimeMs: 1000, efficiency: null })
    expect(computeLmiq(eval_, undefined, false)).toBe(0)
  })
})

describe('computeHumanEnergy', () => {
  test('calculates human energy correctly', () => {
    const eval_ = createEval({ difficulty: 'medium' })
    // Medium: 30 seconds * 20 watts = 600 joules
    expect(computeHumanEnergy(eval_, undefined, false)).toBe(
      HUMAN_BASELINE.medium.timeSeconds * HUMAN_BRAIN_WATTS,
    )
  })
})

describe('computeLlmEnergy', () => {
  test('calculates LLM energy correctly', () => {
    const eval_ = createEval({ inferenceTimeMs: 10000 }) // 10 seconds
    // 10 seconds * 2000 watts = 20000 joules
    expect(computeLlmEnergy(eval_)).toBe(10 * LLM_GPU_WATTS)
  })
})

describe('computeScores', () => {
  test('returns zeros for empty evaluations', () => {
    const scores = computeScores([])

    expect(scores.total).toBe(0)
    expect(scores.successes).toBe(0)
    expect(scores.accuracy).toBe(0)
    expect(scores.avgLmiq).toBe(0)
  })

  test('calculates accuracy correctly', () => {
    const evals = [
      createEval({ outcome: 'success' }),
      createEval({ outcome: 'success' }),
      createEval({ outcome: 'failure' }),
      createEval({ outcome: 'failure' }),
    ]

    const scores = computeScores(evals)
    expect(scores.accuracy).toBe(0.5) // 2/4
    expect(scores.successes).toBe(2)
    expect(scores.total).toBe(4)
  })

  test('averages path efficiency over successes only', () => {
    const evals = [
      createEval({ outcome: 'success', efficiency: 1.0 }),
      createEval({ outcome: 'success', efficiency: 0.5 }),
      createEval({ outcome: 'failure', efficiency: null }),
    ]

    const scores = computeScores(evals)
    expect(scores.avgPathEfficiency).toBe(0.75) // (1.0 + 0.5) / 2
  })

  test('averages LMIQ over total (failures = 0)', () => {
    const evals = [
      createEval({ outcome: 'success', inferenceTimeMs: 1000, efficiency: 1.0 }),
      createEval({ outcome: 'failure', inferenceTimeMs: 1000, efficiency: null }),
    ]

    const scores = computeScores(evals)
    // One success with LMIQ=1.0, one failure with LMIQ=0, divided by 2
    expect(scores.avgLmiq).toBe(0.5)
  })

  test('sums total inference time and cost', () => {
    const evals = [
      createEval({ inferenceTimeMs: 5000, costUsd: 0.01 }),
      createEval({ inferenceTimeMs: 10000, costUsd: 0.02 }),
    ]

    const scores = computeScores(evals)
    expect(scores.totalInferenceTimeMs).toBe(15000)
    expect(scores.totalCost).toBe(0.03)
  })

  test('calculates energy efficiency correctly', () => {
    const evals = [createEval({ difficulty: 'medium', inferenceTimeMs: 30000 })]

    const scores = computeScores(evals)
    // Human: 30s * 20W = 600J
    // LLM: 30s * 2000W = 60000J
    // Ratio: 600/60000 = 0.01
    expect(scores.energyEfficiency).toBe(0.01)
  })
})

describe('computeScoresByDifficulty', () => {
  test('groups evaluations by difficulty', () => {
    const evals = [
      createEval({ difficulty: 'simple', outcome: 'success' }),
      createEval({ difficulty: 'simple', outcome: 'success' }),
      createEval({ difficulty: 'medium', outcome: 'success' }),
      createEval({ difficulty: 'hard', outcome: 'failure' }),
    ]

    const byDiff = computeScoresByDifficulty(evals)

    expect(byDiff.simple.total).toBe(2)
    expect(byDiff.simple.accuracy).toBe(1.0)
    expect(byDiff.medium.total).toBe(1)
    expect(byDiff.hard.total).toBe(1)
    expect(byDiff.hard.accuracy).toBe(0)
    expect(byDiff.easy.total).toBe(0)
  })
})
