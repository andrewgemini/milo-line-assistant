CREATE TABLE IF NOT EXISTS `vault_blobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `storageKey` varchar(512) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `sizeBytes` int NOT NULL,
  `content` longblob NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vault_blobs_id` PRIMARY KEY(`id`),
  CONSTRAINT `vault_blobs_storage_key_unique` UNIQUE(`storageKey`),
  INDEX `vault_blobs_created_idx` (`createdAt`)
);
