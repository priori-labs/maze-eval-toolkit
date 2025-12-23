/**
 * Sync maze IDs from a test set file to localStorage export
 *
 * Creates a minimal sync file that only includes the IDs needed for matching.
 *
 * Usage: bun run src/cli/sync-maze-ids.ts <test-set-path>
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface MinimalMaze {
  id: string
  difficulty: string
  width: number
  height: number
  start: { x: number; y: number }
  goal: { x: number; y: number }
  grid: unknown[][]
}

const testSetPath = process.argv[2]

if (!testSetPath) {
  console.error('Usage: bun run src/cli/sync-maze-ids.ts <test-set-path>')
  console.error('Example: bun run src/cli/sync-maze-ids.ts test-sets/custom-test-set.json')
  process.exit(1)
}

// Read the test set file
const testSetContent = readFileSync(testSetPath, 'utf-8')
const testSet = JSON.parse(testSetContent)

// Extract only the fields needed for matching (id, difficulty, start, goal, grid walls)
const minimalMazes: Record<string, MinimalMaze[]> = {}
for (const [difficulty, mazes] of Object.entries(testSet.mazes)) {
  minimalMazes[difficulty] = (mazes as MinimalMaze[]).map((m) => ({
    id: m.id,
    difficulty: m.difficulty,
    width: m.width,
    height: m.height,
    start: m.start,
    goal: m.goal,
    // Only keep wall structure from grid cells
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grid: (m.grid as any[][]).map((row) => row.map((cell) => ({ walls: cell.walls }))),
  }))
}

const minimalTestSet = { mazes: minimalMazes }

// Write to public folder so it can be fetched
const outputPath = join(process.cwd(), 'src/ui-mazes/public/sync-ids.json')
writeFileSync(outputPath, JSON.stringify(minimalTestSet))
console.log(`Written to ${outputPath}`)
console.log('\nNow in the browser console, run:')
console.log('  await syncMazeIds()')
