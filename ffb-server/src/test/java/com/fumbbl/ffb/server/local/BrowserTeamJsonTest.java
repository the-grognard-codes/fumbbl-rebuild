package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;
import com.fumbbl.ffb.server.team.bb2025.TeamValidation;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class BrowserTeamJsonTest {
	private static RosterCatalog catalog;
	private static BrowserTeamJson json;
	@BeforeAll
	public static void initialize() { catalog = new RosterCatalog(); json = new BrowserTeamJson(catalog); }

	private JsonObject draft() {
		JsonArray players = new JsonArray();
		for (int slot = 1; slot <= 11; slot++) players.add(new JsonObject().add("id", "p" + slot)
			.add("slot", slot).add("positionId", "lineman").add("skillIds", new JsonArray()));
		return new JsonObject().add("catalogVersion", RosterCatalog.VERSION).add("ruleset", "BB2025")
			.add("rosterId", "human").add("presetId", RosterCatalog.PRESET).add("captainId", "p1")
			.add("players", players).add("resources", new JsonObject().add("rerolls", 2).add("assistantCoaches", 0)
				.add("cheerleaders", 0).add("apothecary", 1).add("dedicatedFans", 0));
	}
	private JsonObject player(JsonObject draft, int index) { return draft.get("players").asArray().get(index).asObject(); }
	private JsonObject namedDraft() {
		JsonObject result = draft().add("draftVersion", 2).add("teamName", "The Moles");
		for (int index = 0; index < 11; index++) player(result, index).add("jerseyNumber", index + 1).add("playerName", "Mole " + (index + 1));
		return result;
	}
	@Test
	public void namedDraftSeparatesJerseyNumbersFromRosterSlotsAndCanonicalizesNames() {
		JsonObject draft = namedDraft();
		player(draft, 0).set("jerseyNumber", 99);
		draft.set("teamName", "  The Moles  ");
		assertTrue(json.evaluate("named", draft).getBoolean("valid", false));
		assertEquals("The Moles", json.decodeDraft(draft).teamName);
		assertEquals(99, json.decodeDraft(draft).players.get(0).jerseyNumber);
		player(draft, 1).set("jerseyNumber", 99); rejects(draft, "DUPLICATE_JERSEY");
		player(draft, 1).set("jerseyNumber", 100); rejects(draft, "JERSEY_NUMBER");
		player(draft, 1).set("jerseyNumber", 2);
		draft.set("teamName", "Bad\nName"); rejects(draft, "TEAM_NAME");
		draft.set("teamName", "The Moles"); player(draft, 1).set("playerName", ""); rejects(draft, "PLAYER_NAME");
	}
	private void rejects(JsonObject draft, String code) {
		String before = draft.toString();
		JsonObject result = json.evaluate("test", draft);
		assertFalse(result.getBoolean("valid", true), result.toString());
		assertTrue(result.get("messages").asArray().values().stream().anyMatch(value -> code.equals(value.asObject().getString("code", null))), result.toString());
		assertEquals(before, draft.toString());
	}
	@Test
	public void validDraftIsPricedFromCatalogWithoutMutation() {
		JsonObject draft = draft(); String before = draft.toString();
		JsonObject result = json.evaluate("test", draft);
		assertTrue(result.getBoolean("valid", false)); assertEquals(700000, result.getInt("total", -1));
		assertEquals(before, draft.toString());
		player(draft, 1).set("positionId", "blitzer");
		assertEquals(735000, json.evaluate("test", draft).getInt("total", -1));
	}
	@Test
	public void catalogAndDraftAreDeeplyImmutable() {
		assertThrows(UnsupportedOperationException.class, () -> catalog.getPositions().clear());
		assertThrows(UnsupportedOperationException.class, () -> catalog.getSkills().clear());
		assertThrows(UnsupportedOperationException.class, () -> catalog.getResources().clear());
		assertThrows(UnsupportedOperationException.class, () -> catalog.getPositions().get("ogre").baseSkills.clear());
		TeamDraft draft = json.decodeDraft(draft());
		assertThrows(UnsupportedOperationException.class, () -> draft.players.clear());
		assertThrows(UnsupportedOperationException.class, () -> draft.players.get(0).skillIds.add("block"));
		assertThrows(UnsupportedOperationException.class, () -> draft.resources.put("rerolls", 8));
		assertTrue(new TeamValidation(catalog).evaluate(draft).isValid());
	}
	@Test
	public void catalogVersionRulesetRosterAndPresetNeverFallBack() {
		String[] fields = {"catalogVersion", "ruleset", "rosterId", "presetId"};
		String[] codes = {"CATALOG_VERSION", "RULESET", "ROSTER", "PRESET"};
		for (int i = 0; i < fields.length; i++) {
			JsonObject draft = draft().set(fields[i], "unknown"); rejects(draft, codes[i]);
			assertTrue(json.evaluate("t", draft).get("total").isNull());
		}
	}
	@Test
	public void identityPositionAndCaptainRejectionsAreExplicit() {
		JsonObject draft = draft(); player(draft, 1).set("id", "p1"); rejects(draft, "DUPLICATE_PLAYER");
		draft = draft(); player(draft, 1).set("slot", 1); rejects(draft, "DUPLICATE_SLOT");
		draft = draft(); player(draft, 1).set("slot", 0); rejects(draft, "SLOT");
		draft = draft(); player(draft, 1).set("positionId", "fixture.lineman"); rejects(draft, "POSITION");
		draft = draft(); draft.set("captainId", "absent"); rejects(draft, "CAPTAIN");
		draft = draft(); player(draft, 0).set("positionId", "ogre"); rejects(draft, "CAPTAIN_INELIGIBLE");
		draft = draft(); draft.get("players").asArray().remove(10); rejects(draft, "PLAYER_COUNT");
		draft = draft(); for (int i = 0; i < 3; i++) player(draft, i).set("positionId", "blitzer"); rejects(draft, "POSITION_LIMIT");
	}
	@Test
	public void skillsAreCheckedForIdentityAccessDuplicatesAndPoints() {
		for (String id : Arrays.asList("unrecognized", "pass", "right-stuff", "pro")) {
			JsonObject draft = draft(); player(draft, 0).set("skillIds", new JsonArray().add(id));
			rejects(draft, "unrecognized".equals(id) ? "SKILL" : "pro".equals(id) ? "DUPLICATE_SKILL" : "SKILL_INELIGIBLE");
		}
		JsonObject draft = draft(); player(draft, 0).set("skillIds", new JsonArray().add("block").add("block"));
		rejects(draft, "DUPLICATE_SKILL"); rejects(draft, "SKILL_LIMIT");
		draft = draft(); player(draft, 0).set("positionId", "blitzer").set("skillIds", new JsonArray().add("block")); rejects(draft, "DUPLICATE_SKILL");
		draft = draft(); for (int i = 0; i < 5; i++) player(draft, i).set("skillIds", new JsonArray().add("block")); rejects(draft, "ELITE_LIMIT");
		draft = draft(); for (int i = 0; i < 3; i++) player(draft, i).set("skillIds", new JsonArray().add("catch")); rejects(draft, "SECONDARY_LIMIT");
		draft = draft(); for (int i = 0; i < 9; i++) player(draft, i).set("skillIds", new JsonArray().add("sure-hands")); rejects(draft, "SKILL_POINTS");
		draft = draft(); player(draft, 0).set("skillIds", new JsonArray().add("catch"));
		assertEquals(2, json.evaluate("t", draft).getInt("skillPoints", -1));
		assertEquals(700000, json.evaluate("t", draft).getInt("total", -1));
	}
	@Test
	public void conditionalSkillPurchasesRequireTheirStartingTraits() {
		for (String id : Arrays.asList("lethal-flight", "saboteur", "bullseye", "strong-arm")) {
			JsonObject draft = draft();
			player(draft, 0).set("skillIds", new JsonArray().add(id));
			rejects(draft, "SKILL_INELIGIBLE");
		}
		JsonObject halfling = draft();
		player(halfling, 0).set("positionId", "halfling").set("skillIds", new JsonArray().add("lethal-flight"));
		assertTrue(json.evaluate("t", halfling).getBoolean("valid", false));
		for (String id : Arrays.asList("bullseye", "strong-arm")) {
			JsonObject ogre = draft().set("captainId", "p2");
			player(ogre, 0).set("positionId", "ogre").set("skillIds", new JsonArray().add(id));
			assertTrue(json.evaluate("t", ogre).getBoolean("valid", false), id);
		}
	}
	@Test
	public void additionalHumanSkillsUseTheirPositionAccessAndEliteLimits() {
		String[] skills = {"guard", "wrestle", "sidestep", "sure-feet", "mighty-blow"};
		String[] positions = {"blitzer", "lineman", "catcher", "halfling", "blitzer"};
		for (int i = 0; i < skills.length; i++) {
			JsonObject draft = draft();
			player(draft, 1).set("positionId", positions[i]).set("skillIds", new JsonArray().add(skills[i]));
			JsonObject result = json.evaluate("skill", draft);
			assertTrue(result.getBoolean("valid", false), result.toString());
			assertEquals(1, result.getInt("skillPoints", -1));
		}
		JsonObject secondary = draft();
		player(secondary, 1).set("skillIds", new JsonArray().add("guard"));
		assertTrue(json.evaluate("secondary", secondary).getBoolean("valid", false));
		assertEquals(2, json.evaluate("secondary", secondary).getInt("skillPoints", -1));
		JsonObject duplicate = draft();
		player(duplicate, 1).set("positionId", "ogre").set("skillIds", new JsonArray().add("mighty-blow"));
		rejects(duplicate, "DUPLICATE_SKILL");
		JsonObject elite = draft();
		for (int i = 0; i < 5; i++) player(elite, i + 1).set("skillIds", new JsonArray().add("guard"));
		rejects(elite, "ELITE_LIMIT");
	}
	@Test
	public void quantitiesAndOverBudgetCannotOverflowOrChangeInput() {
		for (String id : catalog.getResources().keySet()) {
			for (int invalid : new int[]{-1, catalog.getResources().get(id).maximum + 1, Integer.MAX_VALUE}) {
				JsonObject draft = draft(); draft.get("resources").asObject().set(id, invalid); rejects(draft, "QUANTITY");
				assertTrue(json.evaluate("t", draft).get("total").isNull());
			}
		}
		JsonObject draft = draft();
		for (int slot = 12; slot <= 16; slot++) draft.get("players").asArray().add(new JsonObject().add("id", "p" + slot).add("slot", slot).add("positionId", "lineman").add("skillIds", new JsonArray()));
		draft.get("resources").asObject().set("rerolls", 8);
		rejects(draft, "OVER_BUDGET"); assertEquals(1250000, json.evaluate("t", draft).getInt("total", -1));
	}
	@Test
	public void untrustedJsonRejectsClientClaimsAndWrongShapesWithoutMutation() {
		for (String field : Arrays.asList("total", "cost", "quantity", "skills", "imageUrl", "class", "dice", "teamSkeleton")) {
			JsonObject draft = draft().add(field, 0); String before = draft.toString();
			assertThrows(RuntimeException.class, () -> json.evaluate("t", draft)); assertEquals(before, draft.toString());
		}
		JsonObject draft = draft(); player(draft, 0).add("cost", 1);
		assertThrows(RuntimeException.class, () -> json.decodeDraft(draft));
		JsonObject duplicate = JsonObject.readFrom(draft().toString().replace("\"slot\":1,", "\"slot\":1,\"slot\":2,"));
		assertThrows(RuntimeException.class, () -> json.decodeDraft(duplicate));
		for (JsonValue value : Arrays.asList(JsonValue.valueOf(1.5), JsonValue.valueOf("1"), JsonValue.NULL, JsonValue.TRUE)) {
			JsonObject invalid = draft(); invalid.get("resources").asObject().set("rerolls", value);
			assertThrows(RuntimeException.class, () -> json.decodeDraft(invalid));
		}
		JsonObject oversized = draft(); for (int i = 0; i < 6; i++) oversized.get("players").asArray().add(player(oversized, 0));
		assertThrows(RuntimeException.class, () -> json.decodeDraft(oversized));
		assertThrows(RuntimeException.class, () -> json.checkEnvelope(String.join("", Collections.nCopies(16385, "x"))));
		assertThrows(RuntimeException.class, () -> json.checkEnvelope(String.join("", Collections.nCopies(6000, "\u20ac"))));
		assertThrows(RuntimeException.class, () -> json.checkEnvelope("[[[[[[[[[0]]]]]]]]]"));
		json.checkEnvelope("{\"text\":\"[[[[[[[[[[[[\"}");
	}
	@Test
	public void pinnedWireFixtureMatchesServerCatalogAndEngineMappings() throws Exception {
		String fixture = new String(Files.readAllBytes(Paths.get("../browser-client/test/fixtures/catalog-v1.json")), StandardCharsets.UTF_8);
		assertEquals(JsonObject.readFrom(fixture), json.catalog("catalog-fixture"));
		assertTrue(json.catalog("catalog-fixture").toString().getBytes(StandardCharsets.UTF_8).length <= 16384);
		assertEquals(3, catalog.getPositions().get("ogre").skillValue("loner"));
		assertEquals("AG", catalog.getPositions().get("ogre").secondary);
	}
}
