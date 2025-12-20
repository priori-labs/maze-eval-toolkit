import { useCallback, useEffect, useRef, useState } from 'react'
import type { EvaluationResult, MazeWithPrompts, Position } from '../../core/types'

const CELL_SIZE = 20
const WALL_WIDTH = 2
const PLAYER_COLOR = '#ffffff' // white
const PLAYER_GLOW = '#e2e8f0'
const GOAL_COLOR = '#4ade80' // bright green
const GOAL_GLOW = '#22c55e'
const PATH_COLOR = 'rgba(59, 130, 246, 0.45)' // blue path highlight
const INVALID_MOVE_COLOR = 'rgba(239, 68, 68, 0.5)' // red for invalid moves
const WALL_COLOR = '#e2e8f0' // white/gray walls
const FLOOR_COLOR = '#1a1a1a' // dark gray

interface MazeViewerProps {
  maze: MazeWithPrompts
  solution: EvaluationResult | null
  isReplaying: boolean
  onReplayComplete: () => void
}

export default function MazeViewer({
  maze,
  solution,
  isReplaying,
  onReplayComplete,
}: MazeViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [replayStep, setReplayStep] = useState(0)

  // Calculate canvas size
  const width = maze.width * CELL_SIZE + WALL_WIDTH
  const height = maze.height * CELL_SIZE + WALL_WIDTH

  // Check if a move is valid (no wall blocking)
  const isMoveValid = useCallback(
    (pos: Position, move: string): boolean => {
      const cell = maze.grid[pos.y]?.[pos.x]
      if (!cell) return false

      switch (move) {
        case 'UP':
          return !cell.walls.top
        case 'DOWN':
          return !cell.walls.bottom
        case 'LEFT':
          return !cell.walls.left
        case 'RIGHT':
          return !cell.walls.right
        default:
          return false
      }
    },
    [maze.grid],
  )

  // Get target position for a move
  const getTargetPosition = (pos: Position, move: string): Position => {
    switch (move) {
      case 'UP':
        return { ...pos, y: pos.y - 1 }
      case 'DOWN':
        return { ...pos, y: pos.y + 1 }
      case 'LEFT':
        return { ...pos, x: pos.x - 1 }
      case 'RIGHT':
        return { ...pos, x: pos.x + 1 }
      default:
        return pos
    }
  }

  // Calculate player position during replay (following all moves, even invalid ones)
  const getPlayerPosition = useCallback((): Position => {
    if (!isReplaying || !solution?.parsedMoves) {
      return maze.start
    }

    let pos = { ...maze.start }
    const moves = solution.parsedMoves.slice(0, replayStep)

    for (const move of moves) {
      // Always follow the move, even if invalid (walking through walls)
      pos = getTargetPosition(pos, move)
    }

    return pos
  }, [isReplaying, solution?.parsedMoves, replayStep, maze.start])

  // Get path positions and invalid move positions up to current replay step
  // Path continues through invalid moves (walking through walls), but invalid positions are highlighted red
  const getPathAndInvalidPositions = useCallback((): {
    path: Position[]
    invalid: Position[]
  } => {
    if (!solution?.parsedMoves) return { path: [], invalid: [] }

    const path: Position[] = [{ ...maze.start }]
    const invalid: Position[] = []
    let pos = { ...maze.start }

    const limit = isReplaying ? replayStep : solution.parsedMoves.length

    for (let i = 0; i < limit; i++) {
      const move = solution.parsedMoves[i]!
      const target = getTargetPosition(pos, move)
      const isValid = isMoveValid(pos, move)

      // Always continue the path, even through walls
      pos = target
      path.push({ ...pos })

      if (!isValid) {
        // Mark this position as an invalid move (walked through a wall)
        invalid.push({ ...pos })
      }
    }

    return { path, invalid }
  }, [solution?.parsedMoves, isReplaying, replayStep, maze.start, isMoveValid])

  // Replay animation
  useEffect(() => {
    if (!isReplaying || !solution?.parsedMoves) {
      setReplayStep(0)
      return
    }

    if (replayStep >= solution.parsedMoves.length) {
      onReplayComplete()
      return
    }

    const timer = setTimeout(() => {
      setReplayStep((s) => s + 1)
    }, 50)

    return () => clearTimeout(timer)
  }, [isReplaying, replayStep, solution?.parsedMoves, onReplayComplete])

  // Reset replay when solution changes
  useEffect(() => {
    setReplayStep(0)
  }, [solution])

  // Draw maze
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const playerPos = getPlayerPosition()
    const { path: pathPositions, invalid: invalidPositions } = getPathAndInvalidPositions()
    const pathSet = new Set(pathPositions.map((p) => `${p.x},${p.y}`))
    const invalidSet = new Set(invalidPositions.map((p) => `${p.x},${p.y}`))

    // Clear canvas with floor color
    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, 0, width, height)

    // Draw path highlights and invalid move highlights
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const cx = x * CELL_SIZE + WALL_WIDTH / 2
        const cy = y * CELL_SIZE + WALL_WIDTH / 2

        if (invalidSet.has(`${x},${y}`)) {
          ctx.fillStyle = INVALID_MOVE_COLOR
          ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE)
        } else if (pathSet.has(`${x},${y}`)) {
          ctx.fillStyle = PATH_COLOR
          ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE)
        }
      }
    }

    // Draw walls with rounded caps
    ctx.strokeStyle = WALL_COLOR
    ctx.lineWidth = WALL_WIDTH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const cell = maze.grid[y]?.[x]
        if (!cell) continue

        const cx = x * CELL_SIZE + WALL_WIDTH / 2
        const cy = y * CELL_SIZE + WALL_WIDTH / 2

        if (cell.walls.top) {
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx + CELL_SIZE, cy)
          ctx.stroke()
        }
        if (cell.walls.right) {
          ctx.beginPath()
          ctx.moveTo(cx + CELL_SIZE, cy)
          ctx.lineTo(cx + CELL_SIZE, cy + CELL_SIZE)
          ctx.stroke()
        }
        if (cell.walls.bottom) {
          ctx.beginPath()
          ctx.moveTo(cx, cy + CELL_SIZE)
          ctx.lineTo(cx + CELL_SIZE, cy + CELL_SIZE)
          ctx.stroke()
        }
        if (cell.walls.left) {
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(cx, cy + CELL_SIZE)
          ctx.stroke()
        }
      }
    }

    // Draw goal with glow effect
    const gx = maze.goal.x * CELL_SIZE + WALL_WIDTH / 2 + CELL_SIZE / 2
    const gy = maze.goal.y * CELL_SIZE + WALL_WIDTH / 2 + CELL_SIZE / 2
    const goalRadius = CELL_SIZE / 4

    ctx.shadowColor = GOAL_GLOW
    ctx.shadowBlur = 10
    ctx.fillStyle = GOAL_COLOR
    ctx.beginPath()
    ctx.arc(gx, gy, goalRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Draw player as white rounded square with glow
    const px = playerPos.x * CELL_SIZE + WALL_WIDTH / 2 + CELL_SIZE / 2
    const py = playerPos.y * CELL_SIZE + WALL_WIDTH / 2 + CELL_SIZE / 2
    const playerSize = CELL_SIZE * 0.4
    const playerRadius = playerSize / 4

    ctx.shadowColor = PLAYER_GLOW
    ctx.shadowBlur = 8
    ctx.fillStyle = PLAYER_COLOR
    ctx.beginPath()
    ctx.roundRect(px - playerSize / 2, py - playerSize / 2, playerSize, playerSize, playerRadius)
    ctx.fill()
    ctx.shadowBlur = 0
  }, [maze, getPlayerPosition, getPathAndInvalidPositions, width, height])

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded border border-gray-700"
      />
      {/* Legend */}
      <div className="mt-3 flex gap-6 items-center text-[11px] text-muted-foreground font-mono">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-white rounded-[3px] shadow-[0_0_8px_rgba(226,232,240,0.6)]" />
          <span>You</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_10px_#22c55e]" />
          <span>Goal</span>
        </div>
      </div>
    </div>
  )
}
