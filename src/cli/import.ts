/**
 * CLI command for importing mazes from JSON files
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import chalk from 'chalk'
import { Command } from 'commander'
import { v4 as uuidv4 } from 'uuid'
import { generateAllPrompts } from '../core/maze-renderer'
import { solveMaze } from '../core/maze-solver'
import type {
  Cell,
  Difficulty,
  GeneratedMaze,
  MazeWithPrompts,
  Position,
  RequiredMove,
  RequirementType,
  TestSetFile,
} from '../core/types'
import { DIFFICULTIES } from '../core/types'

const INPUT_DIR = './input'
const DEFAULT_OUTPUT_PATH = './data/imported-test-set.json'

/**
 * Format of input maze files from input/ directory
 */
interface InputMaze {
  difficulty: string
  width: number
  height: number
  grid: Cell[][]
  start: Position
  goal: Position
  requirementType: RequirementType
  requiredSolutionSubsequences?: RequiredMove[][] // Multiple paths (OR logic)
  requiredTiles?: Position[]
  specialInstructions?: string
  shortestPathPlaythrough?: RequiredMove[] // Manually recorded optimal path
}

interface ImportOptions {
  inputDir: string
  outputPath: string
  name: string
}

function validateDifficulty(diff: string): Difficulty {
  if (DIFFICULTIES.includes(diff as Difficulty)) {
    return diff as Difficulty
  }
  console.warn(chalk.yellow(`Unknown difficulty '${diff}', defaulting to 'medium'`))
  return 'medium'
}

function processInputMaze(inputMaze: InputMaze): GeneratedMaze {
  // Validate and compute shortest path
  const stats = solveMaze(inputMaze.grid, inputMaze.start, inputMaze.goal)

  if (stats.shortestPath <= 0) {
    throw new Error('Maze is unsolvable or invalid')
  }

  return {
    id: uuidv4(),
    difficulty: validateDifficulty(inputMaze.difficulty),
    width: inputMaze.width,
    height: inputMaze.height,
    grid: inputMaze.grid,
    start: inputMaze.start,
    goal: inputMaze.goal,
    shortestPath: stats.shortestPath,
    generatedAt: new Date().toISOString(),
    // Constraint fields
    requirementType: inputMaze.requirementType,
    requiredSolutionSubsequences: inputMaze.requiredSolutionSubsequences,
    requiredTiles: inputMaze.requiredTiles,
    specialInstructions: inputMaze.specialInstructions,
    shortestPathPlaythrough: inputMaze.shortestPathPlaythrough,
  }
}

async function runImport(options: ImportOptions) {
  const { inputDir, outputPath, name } = options

  console.log(chalk.bold('\nLMIQ Maze Import'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log(`Input directory: ${inputDir}`)
  console.log(`Output path: ${outputPath}`)
  console.log()

  // Check input directory exists
  if (!existsSync(inputDir)) {
    console.error(chalk.red(`Input directory not found: ${inputDir}`))
    process.exit(1)
  }

  // Find all JSON files
  const jsonFiles = readdirSync(inputDir).filter((f) => f.endsWith('.json'))

  if (jsonFiles.length === 0) {
    console.error(chalk.red(`No JSON files found in ${inputDir}`))
    process.exit(1)
  }

  console.log(`Found ${jsonFiles.length} maze file(s)`)
  console.log()

  // Initialize test set structure
  const testSet: TestSetFile = {
    id: uuidv4(),
    name,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    mazes: {
      simple: [],
      easy: [],
      medium: [],
      hard: [],
      nightmare: [],
    },
    summary: {
      totalMazes: 0,
      byDifficulty: {
        simple: 0,
        easy: 0,
        medium: 0,
        hard: 0,
        nightmare: 0,
      },
    },
  }

  // Process each file
  let successCount = 0
  let failCount = 0

  for (const filename of jsonFiles) {
    const filepath = `${inputDir}/${filename}`
    process.stdout.write(`Processing ${filename}... `)

    try {
      const content = readFileSync(filepath, 'utf-8')
      const inputMaze = JSON.parse(content) as InputMaze

      // Convert to GeneratedMaze
      const maze = processInputMaze(inputMaze)

      // Generate prompts (will include specialInstructions)
      const prompts = generateAllPrompts(maze)

      const mazeWithPrompts: MazeWithPrompts = {
        ...maze,
        prompts,
      }

      // Add to appropriate difficulty bucket
      testSet.mazes[maze.difficulty].push(mazeWithPrompts)

      // Log constraint info
      let constraintInfo = ''
      if (maze.requirementType === 'REQUIRED_SUBSEQUENCE') {
        const pathCount = maze.requiredSolutionSubsequences?.length ?? 0
        constraintInfo = chalk.cyan(` [SUBSEQUENCE: ${pathCount} path(s)]`)
      } else if (maze.requirementType === 'REQUIRED_TILES') {
        constraintInfo = chalk.cyan(` [TILES: ${maze.requiredTiles?.length ?? 0} required]`)
      }
      if (maze.shortestPathPlaythrough?.length) {
        constraintInfo += chalk.yellow(` [SHORTEST: ${maze.shortestPathPlaythrough.length} moves]`)
      }

      console.log(
        `${chalk.green('OK')} (${maze.width}x${maze.height}, ${maze.difficulty}, path=${maze.shortestPath})${constraintInfo}`,
      )
      successCount++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.log(chalk.red(`FAILED: ${errMsg}`))
      failCount++
    }
  }

  // Update summary
  testSet.summary.totalMazes = successCount
  for (const diff of DIFFICULTIES) {
    testSet.summary.byDifficulty[diff] = testSet.mazes[diff].length
  }

  // Ensure output directory exists
  const dir = dirname(outputPath)
  mkdirSync(dir, { recursive: true })

  // Write output
  writeFileSync(outputPath, JSON.stringify(testSet, null, 2))

  // Print summary
  console.log()
  console.log(chalk.dim('─'.repeat(50)))
  console.log(chalk.bold('Import Summary'))
  console.log(`  Processed: ${jsonFiles.length}`)
  console.log(`  Success: ${chalk.green(successCount)}`)
  console.log(`  Failed: ${failCount > 0 ? chalk.red(failCount) : failCount}`)
  console.log()
  console.log('By Difficulty:')
  for (const diff of DIFFICULTIES) {
    const count = testSet.summary.byDifficulty[diff]
    if (count > 0) {
      console.log(`  ${diff.padEnd(12)} ${count}`)
    }
  }
  console.log()
  console.log(`Output written to: ${chalk.cyan(outputPath)}`)
}

export const importCommand = new Command('import')
  .description('Import mazes from JSON files in input/ directory')
  .option('-d, --input-dir <path>', 'Input directory containing JSON maze files', INPUT_DIR)
  .option('-o, --output <path>', 'Output test set JSON file path', DEFAULT_OUTPUT_PATH)
  .option('--name <name>', 'Test set name', 'Imported Mazes')
  .action(async (options) => {
    await runImport({
      inputDir: options.inputDir,
      outputPath: options.output,
      name: options.name,
    })
  })
