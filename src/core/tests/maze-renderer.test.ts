/**
 * Tests for maze rendering and prompt generation
 */

import { describe, expect, test } from 'bun:test'
import {
  RENDERERS,
  generateAllPrompts,
  generatePrompt,
  renderASCII,
  renderAdjacency,
  renderBlock,
  renderCoordMatrix,
  renderCoordinateToken,
  renderEdges,
  renderMatrix2D,
} from '../maze-renderer'
import type { GeneratedMaze } from '../types'

/**
 * Create a simple 3x3 test maze
 *
 * Layout:
 * +--+--+--+
 * |P       |
 * +  +--+  +
 * |     |  |
 * +  +  +  +
 * |     | G|
 * +--+--+--+
 */
function createTestMaze(): GeneratedMaze {
  return {
    id: 'test-maze',
    difficulty: 'simple',
    width: 3,
    height: 3,
    start: { x: 0, y: 0 },
    goal: { x: 2, y: 2 },
    shortestPath: 4,
    generatedAt: '2024-01-01T00:00:00Z',
    grid: [
      [
        { x: 0, y: 0, walls: { top: true, right: false, bottom: false, left: true } },
        { x: 1, y: 0, walls: { top: true, right: false, bottom: true, left: false } },
        { x: 2, y: 0, walls: { top: true, right: true, bottom: false, left: false } },
      ],
      [
        { x: 0, y: 1, walls: { top: false, right: false, bottom: false, left: true } },
        { x: 1, y: 1, walls: { top: true, right: true, bottom: false, left: false } },
        { x: 2, y: 1, walls: { top: false, right: true, bottom: false, left: true } },
      ],
      [
        { x: 0, y: 2, walls: { top: false, right: false, bottom: true, left: true } },
        { x: 1, y: 2, walls: { top: false, right: true, bottom: true, left: false } },
        { x: 2, y: 2, walls: { top: false, right: true, bottom: true, left: true } },
      ],
    ],
  }
}

describe('renderASCII', () => {
  test('renders maze with player and goal markers', () => {
    const maze = createTestMaze()
    const ascii = renderASCII(maze)

    expect(ascii).toContain('P ')
    expect(ascii).toContain('G ')
  })

  test('renders walls correctly', () => {
    const maze = createTestMaze()
    const ascii = renderASCII(maze)

    // Should have border walls
    expect(ascii).toContain('+--')
    expect(ascii).toContain('|')
  })

  test('renders holes with XX markers', () => {
    const maze = createTestMaze()
    const holes = [{ x: 1, y: 1, width: 1, height: 1 }]
    const ascii = renderASCII(maze, { holes })

    expect(ascii).toContain('XX')
  })
})

describe('renderBlock', () => {
  test('renders maze with S and G markers', () => {
    const maze = createTestMaze()
    const block = renderBlock(maze)

    expect(block).toContain('S')
    expect(block).toContain('G')
  })

  test('uses # for walls and . for open spaces', () => {
    const maze = createTestMaze()
    const block = renderBlock(maze)

    expect(block).toContain('#')
    expect(block).toContain('.')
  })

  test('renders holes as X', () => {
    const maze = createTestMaze()
    const holes = [{ x: 1, y: 1, width: 1, height: 1 }]
    const block = renderBlock(maze, { holes })

    expect(block).toContain('X')
  })
})

describe('renderAdjacency', () => {
  test('lists neighbors for each cell', () => {
    const maze = createTestMaze()
    const adj = renderAdjacency(maze)

    expect(adj).toContain('Adjacency List')
    expect(adj).toContain('[PLAYER START]')
    expect(adj).toContain('[GOAL]')
  })

  test('marks holes correctly', () => {
    const maze = createTestMaze()
    const holes = [{ x: 1, y: 1, width: 1, height: 1 }]
    const adj = renderAdjacency(maze, { holes })

    expect(adj).toContain('[HOLE]')
  })
})

describe('renderEdges', () => {
  test('shows available actions per node', () => {
    const maze = createTestMaze()
    const edges = renderEdges(maze)

    expect(edges).toContain('Explicit Graph Edges')
    expect(edges).toContain('go UP')
    expect(edges).toContain('go DOWN')
    expect(edges).toContain('[START]')
    expect(edges).toContain('[GOAL]')
  })
})

describe('renderCoordMatrix', () => {
  test('shows UDLR move notation', () => {
    const maze = createTestMaze()
    const matrix = renderCoordMatrix(maze)

    expect(matrix).toContain('Coordinate Matrix')
    expect(matrix).toContain('U=Up')
    expect(matrix).toContain('D=Down')
    expect(matrix).toContain('L=Left')
    expect(matrix).toContain('R=Right')
    expect(matrix).toContain('P:') // Player marker
    expect(matrix).toContain('G:') // Goal marker
  })

  test('marks holes with H:', () => {
    const maze = createTestMaze()
    const holes = [{ x: 1, y: 1, width: 1, height: 1 }]
    const matrix = renderCoordMatrix(maze, { holes })

    expect(matrix).toContain('H:....')
  })
})

describe('renderMatrix2D', () => {
  test('includes grid and valid moves sections', () => {
    const maze = createTestMaze()
    const matrix = renderMatrix2D(maze)

    expect(matrix).toContain('=== MAZE GRID ===')
    expect(matrix).toContain('=== VALID MOVES ===')
    expect(matrix).toContain('P')
    expect(matrix).toContain('G')
    expect(matrix).toContain('Dimensions: 3x3')
  })

  test('lists valid moves per cell', () => {
    const maze = createTestMaze()
    const matrix = renderMatrix2D(maze)

    expect(matrix).toContain('UP')
    expect(matrix).toContain('DOWN')
    expect(matrix).toContain('LEFT')
    expect(matrix).toContain('RIGHT')
    expect(matrix).toContain('<- PLAYER')
    expect(matrix).toContain('<- GOAL')
  })
})

describe('renderCoordinateToken', () => {
  test('uses MazeBench token format', () => {
    const maze = createTestMaze()
    const tokens = renderCoordinateToken(maze)

    expect(tokens).toContain('<|0-0|>')
    expect(tokens).toContain('<|origin|>') // Start
    expect(tokens).toContain('<|target|>') // Goal
    expect(tokens).toContain('<|blank|>')
    expect(tokens).toContain('_wall|>')
  })

  test('renders holes as void', () => {
    const maze = createTestMaze()
    const holes = [{ x: 1, y: 1, width: 1, height: 1 }]
    const tokens = renderCoordinateToken(maze, { holes })

    expect(tokens).toContain('<|void|>')
  })
})

describe('RENDERERS', () => {
  test('includes all 9 format renderers', () => {
    expect(Object.keys(RENDERERS)).toHaveLength(9)
    expect(RENDERERS.ascii).toBeDefined()
    expect(RENDERERS.block).toBeDefined()
    expect(RENDERERS.adjacency).toBeDefined()
    expect(RENDERERS.edges).toBeDefined()
    expect(RENDERERS.edges_ascii).toBeDefined()
    expect(RENDERERS.ascii_block).toBeDefined()
    expect(RENDERERS.coordmatrix).toBeDefined()
    expect(RENDERERS.matrix2d).toBeDefined()
    expect(RENDERERS.coordtoken).toBeDefined()
  })
})

describe('generatePrompt', () => {
  test('includes introduction and dimensions', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'])

    expect(prompt).toContain('navigating a maze')
    expect(prompt).toContain('Maze dimensions: 3x3')
    expect(prompt).toContain('Start position: (0,0)')
    expect(prompt).toContain('Goal position: (2,2)')
  })

  test('includes requested format sections', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii', 'adjacency'])

    expect(prompt).toContain('--- ASCII VIEW ---')
    expect(prompt).toContain('--- ADJACENCY VIEW ---')
  })

  test('includes instructions section', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'])

    expect(prompt).toContain('--- INSTRUCTIONS ---')
    expect(prompt).toContain('RULES:')
    expect(prompt).toContain('UP, DOWN, LEFT, or RIGHT')
  })

  test('includes special instructions when provided', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'], 'Must visit cell (1,1)')

    expect(prompt).toContain('--- SPECIAL REQUIREMENTS ---')
    expect(prompt).toContain('Must visit cell (1,1)')
  })

  test('includes unreachable instructions when enabled', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'], undefined, {
      includeUnreachableInstructions: true,
    })

    expect(prompt).toContain('GOAL_UNREACHABLE')
    expect(prompt).toContain('UNDECIDED')
  })

  test('includes time pressure warning when enabled', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'], undefined, {
      applyTimePressure: true,
    })

    expect(prompt).toContain('TIME PRESSURE WARNING')
    expect(prompt).toContain('INSUFFICIENT_TIME')
  })

  test('handles move-by-move mode', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'], undefined, {
      executionMode: 'moveByMove',
      moveByMoveContext: {
        startPos: { x: 0, y: 0 },
        currentPos: { x: 1, y: 0 },
        moveHistory: ['RIGHT'],
      },
    })

    expect(prompt).toContain('move-by-move')
    expect(prompt).toContain('CURRENT STATE')
    expect(prompt).toContain('Current position: (1,0)')
    expect(prompt).toContain('Moves taken so far: RIGHT')
  })

  test('includes hole legend when holes present', () => {
    const maze = createTestMaze()
    const prompt = generatePrompt(maze, ['ascii'], undefined, {
      holes: [{ x: 1, y: 1, width: 1, height: 1 }],
    })

    expect(prompt).toContain('LEGEND:')
    expect(prompt).toContain('Hole')
  })
})

describe('generateAllPrompts', () => {
  test('generates prompts for all 9 formats', () => {
    const maze = createTestMaze()
    const prompts = generateAllPrompts(maze)

    expect(Object.keys(prompts)).toHaveLength(9)
    expect(prompts.ascii).toContain('--- ASCII VIEW ---')
    expect(prompts.block).toContain('--- BLOCK VIEW ---')
    expect(prompts.adjacency).toContain('--- ADJACENCY VIEW ---')
    expect(prompts.edges).toContain('--- EDGES VIEW ---')
    expect(prompts.coordmatrix).toContain('--- COORDMATRIX VIEW ---')
    expect(prompts.matrix2d).toContain('--- MATRIX2D VIEW ---')
    expect(prompts.coordtoken).toContain('--- COORDTOKEN VIEW ---')
  })
})
