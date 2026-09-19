CREATE TABLE ffb_match_spectator_consent (
  matchid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  generation BIGINT NOT NULL,
  home_allows BOOLEAN NOT NULL,
  away_allows BOOLEAN NOT NULL,
  locked BOOLEAN NOT NULL,
  CHECK (generation > 0)
) ENGINE=InnoDB
