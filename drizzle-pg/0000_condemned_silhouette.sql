CREATE TYPE "public"."audio_asset_role" AS ENUM('MASTER', 'PREMASTER', 'NATIVE_TRACK', 'DERIVED_STEM', 'EFFECT_RETURN', 'ALTERNATIVE', 'REFERENCE', 'UPLOAD');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('QUEUED', 'PREPARING', 'GENERATING', 'POST_PROCESSING', 'UPLOADING', 'COMPLETE', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."generation_provenance" AS ENUM('GENERATED_NATIVE', 'SEPARATED', 'RENDERED', 'UPLOADED', 'REFERENCE', 'DERIVED');--> statement-breakpoint
CREATE TABLE "audio_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"generation_job_id" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"codec" text NOT NULL,
	"sample_rate" integer NOT NULL,
	"bit_depth" integer NOT NULL,
	"channels" integer NOT NULL,
	"duration_seconds" double precision NOT NULL,
	"file_size" integer NOT NULL,
	"checksum" text NOT NULL,
	"waveform_data" jsonb NOT NULL,
	"analysis_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"reserved_version_number" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation_type" text DEFAULT 'GENERATE' NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"status" "generation_status" DEFAULT 'QUEUED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"request_payload" jsonb NOT NULL,
	"composition_plan" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"cancellation_requested_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"error_retryable" boolean,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_progress_range" CHECK ("generation_jobs"."progress" between 0 and 100),
	CONSTRAINT "jobs_attempts_valid" CHECK ("generation_jobs"."attempt_count">=0 and "generation_jobs"."max_attempts">0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"song_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"generation_job_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"audio_asset_id" uuid,
	"duration_seconds" double precision NOT NULL,
	"bpm" integer NOT NULL,
	"musical_key" text NOT NULL,
	"scale" text NOT NULL,
	"lyrics" text NOT NULL,
	"prompt" text NOT NULL,
	"style_prompt" text NOT NULL,
	"composition_plan" jsonb NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"lyrics" text DEFAULT '' NOT NULL,
	"is_instrumental" boolean DEFAULT false NOT NULL,
	"next_version_number" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_next_version_positive" CHECK ("songs"."next_version_number">0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"song_version_id" uuid NOT NULL,
	"audio_asset_id" uuid NOT NULL,
	"role" "audio_asset_role" NOT NULL,
	"instrument" text,
	"instrument_group" text,
	"source_type" "generation_provenance" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"timeline_start_seconds" double precision DEFAULT 0 NOT NULL,
	"source_start_seconds" double precision DEFAULT 0 NOT NULL,
	"source_end_seconds" double precision,
	"gain_db" double precision DEFAULT 0 NOT NULL,
	"pan" double precision DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_assets_pan_range" CHECK ("version_assets"."pan" between -1 and 1)
);
--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_generation_job_id_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_parent_version_id_song_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."song_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_generation_job_id_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_assets" ADD CONSTRAINT "version_assets_song_version_id_song_versions_id_fk" FOREIGN KEY ("song_version_id") REFERENCES "public"."song_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_assets" ADD CONSTRAINT "version_assets_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_storage_key_unique" ON "audio_assets" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "audio_job_checksum_unique" ON "audio_assets" USING btree ("generation_job_id","checksum");--> statement-breakpoint
CREATE INDEX "audio_owner_idx" ON "audio_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "audio_generation_job_idx" ON "audio_assets" USING btree ("generation_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_idempotency_unique" ON "generation_jobs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_version_id_unique" ON "generation_jobs" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "jobs_user_status_created_idx" ON "generation_jobs" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "jobs_song_idx" ON "generation_jobs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "projects_user_created_idx" ON "projects" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_song_number_unique" ON "song_versions" USING btree ("song_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "versions_job_unique" ON "song_versions" USING btree ("generation_job_id");--> statement-breakpoint
CREATE INDEX "versions_song_created_idx" ON "song_versions" USING btree ("song_id","created_at");--> statement-breakpoint
CREATE INDEX "versions_parent_idx" ON "song_versions" USING btree ("parent_version_id");--> statement-breakpoint
CREATE INDEX "songs_user_created_idx" ON "songs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "songs_project_idx" ON "songs" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "version_assets_version_asset_unique" ON "version_assets" USING btree ("song_version_id","audio_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "version_assets_primary_master_unique" ON "version_assets" USING btree ("song_version_id","role") WHERE "version_assets"."is_primary"=true and "version_assets"."role"='MASTER';--> statement-breakpoint
CREATE INDEX "version_assets_version_sort_idx" ON "version_assets" USING btree ("song_version_id","sort_order");--> statement-breakpoint
CREATE INDEX "version_assets_role_idx" ON "version_assets" USING btree ("role");--> statement-breakpoint
CREATE INDEX "version_assets_instrument_idx" ON "version_assets" USING btree ("instrument");