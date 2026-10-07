import { env } from "cloudflare:workers";
import { getSql } from "../../../../../../db";
import { apiError, requireUser } from "../../../../../../lib/auth";
import type { AppBindings } from "../../../../../../lib/config";
import { transcribePrivateSongLyrics } from "../../../../../../lib/lyrics-transcription";

const bindings = env as unknown as AppBindings;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      sql = getSql(bindings.DATABASE_URL),
      assets = await sql<{ storageKey: string }[]>`
        select a.storage_key as "storageKey"
        from songs s
        join song_versions v on v.song_id=s.id
        join audio_assets a on a.id=v.audio_asset_id and a.owner_id=${user.id}
        where s.id=${id} and s.user_id=${user.id} and s.archived_at is null
        order by v.version_number desc
        limit 1
      `,
      asset = assets[0];
    if (!asset) throw new Error("SONG_NOT_FOUND");
    const object = await bindings.AUDIO.get(asset.storageKey);
    if (!object) throw new Error("SOURCE_AUDIO_MISSING");
    const transcript = await transcribePrivateSongLyrics(
      await object.arrayBuffer(),
      bindings,
    );
    if (transcript.status !== "DRAFT")
      return Response.json(
        {
          error: {
            code: "LYRICS_TRANSCRIPTION_UNAVAILABLE",
            message:
              "Dozi could not detect lyrics right now. Confirm the local AI gateway is running and try again.",
            retryable: true,
          },
        },
        { status: 503 },
      );
    await sql.begin(async (tx) => {
      await tx`update songs set lyrics=${transcript.lyrics} where id=${id} and user_id=${user.id}`;
      await tx`update song_versions set lyrics=${transcript.lyrics} where song_id=${id}`;
    });
    return Response.json({ lyrics: transcript.lyrics, status: transcript.status });
  } catch (error) {
    return apiError(error);
  }
}
