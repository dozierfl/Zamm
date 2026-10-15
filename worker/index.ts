/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { getSql } from "../db";
import { R2AudioStorage } from "../lib/audio-storage";
import { GenerationOrchestrator } from "../lib/generation-orchestrator";
import { createProvider } from "../lib/providers";
import { HttpVocalIdentityProcessor } from "../lib/vocal-identity-processor";
import { VoiceConversionOrchestrator } from "../lib/voice-conversion-orchestrator";
import { createVoiceProvider } from "../lib/voice-provider";

type WorkMessage =
  | { generationJobId: string }
  | { voiceConversionJobId: string };

interface Env {
  ASSETS: Fetcher;
  DATABASE_URL: string;
  MUSIC_PROVIDER?: string;
  AI_SERVICE_BASE_URL?: string;
  AI_SERVICE_TOKEN?: string;
  ACESTEP_MODEL?: string;
  MINIMAX_MODEL?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_MODEL?: string;
  KIE_API_KEY?: string;
  KIE_MODEL?: string;
  GENERATION_QUEUE: Queue<WorkMessage>;
  AUDIO: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async queue(batch:MessageBatch<WorkMessage>,env:Env):Promise<void>{const sql=getSql(env.DATABASE_URL),storage=new R2AudioStorage(env.AUDIO),providerConfig={aiServiceBaseUrl:env.AI_SERVICE_BASE_URL,aiServiceToken:env.AI_SERVICE_TOKEN,aceStepModel:env.ACESTEP_MODEL,minimaxModel:env.MINIMAX_MODEL,elevenLabsApiKey:env.ELEVENLABS_API_KEY,elevenLabsModel:env.ELEVENLABS_MODEL,kieApiKey:env.KIE_API_KEY,kieModel:env.KIE_MODEL},orchestrator=new GenerationOrchestrator(sql,storage,name=>createProvider(name,providerConfig),env.AI_SERVICE_BASE_URL?new HttpVocalIdentityProcessor(env.AI_SERVICE_BASE_URL,env.AI_SERVICE_TOKEN):undefined),voiceOrchestrator=new VoiceConversionOrchestrator(sql,storage,name=>createVoiceProvider(name,providerConfig));for(const message of batch.messages){try{if("voiceConversionJobId" in message.body)await voiceOrchestrator.process(message.body.voiceConversionJobId);else await orchestrator.process(message.body.generationJobId);message.ack()}catch(error){const code=error instanceof Error?error.message:"",retryable=Boolean(code)&&!code.includes("MASTER_ASSET_REQUIRED")&&!code.includes("PROVIDER_UNAVAILABLE")&&!code.includes("MODEL_UNAVAILABLE")&&code!=="VOICE_PROVIDER_UNSUPPORTED"&&code!=="JOB_NOT_CLAIMABLE";if(retryable)message.retry();else message.ack()}}},
};

export default worker;
