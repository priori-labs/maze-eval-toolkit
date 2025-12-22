/**
 * Type definitions for the Maze Game
 *
 * Shared types are re-exported from @/core for consistency.
 * UI-only types are defined here.
 */

// Re-export shared types from core
export {
  type Cell,
  type Difficulty,
  DIFFICULTIES,
  type MazeStats,
  type MoveAction,
  type Position,
  type RequiredMove,
  type RequirementType,
  posToKey,
  keyToPos,
  // Experimental types now in core
  type Hole,
  type Portal,
  type ExitDoorPair,
  type WildcardTile,
  type PerspectiveRotation,
  type ExecutionMode,
  type MoveByMoveContext,
  type SpecialAction,
  SPECIAL_ACTIONS,
  type ExperimentalRenderOptions,
  type ExperimentalPromptOptions,
  isPositionInHole,
  getPerspectiveRotationDescription,
} from '@/core'

import type { Cell } from '@/core'

// ============================================================================
// UI-Only Types
// ============================================================================

/**
 * Mutable cell used during maze generation (extends core Cell with visited flag)
 */
export interface MutableCell extends Cell {
  visited: boolean
}

export type Room = { x: number; y: number; width: number; height: number }
export type Obstacle = { x: number; y: number; width: number; height: number }
export type Hallway = {
  x: number
  y: number
  length: number
  width: number
  direction: 'horizontal' | 'vertical'
}
export type Box = { x: number; y: number; width: number; height: number }

/**
 * UI-specific difficulty settings (extends core with UI-only fields)
 */
export type DifficultySettings = {
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  visionRadius: number
  extraPaths: number
  label: string
  skipFeatures?: boolean
}

/**
 * UI-specific prompt view options (maps to core ExperimentalPromptOptions)
 */
export interface PromptViewOptions {
  ascii: boolean
  adjacencyList: boolean
  coordinateMatrix: boolean
  matrix2D: boolean
  blockFormat: boolean
  explicitEdges: boolean
  coordinateToken: boolean
  blockGrid: boolean
  includeUnreachableInstructions: boolean
  applyTimePressure: boolean
  executionMode: 'fullSolution' | 'moveByMove'
}
