package com.fumbbl.ffb.test;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.factory.InducementTypeFactory;
import com.fumbbl.ffb.inducement.Inducement;
import com.fumbbl.ffb.inducement.Usage;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupSession;
import com.fumbbl.ffb.util.UtilCards;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RerollChoicesTest {
	@Test void allNativeRerollSourcesStayExplicitAndUseTheirExactCommandsForBothCoaches() throws Exception {
		JsonArray journeys = new JsonArray();
		for (boolean home : new boolean[] {true, false}) for (String mode : new String[] {
			"team", "skill", "pro", "pro-failure", "pro-team", "pro-mascot", "pro-mascot-team", "decline", "mascot", "mascot-failure", "mascot-team",
			"block-team", "block-success", "block-pro", "block-pro-team", "block-pro-mascot-team", "block-mascot", "block-brawler", "block-consummate", "block-single", "block-multi", "block-multi-2", "block-multi-3", "block-opponent"}) {
			boolean block = mode.startsWith("block-");
			boolean proFallback = mode.contains("pro-") && !mode.endsWith("failure");
			String skill = mode.contains("pro") ? "Pro" : mode.equals("skill") ? "Thinking Man's Troll"
				: mode.endsWith("brawler") ? "Brawler" : mode.endsWith("consummate") ? "Thinking Man's Troll"
			: mode.endsWith("single") ? "Woodland Fury" : mode.contains("multi") ? "Savage Blow" : "";
			GameState state = new GameState(new TestServer().getServer()) {
				@Override public boolean usesLegacyPersistence() { return false; }
			};
			new GameStateBuilder(state).withRule("BB2025").withWeather(Weather.NICE).withBallAt(block ? 20 : 9, block ? 14 : 7)
				.withTeam(home, team -> team.player("actor", player -> player.at(10, 7).stats(6, 4, 3, 3, 9).skill(skill).skill(!block && proFallback ? "Loner" : "")))
				.withTeam(!home, team -> team.player("opponent", player -> player.at(block ? 11 : 20, 7).stats(6, mode.endsWith("opponent") ? 5 : 3, 3, 4, 9))).build();
			state.getGame().setHomePlaying(home);
			state.getGame().getFieldModel().setBallMoving(!block);
			state.getGame().getTurnData().setReRolls(mode.equals("skill") || mode.equals("mascot") || mode.equals("mascot-failure") ? 0 : 1);
			if (!skill.isEmpty()) assertTrue(UtilCards.hasSkill(state.getGame().getPlayerById("actor"), state.getGame().getRules().getSkillFactory().forName(skill)), skill);
			if (mode.contains("mascot")) {
				InducementTypeFactory factory = state.getGame().getFactory(FactoryType.Factory.INDUCEMENT_TYPE);
				state.getGame().getTurnData().getInducementSet().addInducement(new Inducement(factory.forName("teamMascot"), 1));
			}
			StepEngine.start(state);
			int first = block ? proFallback ? 1 : 6 : 1;
			int second = mode.endsWith("failure") || mode.equals("mascot-team") || !block && proFallback || block && mode.contains("mascot-team") ? 1 : 6;
			int third = !block && mode.equals("pro-mascot-team") ? 1 : 6;
			TestRolls.on(state).general(first, second, third, 6, 6, 6, 6, 6, 6, 6, 6)
				.block(mode.equals("block-success") ? "pushback" : "bothdown", mode.equals("block-success") ? "pow" : "skull", "pushback", "pushback", "pushback");
			SetupSession session = new SetupSessionTest().session(11, true);
			Field engine = SetupSession.class.getDeclaredField("state"); engine.setAccessible(true); engine.set(session, state);
			String role = home ? "home" : "away", other = home ? "away" : "home";
			submit(session, role, block ? "selectBlock" : "declarePass"); submit(session, role, block ? "block" : "move-9-7");
			JsonObject offered = view(session, role), otherCoach = view(session, other), spectator = normalize(session.spectatorView());
			JsonArray offeredReports = reports(session, offered.getInt("revision", -1));
			int originalRerolls = (home ? state.getGame().getTurnDataHome() : state.getGame().getTurnDataAway()).getReRolls();
			if (mode.contains("pro")) { find(offered, block ? "block-reroll:pro" : "reroll:pro"); find(offered, block ? "block-reroll:team" : "reroll:team"); }
			if (mode.equals("pro")) for (JsonValue item : offered.get("actions").asArray()) assertFalse(item.asObject().getString("id", "").contains("reroll:pro-"), "Non-Loner generic prompts do not offer failed-Pro-check fallback");
			String selected = mode.equals("decline") ? "reroll:none" : mode.equals("skill") ? "reroll:skill"
				: mode.endsWith("pro-mascot-team") ? (block ? "block-reroll:pro-mascot-team:0" : "reroll:pro-mascot-team")
				: mode.equals("pro-mascot") ? "reroll:pro-mascot"
				: mode.endsWith("pro-team") ? (block ? "block-reroll:pro-team:0" : "reroll:pro-team")
				: mode.contains("pro") ? block ? "block-reroll:pro:0" : "reroll:pro"
				: mode.equals("block-mascot") ? "block-reroll:mascot"
				: mode.equals("mascot-team") ? "reroll:mascot-team" : mode.startsWith("mascot") ? "reroll:mascot"
				: mode.equals("block-opponent") ? "block-reroll:none" : mode.equals("block-brawler") ? "block-reroll:brawler"
				: mode.equals("block-consummate") ? "block-reroll:single:0" : mode.equals("block-single") ? "block-reroll:block-single:0"
				: mode.contains("multi") ? "block-reroll:multi:" + (mode.endsWith("-2") ? 2 : mode.endsWith("-3") ? 3 : 1) : block ? "block-reroll:team" : "reroll:team";
			if (mode.contains("pro")) selected = block ? "block-reroll:pro" : "reroll:pro";
			if (mode.equals("block-opponent")) for (JsonValue item : offered.get("actions").asArray()) assertFalse(item.asObject().getString("kind", "").equals("blockDie"));
			JsonObject request = request(offered, find(offered, selected));
			assertEquals("WRONG_ACTOR", assertThrows(MatchService.Failure.class, () -> session.apply(other, request)).code);
			assertEquals("ACCEPTED", session.apply(role, request).getString("code", null));
			assertTrue(session.apply(role, request).getBoolean("duplicate", false));
			assertEquals("STALE_REVISION", assertThrows(MatchService.Failure.class,
				() -> session.apply(role, JsonObject.readFrom(request.toString()).set("requestId", UUID.randomUUID().toString()))).code);
			if (mode.startsWith("block-pro")) {
				if (proFallback) submit(session, role, mode.endsWith("mascot-team") ? "block-pro-test:mascot-team" : "block-pro-test:team");
				submit(session, role, "block-reroll-die:0");
			}
			if (!block && proFallback) submit(session, role, "pro-test:" + (mode.endsWith("mascot-team") ? "mascot-team" : mode.endsWith("mascot") ? "mascot" : "team"));
			JsonObject accepted = view(session, role);
			boolean teamSpent = mode.equals("team") || mode.equals("block-team") || mode.equals("block-success") || mode.endsWith("pro-team") || mode.endsWith("mascot-team");
			assertEquals(originalRerolls - (teamSpent ? 1 : 0), (home ? state.getGame().getTurnDataHome() : state.getGame().getTurnDataAway()).getReRolls(), mode);
			if (mode.contains("pro")) for (JsonValue item : accepted.get("actions").asArray()) assertFalse(item.asObject().getString("id", "").contains("reroll:pro"));
			if (mode.startsWith("block-pro")) {
				assertEquals("Choose PUSHBACK (die 1)", find(accepted, "block-die:0").getString("label", null));
				assertEquals("Choose SKULL (die 2)", find(accepted, "block-die:1").getString("label", null), "Pro and its fallback reroll only the selected die");
			}
			TurnData originalTurn = home ? state.getGame().getTurnDataHome() : state.getGame().getTurnDataAway();
			if (mode.contains("mascot")) assertFalse(originalTurn.getInducementSet().hasUsesLeft(originalTurn.getInducementSet().forUsage(Usage.CONDITIONAL_REROLL)), mode);
			if (block && !mode.endsWith("team") && !mode.endsWith("opponent") && !mode.endsWith("success") && !mode.endsWith("mascot")) {
				if (!mode.endsWith("-3")) find(accepted, mode.endsWith("-2") ? "block-die:0" : "block-die:1");
				if (!mode.endsWith("-2") && !mode.endsWith("-3")) assertEquals("Choose SKULL (die 2)", find(accepted, "block-die:1").getString("label", null), "Only the selected die is rerolled");
			}
			if (mode.equals("block-opponent")) {
				JsonObject opponentChoice = view(session, other); find(opponentChoice, "block-die:0");
				assertEquals(other, find(opponentChoice, "block-die:0").getString("actor", null));
			}
			journeys.add(new JsonObject().add("role", role).add("mode", mode).add("selectedId", request.get("actionId"))
				.add("offered", offered).add("otherCoach", otherCoach).add("spectator", spectator).add("accepted", accepted)
				.add("offeredReports", offeredReports).add("acceptedReports", reports(session, accepted.getInt("revision", -1)))
				.add("rerolls", (home ? state.getGame().getTurnDataHome() : state.getGame().getTurnDataAway()).getReRolls()));
			if (mode.equals("skill") || mode.equals("pro")) {
				submit(session, role, "endAction");
				submit(session, role, "endTurn");
				submit(session, other, "endTurn");
				state.getGame().getFieldModel().setBallCoordinate(new FieldCoordinate(8, 7));
				state.getGame().getFieldModel().setBallMoving(true);
				state.getDiceRoller().clearTestRolls();
				TestRolls.on(state).general(1, 6, 6, 6);
				submit(session, role, "declarePass");
				submit(session, role, "move-8-7");
				if (mode.equals("pro")) find(view(session, role), "reroll:pro");
				else {
					assertEquals(!home, state.getGame().isHomePlaying(), "Used once-per-half skill cannot reroll a repeated activation");
					for (JsonValue item : view(session, role).get("actions").asArray()) assertFalse(item.asObject().getString("id", "").contains("reroll:skill"));
				}
			}
		}
		String json = journeys.toString(); Files.write(Paths.get("target", "adr0003-reroll-choices.json"), json.getBytes(StandardCharsets.UTF_8));
		assertTrue(new String(Files.readAllBytes(Paths.get("..", "browser-client", "test", "fixtures", "adr0003-reroll-choices.json")), StandardCharsets.UTF_8).equals(json),
			"Native reroll fixture differs; inspect target/adr0003-reroll-choices.json");
	}
	private JsonArray reports(SetupSession session, int revision) {
		JsonArray reports = new JsonArray();
		JsonObject record = session.transcriptPage(revision, 1).get("records").asArray().get(0).asObject();
		for (JsonValue sync : record.get("native").asArray())
			for (JsonValue report : sync.asObject().get("reportList").asObject().get("reports").asArray()) {
				String id = report.asObject().getString("reportId", "");
				if (id.equals("blockRoll") || id.equals("pickUpRoll") || id.equals("reRoll") || id.equals("mascotUsed")) reports.add(report);
			}
		return reports;
	}
	private JsonObject normalize(JsonObject view) { return view.set("matchId", "00000000-0000-0000-0000-000000000117"); }
	private JsonObject view(SetupSession session, String role) { return normalize(session.reply("load", "ACCEPTED", false, role).get("state").asObject()); }
	private JsonObject request(JsonObject view, JsonObject action) { return new JsonObject().add("operation", "action").add("requestId", UUID.randomUUID().toString()).add("expectedRevision", view.get("revision")).add("actionId", action.get("id")); }
	private JsonObject find(JsonObject view, String suffix) {
		for (JsonValue item : view.get("actions").asArray()) if (item.asObject().getString("kind", "").equals(suffix) || item.asObject().getString("id", "").endsWith(":" + suffix)) return item.asObject();
		throw new AssertionError("Missing " + suffix);
	}
	private void submit(SetupSession session, String role, String action) { assertEquals("ACCEPTED", session.apply(role, request(view(session, role), find(view(session, role), action))).getString("code", null)); }
}
