declare module 'katex' {
  export interface KatexOptions {
    displayMode?: boolean
    throwOnError?: boolean
    errorColor?: string
    output?: 'html' | 'mathml' | 'htmlAndMathml'
  }

  export function render(
    expression: string,
    baseNode: HTMLElement,
    options?: KatexOptions
  ): void

  export function renderToString(expression: string, options?: KatexOptions): string

  const katex: {
    render: typeof render
    renderToString: typeof renderToString
  }

  export default katex
}
