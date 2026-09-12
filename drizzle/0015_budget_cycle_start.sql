-- Allow each finance account to choose the day its monthly budget cycle starts.
-- Kept safe for existing production databases and fresh installs.
ALTER TABLE `finance_accounts`
  ADD COLUMN IF NOT EXISTS `budgetCycleStartDay` INT NOT NULL DEFAULT 1 AFTER `lineChatId`;
