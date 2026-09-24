-- Apply to a backed-up marker-6 database while the game service is stopped.
-- Saved-team documents remain in the existing bounded JSON column. Format 2 rows
-- are retained and listed as unavailable; new account writes use format 3.
UPDATE ffb_local_schema SET version=7 WHERE version=6;
