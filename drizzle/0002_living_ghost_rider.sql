CREATE TABLE `artifact_lineage` (
	`descendant_fcid` text NOT NULL,
	`ancestor_fcid` text NOT NULL,
	`relation_type` text NOT NULL,
	`event_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`descendant_fcid`, `ancestor_fcid`, `relation_type`),
	FOREIGN KEY (`descendant_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ancestor_fcid`) REFERENCES `artifacts`(`fcid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `evolution_events`(`event_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifact_lineage_descendant_idx` ON `artifact_lineage` (`descendant_fcid`);--> statement-breakpoint
CREATE INDEX `artifact_lineage_ancestor_idx` ON `artifact_lineage` (`ancestor_fcid`);--> statement-breakpoint
CREATE TABLE `evolution_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`inputs_json` text NOT NULL,
	`outputs_json` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evolution_events_operation_idx` ON `evolution_events` (`operation`);