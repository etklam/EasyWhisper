import type { AiCustomPrompts, AiTaskType } from './types'

// AI Prompt 模板

// 預設模板（內建，隨 app 更新）
const DEFAULT_PROMPTS = {
  translate: (text: string, targetLang: string) =>
    `Translate the following text into ${targetLang}. Output only the translation, no explanation:\n\n${text}`,

  summary: (text: string) =>
    `Provide a concise summary of the following transcript. List key points:\n\n${text}`,

  correct: (text: string, lang: string) =>
    `The following is ${lang} text from speech recognition. Fix typos and recognition errors, preserve the original meaning, output only the corrected text:\n\n${text}`
} as const

// 取得有效模板（自訂 > 預設）
export function getPrompt(
  task: AiTaskType,
  customPrompts?: AiCustomPrompts
): (...args: any[]) => string {
  const custom = customPrompts?.[task]
  if (custom) {
    // 自訂模板使用 {text}, {targetLang}, {lang} 作為佔位符
    return (...args: any[]) => {
      let result = custom
      const [text, secondArg] = args
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
  }
  return DEFAULT_PROMPTS[task]
}

export { DEFAULT_PROMPTS }
