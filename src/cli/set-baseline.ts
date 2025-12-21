/**
 * CLI command for setting custom human baselines on a test set
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { confirm, input, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import type { TestSetFile, TestSetHumanBaselines } from '../core/types'

interface SetBaselineOptions {
  testSet?: string
  avgTime?: number
  avgAccuracy?: number
  eliteTime?: number
  eliteAccuracy?: number
  show?: boolean
  clear?: boolean
}

function loadTestSet(path: string): TestSetFile {
  const content = readFileSync(path, 'utf-8')
  return JSON.parse(content) as TestSetFile
}

function saveTestSet(path: string, testSet: TestSetFile): void {
  writeFileSync(path, JSON.stringify(testSet, null, 2))
}

function printBaselines(testSet: TestSetFile): void {
  console.log(chalk.bold(`\nTest Set: ${testSet.name}`))
  console.log(chalk.dim('─'.repeat(50)))

  if (testSet.humanBaselines) {
    console.log(chalk.green('Custom baselines configured:'))
    console.log(
      `  Average: ${testSet.humanBaselines.average.timeSeconds}s, ${(testSet.humanBaselines.average.accuracy * 100).toFixed(1)}% accuracy`,
    )
    if (testSet.humanBaselines.elite) {
      console.log(
        `  Elite:   ${testSet.humanBaselines.elite.timeSeconds}s, ${(testSet.humanBaselines.elite.accuracy * 100).toFixed(1)}% accuracy`,
      )
    } else {
      console.log(chalk.dim('  Elite:   (not set, will use average)'))
    }
  } else {
    console.log(chalk.yellow('No custom baselines configured'))
    console.log(chalk.dim('Using default difficulty-based baselines'))
  }
  console.log()
}

function validateNumber(value: string, label: string, min: number, max?: number): number | string {
  const num = Number.parseFloat(value)
  if (Number.isNaN(num)) return `${label} must be a number`
  if (num < min) return `${label} must be >= ${min}`
  if (max !== undefined && num > max) return `${label} must be <= ${max}`
  return num
}

async function promptForBaselines(): Promise<{
  avgTime: number
  avgAccuracy: number
  eliteTime?: number
  eliteAccuracy?: number
}> {
  const avgTimeStr = await input({
    message: 'Average human solve time (seconds):',
    default: '30',
    validate: (v) => {
      const result = validateNumber(v, 'Time', 0.1)
      return typeof result === 'number' ? true : result
    },
  })
  const avgTime = Number.parseFloat(avgTimeStr)

  const avgAccuracyStr = await input({
    message: 'Average human accuracy (0-1):',
    default: '0.95',
    validate: (v) => {
      const result = validateNumber(v, 'Accuracy', 0.01, 1.0)
      return typeof result === 'number' ? true : result
    },
  })
  const avgAccuracy = Number.parseFloat(avgAccuracyStr)

  const includeElite = await confirm({
    message: 'Set separate elite baseline?',
    default: false,
  })

  if (!includeElite) {
    return { avgTime, avgAccuracy }
  }

  const eliteTimeStr = await input({
    message: 'Elite human solve time (seconds):',
    default: String(Math.round(avgTime * 0.5)),
    validate: (v) => {
      const result = validateNumber(v, 'Time', 0.1)
      return typeof result === 'number' ? true : result
    },
  })
  const eliteTime = Number.parseFloat(eliteTimeStr)

  const eliteAccuracyStr = await input({
    message: 'Elite human accuracy (0-1):',
    default: String(Math.min(avgAccuracy + 0.02, 1.0).toFixed(2)),
    validate: (v) => {
      const result = validateNumber(v, 'Accuracy', 0.01, 1.0)
      return typeof result === 'number' ? true : result
    },
  })
  const eliteAccuracy = Number.parseFloat(eliteAccuracyStr)

  return { avgTime, avgAccuracy, eliteTime, eliteAccuracy }
}

function findTestSets(): string[] {
  const testSetsDir = './test-sets'
  if (!existsSync(testSetsDir)) return []
  return readdirSync(testSetsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => `${testSetsDir}/${f}`)
}

async function runSetBaseline(options: SetBaselineOptions): Promise<void> {
  let testSetPath = options.testSet

  // If no test set specified, prompt for selection
  if (!testSetPath) {
    const testSets = findTestSets()
    if (testSets.length === 0) {
      console.error(chalk.red('No test sets found in ./test-sets/'))
      process.exit(1)
    }

    testSetPath = await select({
      message: 'Select test set:',
      choices: testSets.map((f) => {
        const testSet = loadTestSet(f)
        const hasBaseline = testSet.humanBaselines ? chalk.green(' [custom baseline]') : ''
        return {
          name: `${testSet.name} (${testSet.summary.totalMazes} mazes)${hasBaseline}`,
          value: f,
        }
      }),
    })
  }

  if (!existsSync(testSetPath)) {
    console.error(chalk.red(`Test set not found: ${testSetPath}`))
    process.exit(1)
  }

  const testSet = loadTestSet(testSetPath)

  // Show mode
  if (options.show) {
    printBaselines(testSet)
    return
  }

  // Clear mode
  if (options.clear) {
    if (testSet.humanBaselines) {
      testSet.humanBaselines = undefined
      saveTestSet(testSetPath, testSet)
      console.log(chalk.green('Custom baselines cleared'))
      printBaselines(testSet)
    } else {
      console.log(chalk.yellow('No custom baselines to clear'))
    }
    return
  }

  // Set baselines
  printBaselines(testSet)

  let avgTime: number
  let avgAccuracy: number
  let eliteTime: number | undefined
  let eliteAccuracy: number | undefined

  // Check if values provided via CLI
  if (options.avgTime !== undefined && options.avgAccuracy !== undefined) {
    avgTime = options.avgTime
    avgAccuracy = options.avgAccuracy
    eliteTime = options.eliteTime
    eliteAccuracy = options.eliteAccuracy
  } else {
    // Interactive mode
    const values = await promptForBaselines()
    avgTime = values.avgTime
    avgAccuracy = values.avgAccuracy
    eliteTime = values.eliteTime
    eliteAccuracy = values.eliteAccuracy
  }

  // Build new baselines
  const newBaselines: TestSetHumanBaselines = {
    average: {
      timeSeconds: avgTime,
      accuracy: avgAccuracy,
    },
  }

  if (eliteTime !== undefined && eliteAccuracy !== undefined) {
    newBaselines.elite = {
      timeSeconds: eliteTime,
      accuracy: eliteAccuracy,
    }
  }

  testSet.humanBaselines = newBaselines
  saveTestSet(testSetPath, testSet)

  console.log(chalk.green('\nBaselines updated!'))
  printBaselines(testSet)
}

export const setBaselineCommand = new Command('set-baseline')
  .description('Set custom human baselines for a test set')
  .option('-t, --test-set <path>', 'Path to test set JSON file')
  .option('--avg-time <seconds>', 'Average human solve time in seconds', Number.parseFloat)
  .option('--avg-accuracy <value>', 'Average human accuracy (0-1)', Number.parseFloat)
  .option('--elite-time <seconds>', 'Elite human solve time in seconds', Number.parseFloat)
  .option('--elite-accuracy <value>', 'Elite human accuracy (0-1)', Number.parseFloat)
  .option('--show', 'Show current baselines without modifying')
  .option('--clear', 'Remove custom baselines (use defaults)')
  .action(async (options) => {
    try {
      await runSetBaseline(options as SetBaselineOptions)
    } catch (err) {
      if (err instanceof ExitPromptError) {
        console.log(chalk.yellow('\nCancelled'))
        process.exit(0)
      }
      throw err
    }
  })
