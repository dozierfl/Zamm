export type VoiceConversionMessage = { voiceConversionJobId: string };

export interface VoiceConversionQueue {
  enqueue(jobId: string): Promise<void>;
}

export class CloudflareVoiceConversionQueue implements VoiceConversionQueue {
  constructor(
    private readonly queue: Queue<VoiceConversionMessage | { generationJobId: string }>,
  ) {}
  async enqueue(jobId: string) {
    await this.queue.send({ voiceConversionJobId: jobId });
  }
}

export class InlineVoiceConversionQueue implements VoiceConversionQueue {
  constructor(private readonly consume: (jobId: string) => Promise<void>) {}
  async enqueue(jobId: string) {
    queueMicrotask(() => void this.consume(jobId));
  }
}
