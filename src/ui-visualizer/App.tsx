import { getEffectiveBaseline } from '@/core/difficulty'
import type { Difficulty, EvaluationResult, TestSetHumanBaselines } from '@/core/types'
import { DIFFICULTIES } from '@/core/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccuracyChart } from './components/charts/AccuracyChart'
import { EnergyEfficiencyChart } from './components/charts/EnergyEfficiencyChart'
import { LMIQChart } from './components/charts/LMIQChart'
import { TimeEfficiencyChart } from './components/charts/TimeEfficiencyChart'
import {
  aggregateByModelAndFormat,
  computeHumanBaseline,
  findBestModel,
  getShortModelName,
} from './lib/scoreUtils'

// Models to exclude from visualization
const EXCLUDED_MODELS = ['kimi-k2-thinking', 'claude-3.5-sonnet', 'gpt-4o', 'claude-haiku-4.5']

export default function App() {
  const [results, setResults] = useState<EvaluationResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [useElite, setUseElite] = useState(false)
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'all'>('all')
  const [resultsFiles, setResultsFiles] = useState<string[]>([])
  const [selectedResultsFile, setSelectedResultsFile] = useState<string>('')
  const [customBaselines, setCustomBaselines] = useState<TestSetHumanBaselines | undefined>(
    undefined,
  )

  // Load results file
  const loadResults = useCallback(async (filename: string) => {
    setLoading(true)
    setError(null)
    setSelectedResultsFile(filename)
    setCustomBaselines(undefined)

    try {
      const response = await fetch(`/api/results/${filename}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const data = (await response.json()) as EvaluationResult[]
      // Filter out excluded models
      const filtered = data.filter((r) => !EXCLUDED_MODELS.includes(getShortModelName(r.model)))
      setResults(filtered)

      // Try to load custom baselines from test set
      const testSetIds = [...new Set(filtered.map((r) => r.testSetId))]
      if (testSetIds.length === 1 && testSetIds[0]) {
        try {
          const testSetResponse = await fetch(`/api/test-sets/${testSetIds[0]}`)
          if (testSetResponse.ok) {
            const testSetData = await testSetResponse.json()
            if (testSetData.humanBaselines) {
              setCustomBaselines(testSetData.humanBaselines)
            }
          }
        } catch {
          // Silently ignore - custom baselines are optional
        }
      }
    } catch (err) {
      setError(`Failed to load results: ${err}`)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load results.json on mount
  useEffect(() => {
    fetch('/api/results')
      .then((r) => r.json())
      .then((d: { files: string[] }) => {
        // Filter to only JSON files, excluding human evals and mini test sets
        const jsonFiles = d.files.filter(
          (f: string) =>
            f.endsWith('.json') && !f.includes('human') && !f.includes('-mini'),
        )
        setResultsFiles(jsonFiles)

        if (jsonFiles.includes('results.json')) {
          loadResults('results.json')
        } else if (jsonFiles.length > 0 && jsonFiles[0]) {
          loadResults(jsonFiles[0])
        } else {
          setLoading(false)
          setError('No results files found')
        }
      })
      .catch(() => {
        setLoading(false)
        setError('Failed to fetch results list')
      })
  }, [loadResults])

  // Filter results by difficulty
  const filteredResults = useMemo(() => {
    if (difficultyFilter === 'all') return results
    return results.filter((r) => r.difficulty === difficultyFilter)
  }, [results, difficultyFilter])

  // Compute model+format scores (for metric charts)
  const modelFormatScores = useMemo(() => {
    if (filteredResults.length === 0) return []
    return aggregateByModelAndFormat(filteredResults, useElite, customBaselines)
  }, [filteredResults, useElite, customBaselines])

  // Compute human baseline (for charts - based on toggle)
  const humanBaseline = useMemo(() => {
    return computeHumanBaseline(filteredResults, useElite, customBaselines)
  }, [filteredResults, useElite, customBaselines])

  // Compute both human baselines for reference card
  const humanBaselineAvg = useMemo(() => {
    return computeHumanBaseline(filteredResults, false, customBaselines)
  }, [filteredResults, customBaselines])

  const humanBaselineElite = useMemo(() => {
    return computeHumanBaseline(filteredResults, true, customBaselines)
  }, [filteredResults, customBaselines])

  // Compute weighted average times based on difficulty distribution
  const humanTimes = useMemo(() => {
    if (filteredResults.length === 0) return { avg: 0, elite: 0 }
    const difficultyCount: Record<string, number> = {}
    for (const r of filteredResults) {
      difficultyCount[r.difficulty] = (difficultyCount[r.difficulty] || 0) + 1
    }
    const total = filteredResults.length
    let avgTime = 0
    let eliteTime = 0
    for (const [diff, count] of Object.entries(difficultyCount)) {
      const weight = count / total
      const avgBaseline = getEffectiveBaseline(diff as Difficulty, customBaselines, false)
      const eliteBaseline = getEffectiveBaseline(diff as Difficulty, customBaselines, true)
      avgTime += weight * avgBaseline.timeSeconds
      eliteTime += weight * eliteBaseline.timeSeconds
    }
    return { avg: avgTime, elite: eliteTime }
  }, [filteredResults, customBaselines])

  // Find best models for summary stats
  const bestAccuracy = useMemo(
    () => findBestModel(modelFormatScores, 'accuracy'),
    [modelFormatScores],
  )
  const bestLmiq = useMemo(() => findBestModel(modelFormatScores, 'lmiq'), [modelFormatScores])

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">LMIQ Score Visualizer</h1>
          <div className="flex items-center gap-6">
            {/* Results File Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Results:</span>
              <select
                value={selectedResultsFile}
                onChange={(e) => loadResults(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none"
              >
                {resultsFiles.map((file) => (
                  <option key={file} value={file}>
                    {file.replace('.json', '')}
                  </option>
                ))}
              </select>
            </div>
            {/* Difficulty Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Difficulty:</span>
              <select
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value as Difficulty | 'all')}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none"
              >
                <option value="all">All</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {/* Human Toggle */}
            <div className="flex items-center gap-3">
              <span
                className={`text-sm ${!useElite ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                Avg Human
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={useElite}
                onClick={() => setUseElite(!useElite)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  useElite ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    useElite ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm ${useElite ? 'text-foreground' : 'text-muted-foreground'}`}>
                Elite Human
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {loading && (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Loading results...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-destructive">{error}</p>
          </div>
        )}

        {!loading && !error && filteredResults.length > 0 && (
          <div className="space-y-8">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card rounded-lg p-4 border border-border">
                <div className="text-muted-foreground text-sm">Total Evaluations</div>
                <div className="text-2xl font-bold">
                  {filteredResults.length}
                  {difficultyFilter !== 'all' && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      of {results.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <div className="text-muted-foreground text-sm flex items-center gap-2">
                  Human Baseline Reference
                  {customBaselines && (
                    <span className="text-xs bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">
                      Custom
                    </span>
                  )}
                </div>
                <div className="text-sm mt-2 space-y-1">
                  <div>
                    <span className="text-blue-400">Average Human:</span>{' '}
                    <span className="text-muted-foreground">
                      {(humanBaselineAvg.accuracy * 100).toFixed(0)}% accuracy,{' '}
                      {humanTimes.avg.toFixed(0)}s/problem
                    </span>
                  </div>
                  <div>
                    <span className="text-blue-400">Elite Human:</span>{' '}
                    <span className="text-muted-foreground">
                      {(humanBaselineElite.accuracy * 100).toFixed(0)}% accuracy,{' '}
                      {humanTimes.elite.toFixed(0)}s/problem
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <div className="text-muted-foreground text-sm">Best Accuracy</div>
                <div className="text-2xl font-bold text-green-500">
                  {bestAccuracy ? `${(bestAccuracy.value * 100).toFixed(1)}%` : '-'}
                </div>
                {bestAccuracy && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {bestAccuracy.shortModel} ({bestAccuracy.format})
                  </div>
                )}
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <div className="text-muted-foreground text-sm">Best LMIQ</div>
                <div className="text-2xl font-bold text-primary">
                  {bestLmiq ? (bestLmiq.value * 100).toFixed(1) : '-'}
                </div>
                {bestLmiq && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {bestLmiq.shortModel} ({bestLmiq.format})
                  </div>
                )}
              </div>
            </div>

            {/* Charts Row 1: Accuracy & LMIQ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-card rounded-lg p-4 border border-border">
                <h2 className="text-lg font-semibold mb-1">Accuracy</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Percentage of mazes solved correctly. Human baseline accuracy varies by difficulty
                  (93-100% for average, 96-100% for elite).
                </p>
                <AccuracyChart data={modelFormatScores} humanBaseline={humanBaseline} />
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <h2 className="text-lg font-semibold mb-1">LMIQ Score</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Composite score = Time Efficiency × Path Efficiency × Accuracy. Measures overall
                  problem-solving capability relative to human performance.
                </p>
                <LMIQChart data={modelFormatScores} humanBaseline={humanBaseline} />
              </div>
            </div>

            {/* Charts Row 2: Time Efficiency & Energy Efficiency */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-card rounded-lg p-4 border border-border">
                <h2 className="text-lg font-semibold mb-1">
                  Model Time Efficiency vs. Human Performance
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Multiplier = LLM inference time ÷ human solving time. Human baseline uses
                  difficulty-adjusted times (10-90s). Values &gt;1x indicate slower than human.
                </p>
                <TimeEfficiencyChart data={modelFormatScores} humanBaseline={humanBaseline} />
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <h2 className="text-lg font-semibold mb-1">
                  Model Energy Efficiency vs. Human Performance
                </h2>
                <p className="text-xs text-muted-foreground mb-4">
                  Multiplier = LLM energy ÷ human energy. Assumes human brain at 20W, LLM inference
                  at 2kW. Values &gt;1x indicate less efficient than human.
                </p>
                <EnergyEfficiencyChart data={modelFormatScores} humanBaseline={humanBaseline} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
