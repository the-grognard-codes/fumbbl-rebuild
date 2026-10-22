-- Explicit additive migration while the service is stopped. Existing checkpoint bytes are retained.
ALTER TABLE ffb_match_recovery ADD COLUMN checkpoint_generation BIGINT NOT NULL DEFAULT 1;
UPDATE ffb_match_recovery SET checkpoint_generation=generation;
ALTER TABLE ffb_match_recovery ADD CONSTRAINT recovery_checkpoint_generation CHECK (checkpoint_generation > 0 AND checkpoint_generation <= generation);
CREATE TABLE ffb_match_recovery_journal (
  matchid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  generation BIGINT NOT NULL,
  record_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  decoded_bytes INT NOT NULL,
  PRIMARY KEY (matchid,generation),
  CONSTRAINT recovery_journal_match FOREIGN KEY (matchid) REFERENCES ffb_match_recovery(matchid) ON DELETE CASCADE,
  CHECK (generation > 0),
  CHECK (OCTET_LENGTH(record_json) <= 4194304),
  CHECK (decoded_bytes BETWEEN 1 AND 4194304)
) ENGINE=InnoDB;
UPDATE ffb_local_schema SET version=9 WHERE version=8;
