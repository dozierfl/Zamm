import type { GeneratedAsset, GenerationResult } from "./domain";

export type VocalIdentitySelection = {
  profileId: string;
  profileVersionId: string;
  modelRef: string;
  indexRef: string;
};

export type VocalIdentityProcessingRequest = VocalIdentitySelection & {
  jobId: string;
  source: GeneratedAsset;
};

export interface VocalIdentityProcessor {
  apply(request: VocalIdentityProcessingRequest): Promise<GenerationResult>;
}

export class HttpVocalIdentityProcessor implements VocalIdentityProcessor {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async apply(request: VocalIdentityProcessingRequest): Promise<GenerationResult> {
    const bytes = request.source.audio.bytes;
    if (!bytes) throw new Error("VOCAL_IDENTITY_SOURCE_MISSING");
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/artist-vocal-conversion`, {
        method: "POST",
        headers: {
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jobId: request.jobId,
          profileId: request.profileId,
          profileVersionId: request.profileVersionId,
          modelRef: request.modelRef,
          indexRef: request.indexRef,
          sourceMimeType: request.source.metadata.mimeType,
          sourceAudioBase64: bytesToBase64(bytes),
        }),
      });
    } catch {
      throw new Error("VOCAL_IDENTITY_PROCESSOR_UNAVAILABLE");
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        detail?: { code?: string };
      } | null;
      throw new Error(body?.detail?.code || "VOCAL_IDENTITY_CONVERSION_FAILED");
    }
    const body = (await response.json()) as {
      assets?: Array<
        Omit<GeneratedAsset, "audio"> & { audio: { base64?: string } }
      >;
      providerMetadata?: Record<string, unknown>;
    };
    if (!body.assets?.length) throw new Error("VOCAL_IDENTITY_INVALID_RESULT");
    return {
      providerMetadata: body.providerMetadata,
      assets: body.assets.map((asset) => {
        if (!asset.audio.base64)
          throw new Error("VOCAL_IDENTITY_INVALID_RESULT");
        return {
          ...asset,
          audio: { bytes: base64ToBytes(asset.audio.base64) },
        };
      }),
    };
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32_768)
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
