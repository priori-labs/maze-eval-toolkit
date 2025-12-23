/**
 * Simple script to update maze_id in evaluations
 * Usage: bun run src/cli/update-maze-id.ts <db-path> <old-maze-id> <new-maze-id>
 */

import { closeDatabase, initDatabase } from '../db/client'

const [dbPath, oldMazeId, newMazeId] = process.argv.slice(2)

if (!dbPath || !oldMazeId || !newMazeId) {
  console.error('Usage: bun run src/cli/update-maze-id.ts <db-path> <old-maze-id> <new-maze-id>')
  process.exit(1)
}

const db = initDatabase(dbPath)

const result = db.run(
  `
  UPDATE evaluations
  SET maze_id = ?, outcome = 'failure'
  WHERE maze_id = ?
`,
  [newMazeId, oldMazeId],
)

console.log(`Updated ${result.changes} evaluations`)
console.log(`  Old maze ID: ${oldMazeId}`)
console.log(`  New maze ID: ${newMazeId}`)
console.log('  Outcome set to: failure')

closeDatabase()
