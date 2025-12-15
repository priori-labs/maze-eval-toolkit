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
export type Difficulty = 'simple' | 'easy' | 'medium' | 'hard' | 'nightmare'

/**
 * All difficulty levels in order
 */
export const DIFFICULTIES: Difficulty[] = ['simple', 'easy', 'medium', 'hard', 'nightmare']

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
export type PromptFormat = 'ascii' | 'block' | 'adjacency' | 'edges' | 'coordmatrix' | 'matrix2d'

/**
 * All available prompt formats
 */
export const PROMPT_FORMATS: PromptFormat[] = [
  'ascii',
  'block',
  'adjacency',
  'edges',
  'coordmatrix',
  'matrix2d',
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

/**
 * A single evaluation result
 */
export interface EvaluationResult {
  id: string
  runId: string
  testSetId: string
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
