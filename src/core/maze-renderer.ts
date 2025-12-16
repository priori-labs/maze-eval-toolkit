/**
 * Maze rendering utilities for generating prompts
 *
 * Supports multiple formats:
 * - ASCII: Visual grid representation
 * - Adjacency: Graph format showing connections
 * - Coordinate Matrix: Dense matrix with move notation
 * - 2D Matrix: Grid + explicit valid moves per cell
 */

import { getValidMoves } from './maze-solver'
import type { GeneratedMaze, Position, PromptFormat } from './types'

/**
 * Maze renderer interface for extensibility
 */
export interface MazeRenderer {
  name: PromptFormat
  render(maze: GeneratedMaze): string
}

/**
 * Render maze as ASCII art
 */
export function renderASCII(maze: GeneratedMaze): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []

  // Each cell is 3 chars wide, 2 chars tall (top border + content)
  for (let y = 0; y < height; y++) {
    let topLine = ''
    let midLine = ''

    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!

      // Top border
      topLine += cell.walls.top ? '+--' : '+  '

      // Left wall and content
      const leftWall = cell.walls.left ? '|' : ' '
      let content = '  '
      if (start.x === x && start.y === y) {
        content = 'P '
      } else if (goal.x === x && goal.y === y) {
        content = 'G '
      }
      midLine += leftWall + content
    }

    // Right edge
    topLine += '+'
    midLine += grid[y]![width - 1]!.walls.right ? '|' : ' '

    lines.push(topLine)
    lines.push(midLine)
  }

  // Bottom border
  let bottomLine = ''
  for (let x = 0; x < width; x++) {
    const cell = grid[height - 1]![x]!
    bottomLine += cell.walls.bottom ? '+--' : '+  '
  }
  bottomLine += '+'
  lines.push(bottomLine)

  return lines.join('\n')
}

/**
 * Render maze as block format with thick walls
 * Uses spaced symbols: # = wall, . = open path, S = start, G = goal
 */
export function renderBlock(maze: GeneratedMaze): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0

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

      // Cell position in block coordinates
      const bx = 2 * x + 1
      const by = 2 * y + 1

      // Carve the cell itself
      blocks[by]![bx] = '.'

      // Mark start and goal
      if (start.x === x && start.y === y) {
        blocks[by]![bx] = 'S'
      } else if (goal.x === x && goal.y === y) {
        blocks[by]![bx] = 'G'
      }

      // Carve passages (remove walls between cells)
      if (!cell.walls.right && x < width - 1) {
        blocks[by]![bx + 1] = '.'
      }
      if (!cell.walls.bottom && y < height - 1) {
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
export function renderAdjacency(maze: GeneratedMaze): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []

  lines.push('Adjacency List (each cell shows its neighbors):')
  lines.push('')

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const neighbors: string[] = []

      // Check each direction
      if (!cell.walls.top && y > 0) {
        neighbors.push(`(${x},${y - 1})`)
      }
      if (!cell.walls.bottom && y < height - 1) {
        neighbors.push(`(${x},${y + 1})`)
      }
      if (!cell.walls.left && x > 0) {
        neighbors.push(`(${x - 1},${y})`)
      }
      if (!cell.walls.right && x < width - 1) {
        neighbors.push(`(${x + 1},${y})`)
      }

      // Mark special positions
      let marker = ''
      if (start.x === x && start.y === y) {
        marker = ' [PLAYER START]'
      } else if (goal.x === x && goal.y === y) {
        marker = ' [GOAL]'
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
export function renderEdges(maze: GeneratedMaze): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []

  lines.push('Explicit Graph Edges (each node shows available actions and destinations):')
  lines.push('')

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      const edges: string[] = []

      // Check each direction with explicit action names
      if (!cell.walls.top && y > 0) {
        edges.push(`go UP to reach (${x},${y - 1})`)
      }
      if (!cell.walls.bottom && y < height - 1) {
        edges.push(`go DOWN to reach (${x},${y + 1})`)
      }
      if (!cell.walls.left && x > 0) {
        edges.push(`go LEFT to reach (${x - 1},${y})`)
      }
      if (!cell.walls.right && x < width - 1) {
        edges.push(`go RIGHT to reach (${x + 1},${y})`)
      }

      // Mark special positions
      let marker = ''
      if (start.x === x && start.y === y) {
        marker = ' [START]'
      } else if (goal.x === x && goal.y === y) {
        marker = ' [GOAL]'
      }

      // Format as natural language
      let edgesStr: string
      if (edges.length === 0) {
        edgesStr = 'No moves available.'
      } else if (edges.length === 1) {
        edgesStr = `You can ${edges[0]}.`
      } else {
        const lastEdge = edges.pop()!
        edgesStr = `You can ${edges.join(', ')} OR ${lastEdge}.`
      }

      lines.push(`From Node (${x},${y})${marker}: ${edgesStr}`)
    }
  }

  return lines.join('\n')
}

/**
 * Render maze as coordinate matrix with move notation
 */
export function renderCoordMatrix(maze: GeneratedMaze): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []

  lines.push('Coordinate Matrix (U=Up, D=Down, L=Left, R=Right, .=blocked):')
  lines.push('')

  // Header row with x coordinates
  let header = '    '
  for (let x = 0; x < width; x++) {
    header += x.toString().padStart(5, ' ')
  }
  lines.push(header)
  lines.push('')

  for (let y = 0; y < height; y++) {
    let line = `${y.toString().padStart(2, ' ')}  `

    for (let x = 0; x < width; x++) {
      const cell = grid[y]![x]!
      let moves = ''

      // Build move string
      moves += !cell.walls.top && y > 0 ? 'U' : '.'
      moves += !cell.walls.bottom && y < height - 1 ? 'D' : '.'
      moves += !cell.walls.left && x > 0 ? 'L' : '.'
      moves += !cell.walls.right && x < width - 1 ? 'R' : '.'

      // Mark special positions
      if (start.x === x && start.y === y) {
        moves = `P${moves.slice(1)}`
      } else if (goal.x === x && goal.y === y) {
        moves = `G${moves.slice(1)}`
      }

      line += moves.padStart(5, ' ')
    }

    lines.push(line)
  }

  return lines.join('\n')
}

/**
 * Render maze as 2D matrix with explicit valid moves
 */
export function renderMatrix2D(maze: GeneratedMaze): string {
  const { grid, start, goal } = maze
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const lines: string[] = []

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
      let cellChar = ' . '
      if (start.x === x && start.y === y) {
        cellChar = ' P '
      } else if (goal.x === x && goal.y === y) {
        cellChar = ' G '
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
      const pos: Position = { x, y }
      const validMoves = getValidMoves(grid, pos)

      let marker = ''
      if (start.x === x && start.y === y) {
        marker = ' <- PLAYER'
      } else if (goal.x === x && goal.y === y) {
        marker = ' <- GOAL'
      }

      const movesStr = validMoves.length > 0 ? `[${validMoves.join(', ')}]` : '[none]'
      lines.push(`(${x},${y}): ${movesStr}${marker}`)
    }
  }

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
  coordmatrix: { name: 'coordmatrix', render: renderCoordMatrix },
  matrix2d: { name: 'matrix2d', render: renderMatrix2D },
}

/**
 * Generate a complete prompt for LLM evaluation
 */
export function generatePrompt(
  maze: GeneratedMaze,
  formats: PromptFormat[],
  specialInstructions?: string,
): string {
  const sections: string[] = []

  // Introduction
  sections.push(
    'You are navigating a maze. Your task is to find the path from the start position (P) to the goal (G).',
  )
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

  // Add requested format sections
  for (const format of formats) {
    const renderer = RENDERERS[format]
    if (renderer) {
      sections.push(`--- ${format.toUpperCase()} VIEW ---`)
      sections.push('')
      sections.push(renderer.render(maze))
      sections.push('')
    }
  }

  // Instructions
  sections.push('--- INSTRUCTIONS ---')
  sections.push('')
  sections.push(
    'Provide your solution as a JSON array of moves. Each move should be an object with an "action" field.',
  )
  sections.push('Valid actions are: UP, DOWN, LEFT, RIGHT')
  sections.push('')
  sections.push('Example response format:')
  sections.push('[{"action": "DOWN"}, {"action": "RIGHT"}, {"action": "DOWN"}]')
  sections.push('')
  sections.push('Respond with ONLY the JSON array of moves, no additional text.')

  return sections.join('\n')
}

/**
 * Generate all prompts for a maze
 */
export function generateAllPrompts(maze: GeneratedMaze): Record<PromptFormat, string> {
  const specialInstructions = maze.specialInstructions
  return {
    ascii: generatePrompt(maze, ['ascii'], specialInstructions),
    block: generatePrompt(maze, ['block'], specialInstructions),
    adjacency: generatePrompt(maze, ['adjacency'], specialInstructions),
    edges: generatePrompt(maze, ['edges'], specialInstructions),
    coordmatrix: generatePrompt(maze, ['coordmatrix'], specialInstructions),
    matrix2d: generatePrompt(maze, ['matrix2d'], specialInstructions),
  }
}
