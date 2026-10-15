import type { GeneratedAsset, GenerationResult } from "./domain";
import { HttpVocalIdentityProcessor } from "./vocal-identity-processor";

export type VoiceProviderCapabilities = {
  singingVoiceConversion: boolean;
  preview: boolean;
  training: "CLI_MANAGED" | "REMOTE" | "UNAVAILABLE";
  preservesPerformance: boolean;
  returnsIsolatedVocal: boolean;
};

export type VoiceConversionRequest = {
  jobId: string;
  profileId: string;
  profileVersionId: string;
  modelRef: string;
  indexRef: string;
  source: GeneratedAsset;
  voiceIdentityStrength: number;
  mode: "PREVIEW" | "FULL";
};

export interface VoiceProvider {
  readonly name: string;
  readonly model: string;
  capabilities(): VoiceProviderCapabilities;
  healthCheck(): Promise<{ available: boolean; message: string }>;
  convert(request: VoiceConversionRequest): Promise<GenerationResult>;
  preview(request: VoiceConversionRequest): Promise<GenerationResult>;
}

export class RvcVoiceProvider implements VoiceProvider {
  readonly name = "RVC";
  readonly model = "RVC-v2-40k-f0";
  private readonly processor: HttpVocalIdentityProcessor;

  constructor(
    private readonly baseUrl: string,
    token?: string,
  ) {
    this.processor = new HttpVocalIdentityProcessor(baseUrl, token);
  }

  capabilities(): VoiceProviderCapabilities {
    return {
      singingVoiceConversion: true,
      preview: true,
      training: "CLI_MANAGED",
      preservesPerformance: true,
      returnsIsolatedVocal: true,
    };
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok)
        return { available: false, message: "Voice service unavailable" };
      const health = (await response.json()) as {
        vocalIdentity?: { available?: boolean; engine?: string };
      };
      const available = health.vocalIdentity?.available === true;
      return {
        available,
        message: available
          ? `${health.vocalIdentity?.engine || "RVC"} ready`
          : "RVC or vocal separation is not ready",
      };
    } catch {
      return { available: false, message: "Voice service unavailable" };
    }
  }

  convert(request: VoiceConversionRequest) {
    return this.processor.apply({ ...request, previewDurationSeconds: undefined });
  }

  preview(request: VoiceConversionRequest) {
    return this.processor.apply({ ...request, previewDurationSeconds: 30 });
  }
}

export function createVoiceProvider(
  provider: string,
  options: { aiServiceBaseUrl?: string; aiServiceToken?: string },
): VoiceProvider {
  if (provider.toUpperCase() !== "RVC")
    throw new Error("VOICE_PROVIDER_UNSUPPORTED");
  if (!options.aiServiceBaseUrl)
    throw new Error("VOCAL_IDENTITY_PROCESSOR_UNAVAILABLE");
  return new RvcVoiceProvider(options.aiServiceBaseUrl, options.aiServiceToken);
}
