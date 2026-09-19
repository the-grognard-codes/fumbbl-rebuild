CREATE TABLE ffb_v2_match_members (
  matchid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role ENUM('home','away') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (matchid, account_id),
  UNIQUE KEY ffb_v2_match_members_role (matchid, role)
) ENGINE=InnoDB

;

CREATE TABLE ffb_v2_account (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  state ENUM('ACTIVE','DISABLED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL
) ENGINE=InnoDB

;

CREATE TABLE ffb_v2_identity (
  issuer VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('ACTIVE','REVOKED') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (issuer, subject),
  CONSTRAINT ffb_v2_identity_account FOREIGN KEY (account_id) REFERENCES ffb_v2_account(account_id)
) ENGINE=InnoDB

;

CREATE TABLE ffb_v2_account_scope (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope ENUM('PLAYER','SPECTATOR','OWNER','ADMINISTRATOR') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (account_id, scope),
  CONSTRAINT ffb_v2_scope_account FOREIGN KEY (account_id) REFERENCES ffb_v2_account(account_id)
) ENGINE=InnoDB
