/**
 * Maze generation using Depth-First Search (DFS)
 *
 * Simplified from apps/mazes - no rooms, hallways, obstacles, or special features.
 * Just pure DFS maze generation with optional extra paths.
 */

import { v4 as uuidv4 } from 'uuid'
import { getDifficultyConfig, getSpineFirstConfig, randomDimension } from './difficulty'
import { solveMaze } from './maze-solver'
import { generateSpineFirstMaze } from './spine-first-generator'
import type {
  Cell,
  Difficulty,
  GeneratedMaze,
  GenerationMode,
  Position,
  SpineFirstConfig,
} from './types'

/**
 * Options for maze generation
 */
export interface GenerationOptions {
  /** Generation algorithm mode (default: 'dfs') */
  mode?: GenerationMode
  /** Configuration for spine-first mode (uses difficulty defaults if not provided) */
  spineFirst?: Partial<SpineFirstConfig>
  /** Override minimum shortest path (uses difficulty default if not provided) */
  minShortestPath?: number
}

/**
 * Internal cell type used during generation (includes visited flag)
 */
interface GenerationCell extends Cell {
  visited: boolean
}

/**
 * Get unvisited neighbors for DFS
 */
function getUnvisitedNeighbors(
  grid: GenerationCell[][],
  cell: GenerationCell,
  width: number,
  height: number,
): GenerationCell[] {
  const neighbors: GenerationCell[] = []
  const { x, y } = cell

  // Top
  if (y > 0) {
    const neighbor = grid[y - 1]?.[x]
    if (neighbor && !neighbor.visited) {
      neighbors.push(neighbor)
    }
  }
  // Right
  if (x < width - 1) {
    const neighbor = grid[y]?.[x + 1]
    if (neighbor && !neighbor.visited) {
      neighbors.push(neighbor)
    }
  }
  // Bottom
  if (y < height - 1) {
    const neighbor = grid[y + 1]?.[x]
    if (neighbor && !neighbor.visited) {
      neighbors.push(neighbor)
    }
  }
  // Left
  if (x > 0) {
    const neighbor = grid[y]?.[x - 1]
    if (neighbor && !neighbor.visited) {
      neighbors.push(neighbor)
    }
  }

  return neighbors
}

/**
 * Remove the wall between two adjacent cells
 */
function removeWallBetween(current: GenerationCell, next: GenerationCell): void {
  const dx = next.x - current.x
  const dy = next.y - current.y

  if (dx === 1) {
    // Next is to the right
    current.walls.right = false
    next.walls.left = false
  } else if (dx === -1) {
    // Next is to the left
    current.walls.left = false
    next.walls.right = false
  } else if (dy === 1) {
    // Next is below
    current.walls.bottom = false
    next.walls.top = false
  } else if (dy === -1) {
    // Next is above
    current.walls.top = false
    next.walls.bottom = false
  }
}

/**
 * Generate a maze grid using iterative DFS
 */
function generateMazeGrid(width: number, height: number, extraPaths: number): GenerationCell[][] {
  // Initialize grid with all walls
  const grid: GenerationCell[][] = []
  for (let y = 0; y < height; y++) {
    grid[y] = []
    for (let x = 0; x < width; x++) {
      grid[y]![x] = {
        x,
        y,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: false,
      }
    }
  }

  // Start DFS from (0, 0)
  const stack: GenerationCell[] = []
  const startCell = grid[0]![0]!
  startCell.visited = true
  stack.push(startCell)

  // Iterative DFS maze generation
  while (stack.length > 0) {
    const current = stack[stack.length - 1]!
    const neighbors = getUnvisitedNeighbors(grid, current, width, height)

    if (neighbors.length === 0) {
      // Backtrack
      stack.pop()
    } else {
      // Pick a random unvisited neighbor
      const next = neighbors[Math.floor(Math.random() * neighbors.length)]!
      removeWallBetween(current, next)
      next.visited = true
      stack.push(next)
    }
  }

  // Add extra paths (random wall removals) to make maze easier
  if (extraPaths > 0) {
    const numExtraPaths = Math.floor((width * height) / extraPaths)
    for (let i = 0; i < numExtraPaths; i++) {
      const x = Math.floor(Math.random() * (width - 1))
      const y = Math.floor(Math.random() * (height - 1))
      const direction = Math.random() < 0.5 ? 'right' : 'bottom'

      if (direction === 'right' && x < width - 1) {
        grid[y]![x]!.walls.right = false
        grid[y]![x + 1]!.walls.left = false
      } else if (direction === 'bottom' && y < height - 1) {
        grid[y]![x]!.walls.bottom = false
        grid[y + 1]![x]!.walls.top = false
      }
    }
  }

  return grid
}

/**
 * Place start and goal positions in opposite corners of the maze
 * Randomly selects between diagonal pairs and swaps start/goal for variety
 */
function placeStartAndGoal(width: number, height: number): { start: Position; goal: Position } {
  const thirdWidth = Math.ceil(width / 3)
  const thirdHeight = Math.ceil(height / 3)

  // Define the four corner quadrants
  const topLeft: Position = {
    x: Math.floor(Math.random() * thirdWidth),
    y: Math.floor(Math.random() * thirdHeight),
  }
  const topRight: Position = {
    x: width - 1 - Math.floor(Math.random() * thirdWidth),
    y: Math.floor(Math.random() * thirdHeight),
  }
  const bottomLeft: Position = {
    x: Math.floor(Math.random() * thirdWidth),
    y: height - 1 - Math.floor(Math.random() * thirdHeight),
  }
  const bottomRight: Position = {
    x: width - 1 - Math.floor(Math.random() * thirdWidth),
    y: height - 1 - Math.floor(Math.random() * thirdHeight),
  }

  // Randomly select diagonal pair: (top-left, bottom-right) or (bottom-left, top-right)
  const useTLBR = Math.random() < 0.5
  const [cornerA, cornerB] = useTLBR ? [topLeft, bottomRight] : [bottomLeft, topRight]

  // Randomly swap which corner is start vs goal
  const swapStartGoal = Math.random() < 0.5

  return swapStartGoal ? { start: cornerB, goal: cornerA } : { start: cornerA, goal: cornerB }
}

/**
 * Convert generation grid to output grid (remove visited flag)
 */
function toOutputGrid(grid: GenerationCell[][]): Cell[][] {
  return grid.map((row) =>
    row.map((cell) => ({
      x: cell.x,
      y: cell.y,
      walls: { ...cell.walls },
    })),
  )
}

/**
 * Generate a single maze for a given difficulty
 *
 * @param difficulty - The difficulty level
 * @param maxAttempts - Maximum attempts to meet minShortestPath requirement
 * @param options - Optional generation options (mode, spine-first config)
 * @returns Generated maze or null if unable to meet requirements
 */
export function generateMaze(
  difficulty: Difficulty,
  maxAttempts = 2500,
  options?: GenerationOptions,
): GeneratedMaze | null {
  const config = getDifficultyConfig(difficulty)
  const mode = options?.mode ?? 'dfs'
  const minShortestPath = options?.minShortestPath ?? config.minShortestPath

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Random dimensions within range
    const width = randomDimension(config.minWidth, config.maxWidth)
    const height = randomDimension(config.minHeight, config.maxHeight)

    // Place start and goal (needed before spine-first generation)
    const { start, goal } = placeStartAndGoal(width, height)

    let outputGrid: Cell[][]

    if (mode === 'spine-first') {
      // Use spine-first algorithm with merged config
      const spineConfig = getSpineFirstConfig(difficulty, options?.spineFirst)
      const result = generateSpineFirstMaze(width, height, start, goal, spineConfig)
      if (!result) {
        continue // Failed to generate valid spine, retry
      }
      outputGrid = result
    } else {
      // Use default DFS algorithm
      const grid = generateMazeGrid(width, height, config.extraPaths)
      outputGrid = toOutputGrid(grid)
    }

    // Calculate shortest path
    const stats = solveMaze(outputGrid, start, goal)

    // Check if maze meets requirements
    if (stats.shortestPath >= minShortestPath && stats.shortestPath !== -1) {
      return {
        id: uuidv4(),
        difficulty,
        width,
        height,
        grid: outputGrid,
        start,
        goal,
        shortestPath: stats.shortestPath,
        generatedAt: new Date().toISOString(),
      }
    }
  }

  // Failed to generate a valid maze
  return null
}

/**
 * Generate multiple mazes for a difficulty level
 *
 * @param difficulty - The difficulty level
 * @param count - Number of mazes to generate
 * @param onProgress - Optional callback for progress updates
 * @param options - Optional generation options (mode, spine-first config)
 * @returns Array of generated mazes
 */
export function generateMazes(
  difficulty: Difficulty,
  count: number,
  onProgress?: (current: number, total: number) => void,
  options?: GenerationOptions,
): GeneratedMaze[] {
  const mazes: GeneratedMaze[] = []

  for (let i = 0; i < count; i++) {
    const maze = generateMaze(difficulty, 2500, options)
    if (maze) {
      mazes.push(maze)
    }
    onProgress?.(i + 1, count)
  }

  return mazes
}
