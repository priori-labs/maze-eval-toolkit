import { useCallback, useEffect, useState } from 'react'
import type { Difficulty, EvaluationResult, TestSetFile } from '../core/types'
import { DIFFICULTIES } from '../core/types'
import HumanEval from './components/HumanEval'
import HumanEvalSetup from './components/HumanEvalSetup'
import MazeViewer from './components/MazeViewer'
import ModelSummary from './components/ModelSummary'
import Navigation from './components/Navigation'
import SolutionReplay from './components/SolutionReplay'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui'

type AppMode = 'viewer' | 'human-eval-setup' | 'human-eval'

export default function App() {
  // App mode
  const [mode, setMode] = useState<AppMode>('viewer')

  // Human eval state
  const [humanEvalRunName, setHumanEvalRunName] = useState('')
  const [humanEvalTestSet, setHumanEvalTestSet] = useState<TestSetFile | null>(null)
  const [skipReadyScreen, setSkipReadyScreen] = useState(false)
  const [isQuickRunMode, setIsQuickRunMode] = useState(false)
  const [quickRunFullTestSet, setQuickRunFullTestSet] = useState<TestSetFile | null>(null)

  // Viewer state
  const [testSet, setTestSet] = useState<TestSetFile | null>(null)
  const [results, setResults] = useState<EvaluationResult[]>([])
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>('simple')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedResult, setSelectedResult] = useState<EvaluationResult | null>(null)
  const [isReplaying, setIsReplaying] = useState(false)

  // File lists from API
  const [dataFiles, setDataFiles] = useState<string[]>([])
  const [resultsFiles, setResultsFiles] = useState<string[]>([])
  const [selectedDataFile, setSelectedDataFile] = useState<string>('')
  const [selectedResultsFile, setSelectedResultsFile] = useState<string>('')

  // Fetch file lists on mount
  useEffect(() => {
    fetch('/api/data')
      .then((r) => r.json())
      .then((d: { files: string[] }) => setDataFiles(d.files))
      .catch(() => setDataFiles([]))

    fetch('/api/results')
      .then((r) => r.json())
      .then((d: { files: string[] }) => setResultsFiles(d.files))
      .catch(() => setResultsFiles([]))
  }, [])

  // Get current maze
  const mazes = testSet?.mazes[currentDifficulty] ?? []
  const currentMaze = mazes[currentIndex] ?? null
  const totalMazes = mazes.length

  // Get results for current maze
  const mazeResults = results.filter((r) => r.mazeId === currentMaze?.id)

  // Handle test set file selection
  const handleDataFileSelect = useCallback(async (filename: string) => {
    setSelectedDataFile(filename)
    try {
      const response = await fetch(`/api/data/${filename}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = (await response.json()) as TestSetFile
      setTestSet(data)
      setCurrentDifficulty('simple')
      setCurrentIndex(0)
      setSelectedResult(null)
    } catch (err) {
      alert(`Failed to load test set: ${err}`)
    }
  }, [])

  // Handle results file selection
  const handleResultsFileSelect = useCallback(async (filename: string) => {
    setSelectedResultsFile(filename)
    try {
      const response = await fetch(`/api/results/${filename}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = (await response.json()) as EvaluationResult[]
      setResults(data)
      setSelectedResult(null)
    } catch (err) {
      alert(`Failed to load results: ${err}`)
    }
  }, [])

  // Navigation handlers
  const goToMaze = useCallback((index: number) => {
    setCurrentIndex(index)
    setSelectedResult(null)
    setIsReplaying(false)
  }, [])

  const changeDifficulty = useCallback((difficulty: Difficulty) => {
    setCurrentDifficulty(difficulty)
    setCurrentIndex(0)
    setSelectedResult(null)
    setIsReplaying(false)
  }, [])

  // Human eval handlers
  const handleStartHumanEval = useCallback((runName: string, evalTestSet: TestSetFile) => {
    setHumanEvalRunName(runName)
    setHumanEvalTestSet(evalTestSet)
    setSkipReadyScreen(false)
    setIsQuickRunMode(false)
    setQuickRunFullTestSet(null)
    setMode('human-eval')
  }, [])

  // Helper to pick a random maze from a test set
  const pickRandomMaze = useCallback((data: TestSetFile): TestSetFile => {
    const allMazes = DIFFICULTIES.flatMap((d) => data.mazes[d] ?? [])
    if (allMazes.length === 0) throw new Error('No mazes found in test set')

    const randomMaze = allMazes[Math.floor(Math.random() * allMazes.length)]!

    return {
      ...data,
      name: 'Quick Run',
      mazes: {
        simple: [],
        easy: [],
        medium: [],
        hard: [],
        nightmare: [],
        [randomMaze.difficulty]: [randomMaze],
      },
      summary: {
        totalMazes: 1,
        byDifficulty: {
          simple: 0,
          easy: 0,
          medium: 0,
          hard: 0,
          nightmare: 0,
          [randomMaze.difficulty]: 1,
        },
      },
    }
  }, [])

  // Quick run - load random maze from test-set-mini.json
  const handleQuickRun = useCallback(async () => {
    try {
      const response = await fetch('/api/data/test-set-mini.json')
      if (!response.ok) throw new Error('Failed to fetch test-set-mini.json')
      const data = (await response.json()) as TestSetFile

      setQuickRunFullTestSet(data)
      setHumanEvalRunName('Quick Run')
      setHumanEvalTestSet(pickRandomMaze(data))
      setSkipReadyScreen(true)
      setIsQuickRunMode(true)
      setMode('human-eval')
    } catch (err) {
      alert(`Quick Run failed: ${err}`)
    }
  }, [pickRandomMaze])

  // Quick run next - load another random maze
  const handleQuickRunNext = useCallback(() => {
    if (!quickRunFullTestSet) return
    setHumanEvalTestSet(pickRandomMaze(quickRunFullTestSet))
  }, [quickRunFullTestSet, pickRandomMaze])

  const handleHumanEvalComplete = useCallback(() => {
    setMode('viewer')
    setHumanEvalRunName('')
    setHumanEvalTestSet(null)
    setSkipReadyScreen(false)
    setIsQuickRunMode(false)
    setQuickRunFullTestSet(null)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">
            LMIQ v1 Beta{' '}
            {mode === 'human-eval'
              ? '- Human Eval'
              : mode === 'human-eval-setup'
                ? '- Setup'
                : '- Maze Viewer'}
          </h1>
          {mode === 'viewer' && (
            <div className="flex items-center gap-4">
              <Button onClick={() => setMode('human-eval-setup')}>Human Eval</Button>
              <Button variant="outline" onClick={handleQuickRun}>
                Quick Run
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {/* Human Eval Setup */}
        {mode === 'human-eval-setup' && (
          <HumanEvalSetup onStart={handleStartHumanEval} onCancel={() => setMode('viewer')} />
        )}

        {/* Human Eval */}
        {mode === 'human-eval' && humanEvalTestSet && (
          <HumanEval
            runName={humanEvalRunName}
            testSet={humanEvalTestSet}
            onComplete={handleHumanEvalComplete}
            skipReady={skipReadyScreen}
            isQuickRun={isQuickRunMode}
            onQuickRunNext={handleQuickRunNext}
          />
        )}

        {/* Viewer Mode */}
        {mode === 'viewer' && !testSet ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              Load a test set JSON file to get started
            </p>
            <div className="mt-4">
              <Select value={selectedDataFile} onValueChange={handleDataFileSelect}>
                <SelectTrigger className="w-[250px] mx-auto">
                  <SelectValue placeholder="Select test set..." />
                </SelectTrigger>
                <SelectContent>
                  {dataFiles.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No files found
                    </SelectItem>
                  ) : (
                    dataFiles.map((file) => (
                      <SelectItem key={file} value={file}>
                        {file}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground/60 text-sm mt-4">
              Generate one with: <code className="bg-card px-2 py-1 rounded">task generate</code>
            </p>
          </div>
        ) : mode === 'viewer' && testSet ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Maze View */}
            <div className="lg:col-span-2 space-y-4">
              {/* Difficulty tabs */}
              <div className="flex gap-2">
                {DIFFICULTIES.map((d) => {
                  const count = testSet.mazes[d]?.length ?? 0
                  if (count === 0) return null
                  return (
                    <Button
                      key={d}
                      onClick={() => changeDifficulty(d)}
                      variant={currentDifficulty === d ? 'default' : 'ghost'}
                      size="sm"
                    >
                      {d} ({count})
                    </Button>
                  )
                })}
              </div>

              {/* Navigation */}
              <Navigation current={currentIndex} total={totalMazes} onNavigate={goToMaze} />

              {/* Maze Viewer */}
              {currentMaze && (
                <div className="bg-card rounded-lg p-4 border border-border">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <span className="text-muted-foreground text-sm">Maze ID: </span>
                      <span className="font-mono text-sm">{currentMaze.id}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Size: </span>
                      <span>
                        {currentMaze.width}x{currentMaze.height}
                      </span>
                      <span className="text-muted-foreground ml-4">Shortest Path: </span>
                      <span className="text-primary">{currentMaze.shortestPath}</span>
                    </div>
                  </div>
                  <MazeViewer
                    maze={currentMaze}
                    solution={selectedResult}
                    isReplaying={isReplaying}
                    onReplayComplete={() => setIsReplaying(false)}
                  />
                </div>
              )}
            </div>

            {/* Right Panel - Results */}
            <div className="space-y-4">
              {/* Results File Select */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Results:</span>
                <Select value={selectedResultsFile} onValueChange={handleResultsFileSelect}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select results..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resultsFiles.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No files found
                      </SelectItem>
                    ) : (
                      resultsFiles.map((file) => (
                        <SelectItem key={file} value={file}>
                          {file}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Model Summary */}
              {currentMaze && mazeResults.length > 0 && (
                <ModelSummary
                  results={mazeResults}
                  shortestPath={currentMaze.shortestPath}
                  selectedId={selectedResult?.id}
                  onSelect={(result) => {
                    setSelectedResult(result)
                    setIsReplaying(false)
                  }}
                />
              )}

              {/* Solution Replay */}
              {selectedResult && (
                <SolutionReplay
                  result={selectedResult}
                  isReplaying={isReplaying}
                  onStartReplay={() => setIsReplaying(true)}
                  onStopReplay={() => setIsReplaying(false)}
                />
              )}

              {/* No results message */}
              {currentMaze && mazeResults.length === 0 && (
                <div className="bg-card rounded-lg p-4 text-center border border-border">
                  <p className="text-muted-foreground">No evaluation results for this maze</p>
                  <p className="text-muted-foreground/60 text-sm mt-2">
                    Load results JSON or run an evaluation
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
