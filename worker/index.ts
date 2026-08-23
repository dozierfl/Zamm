/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { getSql } from "../db";
import { R2AudioStorage } from "../lib/audio-storage";
import { GenerationOrchestrator } from "../lib/generation-orchestrator";
import { createProvider } from "../lib/providers";

interface Env {
  ASSETS: Fetcher;
  DATABASE_URL: string;
  MUSIC_PROVIDER?: string;
  AI_SERVICE_BASE_URL?: string;
  AI_SERVICE_TOKEN?: string;
  ACESTEP_MODEL?: string;
  GENERATION_QUEUE: Queue<{ generationJobId: string }>;
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
  async queue(batch:MessageBatch<{generationJobId:string}>,env:Env):Promise<void>{const orchestrator=new GenerationOrchestrator(getSql(env.DATABASE_URL),new R2AudioStorage(env.AUDIO),name=>createProvider(name,{aiServiceBaseUrl:env.AI_SERVICE_BASE_URL,aiServiceToken:env.AI_SERVICE_TOKEN,aceStepModel:env.ACESTEP_MODEL}));for(const message of batch.messages){try{await orchestrator.process(message.body.generationJobId);message.ack()}catch(error){const retryable=error instanceof Error&&!error.message.includes("MASTER_ASSET_REQUIRED")&&!error.message.includes("PROVIDER_UNAVAILABLE");if(retryable)message.retry();else message.ack()}}},
};

export default worker;
