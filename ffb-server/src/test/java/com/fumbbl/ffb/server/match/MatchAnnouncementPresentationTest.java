package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.BlockDiceCategory;
import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.kickoff.bb2025.KickoffResult;
import com.fumbbl.ffb.mechanics.PassResult;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.factory.SequenceGeneratorFactory;
import com.fumbbl.ffb.server.step.StepId;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.generator.SequenceGenerator;
import com.fumbbl.ffb.server.step.generator.ThrowTeamMate;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MatchAnnouncementPresentationTest {
    @Test void voluntaryEndAndRecoveryProduceOnlyTheNextAuthoritativeTurnStart() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        JsonObject ready = fixture.advanceToTurn();
        List<JsonObject> initial = allEvents(fixture.session);
        assertEquals(List.of("weather", "kickoff", "turnStart"), initial.stream().map(e -> e.getString("kind", null)).toList());
        assertEquals("turnStart", initial.getLast().getString("kind", null));
        Game game = state(fixture.session).getGame();
        assertEquals(game.getTurnData().getTurnNr(), initial.getLast().getInt("turn", -1));
        SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        int from = ready.getInt("revision", -1) + 1;
        JsonObject request = fixture.request("action", "finish-turn", ready).add("actionId", action(ready, "endTurn").get("id"));
        JsonObject after = recovered.apply(ready.getString("actor", null), request).get("state").asObject();
        List<JsonObject> events = events(recovered.transcriptPage(from, 1).get("records").asArray().get(0).asObject().get("native").asArray());
        assertEquals(1, events.size(), events.toString());
        assertEquals("turnStart", events.getFirst().getString("kind", null));
        Game actual = state(recovered).getGame();
        assertEquals(actual.isHomePlaying() ? "home" : "away", events.getFirst().getString("team", null));
        assertEquals(actual.getTurnData().getTurnNr(), events.getFirst().getInt("turn", -1));
        assertTrue(recovered.apply(ready.getString("actor", null), request).getBoolean("duplicate", false));
        assertEquals(after.getInt("revision", -1) + 1, recovered.transcriptPage(0, 1).getInt("total", -1));
    }

    @Test void ownAndOffTurnScoresTakePrecedenceAndPrecedeNewSetup() throws Exception {
        for (boolean offTurn : new boolean[] {false, true}) {
            SetupSessionMovementTest.Fixture fixture = fixture();
            JsonObject ready = fixture.advanceToTurn();
            Game game = state(fixture.session).getGame();
            boolean scorerHome = offTurn != game.isHomePlaying();
            Player<?> scorer = (scorerHome ? game.getTeamHome() : game.getTeamAway()).getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            FieldCoordinate endzone = new FieldCoordinate(scorerHome ? 25 : 0, 7);
            game.getFieldModel().setPlayerCoordinate(scorer, endzone);
            game.getFieldModel().setPlayerState(scorer, new PlayerState(PlayerState.STANDING));
            game.getFieldModel().setBallCoordinate(endzone);
            game.getFieldModel().setBallInPlay(true);
            game.getFieldModel().setBallMoving(false);
            int revision = ready.getInt("revision", -1);
            fixture.session.apply(ready.getString("actor", null), fixture.request("action", "score", ready)
                .add("actionId", action(ready, "endTurn").get("id")));
            JsonArray outcomes = fixture.session.transcriptPage(revision + 1, 1).get("records").asArray().get(0).asObject().get("native").asArray();
            List<JsonObject> events = events(outcomes);
            assertEquals(1, events.size(), outcomes.toString());
            assertEquals("touchdown", events.getFirst().getString("kind", null));
            assertEquals(scorerHome ? "home" : "away", events.getFirst().getString("team", null));
            int announcement = -1;
            for (int index = 0; index < outcomes.size(); index++) {
                JsonObject sync = outcomes.get(index).asObject();
                if (sync.get("matchAnnouncements") != null) announcement = index;
                for (JsonValue change : sync.get("modelChangeList").asObject().get("modelChangeArray").asArray())
                    if ("gameSetTurnMode".equals(change.asObject().getString("modelChangeId", null))
                        && "setup".equals(change.asObject().getString("modelChangeValue", null)))
                        assertTrue(announcement >= 0 && announcement < index, "Touchdown must precede the first setup transition");
            }
            assertTrue(announcement >= 0);
        }
    }

    @Test void friendlyThrowCollisionUsesConfirmedVictimAndRetainsResolutionOrder() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        GameState state = state(fixture.session);
        Game game = state.getGame();
        String team = game.isHomePlaying() ? "home" : "away";
        Player<?> victim = game.getActingTeam().getPlayers()[2];
        int cursor = (int) state.getLastCommandNr();
        JsonObject initial = beginCommittedThrow(fixture.session, true, false, false);
        List<JsonObject> outcomes = capture(fixture.session, cursor);
        List<JsonObject> events = events(array(outcomes));
        assertEquals(List.of("turnover", "turnStart"), events.stream().map(e -> e.getString("kind", null)).toList());
        assertEquals(team, events.getFirst().getString("team", null));
        assertTrue(events.getFirst().getString("reason", "").contains(victim.getName()));
        assertTrue(events.getFirst().getString("reason", "").contains("thrown player"));
        assertTrue(game.getFieldModel().getPlayerState(victim).isProneOrStunned());
        assertResolutionBeforeAnnouncement(outcomes);
        Files.writeString(Path.of("target/match-announcement-ttm-native.json"), new JsonObject()
            .add("initialState", initial).add("native", array(outcomes)).add("state", fixture.session.spectatorView()).toString());
    }

    @Test void thrownPlayerExitingThePitchHasAConfirmedCauseWithAndWithoutTheBall() throws Exception {
        for (boolean ball : new boolean[] {false, true}) {
            SetupSessionMovementTest.Fixture fixture = fixture();
            fixture.advanceToTurn();
            GameState state = state(fixture.session);
            Player<?> thrown = state.getGame().getActingTeam().getPlayers()[1];
            int cursor = (int) state.getLastCommandNr();
            beginCommittedThrow(fixture.session, false, true, ball);
            List<JsonObject> outcomes = capture(fixture.session, cursor);
            List<JsonObject> events = events(array(outcomes));
            assertEquals(List.of("turnover", "turnStart"), events.stream().map(e -> e.getString("kind", null)).toList());
            assertTrue(events.getFirst().getString("reason", "").contains(thrown.getName()));
            assertTrue(events.getFirst().getString("reason", "").contains("left the pitch"));
            assertResolutionBeforeAnnouncement(outcomes);
        }
    }

    @Test void failedLandingWithoutTheBallDoesNotAnnounceATurnover() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        GameState state = state(fixture.session);
        boolean home = state.getGame().isHomePlaying();
        int cursor = (int) state.getLastCommandNr();
        beginCommittedThrow(fixture.session, false, false, false);
        List<JsonObject> outcomes = capture(fixture.session, cursor);
        assertTrue(events(array(outcomes)).isEmpty());
        assertEquals(home, state.getGame().isHomePlaying());
        assertTrue(outcomes.stream().anyMatch(sync -> sync.toString().contains("rightStuffRoll")));
    }

    @Test void pendingConfirmedCauseSurvivesCheckpointAndBonusModesDoNotStartNumberedTurns() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
        presentation.reason(game, "Team-mate Test was hit by thrown player Flyer.");
        presentation.cause(game, StepId.HANDLE_DROP_PLAYER_CONTEXT, true);
        MatchAnnouncementPresentation restored = new MatchAnnouncementPresentation();
        restored.restore(JsonObject.readFrom(presentation.checkpoint().toString()));
        restored.end(game, null, false);
        game.setHomePlaying(!game.isHomePlaying());
        game.getTurnData().setTurnNr(6);
        restored.playable(game);
        JsonObject sync = new JsonObject().add("commandNr", 42);
        restored.decorate(List.of(sync));
        List<JsonObject> events = events(new JsonArray().add(sync));
        assertEquals(2, events.size());
        assertEquals("Team-mate Test was hit by thrown player Flyer.", events.getFirst().getString("reason", null));
        assertEquals(6, events.getLast().getInt("turn", -1));
        for (TurnMode mode : new TurnMode[] {TurnMode.SETUP, TurnMode.KICKOFF, TurnMode.BLITZ, TurnMode.QUICK_SNAP}) {
            game.setTurnMode(mode);
            restored.end(game, null, false);
            restored.playable(game);
        }
        game.setTurnMode(TurnMode.REGULAR);
        restored.end(game, null, true);
        JsonObject quiet = new JsonObject().add("commandNr", 43);
        restored.decorate(List.of(quiet));
        assertEquals("halfTime", events(new JsonArray().add(quiet)).getFirst().getString("kind", null));
    }

    @Test void rerolledPickupSuccessAndDeclinedPickupFailureRemainDistinctAcrossRecovery() throws Exception {
        for (boolean reroll : new boolean[] {true, false}) {
            SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(1, true);
            state(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
            JsonObject ready = fixture.advanceToTurn();
            GameState nativeState = state(fixture.session);
            Game game = nativeState.getGame();
            Player<?> runner = game.getActingTeam().getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            place(game, runner, 7, 7, PlayerState.STANDING);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(8, 7));
            game.getFieldModel().setBallMoving(true);
            game.getFieldModel().setBallInPlay(true);
            forceGeneral(nativeState, 1, 6, 6, 6, 6, 6);
            String role = ready.getString("actor", null);
            ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
            JsonObject paused = fixture.session.apply(role, fixture.request("movement", "pickup", ready)
                .add("playerId", runner.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
                .add("waypoints", new JsonArray().add(new JsonObject().add("x", 8).add("y", 7))))
                .get("state").asObject();
            assertTrue(allEvents(fixture.session).stream().noneMatch(e -> "turnover".equals(e.getString("kind", null))));
            SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            JsonObject choice = null;
            for (JsonValue value : paused.get("actions").asArray()) {
                JsonObject offered = value.asObject();
                if ("reroll".equals(offered.getString("kind", null)) && offered.getString("id", "").endsWith(reroll ? ":team" : ":none")) choice = offered;
            }
            assertTrue(choice != null, paused.toString());
            recovered.apply(role, fixture.request("action", "pickup-response", paused).add("actionId", choice.get("id")));
            List<JsonObject> turnovers = allEvents(recovered).stream().filter(e -> "turnover".equals(e.getString("kind", null))).toList();
            assertEquals(reroll ? 0 : 1, turnovers.size());
            if (!reroll) assertEquals(runner.getName() + " failed to pick up the ball.", turnovers.getFirst().getString("reason", null));
        }
    }

    @Test void nativeAttackerDownNamesTheBlockingPlayer() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        JsonObject ready = fixture.advanceToTurn();
        GameState nativeState = state(fixture.session);
        Game game = nativeState.getGame();
        Player<?> attacker = game.getActingTeam().getPlayers()[0];
        Player<?> defender = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, attacker, 7, 7, PlayerState.STANDING);
        place(game, defender, 8, 7, PlayerState.STANDING);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(20, 14));
        game.getFieldModel().setBallMoving(true);
        List<DiceCategory> dice = new ArrayList<>();
        for (int index = 0; index < 6; index++) {
            BlockDiceCategory die = new BlockDiceCategory(); die.parseCommand("skull", game, game.getTeamHome()); dice.add(die);
        }
        nativeState.getDiceRoller().getTestRolls().put("Block", dice);
        String role = ready.getString("actor", null);
        ready = fixture.session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        JsonObject blocked = fixture.session.apply(role, fixture.request("movement", "block", ready)
            .add("playerId", attacker.getId()).add("kind", "blitz").add("targetPlayerId", defender.getId())
            .add("waypoints", new JsonArray())).get("state").asObject();
        fixture.session.apply(blocked.getString("actor", null), fixture.request("action", "skull", blocked)
            .add("actionId", action(blocked, "blockDie").get("id")));
        List<JsonObject> turnovers = allEvents(fixture.session).stream().filter(e -> "turnover".equals(e.getString("kind", null))).toList();
        assertEquals(1, turnovers.size());
        assertEquals(attacker.getName() + " was knocked down performing a block.", turnovers.getFirst().getString("reason", null));
    }

    @Test void revertedEndTurnClearsCauseAndConfirmedFinalTurnStillAnnounces() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture(); fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
        presentation.cause(game, StepId.MOVE_DODGE, true);
        presentation.cause(game, StepId.STEADY_FOOTING, false);
        presentation.end(game, null, false);
        JsonObject noTurnover = new JsonObject().add("commandNr", 1);
        presentation.decorate(List.of(noTurnover));
        assertTrue(events(new JsonArray().add(noTurnover)).isEmpty());
        presentation.cause(game, StepId.PICK_UP, true);
        presentation.end(game, null, true);
        JsonObject finalTurn = new JsonObject().add("commandNr", 2);
        presentation.decorate(List.of(finalTurn));
        List<JsonObject> events = events(new JsonArray().add(finalTurn));
        assertEquals(2, events.size());
        assertEquals("halfTime", events.getLast().getString("kind", null));
        assertEquals("turnover", events.getFirst().getString("kind", null));
        assertEquals("A rules-triggered turnover ended the turn.", events.getFirst().getString("reason", null));
    }

    @Test void everyKickoffWaitsForPlayableTurnAndSurvivesRecovery() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        JsonArray contracts = new JsonArray();
        for (KickoffResult result : KickoffResult.values()) {
            MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
            game.setTurnMode(TurnMode.KICKOFF);
            presentation.kickoff(game, result);
            game.getFieldModel().setWeather(Weather.POURING_RAIN);
            if (result == KickoffResult.WEATHER_CHANGE) presentation.weather(game);
            for (TurnMode mode : new TurnMode[] {TurnMode.SETUP, TurnMode.KICKOFF, TurnMode.QUICK_SNAP, TurnMode.BLITZ}) {
                game.setTurnMode(mode);
                presentation.playable(game);
                JsonObject quiet = new JsonObject().add("commandNr", 1);
                presentation.decorate(List.of(quiet));
                assertTrue(events(new JsonArray().add(quiet)).isEmpty());
            }
            MatchAnnouncementPresentation recovered = new MatchAnnouncementPresentation();
            recovered.restore(JsonObject.readFrom(presentation.checkpoint().toString()));
            game.setTurnMode(TurnMode.REGULAR);
            recovered.playable(game);
            recovered.playable(game);
            JsonObject sync = new JsonObject().add("commandNr", 2);
            recovered.decorate(List.of(sync));
            List<JsonObject> actual = events(new JsonArray().add(sync));
            assertEquals(result == KickoffResult.WEATHER_CHANGE
                ? List.of("kickoff", "weather", "turnStart") : List.of("kickoff", "turnStart"),
                actual.stream().map(e -> e.getString("kind", null)).toList());
            assertEquals(result.getName(), actual.getFirst().getString("headline", null));
            assertEquals(result.getDescription(), actual.getFirst().getString("reason", null));
            contracts.add(actual.getFirst());
        }
        MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
        for (Weather weather : Weather.values()) {
            game.getFieldModel().setWeather(weather);
            presentation.weather(game);
            presentation.weather(game);
            JsonObject sync = new JsonObject().add("commandNr", 3);
            presentation.decorate(List.of(sync));
            List<JsonObject> actual = events(new JsonArray().add(sync));
            if (weather == Weather.INTRO) assertTrue(actual.isEmpty());
            else {
                assertEquals(1, actual.size());
                assertEquals(weather.getName(), actual.getFirst().getString("headline", null));
                contracts.add(actual.getFirst());
            }
        }
        Files.writeString(Path.of("target/match-splash-events.json"), contracts.toString());
        Path browserFixture = Path.of("../browser-client/test/fixtures/match-splash-events.json");
        assertEquals(contracts, JsonArray.readFrom(Files.readString(browserFixture)),
            "Refresh the committed browser fixture from ffb-server/target/match-splash-events.json");
    }

    @Test void kickoffAttributionUsesTheKickingAndReceivingSides() throws Exception {
        for (KickoffResult result : List.of(KickoffResult.QUICK_SNAP, KickoffResult.HIGH_KICK, KickoffResult.CHARGE)) {
            List<String> kickers = new ArrayList<>();
            for (String receiveOption : List.of("receive", "kick")) {
                SetupSessionMovementTest.Fixture fixture = fixture();
                GameState engine = state(fixture.session);
                int firstDie = result == KickoffResult.HIGH_KICK ? 2 : 4;
                int secondDie = result == KickoffResult.CHARGE ? 6 : result == KickoffResult.QUICK_SNAP ? 5 : 3;
                JsonObject turn = fixture.advanceToTurn(receiveOption, view -> {
                    JsonArray actions = view.get("actions").asArray();
                    JsonObject first = actions.get(0).asObject();
                    if ("kickoff".equals(first.getString("kind", null))) {
                        String kicker = first.getString("actor", null);
                        kickers.add(kicker);
                        String target = "home".equals(kicker) ? ":kick-19-7" : ":kick-6-7";
                        forceGeneral(engine, 1, 1, firstDie, secondDie, 1);
                        for (JsonValue offered : actions) {
                            JsonObject candidate = offered.asObject();
                            if (candidate.getString("id", "").endsWith(target)) return candidate;
                        }
                        throw new AssertionError("Missing kickoff target " + target);
                    }
                    for (JsonValue offered : actions) {
                        JsonObject candidate = offered.asObject();
                        String id = candidate.getString("id", "");
                        if (id.endsWith(":decline-event") || id.endsWith(":end-event")) return candidate;
                    }
                    return first;
                });
                JsonObject kickoff = allEvents(fixture.session).stream().filter(event -> "kickoff".equals(event.getString("kind", null)))
                    .findFirst().orElseThrow();
                assertEquals(result.name(), kickoff.getString("code", null));
                String kicking = kickers.getLast();
                String receiving = "home".equals(kicking) ? "away" : "home";
                assertEquals(receiving, turn.getString("actor", null));
                assertEquals(result == KickoffResult.CHARGE ? kicking : receiving, kickoff.getString("team", null), result.name());
                assertTrue(kickoff.getBoolean("teamSpecific", false));
            }
            assertEquals(List.of("away", "home"), kickers.stream().sorted().toList());
        }
    }

    @Test void unchangedKickoffWeatherStillCarriesTheEngineLabel() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
        game.getFieldModel().setWeather(Weather.NICE);
        presentation.weather(game);
        presentation.recorded();
        game.setTurnMode(TurnMode.KICKOFF);
        presentation.kickoff(game, KickoffResult.WEATHER_CHANGE);
        presentation.weather(game);
        game.setTurnMode(TurnMode.REGULAR);
        presentation.playable(game);
        JsonObject sync = new JsonObject().add("commandNr", 1);
        presentation.decorate(List.of(sync));
        List<JsonObject> facts = events(new JsonArray().add(sync));
        assertEquals(List.of("kickoff", "turnStart"), facts.stream().map(e -> e.getString("kind", null)).toList());
        assertEquals(Weather.NICE.getName(), facts.getFirst().get("weather").asObject().getString("headline", null));
    }

    @Test void restoresAFullMatchCheckpointWithLegacyAnnouncementFields() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        JsonObject payload = fixture.session.orderedRecoveryPayload();
        JsonObject announcements = payload.get("matchAnnouncements").asObject();
        JsonValue lastTurn = announcements.get("lastTurn");
        announcements.remove("lastWeather").remove("pendingKickoff").remove("deferredWeather");
        String artifact = new RecoveryArtifactJson().encodeCheckpoint(payload).envelope();

        SetupSession restored = new SetupSession(fixture.server, fixture.document, artifact);
        assertEquals(fixture.session.revision(), restored.revision());
        JsonObject currentAnnouncements = restored.orderedRecoveryPayload().get("matchAnnouncements").asObject();
        assertEquals(lastTurn, currentAnnouncements.get("lastTurn"));
        assertEquals(JsonValue.NULL, currentAnnouncements.get("lastWeather"));
        assertEquals(JsonValue.NULL, currentAnnouncements.get("pendingKickoff"));
        assertEquals(JsonValue.NULL, currentAnnouncements.get("deferredWeather"));
    }

    @Test void rejectsCheckpointsMissingRequiredFields() {
        MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
        JsonObject incomplete = presentation.checkpoint().remove("lastWeather");
        assertThrows(IllegalArgumentException.class, () -> presentation.restore(incomplete));
        JsonObject malformed = presentation.checkpoint().remove("lastWeather").add("wrongField", JsonValue.NULL);
        assertThrows(IllegalArgumentException.class, () -> presentation.restore(malformed));
    }

    @Test void halfEndingTouchdownPrecedesHalfTimeAndConcessionIsLast() throws Exception {
        SetupSessionMovementTest.Fixture fixture = fixture();
        fixture.advanceToTurn();
        Game game = state(fixture.session).getGame();
        MatchAnnouncementPresentation presentation = new MatchAnnouncementPresentation();
        game.setHalf(1);
        presentation.end(game, game.getTeamHome().getPlayers()[0], true);
        JsonObject sync = new JsonObject().add("commandNr", 4);
        presentation.decorate(List.of(sync));
        assertEquals(List.of("touchdown", "halfTime"), events(new JsonArray().add(sync)).stream().map(e -> e.getString("kind", null)).toList());
        game.setHalf(2);
        presentation.end(game, game.getTeamAway().getPlayers()[0], true);
        game.getGameResult().getTeamResultHome().setConceded(true);
        presentation.finished(game);
        JsonObject end = new JsonObject().add("commandNr", 5);
        presentation.decorate(List.of(end));
        List<JsonObject> actual = events(new JsonArray().add(end));
        assertEquals(List.of("touchdown", "fullTime"), actual.stream().map(e -> e.getString("kind", null)).toList());
        assertEquals("MATCH CONCEDED", actual.getLast().getString("headline", null));
        assertEquals("away", actual.getLast().getString("team", null));
        Player<?> scorer = game.getTeamAway().getPlayers()[0];
        assertEquals(new JsonObject().add("name", scorer.getName()).add("number", scorer.getNr()), actual.getFirst().get("scorer"));

        game.getGameResult().getTeamResultHome().setConceded(false);
        presentation.finished(game);
        JsonObject finish = new JsonObject().add("commandNr", 6);
        presentation.decorate(List.of(finish));
        assertEquals("END OF MATCH", events(new JsonArray().add(finish)).getFirst().getString("headline", null));
    }
    private void forceGeneral(GameState state, int... values) {
        List<DiceCategory> dice = new ArrayList<>();
        for (int value : values) {
            DiceCategory die = new DiceCategory(); die.parseCommand(Integer.toString(value), state.getGame(), state.getGame().getTeamHome()); dice.add(die);
        }
        state.getDiceRoller().getTestRolls().put("General", dice);
    }

    private SetupSessionMovementTest.Fixture fixture() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
        state(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
        return fixture;
    }

    /** Begin after the throw has been committed; execute the real generated scatter/landing/end-action rules. */
    private JsonObject beginCommittedThrow(SetupSession session, boolean collision, boolean exits, boolean ball) throws Exception {
        GameState state = state(session);
        Game game = state.getGame();
        Player<?> thrower = game.getActingTeam().getPlayers()[0];
        Player<?> thrown = game.getActingTeam().getPlayers()[1];
        Player<?> victim = game.getActingTeam().getPlayers()[2];
        UtilBox.putAllPlayersIntoBox(game);
        int x = 7;
        int y = exits ? 0 : 7;
        place(game, thrower, x, y, PlayerState.MOVING);
        place(game, thrown, x + 1, y, PlayerState.PICKED_UP);
        if (collision) place(game, victim, 9, 7, PlayerState.STANDING);
        game.getActingPlayer().setPlayerId(thrower.getId());
        game.getActingPlayer().setPlayerAction(PlayerAction.THROW_TEAM_MATE);
        game.setThrowerId(thrower.getId());
        game.setDefenderId(thrown.getId());
        game.setPassCoordinate(new FieldCoordinate(9, 7));
        game.getFieldModel().setBallCoordinate(ball ? new FieldCoordinate(x + 1, y) : new FieldCoordinate(20, 14));
        game.getFieldModel().setBallInPlay(true);
        game.getFieldModel().setBallMoving(!ball);
        state.pushCurrentStepOnStack();
        SequenceGeneratorFactory factory = game.getFactory(FactoryType.Factory.SEQUENCE_GENERATOR);
        ((ThrowTeamMate) factory.forName(SequenceGenerator.Type.ThrowTeamMate.name()))
            .pushSequence(new ThrowTeamMate.SequenceParams(state));
        while (state.getStepStack().peek().getId() != StepId.DISPATCH_SCATTER_PLAYER) state.getStepStack().pop();
        state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.THROWN_PLAYER_ID, thrown.getId()));
        state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.THROWN_PLAYER_STATE, new PlayerState(PlayerState.PICKED_UP)));
        state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.THROWN_PLAYER_HAS_BALL, ball));
        state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.OLD_DEFENDER_STATE, new PlayerState(PlayerState.STANDING)));
        state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.PASS_RESULT, PassResult.FUMBLE));
        state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.USING_BULLSEYE, collision));
        if (collision) state.getStepStack().publishStepParameter(StepParameter.from(StepParameterKey.PASS_RESULT, PassResult.ACCURATE));
        JsonObject initial = session.spectatorView();
        state.startNextStep();
        assertEquals(null, game.getDialogParameter(), "Synthetic throw must resolve without a pending choice");
        return initial;
    }

    private List<JsonObject> capture(SetupSession session, int cursor) throws Exception {
        List<JsonObject> outcomes = new NativeOutcomeCapture().since(state(session).getGameLog(), cursor).modelSyncs;
        Field field = SetupSession.class.getDeclaredField("announcements"); field.setAccessible(true);
        ((MatchAnnouncementPresentation) field.get(session)).decorate(outcomes);
        return outcomes;
    }

    private void assertResolutionBeforeAnnouncement(List<JsonObject> outcomes) {
        int lastResolution = -1, announcement = -1;
        for (int index = 0; index < outcomes.size(); index++) {
            JsonObject sync = outcomes.get(index);
            if (sync.get("matchAnnouncements") != null && announcement < 0) announcement = index;
            for (JsonValue report : sync.get("reportList").asObject().get("reports").asArray()) {
                String id = report.asObject().getString("reportId", "");
                if (id.contains("injury") || id.contains("Injury") || id.equals("scatterPlayer") || id.equals("rightStuffRoll")) lastResolution = index;
            }
        }
        assertTrue(lastResolution >= 0 && announcement >= lastResolution, outcomes.toString());
    }

    private void place(Game game, Player<?> player, int x, int y, int status) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(status).changeActive(true));
    }

    private GameState state(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
    }

    private JsonObject action(JsonObject view, String kind) {
        for (JsonValue value : view.get("actions").asArray()) if (kind.equals(value.asObject().getString("kind", null))) return value.asObject();
        throw new AssertionError("Missing " + kind);
    }

    private List<JsonObject> allEvents(SetupSession session) {
        List<JsonObject> result = new ArrayList<>();
        for (int from = 0; ; ) {
            JsonObject page = session.transcriptPage(from, 8);
            for (JsonValue record : page.get("records").asArray()) result.addAll(events(record.asObject().get("native").asArray()));
            from = page.getInt("next", -1);
            if (from == page.getInt("total", -2)) return result;
        }
    }

    private JsonArray array(List<JsonObject> values) {
        JsonArray result = new JsonArray(); values.forEach(result::add); return result;
    }

    private List<JsonObject> events(JsonArray outcomes) {
        List<JsonObject> result = new ArrayList<>();
        for (JsonValue value : outcomes) {
            JsonValue announcements = value.asObject().get("matchAnnouncements");
            if (announcements != null) for (JsonValue event : announcements.asObject().get("events").asArray()) result.add(event.asObject());
        }
        return result;
    }
}
