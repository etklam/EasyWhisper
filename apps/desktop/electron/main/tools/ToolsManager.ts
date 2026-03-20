import { FfmpegManager } from '../audio/FfmpegManager'
import { YtDlpManager } from '../ytdlp/YtDlpManager'

export interface ToolsManagerOptions {
  userDataDir: string
}

export class ToolsManager {
  private readonly ytDlpManager: YtDlpManager
  private readonly ffmpegManager: FfmpegManager

  constructor(options: ToolsManagerOptions) {
    this.ytDlpManager = new YtDlpManager({ userDataDir: options.userDataDir })
    this.ffmpegManager = new FfmpegManager({ userDataDir: options.userDataDir })
  }

  getYtDlpManager(): YtDlpManager {
    return this.ytDlpManager
  }

  getFfmpegManager(): FfmpegManager {
    return this.ffmpegManager
  }
}
