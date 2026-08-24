import { env } from "cloudflare:workers";
import { currentUser } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";
const bindings=env as unknown as AppBindings;
export async function GET(request:Request){return Response.json({user:await currentUser(request,bindings.DATABASE_URL)})}
