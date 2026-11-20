-- Explicit additive migration while the service is stopped.
ALTER TABLE ffb_match_recovery ADD COLUMN computer_work_until_epoch_ms BIGINT UNSIGNED NULL;
UPDATE ffb_local_schema SET version=10 WHERE version=9;
