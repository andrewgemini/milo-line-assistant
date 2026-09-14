-- Milo chat-first calendar. Additive and safe for existing production databases.
CREATE TABLE IF NOT EXISTS `calendar_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `lineChatId` VARCHAR(128) NOT NULL,
  `createdByLineUserId` VARCHAR(128) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `detail` TEXT NULL,
  `startsAt` TIMESTAMP NOT NULL,
  `endsAt` TIMESTAMP NOT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Bangkok',
  `status` ENUM('active','cancelled','completed') NOT NULL DEFAULT 'active',
  `sourceMessageId` VARCHAR(128) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `calendar_events_chat_start_idx` (`lineChatId`, `status`, `startsAt`),
  INDEX `calendar_events_user_start_idx` (`createdByLineUserId`, `status`, `startsAt`),
  INDEX `calendar_events_source_idx` (`sourceMessageId`)
);
