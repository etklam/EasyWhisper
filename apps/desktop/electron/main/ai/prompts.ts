import type { AiCustomPrompts, AiTaskType } from './types'

type PromptBuilders = {
  translate: (text: string, targetLang: string) => string
  summary: (text: string) => string
  correct: (text: string, lang: string) => string
}

// AI Prompt 模板

// 預設模板（內建，隨 app 更新）
const DEFAULT_PROMPTS: PromptBuilders = {
  translate: (text: string, targetLang: string) =>
    `Translate the following text into ${targetLang}. The input may contain multiple paragraphs or segments. Translate everything in one pass, preserve the original order and line breaks as much as possible, and output only the translation with no explanation:\n\n${text}`,

  summary: (text: string) =>
    `Provide a concise summary of the following transcript. List key points:\n\n${text}`,

  correct: (text: string, lang: string) =>
    `The following is ${lang} text from speech recognition. Fix typos and recognition errors, preserve the original meaning, output only the corrected text:\n\n${text}`
} as const

// 取得有效模板（自訂 > 預設）
export function getPrompt(
  task: AiTaskType,
  customPrompts?: AiCustomPrompts
): PromptBuilders[AiTaskType] {
  const custom = customPrompts?.[task]
  if (custom) {
    return createCustomPrompt(task, custom)
  }
  return DEFAULT_PROMPTS[task]
}

export { DEFAULT_PROMPTS }

function createCustomPrompt(task: AiTaskType, template: string): PromptBuilders[AiTaskType] {
  switch (task) {
    case 'summary':
      return ((text: string) => applyPromptTemplate(template, text)) as PromptBuilders[AiTaskType]
    case 'translate':
      return ((text: string, targetLang: string) =>
        applyPromptTemplate(template, text, targetLang)) as PromptBuilders[AiTaskType]
    case 'correct':
      return ((text: string, lang: string) =>
        applyPromptTemplate(template, text, lang)) as PromptBuilders[AiTaskType]
  }
}

function applyPromptTemplate(template: string, text: string, secondArg?: string): string {
  let result = template
  const replacements: Record<string, string | undefined> = {
    '{text}': text,
    '{targetLang}': secondArg,
    '{lang}': secondArg
  }

  Object.entries(replacements).forEach(([placeholder, value]) => {
    if (value !== undefined) {
      result = result.replace(new RegExp(placeholder, 'g'), value)
    }
  })

  return result
}
