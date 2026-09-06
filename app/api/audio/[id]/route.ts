import { env } from "cloudflare:workers";
import { getSql } from "../../../../db";
import { apiError, requireUser } from "../../../../lib/auth";
import type { AppBindings } from "../../../../lib/config";

const bindings = env as unknown as AppBindings;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      rows = await getSql(bindings.DATABASE_URL)<
        { storageKey: string; mimeType: string; fileSize: number }[]
      >`
        select storage_key as "storageKey",mime_type as "mimeType",file_size as "fileSize"
        from audio_assets where id=${id} and owner_id=${user.id} limit 1
      `,
      asset = rows[0];
    if (!asset) return new Response("Not found", { status: 404 });

    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return new Response("Invalid range", { status: 416 });
      const start = match[1] ? Number(match[1]) : 0,
        end = match[2]
          ? Math.min(Number(match[2]), asset.fileSize - 1)
          : asset.fileSize - 1;
      if (start > end || start >= asset.fileSize)
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${asset.fileSize}` },
        });
      const object = await bindings.AUDIO.get(asset.storageKey, {
        range: { offset: start, length: end - start + 1 },
      });
      if (!object) return new Response("Not found", { status: 404 });

      // Materialize the requested R2 range before returning it. Browser audio
      // elements routinely cancel requests while seeking or pausing; handing
      // an open R2 stream through Vinext makes that harmless cancellation
      // surface as an Undici "terminated" development overlay.
      const bytes = await object.arrayBuffer();
      return new Response(bytes, {
        status: 206,
        headers: {
          "content-type": asset.mimeType,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${asset.fileSize}`,
          "content-length": String(bytes.byteLength),
          "cache-control": "private, max-age=3600",
        },
      });
    }

    const object = await bindings.AUDIO.get(asset.storageKey);
    if (!object) return new Response("Not found", { status: 404 });
    const bytes = await object.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.byteLength),
        "accept-ranges": "bytes",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
