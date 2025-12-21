/**
 * CLI command for deleting evaluations from the database
 */

import { existsSync } from 'node:fs'
import { ExitPromptError } from '@inquirer/core'
import { checkbox, confirm, select } from '@inquirer/prompts'
import chalk from 'chalk'
import { Command } from 'commander'
import { closeDatabase, initDatabase } from '../db/client'
import { DB_DIR, findDatabases, getRunSummaries } from './utils'

function deleteRuns(dbPath: string, runIds: string[]): number {
  const db = initDatabase(dbPath)

  let totalDeleted = 0
  for (const runId of runIds) {
    const result = db.run('DELETE FROM evaluations WHERE run_id = ?', [runId])
    totalDeleted += result.changes
  }

  closeDatabase()
  return totalDeleted
}

function formatOutcomes(outcomes: Record<string, number>): string {
  const parts: string[] = []
  if (outcomes.success) parts.push(chalk.green(`${outcomes.success} success`))
  if (outcomes.failure) parts.push(chalk.red(`${outcomes.failure} failure`))
  if (outcomes.parse_error) parts.push(chalk.yellow(`${outcomes.parse_error} parse_error`))
  if (outcomes.empty_response) parts.push(chalk.yellow(`${outcomes.empty_response} empty_response`))
  if (outcomes.token_limit) parts.push(chalk.yellow(`${outcomes.token_limit} token_limit`))
  if (outcomes.invalid_move) parts.push(chalk.red(`${outcomes.invalid_move} invalid_move`))
  if (outcomes.timeout) parts.push(chalk.yellow(`${outcomes.timeout} timeout`))
  if (outcomes.api_error) parts.push(chalk.red(`${outcomes.api_error} api_error`))
  return parts.join(', ') || 'none'
}

async function run() {
  console.log(chalk.bold('\nLMIQ Delete Evaluations'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  // Find available databases
  const databases = findDatabases()
  if (databases.length === 0) {
    console.error(chalk.red(`No databases found in ${DB_DIR}/`))
    process.exit(1)
  }

  const databasePath = await select({
    message: 'Select evaluation database:',
    choices: databases.map((d) => ({ name: d, value: d })),
    pageSize: databases.length,
  })

  // Get run summaries
  const summaries = getRunSummaries(databasePath)
  if (summaries.length === 0) {
    console.log(chalk.yellow('No evaluation runs found in database.'))
    process.exit(0)
  }

  // Show runs and let user select
  console.log()
  console.log(chalk.bold('Available Runs:'))
  console.log()

  const choices = summaries.map((s) => {
    const date = new Date(s.startedAt).toLocaleString()
    const label = `${s.model} - ${s.count} evals - ${date} - ${s.format}`
    const detail = `   ${chalk.dim(s.runId)} | ${formatOutcomes(s.outcomes)}`
    return {
      name: `${label}\n${detail}`,
      value: s.runId,
    }
  })

  const selectedRunIds = await checkbox({
    message: 'Select runs to delete:',
    choices,
    pageSize: Math.min(choices.length * 2, 20),
    required: true,
  })

  if (selectedRunIds.length === 0) {
    console.log(chalk.yellow('No runs selected.'))
    process.exit(0)
  }

  // Show what will be deleted
  console.log()
  console.log(chalk.bold('Will delete:'))
  let totalCount = 0
  for (const runId of selectedRunIds) {
    const summary = summaries.find((s) => s.runId === runId)!
    console.log(`  ${summary.model} (${summary.count} evaluations)`)
    console.log(`    ${chalk.dim(runId)}`)
    totalCount += summary.count
  }
  console.log()

  const confirmed = await confirm({
    message: `Delete ${totalCount} evaluation records?`,
    default: false,
  })

  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'))
    process.exit(0)
  }

  // Delete
  const deleted = deleteRuns(databasePath, selectedRunIds)

  console.log()
  console.log(chalk.green(`Deleted ${deleted} evaluation records.`))
  console.log()
}

export const deleteCommand = new Command('delete')
  .description('Delete evaluation runs from the database')
  .option('-d, --database <path>', 'Database path')
  .option('-r, --run-id <id>', 'Run ID to delete (skip interactive mode)')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options) => {
    // Non-interactive mode
    if (options.runId) {
      const dbPath = options.database || `${DB_DIR}/eval.db`
      if (!existsSync(dbPath)) {
        console.error(chalk.red(`Database not found: ${dbPath}`))
        process.exit(1)
      }

      const summaries = getRunSummaries(dbPath)
      const summary = summaries.find((s) => s.runId === options.runId)

      if (!summary) {
        console.error(chalk.red(`Run ID not found: ${options.runId}`))
        process.exit(1)
      }

      if (!options.yes) {
        console.log(`Will delete ${summary.count} evaluations for ${summary.model}`)
        console.log(`Run ID: ${options.runId}`)
        const confirmed = await confirm({
          message: 'Continue?',
          default: false,
        })
        if (!confirmed) {
          console.log(chalk.yellow('Cancelled'))
          process.exit(0)
        }
      }

      const deleted = deleteRuns(dbPath, [options.runId])
      console.log(chalk.green(`Deleted ${deleted} evaluation records.`))
      return
    }

    // Interactive mode
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
