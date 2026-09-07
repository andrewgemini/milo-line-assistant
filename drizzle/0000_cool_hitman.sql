CREATE TABLE `budgets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`category` varchar(100) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`alertAtPercent` int NOT NULL DEFAULT 80,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `budgets_id` PRIMARY KEY(`id`),
	CONSTRAINT `budgets_period_unique` UNIQUE(`lineUserId`,`category`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `image_extractions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vaultItemId` int NOT NULL,
	`purpose` enum('reminder','expense','file') NOT NULL,
	`model` varchar(100) NOT NULL,
	`extractedJson` text NOT NULL,
	`confidence` decimal(5,2),
	`status` enum('proposed','accepted','rejected','failed') NOT NULL DEFAULT 'proposed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `image_extractions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `line_account_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dashboardUserId` int NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`linkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `line_account_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `line_account_links_dashboardUserId_unique` UNIQUE(`dashboardUserId`),
	CONSTRAINT `line_account_links_lineUserId_unique` UNIQUE(`lineUserId`)
);
--> statement-breakpoint
CREATE TABLE `line_chats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scope` enum('user','group','room') NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`displayName` varchar(255),
	`pictureUrl` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `line_chats_id` PRIMARY KEY(`id`),
	CONSTRAINT `line_chats_lineChatId_unique` UNIQUE(`lineChatId`)
);
--> statement-breakpoint
CREATE TABLE `line_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`displayName` varchar(255),
	`pictureUrl` text,
	`isBot` boolean NOT NULL DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `line_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `line_members_chat_user_unique` UNIQUE(`lineChatId`,`lineUserId`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`createdByLineUserId` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`createdByLineUserId` varchar(128) NOT NULL,
	`title` varchar(255) NOT NULL,
	`detail` text,
	`status` enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Bangkok',
	`recurrenceType` enum('once','minute','day','week','month') NOT NULL DEFAULT 'once',
	`recurrenceInterval` int NOT NULL DEFAULT 1,
	`recurrenceWeekdays` varchar(32),
	`recurrenceDayOfMonth` int,
	`dueAt` timestamp,
	`nextRunAt` timestamp,
	`lastDeliveredAt` timestamp,
	`lastDeliveryResult` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
	`sourceMessageId` varchar(128),
	`sourceImageKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todo_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`createdByLineUserId` varchar(128) NOT NULL,
	`assigneeLineUserId` varchar(128),
	`title` varchar(255) NOT NULL,
	`detail` text,
	`status` enum('todo','done','cancelled') NOT NULL DEFAULT 'todo',
	`dueAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `todo_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`transactionType` enum('income','expense') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`category` varchar(100) NOT NULL,
	`note` text,
	`occurredAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `vault_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineChatId` varchar(128) NOT NULL,
	`createdByLineUserId` varchar(128) NOT NULL,
	`itemType` enum('text','link','image','file') NOT NULL,
	`title` varchar(255) NOT NULL,
	`searchableText` text,
	`tagsText` varchar(512),
	`originalFilename` varchar(255),
	`mimeType` varchar(128),
	`sourceUrl` text,
	`storageKey` varchar(512),
	`storageUrl` text,
	`lineMessageId` varchar(128),
	`status` enum('active','deleted') NOT NULL DEFAULT 'active',
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vault_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `vault_items_lineMessageId_unique` UNIQUE(`lineMessageId`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookEventId` varchar(128) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`lineChatId` varchar(128),
	`occurredAt` timestamp NOT NULL,
	`rawPayload` text NOT NULL,
	`status` enum('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
	`errorMessage` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_events_webhookEventId_unique` UNIQUE(`webhookEventId`)
);
--> statement-breakpoint
CREATE INDEX `line_chats_scope_idx` ON `line_chats` (`scope`);--> statement-breakpoint
CREATE INDEX `line_members_user_idx` ON `line_members` (`lineUserId`);--> statement-breakpoint
CREATE INDEX `notes_user_idx` ON `notes` (`createdByLineUserId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`status`,`nextRunAt`);--> statement-breakpoint
CREATE INDEX `reminders_user_idx` ON `reminders` (`createdByLineUserId`);--> statement-breakpoint
CREATE INDEX `todo_items_user_idx` ON `todo_items` (`createdByLineUserId`,`status`);--> statement-breakpoint
CREATE INDEX `transactions_user_idx` ON `transactions` (`lineUserId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `vault_items_user_idx` ON `vault_items` (`createdByLineUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vault_items_chat_idx` ON `vault_items` (`lineChatId`,`itemType`);--> statement-breakpoint
CREATE INDEX `webhook_events_status_idx` ON `webhook_events` (`status`,`createdAt`);