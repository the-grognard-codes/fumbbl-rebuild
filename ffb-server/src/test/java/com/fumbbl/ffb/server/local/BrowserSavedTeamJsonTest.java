package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.server.team.SavedTeamJson;
import com.fumbbl.ffb.server.team.SavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BrowserSavedTeamJsonTest {
	private MemoryRepository repository;
	private BrowserSavedTeamJson adapter;
	private RosterCatalog catalog;
	@Test void accountTeamProjectionContainsOnlyOwnedDocumentAndForeignReadIsRedacted() {
		BrowserSavedTeamJson accountAdapter = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog), true);
		String owner = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
		JsonObject created = accountAdapter.handle(owner, request("create").add("draft", namedDraft()).toString());
		assertEquals("OK", created.getString("code", null));
		assertEquals(new HashSet<>(Arrays.asList("version", "type", "requestId", "code", "document", "versionStatus", "validation", "teams")), new HashSet<>(created.names()));
		JsonObject document = created.get("document").asObject();
		assertEquals(new HashSet<>(Arrays.asList("namespace", "subject")), new HashSet<>(document.get("owner").asObject().names()));
		assertEquals(owner, document.get("owner").asObject().getString("subject", null));
		JsonObject denied = accountAdapter.handle("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", request("load").add("teamId", document.get("teamId")).toString());
		assertFalse("OK".equals(denied.getString("code", null)));
		assertTrue(denied.get("document").isNull()); assertFalse(denied.toString().contains(owner));
	}
	@BeforeEach
	void initialize() {
		catalog = new RosterCatalog(); repository = new MemoryRepository();
		adapter = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog));
	}
	private JsonObject draft() {
		JsonArray players = new JsonArray();
		for (int slot = 1; slot <= 11; slot++) players.add(new JsonObject().add("id", "p" + slot).add("slot", slot)
			.add("positionId", "lineman").add("skillIds", new JsonArray()));
		return new JsonObject().add("catalogVersion", RosterCatalog.VERSION).add("ruleset", "BB2025")
			.add("rosterId", "human").add("presetId", RosterCatalog.PRESET).add("captainId", "p1").add("players", players)
			.add("resources", new JsonObject().add("rerolls", 2).add("assistantCoaches", 0).add("cheerleaders", 0).add("apothecary", 1).add("dedicatedFans", 0));
	}
	@Test void accountListNamesOwnedTeamsAndDeleteRequiresOwnershipAndCurrentVersion() {
		BrowserSavedTeamJson accounts = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog), true);
		String owner = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
		JsonObject created = accounts.handle(owner, request("create").add("draft", namedDraft()).toString());
		assertEquals("OK", created.getString("code", null));
		JsonObject document = created.get("document").asObject(); String id = document.getString("teamId", null);
		JsonObject list = accounts.handle(owner, request("list").toString()).get("teams").asArray().get(0).asObject();
		assertEquals("The Moles", list.getString("teamName", null));
		assertEquals("CURRENT", list.getString("eligibility", null));
		assertEquals(0, accounts.handle(other, request("list").toString()).get("teams").asArray().size());
		JsonObject deletion = request("delete").add("teamId", id).add("expectedDocumentVersion", 1);
		assertEquals("NOT_FOUND", accounts.handle(other, deletion.toString()).getString("code", null));
		assertEquals("CONFLICT", accounts.handle(owner, request("delete").add("teamId", id).add("expectedDocumentVersion", 2).toString()).getString("code", null));
		assertEquals("OK", accounts.handle(owner, deletion.toString()).getString("code", null));
		assertEquals(0, accounts.handle(owner, request("list").toString()).get("teams").asArray().size());
	}
	@Test void historicalAndMalformedAccountRowsRemainVisibleButUnavailable() {
		BrowserSavedTeamJson accounts = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog), true);
		String owner = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
		JsonObject created = accounts.handle(owner, request("create").add("draft", namedDraft()).toString());
		JsonObject old = JsonObject.readFrom(created.get("document").toString()).set("formatVersion", 2);
		JsonObject oldDraft = old.get("draft").asObject(); oldDraft.remove("draftVersion"); oldDraft.remove("teamName");
		for (com.eclipsesource.json.JsonValue value : oldDraft.get("players").asArray()) {
			value.asObject().remove("jerseyNumber"); value.asObject().remove("playerName");
		}
		String id = old.getString("teamId", null);
		repository.rows.put(id, new SavedTeamRepository.Record(id, owner, 1, RosterCatalog.VERSION, old.toString()));
		String bad = "dddddddd-dddd-dddd-dddd-dddddddddddd";
		repository.rows.put(bad, new SavedTeamRepository.Record(bad, owner, 1, RosterCatalog.VERSION, "not-json"));
		JsonArray list = accounts.handle(owner, request("list").toString()).get("teams").asArray();
		assertEquals(2, list.size());
		assertEquals("MIGRATION_REQUIRED", list.get(0).asObject().getString("eligibility", null));
		assertEquals("UNAVAILABLE", list.get(1).asObject().getString("eligibility", null));
	}
	private JsonObject namedDraft() {
		JsonObject result = draft().add("draftVersion", 2).add("teamName", "The Moles");
		for (int index = 0; index < result.get("players").asArray().size(); index++)
			result.get("players").asArray().get(index).asObject().add("jerseyNumber", index + 1).add("playerName", "Mole " + (index + 1));
		return result;
	}
	@Test
	void checkedInHumanStarterDraftIsAcceptedByTheFrozenCatalog() throws IOException {
		Path fixture = Paths.get("browser-client", "examples", "human-starter-draft.json");
		if (!Files.isRegularFile(fixture)) fixture = Paths.get("..", "browser-client", "examples", "human-starter-draft.json");
		String json = new String(Files.readAllBytes(fixture), StandardCharsets.UTF_8);
		JsonObject response = send(request("create").add("draft", JsonObject.readFrom(json)));
		assertEquals("OK", response.getString("code", ""));
		assertEquals(700000, response.get("document").asObject().get("validation").asObject().getInt("total", 0));
	}
	private JsonObject request(String operation) { return new JsonObject().add("version", 1).add("type", "savedTeam").add("requestId", "test").add("operation", operation); }
	private JsonObject send(JsonObject request) { return adapter.handle("home", request.toString()); }
	private JsonObject create() {
		JsonObject response = send(request("create").add("draft", draft()));
		assertEquals("OK", response.getString("code", "")); return response.get("document").asObject();
	}
	private JsonObject update(JsonObject document, JsonObject draft) {
		return request("update").add("teamId", document.getString("teamId", ""))
			.add("expectedDocumentVersion", document.getInt("documentVersion", 0)).add("draft", draft);
	}
	private Map<String, String> bytes() {
		Map<String, String> result = new LinkedHashMap<>();
		for (SavedTeamRepository.Record record : repository.rows.values()) result.put(record.teamId, record.json);
		return result;
	}
	private void unchanged(JsonObject request, String code) {
		Map<String, String> before = bytes(); String input = request.toString();
		assertEquals(code, send(request).getString("code", ""));
		assertEquals(before, bytes()); assertEquals(input, request.toString());
	}
	@Test
	void accountCreateAndImportRetriesKeepOneOwnedDocumentAndRejectForeignLoads() {
		String account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
		adapter = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog), true);
		JsonObject input = request("create").add("draft", namedDraft());
		JsonObject created = adapter.handle(account, input.toString());
		assertEquals("OK", created.getString("code", ""));
		JsonObject document = created.get("document").asObject();
		assertEquals(3, document.getInt("formatVersion", 0));
		assertEquals("account", document.get("owner").asObject().getString("namespace", ""));
		assertEquals(document, adapter.handle(account, input.toString()).get("document"));
		assertEquals(1, repository.rows.size());
		assertEquals("CONFLICT", adapter.handle(account, request("create").add("draft", namedDraft().set("captainId", com.eclipsesource.json.JsonValue.NULL)).toString()).getString("code", ""));
		assertEquals("NOT_FOUND", adapter.handle("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", request("load").add("teamId", document.get("teamId")).toString()).getString("code", ""));
		JsonObject imported = request("import").set("requestId", "import").add("document", document);
		assertEquals("MALFORMED_TEAM_REQUEST", adapter.handle(account, imported.toString()).getString("code", ""));
		assertEquals(1, repository.rows.size());
	}

	@Test
	void canonicalSaveLoadListAndServiceRestartRecomputeWithoutMutation() {
		JsonObject document = create(); String id = document.getString("teamId", "");
		assertEquals(700000, document.get("validation").asObject().getInt("total", 0));
		assertEquals("home", document.get("owner").asObject().getString("subject", ""));
		assertEquals(draft(), document.get("draft"));
		adapter = new BrowserSavedTeamJson(new SavedTeamService(repository, new RosterCatalog()));
		JsonObject loaded = send(request("load").add("teamId", id));
		assertEquals(document, loaded.get("document")); assertEquals("CURRENT", loaded.getString("versionStatus", ""));
		assertEquals(700000, loaded.get("validation").asObject().getInt("total", 0));
		assertEquals(1, send(request("list")).get("teams").asArray().size());
		JsonObject nextDraft = draft(); nextDraft.get("resources").asObject().set("rerolls", 3);
		JsonObject updated = send(update(document, nextDraft)).get("document").asObject();
		assertEquals(2, updated.getInt("documentVersion", 0)); assertEquals(id, updated.getString("teamId", ""));
		assertEquals(750000, updated.get("validation").asObject().getInt("total", 0));
		unchanged(update(document, draft()), "CONFLICT");
	}
	@Test
	void importedClaimsAreDiscardedAndStaleExportsCannotOverwrite() {
		JsonObject document = create();
		document.get("validation").asObject().set("total", 1).set("valid", false).set("budget", 1).set("skillPoints", 99);
		JsonObject response = send(request("import").add("document", document));
		assertEquals("OK", response.getString("code", ""));
		JsonObject saved = response.get("document").asObject();
		assertEquals(700000, saved.get("validation").asObject().getInt("total", 0));
		assertTrue(saved.get("validation").asObject().getBoolean("valid", false));
		unchanged(request("import").add("document", document), "CONFLICT");
		JsonObject external = JsonObject.readFrom(document.toString()).set("teamId", UUID.randomUUID().toString());
		external.get("owner").asObject().set("subject", "away");
		JsonObject imported = send(request("import").add("document", external)).get("document").asObject();
		assertFalse(external.get("teamId").equals(imported.get("teamId")));
		assertEquals("home", imported.get("owner").asObject().getString("subject", ""));
		unchanged(request("import").add("document", JsonObject.readFrom(saved.toString()).set("teamId", UUID.randomUUID().toString())), "CONFLICT");
	}
	@Test
	void everyInvalidDraftWriteLeavesOriginalBytesAndRowCountUntouched() {
		JsonObject document = create();
		List<Consumer<JsonObject>> invalid = new ArrayList<>();
		invalid.add(d -> d.get("players").asArray().get(1).asObject().set("id", "p1"));
		invalid.add(d -> d.get("players").asArray().get(1).asObject().set("slot", 1));
		invalid.add(d -> d.get("players").asArray().get(0).asObject().set("positionId", "unknown"));
		invalid.add(d -> d.get("players").asArray().get(1).asObject().set("skillIds", new JsonArray().add("unknown")));
		invalid.add(d -> d.get("players").asArray().get(1).asObject().set("skillIds", new JsonArray().add("pass")));
		invalid.add(d -> d.get("resources").asObject().set("rerolls", -1));
		invalid.add(d -> d.get("resources").asObject().set("rerolls", 9));
		invalid.add(d -> d.get("players").asArray().remove(10));
		invalid.add(d -> d.set("ruleset", "unknown"));
		invalid.add(d -> d.set("rosterId", "unknown"));
		invalid.add(d -> d.set("presetId", "unknown"));
		invalid.add(d -> { for (int slot = 12; slot <= 16; slot++) d.get("players").asArray().add(new JsonObject().add("id", "p" + slot).add("slot", slot).add("positionId", "lineman").add("skillIds", new JsonArray())); d.get("resources").asObject().set("rerolls", 8); });
		invalid.add(d -> { for (int index = 0; index < 3; index++) d.get("players").asArray().get(index).asObject().set("positionId", "blitzer"); });
		invalid.add(d -> d.get("players").asArray().get(1).asObject().set("skillIds", new JsonArray().add("block").add("block")));
		for (Consumer<JsonObject> mutate : invalid) {
			JsonObject bad = draft(); mutate.accept(bad);
			unchanged(update(document, bad), "VALIDATION_FAILED");
			unchanged(request("create").add("draft", bad), "VALIDATION_FAILED");
			unchanged(request("import").add("document", JsonObject.readFrom(document.toString()).set("draft", bad)
				.set("ruleset", bad.get("ruleset"))), "VALIDATION_FAILED");
		}
	}
	@Test
	void malformedImportAndSaveVersionsAndForbiddenFieldsDoNotWrite() {
		JsonObject document = create();
		for (String field : new String[] {"total", "valid", "position", "skills", "catalog", "imageUrl", "token", "dice"}) {
			unchanged(update(document, draft().add(field, "untrusted")), "MALFORMED_TEAM_REQUEST");
			unchanged(request("import").add("document", JsonObject.readFrom(document.toString()).add(field, "untrusted")), "MALFORMED_TEAM_REQUEST");
		}
		JsonObject fraction = draft(); fraction.get("resources").asObject().set("rerolls", 1.5);
		unchanged(update(document, fraction), "MALFORMED_TEAM_REQUEST");
		for (int version : new int[] {-1, 0, Integer.MAX_VALUE}) {
			unchanged(update(document, draft()).set("expectedDocumentVersion", version), "INVALID_DOCUMENT_VERSION");
			unchanged(request("import").add("document", JsonObject.readFrom(document.toString()).set("documentVersion", version)), "INVALID_DOCUMENT_VERSION");
		}
		unchanged(request("import").add("document", JsonObject.readFrom(document.toString()).set("formatVersion", 2)), "INVALID_DOCUMENT_VERSION");
		Map<String, String> before = bytes();
		for (String text : new String[] {"{", request("create").add("draft", draft()).toString().replace("\"slot\":1,", "\"slot\":1,\"slot\":1,"),
			new String(new char[16385]).replace('\0', ' '), "[[[[[[[[[[]]]]]]]]]]"}) {
			assertEquals("MALFORMED_TEAM_REQUEST", adapter.handle("home", text).getString("code", "")); assertEquals(before, bytes());
		}
	}
	@Test
	void unavailableAndRetiredCatalogLoadsPreserveSavedDraftAndRejectAllWrites() {
		JsonObject original = create();
		adapter = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog, "future-selectable"));
		JsonObject loaded = send(request("load").add("teamId", original.get("teamId")));
		assertEquals("MIGRATION_REQUIRED", loaded.getString("versionStatus", "")); assertEquals(original, loaded.get("document"));
		unchanged(update(original, draft()), "MIGRATION_REQUIRED");
		unchanged(request("create").add("draft", draft()), "MIGRATION_REQUIRED");
		unchanged(request("import").add("document", original), "MIGRATION_REQUIRED");
		JsonObject historical = JsonObject.readFrom(original.toString()).set("catalogVersion", "retired");
		historical.get("draft").asObject().set("catalogVersion", "retired");
		String id = historical.getString("teamId", "");
		repository.rows.put(id, new SavedTeamRepository.Record(id, "home", 1, "retired", historical.toString()));
		adapter = new BrowserSavedTeamJson(new SavedTeamService(repository, catalog));
		loaded = send(request("load").add("teamId", id));
		assertEquals("VERSION_UNAVAILABLE", loaded.getString("versionStatus", "")); assertEquals(historical, loaded.get("document"));
		assertTrue(loaded.get("validation").asObject().get("total").isNull());
		unchanged(update(historical, draft()), "VERSION_UNAVAILABLE");
		unchanged(request("create").add("draft", historical.get("draft")), "VERSION_UNAVAILABLE");
		unchanged(request("import").add("document", historical), "VERSION_UNAVAILABLE");
	}
	@Test
	void persistenceFailuresAndConcurrentCompareAndSwapFailuresAreAtomic() {
		JsonObject document = create(); repository.fail = true;
		unchanged(update(document, draft()), "PERSISTENCE_FAILED");
		unchanged(request("create").add("draft", draft()), "PERSISTENCE_FAILED");
		unchanged(request("import").add("document", document), "PERSISTENCE_FAILED");
		repository.fail = false; repository.conflict = true;
		unchanged(update(document, draft()), "CONFLICT");
		unchanged(request("import").add("document", document), "CONFLICT");
	}
	@Test
	void ownerScopeAndNarrowImmutableSnapshotsExcludeServerData() {
		JsonObject document = create(); String id = document.getString("teamId", "");
		assertEquals("NOT_FOUND", adapter.handle("away", request("load").add("teamId", id).toString()).getString("code", ""));
		assertEquals(0, adapter.handle("away", request("list").toString()).get("teams").asArray().size());
		assertEquals("AUTHENTICATION_REQUIRED", adapter.handle(null, request("create").add("draft", draft()).toString()).getString("code", ""));
		assertEquals(document, new SavedTeamJson(catalog).encode(new SavedTeamJson(catalog).decode(document.toString())));
		assertEquals(1, repository.rows.size());
	}
	@Test
	void lostCommitAcknowledgementReturnsAttemptedIdentityAndRequiresLoadToReconcile() {
		repository.unknown = true;
		JsonObject response = send(request("create").add("draft", draft()));
		assertEquals("SAVE_OUTCOME_UNKNOWN", response.getString("code", ""));
		JsonObject attempted = response.get("document").asObject();
		assertEquals(attempted, send(request("load").add("teamId", attempted.get("teamId"))).get("document"));
		assertEquals(1, repository.rows.size());
	}
	private static final class MemoryRepository implements SavedTeamRepository {
		private final Map<String, Record> rows = new LinkedHashMap<>();
		private boolean fail, conflict, unknown;
		public Record find(String owner, String teamId) { Record record = rows.get(teamId); return record != null && record.owner.equals(owner) ? record : null; }
		public List<Record> list(String owner) { List<Record> result = new ArrayList<>(); for (Record record : rows.values()) if (record.owner.equals(owner)) result.add(record); return result; }
		public void insert(Record record) throws SQLException { if (fail) throw new SQLException("private DB details"); rows.put(record.teamId, record); if (unknown) throw new OutcomeUnknown(record, new SQLException("private details")); }
		public boolean replace(Record record, int expected) throws SQLException {
			if (fail) throw new SQLException("private DB details");
			if (conflict || rows.get(record.teamId).documentVersion != expected) return false;
			rows.put(record.teamId, record); return true;
		}
		public boolean delete(String owner, String teamId, int expected) {
			Record record = find(owner, teamId);
			if (record == null || record.documentVersion != expected) return false;
			rows.remove(teamId); return true;
		}
	}
}
