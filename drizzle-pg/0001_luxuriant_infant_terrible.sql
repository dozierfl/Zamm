ALTER TABLE "song_versions" DROP CONSTRAINT "song_versions_audio_asset_id_audio_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "song_versions" ADD CONSTRAINT "song_versions_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;