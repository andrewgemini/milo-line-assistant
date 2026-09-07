CREATE TABLE `finance_account_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`financeAccountId` int NOT NULL,
	`lineUserId` varchar(128) NOT NULL,
	`role` enum('owner','manager','contributor','viewer') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_account_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_account_members_unique` UNIQUE(`financeAccountId`,`lineUserId`)
);
--> statement-breakpoint
CREATE TABLE `finance_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountType` enum('personal','group') NOT NULL,
	`name` varchar(120) NOT NULL,
	`ownerLineUserId` varchar(128) NOT NULL,
	`lineChatId` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_accounts_group_chat_unique` UNIQUE(`lineChatId`)
);
--> statement-breakpoint
ALTER TABLE `budgets` DROP INDEX `budgets_period_unique`;--> statement-breakpoint
ALTER TABLE `expense_categories` DROP INDEX `expense_categories_user_type_name_unique`;--> statement-breakpoint
ALTER TABLE `finance_opening_balances` DROP INDEX `finance_opening_balances_lineUserId_unique`;--> statement-breakpoint
ALTER TABLE `budgets` ADD `financeAccountId` int;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `financeAccountId` int;--> statement-breakpoint
ALTER TABLE `finance_opening_balances` ADD `financeAccountId` int;--> statement-breakpoint
ALTER TABLE `recurring_transactions` ADD `financeAccountId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `financeAccountId` int;--> statement-breakpoint
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_account_period_unique` UNIQUE(`financeAccountId`,`category`,`monthKey`);--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_account_type_name_unique` UNIQUE(`financeAccountId`,`transactionType`,`name`);--> statement-breakpoint
ALTER TABLE `finance_opening_balances` ADD CONSTRAINT `finance_opening_balances_account_unique` UNIQUE(`financeAccountId`);--> statement-breakpoint
CREATE INDEX `finance_account_members_user_idx` ON `finance_account_members` (`lineUserId`,`financeAccountId`);--> statement-breakpoint
CREATE INDEX `finance_accounts_owner_idx` ON `finance_accounts` (`ownerLineUserId`,`isActive`);--> statement-breakpoint
CREATE INDEX `budgets_account_month_idx` ON `budgets` (`financeAccountId`,`monthKey`);--> statement-breakpoint
CREATE INDEX `expense_categories_account_idx` ON `expense_categories` (`financeAccountId`,`transactionType`);--> statement-breakpoint
CREATE INDEX `recurring_transactions_account_idx` ON `recurring_transactions` (`financeAccountId`,`status`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`financeAccountId`,`status`,`occurredAt`);--> statement-breakpoint
INSERT INTO `finance_accounts` (`accountType`, `name`, `ownerLineUserId`, `lineChatId`, `isActive`)
SELECT 'personal', 'บัญชีส่วนตัว', owners.`lineUserId`, NULL, true
FROM (
  SELECT `lineUserId` FROM `transactions` GROUP BY `lineUserId`
  UNION SELECT `lineUserId` FROM `budgets` GROUP BY `lineUserId`
  UNION SELECT `lineUserId` FROM `expense_categories` GROUP BY `lineUserId`
  UNION SELECT `lineUserId` FROM `finance_opening_balances` GROUP BY `lineUserId`
  UNION SELECT `lineUserId` FROM `recurring_transactions` GROUP BY `lineUserId`
) AS owners
WHERE NOT EXISTS (
  SELECT 1 FROM `finance_accounts` existing
  WHERE existing.`accountType` = 'personal' AND existing.`ownerLineUserId` = owners.`lineUserId`
);--> statement-breakpoint
INSERT INTO `finance_account_members` (`financeAccountId`, `lineUserId`, `role`)
SELECT accounts.`id`, accounts.`ownerLineUserId`, 'owner'
FROM `finance_accounts` accounts
LEFT JOIN `finance_account_members` members
  ON members.`financeAccountId` = accounts.`id` AND members.`lineUserId` = accounts.`ownerLineUserId`
WHERE accounts.`accountType` = 'personal' AND members.`id` IS NULL;--> statement-breakpoint
UPDATE `transactions` transaction_rows
INNER JOIN `finance_accounts` accounts
  ON accounts.`accountType` = 'personal' AND accounts.`ownerLineUserId` = transaction_rows.`lineUserId`
SET transaction_rows.`financeAccountId` = accounts.`id`
WHERE transaction_rows.`financeAccountId` IS NULL;--> statement-breakpoint
UPDATE `budgets` budget_rows
INNER JOIN `finance_accounts` accounts
  ON accounts.`accountType` = 'personal' AND accounts.`ownerLineUserId` = budget_rows.`lineUserId`
SET budget_rows.`financeAccountId` = accounts.`id`
WHERE budget_rows.`financeAccountId` IS NULL;--> statement-breakpoint
UPDATE `expense_categories` category_rows
INNER JOIN `finance_accounts` accounts
  ON accounts.`accountType` = 'personal' AND accounts.`ownerLineUserId` = category_rows.`lineUserId`
SET category_rows.`financeAccountId` = accounts.`id`
WHERE category_rows.`financeAccountId` IS NULL;--> statement-breakpoint
UPDATE `finance_opening_balances` opening_rows
INNER JOIN `finance_accounts` accounts
  ON accounts.`accountType` = 'personal' AND accounts.`ownerLineUserId` = opening_rows.`lineUserId`
SET opening_rows.`financeAccountId` = accounts.`id`
WHERE opening_rows.`financeAccountId` IS NULL;--> statement-breakpoint
UPDATE `recurring_transactions` recurring_rows
INNER JOIN `finance_accounts` accounts
  ON accounts.`accountType` = 'personal' AND accounts.`ownerLineUserId` = recurring_rows.`lineUserId`
SET recurring_rows.`financeAccountId` = accounts.`id`
WHERE recurring_rows.`financeAccountId` IS NULL;
