import { env } from "cloudflare:workers";
import type { AppBindings } from "../../../lib/config";
import { createProvider } from "../../../lib/providers";
const bindings=env as unknown as AppBindings;
export async function GET(){const selected=bindings.MUSIC_PROVIDER||"mock",provider=createProvider(selected,{aiServiceBaseUrl:bindings.AI_SERVICE_BASE_URL,aiServiceToken:bindings.AI_SERVICE_TOKEN,aceStepModel:bindings.ACESTEP_MODEL,minimaxModel:bindings.MINIMAX_MODEL,elevenLabsApiKey:bindings.ELEVENLABS_API_KEY,elevenLabsModel:bindings.ELEVENLABS_MODEL}),result=[{name:provider.name,model:provider.model,capabilities:provider.capabilities(),health:await provider.healthCheck()}];return Response.json({providers:result,selected})}
