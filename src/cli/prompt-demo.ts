/**
 * CLI command for generating and inspecting prompts
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { checkbox, input, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import { generatePrompt } from '../core/maze-renderer'
import type { Difficulty, MazeWithPrompts, PromptFormat, TestSetFile } from '../core/types'
import { DIFFICULTIES, PROMPT_FORMATS } from '../core/types'

function findTestSets(): string[] {
  const dataDir = './data'
  if (!existsSync(dataDir)) return []
  return readdirSync(dataDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${dataDir}/${f}`)
}

async function run() {
  console.log(chalk.bold('\nLMIQ Prompt Demo'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  // Find available test sets
  const testSets = findTestSets()
  if (testSets.length === 0) {
    console.error(chalk.red('No test sets found in ./data/'))
    console.error('Run `task generate` to create one')
    process.exit(1)
  }

  const testSetPath = await select({
    message: 'Select test set:',
    choices: testSets.map((t) => ({ name: t, value: t })),
    pageSize: testSets.length,
  })

  // Load test set
  const content = readFileSync(testSetPath, 'utf-8')
  const testSet = JSON.parse(content) as TestSetFile

  // Select difficulty
  const difficultyChoices = DIFFICULTIES.filter((d) => {
    const mazes = testSet.mazes[d]
    return mazes && mazes.length > 0
  }).map((d) => ({
    name: `${d} (${testSet.mazes[d]?.length} mazes)`,
    value: d,
  }))

  const difficulty = (await select({
    message: 'Select difficulty:',
    choices: difficultyChoices,
    pageSize: difficultyChoices.length,
  })) as Difficulty

  // Select specific maze
  const mazes = testSet.mazes[difficulty] || []
  const mazeChoices = mazes.map((m, i) => ({
    name: `Maze ${i + 1}: ${m.width}x${m.height}, shortest path: ${m.shortestPath}`,
    value: i,
  }))

  const mazeIndex = (await select({
    message: 'Select maze:',
    choices: mazeChoices,
    pageSize: Math.min(mazeChoices.length, 15),
  })) as number

  const maze = mazes[mazeIndex] as MazeWithPrompts

  // Select formats
  const formats = (await checkbox({
    message: 'Select prompt formats:',
    choices: PROMPT_FORMATS.map((f) => ({
      name: f,
      value: f,
      checked: f === 'ascii' || f === 'adjacency',
    })),
    required: true,
  })) as PromptFormat[]

  // Generate prompt
  const prompt = generatePrompt(maze, formats, maze.specialInstructions)

  // Output path
  const outputPath = await input({
    message: 'Output file path:',
    default: './debug/prompt-demo.txt',
  })

  // Ensure directory exists
  const dir = outputPath.split('/').slice(0, -1).join('/')
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Write prompt
  writeFileSync(outputPath, prompt, 'utf-8')

  console.log()
  console.log(chalk.dim('─'.repeat(50)))
  console.log(chalk.bold('Prompt Generated'))
  console.log(`  Maze: ${difficulty} #${mazeIndex + 1}`)
  console.log(`  Size: ${maze.width}x${maze.height}`)
  console.log(`  Shortest Path: ${maze.shortestPath}`)
  console.log(`  Formats: ${formats.join(', ')}`)
  console.log(`  Output: ${chalk.cyan(outputPath)}`)
  console.log(`  Length: ${prompt.length} chars`)
  console.log()

  // Show preview
  console.log(chalk.bold('Preview (first 500 chars):'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log(prompt.slice(0, 500))
  if (prompt.length > 500) {
    console.log(chalk.dim(`... (${prompt.length - 500} more chars)`))
  }
  console.log()
}

export const promptDemoCommand = new Command('prompt-demo')
  .description('Generate a prompt for inspection')
  .action(async () => {
    try {
      await run()
    } catch (err) {
      if (err instanceof ExitPromptError) {
        console.log(chalk.yellow('\nCancelled'))
        process.exit(0)
      }
      throw err
    }
  })
