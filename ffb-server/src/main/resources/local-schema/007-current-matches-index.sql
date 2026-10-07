-- Optional marker-7 query index; does not change persisted documents or the schema marker.
CREATE INDEX ffb_v2_match_members_account ON ffb_v2_match_members (account_id, matchid);
