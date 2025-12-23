import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Checkbox } from '@/ui-library/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui-library/components/ui/dialog'
import { cn } from '@/ui-library/lib/utils'
import { Download } from 'lucide-react'
import { formatDuration } from './lib/format'
import type { SessionMetrics } from './shared/types'

import { AIPanel, type MoveRecord } from './components/AIPanel'
import { MazeControls } from './components/MazeControls'
import { SavedMazesOverlay } from './components/SavedMazesOverlay'

// Import types
import type {
  Cell,
  Difficulty,
  ExitDoorPair,
  Hole,
  MazeStats,
  MoveByMoveContext,
  PerspectiveRotation,
  Position,
  PromptViewOptions,
  WildcardTile,
} from './types'

// Import constants
import { CELL_SIZE, DIFFICULTY_SETTINGS } from './constants'

// Import utilities
import { getPerspectiveRotationDescription, remapDirection } from './utils/geometry'
import {
  checkPortalTeleport,
  generateExitDoorPair,
  generateHolesInMaze,
  generateWildcardTile,
  isPositionInHole,
} from './utils/mazeFeatures'
import {
  fillInMaze,
  generateHackMaze,
  generateHackMaze2,
  generateMaze,
  getRandomEdgePosition,
} from './utils/mazeGeneration'
import { solveMaze } from './utils/mazeSolver'
import {
  type SavedMazeDesign,
  deleteMaze,
  getSavedMazesList,
  loadMaze,
  mazeExists,
  saveMaze,
} from './utils/mazeStorage'
import { type PathValidationResult, validatePath } from './utils/pathValidation'
import { generateAIPrompt } from './utils/promptGeneration'
import { convertToTestSetFile } from './utils/testSetExport'

// Re-export types for external consumers
export type { ExecutionMode, MoveByMoveContext, PromptViewOptions } from './types'
export default function MazeGame() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [dimensions, setDimensions] = useState({ width: 12, height: 10 })
  const [maze, setMaze] = useState<Cell[][]>([])
  const [playerPos, setPlayerPos] = useState<Position>({ x: 0, y: 0 })
  const [startPos, setStartPos] = useState<Position>({ x: 0, y: 0 })
  const [goalPos, setGoalPos] = useState<Position>({ x: 0, y: 0 })
  const [_moves, setMoves] = useState(0)
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([])
  const [won, setWon] = useState(false)
  const [gameKey, setGameKey] = useState(0)
  const [fogEnabled, setFogEnabled] = useState(false)
  const [hackMode, setHackMode] = useState<0 | 1 | 2>(0)
  const [generateHolesEnabled, setGenerateHolesEnabled] = useState(false)
  const [holes, setHoles] = useState<Hole[]>([])
  const [exitDoorEnabled, setExitDoorEnabled] = useState(false)
  const [exitDoorPair, setExitDoorPair] = useState<ExitDoorPair | null>(null)
  const [wildcardTileEnabled, setWildcardTileEnabled] = useState(false)
  const [wildcardTile, setWildcardTile] = useState<WildcardTile>(null)
  const [draggingWildcard, setDraggingWildcard] = useState(false)
  const [lost, setLost] = useState(false)
  const [aiWallCollision, setAiWallCollision] = useState(false)
  // Track AI visited cells and cells where invalid moves occurred
  const [aiVisitedCells, setAiVisitedCells] = useState<Set<string>>(new Set())
  const [aiInvalidMoveCells, setAiInvalidMoveCells] = useState<Set<string>>(new Set())
  const [mazeStats, setMazeStats] = useState<MazeStats | null>(null)
  const [generationIterations, setGenerationIterations] = useState(0)
  const [minShortestPath, setMinShortestPath] = useState('')
  const [generationFailed, setGenerationFailed] = useState(false)
  // Human player mode state
  const [humanPlayerModeEnabled, setHumanPlayerModeEnabled] = useState(false)
  const [humanModeState, setHumanModeState] = useState<'waiting' | 'playing' | 'completed' | null>(
    null,
  )
  const [humanStartTime, setHumanStartTime] = useState<number | null>(null)
  const [humanEndTime, setHumanEndTime] = useState<number | null>(null)
  // Perspective rotation mode - controls are remapped based on perceived rotation
  const [perspectiveRotationEnabled, setPerspectiveRotationEnabled] = useState(false)
  const [perspectiveRotation, setPerspectiveRotation] = useState<PerspectiveRotation>('none')
  // AI session stats (preserved across replays, stores LLM thinking time)
  const [aiSessionStats, setAiSessionStats] = useState<SessionMetrics | null>(null)
  const [promptViewOptions, setPromptViewOptions] = useState<PromptViewOptions>({
    ascii: false,
    adjacencyList: false,
    coordinateMatrix: false,
    matrix2D: false,
    blockFormat: true,
    explicitEdges: true,
    coordinateToken: false,
    blockGrid: false,
    includeUnreachableInstructions: false,
    applyTimePressure: false,
    executionMode: 'fullSolution',
  })
  const [selectedMarker, setSelectedMarker] = useState<'start' | 'goal' | null>(null)

  // Export options state
  const [exportOptionsEnabled, setExportOptionsEnabled] = useState(false)
  const [mazeName, setMazeName] = useState('')
  const [savedMazes, setSavedMazes] = useState<SavedMazeDesign[]>([])
  const [aiConstraintValidation, setAiConstraintValidation] = useState<{
    passed: boolean
    error?: string
    pathLengthComparison?: { ai: number; shortest: number }
  } | null>(null)

  // Required solution subsequences for export (multiple paths with OR logic)
  const [isRecordingSubsequence, setIsRecordingSubsequence] = useState(false)
  const [recordedSubsequences, setRecordedSubsequences] = useState<
    Array<Array<{ move: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; position: Position }>>
  >([])
  const [activeSubsequenceIndex, setActiveSubsequenceIndex] = useState(0)

  // Shortest path playthrough for export (full manual recording)
  const [shortestPathPlaythrough, setShortestPathPlaythrough] = useState<
    Array<{ move: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; position: Position }>
  >([])
  const [isRecordingShortestPath, setIsRecordingShortestPath] = useState(false)
  const [shortestPathValidation, setShortestPathValidation] = useState<PathValidationResult | null>(
    null,
  )

  // Required tiles for export
  const [markRequiredTilesMode, setMarkRequiredTilesMode] = useState(false)
  const [requiredTiles, setRequiredTiles] = useState<Position[]>([])

  // Visibility toggles for custom maze elements
  const [showShortestPath, setShowShortestPath] = useState(true)
  const [showRequiredTiles, setShowRequiredTiles] = useState(true)
  const [showRequiredPaths, setShowRequiredPaths] = useState(true)

  // Special instructions for export
  const [specialInstructions, setSpecialInstructions] = useState('')

  // Export Test Set dialog state
  const [exportTestSetDialogOpen, setExportTestSetDialogOpen] = useState(false)
  const [selectedMazesForExport, setSelectedMazesForExport] = useState<Set<string>>(new Set())
  const [testSetName, setTestSetName] = useState('custom-test-set')

  // Drag-to-erase state
  const [isDraggingErase, setIsDraggingErase] = useState(false)
  const lastDragCellRef = useRef<Position | null>(null)

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Refs to access current state without adding to deps
  const humanPlayerModeEnabledRef = useRef(humanPlayerModeEnabled)
  humanPlayerModeEnabledRef.current = humanPlayerModeEnabled
  const humanModeStateRef = useRef(humanModeState)
  humanModeStateRef.current = humanModeState
  const minShortestPathRef = useRef(minShortestPath)
  minShortestPathRef.current = minShortestPath
  const perspectiveRotationEnabledRef = useRef(perspectiveRotationEnabled)
  perspectiveRotationEnabledRef.current = perspectiveRotationEnabled
  const perspectiveRotationRef = useRef(perspectiveRotation)
  perspectiveRotationRef.current = perspectiveRotation

  const settings = DIFFICULTY_SETTINGS[difficulty]

  const regenerateMaze = useCallback(() => {
    const s = DIFFICULTY_SETTINGS[difficulty]
    // Parse min shortest path constraint (if set)
    const minPathConstraint = minShortestPathRef.current
      ? Number.parseInt(minShortestPathRef.current, 10)
      : null
    const hasMinPathConstraint = minPathConstraint !== null && !Number.isNaN(minPathConstraint)

    // Use more iterations if min path constraint is set
    const maxIterations = hasMinPathConstraint ? 1000 : 200
    setGenerationFailed(false)

    // Reset export state
    setRecordedSubsequences([])
    setActiveSubsequenceIndex(0)
    setIsRecordingSubsequence(false)
    setShortestPathPlaythrough([])
    setIsRecordingShortestPath(false)
    setShortestPathValidation(null)
    setRequiredTiles([])
    setMarkRequiredTilesMode(false)
    setSpecialInstructions('')

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const newWidth = Math.floor(Math.random() * (s.maxWidth - s.minWidth + 1)) + s.minWidth
      const newHeight = Math.floor(Math.random() * (s.maxHeight - s.minHeight + 1)) + s.minHeight

      let newMaze: Cell[][]
      let start: Position
      let goal: Position

      if (hackMode === 1) {
        // Generate hack mode 1 maze with obvious straight path
        const result = generateHackMaze(newWidth, newHeight, s.extraPaths)
        newMaze = result.grid
        start = result.start
        goal = result.goal
      } else if (hackMode === 2) {
        // Generate hack mode 2 maze with L-shaped hallway along edges
        const result = generateHackMaze2(newWidth, newHeight, s.extraPaths)
        newMaze = result.grid
        start = result.start
        goal = result.goal
      } else {
        // Normal maze generation
        newMaze = generateMaze(newWidth, newHeight, s.extraPaths, s.skipFeatures)
        start = getRandomEdgePosition(newWidth, newHeight)
        goal = getRandomEdgePosition(newWidth, newHeight, start)
      }

      // Generate holes if enabled
      let newHoles: Hole[] = []
      if (generateHolesEnabled) {
        // Determine number of holes based on difficulty
        // Simple/Easy: 1-2 holes, Medium/Hard/Nightmare: 2-4 holes
        const isEasyDifficulty = difficulty === 'simple' || difficulty === 'easy'
        const minHoles = isEasyDifficulty ? 1 : 2
        const maxHoles = isEasyDifficulty ? 2 : 4
        const numHoles = Math.floor(Math.random() * (maxHoles - minHoles + 1)) + minHoles
        newHoles = generateHolesInMaze(newMaze, newWidth, newHeight, numHoles, start, goal)
      }

      // Generate exit door portals if enabled
      let newExitDoorPair: ExitDoorPair | null = null
      if (exitDoorEnabled) {
        newExitDoorPair = generateExitDoorPair(newMaze, newWidth, newHeight, start, goal)
      }

      // Generate wildcard tile if enabled
      let newWildcardTile: WildcardTile = null
      if (wildcardTileEnabled) {
        newWildcardTile = generateWildcardTile(newWidth, newHeight, start, goal, newHoles)
      }

      // Calculate maze difficulty stats (accounting for holes)
      const stats = solveMaze(newMaze, start, goal, newHoles)

      // ALWAYS regenerate if goal is unreachable (shortestPath === -1)
      if (stats.shortestPath === -1) {
        continue
      }

      // Check min shortest path constraint
      if (hasMinPathConstraint && stats.shortestPath < minPathConstraint) {
        continue
      }

      // Regenerate if ratio is below 15% or path is too short (skip for hack modes)
      // Only enforce on early iterations to ensure we eventually get a maze
      if (hackMode === 0 && iteration < 50 && (stats.ratio < 0.15 || stats.shortestPath < 10)) {
        continue
      }

      setDimensions({ width: newWidth, height: newHeight })
      setMaze(newMaze)
      setHoles(newHoles)
      setExitDoorPair(newExitDoorPair)
      setWildcardTile(newWildcardTile)
      setDraggingWildcard(false)
      setMazeStats(stats)
      setGenerationIterations(iteration + 1)
      setPlayerPos(start)
      setStartPos(start)
      setGoalPos(goal)
      setMoves(0)
      setMoveHistory([])
      setWon(false)
      setLost(false)
      setAiWallCollision(false)
      setAiVisitedCells(new Set())
      setAiInvalidMoveCells(new Set())
      setAiSessionStats(null)
      setSelectedMarker(null)
      setGameKey((k) => k + 1)
      // Set random perspective rotation if enabled
      if (perspectiveRotationEnabledRef.current) {
        const rotations: PerspectiveRotation[] = ['90-right', '180', '90-left']
        const randomRotation = rotations[Math.floor(Math.random() * rotations.length)] ?? 'none'
        setPerspectiveRotation(randomRotation)
      } else {
        setPerspectiveRotation('none')
      }
      // Reset human player mode state
      if (humanPlayerModeEnabledRef.current) {
        setHumanModeState('waiting')
        setHumanStartTime(null)
        setHumanEndTime(null)
      } else {
        setHumanModeState(null)
      }
      return // Successfully generated a valid maze
    }
    // If we get here after all iterations, generation failed
    if (hasMinPathConstraint) {
      setGenerationFailed(true)
      setGenerationIterations(maxIterations)
    }
    console.error('Failed to generate a valid maze after maximum attempts')
  }, [difficulty, hackMode, generateHolesEnabled, exitDoorEnabled, wildcardTileEnabled])

  useEffect(() => {
    regenerateMaze()
  }, [regenerateMaze])

  useEffect(() => {
    if (playerPos.x === goalPos.x && playerPos.y === goalPos.y && maze.length > 0) {
      setWon(true)
      // If in human player mode, mark as completed and record end time
      if (humanModeState === 'playing') {
        setHumanModeState('completed')
        setHumanEndTime(Date.now())
      }
    }
  }, [playerPos, goalPos, maze, humanModeState])

  // Refresh saved mazes list when design mode is toggled on
  useEffect(() => {
    if (exportOptionsEnabled) {
      setSavedMazes(getSavedMazesList())
    }
  }, [exportOptionsEnabled])

  // Validate AI completion against custom constraints
  const validateAICompletion = useCallback(() => {
    const aiMoves = moveHistory.filter((m) => m.source === 'ai')
    if (aiMoves.length === 0) return null

    // Build the executed path in the format expected by validatePath
    const executedPath: Array<{ move: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; position: Position }> = []
    const currentPos = { ...startPos }

    for (const move of aiMoves) {
      switch (move.direction) {
        case 'UP':
          currentPos.y--
          break
        case 'DOWN':
          currentPos.y++
          break
        case 'LEFT':
          currentPos.x--
          break
        case 'RIGHT':
          currentPos.x++
          break
      }
      executedPath.push({ move: move.direction, position: { ...currentPos } })
    }

    // Determine requirement type
    const nonEmptySubsequences = recordedSubsequences.filter((seq) => seq.length > 0)
    let requirementType: 'REQUIRED_SUBSEQUENCE' | 'REQUIRED_TILES' | null = null
    if (nonEmptySubsequences.length > 0) {
      requirementType = 'REQUIRED_SUBSEQUENCE'
    } else if (requiredTiles.length > 0) {
      requirementType = 'REQUIRED_TILES'
    }

    // Validate path against constraints
    const validationResult = validatePath(executedPath, startPos, goalPos, {
      requirementType,
      requiredSolutionSubsequences:
        nonEmptySubsequences.length > 0 ? nonEmptySubsequences : undefined,
      requiredTiles: requiredTiles.length > 0 ? requiredTiles : undefined,
    })

    // Compare path length if shortest path playthrough exists
    let pathLengthComparison: { ai: number; shortest: number } | undefined
    if (shortestPathPlaythrough.length > 0) {
      pathLengthComparison = {
        ai: aiMoves.length,
        shortest: shortestPathPlaythrough.length,
      }
    }

    return {
      passed: validationResult.constraintsSatisfied ?? true,
      error: validationResult.constraintError,
      pathLengthComparison,
    }
  }, [moveHistory, startPos, goalPos, recordedSubsequences, requiredTiles, shortestPathPlaythrough])

  // Run validation when AI completes (won or hit wall)
  useEffect(() => {
    const aiMoves = moveHistory.filter((m) => m.source === 'ai')
    const hasAiMoves = aiMoves.length > 0
    const hasConstraints =
      recordedSubsequences.some((s) => s.length > 0) ||
      requiredTiles.length > 0 ||
      shortestPathPlaythrough.length > 0

    // Only validate if AI has played and there are constraints
    if ((won || aiWallCollision) && hasAiMoves && hasConstraints) {
      const result = validateAICompletion()
      setAiConstraintValidation(result)
    } else if (!hasAiMoves) {
      // Reset validation if no AI moves
      setAiConstraintValidation(null)
    }
  }, [
    won,
    aiWallCollision,
    moveHistory,
    validateAICompletion,
    recordedSubsequences,
    requiredTiles,
    shortestPathPlaythrough,
  ])

  const getCellVisibility = useCallback(
    (x: number, y: number): 'visible' | 'hidden' => {
      if (!fogEnabled || settings.visionRadius === Number.POSITIVE_INFINITY) return 'visible'

      const distance = Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y))
      return distance <= settings.visionRadius ? 'visible' : 'hidden'
    },
    [playerPos, settings.visionRadius, fogEnabled],
  )

  // Compute the path taken from move history (for highlighting when won)
  const pathTaken = useMemo(() => {
    if (!won || moveHistory.length === 0) return new Set<string>()

    const path = new Set<string>()
    const currentPos = { ...startPos }
    path.add(`${currentPos.x},${currentPos.y}`)

    for (const move of moveHistory) {
      switch (move.direction) {
        case 'UP':
          currentPos.y--
          break
        case 'DOWN':
          currentPos.y++
          break
        case 'LEFT':
          currentPos.x--
          break
        case 'RIGHT':
          currentPos.x++
          break
      }
      path.add(`${currentPos.x},${currentPos.y}`)
    }

    return path
  }, [won, moveHistory, startPos])

  const canMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right'): boolean => {
      if (maze.length === 0) return false
      const cell = maze[playerPos.y]?.[playerPos.x]
      if (!cell) return false

      // Check for portal exit (no wall and at boundary = can exit through portal)
      const isAtPortalExit = (dir: 'up' | 'down' | 'left' | 'right'): boolean => {
        if (!exitDoorPair) return false
        switch (dir) {
          case 'up':
            return !cell.walls.top && playerPos.y === 0
          case 'down':
            return !cell.walls.bottom && playerPos.y === dimensions.height - 1
          case 'left':
            return !cell.walls.left && playerPos.x === 0
          case 'right':
            return !cell.walls.right && playerPos.x === dimensions.width - 1
        }
      }

      // Standard wall check (but allow portal exits)
      switch (direction) {
        case 'up':
          if (cell.walls.top) return false
          if (playerPos.y <= 0 && !isAtPortalExit('up')) return false
          break
        case 'down':
          if (cell.walls.bottom) return false
          if (playerPos.y >= dimensions.height - 1 && !isAtPortalExit('down')) return false
          break
        case 'left':
          if (cell.walls.left) return false
          if (playerPos.x <= 0 && !isAtPortalExit('left')) return false
          break
        case 'right':
          if (cell.walls.right) return false
          if (playerPos.x >= dimensions.width - 1 && !isAtPortalExit('right')) return false
          break
      }

      return true
    },
    [maze, playerPos, dimensions, exitDoorPair],
  )

  // Check if a move would result in falling into a hole
  const wouldFallIntoHole = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right'): boolean => {
      if (holes.length === 0) return false

      const nextPos = { ...playerPos }
      switch (direction) {
        case 'up':
          nextPos.y--
          break
        case 'down':
          nextPos.y++
          break
        case 'left':
          nextPos.x--
          break
        case 'right':
          nextPos.x++
          break
      }

      return isPositionInHole(nextPos, holes)
    },
    [playerPos, holes],
  )

  const move = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (won || lost) return
      // Block movement if human player mode is waiting for spacebar
      if (humanModeStateRef.current === 'waiting') return
      if (!canMove(direction)) return

      // Check if moving into a hole
      if (wouldFallIntoHole(direction)) {
        setLost(true)
        setMoves((m) => m + 1)
        setMoveHistory((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random()}`,
            direction: direction.toUpperCase() as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
            source: 'human',
            timestamp: Date.now(),
          },
        ])
        return
      }

      setPlayerPos((prev) => {
        let newPos = { ...prev }
        switch (direction) {
          case 'up':
            newPos.y--
            break
          case 'down':
            newPos.y++
            break
          case 'left':
            newPos.x--
            break
          case 'right':
            newPos.x++
            break
        }

        // Check for portal teleportation
        const teleportDest = checkPortalTeleport(
          newPos,
          dimensions.width,
          dimensions.height,
          exitDoorPair,
        )
        if (teleportDest) {
          newPos = teleportDest
        }

        return newPos
      })
      setMoves((m) => m + 1)
      setMoveHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          direction: direction.toUpperCase() as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
          source: 'human',
          timestamp: Date.now(),
        },
      ])

      // Record subsequence or shortest path if recording is enabled
      if (isRecordingSubsequence || isRecordingShortestPath) {
        // Calculate new position for recording
        let recordPos = { ...playerPos }
        switch (direction) {
          case 'up':
            recordPos.y--
            break
          case 'down':
            recordPos.y++
            break
          case 'left':
            recordPos.x--
            break
          case 'right':
            recordPos.x++
            break
        }
        // Check for portal teleportation
        const teleportDest = checkPortalTeleport(
          recordPos,
          dimensions.width,
          dimensions.height,
          exitDoorPair,
        )
        if (teleportDest) {
          recordPos = teleportDest
        }

        const moveRecord = {
          move: direction.toUpperCase() as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
          position: recordPos,
        }

        if (isRecordingSubsequence) {
          setRecordedSubsequences((prev) => {
            const updated = [...prev]
            if (!updated[activeSubsequenceIndex]) {
              updated[activeSubsequenceIndex] = []
            }
            updated[activeSubsequenceIndex] = [...updated[activeSubsequenceIndex], moveRecord]
            return updated
          })
        }

        if (isRecordingShortestPath) {
          setShortestPathPlaythrough((prev) => [...prev, moveRecord])
        }
      }
    },
    [
      canMove,
      won,
      lost,
      wouldFallIntoHole,
      dimensions,
      exitDoorPair,
      isRecordingSubsequence,
      isRecordingShortestPath,
      activeSubsequenceIndex,
      playerPos,
    ],
  )

  // Generate current prompt for AI agent runner
  const currentPrompt = useMemo(() => {
    if (maze.length === 0) return ''
    return generateAIPrompt(
      maze,
      startPos,
      goalPos,
      promptViewOptions,
      holes,
      exitDoorPair,
      null,
      wildcardTile,
      perspectiveRotation,
      specialInstructions || undefined,
    )
  }, [
    maze,
    startPos,
    goalPos,
    promptViewOptions,
    holes,
    exitDoorPair,
    wildcardTile,
    perspectiveRotation,
    specialInstructions,
  ])

  // Generate prompt with optional move-by-move context
  const generatePromptWithContext = useCallback(
    (context: MoveByMoveContext | null) => {
      if (maze.length === 0) return ''
      if (context) {
        // For move-by-move, use the current position as player position in the prompt
        return generateAIPrompt(
          maze,
          context.currentPos,
          goalPos,
          promptViewOptions,
          holes,
          exitDoorPair,
          context,
          wildcardTile,
          perspectiveRotation,
          specialInstructions || undefined,
        )
      }
      return generateAIPrompt(
        maze,
        startPos,
        goalPos,
        promptViewOptions,
        holes,
        exitDoorPair,
        null,
        wildcardTile,
        perspectiveRotation,
        specialInstructions || undefined,
      )
    },
    [
      maze,
      startPos,
      goalPos,
      promptViewOptions,
      holes,
      exitDoorPair,
      wildcardTile,
      perspectiveRotation,
      specialInstructions,
    ],
  )

  // Callback for AI agent to execute a move, returns true if successful
  // Note: Even if the move is invalid, we allow the path to continue playing out
  // and track visited/invalid cells for visualization
  const handleAIMove = useCallback(
    (inputDirection: 'up' | 'down' | 'left' | 'right'): boolean => {
      // Apply perspective rotation remapping for AI controls
      const direction = remapDirection(inputDirection, perspectiveRotationRef.current)

      if (won) return false

      // Track current position as visited
      setAiVisitedCells((prev) => {
        const next = new Set(prev)
        next.add(`${playerPos.x},${playerPos.y}`)
        return next
      })

      // Check if move is invalid (wall collision or out of bounds)
      const moveIsInvalid = !canMove(direction)

      // Calculate the next position (ignoring walls - we let the path "go through")
      let newPos = { ...playerPos }
      switch (direction) {
        case 'up':
          newPos.y--
          break
        case 'down':
          newPos.y++
          break
        case 'left':
          newPos.x--
          break
        case 'right':
          newPos.x++
          break
      }

      // Clamp to maze boundaries (can't go outside the grid)
      newPos.x = Math.max(0, Math.min(dimensions.width - 1, newPos.x))
      newPos.y = Math.max(0, Math.min(dimensions.height - 1, newPos.y))

      // Check for portal teleportation (only if move was valid)
      if (!moveIsInvalid) {
        const teleportDest = checkPortalTeleport(
          newPos,
          dimensions.width,
          dimensions.height,
          exitDoorPair,
        )
        if (teleportDest) {
          newPos = teleportDest
        }
      }

      // Check if new position is in a hole
      const fellInHole = isPositionInHole(newPos, holes)

      // If move is invalid, mark the new position as an invalid move cell
      if (moveIsInvalid || fellInHole) {
        setAiInvalidMoveCells((prev) => {
          const next = new Set(prev)
          next.add(`${newPos.x},${newPos.y}`)
          return next
        })

        // Set failure state (but don't stop the path playback)
        if (moveIsInvalid && !aiWallCollision) {
          setAiWallCollision(true)
        }
        if (fellInHole && !lost) {
          setLost(true)
        }
      }

      // Always update position (allow path to continue through walls)
      setPlayerPos(newPos)
      setMoves((m) => m + 1)
      setMoveHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          direction: direction.toUpperCase() as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
          source: 'ai',
          timestamp: Date.now(),
        },
      ])

      // Mark new position as visited
      setAiVisitedCells((prev) => {
        const next = new Set(prev)
        next.add(`${newPos.x},${newPos.y}`)
        return next
      })

      // Return true to let the AI continue playing out its full path
      return true
    },
    [canMove, won, lost, aiWallCollision, dimensions, exitDoorPair, playerPos, holes],
  )

  // Callback for AI agent to reset player position
  const handleAIReset = useCallback(() => {
    setPlayerPos(startPos)
    setMoves(0)
    setMoveHistory([])
    setWon(false)
    setLost(false)
    setAiWallCollision(false)
    setAiVisitedCells(new Set())
    setAiInvalidMoveCells(new Set())
  }, [startPos])

  // Callback to clear move history
  const handleClearMoveHistory = useCallback(() => {
    setMoveHistory([])
  }, [])

  // Callback to reset maze state (player position, moves, win state)
  const handleResetMazeState = useCallback(() => {
    setPlayerPos(startPos)
    setMoves(0)
    setMoveHistory([])
    setWon(false)
    setLost(false)
    setAiWallCollision(false)
    setAiVisitedCells(new Set())
    setAiInvalidMoveCells(new Set())
    setSelectedMarker(null)
    // Reset human mode to allow AI to run on the same maze
    setHumanModeState(null)
    setHumanStartTime(null)
    setHumanEndTime(null)
  }, [startPos])

  // Export all saved mazes to JSON format
  const handleExportMaze = useCallback(() => {
    const allMazes = getSavedMazesList()
    if (allMazes.length === 0) {
      alert('No saved mazes to export. Save some mazes first.')
      return
    }

    const json = JSON.stringify(allMazes, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'saved-mazes.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [])

  // Open export test set dialog
  const handleOpenExportTestSetDialog = useCallback(() => {
    const allMazes = getSavedMazesList()
    if (allMazes.length === 0) {
      alert('No saved mazes to export. Save some mazes first.')
      return
    }
    // Pre-select all mazes
    setSelectedMazesForExport(new Set(allMazes.map((m) => m.name)))
    setTestSetName('custom-test-set')
    setExportTestSetDialogOpen(true)
  }, [])

  // Export selected mazes as TestSetFile format for lmiq-v1-beta
  const handleExportTestSet = useCallback(async () => {
    const allMazes = getSavedMazesList()
    const selectedMazes = allMazes.filter((m) => selectedMazesForExport.has(m.name))

    if (selectedMazes.length === 0) {
      alert('No mazes selected for export.')
      return
    }

    const testSetFile = convertToTestSetFile(selectedMazes, testSetName)
    try {
      const response = await fetch('/api/test-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testSet: testSetFile,
          filename: testSetName,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to export test set' }))
        throw new Error(error.error || 'Failed to export test set')
      }

      const data = (await response.json()) as { filename?: string }
      alert(`Exported test set to test-sets/${data.filename ?? `${testSetName}.json`}`)
      setExportTestSetDialogOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export test set')
    }
  }, [selectedMazesForExport, testSetName])

  // Import maze(s) from JSON file
  const handleImportMaze = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const data = JSON.parse(content)

        // Check if this is an array of saved mazes (new export format)
        if (Array.isArray(data)) {
          let importedCount = 0
          for (const mazeData of data) {
            if (mazeData.name && mazeData.grid) {
              saveMaze(mazeData)
              importedCount++
            }
          }
          if (importedCount > 0) {
            setSavedMazes(getSavedMazesList())
            alert(`Imported ${importedCount} maze(s) to saved mazes.`)
          } else {
            alert('No valid mazes found in the file.')
          }
          return
        }

        // Single maze import (legacy format) - load into editor
        // Validate required fields
        if (!data.grid || !data.start || !data.goal || !data.width || !data.height) {
          console.error('Invalid maze file: missing required fields')
          return
        }

        // Parse the grid into Cell format
        const importedMaze: Cell[][] = data.grid.map(
          (row: Array<{ x: number; y: number; walls: Cell['walls'] }>) =>
            row.map((cell) => ({
              x: cell.x,
              y: cell.y,
              walls: {
                top: cell.walls.top,
                right: cell.walls.right,
                bottom: cell.walls.bottom,
                left: cell.walls.left,
              },
            })),
        )

        const importedStart: Position = { x: data.start.x, y: data.start.y }
        const importedGoal: Position = { x: data.goal.x, y: data.goal.y }

        // Set difficulty if present
        if (data.difficulty) {
          setDifficulty(data.difficulty)
        }

        // Set dimensions
        setDimensions({ width: data.width, height: data.height })

        // Set maze grid
        setMaze(importedMaze)

        // Set positions
        setStartPos(importedStart)
        setGoalPos(importedGoal)
        setPlayerPos(importedStart)

        // Reset game state
        setMoves(0)
        setMoveHistory([])
        setWon(false)
        setLost(false)
        setAiWallCollision(false)
        setAiVisitedCells(new Set())
        setAiInvalidMoveCells(new Set())
        setAiSessionStats(null)
        setSelectedMarker(null)
        setGameKey((k) => k + 1)

        // Reset human player mode
        setHumanModeState(null)
        setHumanStartTime(null)
        setHumanEndTime(null)

        // Reset perspective rotation for imported mazes
        setPerspectiveRotation('none')

        // Clear features that aren't in the import (holes, exit doors, wildcards)
        setHoles([])
        setExitDoorPair(null)
        setWildcardTile(null)
        setDraggingWildcard(false)

        // Import optional export data
        if (data.requiredTiles && Array.isArray(data.requiredTiles)) {
          setRequiredTiles(
            data.requiredTiles.map((tile: { x: number; y: number }) => ({
              x: tile.x,
              y: tile.y,
            })),
          )
        } else {
          setRequiredTiles([])
        }

        if (data.requiredSolutionSubsequences && Array.isArray(data.requiredSolutionSubsequences)) {
          setRecordedSubsequences(
            data.requiredSolutionSubsequences.map(
              (seq: Array<{ move: string; position: { x: number; y: number } }>) =>
                seq.map((item) => ({
                  move: item.move as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
                  position: { x: item.position.x, y: item.position.y },
                })),
            ),
          )
          setActiveSubsequenceIndex(0)
        } else {
          setRecordedSubsequences([])
          setActiveSubsequenceIndex(0)
        }

        if (data.shortestPathPlaythrough && Array.isArray(data.shortestPathPlaythrough)) {
          setShortestPathPlaythrough(
            data.shortestPathPlaythrough.map(
              (item: { move: string; position: { x: number; y: number } }) => ({
                move: item.move as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT',
                position: { x: item.position.x, y: item.position.y },
              }),
            ),
          )
        } else {
          setShortestPathPlaythrough([])
        }

        if (data.specialInstructions && typeof data.specialInstructions === 'string') {
          setSpecialInstructions(data.specialInstructions)
        } else {
          setSpecialInstructions('')
        }

        // Reset recording states
        setIsRecordingSubsequence(false)
        setIsRecordingShortestPath(false)
        setShortestPathValidation(null)
        setMarkRequiredTilesMode(false)

        // Calculate maze stats
        setMazeStats(solveMaze(importedMaze, importedStart, importedGoal, []))
        setGenerationIterations(0)
        setGenerationFailed(false)
      } catch (err) {
        console.error('Failed to parse maze file:', err)
      }
    }
    reader.readAsText(file)
  }, [])

  // Handle file input change for import
  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleImportMaze(file)
        // Reset the input so the same file can be imported again
        e.target.value = ''
      }
    },
    [handleImportMaze],
  )

  // Save maze to localStorage
  const handleSaveMaze = useCallback(() => {
    if (!mazeName.trim() || maze.length === 0) return

    // Check for duplicate
    if (mazeExists(mazeName)) {
      if (!confirm(`A maze named "${mazeName}" already exists. Overwrite?`)) {
        return
      }
    }

    const nonEmptySubsequences = recordedSubsequences.filter((seq) => seq.length > 0)
    let requirementType: 'REQUIRED_SUBSEQUENCE' | 'REQUIRED_TILES' | null = null
    if (nonEmptySubsequences.length > 0) {
      requirementType = 'REQUIRED_SUBSEQUENCE'
    } else if (requiredTiles.length > 0) {
      requirementType = 'REQUIRED_TILES'
    }

    const design: SavedMazeDesign = {
      name: mazeName.trim(),
      savedAt: Date.now(),
      difficulty,
      width: maze[0]?.length ?? 0,
      height: maze.length,
      grid: maze,
      start: startPos,
      goal: goalPos,
      requirementType,
      requiredSolutionSubsequences:
        nonEmptySubsequences.length > 0 ? nonEmptySubsequences : undefined,
      shortestPathPlaythrough:
        shortestPathPlaythrough.length > 0 ? shortestPathPlaythrough : undefined,
      requiredTiles: requiredTiles.length > 0 ? requiredTiles : undefined,
      specialInstructions: specialInstructions.trim() || undefined,
    }

    saveMaze(design)
    setSavedMazes(getSavedMazesList())
  }, [
    mazeName,
    maze,
    difficulty,
    startPos,
    goalPos,
    recordedSubsequences,
    shortestPathPlaythrough,
    requiredTiles,
    specialInstructions,
  ])

  // Load maze from localStorage
  const handleLoadSavedMaze = useCallback((name: string) => {
    const design = loadMaze(name)
    if (!design) return

    // Set all state from saved design
    setDifficulty(design.difficulty)
    setDimensions({ width: design.width, height: design.height })
    setMaze(design.grid)
    setStartPos(design.start)
    setGoalPos(design.goal)
    setPlayerPos(design.start)
    setMazeName(design.name)

    // Reset game state
    setMoves(0)
    setMoveHistory([])
    setWon(false)
    setLost(false)
    setAiWallCollision(false)
    setAiVisitedCells(new Set())
    setAiInvalidMoveCells(new Set())
    setAiSessionStats(null)
    setSelectedMarker(null)
    setGameKey((k) => k + 1)

    // Reset human player mode
    setHumanModeState(null)
    setHumanStartTime(null)
    setHumanEndTime(null)

    // Reset perspective rotation for loaded mazes
    setPerspectiveRotation('none')

    // Clear features that aren't in the saved design
    setHoles([])
    setExitDoorPair(null)
    setWildcardTile(null)
    setDraggingWildcard(false)

    // Load constraint data
    setRequiredTiles(design.requiredTiles ?? [])
    setRecordedSubsequences(design.requiredSolutionSubsequences ?? [])
    setActiveSubsequenceIndex(0)
    setShortestPathPlaythrough(design.shortestPathPlaythrough ?? [])
    setSpecialInstructions(design.specialInstructions ?? '')

    // Reset recording states
    setIsRecordingSubsequence(false)
    setIsRecordingShortestPath(false)
    setShortestPathValidation(null)
    setMarkRequiredTilesMode(false)
    setAiConstraintValidation(null)

    // Calculate stats
    setMazeStats(solveMaze(design.grid, design.start, design.goal, []))
    setGenerationIterations(0)
    setGenerationFailed(false)
  }, [])

  // Delete maze from localStorage
  const handleDeleteSavedMaze = useCallback((name: string) => {
    if (!confirm(`Delete maze "${name}"?`)) return
    deleteMaze(name)
    setSavedMazes(getSavedMazesList())
  }, [])

  // Check if maze is in editable state (no moves made yet)
  const isEditable = moveHistory.length === 0 && !won && !lost

  // Toggle a wall between two adjacent cells
  const toggleWall = useCallback(
    (x: number, y: number, direction: 'top' | 'right' | 'bottom' | 'left') => {
      if (!isEditable) return

      // Create a deep copy of the maze
      const newMaze = maze.map((row) =>
        row.map((cell) => ({
          ...cell,
          walls: { ...cell.walls },
        })),
      )

      const cell = newMaze[y]?.[x]
      if (!cell) return

      // Toggle the wall and the corresponding wall on the adjacent cell
      switch (direction) {
        case 'top':
          if (y > 0) {
            cell.walls.top = !cell.walls.top
            const adjacentCell = newMaze[y - 1]?.[x]
            if (adjacentCell) adjacentCell.walls.bottom = cell.walls.top
          }
          break
        case 'bottom':
          if (y < dimensions.height - 1) {
            cell.walls.bottom = !cell.walls.bottom
            const adjacentCell = newMaze[y + 1]?.[x]
            if (adjacentCell) adjacentCell.walls.top = cell.walls.bottom
          }
          break
        case 'left':
          if (x > 0) {
            cell.walls.left = !cell.walls.left
            const adjacentCell = newMaze[y]?.[x - 1]
            if (adjacentCell) adjacentCell.walls.right = cell.walls.left
          }
          break
        case 'right':
          if (x < dimensions.width - 1) {
            cell.walls.right = !cell.walls.right
            const adjacentCell = newMaze[y]?.[x + 1]
            if (adjacentCell) adjacentCell.walls.left = cell.walls.right
          }
          break
      }

      // Update maze and recalculate stats (allow -1 for manual edits)
      setMaze(newMaze)
      setMazeStats(solveMaze(newMaze, startPos, goalPos, holes))
    },
    [isEditable, dimensions, maze, startPos, goalPos, holes],
  )

  // Remove wall between two adjacent cells (for drag-to-erase)
  const removeWallBetweenCells = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!isEditable) return

      const dx = toX - fromX
      const dy = toY - fromY

      // Only handle adjacent cells (not diagonal)
      if (Math.abs(dx) + Math.abs(dy) !== 1) return

      // Don't remove boundary walls
      if (
        (dx === -1 && fromX === 0) ||
        (dx === 1 && toX === dimensions.width - 1) ||
        (dy === -1 && fromY === 0) ||
        (dy === 1 && toY === dimensions.height - 1)
      ) {
        // Allow removing internal walls but not true boundary walls
        // Actually, boundary is defined by the edge of the grid
      }

      // Create a deep copy of the maze
      const newMaze = maze.map((row) =>
        row.map((cell) => ({
          ...cell,
          walls: { ...cell.walls },
        })),
      )

      // Remove the wall between the two cells
      const fromCell = newMaze[fromY]?.[fromX]
      const toCell = newMaze[toY]?.[toX]
      if (!fromCell || !toCell) return

      if (dx === 1) {
        // Moving right: remove right wall of from, left wall of to
        fromCell.walls.right = false
        toCell.walls.left = false
      } else if (dx === -1) {
        // Moving left: remove left wall of from, right wall of to
        fromCell.walls.left = false
        toCell.walls.right = false
      } else if (dy === 1) {
        // Moving down: remove bottom wall of from, top wall of to
        fromCell.walls.bottom = false
        toCell.walls.top = false
      } else if (dy === -1) {
        // Moving up: remove top wall of from, bottom wall of to
        fromCell.walls.top = false
        toCell.walls.bottom = false
      }

      setMaze(newMaze)
      setMazeStats(solveMaze(newMaze, startPos, goalPos, holes))
    },
    [isEditable, dimensions, maze, startPos, goalPos, holes],
  )

  // Clear all internal walls (keep boundary walls intact)
  const clearAllWalls = useCallback(() => {
    if (!isEditable) return

    const newMaze = maze.map((row, y) =>
      row.map((cell, x) => ({
        ...cell,
        walls: {
          // Keep boundary walls, clear internal walls
          top: y === 0,
          bottom: y === dimensions.height - 1,
          left: x === 0,
          right: x === dimensions.width - 1,
        },
      })),
    )

    setMaze(newMaze)
    setMazeStats(solveMaze(newMaze, startPos, goalPos, holes))
  }, [isEditable, maze, dimensions, startPos, goalPos, holes])

  // Fill in empty spaces with procedural generation while preserving user-built features
  const handleFillInMaze = useCallback(() => {
    if (!isEditable || maze.length === 0) return

    const filledMaze = fillInMaze(maze, dimensions.width, dimensions.height)
    setMaze(filledMaze)
    setMazeStats(solveMaze(filledMaze, startPos, goalPos, holes))
  }, [isEditable, maze, dimensions, startPos, goalPos, holes])

  // Handle click on a cell to toggle walls or reposition markers
  const handleCellClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, x: number, y: number) => {
      const isStart = x === startPos.x && y === startPos.y
      const isGoal = x === goalPos.x && y === goalPos.y
      const isWildcard = wildcardTile && x === wildcardTile.x && y === wildcardTile.y

      // Check if clicking on a marker (center of cell, not edges)
      const rect = e.currentTarget.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top
      const edgeThreshold = 8
      const isEdgeClick =
        clickY < edgeThreshold ||
        clickY > CELL_SIZE - edgeThreshold ||
        clickX < edgeThreshold ||
        clickX > CELL_SIZE - edgeThreshold

      // Handle wildcard tile click - toggle dragging mode
      if (isWildcard && !isEdgeClick) {
        setDraggingWildcard((prev) => !prev)
        return
      }

      // If dragging wildcard and clicking on a valid empty tile, move the wildcard there
      if (draggingWildcard && !isStart && !isGoal && !isWildcard && !isEdgeClick) {
        // Don't allow placing wildcard on holes
        if (!isPositionInHole({ x, y }, holes)) {
          setWildcardTile({ x, y })
          setDraggingWildcard(false)
        }
        return
      }

      // Non-editable mode: only allow wildcard interaction
      if (!isEditable) return

      // If clicking center of start marker, select/deselect it
      if (isStart && !isEdgeClick) {
        setSelectedMarker((prev) => (prev === 'start' ? null : 'start'))
        return
      }

      // If clicking center of goal marker, select/deselect it
      if (isGoal && !isEdgeClick) {
        setSelectedMarker((prev) => (prev === 'goal' ? null : 'goal'))
        return
      }

      // If a marker is selected and clicking on an empty tile (not start or goal), reposition it
      if (selectedMarker && !isStart && !isGoal && !isEdgeClick) {
        const newPos = { x, y }

        if (selectedMarker === 'start') {
          setStartPos(newPos)
          setPlayerPos(newPos) // Player starts at the new start position
          setMazeStats(solveMaze(maze, newPos, goalPos, holes))
        } else {
          setGoalPos(newPos)
          setMazeStats(solveMaze(maze, startPos, newPos, holes))
        }

        setSelectedMarker(null)
        return
      }

      // Handle required tile marking (when in mark mode - disables wall editing entirely)
      if (markRequiredTilesMode) {
        setRequiredTiles((prev) => {
          const exists = prev.some((tile) => tile.x === x && tile.y === y)
          if (exists) {
            // Remove tile if already marked
            return prev.filter((tile) => !(tile.x === x && tile.y === y))
          }
          // Add tile if not marked
          return [...prev, { x, y }]
        })
        return
      }

      // Fall through to wall editing for edge clicks
      if (clickY < edgeThreshold && y > 0) {
        toggleWall(x, y, 'top')
      } else if (clickY > CELL_SIZE - edgeThreshold && y < dimensions.height - 1) {
        toggleWall(x, y, 'bottom')
      } else if (clickX < edgeThreshold && x > 0) {
        toggleWall(x, y, 'left')
      } else if (clickX > CELL_SIZE - edgeThreshold && x < dimensions.width - 1) {
        toggleWall(x, y, 'right')
      }
    },
    [
      isEditable,
      toggleWall,
      dimensions,
      startPos,
      goalPos,
      selectedMarker,
      maze,
      holes,
      wildcardTile,
      draggingWildcard,
      markRequiredTilesMode,
    ],
  )

  // Handle keyboard for wall editing (when a cell is focused)
  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, x: number, y: number) => {
      if (!isEditable) return

      // Use Shift+Arrow to toggle walls
      if (!e.shiftKey) return

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          toggleWall(x, y, 'top')
          break
        case 'ArrowDown':
          e.preventDefault()
          toggleWall(x, y, 'bottom')
          break
        case 'ArrowLeft':
          e.preventDefault()
          toggleWall(x, y, 'left')
          break
        case 'ArrowRight':
          e.preventDefault()
          toggleWall(x, y, 'right')
          break
      }
    },
    [isEditable, toggleWall],
  )

  // Drag-to-erase handlers
  const handleDragStart = useCallback(
    (x: number, y: number) => {
      if (!isEditable || markRequiredTilesMode) return
      setIsDraggingErase(true)
      lastDragCellRef.current = { x, y }
    },
    [isEditable, markRequiredTilesMode],
  )

  const handleDragEnter = useCallback(
    (x: number, y: number) => {
      if (!isDraggingErase || !isEditable || markRequiredTilesMode) return

      const lastCell = lastDragCellRef.current
      if (lastCell && (lastCell.x !== x || lastCell.y !== y)) {
        removeWallBetweenCells(lastCell.x, lastCell.y, x, y)
        lastDragCellRef.current = { x, y }
      }
    },
    [isDraggingErase, isEditable, removeWallBetweenCells, markRequiredTilesMode],
  )

  const handleDragEnd = useCallback(() => {
    setIsDraggingErase(false)
    lastDragCellRef.current = null
  }, [])

  // Global mouse up listener to handle drag end even when mouse leaves the maze
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingErase) {
        handleDragEnd()
      }
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [isDraggingErase, handleDragEnd])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore hotkeys when typing in inputs/textareas
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Helper to apply perspective rotation remapping for human controls
      const remappedMove = (inputDir: 'up' | 'down' | 'left' | 'right') => {
        const actualDir = remapDirection(inputDir, perspectiveRotationRef.current)
        move(actualDir)
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          remappedMove('up')
          break
        case 'ArrowDown':
          e.preventDefault()
          remappedMove('down')
          break
        case 'ArrowLeft':
          e.preventDefault()
          remappedMove('left')
          break
        case 'ArrowRight':
          e.preventDefault()
          remappedMove('right')
          break
        case 'r':
        case 'R':
          e.preventDefault()
          regenerateMaze()
          break
        case 'f':
        case 'F':
          e.preventDefault()
          setFogEnabled((f) => !f)
          break
        case 'c':
        case 'C':
          e.preventDefault()
          clearAllWalls()
          break
        case 'Escape':
          e.preventDefault()
          setSelectedMarker(null)
          setDraggingWildcard(false)
          break
        case ' ':
          // Spacebar: Start human player mode if waiting
          if (humanModeStateRef.current === 'waiting') {
            e.preventDefault()
            setHumanModeState('playing')
            setHumanStartTime(Date.now())
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [move, regenerateMaze, clearAllWalls])

  const getCellClasses = (
    _cell: Cell,
    visibility: 'visible' | 'hidden',
    isOnPath: boolean,
    isHole: boolean,
    isAiInvalid: boolean,
    isAiVisited: boolean,
  ): string => {
    // Holes are rendered as transparent (page background)
    if (isHole) {
      return 'bg-transparent'
    }
    if (visibility === 'hidden') {
      return 'bg-[hsl(var(--maze-cell-hidden))]'
    }
    // AI invalid move cells get red shade (highest priority for AI visualization)
    if (isAiInvalid) {
      return 'bg-red-500/40 transition-colors duration-200'
    }
    // AI visited cells get a blue/purple shade
    if (isAiVisited) {
      return 'bg-indigo-500/25 transition-colors duration-200'
    }
    if (isOnPath) {
      return 'bg-blue-500/20 transition-colors duration-200'
    }
    return 'bg-[hsl(var(--maze-cell))] transition-colors duration-200'
  }

  const getCellBorderStyle = (
    cell: Cell,
    visibility: 'visible' | 'hidden',
    isHole: boolean,
  ): React.CSSProperties => {
    // Holes: only show orange border on outer perimeter (where adjacent cell is not a hole)
    if (isHole) {
      const orangeBorder = '1px dashed rgba(249, 115, 22, 0.5)'
      const transparentBorder = '1px solid transparent'

      // Check if adjacent cells are also holes - only show border on outer edges
      const topIsHole = isPositionInHole({ x: cell.x, y: cell.y - 1 }, holes)
      const rightIsHole = isPositionInHole({ x: cell.x + 1, y: cell.y }, holes)
      const bottomIsHole = isPositionInHole({ x: cell.x, y: cell.y + 1 }, holes)
      const leftIsHole = isPositionInHole({ x: cell.x - 1, y: cell.y }, holes)

      return {
        borderTop: topIsHole ? transparentBorder : orangeBorder,
        borderRight: rightIsHole ? transparentBorder : orangeBorder,
        borderBottom: bottomIsHole ? transparentBorder : orangeBorder,
        borderLeft: leftIsHole ? transparentBorder : orangeBorder,
      }
    }
    if (visibility === 'hidden') {
      return {
        borderTop: '1px solid hsl(var(--maze-cell))',
        borderRight: '1px solid hsl(var(--maze-cell))',
        borderBottom: '1px solid hsl(var(--maze-cell))',
        borderLeft: '1px solid hsl(var(--maze-cell))',
      }
    }

    const wallColor = 'hsl(var(--maze-wall))'
    return {
      borderTop: cell.walls.top ? `1px solid ${wallColor}` : '1px solid transparent',
      borderRight: cell.walls.right ? `1px solid ${wallColor}` : '1px solid transparent',
      borderBottom: cell.walls.bottom ? `1px solid ${wallColor}` : '1px solid transparent',
      borderLeft: cell.walls.left ? `1px solid ${wallColor}` : '1px solid transparent',
    }
  }

  return (
    <div className="h-screen bg-background flex text-foreground overflow-hidden">
      {/* Maze Controls Panel - Left Side */}
      <div className="flex-shrink-0 h-full p-4">
        <MazeControls
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          minShortestPath={minShortestPath}
          onMinShortestPathChange={setMinShortestPath}
          generateHoles={generateHolesEnabled}
          onGenerateHolesToggle={() => setGenerateHolesEnabled((g) => !g)}
          exitDoorEnabled={exitDoorEnabled}
          onExitDoorToggle={() => setExitDoorEnabled((e) => !e)}
          wildcardTileEnabled={wildcardTileEnabled}
          onWildcardTileToggle={() => setWildcardTileEnabled((w) => !w)}
          humanPlayerModeEnabled={humanPlayerModeEnabled}
          onHumanPlayerModeToggle={() => setHumanPlayerModeEnabled((h) => !h)}
          perspectiveRotationEnabled={perspectiveRotationEnabled}
          onPerspectiveRotationToggle={() => setPerspectiveRotationEnabled((p) => !p)}
          hackMode={hackMode}
          onHackModeChange={setHackMode}
          fogEnabled={fogEnabled}
          onFogToggle={() => setFogEnabled((f) => !f)}
          mazeStats={mazeStats}
          generationIterations={generationIterations}
          generationFailed={generationFailed}
          onRegenerate={regenerateMaze}
          hasInteracted={moveHistory.length > 0}
          onResetState={handleResetMazeState}
          mazeDesignEnabled={exportOptionsEnabled}
          onMazeDesignEnabledToggle={() => setExportOptionsEnabled((e) => !e)}
        />
      </div>

      {/* Main Content - Center */}
      <div className="flex-1 flex flex-col items-center justify-between px-5 py-6">
        {/* Export Toolbar & Saved Mazes - at top */}
        {exportOptionsEnabled && (
          <div className="flex items-start gap-3">
            {/* Saved Mazes Panel */}
            {savedMazes.length > 0 && (
              <SavedMazesOverlay
                mazes={savedMazes}
                onLoad={handleLoadSavedMaze}
                onDelete={handleDeleteSavedMaze}
                isVisible={true}
              />
            )}

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                {/* Top Row: Shortest Path */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Add Shortest Path:</span>

                  {isRecordingShortestPath ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-yellow-500">
                        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                        Recording ({shortestPathPlaythrough.length} moves)
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecordingShortestPath(false)
                          // Reset maze state to clear the blue path trail
                          setPlayerPos(startPos)
                          setMoves(0)
                          setMoveHistory([])
                          setWon(false)
                          setLost(false)
                          // Validate the recorded path against constraints
                          const nonEmptySubsequences = recordedSubsequences.filter(
                            (seq) => seq.length > 0,
                          )
                          const hasSubsequences = nonEmptySubsequences.length > 0
                          const hasTiles = requiredTiles.length > 0
                          if (hasSubsequences || hasTiles) {
                            const result = validatePath(
                              shortestPathPlaythrough,
                              startPos,
                              goalPos,
                              {
                                requirementType: hasSubsequences
                                  ? 'REQUIRED_SUBSEQUENCE'
                                  : 'REQUIRED_TILES',
                                requiredSolutionSubsequences: hasSubsequences
                                  ? nonEmptySubsequences
                                  : undefined,
                                requiredTiles: hasTiles ? requiredTiles : undefined,
                              },
                            )
                            setShortestPathValidation(result)
                          } else {
                            setShortestPathValidation(null)
                          }
                        }}
                        className="px-2 py-0.5 text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded border border-yellow-500/30 focus:outline-none"
                      >
                        Stop
                      </button>
                    </>
                  ) : shortestPathPlaythrough.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecordingSubsequence(false)
                        setMarkRequiredTilesMode(false)
                        setShortestPathPlaythrough([])
                        setShortestPathValidation(null)
                        // Reset maze state before starting recording
                        setPlayerPos(startPos)
                        setMoves(0)
                        setMoveHistory([])
                        setWon(false)
                        setLost(false)
                        setIsRecordingShortestPath(true)
                      }}
                      disabled={isRecordingSubsequence || markRequiredTilesMode}
                      className="px-2 py-0.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                    >
                      Add
                    </button>
                  ) : (
                    <>
                      <span className="text-xs text-yellow-400">
                        ({shortestPathPlaythrough.length} moves)
                      </span>
                      {/* Validation feedback */}
                      {shortestPathValidation && (
                        <div
                          className={cn(
                            'text-xs px-2 py-0.5 rounded',
                            shortestPathValidation.constraintsSatisfied
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400',
                          )}
                        >
                          {shortestPathValidation.constraintsSatisfied
                            ? '✓ Valid'
                            : (shortestPathValidation.constraintError ?? 'Invalid')}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowShortestPath(!showShortestPath)}
                        className={cn(
                          'px-2 py-0.5 text-xs rounded border focus:outline-none',
                          showShortestPath
                            ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {showShortestPath ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRecordingSubsequence(false)
                          setMarkRequiredTilesMode(false)
                          setShortestPathPlaythrough([])
                          setShortestPathValidation(null)
                          // Reset maze state before starting recording
                          setPlayerPos(startPos)
                          setMoves(0)
                          setMoveHistory([])
                          setWon(false)
                          setLost(false)
                          setIsRecordingShortestPath(true)
                        }}
                        disabled={isRecordingSubsequence || markRequiredTilesMode}
                        className={cn(
                          'px-2 py-0.5 text-xs rounded border focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                          'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        Re-record
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShortestPathPlaythrough([])
                          setShortestPathValidation(null)
                        }}
                        disabled={isRecordingSubsequence || markRequiredTilesMode}
                        className="px-2 py-0.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>

                {/* Bottom Row: Required Paths */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Add Required Paths:</span>

                  {/* Path Chips */}
                  {recordedSubsequences.map((seq, idx) => (
                    <button
                      type="button"
                      key={`path-${idx}-${seq.length}`}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 text-xs rounded border cursor-pointer',
                        idx === activeSubsequenceIndex && isRecordingSubsequence
                          ? 'bg-red-500/20 border-red-500/50 text-red-500'
                          : idx === activeSubsequenceIndex
                            ? 'bg-primary/20 border-primary/50 text-primary'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                      )}
                      onClick={() => {
                        setActiveSubsequenceIndex(idx)
                        if (isRecordingSubsequence) {
                          // Continue recording to this path
                        }
                      }}
                    >
                      <span>
                        Path {idx + 1}
                        {seq.length > 0 && ` (${seq.length})`}
                      </span>
                      {!isRecordingSubsequence && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRecordedSubsequences((prev) => {
                              const updated = prev.filter((_, i) => i !== idx)
                              // Adjust active index if needed
                              if (activeSubsequenceIndex >= updated.length && updated.length > 0) {
                                setActiveSubsequenceIndex(updated.length - 1)
                              } else if (updated.length === 0) {
                                setActiveSubsequenceIndex(0)
                              }
                              return updated
                            })
                          }}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          ×
                        </button>
                      )}
                    </button>
                  ))}

                  {/* Add New Path Button */}
                  {!isRecordingSubsequence && (
                    <button
                      type="button"
                      onClick={() => {
                        setRecordedSubsequences((prev) => [...prev, []])
                        setActiveSubsequenceIndex(recordedSubsequences.length)
                      }}
                      disabled={markRequiredTilesMode || isRecordingShortestPath}
                      className="px-2 py-0.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                    >
                      + Add Path
                    </button>
                  )}

                  {/* Recording Controls */}
                  {isRecordingSubsequence ? (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-red-500 ml-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        Recording Path {activeSubsequenceIndex + 1}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsRecordingSubsequence(false)}
                        className="px-2 py-0.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded border border-red-500/30 focus:outline-none"
                      >
                        Stop
                      </button>
                    </>
                  ) : (
                    recordedSubsequences.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowRequiredPaths(!showRequiredPaths)}
                          className={cn(
                            'px-2 py-0.5 text-xs rounded border focus:outline-none',
                            showRequiredPaths
                              ? 'bg-primary/20 border-primary/50 text-primary'
                              : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {showRequiredPaths ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRequiredTiles([])
                            setMarkRequiredTilesMode(false)
                            setIsRecordingShortestPath(false)
                            // Clear current path and start recording
                            setRecordedSubsequences((prev) => {
                              const updated = [...prev]
                              updated[activeSubsequenceIndex] = []
                              return updated
                            })
                            setIsRecordingSubsequence(true)
                          }}
                          disabled={markRequiredTilesMode || isRecordingShortestPath}
                          className="px-2 py-0.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                        >
                          Record
                        </button>
                      </>
                    )
                  )}
                </div>

                {/* Third Row: Required Tiles */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Add Required Tiles:</span>

                  {requiredTiles.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        // Clear recorded subsequences when enabling tile marking (mutual exclusion)
                        setRecordedSubsequences([])
                        setActiveSubsequenceIndex(0)
                        setIsRecordingSubsequence(false)
                        setShortestPathPlaythrough([])
                        setIsRecordingShortestPath(false)
                        setShortestPathValidation(null)
                        setMarkRequiredTilesMode(true)
                      }}
                      disabled={isRecordingSubsequence || isRecordingShortestPath}
                      className="px-2 py-0.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                    >
                      Add
                    </button>
                  ) : (
                    <>
                      <span className="text-xs text-cyan-400">({requiredTiles.length} tiles)</span>
                      <button
                        type="button"
                        onClick={() => setShowRequiredTiles(!showRequiredTiles)}
                        className={cn(
                          'px-2 py-0.5 text-xs rounded border focus:outline-none',
                          showRequiredTiles
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {showRequiredTiles ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarkRequiredTilesMode(!markRequiredTilesMode)}
                        disabled={isRecordingSubsequence || isRecordingShortestPath}
                        className={cn(
                          'px-2 py-0.5 text-xs rounded border focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
                          markRequiredTilesMode
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {markRequiredTilesMode ? 'Done' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRequiredTiles([])
                          setMarkRequiredTilesMode(false)
                          setShortestPathValidation(null)
                        }}
                        disabled={isRecordingSubsequence || isRecordingShortestPath}
                        className="px-2 py-0.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>

                {/* Fourth Row: Additional Options */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Additional Options:</span>
                  <button
                    type="button"
                    onClick={handleFillInMaze}
                    disabled={!isEditable}
                    className="px-2 py-0.5 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded border border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                  >
                    Fill in Maze
                  </button>
                </div>
              </div>

              {/* Maze Name & Save */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Maze Name:</span>
                <input
                  type="text"
                  placeholder="My Custom Maze"
                  value={mazeName}
                  onChange={(e) => setMazeName(e.target.value)}
                  className="flex-1 h-7 px-2 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleSaveMaze}
                  disabled={!mazeName.trim()}
                  className="px-2 py-0.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-500 rounded border border-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none whitespace-nowrap"
                >
                  Save Maze
                </button>
              </div>
            </div>

            {/* Import/Export Floating Panel */}
            <div className="bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg px-3 py-2">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">Import/Export:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-0.5 text-xs bg-muted/50 hover:bg-muted text-muted-foreground rounded border border-border flex items-center gap-1 focus:outline-none"
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={handleExportMaze}
                    className="px-2 py-0.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-500 rounded border border-green-500/30 flex items-center gap-1 focus:outline-none"
                  >
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenExportTestSetDialog}
                    className="px-2 py-0.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-500 rounded border border-blue-500/30 flex items-center gap-1 focus:outline-none"
                  >
                    <Download className="w-3 h-3" />
                    Export Test Set
                  </button>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Top spacer for centering */}
        <div className="flex-1" />

        {/* Center content */}
        <div className="flex flex-col items-center">
          {/* Perspective Rotation Message */}
          {perspectiveRotation !== 'none' && (
            <div className="max-w-md text-center text-xs text-amber-500 mb-3 px-4 py-2 rounded-md border border-amber-500/30 bg-amber-500/10">
              <p className="mb-1 font-semibold">[PERSPECTIVE ROTATION]</p>{' '}
              {getPerspectiveRotationDescription(perspectiveRotation)}
            </div>
          )}

          {/* Header */}
          <h1 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-2">
            Maze
          </h1>

          {/* Game Status */}
          {won && (
            <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-green-500 mb-2 animate-pulse">
              You won!
            </div>
          )}
          {lost && (
            <div className="text-[13px] font-semibold uppercase tracking-[0.2em] text-red-500 mb-2 animate-pulse">
              You fell into a hole!
            </div>
          )}

          {/* Maze Grid */}
          <div className="relative">
            <div
              key={gameKey}
              className={cn(
                'bg-[hsl(var(--maze-cell-hidden))] rounded animate-fade-in transition-all duration-300',
                humanModeState === 'waiting' && 'blur-md',
              )}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${dimensions.width}, ${CELL_SIZE}px)`,
                gridTemplateRows: `repeat(${dimensions.height}, ${CELL_SIZE}px)`,
              }}
            >
              {maze.map((row) =>
                row.map((cell) => {
                  const isPlayer = cell.x === playerPos.x && cell.y === playerPos.y
                  const isGoal = cell.x === goalPos.x && cell.y === goalPos.y
                  const isWildcard =
                    wildcardTile && cell.x === wildcardTile.x && cell.y === wildcardTile.y
                  const visibility = getCellVisibility(cell.x, cell.y)
                  const isOnPath = pathTaken.has(`${cell.x},${cell.y}`)
                  const isHole = isPositionInHole({ x: cell.x, y: cell.y }, holes)
                  const isRequiredTile = requiredTiles.some(
                    (tile) => tile.x === cell.x && tile.y === cell.y,
                  )
                  const cellKey = `${cell.x},${cell.y}`
                  const isAiInvalid = aiInvalidMoveCells.has(cellKey)
                  const isAiVisited = aiVisitedCells.has(cellKey)

                  // Check if cell is on recorded shortest path
                  const isOnShortestPath = shortestPathPlaythrough.some(
                    (step) => step.position.x === cell.x && step.position.y === cell.y,
                  )

                  // Check if cell is on any recorded subsequence path
                  const isOnRequiredPath = recordedSubsequences.some((seq) =>
                    seq.some((step) => step.position.x === cell.x && step.position.y === cell.y),
                  )

                  // Determine cursor: pointer for wildcard interactions, crosshair for edit mode, pointer for marking tiles
                  const getCursor = () => {
                    if (isHole) return undefined
                    if (markRequiredTilesMode) return 'cursor-pointer'
                    if (isWildcard) return 'cursor-pointer'
                    if (draggingWildcard) return 'cursor-pointer'
                    if (isEditable) return 'cursor-crosshair'
                    return undefined
                  }

                  return (
                    <div
                      key={`${cell.x}-${cell.y}`}
                      className={cn(
                        'flex items-center justify-center relative box-border',
                        getCellClasses(
                          cell,
                          visibility,
                          isOnPath,
                          isHole,
                          isAiInvalid,
                          isAiVisited,
                        ),
                        getCursor(),
                      )}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        ...getCellBorderStyle(cell, visibility, isHole),
                      }}
                      onClick={(e) => !isHole && handleCellClick(e, cell.x, cell.y)}
                      onKeyDown={(e) => !isHole && handleCellKeyDown(e, cell.x, cell.y)}
                      onMouseDown={() => !isHole && handleDragStart(cell.x, cell.y)}
                      onMouseEnter={() => !isHole && handleDragEnter(cell.x, cell.y)}
                      onMouseUp={handleDragEnd}
                      tabIndex={isEditable && !isHole ? 0 : undefined}
                      role={isEditable && !isHole ? 'button' : undefined}
                      aria-label={
                        isHole
                          ? 'Hole'
                          : isWildcard
                            ? 'Wildcard tile - click to move'
                            : isEditable
                              ? `Cell ${cell.x},${cell.y} - click edge to toggle wall`
                              : undefined
                      }
                    >
                      {/* Required tile highlight */}
                      {isRequiredTile && !isHole && showRequiredTiles && (
                        <div className="absolute inset-0 bg-amber-400/30 pointer-events-none" />
                      )}
                      {/* Shortest path highlight */}
                      {isOnShortestPath && !isHole && showShortestPath && (
                        <div className="absolute inset-1 rounded-sm bg-yellow-400/40 pointer-events-none" />
                      )}
                      {/* Required paths highlight */}
                      {isOnRequiredPath && !isHole && showRequiredPaths && (
                        <div className="absolute inset-1.5 rounded-full bg-purple-400/40 pointer-events-none" />
                      )}
                      {/* Wildcard tile */}
                      {isWildcard && !isPlayer && !isGoal && !isHole && (
                        <div
                          className={cn(
                            'w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold',
                            visibility === 'visible'
                              ? 'bg-purple-500 shadow-[0_0_12px_#a855f7,0_0_4px_#a855f7] text-white'
                              : 'bg-purple-600 shadow-[0_0_8px_#9333ea] opacity-70 text-white/70',
                            draggingWildcard &&
                              'ring-2 ring-offset-1 ring-yellow-400 ring-offset-transparent animate-pulse',
                          )}
                        >
                          ?
                        </div>
                      )}
                      {isGoal && !isPlayer && !isHole && (
                        <div
                          className={cn(
                            'w-3.5 h-3.5 rounded-full animate-pulse-glow',
                            visibility === 'visible'
                              ? 'bg-green-500 shadow-[0_0_12px_#22c55e,0_0_4px_#22c55e]'
                              : 'bg-green-600 shadow-[0_0_8px_#16a34a] opacity-70',
                            isEditable &&
                              selectedMarker === 'goal' &&
                              'ring-2 ring-offset-1 ring-yellow-400 ring-offset-transparent',
                          )}
                        />
                      )}
                      {isPlayer && !isHole && (
                        <div
                          className={cn(
                            'w-3 h-3 rounded-sm transition-all duration-100',
                            won
                              ? 'bg-blue-500 shadow-[0_0_12px_#3b82f6]'
                              : lost
                                ? 'bg-red-500 shadow-[0_0_12px_#ef4444]'
                                : 'bg-[hsl(var(--maze-player))] shadow-[0_0_8px_hsl(var(--maze-player)/0.6)]',
                            isEditable &&
                              selectedMarker === 'start' &&
                              'ring-2 ring-offset-1 ring-yellow-400 ring-offset-transparent',
                          )}
                        />
                      )}
                    </div>
                  )
                }),
              )}
            </div>
            {/* Human Player Mode - Press Spacebar Overlay */}
            {humanModeState === 'waiting' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-background/80 backdrop-blur-sm px-6 py-3 rounded-lg border shadow-lg">
                  <div className="text-lg font-semibold text-foreground animate-pulse">
                    Press Spacebar to Begin
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-3 flex gap-4 items-center text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[hsl(var(--maze-player))] rounded-sm shadow-[0_0_4px_hsl(var(--maze-player)/0.6)]" />
              You
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_6px_#22c55e]" />
              Goal
            </span>
            {holes.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-background border border-dashed border-orange-500/50 rounded-sm" />
                Hole
              </span>
            )}
            {wildcardTile && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-purple-500 rounded shadow-[0_0_6px_#a855f7] flex items-center justify-center text-[6px] font-bold text-white">
                  ?
                </span>
                Wildcard
              </span>
            )}
          </div>

          {/* Human Player Mode - Completion Stats */}
          {humanModeState === 'completed' && humanStartTime && humanEndTime && mazeStats && (
            <div className="mt-3 p-3 rounded-lg border bg-green-500/10 border-green-500/30">
              <div className="text-sm font-semibold text-green-400 mb-2">Maze Completed!</div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Time</div>
                  <div className="font-mono text-foreground">
                    {((humanEndTime - humanStartTime) / 1000).toFixed(2)}s
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Your Path</div>
                  <div className="font-mono text-foreground">{moveHistory.length} steps</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Shortest Path</div>
                  <div className="font-mono text-foreground">{mazeStats.shortestPath} steps</div>
                </div>
              </div>
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">Path Efficiency: </span>
                <span
                  className={cn(
                    'font-mono font-semibold',
                    moveHistory.length <= mazeStats.shortestPath
                      ? 'text-green-400'
                      : moveHistory.length <= mazeStats.shortestPath * 1.5
                        ? 'text-yellow-400'
                        : 'text-orange-400',
                  )}
                >
                  {Math.round((mazeStats.shortestPath / moveHistory.length) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* AI Agent - Completion Stats */}
          {(() => {
            const aiMoves = moveHistory.filter((m) => m.source === 'ai')
            const hasAiMoves = aiMoves.length > 0
            const isAiCompletion = won && hasAiMoves && humanModeState !== 'completed'
            const isAiHoleFailure = lost && hasAiMoves && humanModeState !== 'completed'
            const isAiWallFailure = aiWallCollision && hasAiMoves && humanModeState !== 'completed'

            // Use AI session stats (LLM thinking time) - consistent with AI panel display
            const aiTimeDisplay = aiSessionStats
              ? formatDuration(aiSessionStats.totalThinkingMs)
              : '—'

            // Check if constraint validation failed
            const constraintFailed = aiConstraintValidation && !aiConstraintValidation.passed

            // Check if path is too long compared to recorded shortest
            const pathTooLong =
              aiConstraintValidation?.pathLengthComparison &&
              aiConstraintValidation.pathLengthComparison.ai >
                aiConstraintValidation.pathLengthComparison.shortest

            if (isAiCompletion && mazeStats) {
              // If constraint validation failed, show as failure instead of success
              if (constraintFailed) {
                return (
                  <div className="mt-3 p-3 rounded-lg border bg-red-500/10 border-red-500/30">
                    <div className="text-sm font-semibold text-red-400 mb-2">
                      AI Agent Failed - Constraint Violation
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {aiConstraintValidation.error}
                    </div>
                    {aiConstraintValidation.pathLengthComparison && (
                      <div className="text-xs text-muted-foreground">
                        AI path: {aiConstraintValidation.pathLengthComparison.ai} moves | Required
                        shortest: {aiConstraintValidation.pathLengthComparison.shortest} moves
                      </div>
                    )}
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Time: </span>
                      <span className="font-mono text-foreground">{aiTimeDisplay}</span>
                    </div>
                  </div>
                )
              }

              // If path is too long compared to recorded shortest, show as failure
              if (pathTooLong) {
                return (
                  <div className="mt-3 p-3 rounded-lg border bg-red-500/10 border-red-500/30">
                    <div className="text-sm font-semibold text-red-400 mb-2">
                      AI Agent Failed - Path Too Long
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      AI used {aiConstraintValidation?.pathLengthComparison?.ai} moves but the
                      recorded shortest path is{' '}
                      {aiConstraintValidation?.pathLengthComparison?.shortest} moves.
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Time: </span>
                      <span className="font-mono text-foreground">{aiTimeDisplay}</span>
                    </div>
                  </div>
                )
              }

              // Show success with path comparison info if available
              return (
                <div className="mt-3 p-3 rounded-lg border bg-blue-500/10 border-blue-500/30">
                  <div className="text-sm font-semibold text-blue-400 mb-2">
                    AI Agent Completed Maze!
                  </div>
                  {aiConstraintValidation?.pathLengthComparison && (
                    <div className="text-xs text-green-400 mb-2">
                      Path matches recorded shortest (
                      {aiConstraintValidation.pathLengthComparison.shortest} moves)
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">Time</div>
                      <div className="font-mono text-foreground">{aiTimeDisplay}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">AI Path</div>
                      <div className="font-mono text-foreground">{aiMoves.length} steps</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Shortest Path</div>
                      <div className="font-mono text-foreground">
                        {mazeStats.shortestPath} steps
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Path Efficiency: </span>
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        aiMoves.length <= mazeStats.shortestPath
                          ? 'text-green-400'
                          : aiMoves.length <= mazeStats.shortestPath * 1.5
                            ? 'text-yellow-400'
                            : 'text-orange-400',
                      )}
                    >
                      {Math.round((mazeStats.shortestPath / aiMoves.length) * 100)}%
                    </span>
                  </div>
                </div>
              )
            }

            if (isAiHoleFailure) {
              return (
                <div className="mt-3 p-3 rounded-lg border bg-red-500/10 border-red-500/30">
                  <div className="text-sm font-semibold text-red-400 mb-2">AI Agent Failed</div>
                  <div className="text-xs text-muted-foreground">
                    The AI fell into a hole after {aiMoves.length} moves.
                  </div>
                  {constraintFailed && (
                    <div className="text-xs text-yellow-400 mt-1">
                      Also violated constraint: {aiConstraintValidation?.error}
                    </div>
                  )}
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Time: </span>
                    <span className="font-mono text-foreground">{aiTimeDisplay}</span>
                  </div>
                </div>
              )
            }

            if (isAiWallFailure) {
              return (
                <div className="mt-3 p-3 rounded-lg border bg-red-500/10 border-red-500/30">
                  <div className="text-sm font-semibold text-red-400 mb-2">AI Agent Failed</div>
                  <div className="text-xs text-muted-foreground">
                    The AI ran into a wall after {aiMoves.length} moves.
                  </div>
                  {constraintFailed && (
                    <div className="text-xs text-yellow-400 mt-1">
                      Also violated constraint: {aiConstraintValidation?.error}
                    </div>
                  )}
                  <div className="mt-2 text-xs">
                    <span className="text-muted-foreground">Time: </span>
                    <span className="font-mono text-foreground">{aiTimeDisplay}</span>
                  </div>
                </div>
              )
            }

            return null
          })()}
        </div>

        {/* Bottom spacer for centering */}
        <div className="flex-1" />

        {/* Instructions - at very bottom */}
        <div className="text-[11px] text-muted-foreground font-mono">
          <span className="text-foreground">r</span> new maze{' '}
          <span className="text-foreground">f</span> toggle fog{' '}
          <span className="text-foreground">t</span> theme{' '}
          <span className="text-foreground">←↑↓→</span> move
          {isEditable && (
            <>
              {' '}
              <span className="text-foreground">c</span> clear walls{' '}
              <span className="text-foreground">click edge</span> toggle wall{' '}
              <span className="text-foreground">drag</span> erase walls{' '}
              <span className="text-foreground">click marker</span> reposition
            </>
          )}
        </div>
      </div>

      {/* AI Panel - Right Side */}
      <div className="flex-shrink-0 p-4 h-screen flex flex-col">
        <AIPanel
          prompt={currentPrompt}
          generatePrompt={generatePromptWithContext}
          onMove={handleAIMove}
          onReset={handleAIReset}
          isGameWon={won}
          isGameLost={lost}
          moveHistory={moveHistory}
          onClearHistory={handleClearMoveHistory}
          promptViewOptions={promptViewOptions}
          onPromptViewOptionsChange={setPromptViewOptions}
          gameKey={gameKey}
          shortestPath={mazeStats?.shortestPath ?? null}
          playerPos={playerPos}
          startPos={startPos}
          onAIComplete={(stats) => setAiSessionStats(stats)}
          specialInstructions={specialInstructions}
          onSpecialInstructionsChange={setSpecialInstructions}
        />
      </div>

      {/* Export Test Set Dialog */}
      <Dialog open={exportTestSetDialogOpen} onOpenChange={setExportTestSetDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Export Test Set</DialogTitle>
            <DialogDescription>
              Select which mazes to include in the test set export.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 flex-1 overflow-hidden">
            {/* Test set name input */}
            <div className="flex flex-col gap-2">
              <label htmlFor="testSetName" className="text-sm font-medium">
                Test Set Name
              </label>
              <input
                id="testSetName"
                type="text"
                value={testSetName}
                onChange={(e) => setTestSetName(e.target.value)}
                className="h-9 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="custom-test-set"
              />
            </div>

            {/* Maze selection */}
            <div className="flex flex-col gap-2 flex-1 overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Mazes ({selectedMazesForExport.size} selected)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allMazes = getSavedMazesList()
                      setSelectedMazesForExport(new Set(allMazes.map((m) => m.name)))
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMazesForExport(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto border border-border rounded-md p-2 space-y-1">
                {getSavedMazesList().map((maze) => {
                  const checkboxId = `maze-export-${maze.name.replace(/\s+/g, '-')}`
                  return (
                    <label
                      key={maze.name}
                      htmlFor={checkboxId}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={selectedMazesForExport.has(maze.name)}
                        onCheckedChange={(checked) => {
                          setSelectedMazesForExport((prev) => {
                            const next = new Set(prev)
                            if (checked) {
                              next.add(maze.name)
                            } else {
                              next.delete(maze.name)
                            }
                            return next
                          })
                        }}
                      />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">{maze.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {maze.width}x{maze.height} • {maze.difficulty}
                          {maze.shortestPathPlaythrough?.length
                            ? ` • ${maze.shortestPathPlaythrough.length} moves`
                            : ''}
                          {maze.requirementType ? ` • ${maze.requirementType}` : ''}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => setExportTestSetDialogOpen(false)}
              className="px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-md"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExportTestSet}
              disabled={selectedMazesForExport.size === 0 || !testSetName.trim()}
              className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export ({selectedMazesForExport.size})
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
