/**
 * Tests for maze generation
 */

import { describe, expect, test } from 'bun:test'
import { generateMaze } from '../maze-generator'
import { solveMaze } from '../maze-solver'

describe('generateMaze', () => {
  test('generates a valid maze with correct dimensions', () => {
    const maze = generateMaze('simple')!

    expect(maze.grid.length).toBeGreaterThan(0)
    expect(maze.grid[0]!.length).toBeGreaterThan(0)
    expect(maze.width).toBe(maze.grid[0]!.length)
    expect(maze.height).toBe(maze.grid.length)
  })

  test('generates a maze with start and goal positions', () => {
    const maze = generateMaze('easy')!

    expect(maze.start).toBeDefined()
    expect(maze.goal).toBeDefined()
    expect(maze.start.x).toBeGreaterThanOrEqual(0)
    expect(maze.start.y).toBeGreaterThanOrEqual(0)
    expect(maze.goal.x).toBeGreaterThanOrEqual(0)
    expect(maze.goal.y).toBeGreaterThanOrEqual(0)
  })

  test('start and goal are within maze bounds', () => {
    const maze = generateMaze('medium')!

    expect(maze.start.x).toBeLessThan(maze.width)
    expect(maze.start.y).toBeLessThan(maze.height)
    expect(maze.goal.x).toBeLessThan(maze.width)
    expect(maze.goal.y).toBeLessThan(maze.height)
  })

  test('generates a solvable maze', () => {
    const maze = generateMaze('simple')!
    const stats = solveMaze(maze.grid, maze.start, maze.goal)

    expect(stats.shortestPath).toBeGreaterThan(0)
  })

  test('maze has valid cell structure', () => {
    const maze = generateMaze('easy')!

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const cell = maze.grid[y]![x]!
        expect(cell.x).toBe(x)
        expect(cell.y).toBe(y)
        expect(cell.walls).toBeDefined()
        expect(typeof cell.walls.top).toBe('boolean')
        expect(typeof cell.walls.right).toBe('boolean')
        expect(typeof cell.walls.bottom).toBe('boolean')
        expect(typeof cell.walls.left).toBe('boolean')
      }
    }
  })

  test('boundary cells have outer walls', () => {
    const maze = generateMaze('simple')!

    // Top row should have top walls
    for (let x = 0; x < maze.width; x++) {
      expect(maze.grid[0]![x]!.walls.top).toBe(true)
    }

    // Bottom row should have bottom walls
    for (let x = 0; x < maze.width; x++) {
      expect(maze.grid[maze.height - 1]![x]!.walls.bottom).toBe(true)
    }

    // Left column should have left walls
    for (let y = 0; y < maze.height; y++) {
      expect(maze.grid[y]![0]!.walls.left).toBe(true)
    }

    // Right column should have right walls
    for (let y = 0; y < maze.height; y++) {
      expect(maze.grid[y]![maze.width - 1]!.walls.right).toBe(true)
    }
  })

  test('maze has required metadata', () => {
    const maze = generateMaze('hard')!

    expect(maze.id).toBeDefined()
    expect(typeof maze.id).toBe('string')
    expect(maze.difficulty).toBe('hard')
    expect(maze.generatedAt).toBeDefined()
    expect(maze.shortestPath).toBeGreaterThan(0)
  })

  test('different difficulties produce different maze sizes', () => {
    // Hard mazes should generally be larger (though there's randomness)
    // We test multiple times to reduce flakiness
    let hardLarger = 0
    for (let i = 0; i < 5; i++) {
      const s = generateMaze('simple')!
      const h = generateMaze('hard')!
      if (h.width * h.height > s.width * s.height) hardLarger++
    }
    expect(hardLarger).toBeGreaterThanOrEqual(3) // At least 3 out of 5 should be larger
  })
})

describe('generateMaze with spine-first mode', () => {
  test('generates a solvable maze with spine-first algorithm', () => {
    // Use 'simple' for faster generation, pass maxAttempts as second param
    const maze = generateMaze('simple', 2500, { mode: 'spine-first' })!

    // Generator can return null if it fails to meet requirements
    expect(maze).not.toBeNull()
    if (!maze) return

    expect(maze.grid.length).toBeGreaterThan(0)

    const stats = solveMaze(maze.grid, maze.start, maze.goal)
    expect(stats.shortestPath).toBeGreaterThan(0)
  })
})
