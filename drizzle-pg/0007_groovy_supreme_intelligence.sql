ALTER TYPE "public"."track_generation_method" ADD VALUE 'VOCAL_REPAIR';--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD COLUMN "source_vocal_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD COLUMN "rendered_audio_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD CONSTRAINT "vocal_repair_sessions_source_vocal_asset_id_audio_assets_id_fk" FOREIGN KEY ("source_vocal_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocal_repair_sessions" ADD CONSTRAINT "vocal_repair_sessions_rendered_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("rendered_audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vocal_repairs_source_vocal_asset_idx" ON "vocal_repair_sessions" USING btree ("source_vocal_asset_id");--> statement-breakpoint
CREATE INDEX "vocal_repairs_rendered_asset_idx" ON "vocal_repair_sessions" USING btree ("rendered_audio_asset_id");