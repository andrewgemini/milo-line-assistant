CREATE TABLE `transaction_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transactionId` int NOT NULL,
	`vaultItemId` int NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`label` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transaction_attachments_id` PRIMARY KEY(`id`),
	CONSTRAINT `transaction_attachments_unique` UNIQUE(`transactionId`,`vaultItemId`)
);
--> statement-breakpoint
CREATE INDEX `transaction_attachments_user_idx` ON `transaction_attachments` (`lineUserId`,`transactionId`);