CREATE TABLE `recurring_transaction_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recurringTransactionId` int NOT NULL,
	`periodKey` varchar(48) NOT NULL,
	`status` enum('creating','created','failed') NOT NULL DEFAULT 'creating',
	`transactionId` int,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `recurring_transaction_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `recurring_transaction_run_unique` UNIQUE(`recurringTransactionId`,`periodKey`)
);
--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`transactionType` enum('income','expense') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`category` varchar(100) NOT NULL,
	`note` text,
	`recurrenceType` enum('day','week','month') NOT NULL,
	`recurrenceInterval` int NOT NULL DEFAULT 1,
	`recurrenceWeekday` int,
	`recurrenceDayOfMonth` int,
	`nextRunAt` timestamp NOT NULL,
	`lastCreatedAt` timestamp,
	`status` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recurring_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `recurring_transaction_runs_status_idx` ON `recurring_transaction_runs` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `recurring_transactions_due_idx` ON `recurring_transactions` (`status`,`nextRunAt`);--> statement-breakpoint
CREATE INDEX `recurring_transactions_user_idx` ON `recurring_transactions` (`lineUserId`,`status`);