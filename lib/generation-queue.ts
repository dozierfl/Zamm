export type GenerationMessage={generationJobId:string};
export interface GenerationQueue{enqueue(jobId:string):Promise<void>}
export class CloudflareGenerationQueue implements GenerationQueue{constructor(private readonly queue:Queue<GenerationMessage>){}async enqueue(jobId:string){await this.queue.send({generationJobId:jobId})}}
export class InlineTestGenerationQueue implements GenerationQueue{constructor(private readonly consume:(jobId:string)=>Promise<void>){}async enqueue(jobId:string){queueMicrotask(()=>void this.consume(jobId))}}
