import type { PipelineContext } from "./context"

export type StageName =
  | "verify"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"

export interface StageCallbacks {
  onStatus: (status: string) => void
}

export interface StageDefinition {
  name: StageName
  label: string
  shouldRun: (ctx: PipelineContext) => boolean
  run: (ctx: PipelineContext, callbacks: StageCallbacks) => Promise<PipelineContext>
}
