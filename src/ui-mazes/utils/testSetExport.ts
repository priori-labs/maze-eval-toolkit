/**
 * Test set export utilities for lmiq-v1-beta compatibility
 *
 * Exports saved mazes to the test set format used by the CLI evaluation system.
 * Uses core's prompt generation for consistency with CLI evaluation.
 */

import type { Difficulty, GeneratedMaze, MazeWithPrompts, PromptFormat, TestSetFile } from '@/core'
import { DIFFICULTIES, generateAllPrompts } from '@/core'
import { v4 as uuidv4 } from 'uuid'

import { solveMaze } from './mazeSolver'
import type { SavedMazeDesign } from './mazeStorage'

/**
 * Convert SavedMazeDesign array to TestSetFile format
 *
 * This produces a JSON file that can be directly used with the CLI evaluation system.
 * Uses core's prompt generation to ensure consistency with CLI evaluation.
 */
export function convertToTestSetFile(mazes: SavedMazeDesign[], testSetName: string): TestSetFile {
  // Initialize maze buckets by difficulty
  const mazesByDifficulty: Record<Difficulty, MazeWithPrompts[]> = {
    simple: [],
    easy: [],
    medium: [],
    hard: [],
    nightmare: [],
    horror: [],
  }

  // Process each saved maze
  for (const saved of mazes) {
    // Compute shortest path using existing solver (fallback)
    const stats = solveMaze(saved.grid, saved.start, saved.goal, [])

    // Use user's recorded optimal path length if available, otherwise use BFS
    // The user's shortestPathPlaythrough is their verified optimal solution
    const shortestPath =
      saved.shortestPathPlaythrough && saved.shortestPathPlaythrough.length > 0
        ? saved.shortestPathPlaythrough.length
        : stats.shortestPath

    // Build GeneratedMaze structure
    // Use persisted ID if available, otherwise generate new one
    const generatedMaze: GeneratedMaze = {
      id: saved.id ?? uuidv4(),
      difficulty: saved.difficulty,
      width: saved.width,
      height: saved.height,
      grid: saved.grid,
      start: saved.start,
      goal: saved.goal,
      shortestPath,
      generatedAt: new Date(saved.savedAt).toISOString(),
      // Constraint fields (convert null to undefined for optional fields)
      requirementType: saved.requirementType ?? undefined,
      requiredSolutionSubsequences: saved.requiredSolutionSubsequences,
      requiredTiles: saved.requiredTiles,
      specialInstructions: saved.specialInstructions,
      shortestPathPlaythrough: saved.shortestPathPlaythrough,
    }

    // Generate all prompt formats using core's generator for consistency with CLI
    const prompts = generateAllPrompts(generatedMaze)

    const mazeWithPrompts: MazeWithPrompts = {
      ...generatedMaze,
      prompts: prompts as Record<PromptFormat, string>,
    }

    // Add to appropriate difficulty bucket
    mazesByDifficulty[saved.difficulty].push(mazeWithPrompts)
  }

  // Build summary
  const byDifficulty: Record<Difficulty, number> = {
    simple: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    nightmare: 0,
    horror: 0,
  }
  let totalMazes = 0

  for (const diff of DIFFICULTIES) {
    byDifficulty[diff] = mazesByDifficulty[diff].length
    totalMazes += byDifficulty[diff]
  }

  // Return complete TestSetFile
  return {
    id: uuidv4(),
    name: testSetName,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    mazes: mazesByDifficulty,
    summary: {
      totalMazes,
      byDifficulty,
    },
  }
}
