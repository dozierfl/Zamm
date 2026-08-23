import type { GenerationStatus } from "./domain";
const allowed:Record<GenerationStatus,readonly GenerationStatus[]>={QUEUED:["PREPARING","CANCELLED"],PREPARING:["GENERATING","FAILED","CANCELLED"],GENERATING:["POST_PROCESSING","FAILED","CANCELLED"],POST_PROCESSING:["UPLOADING","FAILED","CANCELLED"],UPLOADING:["COMPLETE","FAILED","CANCELLED"],COMPLETE:[],FAILED:["QUEUED"],CANCELLED:[]};
export function assertTransition(from:GenerationStatus,to:GenerationStatus){if(!allowed[from].includes(to))throw new Error(`INVALID_JOB_TRANSITION:${from}:${to}`)}
export function isTerminal(status:GenerationStatus){return status==="COMPLETE"||status==="FAILED"||status==="CANCELLED"}
