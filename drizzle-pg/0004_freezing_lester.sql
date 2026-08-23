CREATE TYPE "public"."track_generation_method" AS ENUM('FULL_SONG', 'LEGO_CONTEXTUAL', 'EXTRACT', 'COMPLETE', 'SEPARATION', 'UPLOAD');--> statement-breakpoint
ALTER TABLE "version_assets" ADD COLUMN "source_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "version_assets" ADD COLUMN "generation_method" "track_generation_method" DEFAULT 'FULL_SONG' NOT NULL;--> statement-breakpoint
ALTER TABLE "version_assets" ADD CONSTRAINT "version_assets_source_asset_id_audio_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "version_assets_source_idx" ON "version_assets" USING btree ("source_asset_id");