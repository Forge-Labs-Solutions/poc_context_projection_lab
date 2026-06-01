CREATE TABLE `resource_bindings` (
	`binding_id` text PRIMARY KEY NOT NULL,
	`resource_key` text NOT NULL,
	`artifact_type` text NOT NULL,
	`artifact_fcid` text NOT NULL,
	`projection_kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`artifact_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `resource_bindings_resource_idx` ON `resource_bindings` (`resource_key`);--> statement-breakpoint
CREATE INDEX `resource_bindings_artifact_idx` ON `resource_bindings` (`artifact_fcid`);--> statement-breakpoint
CREATE UNIQUE INDEX `resource_bindings_unique_idx` ON `resource_bindings` (`resource_key`,`artifact_type`);