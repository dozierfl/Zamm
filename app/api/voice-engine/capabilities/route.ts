import { env } from "cloudflare:workers";
import { apiError, requireUser } from "../../../../lib/auth";
import { appConfig, type AppBindings } from "../../../../lib/config";
import { createVoiceProvider } from "../../../../lib/voice-provider";

const bindings = env as unknown as AppBindings;

export async function GET(request: Request) {
  try {
    await requireUser(request, bindings.DATABASE_URL);
    const config = appConfig(bindings);
    if (!config.aiServiceBaseUrl)
      return Response.json({
        provider: "RVC",
        model: "RVC-v2-40k-f0",
        capabilities: {
          singingVoiceConversion: true,
          preview: true,
          training: "CLI_MANAGED",
          preservesPerformance: true,
          returnsIsolatedVocal: true,
        },
        health: { available: false, message: "Voice service is not configured" },
      });
    const provider = createVoiceProvider("RVC", config);
    return Response.json({
      provider: provider.name,
      model: provider.model,
      capabilities: provider.capabilities(),
      health: await provider.healthCheck(),
    });
  } catch (error) {
    return apiError(error);
  }
}
