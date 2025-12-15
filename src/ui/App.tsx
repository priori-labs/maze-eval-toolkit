import { useCallback, useState } from 'react'
import type { Difficulty, EvaluationResult, TestSetFile } from '../core/types'
import { DIFFICULTIES } from '../core/types'
import MazeViewer from './components/MazeViewer'
import ModelSummary from './components/ModelSummary'
import Navigation from './components/Navigation'
import SolutionReplay from './components/SolutionReplay'
import { Button } from './components/ui'

export default function App() {
  const [testSet, setTestSet] = useState<TestSetFile | null>(null)
  const [results, setResults] = useState<EvaluationResult[]>([])
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>('simple')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedResult, setSelectedResult] = useState<EvaluationResult | null>(null)
  const [isReplaying, setIsReplaying] = useState(false)

  // Get current maze
  const mazes = testSet?.mazes[currentDifficulty] ?? []
  const currentMaze = mazes[currentIndex] ?? null
  const totalMazes = mazes.length

  // Get results for current maze
  const mazeResults = results.filter((r) => r.mazeId === currentMaze?.id)

  // Handle test set file upload
  const handleTestSetUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text) as TestSetFile
      setTestSet(data)
      setCurrentDifficulty('simple')
      setCurrentIndex(0)
      setSelectedResult(null)
    } catch (err) {
      alert(`Failed to parse test set: ${err}`)
    }
  }, [])

  // Handle results file upload (JSON export from SQLite)
  const handleResultsUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text) as EvaluationResult[]
      setResults(data)
      setSelectedResult(null)
    } catch (err) {
      alert(`Failed to parse results: ${err}`)
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">LMIQ v1 Beta - Maze Viewer</h1>
          <div className="flex gap-4">
            <Button asChild>
              <label className="cursor-pointer">
                Load Test Set
                <input
                  type="file"
                  accept=".json"
                  onChange={handleTestSetUpload}
                  className="hidden"
                />
              </label>
            </Button>
            <Button asChild variant="secondary">
              <label className="cursor-pointer">
                Load Results
                <input
                  type="file"
                  accept=".json"
                  onChange={handleResultsUpload}
                  className="hidden"
                />
              </label>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {!testSet ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">
              Load a test set JSON file to get started
            </p>
            <p className="text-muted-foreground/60 text-sm mt-2">
              Generate one with: <code className="bg-card px-2 py-1 rounded">task generate</code>
            </p>
          </div>
        ) : (
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
                      <span className="font-mono text-sm">{currentMaze.id.slice(0, 8)}...</span>
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
        )}
      </main>
    </div>
  )
}
