CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int,
	`dashboardUserId` int,
	`actorLineUserId` varchar(128),
	`lineChatId` varchar(128),
	`detailsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `voice_transcriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vaultItemId` int NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`transcript` text NOT NULL,
	`language` varchar(16),
	`durationSeconds` decimal(10,2),
	`status` enum('proposed','accepted','rejected','failed') NOT NULL DEFAULT 'proposed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_transcriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `voice_transcriptions_vaultItemId_unique` UNIQUE(`vaultItemId`)
);
--> statement-breakpoint
DROP INDEX `transactions_user_idx` ON `transactions`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('viewer','user','manager','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `transactions` ADD `status` enum('active','deleted') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `source` varchar(32) DEFAULT 'line_text' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `sourceMessageId` varchar(128);--> statement-breakpoint
ALTER TABLE `transactions` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `transactions` ADD `deletedAt` timestamp;--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entityType`,`entityId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actorLineUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `voice_transcriptions_user_idx` ON `voice_transcriptions` (`lineUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `transactions_source_message_idx` ON `transactions` (`sourceMessageId`);--> statement-breakpoint
CREATE INDEX `transactions_user_idx` ON `transactions` (`lineUserId`,`status`,`occurredAt`);