CREATE TYPE "public"."vocal_model_version_status" AS ENUM('PENDING', 'TRAINING', 'READY', 'FAILED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."vocal_profile_status" AS ENUM('DRAFT', 'COLLECTING', 'READY', 'TRAINING', 'ACTIVE', 'FAILED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."vocal_source_type" AS ENUM('LIVE_SINGING', 'LIVE_SPEECH', 'OWNED_VOCAL_BOUNCE', 'SEPARATED_OWNED_MIX');--> statement-breakpoint
CREATE TYPE "public"."vocal_training_status" AS ENUM('QUEUED', 'PREPARING', 'TRAINING', 'VALIDATING', 'COMPLETE', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."vocal_verification_status" AS ENUM('PENDING', 'PASSED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "artist_vocal_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "vocal_profile_status" DEFAULT 'DRAFT' NOT NULL,
	"is_private" boolean DEFAULT true NOT NULL,
	"usable_singing_seconds" double precision DEFAULT 0 NOT NULL,
	"quality_score" double precision,
	"range_low_midi" integer,
	"range_high_midi" integer,
	"consent_policy_version" text,
	"consented_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocal_profiles_quality_range" CHECK ("artist_vocal_profiles"."quality_score" is null or "artist_vocal_profiles"."quality_score" between 0 and 100),
	CONSTRAINT "vocal_profiles_duration_nonnegative" CHECK ("artist_vocal_profiles"."usable_singing_seconds">=0),
	CONSTRAINT "vocal_profiles_midi_range" CHECK (("artist_vocal_profiles"."range_low_midi" is null or "artist_vocal_profiles"."range_low_midi" between 0 and 127) and ("artist_vocal_profiles"."range_high_midi" is null or "artist_vocal_profiles"."range_high_midi" between 0 and 127) and ("artist_vocal_profiles"."range_low_midi" is null or "artist_vocal_profiles"."range_high_midi" is null or "artist_vocal_profiles"."range_low_midi"<="artist_vocal_profiles"."range_high_midi"))
);
--> statement-breakpoint
CREATE TABLE "vocal_identity_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"challenge_hash" text NOT NULL,
	"spoken_audio_asset_id" uuid,
	"status" "vocal_verification_status" DEFAULT 'PENDING' NOT NULL,
	"speaker_similarity" double precision,
	"phrase_match_score" double precision,
	"liveness_score" double precision,
	"attempted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocal_verifications_score_range" CHECK (("vocal_identity_verifications"."speaker_similarity" is null or "vocal_identity_verifications"."speaker_similarity" between 0 and 1) and ("vocal_identity_verifications"."phrase_match_score" is null or "vocal_identity_verifications"."phrase_match_score" between 0 and 1) and ("vocal_identity_verifications"."liveness_score" is null or "vocal_identity_verifications"."liveness_score" between 0 and 1))
);
--> statement-breakpoint
CREATE TABLE "vocal_profile_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"audio_asset_id" uuid NOT NULL,
	"source_type" "vocal_source_type" NOT NULL,
	"original_filename" text,
	"duration_seconds" double precision NOT NULL,
	"usable_duration_seconds" double precision DEFAULT 0 NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"quality_score" double precision,
	"quality_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"range_low_midi" integer,
	"range_high_midi" integer,
	"rights_attested" boolean DEFAULT false NOT NULL,
	"consent_policy_version" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"included_in_training" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocal_sources_duration_valid" CHECK ("vocal_profile_sources"."duration_seconds">0 and "vocal_profile_sources"."usable_duration_seconds">=0 and "vocal_profile_sources"."usable_duration_seconds"<="vocal_profile_sources"."duration_seconds"),
	CONSTRAINT "vocal_sources_quality_range" CHECK ("vocal_profile_sources"."quality_score" is null or "vocal_profile_sources"."quality_score" between 0 and 100),
	CONSTRAINT "vocal_sources_midi_range" CHECK (("vocal_profile_sources"."range_low_midi" is null or "vocal_profile_sources"."range_low_midi" between 0 and 127) and ("vocal_profile_sources"."range_high_midi" is null or "vocal_profile_sources"."range_high_midi" between 0 and 127) and ("vocal_profile_sources"."range_low_midi" is null or "vocal_profile_sources"."range_high_midi" is null or "vocal_profile_sources"."range_low_midi"<="vocal_profile_sources"."range_high_midi"))
);
--> statement-breakpoint
CREATE TABLE "vocal_profile_training_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"status" "vocal_training_status" DEFAULT 'QUEUED' NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"error_retryable" boolean,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocal_training_progress_range" CHECK ("vocal_profile_training_jobs"."progress" between 0 and 100),
	CONSTRAINT "vocal_training_attempts_valid" CHECK ("vocal_profile_training_jobs"."attempt_count">=0 and "vocal_profile_training_jobs"."max_attempts">0)
);
--> statement-breakpoint
CREATE TABLE "vocal_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "vocal_model_version_status" DEFAULT 'PENDING' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"provider_model_ref" text,
	"source_manifest_checksum" text NOT NULL,
	"training_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "vocal_versions_profile_id_unique" UNIQUE("profile_id","id"),
	CONSTRAINT "vocal_versions_number_positive" CHECK ("vocal_profile_versions"."version_number">0)
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "vocal_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "vocal_profile_version_id" uuid;--> statement-breakpoint
ALTER TABLE "song_versions" ADD COLUMN "vocal_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "song_versions" ADD COLUMN "vocal_profile_version_id" uuid;--> statement-breakpoint
ALTER TABLE "artist_vocal_profiles" ADD CONSTRAINT "artist_vocal_profiles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_identity_verifications" ADD CONSTRAINT "vocal_identity_verifications_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_identity_verifications" ADD CONSTRAINT "vocal_identity_verifications_spoken_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("spoken_audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_profile_sources" ADD CONSTRAINT "vocal_profile_sources_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_profile_sources" ADD CONSTRAINT "vocal_profile_sources_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_profile_training_jobs" ADD CONSTRAINT "vocal_profile_training_jobs_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_profile_training_jobs" ADD CONSTRAINT "vocal_training_profile_version_fk" FOREIGN KEY ("profile_id","profile_version_id") REFERENCES "public"."vocal_profile_versions"("profile_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_profile_versions" ADD CONSTRAINT "vocal_profile_versions_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vocal_profiles_owner_name_unique" ON "artist_vocal_profiles" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "vocal_profiles_owner_status_idx" ON "artist_vocal_profiles" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "vocal_verifications_profile_status_idx" ON "vocal_identity_verifications" USING btree ("profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vocal_sources_profile_asset_unique" ON "vocal_profile_sources" USING btree ("profile_id","audio_asset_id");--> statement-breakpoint
CREATE INDEX "vocal_sources_profile_type_idx" ON "vocal_profile_sources" USING btree ("profile_id","source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "vocal_training_version_unique" ON "vocal_profile_training_jobs" USING btree ("profile_version_id");--> statement-breakpoint
CREATE INDEX "vocal_training_profile_status_idx" ON "vocal_profile_training_jobs" USING btree ("profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vocal_versions_profile_number_unique" ON "vocal_profile_versions" USING btree ("profile_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "vocal_versions_active_unique" ON "vocal_profile_versions" USING btree ("profile_id") WHERE "vocal_profile_versions"."is_active"=true;--> statement-breakpoint
CREATE INDEX "vocal_versions_profile_status_idx" ON "vocal_profile_versions" USING btree ("profile_id","status");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_vocal_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("vocal_profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "jobs_vocal_profile_version_fk" FOREIGN KEY ("vocal_profile_id","vocal_profile_version_id") REFERENCES "public"."vocal_profile_versions"("profile_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_vocal_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("vocal_profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "versions_vocal_profile_version_fk" FOREIGN KEY ("vocal_profile_id","vocal_profile_version_id") REFERENCES "public"."vocal_profile_versions"("profile_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_vocal_profile_idx" ON "generation_jobs" USING btree ("vocal_profile_id");--> statement-breakpoint
CREATE INDEX "versions_vocal_profile_idx" ON "song_versions" USING btree ("vocal_profile_id");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "jobs_vocal_version_requires_profile" CHECK ("generation_jobs"."vocal_profile_version_id" is null or "generation_jobs"."vocal_profile_id" is not null);--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "versions_vocal_version_requires_profile" CHECK ("song_versions"."vocal_profile_version_id" is null or "song_versions"."vocal_profile_id" is not null);