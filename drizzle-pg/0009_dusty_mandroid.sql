CREATE TYPE "public"."job_event_type" AS ENUM('STATUS', 'PROGRESS', 'RETRY', 'ERROR', 'RESULT', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('MUSIC_GENERATION', 'STEM_SEPARATION', 'LYRICS_TRANSCRIPTION', 'VOICE_ANALYSIS', 'VOICE_TRAINING', 'VOICE_CONVERSION', 'MIX_RENDER', 'TRACK_REPLACEMENT', 'PHRASE_REPAIR', 'EXPORT');--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('OWNER', 'ADMIN', 'EDITOR', 'VOCALIST', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."track_role" AS ENUM('LEAD_VOCAL', 'BACKGROUND_VOCAL', 'HARMONY_VOCAL', 'GUIDE_VOCAL', 'INSTRUMENT', 'BUS', 'MASTER', 'REFERENCE');--> statement-breakpoint
CREATE TYPE "public"."voice_artifact_kind" AS ENUM('CHECKPOINT', 'INDEX', 'MANIFEST', 'CONFIG');--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"type" "job_event_type" NOT NULL,
	"status" "generation_status",
	"progress" integer,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_events_progress_range" CHECK ("job_events"."progress" is null or "job_events"."progress" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid,
	"song_id" uuid,
	"type" "job_type" NOT NULL,
	"status" "generation_status" DEFAULT 'QUEUED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider" text,
	"provider_model" text,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"cancellation_requested_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"error_retryable" boolean,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_progress_range" CHECK ("jobs"."progress" between 0 and 100),
	CONSTRAINT "jobs_attempts_valid" CHECK ("jobs"."attempt_count">=0 and "jobs"."max_attempts">0)
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "project_role" DEFAULT 'VIEWER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_version_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_version_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"audio_asset_id" uuid NOT NULL,
	"source_asset_id" uuid,
	"generation_method" "track_generation_method" DEFAULT 'FULL_SONG' NOT NULL,
	"source_type" "generation_provenance" NOT NULL,
	"timeline_start_seconds" double precision DEFAULT 0 NOT NULL,
	"source_start_seconds" double precision DEFAULT 0 NOT NULL,
	"source_end_seconds" double precision,
	"gain_db" double precision DEFAULT 0 NOT NULL,
	"pan" double precision DEFAULT 0 NOT NULL,
	"is_muted" boolean DEFAULT false NOT NULL,
	"is_solo" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_version_tracks_pan_range" CHECK ("song_version_tracks"."pan" between -1 and 1)
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"role" "track_role" NOT NULL,
	"name" text NOT NULL,
	"instrument" text,
	"instrument_group" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_model_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"kind" "voice_artifact_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" text NOT NULL,
	"file_size" integer NOT NULL,
	"encryption_key_version" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "voice_artifacts_file_size_positive" CHECK ("voice_model_artifacts"."file_size">0)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_version_tracks" ADD CONSTRAINT "song_version_tracks_song_version_id_song_versions_id_fk" FOREIGN KEY ("song_version_id") REFERENCES "public"."song_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_version_tracks" ADD CONSTRAINT "song_version_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_version_tracks" ADD CONSTRAINT "song_version_tracks_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_version_tracks" ADD CONSTRAINT "song_version_tracks_source_asset_id_audio_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_model_artifacts" ADD CONSTRAINT "voice_model_artifacts_profile_version_id_vocal_profile_versions_id_fk" FOREIGN KEY ("profile_version_id") REFERENCES "public"."vocal_profile_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_events_job_created_idx" ON "job_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_owner_idempotency_unique" ON "jobs" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_owner_status_created_idx" ON "jobs" USING btree ("owner_id","status","created_at");--> statement-breakpoint
CREATE INDEX "jobs_project_created_idx" ON "jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "jobs_song_created_idx" ON "jobs" USING btree ("song_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_unique" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_idx" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_members_project_role_idx" ON "project_members" USING btree ("project_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "song_version_tracks_version_track_unique" ON "song_version_tracks" USING btree ("song_version_id","track_id");--> statement-breakpoint
CREATE INDEX "song_version_tracks_version_idx" ON "song_version_tracks" USING btree ("song_version_id");--> statement-breakpoint
CREATE INDEX "song_version_tracks_track_idx" ON "song_version_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "song_version_tracks_asset_idx" ON "song_version_tracks" USING btree ("audio_asset_id");--> statement-breakpoint
CREATE INDEX "tracks_song_sort_idx" ON "tracks" USING btree ("song_id","sort_order");--> statement-breakpoint
CREATE INDEX "tracks_song_role_idx" ON "tracks" USING btree ("song_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_artifacts_storage_key_unique" ON "voice_model_artifacts" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_artifacts_version_kind_checksum_unique" ON "voice_model_artifacts" USING btree ("profile_version_id","kind","checksum");--> statement-breakpoint
CREATE INDEX "voice_artifacts_version_kind_idx" ON "voice_model_artifacts" USING btree ("profile_version_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_one_personal_per_user" ON "projects" USING btree ("user_id") WHERE "projects"."is_personal"=true;
--> statement-breakpoint
INSERT INTO "projects" ("id","user_id","title","description","is_personal","created_at","updated_at")
SELECT gen_random_uuid(),u."id",concat(u."display_name",'''s Studio'),'',true,now(),now()
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."user_id"=u."id" AND p."is_personal"=true);
--> statement-breakpoint
INSERT INTO "project_members" ("project_id","user_id","role")
SELECT p."id",p."user_id",'OWNER' FROM "projects" p
ON CONFLICT ("project_id","user_id") DO UPDATE SET "role"='OWNER',"updated_at"=now();
--> statement-breakpoint
UPDATE "songs" s SET "project_id"=p."id","updated_at"=now()
FROM "projects" p
WHERE s."project_id" IS NULL AND p."user_id"=s."user_id" AND p."is_personal"=true;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION dozi_create_personal_project() RETURNS trigger AS $$
DECLARE project_uuid uuid := gen_random_uuid();
BEGIN
  INSERT INTO "projects" ("id","user_id","title","description","is_personal")
  VALUES (project_uuid,NEW."id",concat(NEW."display_name",'''s Studio'),'',true);
  INSERT INTO "project_members" ("project_id","user_id","role") VALUES (project_uuid,NEW."id",'OWNER');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER users_create_personal_project AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION dozi_create_personal_project();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION dozi_assign_personal_project() RETURNS trigger AS $$
BEGIN
  IF NEW."project_id" IS NULL THEN
    SELECT p."id" INTO NEW."project_id" FROM "projects" p
    WHERE p."user_id"=NEW."user_id" AND p."is_personal"=true LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER songs_assign_personal_project BEFORE INSERT ON "songs"
FOR EACH ROW EXECUTE FUNCTION dozi_assign_personal_project();
--> statement-breakpoint
INSERT INTO "jobs" (
  "id","owner_id","project_id","song_id","type","status","progress","idempotency_key",
  "provider","provider_model","request_payload","result_payload","attempt_count","max_attempts",
  "last_attempt_at","next_retry_at","cancellation_requested_at","error_code","error_message",
  "error_retryable","started_at","completed_at","created_at","updated_at"
)
SELECT gj."id",gj."user_id",s."project_id",gj."song_id",
  CASE gj."operation_type"
    WHEN 'MIX_RENDER' THEN 'MIX_RENDER'::"job_type"
    WHEN 'TRACK_REPLACE' THEN 'TRACK_REPLACEMENT'::"job_type"
    WHEN 'IMPORT_VOCAL_REPAIR_SOURCE' THEN 'PHRASE_REPAIR'::"job_type"
    ELSE 'MUSIC_GENERATION'::"job_type"
  END,
  gj."status",gj."progress",gj."idempotency_key",gj."provider",gj."provider_model",
  gj."request_payload",jsonb_build_object('versionId',gj."version_id"),gj."attempt_count",gj."max_attempts",
  gj."last_attempt_at",gj."next_retry_at",gj."cancellation_requested_at",gj."error_code",gj."error_message",
  gj."error_retryable",gj."started_at",gj."completed_at",gj."created_at",gj."updated_at"
FROM "generation_jobs" gj JOIN "songs" s ON s."id"=gj."song_id"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "job_events" ("job_id","type","status","progress","message","metadata","created_at")
SELECT j."id",
  CASE WHEN j."status"='FAILED' THEN 'ERROR'::"job_event_type"
       WHEN j."status"='CANCELLED' THEN 'CANCELLED'::"job_event_type"
       WHEN j."status"='COMPLETE' THEN 'RESULT'::"job_event_type"
       ELSE 'STATUS'::"job_event_type" END,
  j."status",j."progress",j."error_message",jsonb_build_object('backfilled',true),j."updated_at"
FROM "jobs" j;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION dozi_sync_generation_job() RETURNS trigger AS $$
DECLARE event_kind "job_event_type";
BEGIN
  INSERT INTO "jobs" (
    "id","owner_id","project_id","song_id","type","status","progress","idempotency_key",
    "provider","provider_model","request_payload","result_payload","attempt_count","max_attempts",
    "last_attempt_at","next_retry_at","heartbeat_at","cancellation_requested_at","error_code","error_message",
    "error_retryable","started_at","completed_at","created_at","updated_at"
  ) VALUES (
    NEW."id",NEW."user_id",(SELECT s."project_id" FROM "songs" s WHERE s."id"=NEW."song_id"),NEW."song_id",
    CASE NEW."operation_type"
      WHEN 'MIX_RENDER' THEN 'MIX_RENDER'::"job_type"
      WHEN 'TRACK_REPLACE' THEN 'TRACK_REPLACEMENT'::"job_type"
      WHEN 'IMPORT_VOCAL_REPAIR_SOURCE' THEN 'PHRASE_REPAIR'::"job_type"
      ELSE 'MUSIC_GENERATION'::"job_type"
    END,
    NEW."status",NEW."progress",NEW."idempotency_key",NEW."provider",NEW."provider_model",
    NEW."request_payload",jsonb_build_object('versionId',NEW."version_id"),NEW."attempt_count",NEW."max_attempts",
    NEW."last_attempt_at",NEW."next_retry_at",now(),NEW."cancellation_requested_at",NEW."error_code",NEW."error_message",
    NEW."error_retryable",NEW."started_at",NEW."completed_at",NEW."created_at",NEW."updated_at"
  )
  ON CONFLICT ("id") DO UPDATE SET
    "project_id"=EXCLUDED."project_id","song_id"=EXCLUDED."song_id","type"=EXCLUDED."type",
    "status"=EXCLUDED."status","progress"=EXCLUDED."progress","provider"=EXCLUDED."provider",
    "provider_model"=EXCLUDED."provider_model","request_payload"=EXCLUDED."request_payload",
    "result_payload"=EXCLUDED."result_payload","attempt_count"=EXCLUDED."attempt_count",
    "max_attempts"=EXCLUDED."max_attempts","last_attempt_at"=EXCLUDED."last_attempt_at",
    "next_retry_at"=EXCLUDED."next_retry_at","heartbeat_at"=EXCLUDED."heartbeat_at",
    "cancellation_requested_at"=EXCLUDED."cancellation_requested_at","error_code"=EXCLUDED."error_code",
    "error_message"=EXCLUDED."error_message","error_retryable"=EXCLUDED."error_retryable",
    "started_at"=EXCLUDED."started_at","completed_at"=EXCLUDED."completed_at","updated_at"=EXCLUDED."updated_at";

  IF TG_OP='INSERT' THEN
    event_kind := 'STATUS';
  ELSIF NEW."status"='FAILED' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    event_kind := 'ERROR';
  ELSIF NEW."status"='CANCELLED' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    event_kind := 'CANCELLED';
  ELSIF NEW."status"='COMPLETE' AND OLD."status" IS DISTINCT FROM NEW."status" THEN
    event_kind := 'RESULT';
  ELSIF NEW."cancellation_requested_at" IS NOT NULL
    AND OLD."cancellation_requested_at" IS DISTINCT FROM NEW."cancellation_requested_at" THEN
    event_kind := 'CANCELLED';
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    event_kind := 'STATUS';
  ELSIF OLD."attempt_count" IS DISTINCT FROM NEW."attempt_count" THEN
    event_kind := 'RETRY';
  ELSIF OLD."progress" IS DISTINCT FROM NEW."progress" THEN
    event_kind := 'PROGRESS';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO "job_events" ("job_id","type","status","progress","message","metadata")
  VALUES (NEW."id",event_kind,NEW."status",NEW."progress",
    CASE WHEN event_kind='CANCELLED' AND NEW."status"<>'CANCELLED' THEN 'Cancellation requested'
         ELSE NEW."error_message" END,
    jsonb_build_object('versionId',NEW."version_id",'operationType',NEW."operation_type"));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER generation_jobs_sync_foundation AFTER INSERT OR UPDATE ON "generation_jobs"
FOR EACH ROW EXECUTE FUNCTION dozi_sync_generation_job();
--> statement-breakpoint
INSERT INTO "tracks" ("id","song_id","role","name","instrument","instrument_group","sort_order","created_at","updated_at")
SELECT va."id",sv."song_id",
  CASE WHEN va."role"='MASTER' THEN 'MASTER'::"track_role"
       WHEN va."role"='REFERENCE' THEN 'REFERENCE'::"track_role"
       WHEN coalesce(va."instrument_group",'') ILIKE '%vocal%' THEN 'LEAD_VOCAL'::"track_role"
       WHEN va."role" IN ('PREMASTER','EFFECT_RETURN','ALTERNATIVE') THEN 'BUS'::"track_role"
       ELSE 'INSTRUMENT'::"track_role" END,
  coalesce(va."instrument",initcap(replace(va."role"::text,'_',' '))),va."instrument",va."instrument_group",
  va."sort_order",va."created_at",va."created_at"
FROM "version_assets" va JOIN "song_versions" sv ON sv."id"=va."song_version_id"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "song_version_tracks" (
  "id","song_version_id","track_id","audio_asset_id","source_asset_id","generation_method","source_type",
  "timeline_start_seconds","source_start_seconds","source_end_seconds","gain_db","pan","metadata","created_at","updated_at"
)
SELECT va."id",va."song_version_id",va."id",va."audio_asset_id",va."source_asset_id",va."generation_method",va."source_type",
  va."timeline_start_seconds",va."source_start_seconds",va."source_end_seconds",va."gain_db",va."pan",va."metadata",va."created_at",va."created_at"
FROM "version_assets" va
ON CONFLICT ("song_version_id","track_id") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION dozi_sync_version_asset_track() RETURNS trigger AS $$
DECLARE owner_song_id uuid;
BEGIN
  SELECT sv."song_id" INTO owner_song_id FROM "song_versions" sv WHERE sv."id"=NEW."song_version_id";
  INSERT INTO "tracks" ("id","song_id","role","name","instrument","instrument_group","sort_order")
  VALUES (NEW."id",owner_song_id,
    CASE WHEN NEW."role"='MASTER' THEN 'MASTER'::"track_role"
         WHEN NEW."role"='REFERENCE' THEN 'REFERENCE'::"track_role"
         WHEN coalesce(NEW."instrument_group",'') ILIKE '%vocal%' THEN 'LEAD_VOCAL'::"track_role"
         WHEN NEW."role" IN ('PREMASTER','EFFECT_RETURN','ALTERNATIVE') THEN 'BUS'::"track_role"
         ELSE 'INSTRUMENT'::"track_role" END,
    coalesce(NEW."instrument",initcap(replace(NEW."role"::text,'_',' '))),NEW."instrument",NEW."instrument_group",NEW."sort_order")
  ON CONFLICT ("id") DO UPDATE SET "role"=EXCLUDED."role","name"=EXCLUDED."name",
    "instrument"=EXCLUDED."instrument","instrument_group"=EXCLUDED."instrument_group",
    "sort_order"=EXCLUDED."sort_order","updated_at"=now();

  INSERT INTO "song_version_tracks" (
    "id","song_version_id","track_id","audio_asset_id","source_asset_id","generation_method","source_type",
    "timeline_start_seconds","source_start_seconds","source_end_seconds","gain_db","pan","metadata"
  ) VALUES (
    NEW."id",NEW."song_version_id",NEW."id",NEW."audio_asset_id",NEW."source_asset_id",NEW."generation_method",NEW."source_type",
    NEW."timeline_start_seconds",NEW."source_start_seconds",NEW."source_end_seconds",NEW."gain_db",NEW."pan",NEW."metadata"
  ) ON CONFLICT ("song_version_id","track_id") DO UPDATE SET
    "audio_asset_id"=EXCLUDED."audio_asset_id","source_asset_id"=EXCLUDED."source_asset_id",
    "generation_method"=EXCLUDED."generation_method","source_type"=EXCLUDED."source_type",
    "timeline_start_seconds"=EXCLUDED."timeline_start_seconds","source_start_seconds"=EXCLUDED."source_start_seconds",
    "source_end_seconds"=EXCLUDED."source_end_seconds","gain_db"=EXCLUDED."gain_db","pan"=EXCLUDED."pan",
    "metadata"=EXCLUDED."metadata","updated_at"=now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER version_assets_sync_semantic_track AFTER INSERT OR UPDATE ON "version_assets"
FOR EACH ROW EXECUTE FUNCTION dozi_sync_version_asset_track();
