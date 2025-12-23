/**
 * AI Control Panel - Shared component for AI agent controls
 */

import { MODELS } from '@/core'
import { Button } from '@/ui-library/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui-library/components/ui/card'
import { Checkbox } from '@/ui-library/components/ui/checkbox'
import { Label } from '@/ui-library/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui-library/components/ui/select'
import { Separator } from '@/ui-library/components/ui/separator'
import { toast } from '@/ui-library/components/ui/sonner'
import { Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatCost, formatDuration, formatNumber } from '../lib/format'
import { SquareLoader } from './SquareLoader'
import type { AgentLog, HistoryItem, SessionMetrics } from './types'

interface PromptOption {
  id: string
  label: string
  checked: boolean
  disabled?: boolean
  group?: string
}

export interface AIControlPanelProps {
  // Model selection
  model: string
  onModelChange: (model: string) => void

  // Core actions
  onStart: () => void
  onStop: () => void
  onReset: () => void
  onCopyPrompt?: () => void
  onCopyMostRecentPrompt?: () => void
  onCopyFullContext?: () => void
  onReplay?: () => void

  // State flags
  isRunning: boolean
  isGameWon: boolean
  isGameStarted?: boolean // Whether the game has started (controls initial state display)
  error: string | null
  rawErrorResponse?: string | null

  // Session metrics
  sessionMetrics: SessionMetrics

  // Inflight request timer (seconds, or null when not in-flight)
  inflightSeconds: number | null

  // History display
  history: HistoryItem[]

  // Events log
  logs: AgentLog[]

  // Optional: AI comments
  aiComments?: string | null

  // Optional: Prompt customization
  promptOptions?: {
    options: PromptOption[]
    onChange: (id: string, checked: boolean) => void
  }

  // Optional: Special instructions textarea
  specialInstructions?: {
    value: string
    onChange: (value: string) => void
    show: boolean
  }

  // Optional: Special action result
  specialActionResult?: {
    action: string
    isCorrect: boolean
  } | null

  // Optional: Manual move entry - callback to execute manually entered moves
  onManualMoves?: (movesText: string) => void
}

export function AIControlPanel({
  model,
  onModelChange,
  onStart,
  onStop,
  onReset,
  onCopyPrompt,
  onCopyMostRecentPrompt,
  onCopyFullContext,
  onReplay,
  isRunning,
  isGameWon,
  isGameStarted = true,
  error,
  rawErrorResponse,
  sessionMetrics,
  inflightSeconds,
  history,
  logs,
  aiComments,
  promptOptions,
  specialInstructions,
  specialActionResult,
  onManualMoves,
}: AIControlPanelProps) {
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [showRawResponse, setShowRawResponse] = useState(false)
  const [showManualMoveEntry, setShowManualMoveEntry] = useState(false)
  const [manualMoveText, setManualMoveText] = useState('')
  const historyContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll history to bottom when new items are added
  useEffect(() => {
    if (historyContainerRef.current) {
      historyContainerRef.current.scrollTop = historyContainerRef.current.scrollHeight
    }
  }, [history.length])
  const aiHasRun = history.length > 0 || specialActionResult !== null
  const aiCompleted =
    (aiHasRun && !isRunning && isGameWon) || specialActionResult?.isCorrect === true
  const aiStopped =
    (aiHasRun && !isRunning && !isGameWon && !specialActionResult && isGameStarted) ||
    specialActionResult?.isCorrect === false

  const getLogColor = (level: string) => {
    switch (level) {
      case 'request':
        return 'text-blue-400'
      case 'response':
        return 'text-green-400'
      case 'success':
        return 'text-green-300'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const getLogPrefix = (level: string) => {
    switch (level) {
      case 'request':
        return '\u2192'
      case 'response':
        return '\u2190'
      case 'success':
        return '\u2713'
      case 'error':
        return '\u2717'
      default:
        return '\u2022'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return '○'
      case 'executing':
        return '●'
      case 'success':
        return '✓'
      case 'failed':
        return '✗'
      default:
        return '•'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-muted-foreground'
      case 'executing':
        return 'text-blue-400'
      case 'success':
        return 'text-green-400'
      case 'failed':
        return 'text-red-400'
      default:
        return 'text-muted-foreground'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'executing':
        return 'bg-blue-500/10'
      case 'failed':
        return 'bg-red-500/10'
      default:
        return ''
    }
  }

  return (
    <Card className="flex-1 min-h-0 flex flex-col w-80">
      <CardHeader className="flex-shrink-0 space-y-3 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">AI Agent</CardTitle>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <SquareLoader size={4} gap={1} color="#4ade80" uniformColor />
              <span className="animate-pulse">Running</span>
            </span>
          )}
          {aiCompleted && !specialActionResult && (
            <span className="text-xs text-green-400">Completed</span>
          )}
          {aiCompleted && specialActionResult && (
            <span className="text-xs font-semibold text-green-400">
              Correct: {specialActionResult.action.split('_').join(' ')}
            </span>
          )}
          {aiStopped && !specialActionResult && (
            <span className="text-xs text-yellow-400">Stopped</span>
          )}
          {aiStopped && specialActionResult && (
            <span className="text-xs font-semibold text-red-400">
              Wrong: {specialActionResult.action.split('_').join(' ')}
            </span>
          )}
        </div>

        {/* Model name when running or has run */}
        {(isRunning || aiHasRun) && (
          <div className="font-mono text-sm text-blue-400 truncate">{model}</div>
        )}

        {/* Session stats */}
        {(isRunning || aiHasRun) && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost</div>
              <div className="font-mono">{formatCost(sessionMetrics.cost)}</div>
            </div>
            <div className="rounded-md border px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Time</div>
              <div className="font-mono">{formatDuration(sessionMetrics.totalThinkingMs)}</div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex flex-col gap-3 pt-0 overflow-y-auto">
        {/* Model selector - only show when not running and no history and no special action */}
        {!isRunning && history.length === 0 && !specialActionResult && (
          <div className="space-y-1.5">
            <Label htmlFor="model-select" className="text-xs">
              Model
            </Label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger id="model-select" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Prompt options - always show when available */}
        {promptOptions && promptOptions.options.length > 0 && (
          <>
            {(() => {
              // Group options by their group property (undefined groups go together at the end)
              const groups = new Map<string | undefined, typeof promptOptions.options>()
              for (const option of promptOptions.options) {
                const group = option.group
                if (!groups.has(group)) {
                  groups.set(group, [])
                }
                groups.get(group)?.push(option)
              }

              // Get ordered group names (defined groups first, undefined last)
              const groupNames = Array.from(groups.keys()).sort((a, b) => {
                if (a === undefined) return 1
                if (b === undefined) return -1
                return 0
              })

              return groupNames.map((groupName, groupIdx) => {
                const groupOptions = groups.get(groupName) ?? []
                return (
                  <div key={groupName ?? 'ungrouped'} className="space-y-1.5">
                    {groupName && <Label className="text-xs">{groupName}</Label>}
                    <div className="flex flex-col gap-2">
                      {groupOptions.map((option) => {
                        const isDisabled =
                          option.disabled ??
                          (isRunning || history.length > 0 || specialActionResult !== null)
                        return (
                          <div key={option.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`option-${option.id}`}
                              checked={option.checked}
                              disabled={isDisabled}
                              onCheckedChange={(checked) =>
                                promptOptions.onChange(option.id, !!checked)
                              }
                              className="h-3.5 w-3.5"
                            />
                            <Label
                              htmlFor={`option-${option.id}`}
                              className={`text-xs ${isDisabled ? 'text-muted-foreground cursor-default' : 'cursor-pointer'}`}
                            >
                              {option.label}
                            </Label>
                          </div>
                        )
                      })}
                    </div>
                    {groupIdx < groupNames.length - 1 && <Separator className="mt-2" />}
                  </div>
                )
              })
            })()}
            <Separator />
          </>
        )}

        {/* Controls */}
        <div className="space-y-2 flex-shrink-0">
          {aiCompleted ? (
            <>
              {onReplay && history.length > 0 && (
                <Button onClick={onReplay} className="w-full" size="sm">
                  Replay AI Solution
                </Button>
              )}
              {onCopyFullContext && (
                <Button onClick={onCopyFullContext} variant="outline" className="w-full" size="sm">
                  <Copy className="h-3 w-3 mr-1.5" />
                  Copy Full Context
                </Button>
              )}
              <Button onClick={onReset} variant="outline" className="w-full" size="sm">
                Reset
              </Button>
            </>
          ) : aiStopped ? (
            <>
              <Button onClick={onStart} className="w-full" size="sm">
                Retry
              </Button>
              {onReplay && history.length > 0 && (
                <Button onClick={onReplay} variant="outline" className="w-full" size="sm">
                  Replay AI Solution
                </Button>
              )}
              {onCopyFullContext && (
                <Button onClick={onCopyFullContext} variant="outline" className="w-full" size="sm">
                  <Copy className="h-3 w-3 mr-1.5" />
                  Copy Full Context
                </Button>
              )}
              <Button onClick={onReset} variant="outline" className="w-full" size="sm">
                Reset
              </Button>
            </>
          ) : isRunning ? (
            <>
              <Button onClick={onStop} variant="outline" className="w-full" size="sm">
                Stop
              </Button>
              {onCopyMostRecentPrompt && (
                <Button
                  onClick={onCopyMostRecentPrompt}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <Copy className="h-3 w-3 mr-1.5" />
                  Copy Most Recent Prompt
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                onClick={onStart}
                disabled={isGameWon || !isGameStarted}
                className="w-full"
                size="sm"
              >
                Run AI Agent
              </Button>
              {onCopyPrompt && (
                <Button
                  onClick={onCopyPrompt}
                  variant="outline"
                  className="w-full"
                  size="sm"
                  disabled={!isGameStarted}
                >
                  <Copy className="h-3 w-3 mr-1.5" />
                  Copy Prompt
                </Button>
              )}
              {/* Special Instructions Input */}
              {specialInstructions?.show && (
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="special-instructions" className="text-xs text-muted-foreground">
                    Special Instructions (optional)
                  </Label>
                  <textarea
                    id="special-instructions"
                    value={specialInstructions.value}
                    onChange={(e) => specialInstructions.onChange(e.target.value)}
                    placeholder="Add any special instructions for the AI..."
                    className="w-full min-h-[180px] text-xs bg-background border rounded-md px-2 py-1.5 resize-y"
                  />
                </div>
              )}
            </>
          )}
          {(isRunning || aiCompleted || aiStopped) &&
            specialInstructions &&
            specialInstructions.value.trim() && (
              <div className="space-y-1.5 pt-2">
                <Label className="text-xs text-muted-foreground">
                  Additional Prompt Instructions
                </Label>
                <div className="text-xs text-foreground/60 bg-muted/50 border rounded-md px-2 py-1.5 whitespace-pre-wrap">
                  {specialInstructions.value.trim()}
                </div>
              </div>
            )}
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/10 text-red-400 rounded-md px-3 py-2 space-y-2">
            <div className="flex items-start justify-between gap-2 text-xs">
              <span>{error}</span>
              {rawErrorResponse && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-red-400 hover:text-red-300"
                    onClick={() => setShowRawResponse(!showRawResponse)}
                  >
                    {showRawResponse ? 'Hide' : 'Show'} Response
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-red-400 hover:text-red-300"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(rawErrorResponse)
                        toast.success('Raw response copied to clipboard')
                      } catch {
                        toast.error('Failed to copy response')
                      }
                    }}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              )}
            </div>
            {rawErrorResponse && showRawResponse && (
              <div className="bg-red-950/50 rounded p-2 text-[10px] font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {rawErrorResponse}
              </div>
            )}
          </div>
        )}

        {/* Events Log */}
        {(() => {
          const filteredLogs = logs.filter(
            (l) => l.level === 'request' || l.level === 'response' || l.level === 'error',
          )
          const hasEvents = filteredLogs.length > 0 || inflightSeconds !== null
          if (!hasEvents) return null

          // Get the latest event for condensed view
          const latestLog = filteredLogs[filteredLogs.length - 1]

          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Events</Label>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="show-all-events"
                    checked={showAllEvents}
                    onCheckedChange={(checked) => setShowAllEvents(!!checked)}
                    className="h-3 w-3"
                  />
                  <Label
                    htmlFor="show-all-events"
                    className="text-[10px] text-muted-foreground cursor-pointer"
                  >
                    All
                  </Label>
                </div>
              </div>
              <div
                className={`border rounded-md p-2 ${showAllEvents ? 'max-h-32 overflow-y-auto' : ''}`}
              >
                <div className="space-y-1">
                  {showAllEvents ? (
                    // Show all events
                    <>
                      {filteredLogs.map((log) => (
                        <div
                          key={log.id}
                          className="text-[10px] font-mono flex items-start gap-1.5 py-0.5"
                        >
                          <span className={getLogColor(log.level)}>{getLogPrefix(log.level)}</span>
                          <div className="flex-1 min-w-0">
                            <span className={getLogColor(log.level)}>{log.message}</span>
                            {log.stats && (
                              <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                                <span>Tokens: {formatNumber(log.stats.outputTokens)}</span>
                                <span>Cost: {formatCost(log.stats.cost)}</span>
                                <span>Time: {Math.round(log.stats.durationMs / 1000)}s</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Live inflight timer */}
                      {inflightSeconds !== null && (
                        <div className="text-[10px] font-mono flex items-start gap-1.5 py-0.5">
                          <span className="text-yellow-500">⏳</span>
                          <span className="text-yellow-500">
                            Thinking for{' '}
                            {inflightSeconds >= 60
                              ? `${Math.floor(inflightSeconds / 60)}m ${inflightSeconds % 60}s`
                              : `${inflightSeconds}s`}
                            ...
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    // Show only current/latest event
                    <>
                      {inflightSeconds !== null ? (
                        <div className="text-[10px] font-mono flex items-start gap-1.5 py-0.5">
                          <span className="text-yellow-500">⏳</span>
                          <span className="text-yellow-500">
                            Thinking for{' '}
                            {inflightSeconds >= 60
                              ? `${Math.floor(inflightSeconds / 60)}m ${inflightSeconds % 60}s`
                              : `${inflightSeconds}s`}
                            ...
                          </span>
                        </div>
                      ) : latestLog ? (
                        <div className="text-[10px] font-mono flex items-start gap-1.5 py-0.5">
                          <span className={getLogColor(latestLog.level)}>
                            {getLogPrefix(latestLog.level)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className={getLogColor(latestLog.level)}>
                              {latestLog.message}
                            </span>
                            {latestLog.stats && (
                              <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                                <span>Tokens: {formatNumber(latestLog.stats.outputTokens)}</span>
                                <span>Cost: {formatCost(latestLog.stats.cost)}</span>
                                <span>Time: {Math.round(latestLog.stats.durationMs / 1000)}s</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* AI Comments */}
        {aiComments && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">AI Comments</Label>
            <div className="border rounded-md p-2 text-xs text-foreground/80 bg-muted/30 max-h-32 overflow-y-auto">
              {aiComments}
            </div>
          </div>
        )}

        {/* History */}
        <div className="space-y-1.5 flex-1 min-h-40 flex flex-col">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">History</Label>
            <span className="text-xs text-muted-foreground">{history.length} items</span>
          </div>

          <div
            ref={historyContainerRef}
            className="flex-1 min-h-32 border rounded-md overflow-y-auto"
          >
            <div className="p-2">
              {history.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4 space-y-3">
                  <div>No moves yet</div>
                  {onManualMoves &&
                    !isRunning &&
                    (showManualMoveEntry ? (
                      <div className="space-y-2 text-left">
                        <textarea
                          value={manualMoveText}
                          onChange={(e) => setManualMoveText(e.target.value)}
                          placeholder="Enter moves (e.g., UP, DOWN, LEFT, RIGHT or UP DOWN LEFT RIGHT)"
                          className="w-full min-h-[60px] text-xs bg-background border rounded-md px-2 py-1.5 resize-y text-foreground"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-xs"
                            disabled={!manualMoveText.trim()}
                            onClick={() => {
                              onManualMoves(manualMoveText)
                              setManualMoveText('')
                              setShowManualMoveEntry(false)
                            }}
                          >
                            Execute
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setShowManualMoveEntry(false)
                              setManualMoveText('')
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowManualMoveEntry(true)}
                        className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                      >
                        Enter moves manually
                      </button>
                    ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {history.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`py-1 text-xs border-b border-border/50 last:border-0 flex items-center justify-between rounded ${getStatusBg(item.status)}`}
                    >
                      <span
                        className={`font-medium flex items-center gap-2 ${getStatusColor(item.status)}`}
                      >
                        <span className="w-6">{idx + 1}.</span>
                        <span>{item.label}</span>
                      </span>
                      <span className={`text-[10px] ${getStatusColor(item.status)}`}>
                        {getStatusIcon(item.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
