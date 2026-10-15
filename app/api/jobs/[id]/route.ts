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
    const user = await requireUser(request, bindings.DATABASE_URL);
    const { id } = await params;
    const sql = getSql(bindings.DATABASE_URL);
    const rows = await sql<Record<string, unknown>[]>`
      select id,project_id as "projectId",song_id as "songId",type,status,progress,
        provider,provider_model as "providerModel",result_payload as "resultPayload",
        attempt_count as "attemptCount",max_attempts as "maxAttempts",
        next_retry_at as "nextRetryAt",heartbeat_at as "heartbeatAt",
        cancellation_requested_at as "cancellationRequestedAt",error_code as "errorCode",
        error_message as "errorMessage",error_retryable as "errorRetryable",
        started_at as "startedAt",completed_at as "completedAt",
        created_at as "createdAt",updated_at as "updatedAt"
      from jobs where id=${id} and owner_id=${user.id} limit 1
    `;
    if (!rows[0]) {
      return Response.json(
        { error: { code: "NOT_FOUND", message: "Job not found.", retryable: false } },
        { status: 404 },
      );
    }
    const events = await sql<Record<string, unknown>[]>`
      select id,type,status,progress,message,metadata,created_at as "createdAt"
      from job_events where job_id=${id} order by created_at,id
    `;
    return Response.json({ job: { ...rows[0], events } });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request, bindings.DATABASE_URL);
    const { id } = await params;
    const sql = getSql(bindings.DATABASE_URL);
    const cancelled = await sql.begin(async (tx) => {
      const rows = await tx<{ type: string }[]>`
        select type from jobs
        where id=${id} and owner_id=${user.id} and status not in ('COMPLETE','FAILED','CANCELLED')
        for update
      `;
      if (!rows[0]) return false;
      if (rows[0].type === "MUSIC_GENERATION") {
        const legacy = await tx`
          update generation_jobs
          set status=case when status='QUEUED' then 'CANCELLED' else status end,
            cancellation_requested_at=now(),updated_at=now()
          where id=${id} and user_id=${user.id} and status not in ('COMPLETE','FAILED','CANCELLED')
          returning id
        `;
        if (legacy[0]) return true;
      }
      await tx`
        update jobs set status='CANCELLED',cancellation_requested_at=now(),updated_at=now()
        where id=${id} and owner_id=${user.id}
      `;
      await tx`
        insert into job_events(job_id,type,status,progress,message,metadata)
        select id,'CANCELLED','CANCELLED',progress,'Cancellation requested','{}'::jsonb
        from jobs where id=${id} and owner_id=${user.id}
      `;
      return true;
    });
    return Response.json({ cancelled });
  } catch (error) {
    return apiError(error);
  }
}
