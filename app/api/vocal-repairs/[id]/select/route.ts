import { env } from "cloudflare:workers";
import { z } from "zod";
import { getSql } from "../../../../../db";
import { apiError, requireUser } from "../../../../../lib/auth";
import type { AppBindings } from "../../../../../lib/config";

const bindings = env as unknown as AppBindings;
const selectSchema = z.object({ candidateId: z.string().uuid() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL),
      { id } = await params,
      input = selectSchema.safeParse(await request.json());
    if (!input.success) throw new Error("INVALID_VOCAL_REPAIR");
    const sql = getSql(bindings.DATABASE_URL),
      candidates = await sql<{ id: string }[]>`
        select c.id
        from vocal_repair_candidates c
        join vocal_repair_sessions r on r.id=c.repair_session_id
        where c.id=${input.data.candidateId} and c.repair_session_id=${id}
          and c.audio_asset_id is not null and c.status in ('READY','SELECTED')
          and r.owner_id=${user.id} and r.status not in ('APPLIED','CANCELLED')
        limit 1
      `;
    if (!candidates[0])
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Repair take not found.", retryable: false } },
        { status: 404 },
      );
    await sql.begin(async (tx) => {
      await tx`
        update vocal_repair_candidates
        set status=case
          when id=${input.data.candidateId} then 'SELECTED'::vocal_repair_candidate_status
          when status='SELECTED' then 'READY'::vocal_repair_candidate_status
          else status end
        where repair_session_id=${id}
      `;
      await tx`
        update vocal_repair_sessions set status='SELECTED',updated_at=now()
        where id=${id} and owner_id=${user.id}
      `;
    });
    return Response.json({ selection: { repairId: id, candidateId: candidates[0].id } });
  } catch (error) {
    return apiError(error);
  }
}
