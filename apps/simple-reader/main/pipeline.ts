// Thin re-export for backward compatibility.
// All logic now lives in pipeline/ directory.
export type { PipelineContext } from "./pipeline/context"
export { createContext, loadContext, saveContext } from "./pipeline/context"
export type { PipelineCallbacks, PipelineResult } from "./pipeline/orchestrator"
export { runFrom, runPipeline } from "./pipeline/orchestrator"
