/**
 * Difficulty level configurations
 */

import type { Difficulty, DifficultyConfig, SpineFirstConfig, TestSetHumanBaselines } from './types'

/**
 * Settings for each difficulty level
 *
 * - Grid sizes increase with difficulty
 * - extraPaths: Random wall removals that create alternative routes (more = easier)
 * - minShortestPath: Minimum required path length from start to goal
 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultyConfig> = {
  simple: {
    minWidth: 5,
    maxWidth: 8,
    minHeight: 4,
    maxHeight: 6,
    extraPaths: 0,
    minShortestPath: 5,
    label: 'Simple',
  },
  easy: {
    minWidth: 8,
    maxWidth: 12,
    minHeight: 6,
    maxHeight: 9,
    extraPaths: 6,
    minShortestPath: 10,
    label: 'Easy',
  },
  medium: {
    minWidth: 12,
    maxWidth: 18,
    minHeight: 10,
    maxHeight: 14,
    extraPaths: 10,
    minShortestPath: 20,
    label: 'Medium',
  },
  hard: {
    minWidth: 16,
    maxWidth: 22,
    minHeight: 12,
    maxHeight: 16,
    extraPaths: 0,
    minShortestPath: 30,
    label: 'Hard',
  },
  nightmare: {
    minWidth: 28,
    maxWidth: 38,
    minHeight: 18,
    maxHeight: 22,
    extraPaths: 5,
    minShortestPath: 50,
    label: 'Nightmare',
  },
  horror: {
    minWidth: 35,
    maxWidth: 50,
    minHeight: 20,
    maxHeight: 30,
    extraPaths: 0,
    minShortestPath: 100,
    label: 'Horror',
  },
}

/**
 * Get the configuration for a difficulty level
 */
export function getDifficultyConfig(difficulty: Difficulty): DifficultyConfig {
  return DIFFICULTY_SETTINGS[difficulty]
}

/**
 * Generate a random dimension within the difficulty's range
 */
export function randomDimension(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Default spine-first configuration for each difficulty level
 *
 * - branchChance: Higher = more dead-ends to navigate around
 * - maxBranchLength: Longer = more doubt before hitting dead-end
 * - tortuosity: Higher = more winding main path
 * - minTurns: Ensures path isn't too direct
 */
export const SPINE_FIRST_DEFAULTS: Record<Difficulty, SpineFirstConfig> = {
  simple: {
    branchChance: 0.3,
    minBranchLength: 1,
    maxBranchLength: 2,
    tortuosity: 1.2,
    minTurns: 2,
    minBranchSpacing: 5,
    subBranchChance: 0,
    fillRemaining: false,
  },
  easy: {
    branchChance: 0.4,
    minBranchLength: 2,
    maxBranchLength: 4,
    tortuosity: 1.3,
    minTurns: 3,
    minBranchSpacing: 6,
    subBranchChance: 0.1,
    fillRemaining: false,
  },
  medium: {
    branchChance: 0.5,
    minBranchLength: 3,
    maxBranchLength: 6,
    tortuosity: 1.5,
    minTurns: 5,
    minBranchSpacing: 8,
    subBranchChance: 0.15,
    fillRemaining: false,
  },
  hard: {
    branchChance: 0.6,
    minBranchLength: 4,
    maxBranchLength: 10,
    tortuosity: 1.7,
    minTurns: 8,
    minBranchSpacing: 10,
    subBranchChance: 0.2,
    fillRemaining: false,
  },
  nightmare: {
    branchChance: 0.7,
    minBranchLength: 5,
    maxBranchLength: 20,
    tortuosity: 2.0,
    minTurns: 12,
    minBranchSpacing: 12,
    subBranchChance: 0.25,
    fillRemaining: false,
  },
  horror: {
    branchChance: 0.8,
    minBranchLength: 5,
    maxBranchLength: 50,
    tortuosity: 2.5,
    minTurns: 20,
    minBranchSpacing: 15,
    subBranchChance: 0.3,
    fillRemaining: false,
  },
}

/**
 * Get spine-first configuration for a difficulty level with optional overrides
 */
export function getSpineFirstConfig(
  difficulty: Difficulty,
  overrides?: Partial<SpineFirstConfig>,
): SpineFirstConfig {
  return {
    ...SPINE_FIRST_DEFAULTS[difficulty],
    ...overrides,
  }
}

/**
 * Human baseline reference for scoring
 */
export interface HumanBaselineConfig {
  timeSeconds: number
  accuracy: number
}

/**
 * Average human reference values for scoring
 */
export const HUMAN_BASELINE: Record<Difficulty, HumanBaselineConfig> = {
  simple: { timeSeconds: 10, accuracy: 1.0 },
  easy: { timeSeconds: 20, accuracy: 1.0 },
  medium: { timeSeconds: 30, accuracy: 0.98 },
  hard: { timeSeconds: 60, accuracy: 0.96 },
  nightmare: { timeSeconds: 90, accuracy: 0.93 },
  horror: { timeSeconds: 90, accuracy: 0.96 },
}

/**
 * Elite human reference values (faster times, higher accuracy)
 */
export const ELITE_HUMAN_BASELINE: Record<Difficulty, HumanBaselineConfig> = {
  simple: { timeSeconds: 4, accuracy: 1.0 },
  easy: { timeSeconds: 8, accuracy: 1.0 },
  medium: { timeSeconds: 15, accuracy: 0.99 },
  hard: { timeSeconds: 25, accuracy: 0.98 },
  nightmare: { timeSeconds: 60, accuracy: 0.96 },
  horror: { timeSeconds: 60, accuracy: 0.98 },
}

/**
 * Constants for energy efficiency calculations
 */
export const HUMAN_BRAIN_WATTS = 20
export const LLM_GPU_WATTS = 2000

/**
 * Effective baseline with source information
 */
export interface EffectiveBaseline {
  timeSeconds: number
  accuracy: number
  source: 'custom' | 'default'
}

/**
 * Get the effective baseline for scoring, with fallback logic
 *
 * Priority:
 * 1. Custom baseline (if test set has one)
 * 2. Default difficulty-based baseline
 *
 * For elite mode:
 * - Uses custom elite if available
 * - Falls back to custom average if only average is provided
 * - Falls back to default elite if no custom baselines
 */
export function getEffectiveBaseline(
  difficulty: Difficulty,
  customBaselines: TestSetHumanBaselines | undefined,
  elite: boolean,
): EffectiveBaseline {
  // If custom baselines exist
  if (customBaselines) {
    if (elite) {
      // Prefer elite, fall back to average
      const baseline = customBaselines.elite ?? customBaselines.average
      return {
        timeSeconds: baseline.timeSeconds,
        accuracy: baseline.accuracy,
        source: 'custom',
      }
    }
    return {
      timeSeconds: customBaselines.average.timeSeconds,
      accuracy: customBaselines.average.accuracy,
      source: 'custom',
    }
  }

  // Fall back to default difficulty-based baselines
  const reference = elite ? ELITE_HUMAN_BASELINE : HUMAN_BASELINE
  return {
    timeSeconds: reference[difficulty].timeSeconds,
    accuracy: reference[difficulty].accuracy,
    source: 'default',
  }
}
