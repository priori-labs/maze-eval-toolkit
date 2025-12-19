/**
 * Core type definitions for the LMIQ maze benchmark
 */

/**
 * A single cell in the maze grid
 */
export interface Cell {
  x: number
  y: number
  walls: {
    top: boolean
    right: boolean
    bottom: boolean
    left: boolean
  }
}

/**
 * A position in the maze (x, y coordinates)
 */
export interface Position {
  x: number
  y: number
}

/**
 * Difficulty levels for maze generation
 */
export type Difficulty = 'simple' | 'easy' | 'medium' | 'hard' | 'nightmare' | 'horror'

/**
 * All difficulty levels in order
 */
export const DIFFICULTIES: Difficulty[] = [
  'simple',
  'easy',
  'medium',
  'hard',
  'nightmare',
  'horror',
]

/**
 * Configuration for a difficulty level
 */
export interface DifficultyConfig {
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  extraPaths: number
  minShortestPath: number
  label: string
}

/**
 * Valid move actions
 */
export type MoveAction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

/**
 * All valid move actions
 */
export const VALID_MOVES: MoveAction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']

/**
 * Constraint requirement types for imported mazes
 */
export type RequirementType = 'REQUIRED_SUBSEQUENCE' | 'REQUIRED_TILES' | null

/**
 * A move-position pair for subsequence constraints
 */
export interface RequiredMove {
  move: MoveAction
  position: Position
}

/**
 * A generated maze with all its metadata
 */
export interface GeneratedMaze {
  id: string
  difficulty: Difficulty
  width: number
  height: number
  grid: Cell[][]
  start: Position
  goal: Position
  shortestPath: number
  generatedAt: string
  // Constraint fields
  requirementType?: RequirementType
  requiredSolutionSubsequences?: RequiredMove[][] // Multiple paths (OR logic)
  requiredTiles?: Position[]
  specialInstructions?: string
  shortestPathPlaythrough?: RequiredMove[] // Manually recorded optimal path
}

/**
 * A maze with pre-generated prompts for evaluation
 */
export interface MazeWithPrompts extends GeneratedMaze {
  prompts: Record<PromptFormat, string>
}

/**
 * Available prompt formats
 */
export type PromptFormat =
  | 'ascii'
  | 'block'
  | 'adjacency'
  | 'edges'
  | 'edges_ascii'
  | 'coordmatrix'
  | 'matrix2d'
  | 'coordtoken'

/**
 * All available prompt formats
 */
export const PROMPT_FORMATS: PromptFormat[] = [
  'ascii',
  'block',
  'adjacency',
  'edges',
  'edges_ascii',
  'coordmatrix',
  'matrix2d',
  'coordtoken',
]

/**
 * Result of validating a solution
 */
export interface SolutionValidation {
  isValid: boolean
  reachesGoal: boolean
  moves: MoveAction[]
  pathLength: number
  efficiency: number | null // shortestPath / pathLength (only if reaches goal)
  finalPosition: Position
  errorAtMove?: number
  errorMessage?: string
  // Constraint validation results
  constraintsSatisfied?: boolean
  constraintError?: string
}

/**
 * Stats from solving/analyzing a maze
 */
export interface MazeStats {
  shortestPath: number
  totalReachable: number
  ratio: number
  wouldRegenerate: boolean
}

/**
 * Test set file format
 */
export interface TestSetFile {
  id: string
  name: string
  version: string
  createdAt: string
  mazes: Record<Difficulty, MazeWithPrompts[]>
  summary: {
    totalMazes: number
    byDifficulty: Record<Difficulty, number>
  }
}

/**
 * Outcome of an evaluation
 */
export type EvaluationOutcome =
  | 'success'
  | 'failure'
  | 'parse_error'
  | 'invalid_move'
  | 'timeout'
  | 'empty_response'
  | 'token_limit'
  | 'api_error'
  | 'constraint_violated'
  | 'no_path_found'

/**
 * A single evaluation result
 */
export interface EvaluationResult {
  id: string
  runId: string
  testSetId: string
  testSetName: string
  mazeId: string
  model: string
  difficulty: Difficulty

  // Request details
  prompt: string
  promptFormats: PromptFormat[]
  startedAt: string
  completedAt: string

  // Token usage
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null

  // Cost and timing
  costUsd: number | null
  inferenceTimeMs: number

  // Response data
  rawResponse: string
  parsedMoves: MoveAction[] | null
  reasoning: string | null

  // Outcome
  outcome: EvaluationOutcome
  movesExecuted: number | null
  finalPosition: Position | null

  // Efficiency
  solutionLength: number | null
  shortestPath: number
  efficiency: number | null

  // Human evaluation flag
  isHuman: boolean
}

/**
 * Configuration for an evaluation run
 */
export interface EvaluationConfig {
  testSetPath: string
  model: string
  concurrency: number
  outputPath: string
  formats: PromptFormat[]
  apiKey: string
}

/**
 * Convert position to string key for Set/Map operations
 */
export function posToKey(pos: Position): string {
  return `${pos.x},${pos.y}`
}

/**
 * Parse position from string key
 */
export function keyToPos(key: string): Position {
  const [x, y] = key.split(',').map(Number)
  return { x: x!, y: y! }
}

/**
 * Maze generation algorithm mode
 */
export type GenerationMode = 'dfs' | 'spine-first'

/**
 * Configuration for spine-first maze generation
 *
 * This algorithm creates a guaranteed main path (spine/artery) from start to goal,
 * then adds controlled dead-end branches (capillaries) to create local decision points.
 */
export interface SpineFirstConfig {
  /** Probability (0-1) of starting a branch at each spine cell */
  branchChance: number
  /** Minimum depth of dead-end branches (for random range) */
  minBranchLength?: number
  /** Maximum depth of dead-end branches */
  maxBranchLength: number
  /** Minimum spine length multiplier over Manhattan distance (1.0 = direct path allowed) */
  tortuosity: number
  /** Minimum number of turns in the spine path (optional) */
  minTurns?: number
  /** Minimum number of spine cells between branch points */
  minBranchSpacing?: number
  /** Probability (0-1) that a branch cell spawns its own sub-branch */
  subBranchChance?: number
  /** Whether to fill remaining unvisited areas with DFS passages */
  fillRemaining?: boolean
}
