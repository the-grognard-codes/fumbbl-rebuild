CREATE TABLE ffb_v2_preparation_invites (
  matchid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  creator_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at_epoch_ms BIGINT NOT NULL,
  generation BIGINT NOT NULL,
  state ENUM('ACTIVE','ACCEPTED','REVOKED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  accepted_account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CHECK (expires_at_epoch_ms > 0),
  CHECK (generation > 0),
  CHECK ((state = 'ACCEPTED') = (accepted_account_id IS NOT NULL))
) ENGINE=InnoDB

;

CREATE TABLE ffb_v2_preparation_requests (
  matchid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fingerprint VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (matchid, account_id, request_id),
  CHECK (OCTET_LENGTH(fingerprint) BETWEEN 1 AND 255)
) ENGINE=InnoDB
