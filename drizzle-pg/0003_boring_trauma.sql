ALTER TABLE "song_versions" DROP CONSTRAINT "song_versions_generation_job_id_generation_jobs_id_fk";
--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_generation_job_id_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;