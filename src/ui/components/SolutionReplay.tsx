import type { EvaluationResult } from '../../core/types'
import { Button, Card, CardContent, CardHeader, CardTitle, Separator } from './ui'

function formatNumber(n: number | null): string {
  if (n === null) return '-'
  return n.toLocaleString()
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

interface SolutionReplayProps {
  result: EvaluationResult
  isReplaying: boolean
  onStartReplay: () => void
  onStopReplay: () => void
}

export default function SolutionReplay({
  result,
  isReplaying,
  onStartReplay,
  onStopReplay,
}: SolutionReplayProps) {
  const moves = result.parsedMoves ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Solution Details</CardTitle>
        {/* Stats */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
          <span>In: {formatNumber(result.inputTokens)}</span>
          <span>Out: {formatNumber(result.outputTokens)}</span>
          {result.reasoningTokens !== null && (
            <span>Reasoning: {formatNumber(result.reasoningTokens)}</span>
          )}
          <span>{formatTime(result.inferenceTimeMs)}</span>
          {result.costUsd !== null && <span>${result.costUsd.toFixed(4)}</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Moves - abbreviated to one line with replay button */}
        <div className="flex items-center justify-between">
          {moves.length > 0 ? (
            <div className="text-sm">
              <span className="text-muted-foreground">Moves ({moves.length}): </span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-amber-400 font-mono">
                {moves.slice(0, 6).join(', ')}
                {moves.length > 6 && ', ...'}
              </code>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No moves parsed</div>
          )}
          {moves.length > 0 && (
            <Button
              onClick={isReplaying ? onStopReplay : onStartReplay}
              variant="outline"
              size="xs"
            >
              {isReplaying ? 'Stop' : 'Replay'}
            </Button>
          )}
        </div>

        <Separator />

        {/* Reasoning */}
        {result.reasoning && (
          <div>
            <div className="text-sm font-bold mb-2">Model Reasoning</div>
            <div className="bg-muted rounded-md p-2 text-xs text-muted-foreground whitespace-pre-wrap">
              {result.reasoning}
            </div>
          </div>
        )}

        {/* Full Response */}
        <div>
          <div className="text-sm font-bold mb-2">Full Response</div>
          <div className="bg-muted rounded-md p-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap">
            {result.rawResponse || <span className="italic">No response</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
