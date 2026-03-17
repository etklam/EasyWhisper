import type { OllamaGenerateResponse, OllamaModel, OllamaTagsResponse } from './types'

const BASE = 'http://localhost:11434'

export async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/api/tags`)
    return response.ok
  } catch {
    return false
  }
}

export async function listModels(): Promise<string[]> {
  const data = await fetchTags()
  return data.models.map((model) => model.name)
}

export async function chat(
  model: string,
  prompt: string,
  stream = false
): Promise<OllamaGenerateResponse> {
  const response = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream
    })
  })

  if (!response.ok) {
    throw new Error('Ollama API error')
  }

  const data = (await response.json()) as Partial<OllamaGenerateResponse>
  return {
    response: data.response ?? '',
    prompt_eval_count: data.prompt_eval_count,
    eval_count: data.eval_count
  }
}

export async function listModelsWithDetails(): Promise<OllamaModel[]> {
  const data = await fetchTags()
  return data.models
}

async function fetchTags(): Promise<OllamaTagsResponse> {
  const response = await fetch(`${BASE}/api/tags`)
  if (!response.ok) {
    throw new Error('Ollama API error')
  }

  const data = (await response.json()) as Partial<OllamaTagsResponse>
  return {
    models: Array.isArray(data.models) ? data.models : []
  }
}
