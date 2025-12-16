import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { v4 as uuidv4 } from 'uuid'
import type { Difficulty, EvaluationResult, MoveAction } from '../core/types'
import { initDatabase, insertEvaluation } from '../db'

const app = new Hono()

// Enable CORS for development
app.use('*', cors())

const ROOT_DIR = resolve(import.meta.dirname, '../..')
const DATA_DIR = join(ROOT_DIR, 'data')
const RESULTS_DIR = join(ROOT_DIR, 'results')
const DB_PATH = join(RESULTS_DIR, 'eval.db')

// Initialize database
const db = initDatabase(DB_PATH)

// Helper to list JSON files in a directory
async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir)
    return files.filter((f) => f.endsWith('.json')).sort()
  } catch {
    return []
  }
}

// List test set files
app.get('/api/data', async (c) => {
  const files = await listJsonFiles(DATA_DIR)
  return c.json({ files })
})

// List result files
app.get('/api/results', async (c) => {
  const files = await listJsonFiles(RESULTS_DIR)
  return c.json({ files })
})

// Serve specific test set file
app.get('/api/data/:filename', async (c) => {
  const filename = c.req.param('filename')
  if (!filename.endsWith('.json')) {
    return c.json({ error: 'Only JSON files allowed' }, 400)
  }

  try {
    const filepath = join(DATA_DIR, filename)
    const content = await readFile(filepath, 'utf-8')
    return c.json(JSON.parse(content))
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
})

// Serve specific results file
app.get('/api/results/:filename', async (c) => {
  const filename = c.req.param('filename')
  if (!filename.endsWith('.json')) {
    return c.json({ error: 'Only JSON files allowed' }, 400)
  }

  try {
    const filepath = join(RESULTS_DIR, filename)
    const content = await readFile(filepath, 'utf-8')
    return c.json(JSON.parse(content))
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
})

// Human evaluation result from frontend
interface HumanMazeResult {
  mazeId: string
  difficulty: Difficulty
  moves: MoveAction[]
  timeMs: number
  pathLength: number
  shortestPath: number
  efficiency: number
  // Constraint validation results
  constraintsSatisfied?: boolean
  constraintError?: string
}

// Human evaluation submission
interface HumanEvalSubmission {
  runName: string
  testSetId: string
  startedAt: string
  completedAt: string
  results: HumanMazeResult[]
}

// POST human evaluation results
app.post('/api/human-evals', async (c) => {
  try {
    const body = (await c.req.json()) as HumanEvalSubmission
    const { runName, testSetId, startedAt, completedAt, results } = body

    if (!runName || !testSetId || !results || results.length === 0) {
      return c.json({ error: 'Missing required fields' }, 400)
    }

    const runId = uuidv4()
    const model = `human/${runName}`

    // Create and insert evaluation records for each maze result
    for (const result of results) {
      // Determine outcome based on constraint satisfaction
      const outcome = result.constraintsSatisfied === false ? 'constraint_violated' : 'success'

      const evaluation: EvaluationResult = {
        id: uuidv4(),
        runId,
        testSetId,
        mazeId: result.mazeId,
        model,
        difficulty: result.difficulty,
        prompt: '',
        promptFormats: [],
        startedAt,
        completedAt,
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        costUsd: null,
        inferenceTimeMs: result.timeMs,
        rawResponse: JSON.stringify(result.moves),
        parsedMoves: result.moves,
        reasoning: result.constraintError ?? null, // Store constraint error in reasoning field
        outcome,
        movesExecuted: result.pathLength,
        finalPosition: null, // Could calculate this but not essential
        solutionLength: result.pathLength,
        shortestPath: result.shortestPath,
        efficiency: result.efficiency,
        isHuman: true,
      }

      insertEvaluation(db, evaluation)
    }

    return c.json({
      success: true,
      runId,
      model,
      count: results.length,
    })
  } catch (err) {
    console.error('Failed to save human evaluation:', err)
    return c.json({ error: 'Failed to save evaluation' }, 500)
  }
})

const PORT = 3001
console.log(`API server running at http://localhost:${PORT}`)

export default {
  port: PORT,
  fetch: app.fetch,
}
