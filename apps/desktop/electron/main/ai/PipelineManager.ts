/**
 * PipelineManager - manages AiPipeline instances
 *
 * Design rationale:
 * - Reuse pipeline instances to avoid repeated initialization
 * - WeakRef allows GC when pipelines are no longer needed
 * - Single instance ensures consistent management across IPC calls
 */

import type { PipelineOptions } from './types'
import { AiPipeline } from './AiPipeline'

class PipelineManager {
  private static instance: PipelineManager
  private pipelines = new Map<string, WeakRef<AiPipeline>>()
  private readonly finalizationRegistry = new FinalizationRegistry((model: string) => {
    this.pipelines.delete(model)
  })

  private constructor() {}

  static getInstance(): PipelineManager {
    if (!PipelineManager.instance) {
      PipelineManager.instance = new PipelineManager()
    }
    return PipelineManager.instance
  }

  /**
   * Get or create a pipeline for the given model
   *
   * @param model - Model name (e.g., 'llama2', 'mistral')
   * @param tasks - Enabled tasks for this pipeline
   * @param options - Optional pipeline configuration
   * @returns AiPipeline instance (reused if available)
   */
  getPipeline(
    model: string,
    tasks: { correct: boolean; translate: boolean; summary: boolean },
    options?: PipelineOptions
  ): AiPipeline {
    const existing = this.pipelines.get(model)?.deref()
    if (existing) {
      return existing
    }

    const pipeline = new AiPipeline(model, tasks, options)
    this.pipelines.set(model, new WeakRef(pipeline))
    this.finalizationRegistry.register(pipeline, model)
    return pipeline
  }

  /**
   * Get statistics about managed pipelines
   *
   * @returns Object with pipeline manager stats
   */
  getStats(): { managedPipelines: number; models: string[] } {
    return {
      managedPipelines: this.pipelines.size,
      models: Array.from(this.pipelines.keys())
    }
  }

  /**
   * Clear all managed pipelines (useful for testing or cleanup)
   */
  clear(): void {
    this.pipelines.clear()
  }
}

export function getPipelineManager(): PipelineManager {
  return PipelineManager.getInstance()
}
