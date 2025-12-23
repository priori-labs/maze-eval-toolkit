/**
 * Shared model definitions used across the codebase
 */

export interface Model {
  id: string
  name: string
  description: string
}

export const MODELS: Model[] = [
  /* ============================== Google Models ============================== */
  {
    id: 'google/gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    description: "Google's flagship model",
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    description: "Google's fastest model",
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: "Google's model",
  },

  /* ============================== OpenAI Models ============================== */
  {
    id: 'openai/gpt-5.2-pro',
    name: 'GPT-5.2 Pro',
    description: 'Most capable OpenAI model (Pro)',
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    description: 'Most capable OpenAI model (Standard)',
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI GPT-4o model',
  },

  /* ============================== Anthropic Models ============================== */
  {
    id: 'anthropic/claude-opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Claude Opus 4.5 model',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    description: 'Fast and affordable',
  },

  /* ============================== AllenAI Models ============================== */
  {
    id: 'allenai/olmo-3-32b-think',
    name: 'Olmo 3 32B Think',
    description: 'Olmo 3 32B Think model',
  },

  /* ============================== Grok Models ============================== */
  {
    id: 'x-ai/grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    description: 'Grok 4.1 Fast model',
  },

  /* ============================== Nvidia Models ============================== */
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    name: 'Nemotron Nano 12B (Free)',
    description: 'Nvidia Nemotron Nano',
  },

  /* ============================== Chinese Models ============================== */
  {
    id: 'moonshotai/kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    description: 'Kimi K2 Thinking model',
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-thinking',
    name: 'Qwen3 Next 80B A3B Thinking',
    description: 'Qwen3 Next 80B A3B Thinking model',
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    name: 'Qwen3 Next 80B A3B Instruct',
    description: 'Qwen3 Next 80B A3B Instruct model',
  },
  {
    id: 'z-ai/glm-4.6',
    name: 'GLM 4.6',
    description: 'Z-AI GLM 4.6 model',
  },
  {
    id: 'deepseek/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    description: 'DeepSeek V3.2 model',
  },
  {
    id: 'deepseek/deepseek-v3.2-speciale',
    name: 'DeepSeek V3.2 Speciale',
    description: 'DeepSeek V3.2 Speciale model',
  },
]

/**
 * Common models for CLI quick selection
 * These are the most commonly used models for evaluation
 */
export const CLI_MODELS: Model[] = MODELS.filter((m) =>
  [
    'google/gemini-3-pro-preview',
    'google/gemini-3-flash-preview',
    'openai/gpt-5.2',
    'openai/gpt-4o',
    'anthropic/claude-opus-4.5',
    'anthropic/claude-haiku-4.5',
    'x-ai/grok-4.1-fast',
    'moonshotai/kimi-k2-thinking',
    'deepseek/deepseek-v3.2',
    'deepseek/deepseek-v3.2-speciale',
  ].includes(m.id),
)

/**
 * Helper to convert models to inquirer select choices format
 */
export function toSelectChoices(models: Model[]): { name: string; value: string }[] {
  return models.map((m) => ({ name: m.name, value: m.id }))
}
