CREATE TYPE "public"."vocalist_permission_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "vocalist_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"vocalist_name" text NOT NULL,
	"project_title" text NOT NULL,
	"allowed_uses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"policy_version" text NOT NULL,
	"status" "vocalist_permission_status" DEFAULT 'PENDING' NOT NULL,
	"signed_name" text,
	"attestation_text" text,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vocalist_permissions" ADD CONSTRAINT "vocalist_permissions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocalist_permissions" ADD CONSTRAINT "vocalist_permissions_profile_id_artist_vocal_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."artist_vocal_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vocalist_permissions_token_hash_unique" ON "vocalist_permissions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "vocalist_permissions_owner_created_idx" ON "vocalist_permissions" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "vocalist_permissions_profile_status_idx" ON "vocalist_permissions" USING btree ("profile_id","status");
