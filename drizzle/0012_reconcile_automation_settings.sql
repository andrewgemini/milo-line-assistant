-- Reconcile legacy production databases that predate the lastRunAt column.
-- Safe on fresh databases where 0001 already created lastRunAt.
ALTER TABLE `automation_settings`
  ADD COLUMN IF NOT EXISTS `lastRunAt` timestamp NULL AFTER `isEnabled`;
