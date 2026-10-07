import { appConfig, type AppBindings } from "./config";

export type LyricsTranscript = {
  lyrics: string;
  status: "DRAFT" | "UNAVAILABLE" | "FAILED" | "EMPTY";
};

export async function transcribePrivateSongLyrics(
  bytes: ArrayBuffer,
  bindings: AppBindings,
): Promise<LyricsTranscript> {
  const config = appConfig(bindings);
  if (!config.aiServiceBaseUrl) return { lyrics: "", status: "UNAVAILABLE" };
  try {
    const response = await fetch(
      `${config.aiServiceBaseUrl}/v1/lyrics-transcription-audio`,
      {
        method: "POST",
        headers: {
          "content-type": "audio/wav",
          ...(config.aiServiceToken
            ? { authorization: `Bearer ${config.aiServiceToken}` }
            : {}),
        },
        body: bytes,
      },
    );
    if (!response.ok) {
      console.warn("Private-song lyric transcription failed", response.status);
      return { lyrics: "", status: "FAILED" };
    }
    const payload = (await response.json()) as { lyrics?: unknown };
    const lyrics =
      typeof payload.lyrics === "string"
        ? payload.lyrics.trim().slice(0, 10_000)
        : "";
    return { lyrics, status: lyrics ? "DRAFT" : "EMPTY" };
  } catch {
    return { lyrics: "", status: "UNAVAILABLE" };
  }
}
