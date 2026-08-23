ALTER TABLE "version_assets" DROP CONSTRAINT "version_assets_audio_asset_id_audio_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "version_assets" ADD CONSTRAINT "version_assets_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE cascade ON UPDATE no action;