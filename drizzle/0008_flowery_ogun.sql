CREATE TABLE `finance_opening_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`effectiveAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_opening_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_opening_balances_lineUserId_unique` UNIQUE(`lineUserId`)
);
