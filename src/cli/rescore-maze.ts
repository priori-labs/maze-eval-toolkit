/**
 * Re-score evaluations for a specific maze ID by re-validating stored responses
 * Usage: bun run src/cli/rescore-maze.ts <db-path> <maze-id>
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import chalk from 'chalk'
import { validateSolutionWithConstraints } from '../core/maze-solver'
import type {
  Difficulty,
  EvaluationOutcome,
  EvaluationResult,
  MazeWithPrompts,
  MoveAction,
  TestSetFile,
} from '../core/types'
import { closeDatabase, initDatabase } from '../db/client'

const [dbPath, mazeId] = process.argv.slice(2)

if (!dbPath || !mazeId) {
  console.error('Usage: bun run src/cli/rescore-maze.ts <db-path> <maze-id>')
  process.exit(1)
}

// Load test set to find the maze
function loadMaze(mazeId: string): { maze: MazeWithPrompts; testSet: TestSetFile } | null {
  const dataDir = './test-sets'
  if (!existsSync(dataDir)) return null

  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    try {
      const content = readFileSync(`${dataDir}/${file}`, 'utf-8')
      const testSet = JSON.parse(content) as TestSetFile
      for (const difficulty of Object.keys(testSet.mazes) as Difficulty[]) {
        const maze = testSet.mazes[difficulty].find((m) => m.id === mazeId)
        if (maze) return { maze, testSet }
      }
    } catch {
      // Skip invalid files
    }
  }
  return null
}

// Get evaluations for this maze
function getEvaluations(dbPath: string, mazeId: string): EvaluationResult[] {
  const db = initDatabase(dbPath)
  const query = db.query('SELECT * FROM evaluations WHERE maze_id = ?')
  const rows = query.all(mazeId) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    id: row.id as string,
    runId: row.run_id as string,
    testSetId: row.test_set_id as string,
    testSetName: row.test_set_name as string,
    mazeId: row.maze_id as string,
    model: row.model as string,
    difficulty: row.difficulty as Difficulty,
    prompt: row.prompt as string,
    promptFormats: JSON.parse(row.prompt_formats as string),
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string,
    inputTokens: row.input_tokens as number | null,
    outputTokens: row.output_tokens as number | null,
    reasoningTokens: row.reasoning_tokens as number | null,
    costUsd: row.cost_usd as number | null,
    inferenceTimeMs: row.inference_time_ms as number,
    rawResponse: row.raw_response as string,
    parsedMoves: row.parsed_moves ? JSON.parse(row.parsed_moves as string) : null,
    reasoning: row.reasoning as string | null,
    outcome: row.outcome as EvaluationOutcome,
    movesExecuted: row.moves_executed as number | null,
    finalPosition: row.final_position ? JSON.parse(row.final_position as string) : null,
    solutionLength: row.solution_length as number | null,
    shortestPath: row.shortest_path as number,
    efficiency: row.efficiency as number | null,
    isHuman: (row.is_human as number) === 1,
  }))
}

console.log(chalk.bold('\nRe-scoring Evaluations for Maze'))
console.log(chalk.dim('─'.repeat(50)))
console.log(`Database: ${dbPath}`)
console.log(`Maze ID: ${mazeId}`)
console.log()

// Load the maze
const result = loadMaze(mazeId)
if (!result) {
  console.error(chalk.red(`Could not find maze ${mazeId} in any test set`))
  process.exit(1)
}

const { maze, testSet } = result
console.log(`Found maze in test set: ${testSet.name}`)
console.log(`Difficulty: ${maze.difficulty}`)
if (maze.requirementType) {
  console.log(`Constraint: ${maze.requirementType}`)
  if (maze.requiredSolutionSubsequences) {
    console.log(`Required subsequences: ${JSON.stringify(maze.requiredSolutionSubsequences)}`)
  }
}
console.log()

// Get evaluations
const evaluations = getEvaluations(dbPath, mazeId)
console.log(`Found ${evaluations.length} evaluations to rescore`)
console.log()

if (evaluations.length === 0) {
  console.log(chalk.yellow('No evaluations found for this maze'))
  closeDatabase()
  process.exit(0)
}

// Re-score each evaluation
const db = initDatabase(dbPath)
let updated = 0
let unchanged = 0

for (const evaluation of evaluations) {
  const oldOutcome = evaluation.outcome

  // Skip if no parsed moves (can't rescore)
  if (!evaluation.parsedMoves || evaluation.parsedMoves.length === 0) {
    console.log(`  ${evaluation.model.slice(0, 30).padEnd(30)} ${chalk.dim('no moves - skipping')}`)
    unchanged++
    continue
  }

  // Re-validate with constraints
  const validation = validateSolutionWithConstraints(
    maze.grid,
    maze.start,
    maze.goal,
    maze.shortestPath,
    evaluation.parsedMoves as MoveAction[],
    maze.requirementType
      ? {
          requirementType: maze.requirementType,
          requiredSolutionSubsequences: maze.requiredSolutionSubsequences,
          requiredTiles: maze.requiredTiles,
        }
      : undefined,
  )

  // Determine new outcome
  let newOutcome: EvaluationOutcome
  if (!validation.isValid) {
    newOutcome = 'invalid_move'
  } else if (validation.reachesGoal) {
    if (validation.constraintsSatisfied === false) {
      newOutcome = 'constraint_violated'
    } else {
      newOutcome = 'success'
    }
  } else {
    newOutcome = 'failure'
  }

  // Update if changed
  if (newOutcome !== oldOutcome) {
    db.run(
      'UPDATE evaluations SET outcome = ?, moves_executed = ?, solution_length = ?, efficiency = ?, final_position = ? WHERE id = ?',
      [
        newOutcome,
        validation.pathLength,
        validation.pathLength,
        validation.efficiency,
        validation.finalPosition ? JSON.stringify(validation.finalPosition) : null,
        evaluation.id,
      ],
    )
    updated++

    const oldColor = oldOutcome === 'success' ? chalk.green : chalk.yellow
    const newColor = newOutcome === 'success' ? chalk.green : chalk.yellow
    console.log(
      `  ${evaluation.model.slice(0, 30).padEnd(30)} ${oldColor(oldOutcome.padEnd(18))} → ${newColor(newOutcome)}`,
    )
  } else {
    unchanged++
    console.log(
      `  ${evaluation.model.slice(0, 30).padEnd(30)} ${chalk.dim(oldOutcome.padEnd(18))} (unchanged)`,
    )
  }
}

closeDatabase()

console.log()
console.log(chalk.dim('─'.repeat(50)))
console.log(`Updated: ${chalk.cyan(updated)}`)
console.log(`Unchanged: ${chalk.dim(unchanged)}`)
