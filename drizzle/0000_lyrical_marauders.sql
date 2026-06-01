CREATE TABLE `artifact_edges` (
	`parent_fcid` text NOT NULL,
	`child_fcid` text NOT NULL,
	`relation_type` text DEFAULT 'contains' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`parent_fcid`, `child_fcid`, `relation_type`),
	FOREIGN KEY (`parent_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifact_edges_parent_idx` ON `artifact_edges` (`parent_fcid`);--> statement-breakpoint
CREATE INDEX `artifact_edges_child_idx` ON `artifact_edges` (`child_fcid`);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`fcid` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projections` (
	`projection_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`root_fcid` text NOT NULL,
	`source_ref` text,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`root_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `projections_root_idx` ON `projections` (`root_fcid`);--> statement-breakpoint
CREATE TABLE `references` (
	`reference_id` text PRIMARY KEY NOT NULL,
	`source_fcid` text NOT NULL,
	`fcas_raw` text NOT NULL,
	`target_fcid` text NOT NULL,
	`status` text DEFAULT 'resolved' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`source_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `references_source_idx` ON `references` (`source_fcid`);--> statement-breakpoint
CREATE INDEX `references_target_idx` ON `references` (`target_fcid`);