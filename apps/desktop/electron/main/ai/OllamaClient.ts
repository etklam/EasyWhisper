// Ollama 客户端
const BASE = 'http://localhost:11434'

export async function checkOllama(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/tags`)
    return r.ok
  } catch {
    return false
  }
}

export async function listModels(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/tags`)
  if (!r.ok) {
    throw new Error('Ollama API error')
  }
  const data = await r.json()
  return data.models.map((m: any) => m.name)
}

export async function chat(model: string, prompt: string, stream: boolean = false): Promise<{ response: string; prompt_eval_count?: number; eval_count?: number }> {
  const r = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream
    })
  })

  if (!r.ok) {
    throw new Error('Ollama API error')
  }

  const data = await r.json()
  return {
    response: data.response,
    prompt_eval_count: data.prompt_eval_count,
    eval_count: data.eval_count
  }
}

export async function listModelsWithDetails(): Promise<OllamaModel[]> {
  const r = await fetch(`${BASE}/api/tags`)
  if (!r.ok) {
    throw new Error('Ollama API error')
  }
  const data = await r.json()
  return data.models
}
