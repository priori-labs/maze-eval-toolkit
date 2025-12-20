import { useCallback, useEffect, useState } from 'react'
import type { Difficulty, EvaluationResult, MazeWithPrompts, TestSetFile } from '../core/types'
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

// Flattened maze entry for quick run navigation
interface QuickRunMazeEntry {
  difficulty: Difficulty
  index: number
  maze: MazeWithPrompts
}

export default function App() {
  // App mode
  const [mode, setMode] = useState<AppMode>('viewer')

  // Human eval state
  const [humanEvalRunName, setHumanEvalRunName] = useState('')
  const [humanEvalTestSet, setHumanEvalTestSet] = useState<TestSetFile | null>(null)
  const [skipReadyScreen, setSkipReadyScreen] = useState(false)
  const [isQuickRunMode, setIsQuickRunMode] = useState(false)
  const [quickRunFullTestSet, setQuickRunFullTestSet] = useState<TestSetFile | null>(null)
  const [quickRunAllMazes, setQuickRunAllMazes] = useState<QuickRunMazeEntry[]>([])
  const [quickRunIndex, setQuickRunIndex] = useState(0)

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
      .then((d: { files: string[] }) => {
        // Exclude mini files - they don't have per-maze solution data
        const fullFiles = d.files.filter((f) => !f.includes('-mini'))
        setResultsFiles(fullFiles)
      })
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
      // Auto-select first difficulty that has mazes
      const firstDifficultyWithMazes = DIFFICULTIES.find((d) => (data.mazes[d]?.length ?? 0) > 0)
      setCurrentDifficulty(firstDifficultyWithMazes ?? 'simple')
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

  // Human eval handlers
  const handleStartHumanEval = useCallback((runName: string, evalTestSet: TestSetFile) => {
    setHumanEvalRunName(runName)
    setHumanEvalTestSet(evalTestSet)
    setSkipReadyScreen(false)
    setIsQuickRunMode(false)
    setQuickRunFullTestSet(null)
    setMode('human-eval')
  }, [])

  // Helper to create a TestSetFile with a single maze
  const createSingleMazeTestSet = useCallback(
    (data: TestSetFile, maze: MazeWithPrompts): TestSetFile => {
      return {
        ...data,
        name: 'Quick Run',
        mazes: {
          simple: [],
          easy: [],
          medium: [],
          hard: [],
          nightmare: [],
          horror: [],
          [maze.difficulty]: [maze],
        },
        summary: {
          totalMazes: 1,
          byDifficulty: {
            simple: 0,
            easy: 0,
            medium: 0,
            hard: 0,
            nightmare: 0,
            horror: 0,
            [maze.difficulty]: 1,
          },
        },
      }
    },
    [],
  )

  // Helper to flatten test set into ordered maze list
  const flattenTestSet = useCallback((data: TestSetFile): QuickRunMazeEntry[] => {
    const entries: QuickRunMazeEntry[] = []
    for (const difficulty of DIFFICULTIES) {
      const mazes = data.mazes[difficulty] ?? []
      mazes.forEach((maze, index) => {
        entries.push({ difficulty, index, maze })
      })
    }
    return entries
  }, [])

  // Quick run - load random maze from selected test set
  const handleQuickRun = useCallback(
    async (filename: string) => {
      try {
        const response = await fetch(`/api/data/${filename}`)
        if (!response.ok) throw new Error(`Failed to fetch ${filename}`)
        const data = (await response.json()) as TestSetFile

        // Build flattened maze list
        const allMazes = flattenTestSet(data)
        if (allMazes.length === 0) throw new Error('No mazes found in test set')

        // Start at the first maze
        const startEntry = allMazes[0]!

        setQuickRunFullTestSet(data)
        setQuickRunAllMazes(allMazes)
        setQuickRunIndex(0)
        setHumanEvalRunName('Quick Run')
        setHumanEvalTestSet(createSingleMazeTestSet(data, startEntry.maze))
        setSkipReadyScreen(true)
        setIsQuickRunMode(true)
        setMode('human-eval')
      } catch (err) {
        alert(`Quick Run failed: ${err}`)
      }
    },
    [flattenTestSet, createSingleMazeTestSet],
  )

  // Quick run navigation - go to next maze
  const handleQuickRunNext = useCallback(() => {
    if (!quickRunFullTestSet || quickRunAllMazes.length === 0) return
    const nextIndex = (quickRunIndex + 1) % quickRunAllMazes.length
    const entry = quickRunAllMazes[nextIndex]!
    setQuickRunIndex(nextIndex)
    setHumanEvalTestSet(createSingleMazeTestSet(quickRunFullTestSet, entry.maze))
  }, [quickRunFullTestSet, quickRunAllMazes, quickRunIndex, createSingleMazeTestSet])

  // Quick run navigation - go to previous maze
  const handleQuickRunPrev = useCallback(() => {
    if (!quickRunFullTestSet || quickRunAllMazes.length === 0) return
    const prevIndex = (quickRunIndex - 1 + quickRunAllMazes.length) % quickRunAllMazes.length
    const entry = quickRunAllMazes[prevIndex]!
    setQuickRunIndex(prevIndex)
    setHumanEvalTestSet(createSingleMazeTestSet(quickRunFullTestSet, entry.maze))
  }, [quickRunFullTestSet, quickRunAllMazes, quickRunIndex, createSingleMazeTestSet])

  const handleHumanEvalComplete = useCallback(() => {
    setMode('viewer')
    setHumanEvalRunName('')
    setHumanEvalTestSet(null)
    setSkipReadyScreen(false)
    setIsQuickRunMode(false)
    setQuickRunFullTestSet(null)
    setQuickRunAllMazes([])
    setQuickRunIndex(0)
  }, [])

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
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
              {/* Results File Select */}
              {testSet && (
                <Select value={selectedResultsFile} onValueChange={handleResultsFileSelect}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select results..." />
                  </SelectTrigger>
                  <SelectContent>
                    {resultsFiles.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No results found
                      </SelectItem>
                    ) : (
                      resultsFiles.map((file) => (
                        <SelectItem key={file} value={file}>
                          {file.replace('.json', '')}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={() => setMode('human-eval-setup')}>Human Eval</Button>
              <Select onValueChange={handleQuickRun}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Quick Run..." />
                </SelectTrigger>
                <SelectContent>
                  {dataFiles.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No test sets found
                    </SelectItem>
                  ) : (
                    dataFiles.map((file) => (
                      <SelectItem key={file} value={file}>
                        {file.replace('.json', '')}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === 'human-eval' && isQuickRunMode && quickRunAllMazes.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleQuickRunPrev}>
                ← Prev
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {quickRunIndex + 1} / {quickRunAllMazes.length}
              </span>
              <Button variant="outline" size="sm" onClick={handleQuickRunNext}>
                Next →
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-6 overflow-auto">
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
          <div className="flex-1 flex flex-col items-center justify-center">
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
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Maze View */}
            <div className="lg:col-span-2 space-y-4">
              {/* Navigation */}
              <Navigation current={currentIndex} total={totalMazes} onNavigate={goToMaze} />

              {/* Maze Viewer */}
              {currentMaze && (
                <div className="bg-card rounded-lg p-4 border border-border">
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Maze ID: </span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-cyan-400 font-mono">
                        {currentMaze.id}
                      </code>
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
