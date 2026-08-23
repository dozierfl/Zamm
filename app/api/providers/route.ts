import { providers } from "../../../lib/providers";
export async function GET(){const result=await Promise.all(Object.values(providers).map(async p=>({name:p.name,model:p.model,capabilities:p.capabilities(),health:await p.healthCheck()})));return Response.json({providers:result,selected:"mock"})}
