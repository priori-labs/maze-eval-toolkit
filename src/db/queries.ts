/**
 * Database query helpers using Bun's native SQLite
 */

import type { Database } from 'bun:sqlite'
import { v4 as uuidv4 } from 'uuid'
import type {
  Difficulty,
  EvaluationResult,
  MoveAction,
  Position,
  PromptFormat,
} from '../core/types'
import {
  GET_EVALUATIONS_BY_MAZE,
  GET_EVALUATIONS_BY_MODEL,
  GET_EVALUATIONS_BY_TEST_SET,
  GET_MODEL_SUMMARY,
  INSERT_EVALUATION,
  UPDATE_EVALUATION,
} from './schema'

/**
 * Insert an evaluation result into the database
 */
export function insertEvaluation(db: Database, result: EvaluationResult): void {
  const query = db.query(INSERT_EVALUATION)
  query.run(
    result.id,
    result.runId,
    result.testSetId,
    result.mazeId,
    result.model,
    result.difficulty,
    result.prompt,
    JSON.stringify(result.promptFormats),
    result.startedAt,
    result.completedAt,
    result.inputTokens,
    result.outputTokens,
    result.reasoningTokens,
    result.costUsd,
    result.inferenceTimeMs,
    result.rawResponse,
    result.parsedMoves ? JSON.stringify(result.parsedMoves) : null,
    result.reasoning,
    result.outcome,
    result.movesExecuted,
    result.finalPosition ? JSON.stringify(result.finalPosition) : null,
    result.solutionLength,
    result.shortestPath,
    result.efficiency,
  )
}

/**
 * Database row type (raw from SQLite)
 */
interface EvaluationRow {
  id: string
  run_id: string
  test_set_id: string
  maze_id: string
  model: string
  difficulty: string
  prompt: string
  prompt_formats: string
  started_at: string
  completed_at: string
  input_tokens: number | null
  output_tokens: number | null
  reasoning_tokens: number | null
  cost_usd: number | null
  inference_time_ms: number
  raw_response: string
  parsed_moves: string | null
  reasoning: string | null
  outcome: string
  moves_executed: number | null
  final_position: string | null
  solution_length: number | null
  shortest_path: number
  efficiency: number | null
}

/**
 * Convert database row to EvaluationResult
 */
function rowToResult(row: EvaluationRow): EvaluationResult {
  return {
    id: row.id,
    runId: row.run_id,
    testSetId: row.test_set_id,
    mazeId: row.maze_id,
    model: row.model,
    difficulty: row.difficulty as Difficulty,
    prompt: row.prompt,
    promptFormats: JSON.parse(row.prompt_formats) as PromptFormat[],
    startedAt: row.started_at,
    completedAt: row.completed_at,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    costUsd: row.cost_usd,
    inferenceTimeMs: row.inference_time_ms,
    rawResponse: row.raw_response,
    parsedMoves: row.parsed_moves ? (JSON.parse(row.parsed_moves) as MoveAction[]) : null,
    reasoning: row.reasoning,
    outcome: row.outcome as EvaluationResult['outcome'],
    movesExecuted: row.moves_executed,
    finalPosition: row.final_position ? (JSON.parse(row.final_position) as Position) : null,
    solutionLength: row.solution_length,
    shortestPath: row.shortest_path,
    efficiency: row.efficiency,
  }
}

/**
 * Get all evaluations for a maze
 */
export function getEvaluationsByMaze(db: Database, mazeId: string): EvaluationResult[] {
  const query = db.query(GET_EVALUATIONS_BY_MAZE)
  const rows = query.all(mazeId) as EvaluationRow[]
  return rows.map(rowToResult)
}

/**
 * Get all evaluations for a model
 */
export function getEvaluationsByModel(db: Database, model: string): EvaluationResult[] {
  const query = db.query(GET_EVALUATIONS_BY_MODEL)
  const rows = query.all(model) as EvaluationRow[]
  return rows.map(rowToResult)
}

/**
 * Get all evaluations in a test set
 */
export function getEvaluationsByTestSet(db: Database, testSetId: string): EvaluationResult[] {
  const query = db.query(GET_EVALUATIONS_BY_TEST_SET)
  const rows = query.all(testSetId) as EvaluationRow[]
  return rows.map(rowToResult)
}

/**
 * Model summary stats
 */
export interface ModelSummary {
  model: string
  total: number
  successes: number
  avgEfficiency: number | null
  avgTimeMs: number
  totalCost: number
}

/**
 * Get summary stats by model for a test set
 */
export function getModelSummary(db: Database, testSetId: string): ModelSummary[] {
  const query = db.query(GET_MODEL_SUMMARY)
  const rows = query.all(testSetId) as Array<{
    model: string
    total: number
    successes: number
    avg_efficiency: number | null
    avg_time_ms: number
    total_cost: number
  }>

  return rows.map((row) => ({
    model: row.model,
    total: row.total,
    successes: row.successes,
    avgEfficiency: row.avg_efficiency,
    avgTimeMs: row.avg_time_ms,
    totalCost: row.total_cost,
  }))
}

/**
 * Create a new evaluation result object
 */
export function createEvaluationResult(partial: Omit<EvaluationResult, 'id'>): EvaluationResult {
  return {
    id: uuidv4(),
    ...partial,
  }
}

/**
 * Update an evaluation result in place (for retry)
 */
export function updateEvaluation(db: Database, result: EvaluationResult): void {
  const query = db.query(UPDATE_EVALUATION)
  query.run(
    result.startedAt,
    result.completedAt,
    result.inputTokens,
    result.outputTokens,
    result.reasoningTokens,
    result.costUsd,
    result.inferenceTimeMs,
    result.rawResponse,
    result.parsedMoves ? JSON.stringify(result.parsedMoves) : null,
    result.reasoning,
    result.outcome,
    result.movesExecuted,
    result.finalPosition ? JSON.stringify(result.finalPosition) : null,
    result.solutionLength,
    result.efficiency,
    result.id,
  )
}
