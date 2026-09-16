-- KhunNote-inspired safe multi-intent capture and one-time pending bills.
CREATE TABLE IF NOT EXISTS `capture_drafts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lineChatId` VARCHAR(128) NOT NULL,
  `lineUserId` VARCHAR(128) NOT NULL,
  `financeAccountId` INT NULL,
  `sourceMessageId` VARCHAR(128) NULL,
  `payloadJson` TEXT NOT NULL,
  `status` ENUM('proposed','accepted','rejected','failed') NOT NULL DEFAULT 'proposed',
  `acceptedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `capture_drafts_chat_status_idx` (`lineChatId`, `lineUserId`, `status`, `createdAt`),
  UNIQUE KEY `capture_drafts_source_unique` (`lineChatId`, `sourceMessageId`)
);

CREATE TABLE IF NOT EXISTS `pending_bills` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lineChatId` VARCHAR(128) NOT NULL,
  `lineUserId` VARCHAR(128) NOT NULL,
  `financeAccountId` INT NULL,
  `captureDraftId` INT NULL,
  `title` VARCHAR(255) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `dueAt` TIMESTAMP NOT NULL,
  `status` ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  `sourceMessageId` VARCHAR(128) NULL,
  `paidTransactionId` INT NULL,
  `paidAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `pending_bills_chat_due_idx` (`lineChatId`, `status`, `dueAt`),
  INDEX `pending_bills_account_due_idx` (`financeAccountId`, `status`, `dueAt`),
  UNIQUE KEY `pending_bills_capture_unique` (`captureDraftId`, `sourceMessageId`)
);
