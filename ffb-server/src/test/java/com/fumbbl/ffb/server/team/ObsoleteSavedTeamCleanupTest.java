package com.fumbbl.ffb.server.team;

import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ObsoleteSavedTeamCleanupTest {
	private static final String ACCOUNT = "00000000-0000-0000-0000-000000000011";
	private static final String URL = "jdbc:mariadb://example.invalid:3306/ffb_local";
	private final RosterCatalog catalog = new RosterCatalog();
	private final SavedTeamJson json = new SavedTeamJson(catalog);
	private final ObsoleteSavedTeamCleanup cleanup = new ObsoleteSavedTeamCleanup();

	@Test void selectsOnlyInternallyConsistentNamelessScaffoldDocuments() throws Exception {
		FakeStore store = fixture();
		ObsoleteSavedTeamCleanup.Plan plan = cleanup.inventory(store, "local-review", URL);
		assertEquals(5, plan.accountScanned);
		assertEquals(1, plan.localScanned);
		assertEquals(2, plan.entries.size());
		assertEquals(4, plan.excluded);
		assertEquals(ObsoleteSavedTeamCleanup.Table.ACCOUNT, plan.entries.get(0).table);
		assertEquals(ObsoleteSavedTeamCleanup.Table.LOCAL, plan.entries.get(1).table);
		assertEquals(plan.json(), ObsoleteSavedTeamCleanup.Plan.parse(plan.json().toString()).json());
		assertThrows(IllegalArgumentException.class, () -> cleanup.execute(store, URL, "production", plan));
		assertEquals(6, store.rows.size());
	}

	@Test void changedSelectedRowAbortsWholePlanAndExactRetryIsIdempotent() throws Exception {
		FakeStore store = fixture();
		ObsoleteSavedTeamCleanup.Plan plan = cleanup.inventory(store, "local-review", URL);
		ObsoleteSavedTeamCleanup.Row original = store.rows.get(1);
		SavedTeamRepository.Record prior = original.record;
		store.rows.set(1, new ObsoleteSavedTeamCleanup.Row(original.table,
			new SavedTeamRepository.Record(prior.teamId, prior.owner, prior.documentVersion + 1, prior.catalogVersion, prior.json)));
		assertThrows(SQLException.class, () -> cleanup.execute(store, URL, "local-review", plan));
		assertEquals(6, store.rows.size());
		store.rows.set(1, original);
		ObsoleteSavedTeamCleanup.Result first = cleanup.execute(store, URL, "local-review", plan);
		assertEquals(2, first.deleted);
		assertEquals(0, first.alreadyAbsent);
		assertEquals(4, store.rows.size());
		ObsoleteSavedTeamCleanup.Result repeated = cleanup.execute(store, URL, "local-review", plan);
		assertEquals(0, repeated.deleted);
		assertEquals(2, repeated.alreadyAbsent);
		assertEquals(0, cleanup.inventory(store, "local-review", URL).entries.size());
	}

	private FakeStore fixture() {
		FakeStore store = new FakeStore();
		store.rows.add(row(ObsoleteSavedTeamCleanup.Table.ACCOUNT, ACCOUNT, 1, false, RosterCatalog.VERSION));
		store.rows.add(row(ObsoleteSavedTeamCleanup.Table.LOCAL, "home", 2, false, RosterCatalog.LEGACY_VERSION));
		store.rows.add(row(ObsoleteSavedTeamCleanup.Table.ACCOUNT, ACCOUNT, 3, true, RosterCatalog.VERSION));
		store.rows.add(row(ObsoleteSavedTeamCleanup.Table.ACCOUNT, ACCOUNT, 4, true, RosterCatalog.PREVIOUS_VERSION));
		ObsoleteSavedTeamCleanup.Row mismatched = row(ObsoleteSavedTeamCleanup.Table.ACCOUNT, ACCOUNT, 5, false, RosterCatalog.VERSION);
		store.rows.add(new ObsoleteSavedTeamCleanup.Row(mismatched.table, new SavedTeamRepository.Record(
			mismatched.record.teamId, mismatched.record.owner, 2, mismatched.record.catalogVersion, mismatched.record.json)));
		store.rows.add(new ObsoleteSavedTeamCleanup.Row(ObsoleteSavedTeamCleanup.Table.ACCOUNT,
			new SavedTeamRepository.Record(id(6), ACCOUNT, 1, RosterCatalog.VERSION, "not-json")));
		return store;
	}
	private ObsoleteSavedTeamCleanup.Row row(ObsoleteSavedTeamCleanup.Table table, String owner, int number,
		boolean named, String catalogVersion) {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int slot = 1; slot <= 11; slot++) players.add(named
			? new TeamDraft.Player("player" + slot, slot, slot, "Player " + slot, "lineman", Collections.emptyList())
			: new TeamDraft.Player("player" + slot, slot, "lineman", Collections.emptyList()));
		Map<String, Integer> resources = new LinkedHashMap<>();
		for (String key : catalog.getResources().keySet()) resources.put(key, 0);
		TeamDraft draft = named
			? new TeamDraft(TeamDraft.FORMAT_VERSION, "Current", catalogVersion, "BB2025", "human", RosterCatalog.PRESET,
				"player1", players, resources)
			: new TeamDraft(catalogVersion, "BB2025", "human", RosterCatalog.PRESET, "player1", players, resources);
		SavedTeamDocument document = new SavedTeamDocument(id(number), owner, 1, draft,
			"{\"valid\":true,\"total\":550000,\"budget\":1150000,\"skillPoints\":0,\"messages\":[]}");
		return new ObsoleteSavedTeamCleanup.Row(table, new SavedTeamRepository.Record(document.teamId, owner, 1,
			catalogVersion, json.encode(document).toString()));
	}
	private String id(int number) { return String.format("00000000-0000-0000-0000-%012d", number); }

	private static final class FakeStore implements ObsoleteSavedTeamCleanup.Store {
		final List<ObsoleteSavedTeamCleanup.Row> rows = new ArrayList<>();
		@Override public int schemaVersion() { return 7; }
		@Override public String databaseName() { return "ffb_local"; }
		@Override public List<ObsoleteSavedTeamCleanup.Row> scan() { return new ArrayList<>(rows); }
		@Override public ObsoleteSavedTeamCleanup.Result delete(List<ObsoleteSavedTeamCleanup.Entry> entries,
			ObsoleteSavedTeamCleanup.RowVerifier verifier) throws SQLException {
			List<ObsoleteSavedTeamCleanup.Row> selected = new ArrayList<>();
			int absent = 0;
			for (ObsoleteSavedTeamCleanup.Entry entry : entries) {
				ObsoleteSavedTeamCleanup.Row found = null;
				for (ObsoleteSavedTeamCleanup.Row row : rows)
					if (row.table == entry.table && row.record.teamId.equals(entry.teamId)) found = row;
				if (found == null) { absent++; continue; }
				if (!verifier.matches(entry, found)) throw new SQLException("PLAN_ROW_CHANGED");
				selected.add(found);
			}
			rows.removeAll(selected);
			return new ObsoleteSavedTeamCleanup.Result(selected.size(), absent);
		}
	}
}
