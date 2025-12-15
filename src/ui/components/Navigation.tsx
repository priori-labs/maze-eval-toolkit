import { Button } from './ui'
import { Input } from './ui'

interface NavigationProps {
  current: number
  total: number
  onNavigate: (index: number) => void
}

export default function Navigation({ current, total, onNavigate }: NavigationProps) {
  return (
    <div className="flex items-center justify-between bg-card rounded-lg px-4 py-3 border border-border">
      <Button
        variant="ghost"
        onClick={() => onNavigate(Math.max(0, current - 1))}
        disabled={current === 0}
      >
        ← Previous
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Maze</span>
        <Input
          type="number"
          value={current + 1}
          min={1}
          max={total}
          onChange={(e) => {
            const val = Number.parseInt(e.target.value, 10)
            if (!Number.isNaN(val) && val >= 1 && val <= total) {
              onNavigate(val - 1)
            }
          }}
          className="w-16 text-center"
        />
        <span className="text-muted-foreground">of {total}</span>
      </div>

      <Button
        variant="ghost"
        onClick={() => onNavigate(Math.min(total - 1, current + 1))}
        disabled={current >= total - 1}
      >
        Next →
      </Button>
    </div>
  )
}
