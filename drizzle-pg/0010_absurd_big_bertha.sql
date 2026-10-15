CREATE TYPE "public"."voice_conversion_mode" AS ENUM('PREVIEW', 'FULL');--> statement-breakpoint
CREATE TABLE "voice_conversion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid,
	"profile_id" uuid NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"output_master_asset_id" uuid,
	"output_vocal_asset_id" uuid,
	"mode" "voice_conversion_mode" DEFAULT 'FULL' NOT NULL,
	"voice_identity_strength" double precision DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_conversion_strength_range" CHECK ("voice_conversion_runs"."voice_identity_strength" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "voice_model_artifacts" ADD COLUMN "provider_ref" text;--> statement-breakpoint
UPDATE "voice_model_artifacts"
SET "provider_ref"=coalesce("metadata"->>'providerRef',"storage_key")
WHERE "provider_ref" IS NULL;--> statement-breakpoint
ALTER TABLE "voice_model_artifacts" ALTER COLUMN "provider_ref" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_source_asset_id_audio_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_output_master_asset_id_audio_assets_id_fk" FOREIGN KEY ("output_master_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_runs_output_vocal_asset_id_audio_assets_id_fk" FOREIGN KEY ("output_vocal_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversion_runs" ADD CONSTRAINT "voice_conversion_profile_version_fk" FOREIGN KEY ("profile_id","profile_version_id") REFERENCES "public"."vocal_profile_versions"("profile_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_conversion_runs_job_unique" ON "voice_conversion_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "voice_conversion_runs_owner_created_idx" ON "voice_conversion_runs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "voice_conversion_runs_profile_idx" ON "voice_conversion_runs" USING btree ("profile_id");
