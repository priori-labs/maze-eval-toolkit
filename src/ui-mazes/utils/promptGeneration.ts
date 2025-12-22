/**
 * AI prompt generation utilities
 *
 * This is a thin wrapper around core's generatePrompt that maps UI options
 * to core's ExperimentalPromptOptions.
 */

import { type GeneratedMaze, type PromptFormat, generatePrompt } from '@/core'
import type {
  Cell,
  ExitDoorPair,
  Hole,
  MoveByMoveContext,
  PerspectiveRotation,
  Position,
  PromptViewOptions,
  WildcardTile,
} from '../types'

/**
 * Generate an AI prompt for maze solving.
 * Maps UI-specific PromptViewOptions to core's format.
 */
export const generateAIPrompt = (
  grid: Cell[][],
  playerPos: Position,
  goalPos: Position,
  viewOptions: PromptViewOptions = {
    ascii: true,
    adjacencyList: true,
    coordinateMatrix: true,
    matrix2D: true,
    blockFormat: false,
    explicitEdges: false,
    coordinateToken: false,
    blockGrid: false,
    includeUnreachableInstructions: false,
    applyTimePressure: false,
    executionMode: 'fullSolution',
  },
  holes: Hole[] = [],
  exitDoorPair: ExitDoorPair | null = null,
  moveByMoveContext: MoveByMoveContext | null = null,
  wildcardTile: WildcardTile = null,
  perspectiveRotation: PerspectiveRotation = 'none',
): string => {
  // Map UI view options to prompt formats
  const formats: PromptFormat[] = []
  if (viewOptions.ascii) formats.push('ascii')
  if (viewOptions.adjacencyList) formats.push('adjacency')
  if (viewOptions.coordinateMatrix) formats.push('coordmatrix')
  if (viewOptions.matrix2D) formats.push('matrix2d')
  if (viewOptions.blockFormat) formats.push('block')
  if (viewOptions.explicitEdges) formats.push('edges')
  if (viewOptions.coordinateToken) formats.push('coordtoken')
  if (viewOptions.blockGrid) formats.push('blockgrid')

  // Create a GeneratedMaze-like object for core
  const maze: GeneratedMaze = {
    id: 'ui-maze',
    difficulty: 'easy',
    width: grid[0]?.length ?? 0,
    height: grid.length,
    grid,
    start: playerPos,
    goal: goalPos,
    shortestPath: 0,
    generatedAt: new Date().toISOString(),
  }

  // Call core's generatePrompt with experimental options
  return generatePrompt(maze, formats, undefined, {
    holes,
    exitDoorPair,
    wildcardTile,
    perspectiveRotation,
    includeUnreachableInstructions: viewOptions.includeUnreachableInstructions,
    applyTimePressure: viewOptions.applyTimePressure,
    executionMode: viewOptions.executionMode,
    moveByMoveContext,
  })
}

// NOTE: Test set prompt generation uses core's generateAllPrompts() directly.
// See testSetExport.ts for consistency with CLI evaluation.
