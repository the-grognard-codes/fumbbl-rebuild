-- Explicit migration from marker 7 while the service is stopped; back up first.
CREATE TABLE ffb_v2_skill_use_preferences (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  use_case VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mode ENUM('always-use','always-ask') CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (account_id, use_case),
  CONSTRAINT skill_use_account FOREIGN KEY (account_id) REFERENCES ffb_v2_account(account_id),
  CONSTRAINT skill_use_case CHECK (use_case IN ('catch','dodge-movement','dodge-block','sure-feet','fend','steady-footing','strip-ball','sure-hands','tackle-movement','tackle-block','taunt','wrestle-attacker','wrestle-defender','pass-ball','pass-bomb','grab','stand-firm','pick-me-up'))
) ENGINE=InnoDB;
UPDATE ffb_local_schema SET version=8 WHERE version=7;
