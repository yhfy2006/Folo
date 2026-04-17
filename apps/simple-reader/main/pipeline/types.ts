import type { PipelineContext } from "./context"

export type StageName =
  | "verify"
  | "reflect"
  | "discover"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"
  | "screen"
  | "transcribe"
  | "extract"
  | "script"
  | "render"

export interface StageCallbacks {
  onStatus: (status: string) => void
}

export interface StageDefinition {
  name: StageName
  label: string
  shouldRun: (ctx: PipelineContext) => boolean
  run: (ctx: PipelineContext, callbacks: StageCallbacks) => Promise<PipelineContext>
}

export interface DiscoverySignal {
  entryId: string
  title: string
  heatScore: number
  signals: {
    sourceOverlap: number
    recency: number
  }
  overlappingSources: string[]
}
