import { env } from "cloudflare:workers";
import { getSql } from "../../../db";
import { createProvider } from "../../../lib/providers";
import type { AppBindings } from "../../../lib/config";
const bindings=env as unknown as AppBindings;
export async function GET(){const provider=createProvider(bindings.MUSIC_PROVIDER||"mock",{aiServiceBaseUrl:bindings.AI_SERVICE_BASE_URL,aiServiceToken:bindings.AI_SERVICE_TOKEN,aceStepModel:bindings.ACESTEP_MODEL,minimaxModel:bindings.MINIMAX_MODEL,elevenLabsApiKey:bindings.ELEVENLABS_API_KEY,elevenLabsModel:bindings.ELEVENLABS_MODEL}),checks={database:false,storage:Boolean(bindings.AUDIO),queue:Boolean(bindings.GENERATION_QUEUE),provider:(await provider.healthCheck()).available};try{await getSql(bindings.DATABASE_URL)`select 1`;checks.database=true}catch{checks.database=false}const ready=checks.database&&checks.storage&&checks.provider;return Response.json({status:ready?"ready":"degraded",checks},{status:ready?200:503})}
