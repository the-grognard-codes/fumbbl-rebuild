package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.TargetSelectionState;
import com.fumbbl.ffb.model.change.ModelChange;
import com.fumbbl.ffb.model.change.ModelChangeId;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.server.GameLog;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.util.UtilBox;
import com.fumbbl.ffb.util.UtilPlayer;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.lang.reflect.Field;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RecoveryJournalTest {
	@Test void committedRecoveryLogFreezesLiveTargetSelectionAliasesAndDetectsSameLengthReset() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		GameLog log = nativeState(fixture.session).getGameLog();
		TargetSelectionState target = new TargetSelectionState("defender").select();
		ModelChangeList changes = new ModelChangeList(); changes.add(new ModelChange(ModelChangeId.FIELD_MODEL_SET_TARGET_SELECTION_STATE, null, target));
		ServerCommandModelSync command = new ServerCommandModelSync(changes, new ReportList(), null, null, 0, 0);
		command.setCommandNr(1000); log.add(command);
		String frozen = log.recoveryJsonFrom(0).toString(), live = log.toJsonValue().toString();
		target.commit(null); target.failed();
		assertTrue(target.isCommitted()); assertTrue(target.isFailed());
		assertNotEquals(live, log.toJsonValue().toString(), "The original native references still mutate normally");
		assertEquals(frozen, log.recoveryJsonFrom(0).toString(), "Committed recovery commands cannot mutate retroactively");
		assertSame(command, log.getServerCommands()[log.size() - 1]);
		long epoch = log.recoveryEpoch(); int count = log.size(); log.clear();
		for (int index = 0; index < count; index++) log.add(command);
		assertEquals(count, log.size()); assertTrue(log.recoveryEpoch() > epoch);
	}
	@Test void movementPickupAndBlitzBlockChoicesPreserveCommittedNativeCommands() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		fixture.advanceToTurn(); fixture.session.startSaveResumeRetention(System.currentTimeMillis());
		GameState state = nativeState(fixture.session); Game game = state.getGame();
		Player<?> mover = game.getActingTeam().getPlayers()[0], blitzer = game.getActingTeam().getPlayers()[1];
		Player<?> defender = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
		UtilBox.putAllPlayersIntoBox(game);
		place(game, mover, 4, 2); place(game, blitzer, 10, 8); place(game, defender, 12, 8);
		game.getFieldModel().setBallCoordinate(new FieldCoordinate(9, 2)); game.getFieldModel().setBallMoving(false);
		for (int index = 0; index < 20; index++) {
			DiceCategory roll = new DiceCategory(); roll.parseCommand("6", game, game.getActingTeam()); state.getDiceRoller().addTestRoll(roll);
		}
		for (int index = 0; index < 6; index++) {
			BlockDiceCategory roll = new BlockDiceCategory(); roll.parseCommand("push", game, game.getActingTeam()); state.getDiceRoller().addTestRoll(roll);
		}
		Verifier verifier = new Verifier(fixture);
		JsonObject ready = live(fixture.session);
		JsonObject moved = movement(fixture, ready, mover.getId(), "move", null,
			new JsonArray().add(new JsonObject().add("x", 9).add("y", 2)), "pickup");
		assertTrue(UtilPlayer.hasBall(game, mover)); verifier.verify();
		JsonObject block = movement(fixture, moved, blitzer.getId(), "blitz", defender.getId(), new JsonArray(), "blitz");
		verifier.verify();
		int decisions = 0;
		for (; decisions < 8; decisions++) {
			JsonObject chosen = null;
			for (JsonValue value : block.get("actions").asArray()) {
				JsonObject action = value.asObject(); String kind = action.getString("kind", "");
				if ("blockDie".equals(kind) || "push".equals(kind) || "followUp".equals(kind)
					|| "reroll".equals(kind) && action.getString("id", "").endsWith(":none")) { chosen = action; break; }
			}
			if (chosen == null) break;
			block = fixture.session.apply(chosen.getString("actor", null), fixture.request("action", "resolve-" + decisions, block)
				.add("actionId", chosen.get("id"))).get("state").asObject(); verifier.verify();
		}
		assertTrue(decisions >= 2, "Exercise actual block die and destination decisions");
	}

	@Test void reactiveTimeoutContinuesExactlyFromItsDurableNativePrompt() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		fixture.advanceToTurn(); fixture.session.startSaveResumeRetention(System.currentTimeMillis());
		GameState state = nativeState(fixture.session); Game game = state.getGame();
		game.setHomePlaying(true); game.setThrowerId(null); UtilBox.putAllPlayersIntoBox(game);
		Player<?> mover = game.getTeamHome().getPlayers()[0], reactor = game.getTeamAway().getPlayers()[0];
		place(game, mover, 9, 7); place(game, reactor, 7, 8);
		((RosterPlayer) reactor).addSkill(((SkillFactory) game.getFactory(FactoryType.Factory.SKILL)).forName("Diving Tackle"));
		game.getActingPlayer().setPlayerId(mover.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.MOVE); game.getActingPlayer().setDodging(true);
		state.pushCurrentStepOnStack();
		com.fumbbl.ffb.server.step.action.move.StepDivingTackle step = new com.fumbbl.ffb.server.step.action.move.StepDivingTackle(state);
		step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_FROM, new FieldCoordinate(8, 7)));
		step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_TO, new FieldCoordinate(9, 7)));
		step.setParameter(StepParameter.from(StepParameterKey.DODGE_ROLL, 4)); state.getStepStack().push(step); state.startNextStep();
		fixture.session.expireReactiveDecision(System.currentTimeMillis());
		Verifier verifier = new Verifier(fixture);
		JsonObject view = fixture.session.decorateSaveResume(fixture.session.reply("load", "ACCEPTED", false, "away")).get("state").asObject();
		assertTrue(fixture.session.expireReactiveDecision(view.get("reaction").asObject().getLong("expiresAt", -1)));
		verifier.verify();
	}
	@Test void nativeChoicesRollsAndTurnsRecoverExactlyAcrossCompactionWithoutReexecutingCommands() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		SetupSession session = fixture.session;
		session.startSaveResumeRetention(System.currentTimeMillis());
		RecoveryJournal journal = new RecoveryJournal();
		RecoveryRepository.Record base = new RecoveryRepository.Record(fixture.document.matchId, 1, session.recoveryArtifact());
		RecoveryJournal.Cursor cursor = journal.cursor(base);
		List<RecoveryRepository.Record> entries = new ArrayList<>();
		long generation = 1; int compactions = 0, accepted = 0;
		for (int index = 0; index < 75 && !session.isComplete(); index++) {
			String before = session.recoveryArtifact();
			JsonObject ready = session.reply("read", "ACCEPTED", false, "home").get("state").asObject();
			JsonObject request = next(fixture, ready, index);
			JsonObject response = session.apply(ready.getString("actor", null), request);
			assertEquals("ACCEPTED", response.getString("code", null), response.toString()); accepted++;
			String after = session.recoveryArtifact();
			prefixesAreUnchanged(before, after);
			RecoveryJournal.Change change = journal.change(session, cursor, generation);
			assertFalse(change == null);
			generation++;
			RecoveryRepository.Record restored;
			if (change.compact) {
				base = new RecoveryRepository.Record(fixture.document.matchId, generation, after);
				entries.clear(); cursor = journal.cursor(base); restored = base; compactions++;
			} else {
				JsonObject delta = JsonObject.readFrom(change.json).get("payload").asObject().get("state").asObject();
				assertEquals(1, delta.get("history").asArray().size());
				assertEquals(1, JsonArray.readFrom(delta.getString("eventsJson", null)).size());
				assertEquals(1, delta.get("transcript").asObject().get("records").asArray().size());
				entries.add(new RecoveryRepository.Record(fixture.document.matchId, generation, change.json));
				cursor = change.next;
				restored = journal.restore(fixture.document.matchId, generation, base.generation, base.json, entries);
			}
			assertEquals(after, restored.json, "Exact compatibility at revision " + index);
			session = new SetupSession(fixture.server, fixture.document, restored.json);
			assertEquals(after, session.recoveryArtifact(), "Native restore does not consume dice or commands");
			cursor = journal.cursor(restored, session);
			assertNull(journal.change(session, cursor, generation), "Restoration alone is not another accepted action");
		}
		assertTrue(accepted >= 32, "Exercise the periodic checkpoint boundary");
		assertTrue(compactions > 0);
	}

	@Test void missingReorderedTamperedAndWrongGenerationEntriesFailClosed() throws Exception {
		SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
		fixture.advanceToTurn(); fixture.session.startSaveResumeRetention(System.currentTimeMillis());
		RecoveryJournal journal = new RecoveryJournal();
		RecoveryRepository.Record base = new RecoveryRepository.Record(fixture.document.matchId, 7, fixture.session.recoveryArtifact());
		RecoveryJournal.Cursor cursor = journal.cursor(base);
		JsonObject ready = fixture.session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
		fixture.session.apply(ready.getString("actor", null), next(fixture, ready, 0));
		RecoveryJournal.Change change = journal.change(fixture.session, cursor, 7);
		RecoveryRepository.Record record = new RecoveryRepository.Record(base.matchId, 8, change.json);
		assertCorrupt(() -> journal.restore(base.matchId, 8, 7, base.json, Collections.emptyList()));
		assertCorrupt(() -> journal.restore(base.matchId, 7, 7, base.json, Collections.singletonList(record)));
		assertCorrupt(() -> journal.restore(base.matchId, 9, 7, base.json, java.util.Arrays.asList(record, record)));
		assertCorrupt(() -> journal.restore(base.matchId, 8, 7, base.json,
			Collections.singletonList(new RecoveryRepository.Record(base.matchId, 8, change.json.replace("end-turn", "bad-turn")))));
		assertEquals(fixture.session.recoveryArtifact(), journal.restore(base.matchId, 8, 7, base.json, Collections.singletonList(record)).json);
	}

	private void assertCorrupt(Runnable restore) { assertEquals("RECOVERY_CORRUPT", assertThrows(MatchService.Failure.class, restore::run).code); }
	private JsonObject next(SetupSessionMovementTest.Fixture fixture, JsonObject view, int index) {
		JsonObject request = fixture.request("action", "journal-" + index, view);
		if ("SETUP".equals(view.getString("phase", null))) return request.set("operation", "confirm");
		if (!view.get("prompt").isNull()) {
			JsonObject prompt = view.get("prompt").asObject();
			return request.set("operation", "choice").add("promptId", prompt.get("id"))
				.add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
		}
		JsonObject action = null;
		for (JsonValue value : view.get("actions").asArray()) if ("endTurn".equals(value.asObject().getString("kind", null))) action = value.asObject();
		if (action == null) action = view.get("actions").asArray().get(0).asObject();
		return request.add("actionId", action.get("id"));
	}
	private void prefixesAreUnchanged(String before, String after) {
		JsonObject old = JsonObject.readFrom(before).get("payload").asObject(), now = JsonObject.readFrom(after).get("payload").asObject();
		prefix(old.get("history").asArray(), now.get("history").asArray());
		prefix(JsonArray.readFrom(old.getString("eventsJson", null)), JsonArray.readFrom(now.getString("eventsJson", null)));
		prefix(old.get("native").asObject().get("gameLog").asObject().get("commandArray").asArray(), now.get("native").asObject().get("gameLog").asObject().get("commandArray").asArray());
		prefix(old.get("transcript").asObject().get("records").asArray(), now.get("transcript").asObject().get("records").asArray());
	}
	private void prefix(JsonArray old, JsonArray now) {
		assertTrue(now.size() >= old.size());
		for (int index = 0; index < old.size(); index++) assertEquals(old.get(index), now.get(index), "Committed history is immutable");
	}
	private GameState nativeState(SetupSession session) throws Exception { Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session); }
	private void place(Game game, Player<?> player, int x, int y) {
		game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STANDING).changeActive(true));
		game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
	}
	private JsonObject live(SetupSession session) { return session.reply("load", "ACCEPTED", false, "home").get("state").asObject(); }
	private JsonObject movement(SetupSessionMovementTest.Fixture fixture, JsonObject ready, String player, String kind, String target, JsonArray points, String id) {
		String role = ready.getString("actor", null);
		JsonObject plan = fixture.session.movementPreview(role, ready.getInt("revision", -1), player, kind, target, points);
		JsonObject result = fixture.session.apply(role, fixture.request("movement", id, ready).add("playerId", player)
			.add("kind", kind).add("targetPlayerId", target == null ? JsonValue.NULL : JsonValue.valueOf(target)).add("waypoints", plan.get("waypoints")));
		assertEquals("ACCEPTED", result.getString("code", null)); return result.get("state").asObject();
	}
	private final class Verifier {
		final SetupSessionMovementTest.Fixture fixture; final RecoveryJournal journal = new RecoveryJournal();
		final RecoveryRepository.Record base; final List<RecoveryRepository.Record> entries = new ArrayList<>();
		RecoveryJournal.Cursor cursor; long generation = 1; String prior;
		Verifier(SetupSessionMovementTest.Fixture fixture) {
			this.fixture = fixture; prior = fixture.session.recoveryArtifact(); base = new RecoveryRepository.Record(fixture.document.matchId, 1, prior); cursor = journal.cursor(base);
		}
		void verify() {
			String after = fixture.session.recoveryArtifact(); prefixesAreUnchanged(prior, after);
			RecoveryJournal.Change change = journal.change(fixture.session, cursor, generation);
			assertFalse(change.compact); cursor = change.next;
			entries.add(new RecoveryRepository.Record(base.matchId, ++generation, change.json));
			RecoveryRepository.Record record = journal.restore(base.matchId, generation, 1, base.json, entries);
			assertEquals(after, record.json); assertEquals(after, new SetupSession(fixture.server, fixture.document, record.json).recoveryArtifact()); prior = after;
		}
	}
}
