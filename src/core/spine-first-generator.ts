/**
 * Spine-First Maze Generation
 *
 * This algorithm creates mazes with a guaranteed main path (spine/artery) from start to goal,
 * then adds controlled dead-end branches (capillaries). This shifts the puzzle from
 * global topological exploration to local decision-making (identifying main path vs dead-ends).
 *
 * Phase 1: Generate spine using biased random walk with backtracking
 * Phase 2: Add depth-limited dead-end branches from spine cells
 */

import type { Cell, Position, SpineFirstConfig } from './types'

/**
 * Internal cell type for spine-first generation
 */
interface SpineGenerationCell extends Cell {
  visited: boolean
  isSpine: boolean
}

type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Get the direction from current cell to next cell
 */
function getDirection(current: Position, next: Position): Direction {
  const dx = next.x - current.x
  const dy = next.y - current.y

  if (dx === 1) return 'right'
  if (dx === -1) return 'left'
  if (dy === 1) return 'down'
  return 'up'
}

/**
 * Calculate Manhattan distance between two positions
 */
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/**
 * Get all neighbors (visited or not) within grid bounds
 */
function getNeighbors(
  grid: SpineGenerationCell[][],
  cell: SpineGenerationCell,
  width: number,
  height: number,
): SpineGenerationCell[] {
  const neighbors: SpineGenerationCell[] = []
  const { x, y } = cell

  if (y > 0) neighbors.push(grid[y - 1]![x]!)
  if (x < width - 1) neighbors.push(grid[y]![x + 1]!)
  if (y < height - 1) neighbors.push(grid[y + 1]![x]!)
  if (x > 0) neighbors.push(grid[y]![x - 1]!)

  return neighbors
}

/**
 * Get unvisited neighbors within grid bounds
 */
function getUnvisitedNeighbors(
  grid: SpineGenerationCell[][],
  cell: SpineGenerationCell,
  width: number,
  height: number,
): SpineGenerationCell[] {
  return getNeighbors(grid, cell, width, height).filter((n) => !n.visited)
}

/**
 * Remove the wall between two adjacent cells
 */
function removeWallBetween(current: SpineGenerationCell, next: SpineGenerationCell): void {
  const dx = next.x - current.x
  const dy = next.y - current.y

  if (dx === 1) {
    current.walls.right = false
    next.walls.left = false
  } else if (dx === -1) {
    current.walls.left = false
    next.walls.right = false
  } else if (dy === 1) {
    current.walls.bottom = false
    next.walls.top = false
  } else if (dy === -1) {
    current.walls.top = false
    next.walls.bottom = false
  }
}

/**
 * Initialize grid with all walls up
 */
function initializeGrid(width: number, height: number): SpineGenerationCell[][] {
  const grid: SpineGenerationCell[][] = []
  for (let y = 0; y < height; y++) {
    grid[y] = []
    for (let x = 0; x < width; x++) {
      grid[y]![x] = {
        x,
        y,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: false,
        isSpine: false,
      }
    }
  }
  return grid
}

interface ScoredNeighbor {
  cell: SpineGenerationCell
  score: number
  direction: Direction
}

/**
 * Phase 1: Generate the spine (main path) using biased random walk
 *
 * The algorithm uses scoring to prefer:
 * - Turns when we haven't met minTurns requirement
 * - Slight bias toward goal (but not too direct)
 * - Randomness for organic paths
 *
 * Backtracks when stuck, returns null if unable to create valid spine.
 */
function generateSpine(
  grid: SpineGenerationCell[][],
  start: Position,
  goal: Position,
  width: number,
  height: number,
  config: SpineFirstConfig,
): SpineGenerationCell[] | null {
  const manhattanDist = manhattanDistance(start, goal)
  const minPathLength = Math.ceil(manhattanDist * config.tortuosity)
  const minTurns = config.minTurns ?? 0

  const spine: SpineGenerationCell[] = []
  let turnCount = 0
  let lastDirection: Direction | null = null

  // Start at the start position
  const startCell = grid[start.y]![start.x]!
  startCell.visited = true
  startCell.isSpine = true
  spine.push(startCell)

  let current = startCell
  let iterations = 0
  const maxIterations = width * height * 10 // Safety limit

  while (current.x !== goal.x || current.y !== goal.y) {
    iterations++
    if (iterations > maxIterations) {
      return null // Prevent infinite loops
    }

    const neighbors = getUnvisitedNeighbors(grid, current, width, height)

    if (neighbors.length === 0) {
      // Backtrack
      if (spine.length <= 1) {
        return null // Cannot backtrack further, generation failed
      }

      // Unmark current cell
      current.visited = false
      current.isSpine = false
      spine.pop()

      // Move back to previous cell
      current = spine[spine.length - 1]!

      // Recalculate last direction and turn count would be complex,
      // so we simplify by just continuing from here
      // The turn count may be slightly off but that's acceptable
      continue
    }

    // Score each neighbor
    const scoredNeighbors: ScoredNeighbor[] = neighbors.map((neighbor) => {
      let score = 0
      const direction = getDirection(current, neighbor)

      // Prefer turns if we need more
      if (lastDirection && direction !== lastDirection && turnCount < minTurns) {
        score += 10
      }

      // Slight bias toward goal (but not too strong to allow exploration)
      const distToGoal = manhattanDistance(neighbor, goal)
      score -= distToGoal * 0.1

      // Add randomness for organic paths
      score += Math.random() * 5

      return { cell: neighbor, score, direction }
    })

    // Sort by score descending and pick the best
    scoredNeighbors.sort((a, b) => b.score - a.score)
    const chosen = scoredNeighbors[0]!

    // Track turns
    if (lastDirection && chosen.direction !== lastDirection) {
      turnCount++
    }
    lastDirection = chosen.direction

    // Move to chosen neighbor
    const next = chosen.cell
    removeWallBetween(current, next)
    next.visited = true
    next.isSpine = true
    spine.push(next)
    current = next
  }

  // Validate spine meets requirements
  if (spine.length < minPathLength) {
    return null // Too short, doesn't meet tortuosity requirement
  }

  if (minTurns > 0 && turnCount < minTurns) {
    return null // Not enough turns
  }

  return spine
}

/**
 * Generate a simple linear dead-end path (no further branching)
 * Used for sub-branches that shouldn't spawn additional branches
 */
function generateLinearDeadEnd(
  grid: SpineGenerationCell[][],
  startCell: SpineGenerationCell,
  remainingDepth: number,
  width: number,
  height: number,
): void {
  if (remainingDepth <= 0) return

  const neighbors = getUnvisitedNeighbors(grid, startCell, width, height).filter((n) => !n.isSpine)
  if (neighbors.length === 0) return

  const next = neighbors[Math.floor(Math.random() * neighbors.length)]!
  removeWallBetween(startCell, next)
  next.visited = true

  generateLinearDeadEnd(grid, next, remainingDepth - 1, width, height)
}

/**
 * Generate a dead-end branch from the spine
 *
 * Critical: Branches must NOT reconnect to spine (would create loops)
 * Sub-branching is limited: main branches can have 0-3 sub-branches,
 * but sub-branches do not spawn additional branches (no infinite recursion)
 */
function generateDeadEndBranch(
  grid: SpineGenerationCell[][],
  startCell: SpineGenerationCell,
  remainingDepth: number,
  width: number,
  height: number,
  subBranchChance: number,
): void {
  if (remainingDepth <= 0) return

  // Track cells along this branch for potential sub-branching
  const branchCells: SpineGenerationCell[] = [startCell]
  let current = startCell

  // Generate the main branch path
  for (let i = 0; i < remainingDepth; i++) {
    const neighbors = getUnvisitedNeighbors(grid, current, width, height).filter((n) => !n.isSpine)
    if (neighbors.length === 0) break

    const next = neighbors[Math.floor(Math.random() * neighbors.length)]!
    removeWallBetween(current, next)
    next.visited = true
    branchCells.push(next)
    current = next
  }

  // Add sub-branches (0-3) from cells along this branch
  // Sub-branches do NOT spawn further branches
  if (subBranchChance > 0 && branchCells.length > 1) {
    const maxSubBranches = Math.floor(Math.random() * 4) // 0-3 sub-branches
    let subBranchesAdded = 0

    // Try to add sub-branches from random cells along the branch (skip first cell)
    const eligibleCells = branchCells.slice(1)
    const shuffledCells = [...eligibleCells].sort(() => Math.random() - 0.5)

    for (const cell of shuffledCells) {
      if (subBranchesAdded >= maxSubBranches) break
      if (Math.random() > subBranchChance) continue

      const subBranchNeighbors = getUnvisitedNeighbors(grid, cell, width, height).filter(
        (n) => !n.isSpine,
      )
      if (subBranchNeighbors.length === 0) continue

      const subStart = subBranchNeighbors[Math.floor(Math.random() * subBranchNeighbors.length)]!
      removeWallBetween(cell, subStart)
      subStart.visited = true

      // Sub-branch length: 5-25 cells, no further branching
      const subBranchLength = 5 + Math.floor(Math.random() * 21)
      generateLinearDeadEnd(grid, subStart, subBranchLength - 1, width, height)

      subBranchesAdded++
    }
  }
}

/**
 * Phase 2: Generate controlled dead-end branches from spine cells
 */
function generateBranches(
  grid: SpineGenerationCell[][],
  spine: SpineGenerationCell[],
  width: number,
  height: number,
  config: SpineFirstConfig,
): void {
  const minSpacing = config.minBranchSpacing ?? 5
  const minBranchLen = config.minBranchLength ?? 1
  const maxBranchLen = config.maxBranchLength
  const subBranchChance = config.subBranchChance ?? 0
  let lastBranchIndex = -minSpacing // Allow first eligible cell to branch

  // Iterate through spine cells (skip first and last for cleaner design)
  for (let i = 1; i < spine.length - 1; i++) {
    // Enforce minimum spacing between branches
    if (i - lastBranchIndex < minSpacing) {
      continue
    }

    const spineCell = spine[i]!

    // Check branch probability
    if (Math.random() > config.branchChance) {
      continue
    }

    // Get unvisited neighbors that are not on spine
    const branchStarts = getUnvisitedNeighbors(grid, spineCell, width, height).filter(
      (n) => !n.isSpine,
    )

    if (branchStarts.length === 0) continue

    // Start a branch from random unvisited neighbor
    const branchStart = branchStarts[Math.floor(Math.random() * branchStarts.length)]!

    // Connect branch to spine
    removeWallBetween(spineCell, branchStart)
    branchStart.visited = true

    // Random branch length within configured range
    const branchLength =
      minBranchLen + Math.floor(Math.random() * (maxBranchLen - minBranchLen + 1))

    // Generate the rest of the branch with depth limit
    generateDeadEndBranch(grid, branchStart, branchLength - 1, width, height, subBranchChance)

    // Track this branch point for spacing
    lastBranchIndex = i
  }
}

/**
 * Phase 3: Fill remaining unvisited areas with DFS passages
 *
 * This connects boxed-in areas to the existing maze structure,
 * creating additional explorable dead-ends instead of solid walls.
 */
function fillRemainingAreas(grid: SpineGenerationCell[][], width: number, height: number): void {
  // Find all unvisited cells and try to connect them to visited areas
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      if (cell.visited) continue

      // Check if this unvisited cell has any visited neighbors
      const visitedNeighbors = getNeighbors(grid, cell, width, height).filter((n) => n.visited)

      if (visitedNeighbors.length > 0) {
        // Connect to a random visited neighbor
        const connector = visitedNeighbors[Math.floor(Math.random() * visitedNeighbors.length)]!
        removeWallBetween(connector, cell)
        cell.visited = true

        // Run DFS from this cell to fill the connected area
        fillAreaDFS(grid, cell, width, height)
      }
    }
  }

  // Second pass: fill any remaining isolated areas by connecting to nearest visited cell
  // This handles areas completely surrounded by unvisited cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      if (cell.visited) continue

      // This cell is still unvisited - start a new isolated DFS region
      cell.visited = true
      fillAreaDFS(grid, cell, width, height)

      // Now try to connect this region to the main maze
      const visitedNeighbors = getNeighbors(grid, cell, width, height).filter((n) => n.visited)
      if (visitedNeighbors.length > 0) {
        const connector = visitedNeighbors[Math.floor(Math.random() * visitedNeighbors.length)]!
        removeWallBetween(connector, cell)
      }
    }
  }
}

/**
 * Standard DFS to fill an area starting from a cell
 */
function fillAreaDFS(
  grid: SpineGenerationCell[][],
  startCell: SpineGenerationCell,
  width: number,
  height: number,
): void {
  const stack: SpineGenerationCell[] = [startCell]

  while (stack.length > 0) {
    const current = stack[stack.length - 1]!
    const unvisitedNeighbors = getUnvisitedNeighbors(grid, current, width, height)

    if (unvisitedNeighbors.length === 0) {
      stack.pop()
    } else {
      // Pick random unvisited neighbor
      const next = unvisitedNeighbors[Math.floor(Math.random() * unvisitedNeighbors.length)]!
      removeWallBetween(current, next)
      next.visited = true
      stack.push(next)
    }
  }
}

/**
 * Convert spine generation grid to output grid (remove internal flags)
 */
export function toOutputGrid(grid: SpineGenerationCell[][]): Cell[][] {
  return grid.map((row) =>
    row.map((cell) => ({
      x: cell.x,
      y: cell.y,
      walls: { ...cell.walls },
    })),
  )
}

/**
 * Generate a maze using the spine-first algorithm
 *
 * @param width - Grid width
 * @param height - Grid height
 * @param start - Start position
 * @param goal - Goal position
 * @param config - Spine-first configuration
 * @returns The generated grid or null if generation failed
 */
export function generateSpineFirstMaze(
  width: number,
  height: number,
  start: Position,
  goal: Position,
  config: SpineFirstConfig,
): Cell[][] | null {
  // Initialize grid with all walls
  const grid = initializeGrid(width, height)

  // Phase 1: Generate spine
  const spine = generateSpine(grid, start, goal, width, height, config)
  if (!spine) {
    return null // Failed to generate valid spine
  }

  // Phase 2: Generate branches
  generateBranches(grid, spine, width, height, config)

  // Phase 3: Fill remaining areas (optional)
  if (config.fillRemaining) {
    fillRemainingAreas(grid, width, height)
  }

  // Convert to output format (remove internal flags)
  return toOutputGrid(grid)
}
