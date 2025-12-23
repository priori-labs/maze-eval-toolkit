/**
 * Maze Storage Utilities - localStorage persistence for saved maze designs
 */

import { v4 as uuidv4 } from 'uuid'
import type { Cell, Difficulty, Position } from '../types'

export interface SavedMazeDesign {
  id?: string // Persistent UUID, generated on first save
  name: string
  savedAt: number
  difficulty: Difficulty
  width: number
  height: number
  grid: Cell[][]
  start: Position
  goal: Position
  requirementType: 'REQUIRED_SUBSEQUENCE' | 'REQUIRED_TILES' | null
  requiredSolutionSubsequences?: Array<
    Array<{ move: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; position: Position }>
  >
  shortestPathPlaythrough?: Array<{ move: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; position: Position }>
  requiredTiles?: Position[]
  specialInstructions?: string
}

const MAZE_DESIGNS_STORAGE_KEY = 'maze_designs'

/**
 * Get all saved mazes as an object keyed by name
 */
export function getSavedMazes(): Record<string, SavedMazeDesign> {
  if (typeof window === 'undefined') return {}
  const saved = localStorage.getItem(MAZE_DESIGNS_STORAGE_KEY)
  return saved ? JSON.parse(saved) : {}
}

/**
 * Get saved mazes as a sorted array (newest first)
 */
export function getSavedMazesList(): SavedMazeDesign[] {
  const mazes = getSavedMazes()
  return Object.values(mazes).sort((a, b) => b.savedAt - a.savedAt)
}

/**
 * Save a maze design to localStorage
 * Generates a persistent UUID if one doesn't exist
 */
export function saveMaze(design: SavedMazeDesign): SavedMazeDesign {
  if (typeof window === 'undefined') return design
  const mazes = getSavedMazes()

  // Preserve existing ID or generate new one
  const existingMaze = mazes[design.name]
  const savedDesign: SavedMazeDesign = {
    ...design,
    id: design.id ?? existingMaze?.id ?? uuidv4(),
  }

  mazes[design.name] = savedDesign
  localStorage.setItem(MAZE_DESIGNS_STORAGE_KEY, JSON.stringify(mazes))
  return savedDesign
}

/**
 * Load a maze design by name
 */
export function loadMaze(name: string): SavedMazeDesign | null {
  const mazes = getSavedMazes()
  return mazes[name] ?? null
}

/**
 * Delete a maze design by name
 */
export function deleteMaze(name: string): void {
  if (typeof window === 'undefined') return
  const mazes = getSavedMazes()
  delete mazes[name]
  localStorage.setItem(MAZE_DESIGNS_STORAGE_KEY, JSON.stringify(mazes))
}

/**
 * Check if a maze with the given name exists
 */
export function mazeExists(name: string): boolean {
  const mazes = getSavedMazes()
  return name in mazes
}

/**
 * Compare two grids for equality
 */
function gridsEqual(a: Cell[][], b: Cell[][]): boolean {
  if (a.length !== b.length) return false
  for (let y = 0; y < a.length; y++) {
    if (a[y].length !== b[y].length) return false
    for (let x = 0; x < a[y].length; x++) {
      const cellA = a[y][x]
      const cellB = b[y][x]
      // Compare wall structures
      if (
        cellA.walls.top !== cellB.walls.top ||
        cellA.walls.right !== cellB.walls.right ||
        cellA.walls.bottom !== cellB.walls.bottom ||
        cellA.walls.left !== cellB.walls.left
      ) {
        return false
      }
    }
  }
  return true
}

interface TestSetMaze {
  id: string
  grid: Cell[][]
  start: Position
  goal: Position
  difficulty: Difficulty
}

interface TestSetFile {
  mazes: Record<Difficulty, TestSetMaze[]>
}

/**
 * Sync maze IDs from an existing test set file to localStorage.
 * Matches mazes by grid structure, start/goal positions.
 * Returns the number of mazes updated.
 */
export function syncIdsFromTestSet(testSet: TestSetFile): {
  updated: number
  matched: Array<{ name: string; id: string }>
  unmatched: string[]
} {
  if (typeof window === 'undefined') return { updated: 0, matched: [], unmatched: [] }

  const savedMazes = getSavedMazes()
  const savedList = Object.values(savedMazes)
  const matched: Array<{ name: string; id: string }> = []
  const unmatched: string[] = []
  let updated = 0

  // Flatten test set mazes
  const testSetMazes: TestSetMaze[] = []
  for (const difficulty of Object.keys(testSet.mazes) as Difficulty[]) {
    testSetMazes.push(...(testSet.mazes[difficulty] ?? []))
  }

  // For each saved maze, try to find a match in the test set
  for (const saved of savedList) {
    let foundMatch = false

    for (const testMaze of testSetMazes) {
      // Match by grid, start, goal, and difficulty
      if (
        saved.difficulty === testMaze.difficulty &&
        saved.start.x === testMaze.start.x &&
        saved.start.y === testMaze.start.y &&
        saved.goal.x === testMaze.goal.x &&
        saved.goal.y === testMaze.goal.y &&
        gridsEqual(saved.grid, testMaze.grid)
      ) {
        // Found a match - update the ID
        if (saved.id !== testMaze.id) {
          savedMazes[saved.name] = { ...saved, id: testMaze.id }
          updated++
        }
        matched.push({ name: saved.name, id: testMaze.id })
        foundMatch = true
        break
      }
    }

    if (!foundMatch) {
      unmatched.push(saved.name)
    }
  }

  // Save updated mazes
  if (updated > 0) {
    localStorage.setItem(MAZE_DESIGNS_STORAGE_KEY, JSON.stringify(savedMazes))
  }

  return { updated, matched, unmatched }
}
