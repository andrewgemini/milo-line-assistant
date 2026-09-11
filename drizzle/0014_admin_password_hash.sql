-- Persist the admin password as a salted scrypt hash.
-- Safe to rerun against legacy production databases.
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `passwordHash` VARCHAR(255) NULL AFTER `role`;
