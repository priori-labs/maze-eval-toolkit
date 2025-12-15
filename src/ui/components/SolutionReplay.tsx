import type { EvaluationResult } from '../../core/types'
import { Card, CardContent, CardHeader, CardTitle } from './ui'
import { Button } from './ui'
import { Badge } from './ui'
import { Separator } from './ui'

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
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Solution Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        {moves.length > 0 && (
          <Button
            onClick={isReplaying ? onStopReplay : onStartReplay}
            variant={isReplaying ? 'destructive' : 'default'}
            size="sm"
          >
            {isReplaying ? 'Stop' : 'Replay'}
          </Button>
        )}

        {/* Moves */}
        {moves.length > 0 ? (
          <div>
            <div className="text-sm text-muted-foreground mb-2">Moves ({moves.length}):</div>
            <div className="flex flex-wrap gap-1">
              {moves.map((move, i) => (
                <Badge key={`${move}-${i}`} variant="outline" className="font-mono">
                  {move}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No moves parsed from response</div>
        )}

        <Separator />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-muted-foreground">Input Tokens:</div>
          <div>{result.inputTokens ?? '-'}</div>

          <div className="text-muted-foreground">Output Tokens:</div>
          <div>{result.outputTokens ?? '-'}</div>

          {result.reasoningTokens !== null && (
            <>
              <div className="text-muted-foreground">Reasoning Tokens:</div>
              <div>{result.reasoningTokens}</div>
            </>
          )}

          <div className="text-muted-foreground">Time:</div>
          <div>{result.inferenceTimeMs}ms</div>

          <div className="text-muted-foreground">Cost:</div>
          <div>{result.costUsd !== null ? `$${result.costUsd.toFixed(4)}` : '-'}</div>
        </div>

        {/* Reasoning */}
        {result.reasoning && (
          <>
            <Separator />
            <div>
              <div className="text-sm text-muted-foreground mb-2">Model Reasoning:</div>
              <div className="bg-muted rounded-md p-3 text-sm max-h-40 overflow-y-auto">
                {result.reasoning}
              </div>
            </div>
          </>
        )}

        {/* Raw Response */}
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            Raw Response
          </summary>
          <div className="mt-2 bg-muted rounded-md p-2 text-xs text-muted-foreground max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
            {result.rawResponse}
          </div>
        </details>
      </CardContent>
    </Card>
  )
}
