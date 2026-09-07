CREATE TABLE `finance_digest_deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(100) NOT NULL,
	`taskUid` varchar(65) NOT NULL,
	`targetLineUserId` varchar(128) NOT NULL,
	`digestType` enum('daily','weekly') NOT NULL,
	`periodKey` varchar(32) NOT NULL,
	`status` enum('sending','sent','failed') NOT NULL DEFAULT 'sending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `finance_digest_deliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_digest_delivery_period_unique` UNIQUE(`settingKey`,`periodKey`)
);
--> statement-breakpoint
CREATE INDEX `finance_digest_delivery_task_idx` ON `finance_digest_deliveries` (`taskUid`,`createdAt`);