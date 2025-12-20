import type { EvaluationResult } from '../../core/types'
import { Badge, Card, CardContent, CardHeader, CardTitle } from './ui'

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

const MODEL_ORDER = ['gemini', 'gpt', 'claude', 'grok', 'human']

function getModelSortIndex(model: string): number {
  const lowerModel = model.toLowerCase()
  for (let i = 0; i < MODEL_ORDER.length; i++) {
    if (lowerModel.includes(MODEL_ORDER[i]!)) {
      return i
    }
  }
  return MODEL_ORDER.length
}

interface ModelSummaryProps {
  results: EvaluationResult[]
  shortestPath: number
  selectedId: string | undefined
  onSelect: (result: EvaluationResult) => void
}

export default function ModelSummary({
  results,
  shortestPath,
  selectedId,
  onSelect,
}: ModelSummaryProps) {
  const sortedResults = [...results].sort(
    (a, b) => getModelSortIndex(a.model) - getModelSortIndex(b.model),
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Model Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sortedResults.map((result) => {
          const isSelected = result.id === selectedId
          const isSuccess = result.outcome === 'success'

          return (
            <button
              type="button"
              key={result.id}
              onClick={() => onSelect(result)}
              className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                isSelected
                  ? 'bg-primary/20 border border-primary'
                  : 'hover:bg-accent border border-transparent'
              }`}
            >
              <div className="flex justify-between items-center gap-2">
                <span className="font-mono text-xs truncate flex-1">{result.model}</span>
                <Badge
                  variant="outline"
                  className={`text-xs px-1.5 py-0 ${
                    isSuccess
                      ? 'border-green-400/50 text-green-400 bg-green-400/10'
                      : 'border-red-400/50 text-red-400 bg-red-400/10'
                  }`}
                >
                  {result.outcome}
                </Badge>
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                <span>
                  {result.solutionLength ?? '-'}/{shortestPath} steps
                </span>
                {result.efficiency !== null && (
                  <span>{(result.efficiency * 100).toFixed(0)}% eff</span>
                )}
                <span>{formatTime(result.inferenceTimeMs)}</span>
              </div>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
