/**
 * Tests for core type utilities
 */

import { describe, expect, test } from 'bun:test'
import {
  type Hole,
  type Position,
  SPECIAL_ACTIONS,
  VALID_MOVES,
  getPerspectiveRotationDescription,
  isPositionInHole,
  keyToPos,
  posToKey,
} from '../types'

describe('posToKey', () => {
  test('converts position to string key', () => {
    expect(posToKey({ x: 0, y: 0 })).toBe('0,0')
    expect(posToKey({ x: 5, y: 3 })).toBe('5,3')
    expect(posToKey({ x: -1, y: 10 })).toBe('-1,10')
  })
})

describe('keyToPos', () => {
  test('converts string key to position', () => {
    expect(keyToPos('0,0')).toEqual({ x: 0, y: 0 })
    expect(keyToPos('5,3')).toEqual({ x: 5, y: 3 })
    expect(keyToPos('-1,10')).toEqual({ x: -1, y: 10 })
  })

  test('round-trips with posToKey', () => {
    const positions: Position[] = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 99, y: 1 },
    ]
    for (const pos of positions) {
      expect(keyToPos(posToKey(pos))).toEqual(pos)
    }
  })
})

describe('isPositionInHole', () => {
  const holes: Hole[] = [
    { x: 2, y: 2, width: 3, height: 2 }, // covers (2,2) to (4,3)
    { x: 10, y: 10, width: 1, height: 1 }, // covers just (10,10)
  ]

  test('returns true for positions inside holes', () => {
    expect(isPositionInHole({ x: 2, y: 2 }, holes)).toBe(true)
    expect(isPositionInHole({ x: 3, y: 2 }, holes)).toBe(true)
    expect(isPositionInHole({ x: 4, y: 3 }, holes)).toBe(true)
    expect(isPositionInHole({ x: 10, y: 10 }, holes)).toBe(true)
  })

  test('returns false for positions outside holes', () => {
    expect(isPositionInHole({ x: 0, y: 0 }, holes)).toBe(false)
    expect(isPositionInHole({ x: 5, y: 2 }, holes)).toBe(false) // just outside first hole
    expect(isPositionInHole({ x: 2, y: 4 }, holes)).toBe(false) // just below first hole
    expect(isPositionInHole({ x: 11, y: 10 }, holes)).toBe(false)
  })

  test('returns false when holes array is empty', () => {
    expect(isPositionInHole({ x: 5, y: 5 }, [])).toBe(false)
  })
})

describe('getPerspectiveRotationDescription', () => {
  test('returns empty string for no rotation', () => {
    expect(getPerspectiveRotationDescription('none')).toBe('')
  })

  test('returns description for 90-right rotation', () => {
    const desc = getPerspectiveRotationDescription('90-right')
    expect(desc).toContain('90 degrees clockwise')
    expect(desc).toContain('UP')
    expect(desc).toContain('RIGHT')
  })

  test('returns description for 90-left rotation', () => {
    const desc = getPerspectiveRotationDescription('90-left')
    expect(desc).toContain('counter-clockwise')
  })

  test('returns description for 180 rotation', () => {
    const desc = getPerspectiveRotationDescription('180')
    expect(desc).toContain('180 degrees')
  })
})

describe('constants', () => {
  test('VALID_MOVES contains all directions', () => {
    expect(VALID_MOVES).toContain('UP')
    expect(VALID_MOVES).toContain('DOWN')
    expect(VALID_MOVES).toContain('LEFT')
    expect(VALID_MOVES).toContain('RIGHT')
    expect(VALID_MOVES).toHaveLength(4)
  })

  test('SPECIAL_ACTIONS contains expected values', () => {
    expect(SPECIAL_ACTIONS).toContain('GOAL_UNREACHABLE')
    expect(SPECIAL_ACTIONS).toContain('UNDECIDED')
    expect(SPECIAL_ACTIONS).toContain('INSUFFICIENT_TIME')
    expect(SPECIAL_ACTIONS).toHaveLength(3)
  })
})
