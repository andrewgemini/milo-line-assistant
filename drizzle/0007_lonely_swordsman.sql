ALTER TABLE `expense_categories` DROP INDEX `expense_categories_user_name_unique`;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `transactionType` enum('income','expense') DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_user_type_name_unique` UNIQUE(`lineUserId`,`transactionType`,`name`);