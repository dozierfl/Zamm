CREATE TABLE `audio_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`generation_job_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`codec` text NOT NULL,
	`sample_rate` integer NOT NULL,
	`bit_depth` integer NOT NULL,
	`channels` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`file_size` integer NOT NULL,
	`checksum` text NOT NULL,
	`waveform_data` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_job_unique` ON `audio_assets` (`generation_job_id`);--> statement-breakpoint
CREATE INDEX `audio_owner_idx` ON `audio_assets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation_type` text DEFAULT 'GENERATE' NOT NULL,
	`provider` text NOT NULL,
	`provider_model` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`request_payload` text NOT NULL,
	`composition_plan` text NOT NULL,
	`seed` integer NOT NULL,
	`error_code` text,
	`error_message` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_user_idempotency_unique` ON `generation_jobs` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `jobs_user_status_idx` ON `generation_jobs` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `jobs_song_idx` ON `generation_jobs` (`song_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `projects_user_created_idx` ON `projects` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `song_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`parent_version_id` text,
	`generation_job_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`audio_asset_id` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`bpm` integer NOT NULL,
	`musical_key` text NOT NULL,
	`scale` text NOT NULL,
	`lyrics` text NOT NULL,
	`prompt` text NOT NULL,
	`style_prompt` text NOT NULL,
	`composition_plan` text NOT NULL,
	`provider` text NOT NULL,
	`provider_model` text NOT NULL,
	`seed` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audio_asset_id`) REFERENCES `audio_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `versions_song_number_unique` ON `song_versions` (`song_id`,`version_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `versions_job_unique` ON `song_versions` (`generation_job_id`);--> statement-breakpoint
CREATE INDEX `versions_song_created_idx` ON `song_versions` (`song_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`lyrics` text DEFAULT '' NOT NULL,
	`is_instrumental` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `songs_user_created_idx` ON `songs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `songs_project_idx` ON `songs` (`project_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);