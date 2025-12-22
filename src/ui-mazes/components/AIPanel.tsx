/**
 * AI Panel - Wrapper around shared AIControlPanel for mazes
 */

import { toast } from '@/ui-library/components/ui/sonner'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type LLMConfig,
  type LLMResponseStats,
  getMazeSolution,
  getSingleMove,
} from '../services/llm'
import { AIControlPanel } from '../shared/AIControlPanel'
import { LLMParseError, getApiKey, hasApiKey } from '../shared/llm-client'
import type { AgentLog, HistoryItem, SessionMetrics } from '../shared/types'
import type { MoveByMoveContext, PromptViewOptions } from '../types'

type AIMove = { action: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' }

export type LogLevel = 'info' | 'success' | 'error' | 'request' | 'response'

export interface MoveRecord {
  id: string
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  source: 'human' | 'ai'
  timestamp: number
}

// Planned move with execution status
type PlannedMoveStatus = 'pending' | 'executing' | 'success' | 'failed'

interface PlannedMove {
  action: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  status: PlannedMoveStatus
}

interface AIPanelProps {
  /** Current maze prompt to send to the AI */
  prompt: string
  /** Callback to generate prompt with move-by-move context */
  generatePrompt: (context: MoveByMoveContext | null) => string
  /** Callback to execute a single move, returns true if move was valid */
  onMove: (direction: 'up' | 'down' | 'left' | 'right') => boolean
  /** Callback to reset player position to start */
  onReset: () => void
  /** Whether the player has reached the goal */
  isGameWon: boolean
  /** Whether the player has lost (fell in hole) */
  isGameLost: boolean
  /** Move history */
  moveHistory: MoveRecord[]
  /** Callback to clear move history */
  onClearHistory: () => void
  /** Which maze views to include in the prompt */
  promptViewOptions: PromptViewOptions
  /** Callback to update prompt view options */
  onPromptViewOptionsChange: (options: PromptViewOptions) => void
  /** Key that changes when maze is regenerated */
  gameKey: number
  /** Shortest path length (-1 if unreachable) for correctness checking */
  shortestPath: number | null
  /** Current player position for move-by-move mode */
  playerPos: { x: number; y: number }
  /** Start position for move-by-move mode */
  startPos: { x: number; y: number }
  /** Callback when AI agent completes with final stats (not called during replay) */
  onAIComplete?: (stats: SessionMetrics) => void
  /** Special instructions for the AI (controlled by parent) */
  specialInstructions: string
  /** Callback to update special instructions */
  onSpecialInstructionsChange: (value: string) => void
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini'

export function AIPanel({
  prompt,
  generatePrompt,
  onMove,
  onReset,
  isGameWon,
  isGameLost,
  moveHistory: _moveHistory,
  onClearHistory,
  promptViewOptions,
  onPromptViewOptionsChange,
  gameKey,
  shortestPath,
  playerPos: _playerPos,
  startPos,
  onAIComplete,
  specialInstructions,
  onSpecialInstructionsChange,
}: AIPanelProps) {
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [error, setError] = useState<string | null>(null)
  const [rawResponse, setRawResponse] = useState<string | null>(null)
  const [lastAiResponse, setLastAiResponse] = useState<string | null>(null)
  const [lastPromptUsed, setLastPromptUsed] = useState<string | null>(null)
  const [sessionTotals, setSessionTotals] = useState<SessionMetrics>({
    cost: 0,
    totalThinkingMs: 0,
    decisionCount: 0,
  })
  const [plannedMoves, setPlannedMoves] = useState<PlannedMove[]>([])
  const [inflightStartTime, setInflightStartTime] = useState<number | null>(null)
  const [inflightSeconds, setInflightSeconds] = useState<number | null>(null)
  const [storedSolution, setStoredSolution] = useState<AIMove[]>([])
  const [aiComments, setAiComments] = useState<string | null>(null)
  const [specialActionResult, setSpecialActionResult] = useState<{
    action: string
    isCorrect: boolean
  } | null>(null)

  const isRunningRef = useRef(false)
  const isReplayingRef = useRef(false)
  const wasRunningRef = useRef(false)
  const movesRef = useRef<AIMove[]>([])
  const moveIndexRef = useRef(0)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove
  const prevGameKeyRef = useRef(gameKey)

  // Reset stored solution, comments, and special action result when maze is regenerated
  useEffect(() => {
    if (gameKey !== prevGameKeyRef.current) {
      prevGameKeyRef.current = gameKey
      setStoredSolution([])
      setAiComments(null)
      setSpecialActionResult(null)
    }
  }, [gameKey])

  // Build full prompt with optional special instructions
  const buildFullPrompt = useCallback(() => {
    // For move-by-move mode, generate the initial prompt (no moves yet)
    const basePrompt =
      promptViewOptions.executionMode === 'moveByMove'
        ? generatePrompt({ startPos, currentPos: startPos, moveHistory: [] })
        : prompt
    if (!specialInstructions.trim()) return basePrompt
    return `${basePrompt}\nSPECIAL ADDITIONAL INSTRUCTIONS:\n${specialInstructions.trim()}`
  }, [prompt, specialInstructions, promptViewOptions.executionMode, generatePrompt, startPos])

  // Handle copy prompt with special instructions included
  const handleCopyPrompt = useCallback(async () => {
    const fullPrompt = buildFullPrompt()
    try {
      await navigator.clipboard.writeText(fullPrompt)
      toast.success('Prompt copied to clipboard')
    } catch {
      toast.error('Failed to copy prompt')
    }
  }, [buildFullPrompt])

  // Build execution result summary
  const buildExecutionResult = useCallback(() => {
    const parts: string[] = []

    if (isGameWon) {
      parts.push('Result: SUCCESS - Goal reached!')
    } else if (isGameLost) {
      parts.push('Result: FAILURE - Fell into a hole')
    } else if (error) {
      parts.push(`Result: ERROR - ${error}`)
    } else if (specialActionResult) {
      if (specialActionResult.isCorrect) {
        parts.push(`Result: CORRECT - AI correctly identified ${specialActionResult.action}`)
      } else {
        parts.push(`Result: INCORRECT - AI claimed ${specialActionResult.action} but was wrong`)
      }
    } else if (plannedMoves.length > 0) {
      const completed = plannedMoves.filter((m) => m.status === 'success').length
      const failed = plannedMoves.filter((m) => m.status === 'failed').length
      const pending = plannedMoves.filter((m) => m.status === 'pending').length
      parts.push(
        `Result: IN PROGRESS - ${completed} completed, ${failed} failed, ${pending} pending`,
      )
    } else {
      parts.push('Result: No execution yet')
    }

    // Add move sequence
    if (plannedMoves.length > 0) {
      parts.push('')
      parts.push('Moves executed:')
      plannedMoves.forEach((move, idx) => {
        const statusEmoji = move.status === 'success' ? '✓' : move.status === 'failed' ? '✗' : '○'
        parts.push(`  ${idx + 1}. ${statusEmoji} ${move.action}`)
      })
    }

    return parts.join('\n')
  }, [isGameWon, isGameLost, error, specialActionResult, plannedMoves])

  // Handle copy full context (prompt + response + execution result)
  const handleCopyFullContext = useCallback(async () => {
    if (!lastPromptUsed) {
      toast.error('No AI run to copy')
      return
    }

    const parts: string[] = []

    parts.push('=== INITIAL AI PROMPT ===')
    parts.push(lastPromptUsed)
    parts.push('')

    parts.push('=== AI RESPONSE ===')
    if (lastAiResponse) {
      parts.push(lastAiResponse)
    } else {
      parts.push('(No response recorded)')
    }
    parts.push('')

    parts.push('=== SOLUTION EXECUTION ===')
    parts.push(buildExecutionResult())

    const fullContext = parts.join('\n')

    try {
      await navigator.clipboard.writeText(fullContext)
      toast.success('Full context copied to clipboard')
    } catch {
      toast.error('Failed to copy context')
    }
  }, [lastPromptUsed, lastAiResponse, buildExecutionResult])

  const addLog = useCallback(
    (level: LogLevel, message: string, details?: string, stats?: LLMResponseStats) => {
      const log: AgentLog = {
        id: `${Date.now()}-${Math.random()}`,
        level,
        message,
        timestamp: Date.now(),
        details,
        stats,
      }
      setLogs((prev) => [...prev, log])
    },
    [],
  )

  const clearHistory = useCallback(() => {
    setPlannedMoves([])
    setLogs([])
    setError(null)
    setRawResponse(null)
    setLastAiResponse(null)
    setLastPromptUsed(null)
    setAiComments(null)
    setSessionTotals({ cost: 0, totalThinkingMs: 0, decisionCount: 0 })
    movesRef.current = []
    moveIndexRef.current = 0
    onClearHistory()
  }, [onClearHistory])

  // Reset both maze state and AI agent state
  const resetAll = useCallback(() => {
    onReset()
    clearHistory()
    setSpecialActionResult(null)
  }, [onReset, clearHistory])

  // Execute moves one by one
  const executeNextMove = useCallback(() => {
    if (!isRunningRef.current) return

    const moves = movesRef.current
    const index = moveIndexRef.current

    if (index >= moves.length) {
      setIsRunning(false)
      isRunningRef.current = false
      addLog('info', `Finished executing ${moves.length} moves`)
      return
    }

    // Mark current move as executing
    setPlannedMoves((prev) =>
      prev.map((m, i) => (i === index ? { ...m, status: 'executing' as PlannedMoveStatus } : m)),
    )

    const move = moves[index]
    if (!move) return
    const direction = move.action.toLowerCase() as 'up' | 'down' | 'left' | 'right'
    const success = onMoveRef.current(direction)

    // Update move status based on result
    setPlannedMoves((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, status: (success ? 'success' : 'failed') as PlannedMoveStatus } : m,
      ),
    )

    if (!success) {
      setIsRunning(false)
      isRunningRef.current = false
      setError(`Move ${index + 1} (${move.action}) failed - hit a wall or boundary`)
      addLog('error', `Move ${index + 1} failed: ${move.action}`)
      return
    }

    addLog('success', `Move ${index + 1}/${moves.length}: ${move.action}`)
    moveIndexRef.current = index + 1

    // Schedule next move
    setTimeout(() => {
      executeNextMove()
    }, 200)
  }, [addLog])

  // Start AI agent - handles both full solution and move-by-move modes
  const startAgent = useCallback(async () => {
    if (!hasApiKey()) {
      setError(
        'OpenRouter API key not found. Please set VITE_OPENROUTER_API_KEY in your .env file.',
      )
      return
    }

    // Reset state
    onReset()
    clearHistory()
    setIsRunning(true)
    isRunningRef.current = true
    setError(null)
    setSpecialActionResult(null)

    const isMoveByMove = promptViewOptions.executionMode === 'moveByMove'
    addLog(
      'info',
      `AI Agent started (${isMoveByMove ? 'move-by-move' : 'full solution'})`,
      `Model: ${model}`,
    )

    const config: LLMConfig = {
      apiKey: getApiKey(),
      model,
      baseURL: 'https://openrouter.ai/api/v1',
    }

    if (isMoveByMove) {
      // Move-by-move execution loop
      const maxMoves = 200 // Safety limit
      const executedMoves: Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'> = []
      let currentPos = { ...startPos }
      let totalCost = 0
      let totalDurationMs = 0

      for (let moveNum = 0; moveNum < maxMoves; moveNum++) {
        if (!isRunningRef.current) {
          addLog('info', 'Agent stopped by user')
          break
        }

        // Generate prompt with current context
        const context: MoveByMoveContext = {
          startPos,
          currentPos,
          moveHistory: executedMoves,
        }
        const movePrompt = generatePrompt(context)
        const fullMovePrompt = specialInstructions.trim()
          ? `${movePrompt}\nSPECIAL ADDITIONAL INSTRUCTIONS:\n${specialInstructions.trim()}`
          : movePrompt

        try {
          setInflightStartTime(Date.now())
          addLog('request', `Move ${moveNum + 1}: Getting next move...`)

          const response = await getSingleMove(
            fullMovePrompt,
            config,
            (level: LogLevel, message: string, details?: string) => addLog(level, message, details),
          )

          setInflightStartTime(null)

          if (response.stats) {
            totalCost += response.stats.cost
            totalDurationMs += response.stats.durationMs
            setSessionTotals({
              cost: totalCost,
              totalThinkingMs: totalDurationMs,
              decisionCount: moveNum + 1,
            })
          }

          // Handle special actions
          if (response.specialAction) {
            const isCorrect = response.specialAction === 'GOAL_UNREACHABLE' && shortestPath === -1
            setSpecialActionResult({
              action: response.specialAction,
              isCorrect,
            })
            setIsRunning(false)
            isRunningRef.current = false
            addLog(isCorrect ? 'success' : 'error', `AI returned: ${response.specialAction}`)
            return
          }

          // Execute the move
          const direction = response.action.toLowerCase() as 'up' | 'down' | 'left' | 'right'

          // Add to planned moves for display
          setPlannedMoves((prev) => [
            ...prev,
            { action: response.action, status: 'executing' as PlannedMoveStatus },
          ])

          const success = onMoveRef.current(direction)

          // Update planned move status
          setPlannedMoves((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, status: (success ? 'success' : 'failed') as PlannedMoveStatus }
                : m,
            ),
          )

          if (!success) {
            setError(`Move ${moveNum + 1} (${response.action}) failed - hit a wall or boundary`)
            addLog('error', `Move ${moveNum + 1} failed: ${response.action}`)
            setIsRunning(false)
            isRunningRef.current = false
            return
          }

          // Track the executed move
          executedMoves.push(response.action)
          setStoredSolution(executedMoves.map((a) => ({ action: a })))

          // Update current position for next iteration
          switch (direction) {
            case 'up':
              currentPos = { ...currentPos, y: currentPos.y - 1 }
              break
            case 'down':
              currentPos = { ...currentPos, y: currentPos.y + 1 }
              break
            case 'left':
              currentPos = { ...currentPos, x: currentPos.x - 1 }
              break
            case 'right':
              currentPos = { ...currentPos, x: currentPos.x + 1 }
              break
          }

          if (response.comments) {
            setAiComments(response.comments)
          }

          addLog('success', `Move ${moveNum + 1}: ${response.action}`)

          // Small delay between moves for visual feedback
          await new Promise((resolve) => setTimeout(resolve, 300))
        } catch (err) {
          setInflightStartTime(null)
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          setError(errorMsg)
          addLog('error', `Error on move ${moveNum + 1}: ${errorMsg}`)
          if (err instanceof LLMParseError) {
            setRawResponse(err.rawResponse)
          }
          setIsRunning(false)
          isRunningRef.current = false
          return
        }
      }

      if (isRunningRef.current) {
        addLog('error', `Reached maximum move limit (${maxMoves})`)
        setIsRunning(false)
        isRunningRef.current = false
      }
    } else {
      // Full solution mode (original behavior)
      try {
        setInflightStartTime(Date.now())

        const fullPrompt = buildFullPrompt()
        setLastPromptUsed(fullPrompt)
        const response = await getMazeSolution(
          fullPrompt,
          config,
          (level: LogLevel, message: string, details?: string) => addLog(level, message, details),
        )

        setInflightStartTime(null)
        setLastAiResponse(response.rawResponse ?? null)

        if (response.stats) {
          setSessionTotals({
            cost: response.stats.cost,
            totalThinkingMs: response.stats.durationMs,
            decisionCount: 1,
          })
        }

        // Handle special actions
        if (response.specialAction) {
          const isCorrect = response.specialAction === 'GOAL_UNREACHABLE' && shortestPath === -1
          setSpecialActionResult({
            action: response.specialAction,
            isCorrect,
          })
          setIsRunning(false)
          isRunningRef.current = false

          if (isCorrect) {
            addLog('success', `AI correctly identified: ${response.specialAction}`)
          } else if (response.specialAction === 'UNDECIDED') {
            addLog(
              'error',
              `AI returned UNDECIDED - maze ${shortestPath === -1 ? 'is unsolvable' : 'has a valid path'}`,
            )
          } else if (response.specialAction === 'INSUFFICIENT_TIME') {
            addLog('error', 'AI returned INSUFFICIENT_TIME - unable to solve under time pressure')
          } else {
            addLog(
              'error',
              `AI incorrectly claimed GOAL_UNREACHABLE - maze has a valid path (shortest: ${shortestPath})`,
            )
          }
          return
        }

        addLog('response', `Received ${response.moves.length} moves`, undefined, response.stats)

        movesRef.current = response.moves
        moveIndexRef.current = 0
        setStoredSolution(response.moves)
        setAiComments(response.comments ?? null)
        setPlannedMoves(
          response.moves.map((m) => ({
            action: m.action,
            status: 'pending' as PlannedMoveStatus,
          })),
        )

        addLog('info', `Starting execution of ${response.moves.length} moves...`)

        setTimeout(() => {
          executeNextMove()
        }, 500)
      } catch (err) {
        setInflightStartTime(null)
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMsg)
        addLog('error', `Error: ${errorMsg}`)
        if (err instanceof LLMParseError) {
          setRawResponse(err.rawResponse)
          setLastAiResponse(err.rawResponse)
        }
        setIsRunning(false)
        isRunningRef.current = false
      }
    }
  }, [
    model,
    buildFullPrompt,
    generatePrompt,
    onReset,
    clearHistory,
    addLog,
    executeNextMove,
    shortestPath,
    promptViewOptions.executionMode,
    startPos,
    specialInstructions,
  ])

  const stopAgent = useCallback(() => {
    setIsRunning(false)
    isRunningRef.current = false
    addLog('info', 'AI Agent stopped by user')
  }, [addLog])

  // Replay the stored AI solution from the beginning
  const replayAISolution = useCallback(() => {
    if (storedSolution.length === 0) return

    // Mark as replaying so we don't trigger onAIComplete or reset stats
    isReplayingRef.current = true

    // Reset maze state
    onReset()
    onClearHistory()

    // Reset local state but keep stored solution AND session stats
    setIsRunning(true)
    isRunningRef.current = true
    setError(null)
    setLogs([])
    // Note: NOT resetting sessionTotals - we preserve the original AI run stats

    addLog('info', 'Replaying AI solution...')

    // Set up moves for replay
    movesRef.current = storedSolution
    moveIndexRef.current = 0
    setPlannedMoves(
      storedSolution.map((m) => ({
        action: m.action,
        status: 'pending' as PlannedMoveStatus,
      })),
    )

    // Start executing moves
    setTimeout(() => {
      executeNextMove()
    }, 500)
  }, [storedSolution, onReset, onClearHistory, addLog, executeNextMove])

  // Handle manually entered moves - parse and execute them
  const handleManualMoves = useCallback(
    (movesText: string) => {
      // Parse moves from text - supports various formats
      const validDirections = ['UP', 'DOWN', 'LEFT', 'RIGHT']
      const moves: AIMove[] = []

      // Split by commas, spaces, and newlines, then filter valid directions
      const tokens = movesText
        .toUpperCase()
        .split(/[\s,\n]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      for (const token of tokens) {
        if (validDirections.includes(token)) {
          moves.push({ action: token as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' })
        }
      }

      if (moves.length === 0) {
        toast.error('No valid moves found. Use UP, DOWN, LEFT, or RIGHT.')
        return
      }

      // Reset maze state
      onReset()
      onClearHistory()

      // Set up for execution
      setIsRunning(true)
      isRunningRef.current = true
      isReplayingRef.current = true // Mark as replay so we don't trigger onAIComplete
      setError(null)
      setLogs([])
      setSessionTotals({ cost: 0, totalThinkingMs: 0, decisionCount: 0 })

      addLog('info', `Executing ${moves.length} manual moves...`)

      // Set up moves for execution
      movesRef.current = moves
      moveIndexRef.current = 0
      setStoredSolution(moves)
      setPlannedMoves(
        moves.map((m) => ({
          action: m.action,
          status: 'pending' as PlannedMoveStatus,
        })),
      )

      // Start executing moves
      setTimeout(() => {
        executeNextMove()
      }, 500)
    },
    [onReset, onClearHistory, addLog, executeNextMove],
  )

  // Update inflight timer every second while request is in progress
  useEffect(() => {
    if (!inflightStartTime) {
      setInflightSeconds(null)
      return
    }

    const interval = setInterval(() => {
      setInflightSeconds(Math.floor((Date.now() - inflightStartTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [inflightStartTime])

  useEffect(() => {
    if (isGameWon && isRunning) {
      setIsRunning(false)
      isRunningRef.current = false
      addLog('success', 'Goal reached!')
      // Call onAIComplete with final stats (only for actual runs, not replays)
      if (!isReplayingRef.current) {
        onAIComplete?.(sessionTotals)
      }
      isReplayingRef.current = false
    }
    if (isGameLost && isRunning) {
      setIsRunning(false)
      isRunningRef.current = false
      addLog('error', 'Fell into a hole!')
      // Call onAIComplete with final stats (only for actual runs, not replays)
      if (!isReplayingRef.current) {
        onAIComplete?.(sessionTotals)
      }
      isReplayingRef.current = false
    }
  }, [isGameWon, isGameLost, isRunning, addLog, onAIComplete, sessionTotals])

  // Track running state transitions to handle wall collision / error cases
  useEffect(() => {
    // If AI was running and now stopped (but game didn't end with win/loss)
    if (wasRunningRef.current && !isRunning && !isGameWon && !isGameLost) {
      // Call onAIComplete with final stats (only for actual runs, not replays)
      if (!isReplayingRef.current && sessionTotals.decisionCount > 0) {
        onAIComplete?.(sessionTotals)
      }
      isReplayingRef.current = false
    }
    wasRunningRef.current = isRunning
  }, [isRunning, isGameWon, isGameLost, onAIComplete, sessionTotals])

  // Convert planned moves to history items
  const history: HistoryItem[] = plannedMoves.map((move, idx) => ({
    id: `${move.action}-${idx}`,
    label: `${getDirectionArrow(move.action)} ${move.action}`,
    status: move.status,
  }))

  // Prompt options for the shared component
  const promptOptionsConfig = {
    options: [
      // Maze Format Options
      {
        id: 'ascii',
        label: 'ASCII',
        checked: promptViewOptions.ascii,
        group: 'Maze Format Options',
      },
      {
        id: 'blockFormat',
        label: 'Block Format',
        checked: promptViewOptions.blockFormat,
        group: 'Maze Format Options',
      },
      {
        id: 'explicitEdges',
        label: 'Explicit Edges',
        checked: promptViewOptions.explicitEdges,
        group: 'Maze Format Options',
      },
      {
        id: 'adjacencyList',
        label: 'Adjacency List',
        checked: promptViewOptions.adjacencyList,
        group: 'Maze Format Options',
      },
      {
        id: 'matrix2D',
        label: 'Valid Move Layout',
        checked: promptViewOptions.matrix2D,
        group: 'Maze Format Options',
      },
      {
        id: 'coordinateMatrix',
        label: 'Coordinate Matrix',
        checked: promptViewOptions.coordinateMatrix,
        group: 'Maze Format Options',
      },
      {
        id: 'coordinateToken',
        label: 'Coordinate Token',
        checked: promptViewOptions.coordinateToken,
        group: 'Maze Format Options',
      },
      {
        id: 'blockGrid',
        label: 'Block Grid',
        checked: promptViewOptions.blockGrid,
        group: 'Maze Format Options',
      },
      // Prompt Options
      {
        id: 'moveByMove',
        label: 'Move by Move',
        checked: promptViewOptions.executionMode === 'moveByMove',
        group: 'Prompt Options',
      },
      {
        id: 'applyTimePressure',
        label: 'Apply Time Pressure',
        checked: promptViewOptions.applyTimePressure,
        group: 'Prompt Options',
      },
      {
        id: 'includeUnreachableInstructions',
        label: 'Include Unreachable Instructions',
        checked: promptViewOptions.includeUnreachableInstructions,
        group: 'Prompt Options',
      },
    ],
    onChange: (id: string, checked: boolean) => {
      if (id === 'moveByMove') {
        onPromptViewOptionsChange({
          ...promptViewOptions,
          executionMode: checked ? 'moveByMove' : 'fullSolution',
        })
      } else {
        onPromptViewOptionsChange({
          ...promptViewOptions,
          [id]: checked,
        })
      }
    },
  }

  return (
    <AIControlPanel
      model={model}
      onModelChange={setModel}
      onStart={startAgent}
      onStop={stopAgent}
      onReset={resetAll}
      onCopyPrompt={handleCopyPrompt}
      onCopyFullContext={lastPromptUsed ? handleCopyFullContext : undefined}
      onReplay={storedSolution.length > 0 ? replayAISolution : undefined}
      isRunning={isRunning}
      isGameWon={isGameWon}
      error={error}
      rawErrorResponse={rawResponse}
      sessionMetrics={sessionTotals}
      inflightSeconds={inflightSeconds}
      history={history}
      logs={logs}
      aiComments={aiComments}
      promptOptions={promptOptionsConfig}
      specialInstructions={{
        value: specialInstructions,
        onChange: onSpecialInstructionsChange,
        show: !isRunning && plannedMoves.length === 0 && !specialActionResult,
      }}
      specialActionResult={specialActionResult}
      onManualMoves={handleManualMoves}
    />
  )
}

function getDirectionArrow(direction: string) {
  switch (direction) {
    case 'UP':
      return '↑'
    case 'DOWN':
      return '↓'
    case 'LEFT':
      return '←'
    case 'RIGHT':
      return '→'
    default:
      return '•'
  }
}
