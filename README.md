# LMIQ v1 Beta

AI Maze Solving Benchmark - Test LLM spatial reasoning by evaluating their ability to navigate mazes.

## Quick Start

```bash
# Prerequisites: Bun, Task (optional)
bun install

# Generate test set
task generate

# Run evaluation (interactive)
export OPENROUTER_API_KEY="your-key"
task evaluate

# View scores
task score

# View results in UI
task ui
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `task generate` | Generate a test set of mazes |
| `task evaluate` | Run model evaluation on a test set |
| `task score` | Compute LMIQ scores from results |
| `task retry` | Retry failed evaluations |
| `task export` | Export results to JSON for the UI |
| `task delete` | Delete evaluation runs |
| `task ui` | Start the viewer UI |
| `task studio` | Open Drizzle Studio (DB inspector) |
| `task backup` | Backup the evaluation database |

## Prompt Formats

Models receive maze data in one or more formats:

| Format | Description |
|--------|-------------|
| `ascii` | Visual grid with `#` walls, `.` paths, `S` start, `G` goal |
| `block` | Spaced block characters for visual clarity |
| `adjacency` | Graph adjacency list of cell connections |
| `edges` | Natural language graph edges with explicit actions |
| `coordmatrix` | Dense coordinate matrix with move notation |
| `matrix2d` | Grid + explicit valid moves per cell |

Combine multiple: `--formats ascii,edges`

## Difficulty Levels

| Difficulty | Grid Size | Min Path | Extra Paths |
|------------|-----------|----------|-------------|
| simple | 5-8 × 4-6 | 5 | 0 |
| easy | 8-12 × 6-9 | 10 | 6 |
| medium | 12-18 × 10-14 | 20 | 10 |
| hard | 16-22 × 12-16 | 30 | 15 |
| nightmare | 28-38 × 18-22 | 50 | 0 |

## Evaluation Outcomes

| Outcome | Description |
|---------|-------------|
| `success` | Reached goal via valid path |
| `failure` | Valid moves but didn't reach goal |
| `invalid_move` | Attempted to walk through a wall |
| `parse_error` | Couldn't parse moves from response |
| `empty_response` | Model returned no content |
| `token_limit` | Model hit token limit while reasoning |

## LMIQ Scoring

The `score` command computes:

- **Accuracy** - Success rate adjusted by path efficiency
- **Time Efficiency** - Human reference time / model inference time
- **LMIQ Score** - Combined time × path efficiency
- **Energy Efficiency** - Human brain watts vs GPU watts

## Project Structure

```
src/
├── core/     # Maze generation, solving, rendering
├── cli/      # CLI commands
├── db/       # SQLite database layer
├── llm/      # OpenRouter integration
└── ui/       # React viewer app
data/         # Generated test sets
results/      # Evaluation databases
```

## Development

```bash
task format   # Format code
task lint     # Lint code
task tsc      # Type check
task check    # All checks
```

## License

MIT
