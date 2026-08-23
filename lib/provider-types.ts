import type { GenerationRequest, GenerationResult, ProviderCapabilities, ProviderHealth } from "./domain";
export interface MusicGenerationProvider{name:string;model:string;capabilities():ProviderCapabilities;healthCheck():Promise<ProviderHealth>;generate(request:GenerationRequest):Promise<GenerationResult>;cancel?(jobId:string):Promise<void>}
