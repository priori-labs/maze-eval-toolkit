/**
 * SQLite database schema definitions
 */

/**
 * SQL to create the evaluations table
 */
export const CREATE_EVALUATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  test_set_id TEXT NOT NULL,
  test_set_name TEXT NOT NULL DEFAULT '',
  maze_id TEXT NOT NULL,
  model TEXT NOT NULL,
  difficulty TEXT NOT NULL,

  -- Request details
  prompt TEXT NOT NULL,
  prompt_formats TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,

  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,

  -- Cost and timing
  cost_usd REAL,
  inference_time_ms INTEGER NOT NULL,

  -- Response data
  raw_response TEXT NOT NULL,
  parsed_moves TEXT,
  reasoning TEXT,

  -- Outcome
  outcome TEXT NOT NULL,
  moves_executed INTEGER,
  final_position TEXT,

  -- Efficiency
  solution_length INTEGER,
  shortest_path INTEGER NOT NULL,
  efficiency REAL,

  -- Human evaluation flag
  is_human INTEGER NOT NULL DEFAULT 0,

  -- Trial tracking (for repeated evaluations)
  trial_number INTEGER,
  total_trials INTEGER
);
`

/**
 * SQL to create indexes for common queries
 */
export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_evaluations_run ON evaluations(run_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_model ON evaluations(model);
CREATE INDEX IF NOT EXISTS idx_evaluations_maze ON evaluations(maze_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_outcome ON evaluations(outcome);
CREATE INDEX IF NOT EXISTS idx_evaluations_test_set ON evaluations(test_set_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_difficulty ON evaluations(difficulty);
CREATE INDEX IF NOT EXISTS idx_evaluations_is_human ON evaluations(is_human);
`

/**
 * SQL to insert an evaluation result
 */
export const INSERT_EVALUATION = `
INSERT INTO evaluations (
  id, run_id, test_set_id, test_set_name, maze_id, model, difficulty,
  prompt, prompt_formats, started_at, completed_at,
  input_tokens, output_tokens, reasoning_tokens,
  cost_usd, inference_time_ms,
  raw_response, parsed_moves, reasoning,
  outcome, moves_executed, final_position,
  solution_length, shortest_path, efficiency,
  is_human, trial_number, total_trials
) VALUES (
  ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?,
  ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?
)
`

/**
 * SQL to get all evaluations for a maze
 */
export const GET_EVALUATIONS_BY_MAZE = `
SELECT * FROM evaluations WHERE maze_id = ? ORDER BY completed_at DESC
`

/**
 * SQL to get all evaluations for a model
 */
export const GET_EVALUATIONS_BY_MODEL = `
SELECT * FROM evaluations WHERE model = ? ORDER BY completed_at DESC
`

/**
 * SQL to get all evaluations in a test set
 */
export const GET_EVALUATIONS_BY_TEST_SET = `
SELECT * FROM evaluations WHERE test_set_id = ? ORDER BY completed_at DESC
`

/**
 * SQL to get evaluation summary stats by model
 */
export const GET_MODEL_SUMMARY = `
SELECT
  model,
  COUNT(*) as total,
  SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
  AVG(CASE WHEN outcome = 'success' THEN efficiency ELSE NULL END) as avg_efficiency,
  AVG(inference_time_ms) as avg_time_ms,
  SUM(cost_usd) as total_cost
FROM evaluations
WHERE test_set_id = ?
GROUP BY model
ORDER BY successes DESC
`

/**
 * SQL to update an evaluation result (for retry)
 */
export const UPDATE_EVALUATION = `
UPDATE evaluations SET
  started_at = ?,
  completed_at = ?,
  input_tokens = ?,
  output_tokens = ?,
  reasoning_tokens = ?,
  cost_usd = ?,
  inference_time_ms = ?,
  raw_response = ?,
  parsed_moves = ?,
  reasoning = ?,
  outcome = ?,
  moves_executed = ?,
  final_position = ?,
  solution_length = ?,
  efficiency = ?
WHERE id = ?
`
