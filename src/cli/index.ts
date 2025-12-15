#!/usr/bin/env bun
/**
 * LMIQ v1 Beta CLI
 *
 * Commands:
 * - generate: Generate a test set of mazes
 * - evaluate: Run model evaluation on a test set
 * - score: Compute LMIQ scores from evaluation results
 * - export: Export evaluation results to JSON
 * - delete: Delete evaluation runs from database
 * - retry: Retry failed evaluations from a previous run
 * - prompt-demo: Generate a prompt for inspection
 */

import { program } from 'commander'
import { deleteCommand } from './delete'
import { evaluateCommand } from './evaluate'
import { exportCommand } from './export'
import { generateCommand } from './generate'
import { promptDemoCommand } from './prompt-demo'
import { retryCommand } from './retry'
import { scoreCommand } from './score'

program.name('lmiq').description('LMIQ v1 Beta - AI Maze Solving Benchmark').version('0.1.0')

program.addCommand(generateCommand)
program.addCommand(evaluateCommand)
program.addCommand(scoreCommand)
program.addCommand(exportCommand)
program.addCommand(deleteCommand)
program.addCommand(retryCommand)
program.addCommand(promptDemoCommand)

program.parse()
