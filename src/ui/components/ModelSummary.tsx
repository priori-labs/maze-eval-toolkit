import type { EvaluationResult } from '../../core/types'
import { Card, CardContent, CardHeader, CardTitle } from './ui'
import { Badge } from './ui'

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
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Model Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {results.map((result) => {
          const isSelected = result.id === selectedId
          const outcomeVariant =
            result.outcome === 'success'
              ? 'default'
              : result.outcome === 'parse_error'
                ? 'secondary'
                : 'destructive'

          return (
            <button
              type="button"
              key={result.id}
              onClick={() => onSelect(result)}
              className={`w-full text-left p-3 rounded-md transition-colors ${
                isSelected
                  ? 'bg-primary/20 border border-primary'
                  : 'bg-muted hover:bg-accent border border-transparent'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="truncate flex-1">
                  <span className="font-mono text-sm">{result.model}</span>
                </div>
                <Badge variant={outcomeVariant}>{result.outcome}</Badge>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>
                  Steps: {result.solutionLength ?? '-'}/{shortestPath}
                </span>
                {result.efficiency !== null && (
                  <span>Efficiency: {(result.efficiency * 100).toFixed(0)}%</span>
                )}
                <span>{result.inferenceTimeMs}ms</span>
                {result.costUsd !== null && <span>${result.costUsd.toFixed(4)}</span>}
              </div>
            </button>
          )
        })}
      </CardContent>
    </Card>
  )
}
