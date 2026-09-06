CREATE TYPE "public"."vocal_repair_candidate_status" AS ENUM('PENDING', 'READY', 'SELECTED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."vocal_repair_method" AS ENUM('OWNED_PUNCH_IN', 'RVC', 'SOULX_SVC');--> statement-breakpoint
CREATE TYPE "public"."vocal_repair_status" AS ENUM('AWAITING_TAKE', 'READY', 'SELECTED', 'RENDERING', 'APPLIED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "vocal_repair_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repair_session_id" uuid NOT NULL,
	"audio_asset_id" uuid,
	"method" "vocal_repair_method" NOT NULL,
	"label" text NOT NULL,
	"status" "vocal_repair_candidate_status" DEFAULT 'PENDING' NOT NULL,
	"seed" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocal_repair_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"vocal_profile_id" uuid,
	"lyric_text" text NOT NULL,
	"start_seconds" double precision NOT NULL,
	"end_seconds" double precision NOT NULL,
	"crossfade_ms" integer DEFAULT 80 NOT NULL,
	"status" "vocal_repair_status" DEFAULT 'AWAITING_TAKE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocal_repairs_region_valid" CHECK ("vocal_repair_sessions"."start_seconds">=0 and "vocal_repair_sessions"."end_seconds">"vocal_repair_sessions"."start_seconds"),
	CONSTRAINT "vocal_repairs_crossfade_valid" CHECK ("vocal_repair_sessions"."crossfade_ms" between 0 and 500)
);
--> statement-breakpoint
ALTER TABLE "vocal_repair_candidates" ADD CONSTRAINT "vocal_repair_candidates_repair_session_id_vocal_repair_sessions_id_fk" FOREIGN KEY ("repair_session_id") REFERENCES "public"."vocal_repair_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_repair_candidates" ADD CONSTRAINT "vocal_repair_candidates_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD CONSTRAINT "vocal_repair_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD CONSTRAINT "vocal_repair_sessions_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD CONSTRAINT "vocal_repair_sessions_source_version_id_song_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."song_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD CONSTRAINT "vocal_repair_sessions_vocal_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("vocal_profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocal_repair_candidates_session_idx" ON "vocal_repair_candidates" USING btree ("repair_session_id");--> statement-breakpoint
CREATE INDEX "vocal_repair_candidates_asset_idx" ON "vocal_repair_candidates" USING btree ("audio_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocal_repair_one_selected_candidate" ON "vocal_repair_candidates" USING btree ("repair_session_id") WHERE "vocal_repair_candidates"."status"='SELECTED';--> statement-breakpoint
CREATE INDEX "vocal_repairs_owner_created_idx" ON "vocal_repair_sessions" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "vocal_repairs_song_idx" ON "vocal_repair_sessions" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "vocal_repairs_source_version_idx" ON "vocal_repair_sessions" USING btree ("source_version_id");--> statement-breakpoint
CREATE INDEX "vocal_repairs_profile_idx" ON "vocal_repair_sessions" USING btree ("vocal_profile_id");