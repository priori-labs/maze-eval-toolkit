import { useCallback, useMemo, useState } from 'react'
import type { MazeWithPrompts, TestSetFile } from '../../core/types'
import { DIFFICULTIES } from '../../core/types'
import InteractiveMaze, { type HumanMazeResult } from './InteractiveMaze'
import { Button, Card, CardContent, CardHeader, CardTitle, Progress } from './ui'

interface HumanEvalProps {
  runName: string
  testSet: TestSetFile
  onComplete: () => void
  skipReady?: boolean
  isQuickRun?: boolean
  onQuickRunNext?: () => void
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled
}

export default function HumanEval({
  runName,
  testSet,
  onComplete,
  skipReady = false,
  isQuickRun = false,
  onQuickRunNext,
}: HumanEvalProps) {
  // Shuffle all mazes from all difficulties
  const shuffledMazes = useMemo(() => {
    const allMazes: MazeWithPrompts[] = []
    for (const difficulty of DIFFICULTIES) {
      const mazes = testSet.mazes[difficulty] ?? []
      allMazes.push(...mazes)
    }
    return shuffleArray(allMazes)
  }, [testSet])

  // State
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isObfuscated, setIsObfuscated] = useState(!skipReady)
  const [results, setResults] = useState<HumanMazeResult[]>([])
  const [startedAt] = useState(() => new Date().toISOString())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [currentStats, setCurrentStats] = useState({ moves: 0, elapsedMs: 0 })

  const currentMaze = shuffledMazes[currentIndex]
  const totalMazes = shuffledMazes.length
  const progress = ((currentIndex + (isComplete ? 1 : 0)) / totalMazes) * 100

  // Handle maze reveal
  const handleReveal = useCallback(() => {
    setIsObfuscated(false)
  }, [])

  // Handle stats change from InteractiveMaze
  const handleStatsChange = useCallback((stats: { moves: number; elapsedMs: number }) => {
    setCurrentStats(stats)
  }, [])

  // Submit results to server
  const submitResults = useCallback(
    async (allResults: HumanMazeResult[]) => {
      setIsSubmitting(true)
      setSubmitError(null)

      const completedAt = new Date().toISOString()

      try {
        const response = await fetch('/api/human-evals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runName,
            testSetId: testSet.id,
            startedAt,
            completedAt,
            results: allResults,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to save results')
        }

        setIsComplete(true)
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsSubmitting(false)
      }
    },
    [runName, testSet.id, startedAt],
  )

  // Handle maze completion
  const handleMazeComplete = useCallback(
    (result: HumanMazeResult) => {
      // Quick run mode - load next random maze
      if (isQuickRun && onQuickRunNext) {
        onQuickRunNext()
        return
      }

      const newResults = [...results, result]
      setResults(newResults)

      if (currentIndex < totalMazes - 1) {
        // Move to next maze
        setCurrentIndex((i) => i + 1)
        setIsObfuscated(true)
      } else {
        // All mazes complete - submit results
        submitResults(newResults)
      }
    },
    [results, currentIndex, totalMazes, submitResults, isQuickRun, onQuickRunNext],
  )

  // Calculate stats for completion screen
  const stats = useMemo(() => {
    if (results.length === 0) return null

    const totalTimeMs = results.reduce((sum, r) => sum + r.timeMs, 0)
    const avgEfficiency = results.reduce((sum, r) => sum + r.efficiency, 0) / results.length
    const totalMoves = results.reduce((sum, r) => sum + r.pathLength, 0)
    const optimalMoves = results.reduce((sum, r) => sum + r.shortestPath, 0)

    return {
      totalTimeMs,
      avgEfficiency,
      totalMoves,
      optimalMoves,
    }
  }, [results])

  // Format time
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  // Completion screen
  if (isComplete && stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-green-500">Evaluation Complete!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <p className="text-lg font-medium">{runName}</p>
              <p className="text-sm text-muted-foreground">{totalMazes} mazes completed</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{formatTime(stats.totalTimeMs)}</p>
                <p className="text-sm text-muted-foreground">Total Time</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{(stats.avgEfficiency * 100).toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">Avg Efficiency</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{stats.totalMoves}</p>
                <p className="text-sm text-muted-foreground">Total Moves</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{stats.optimalMoves}</p>
                <p className="text-sm text-muted-foreground">Optimal Moves</p>
              </div>
            </div>

            <Button onClick={onComplete} className="w-full">
              Back to Viewer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Submitting screen
  if (isSubmitting) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <p className="text-lg">Saving results...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error screen
  if (submitError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center">{submitError}</p>
            <Button onClick={() => submitResults(results)} className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!currentMaze) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p>No mazes to evaluate</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with progress */}
      <div className="space-y-2 mb-8">
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            Maze {currentIndex + 1} of {totalMazes}
          </p>
          <p className="text-sm text-muted-foreground">
            {currentStats.moves} moves | {formatTime(currentStats.elapsedMs)}
          </p>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Maze */}
      <InteractiveMaze
        key={currentMaze.id}
        maze={currentMaze}
        isObfuscated={isObfuscated}
        onReveal={handleReveal}
        onComplete={handleMazeComplete}
        startImmediately={skipReady}
        onStatsChange={handleStatsChange}
        cellSize={24}
      />
    </div>
  )
}
