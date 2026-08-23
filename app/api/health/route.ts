import { env } from "cloudflare:workers";
import { providers } from "../../../lib/providers";
export async function GET(){const checks:{database:boolean;storage:boolean;provider:boolean}={database:false,storage:Boolean(env.AUDIO),provider:(await providers.mock.healthCheck()).available};try{await env.DB.prepare("SELECT 1 ok").first();checks.database=true}catch{checks.database=false}return Response.json({status:Object.values(checks).every(Boolean)?"ready":"degraded",checks},{status:Object.values(checks).every(Boolean)?200:503})}
