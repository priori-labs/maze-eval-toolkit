/**
 * Maze rendering utilities for generating prompts
 *
 * Supports multiple formats:
 * - ASCII: Visual grid representation
 * - Adjacency: Graph format showing connections
 * - Coordinate Matrix: Dense matrix with move notation
 * - 2D Matrix: Grid + explicit valid moves per cell
 *
 * All renderers support optional experimental features (holes, portals, wildcards)
 * for ui-mazes gameplay testing.
 */

import type {
  ExitDoorPair,
  ExperimentalPromptOptions,
  ExperimentalRenderOptions,
  GeneratedMaze,
  PromptFormat,
} from './types'
import { getPerspectiveRotationDescription, isPositionInHole } from './types'

/**
 * Maze renderer interface for extensibility
 */
export interface MazeRenderer {
  name: PromptFormat
  render(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string
}

/**
 * Check if a cell has a portal exit in a given direction
 */
function hasPortalExit(
  exitDoorPair: ExitDoorPair | null | undefined,
  x: number,
  y: number,
  direction: 'top' | 'bottom' | 'left' | 'right',
): boolean {
  if (!exitDoorPair) return false
  const { portal1, portal2 } = exitDoorPair
  return (
    (portal1.x === x && portal1.y === y && portal1.side === direction) ||
    (portal2.x === x && portal2.y === y && portal2.side === direction)
  )
}

/**
 * Check if a position is a portal cell
 */
function isPortalPosition(
  exitDoorPair: ExitDoorPair | null | undefined,
  x: number,
  y: number,
): boolean {
  if (!exitDoorPair) return false
  const { portal1, portal2 } = exitDoorPair
  return (portal1.x === x && portal1.y === y) || (portal2.x === x && portal2.y === y)
}

/**
 * Render maze as ASCII art
 */
export function renderASCII(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []
  const holes = options?.holes ?? []
  const wildcardTile = options?.wildcardTile

  // Each cell is 3 chars wide, 2 chars tall (top border + content)
  for (let y = 0; y < height; y++) {
    let topLine = ''
    let midLine = ''

    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const isHole = isPositionInHole({ x, y }, holes)
      const isWildcard = wildcardTile && x === wildcardTile.x && y === wildcardTile.y

      // Top border - holes render as XX
      if (isHole) {
        topLine += '+XX'
      } else {
        topLine += cell.walls.top ? '+--' : '+  '
      }

      // Left wall and content
      const leftWall = isHole ? 'X' : cell.walls.left ? '|' : ' '
      let content = '  '
      if (isHole) {
        content = 'XX'
      } else if (start.x === x && start.y === y) {
        content = 'P '
      } else if (goal.x === x && goal.y === y) {
        content = 'G '
      } else if (isWildcard) {
        content = '? '
      }
      midLine += leftWall + content
    }

    // Right edge
    topLine += '+'
    const lastCellIsHole = isPositionInHole({ x: width - 1, y }, holes)
    midLine += lastCellIsHole ? 'X' : grid[y]![width - 1]!.walls.right ? '|' : ' '

    lines.push(topLine)
    lines.push(midLine)
  }

  // Bottom border
  let bottomLine = ''
  for (let x = 0; x < width; x++) {
    const isHole = isPositionInHole({ x, y: height - 1 }, holes)
    if (isHole) {
      bottomLine += '+XX'
    } else {
      bottomLine += grid[height - 1]![x]!.walls.bottom ? '+--' : '+  '
    }
  }
  bottomLine += '+'
  lines.push(bottomLine)

  return lines.join('\n')
}

/**
 * Render maze as block format with thick walls
 * Uses spaced symbols: # = wall, . = open path, S = start, G = goal
 */
export function renderBlock(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const holes = options?.holes ?? []
  const wildcardTile = options?.wildcardTile

  // Block maze dimensions: (2*width+1) x (2*height+1)
  const blockHeight = 2 * height + 1
  const blockWidth = 2 * width + 1

  // Initialize all as walls
  const blocks: string[][] = []
  for (let by = 0; by < blockHeight; by++) {
    blocks.push(new Array(blockWidth).fill('#'))
  }

  // Carve out cells and passages
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const isHole = isPositionInHole({ x, y }, holes)
      const isWildcard = wildcardTile && x === wildcardTile.x && y === wildcardTile.y

      // Cell position in block coordinates
      const bx = 2 * x + 1
      const by = 2 * y + 1

      // Handle holes
      if (isHole) {
        blocks[by]![bx] = 'X'
        continue
      }

      // Carve the cell itself
      blocks[by]![bx] = '.'

      // Mark start, goal, wildcard
      if (start.x === x && start.y === y) {
        blocks[by]![bx] = 'S'
      } else if (goal.x === x && goal.y === y) {
        blocks[by]![bx] = 'G'
      } else if (isWildcard) {
        blocks[by]![bx] = '?'
      }

      // Carve passages (remove walls between cells, but not into holes)
      if (!cell.walls.right && x < width - 1 && !isPositionInHole({ x: x + 1, y }, holes)) {
        blocks[by]![bx + 1] = '.'
      }
      if (!cell.walls.bottom && y < height - 1 && !isPositionInHole({ x, y: y + 1 }, holes)) {
        blocks[by + 1]![bx] = '.'
      }
    }
  }

  // Convert to spaced string format
  const lines: string[] = []
  for (let by = 0; by < blockHeight; by++) {
    lines.push(blocks[by]!.join(' '))
  }

  return lines.join('\n')
}

/**
 * Render maze as adjacency list (graph format)
 */
export function renderAdjacency(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []
  const holes = options?.holes ?? []
  const exitDoorPair = options?.exitDoorPair
  const wildcardTile = options?.wildcardTile

  lines.push('Adjacency List (each cell shows its neighbors):')
  lines.push('')

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const isHole = isPositionInHole({ x, y }, holes)

      // Hole cells have no neighbors
      if (isHole) {
        lines.push(`(${x},${y}) [HOLE] -> (none - void)`)
        continue
      }

      const neighbors: string[] = []

      // Check each direction (exclude moves into holes, include portal exits)
      if (!cell.walls.top && y > 0 && !isPositionInHole({ x, y: y - 1 }, holes)) {
        neighbors.push(`(${x},${y - 1})`)
      } else if (!cell.walls.top && y === 0 && hasPortalExit(exitDoorPair, x, y, 'top')) {
        neighbors.push('(?)')
      }

      if (!cell.walls.bottom && y < height - 1 && !isPositionInHole({ x, y: y + 1 }, holes)) {
        neighbors.push(`(${x},${y + 1})`)
      } else if (
        !cell.walls.bottom &&
        y === height - 1 &&
        hasPortalExit(exitDoorPair, x, y, 'bottom')
      ) {
        neighbors.push('(?)')
      }

      if (!cell.walls.left && x > 0 && !isPositionInHole({ x: x - 1, y }, holes)) {
        neighbors.push(`(${x - 1},${y})`)
      } else if (!cell.walls.left && x === 0 && hasPortalExit(exitDoorPair, x, y, 'left')) {
        neighbors.push('(?)')
      }

      if (!cell.walls.right && x < width - 1 && !isPositionInHole({ x: x + 1, y }, holes)) {
        neighbors.push(`(${x + 1},${y})`)
      } else if (
        !cell.walls.right &&
        x === width - 1 &&
        hasPortalExit(exitDoorPair, x, y, 'right')
      ) {
        neighbors.push('(?)')
      }

      // Mark special positions
      let marker = ''
      if (start.x === x && start.y === y) {
        marker = ' [PLAYER START]'
      } else if (goal.x === x && goal.y === y) {
        marker = ' [GOAL]'
      } else if (wildcardTile && x === wildcardTile.x && y === wildcardTile.y) {
        marker = ' [?]'
      }

      const neighborStr = neighbors.length > 0 ? neighbors.join(', ') : '(none)'
      lines.push(`(${x},${y})${marker} -> ${neighborStr}`)
    }
  }

  return lines.join('\n')
}

/**
 * Render maze as explicit graph edges with action labels
 * Tests pure graph traversal without spatial reasoning
 */
export function renderEdges(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []
  const holes = options?.holes ?? []
  const exitDoorPair = options?.exitDoorPair
  const wildcardTile = options?.wildcardTile

  lines.push('Explicit Graph Edges (each node shows available actions and destinations):')
  lines.push('')

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const isHole = isPositionInHole({ x, y }, holes)

      // Hole cells have no neighbors
      if (isHole) {
        lines.push(`From Node (${x},${y}) [HOLE]: No moves available.`)
        continue
      }

      const edges: string[] = []

      // Check each direction with explicit action names (exclude holes, include portals)
      if (!cell.walls.top && y > 0 && !isPositionInHole({ x, y: y - 1 }, holes)) {
        edges.push(`go UP to reach (${x},${y - 1})`)
      } else if (!cell.walls.top && y === 0 && hasPortalExit(exitDoorPair, x, y, 'top')) {
        edges.push('go UP to reach (?)')
      }

      if (!cell.walls.bottom && y < height - 1 && !isPositionInHole({ x, y: y + 1 }, holes)) {
        edges.push(`go DOWN to reach (${x},${y + 1})`)
      } else if (
        !cell.walls.bottom &&
        y === height - 1 &&
        hasPortalExit(exitDoorPair, x, y, 'bottom')
      ) {
        edges.push('go DOWN to reach (?)')
      }

      if (!cell.walls.left && x > 0 && !isPositionInHole({ x: x - 1, y }, holes)) {
        edges.push(`go LEFT to reach (${x - 1},${y})`)
      } else if (!cell.walls.left && x === 0 && hasPortalExit(exitDoorPair, x, y, 'left')) {
        edges.push('go LEFT to reach (?)')
      }

      if (!cell.walls.right && x < width - 1 && !isPositionInHole({ x: x + 1, y }, holes)) {
        edges.push(`go RIGHT to reach (${x + 1},${y})`)
      } else if (
        !cell.walls.right &&
        x === width - 1 &&
        hasPortalExit(exitDoorPair, x, y, 'right')
      ) {
        edges.push('go RIGHT to reach (?)')
      }

      // Mark special positions
      let marker = ''
      if (start.x === x && start.y === y) {
        marker = ' [START]'
      } else if (goal.x === x && goal.y === y) {
        marker = ' [GOAL]'
      } else if (wildcardTile && x === wildcardTile.x && y === wildcardTile.y) {
        marker = ' [?]'
      }

      // Format as natural language
      let edgesStr: string
      if (edges.length === 0) {
        edgesStr = 'No moves available.'
      } else if (edges.length === 1) {
        edgesStr = `You can ${edges[0]}.`
      } else {
        const allButLast = edges.slice(0, -1)
        const lastEdge = edges[edges.length - 1]!
        edgesStr = `You can ${allButLast.join(', ')} OR ${lastEdge}.`
      }

      lines.push(`From Node (${x},${y})${marker}: ${edgesStr}`)
    }
  }

  return lines.join('\n')
}

/**
 * Render maze as coordinate matrix with move notation
 */
export function renderCoordMatrix(
  maze: GeneratedMaze,
  options?: ExperimentalRenderOptions,
): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []
  const holes = options?.holes ?? []
  const exitDoorPair = options?.exitDoorPair
  const wildcardTile = options?.wildcardTile

  lines.push('Coordinate Matrix (U=Up, D=Down, L=Left, R=Right, .=blocked):')
  lines.push('')

  // Header row with x coordinates
  let header = '    '
  for (let x = 0; x < width; x++) {
    header += `x=${x}`.padStart(7)
  }
  lines.push(header)

  for (let y = 0; y < height; y++) {
    let line = `y=${y} `.padEnd(4)

    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const isHole = isPositionInHole({ x, y }, holes)

      // Holes are marked specially with no valid moves
      if (isHole) {
        line += 'H:....'.padStart(7)
        continue
      }

      let moves = ''

      // Build move string: UDLR format (exclude moves into holes, use ? for portals)
      if (!cell.walls.top && y > 0 && !isPositionInHole({ x, y: y - 1 }, holes)) {
        moves += 'U'
      } else if (!cell.walls.top && y === 0 && hasPortalExit(exitDoorPair, x, y, 'top')) {
        moves += '?'
      } else {
        moves += '.'
      }

      if (!cell.walls.bottom && y < height - 1 && !isPositionInHole({ x, y: y + 1 }, holes)) {
        moves += 'D'
      } else if (
        !cell.walls.bottom &&
        y === height - 1 &&
        hasPortalExit(exitDoorPair, x, y, 'bottom')
      ) {
        moves += '?'
      } else {
        moves += '.'
      }

      if (!cell.walls.left && x > 0 && !isPositionInHole({ x: x - 1, y }, holes)) {
        moves += 'L'
      } else if (!cell.walls.left && x === 0 && hasPortalExit(exitDoorPair, x, y, 'left')) {
        moves += '?'
      } else {
        moves += '.'
      }

      if (!cell.walls.right && x < width - 1 && !isPositionInHole({ x: x + 1, y }, holes)) {
        moves += 'R'
      } else if (
        !cell.walls.right &&
        x === width - 1 &&
        hasPortalExit(exitDoorPair, x, y, 'right')
      ) {
        moves += '?'
      } else {
        moves += '.'
      }

      // Add marker for player/goal/wildcard
      if (start.x === x && start.y === y) {
        moves = `P:${moves}`
      } else if (goal.x === x && goal.y === y) {
        moves = `G:${moves}`
      } else if (wildcardTile && x === wildcardTile.x && y === wildcardTile.y) {
        moves = `W:${moves}`
      } else {
        moves = `  ${moves}`
      }

      line += moves.padStart(7)
    }

    lines.push(line)
  }

  return lines.join('\n')
}

/**
 * Render maze as 2D matrix with explicit valid moves
 */
export function renderMatrix2D(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []
  const holes = options?.holes ?? []
  const wildcardTile = options?.wildcardTile

  // Part 1: Visual grid
  lines.push('=== MAZE GRID ===')
  lines.push(`Dimensions: ${width}x${height}`)
  lines.push(`Player Start: (${start.x},${start.y})`)
  lines.push(`Goal: (${goal.x},${goal.y})`)
  lines.push('')

  // Header row
  let header = '   '
  for (let x = 0; x < width; x++) {
    header += x.toString().padStart(3, ' ')
  }
  lines.push(header)

  for (let y = 0; y < height; y++) {
    let line = `${y.toString().padStart(2, ' ')} `

    for (let x = 0; x < width; x++) {
      const isHole = isPositionInHole({ x, y }, holes)
      const isPlayer = start.x === x && start.y === y
      const isGoal = goal.x === x && goal.y === y
      const isWildcard = wildcardTile && x === wildcardTile.x && y === wildcardTile.y

      let cellChar: string
      if (isHole) {
        cellChar = ' X '
      } else if (isPlayer) {
        cellChar = ' P '
      } else if (isGoal) {
        cellChar = ' G '
      } else if (isWildcard) {
        cellChar = ' ? '
      } else {
        cellChar = ' . '
      }
      line += cellChar
    }

    lines.push(line)
  }

  // Part 2: Valid moves list
  lines.push('')
  lines.push('=== VALID MOVES ===')
  lines.push('')

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isHole = isPositionInHole({ x, y }, holes)

      if (isHole) continue // Skip holes - can't move from them

      const cell = grid[y]![x]!
      const moves: string[] = []

      // Check each direction - can move if no wall AND destination is not a hole
      if (!cell.walls.top && y > 0 && !isPositionInHole({ x, y: y - 1 }, holes)) {
        moves.push('UP')
      }
      if (!cell.walls.bottom && y < height - 1 && !isPositionInHole({ x, y: y + 1 }, holes)) {
        moves.push('DOWN')
      }
      if (!cell.walls.left && x > 0 && !isPositionInHole({ x: x - 1, y }, holes)) {
        moves.push('LEFT')
      }
      if (!cell.walls.right && x < width - 1 && !isPositionInHole({ x: x + 1, y }, holes)) {
        moves.push('RIGHT')
      }

      // Add marker for player/goal
      const isPlayer = start.x === x && start.y === y
      const isGoal = goal.x === x && goal.y === y
      const marker = isPlayer ? ' <- PLAYER' : isGoal ? ' <- GOAL' : ''

      const movesStr = moves.length > 0 ? `[${moves.join(', ')}]` : '[none]'
      lines.push(`(${x},${y}): ${movesStr}${marker}`)
    }
  }

  return lines.join('\n')
}

/**
 * Render maze using the MazeBench Coordinate Token format.
 * Each cell is represented as: <|row-col|><|wall_token|><|content_token|>
 *
 * Wall tokens use combinations of up/down/left/right (e.g., <|up_left_wall|>)
 * Content tokens: <|blank|>, <|origin|>, <|target|>, <|void|>, <|portal|>, <|wildcard|>
 *
 * Reference: https://arxiv.org/html/2502.14669v1
 */
export function renderCoordinateToken(
  maze: GeneratedMaze,
  options?: ExperimentalRenderOptions,
): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []
  const holes = options?.holes ?? []
  const exitDoorPair = options?.exitDoorPair
  const wildcardTile = options?.wildcardTile

  for (let row = 0; row < height; row++) {
    let rowStr = ''

    for (let col = 0; col < width; col++) {
      const cell = grid[row]![col]!

      // Build coordinate token: <|row-col|>
      rowStr += `<|${row}-${col}|>`

      // Build wall token from cell walls (top→up, bottom→down)
      // Order must be consistent: up, down, left, right
      const walls: string[] = []
      if (cell.walls.top) walls.push('up')
      if (cell.walls.bottom) walls.push('down')
      if (cell.walls.left) walls.push('left')
      if (cell.walls.right) walls.push('right')

      const wallToken = walls.length === 0 ? 'no_wall' : `${walls.join('_')}_wall`
      rowStr += `<|${wallToken}|>`

      // Build content token (priority: origin > target > void > portal > wildcard > blank)
      const isStart = col === start.x && row === start.y
      const isGoal = col === goal.x && row === goal.y
      const isHole = isPositionInHole({ x: col, y: row }, holes)
      const isPortal = isPortalPosition(exitDoorPair, col, row)
      const isWildcard = wildcardTile && wildcardTile.x === col && wildcardTile.y === row

      let contentToken = 'blank'
      if (isStart) contentToken = 'origin'
      else if (isGoal) contentToken = 'target'
      else if (isHole) contentToken = 'void'
      else if (isPortal) contentToken = 'portal'
      else if (isWildcard) contentToken = 'wildcard'

      rowStr += `<|${contentToken}|>`
    }

    lines.push(rowStr)
  }

  return lines.join('\n')
}

/**
 * Render maze as integer grid (ARC-style 2D array)
 *
 * Encoding (bitmask):
 * - 1 = wall top
 * - 2 = wall right
 * - 4 = wall bottom
 * - 8 = wall left
 * - 16 = start
 * - 32 = goal
 * - 64 = hole (void)
 */
export function renderBlockGrid(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const { grid, width, height, start, goal } = maze
  const holes = options?.holes ?? []
  const rows = height * 2 + 1
  const cols = width * 2 + 1

  const output: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))

  // Fill with walls first
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      output[y]![x] = 1
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const gy = y * 2 + 1
      const gx = x * 2 + 1
      const isHole = isPositionInHole({ x, y }, holes)

      output[gy]![gx] = isHole ? 4 : 0

      if (!cell.walls.top) output[gy - 1]![gx] = 0
      if (!cell.walls.right) output[gy]![gx + 1] = 0
      if (!cell.walls.bottom) output[gy + 1]![gx] = 0
      if (!cell.walls.left) output[gy]![gx - 1] = 0
    }
  }

  const startY = start.y * 2 + 1
  const startX = start.x * 2 + 1
  output[startY]![startX] = 2

  const goalY = goal.y * 2 + 1
  const goalX = goal.x * 2 + 1
  output[goalY]![goalX] = 3

  const lines: string[] = []
  lines.push('Legend:')
  lines.push('0=path, 1=wall, 2=start, 3=goal, 4=hole')
  lines.push('')
  lines.push('Grid:')
  lines.push('[')
  for (let i = 0; i < output.length; i++) {
    const row = output[i]!
    const suffix = i === output.length - 1 ? '' : ','
    lines.push(`  [${row.join(', ')}]${suffix}`)
  }
  lines.push(']')

  return lines.join('\n')
}

/**
 * Render maze as combined edges + ASCII format
 * Provides both the explicit graph edges and visual ASCII representation
 */
export function renderEdgesAscii(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const lines: string[] = []

  // Add edges section
  lines.push(renderEdges(maze, options))
  lines.push('')

  // Add ASCII section
  lines.push('--- ASCII VISUALIZATION ---')
  lines.push('')
  lines.push(renderASCII(maze, options))

  return lines.join('\n')
}

/**
 * Render maze as combined ASCII + Block format
 * Provides both line-based ASCII and block-based representations
 */
export function renderAsciiBlock(maze: GeneratedMaze, options?: ExperimentalRenderOptions): string {
  const lines: string[] = []

  // Add ASCII section
  lines.push('--- ASCII REPRESENTATION ---')
  lines.push('')
  lines.push(renderASCII(maze, options))
  lines.push('')

  // Add Block section
  lines.push('--- BLOCK REPRESENTATION ---')
  lines.push('')
  lines.push(renderBlock(maze, options))

  return lines.join('\n')
}

/**
 * All available renderers
 */
export const RENDERERS: Record<PromptFormat, MazeRenderer> = {
  ascii: { name: 'ascii', render: renderASCII },
  block: { name: 'block', render: renderBlock },
  adjacency: { name: 'adjacency', render: renderAdjacency },
  edges: { name: 'edges', render: renderEdges },
  edges_ascii: { name: 'edges_ascii', render: renderEdgesAscii },
  ascii_block: { name: 'ascii_block', render: renderAsciiBlock },
  coordmatrix: { name: 'coordmatrix', render: renderCoordMatrix },
  matrix2d: { name: 'matrix2d', render: renderMatrix2D },
  coordtoken: { name: 'coordtoken', render: renderCoordinateToken },
  blockgrid: { name: 'blockgrid', render: renderBlockGrid },
}

/**
 * Generate a complete prompt for LLM evaluation
 *
 * @param maze - The maze to generate a prompt for
 * @param formats - The prompt formats to include
 * @param specialInstructions - Optional special instructions to include
 * @param experimentalOptions - Optional experimental features (holes, portals, etc.)
 */
export function generatePrompt(
  maze: GeneratedMaze,
  formats: PromptFormat[],
  specialInstructions?: string,
  experimentalOptions?: ExperimentalPromptOptions,
): string {
  const sections: string[] = []
  const renderOptions: ExperimentalRenderOptions = {
    holes: experimentalOptions?.holes,
    exitDoorPair: experimentalOptions?.exitDoorPair,
    wildcardTile: experimentalOptions?.wildcardTile,
  }

  const hasHoles = (experimentalOptions?.holes?.length ?? 0) > 0
  const hasPortals = experimentalOptions?.exitDoorPair != null
  const hasWildcard = experimentalOptions?.wildcardTile != null
  const isMoveByMove =
    experimentalOptions?.executionMode === 'moveByMove' && experimentalOptions?.moveByMoveContext
  const perspectiveRotation = experimentalOptions?.perspectiveRotation ?? 'none'

  // Perspective rotation description (if enabled)
  const perspectiveDesc =
    perspectiveRotation !== 'none'
      ? `\n[PERSPECTIVE ROTATION] ${getPerspectiveRotationDescription(perspectiveRotation)}\n`
      : ''

  // Introduction
  if (isMoveByMove) {
    sections.push('You are solving a maze move-by-move. Navigate from the start to G (goal).')
  } else {
    sections.push(
      'You are navigating a maze. Your task is to find a path from the start position (P) to the goal (G).',
    )
  }

  if (perspectiveDesc) {
    sections.push(perspectiveDesc)
  }

  sections.push('')
  sections.push(`Maze dimensions: ${maze.width}x${maze.height}`)
  sections.push(`Start position: (${maze.start.x},${maze.start.y})`)
  sections.push(`Goal position: (${maze.goal.x},${maze.goal.y})`)
  sections.push('')

  // Add special requirements if present
  if (specialInstructions) {
    sections.push('--- SPECIAL REQUIREMENTS ---')
    sections.push('')
    sections.push(specialInstructions)
    sections.push('')
  }

  // Add requested format sections with appropriate legends
  const includesBlockGrid = formats.includes('blockgrid')
  for (const format of formats) {
    const renderer = RENDERERS[format]
    if (renderer) {
      sections.push(`--- ${format.toUpperCase()} VIEW ---`)
      sections.push('')
      sections.push(renderer.render(maze, renderOptions))

      // Add legends for experimental features
      const legends: string[] = []
      if (hasHoles) {
        legends.push('- X = Hole (void) - DO NOT ENTER, you will lose!')
      }
      if (hasPortals) {
        legends.push('- ? = Portal (unknown destination)')
      }
      if (hasWildcard) {
        legends.push('- ? = Wildcard tile (passable)')
      }
      if (legends.length > 0) {
        sections.push('')
        sections.push('LEGEND:')
        sections.push(legends.join('\n'))
      }
      if (includesBlockGrid && format === 'blockgrid') {
        sections.push('')
        sections.push('BLOCKGRID NOTE:')
        sections.push('- Moves are still between maze cells (odd,odd positions in this grid).')
        sections.push(
          '- A move RIGHT goes from one cell to the next (skipping over the wall cell between).',
        )
      }
      sections.push('')
    }
  }

  // Move-by-move context (if applicable)
  if (isMoveByMove && experimentalOptions?.moveByMoveContext) {
    const { startPos, currentPos, moveHistory } = experimentalOptions.moveByMoveContext
    const moveHistoryStr =
      moveHistory.length > 0 ? moveHistory.join(', ') : '(none - this is your first move)'

    sections.push('CURRENT STATE:')
    sections.push(`- Start position: (${startPos.x},${startPos.y})`)
    sections.push(`- Current position: (${currentPos.x},${currentPos.y}) - marked as P in the maze`)
    sections.push(`- Moves taken so far: ${moveHistoryStr}`)
    sections.push(`- Total moves so far: ${moveHistory.length}`)
    sections.push('')
  }

  // Build valid actions list
  let validActions = 'Valid actions: "UP", "DOWN", "LEFT", "RIGHT"'
  if (experimentalOptions?.includeUnreachableInstructions) {
    validActions += ', "GOAL_UNREACHABLE", "UNDECIDED"'
  }
  if (experimentalOptions?.applyTimePressure) {
    validActions += ', "INSUFFICIENT_TIME"'
  }

  // Instructions section
  sections.push('--- INSTRUCTIONS ---')
  sections.push('')

  // Rules
  sections.push('RULES:')
  sections.push('- You can only move UP, DOWN, LEFT, or RIGHT')
  sections.push('- You cannot pass through walls')
  if (hasHoles) {
    sections.push('- DANGER: Holes (marked X) are void spaces - entering a hole means you LOSE!')
  }
  if (isMoveByMove) {
    sections.push('- You are deciding ONE move at a time - what is your next move?')
  } else {
    sections.push('- Find a path to the goal (shortest path preferred, but any valid path works)')
  }
  sections.push('')

  // Unreachable instructions (if enabled)
  if (experimentalOptions?.includeUnreachableInstructions) {
    sections.push(
      'For this maze, it may be unsolvable. If you decide it\'s impossible to navigate to the goal return { "action": "GOAL_UNREACHABLE" }. If undecided, return { "action": "UNDECIDED" }.',
    )
    sections.push('')
  }

  // Time pressure instructions (if enabled)
  if (experimentalOptions?.applyTimePressure) {
    sections.push('TIME PRESSURE WARNING:')
    sections.push(
      'You are under strict time pressure. Do not use extended reasoning or run tools. Use quick heuristics. Respond within ~30 seconds. If insufficient time, return { "action": "INSUFFICIENT_TIME" }.',
    )
    sections.push('')
  }

  sections.push(
    'IMPORTANT: Please do not write any code to solve the maze. This is a test of your visual/intuitive reasoning path-finding skills.',
  )
  sections.push('')

  // Response format
  if (isMoveByMove) {
    sections.push(
      'You can solve it move-by-move. You will be re-prompted after every move to continue.',
    )
    sections.push('')
    sections.push('Return ONLY a JSON object with your NEXT SINGLE MOVE in this exact format:')
    sections.push('{"comments":"<brief reasoning for this move>","action":"UP"}')
  } else {
    sections.push('Return ONLY a JSON object in this exact format (no other text):')
    sections.push(
      '{"comments":"<your comments here>","actions":[{"action":"UP"},{"action":"LEFT"},{"action":"DOWN"}]}',
    )
  }
  sections.push('')
  sections.push(validActions)

  return sections.join('\n')
}

/**
 * Generate all prompts for a maze
 */
export function generateAllPrompts(
  maze: GeneratedMaze,
  experimentalOptions?: ExperimentalPromptOptions,
): Record<PromptFormat, string> {
  const specialInstructions = maze.specialInstructions
  return {
    ascii: generatePrompt(maze, ['ascii'], specialInstructions, experimentalOptions),
    block: generatePrompt(maze, ['block'], specialInstructions, experimentalOptions),
    adjacency: generatePrompt(maze, ['adjacency'], specialInstructions, experimentalOptions),
    edges: generatePrompt(maze, ['edges'], specialInstructions, experimentalOptions),
    edges_ascii: generatePrompt(maze, ['edges_ascii'], specialInstructions, experimentalOptions),
    ascii_block: generatePrompt(maze, ['ascii_block'], specialInstructions, experimentalOptions),
    coordmatrix: generatePrompt(maze, ['coordmatrix'], specialInstructions, experimentalOptions),
    matrix2d: generatePrompt(maze, ['matrix2d'], specialInstructions, experimentalOptions),
    coordtoken: generatePrompt(maze, ['coordtoken'], specialInstructions, experimentalOptions),
    blockgrid: generatePrompt(maze, ['blockgrid'], specialInstructions, experimentalOptions),
  }
}
