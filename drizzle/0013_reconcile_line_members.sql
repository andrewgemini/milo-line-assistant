-- Reconcile legacy production line_members tables that use role/leftAt instead of isBot.
-- The application only needs isBot; preserve legacy columns for compatibility.
ALTER TABLE `line_members`
  ADD COLUMN IF NOT EXISTS `isBot` boolean NOT NULL DEFAULT false AFTER `pictureUrl`;
