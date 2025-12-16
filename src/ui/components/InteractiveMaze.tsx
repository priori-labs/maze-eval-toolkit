import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty, MazeWithPrompts, MoveAction, Position } from '../../core/types'

const CELL_SIZE = 36
const WALL_WIDTH = 2
const PLAYER_COLOR = '#ffffff' // white
const PLAYER_GLOW = '#e2e8f0'
const GOAL_COLOR = '#4ade80' // bright green
const GOAL_GLOW = '#22c55e'
const SUCCESS_COLOR = '#60a5fa' // blue-400
const SUCCESS_GLOW = '#3b82f6' // blue-500
const PATH_COLOR = 'rgba(96, 165, 250, 0.2)' // subtle blue path highlight
const WALL_COLOR = '#e2e8f0' // strong white/gray walls
const FLOOR_COLOR = '#1a1a1a' // dark gray (matching lmiq/apps/mazes --maze-cell: 0 0% 10%)

export interface HumanMazeResult {
  mazeId: string
  difficulty: Difficulty
  moves: MoveAction[]
  timeMs: number
  pathLength: number
  shortestPath: number
  efficiency: number
}

interface InteractiveMazeProps {
  maze: MazeWithPrompts
  isObfuscated: boolean
  onReveal: () => void
  onComplete: (result: HumanMazeResult) => void
  showPath?: boolean // Show blue path highlight (disabled for human eval, enabled for AI replay)
  startImmediately?: boolean // Start timer immediately without waiting for reveal
  onStatsChange?: (stats: { moves: number; elapsedMs: number }) => void
}

export default function InteractiveMaze({
  maze,
  isObfuscated,
  onReveal,
  onComplete,
  showPath = false,
  startImmediately = false,
  onStatsChange,
}: InteractiveMazeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Player state
  const [playerPos, setPlayerPos] = useState<Position>({ ...maze.start })
  const [moves, setMoves] = useState<MoveAction[]>([])
  const [pathPositions, setPathPositions] = useState<Position[]>([{ ...maze.start }])

  // Timer state
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)

  // Goal state
  const [hasReachedGoal, setHasReachedGoal] = useState(false)

  // Calculate canvas size
  const canvasWidth = maze.width * CELL_SIZE + WALL_WIDTH
  const canvasHeight = maze.height * CELL_SIZE + WALL_WIDTH

  // Reset state when maze changes
  useEffect(() => {
    setPlayerPos({ ...maze.start })
    setMoves([])
    setPathPositions([{ ...maze.start }])
    setStartTime(startImmediately ? Date.now() : null)
    setElapsedMs(0)
    setHasReachedGoal(false)
  }, [maze, startImmediately])

  // Timer effect
  useEffect(() => {
    if (!startTime || hasReachedGoal) return

    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime)
    }, 100)

    return () => clearInterval(interval)
  }, [startTime, hasReachedGoal])

  // Report stats to parent
  useEffect(() => {
    onStatsChange?.({ moves: moves.length, elapsedMs })
  }, [moves.length, elapsedMs, onStatsChange])

  // Check if move is valid (no wall blocking)
  const canMove = useCallback(
    (from: Position, direction: MoveAction): boolean => {
      const cell = maze.grid[from.y]?.[from.x]
      if (!cell) return false

      switch (direction) {
        case 'UP':
          return !cell.walls.top && from.y > 0
        case 'DOWN':
          return !cell.walls.bottom && from.y < maze.height - 1
        case 'LEFT':
          return !cell.walls.left && from.x > 0
        case 'RIGHT':
          return !cell.walls.right && from.x < maze.width - 1
      }
    },
    [maze],
  )

  // Move player
  const movePlayer = useCallback(
    (direction: MoveAction) => {
      if (hasReachedGoal || isObfuscated) return

      if (!canMove(playerPos, direction)) return

      let newPos: Position
      switch (direction) {
        case 'UP':
          newPos = { x: playerPos.x, y: playerPos.y - 1 }
          break
        case 'DOWN':
          newPos = { x: playerPos.x, y: playerPos.y + 1 }
          break
        case 'LEFT':
          newPos = { x: playerPos.x - 1, y: playerPos.y }
          break
        case 'RIGHT':
          newPos = { x: playerPos.x + 1, y: playerPos.y }
          break
      }

      setPlayerPos(newPos)
      setMoves((prev) => [...prev, direction])
      setPathPositions((prev) => [...prev, newPos])

      // Check if reached goal
      if (newPos.x === maze.goal.x && newPos.y === maze.goal.y) {
        setHasReachedGoal(true)
      }
    },
    [playerPos, canMove, hasReachedGoal, isObfuscated, maze.goal],
  )

  // Keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar to reveal
      if (e.code === 'Space' && isObfuscated) {
        e.preventDefault()
        onReveal()
        setStartTime(Date.now())
        return
      }

      // Enter to complete (after reaching goal)
      if (e.code === 'Enter' && hasReachedGoal) {
        e.preventDefault()
        const finalTimeMs = startTime ? Date.now() - startTime : 0
        const pathLength = moves.length
        const efficiency = pathLength > 0 ? maze.shortestPath / pathLength : 0

        onComplete({
          mazeId: maze.id,
          difficulty: maze.difficulty,
          moves,
          timeMs: finalTimeMs,
          pathLength,
          shortestPath: maze.shortestPath,
          efficiency,
        })
        return
      }

      // Arrow keys to move
      if (!isObfuscated && !hasReachedGoal) {
        switch (e.code) {
          case 'ArrowUp':
            e.preventDefault()
            movePlayer('UP')
            break
          case 'ArrowDown':
            e.preventDefault()
            movePlayer('DOWN')
            break
          case 'ArrowLeft':
            e.preventDefault()
            movePlayer('LEFT')
            break
          case 'ArrowRight':
            e.preventDefault()
            movePlayer('RIGHT')
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isObfuscated, hasReachedGoal, movePlayer, onReveal, onComplete, moves, startTime, maze])

  // Focus container for keyboard events
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Draw maze
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pathSet = new Set(pathPositions.map((p) => `${p.x},${p.y}`))

    // Fill entire canvas with floor color (no gridlines)
    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // Draw path highlights (only for AI replay, not human eval)
    if (showPath) {
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (pathSet.has(`${x},${y}`)) {
            const cx = x * CELL_SIZE + WALL_WIDTH / 2
            const cy = y * CELL_SIZE + WALL_WIDTH / 2
            ctx.fillStyle = PATH_COLOR
            ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE)
          }
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

    // Draw goal with glow effect (matching legend style)
    const gx = maze.goal.x * CELL_SIZE + WALL_WIDTH / 2 + CELL_SIZE / 2
    const gy = maze.goal.y * CELL_SIZE + WALL_WIDTH / 2 + CELL_SIZE / 2
    const goalRadius = CELL_SIZE / 4

    if (hasReachedGoal) {
      // Draw success blue orb when goal reached
      ctx.shadowColor = SUCCESS_GLOW
      ctx.shadowBlur = 12
      ctx.fillStyle = SUCCESS_COLOR
      ctx.beginPath()
      ctx.arc(gx, gy, goalRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    } else {
      // Draw green goal orb
      ctx.shadowColor = GOAL_GLOW
      ctx.shadowBlur = 10
      ctx.fillStyle = GOAL_COLOR
      ctx.beginPath()
      ctx.arc(gx, gy, goalRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Draw player as a small white rounded square
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
    }
  }, [maze, playerPos, pathPositions, canvasWidth, canvasHeight, showPath, hasReachedGoal])

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center flex-1 w-full h-full outline-none"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Interactive game element needs keyboard focus
      tabIndex={0}
    >
      {/* Legend / Success message - above maze (fixed height to prevent layout shift) */}
      <div className="mb-4 h-5 flex items-center justify-center">
        {!isObfuscated && !hasReachedGoal && (
          <div className="flex items-center gap-6 text-[11px] text-muted-foreground font-mono">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white rounded-[3px] shadow-[0_0_8px_rgba(226,232,240,0.6)]" />
              <span>You</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-400 shadow-[0_0_10px_#22c55e]" />
              <span>Goal</span>
            </div>
          </div>
        )}
        {hasReachedGoal && <div className="text-green-500 font-medium">Maze Complete</div>}
      </div>

      {/* Container expands to fill available space */}
      <div className="relative flex flex-1 w-full items-center justify-center">
        {/* Canvas - hidden until revealed */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className={`rounded-lg shadow-2xl shadow-black/50 ${isObfuscated ? 'invisible' : ''}`}
        />

        {/* Ready screen - shown before maze is revealed */}
        {isObfuscated && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold mb-2">Ready?</p>
            <p className="text-muted-foreground">Press SPACE to start</p>
          </div>
        )}
      </div>

      {/* Instructions - below maze */}
      {!isObfuscated && !hasReachedGoal && (
        <div className="mt-4 text-[14px] text-muted-foreground font-mono">
          <span className="text-foreground">←↑↓→</span> move
        </div>
      )}

      {/* Press ENTER prompt - below maze when goal reached */}
      {hasReachedGoal && (
        <div className="mt-4 text-[11px] text-muted-foreground font-mono">
          Press <span className="text-foreground">ENTER</span> to continue
        </div>
      )}
    </div>
  )
}
