import { discoverStage } from "../stages/discover"
import { publishStage } from "../stages/publish"
import { uploadStage } from "../stages/upload"
import type { StageDefinition } from "../types"
import { extractStage } from "./extract"
import { renderStage } from "./render"
import { screenStage } from "./screen"
import { scriptStage } from "./script"
import { transcribeStage } from "./transcribe"

export const SIGNALIST_STAGES: StageDefinition[] = [
  discoverStage,
  screenStage,
  transcribeStage,
  extractStage,
  scriptStage,
  renderStage,
  uploadStage,
  publishStage,
]
