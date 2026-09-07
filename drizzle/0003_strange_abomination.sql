CREATE TABLE `reminder_delivery_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reminderId` int NOT NULL,
	`runner` enum('heartbeat','manual') NOT NULL,
	`taskUid` varchar(65),
	`status` enum('sending','sent','failed') NOT NULL DEFAULT 'sending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `reminder_delivery_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `reminder_delivery_attempts_reminder_idx` ON `reminder_delivery_attempts` (`reminderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reminder_delivery_attempts_status_idx` ON `reminder_delivery_attempts` (`status`,`createdAt`);