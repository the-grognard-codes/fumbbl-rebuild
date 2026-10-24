package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.TurnMode;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.TurnData;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LimitedActionTagsTest {
    @Test void confirmedDeclarationsAreSharedAndSurviveRecovery() throws Exception {
        for (String kind : new String[] { "blitz", "declarePass", "declareHandOff", "declareFoul" }) {
            SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
            JsonObject ready = fixture.advanceToTurn();
            String role = ready.getString("actor", null);
            Game game = nativeState(fixture.session).getGame();
            Player<?> player = game.getActingTeam().getPlayers()[0];
            Player<?> target = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            place(game, player, 5, 5, PlayerState.STANDING);
            place(game, target, 6, 5, PlayerState.PRONE);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(5, 5));
            game.getFieldModel().setBallMoving(false);
            ready = view(fixture.session, role);
            assertNull(fixture.player(ready, player.getId()).get("limitedAction"));
            JsonObject declaration = action(ready, kind, player.getId());
            JsonObject after = fixture.session.apply(role, fixture.request("action", "declare-tag", ready)
                .add("actionId", declaration.get("id"))).get("state").asObject();
            String expected = "blitz".equals(kind) ? "blitz" : "declarePass".equals(kind) ? "pass"
                : "declareHandOff".equals(kind) ? "handOff" : "foul";
            assertEquals(expected, fixture.player(after, player.getId()).getString("limitedAction", null), kind);
            for (String viewer : new String[] { "home", "away", "spectator" })
                assertEquals(expected, fixture.player(view(fixture.session, viewer), player.getId()).getString("limitedAction", null));
            String checkpoint = fixture.session.recoveryArtifact();
            JsonArray replay = JsonArray.readFrom(JsonObject.readFrom(checkpoint).get("payload").asObject().getString("eventsJson", ""));
            assertEquals(expected, fixture.player(replay.get(replay.size() - 1).asObject().get("state").asObject(), player.getId()).getString("limitedAction", null));
            SetupSession recovered = new SetupSession(fixture.server, fixture.document, checkpoint);
            assertEquals(expected, fixture.player(view(recovered, role), player.getId()).getString("limitedAction", null));
            JsonObject terminal = recovered.apply(role, fixture.request("concede", "end-tag-match", view(recovered, role)))
                .get("state").asObject();
            assertEquals("FULL_TIME", terminal.getString("phase", null));
            for (JsonValue item : terminal.get("players").asArray()) assertNull(item.asObject().get("limitedAction"));
            JsonArray completedReplay = JsonObject.readFrom(recovered.completedMatch().json()).get("events").asArray();
            assertEquals(expected, fixture.player(completedReplay.get(completedReplay.size() - 2).asObject()
                .get("state").asObject(), player.getId()).getString("limitedAction", null));
            game.getFieldModel().setPlayerState(player, new PlayerState(PlayerState.STUNNED));
            assertEquals(expected, fixture.player(view(fixture.session, role), player.getId()).getString("limitedAction", null));
            game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(7, 7));
            assertEquals(expected, fixture.player(view(fixture.session, role), player.getId()).getString("limitedAction", null));
            UtilBox.putAllPlayersIntoBox(game);
            assertNull(fixture.player(view(fixture.session, role), player.getId()).get("limitedAction"));
            game.startTurn();
            assertNull(game.getTurnDataHome().getLimitedAction(player.getId()));
            assertNull(game.getTurnDataAway().getLimitedAction(player.getId()));
        }
    }

    @Test void plannedRouteOnlyConsumesWhenConfirmedAndEndTurnClearsTags() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject ready = fixture.advanceToTurn();
        String role = ready.getString("actor", null);
        GameState state = nativeState(fixture.session);
        Game game = state.getGame();
        Player<?> player = game.getActingTeam().getPlayers()[0];
        Player<?> receiver = game.getActingTeam().getPlayers()[1];
        UtilBox.putAllPlayersIntoBox(game);
        place(game, player, 5, 5, PlayerState.STANDING);
        place(game, receiver, 7, 5, PlayerState.STANDING);
        game.getFieldModel().setBallCoordinate(new FieldCoordinate(5, 5));
        game.getFieldModel().setBallMoving(false);
        List<DiceCategory> rolls = new ArrayList<>();
        for (int index = 0; index < 10; index++) {
            DiceCategory roll = new DiceCategory(); roll.parseCommand("6", game, game.getTeamHome()); rolls.add(roll);
        }
        state.getDiceRoller().getTestRolls().put("General", rolls);
        ready = view(fixture.session, role);
        JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", 6).add("y", 5));
        JsonObject preview = fixture.session.movementPreview(role, ready.getInt("revision", -1), player.getId(), "handOff", receiver.getId(), waypoints);
        assertNull(game.getTurnData().getLimitedAction(player.getId()));
        JsonObject after = fixture.session.apply(role, fixture.request("movement", "planned-handoff", ready)
            .add("playerId", player.getId()).add("kind", "handOff").add("targetPlayerId", receiver.getId())
            .add("waypoints", preview.get("waypoints"))).get("state").asObject();
        assertEquals("handOff", fixture.player(after, player.getId()).getString("limitedAction", null));
        JsonObject end = action(after, "endTurn", null);
        JsonObject next = fixture.session.apply(role, fixture.request("action", "end-tag-turn", after)
            .add("actionId", end.get("id"))).get("state").asObject();
        for (JsonValue item : next.get("players").asArray()) assertNull(item.asObject().get("limitedAction"));
    }

    @Test void metadataRoundTripsCopiesAndClearsAtUnnumberedWindowAndTerminalBoundaries() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        fixture.advanceToTurn();
        Game game = nativeState(fixture.session).getGame();
        TurnData source = game.getTurnData();
        for (PlayerAction action : new PlayerAction[] { PlayerAction.BLITZ_MOVE, PlayerAction.PASS, PlayerAction.HAND_OVER,
            PlayerAction.FOUL, PlayerAction.THROW_BOMB, PlayerAction.THROW_TEAM_MATE, PlayerAction.KICK_TEAM_MATE,
            PlayerAction.PUNT, PlayerAction.SECURE_THE_BALL }) source.recordLimitedAction(action.name(), action);
        TurnData restored = new TurnData(game, true).initFrom(game.getRules(), source.toJsonValue());
        TurnData copy = new TurnData(game, true); copy.init(source);
        for (PlayerAction action : new PlayerAction[] { PlayerAction.PASS, PlayerAction.THROW_BOMB, PlayerAction.SECURE_THE_BALL }) {
            assertEquals(action, restored.getLimitedAction(action.name()));
            assertEquals(action, copy.getLimitedAction(action.name()));
        }
        source.clearLimitedActions();
        assertEquals(PlayerAction.PASS, restored.getLimitedAction("PASS"));
        assertEquals(PlayerAction.PASS, copy.getLimitedAction("PASS"));
        for (TurnMode mode : new TurnMode[] { TurnMode.KICKOFF, TurnMode.SETUP, TurnMode.END_GAME, TurnMode.BETWEEN_TURNS }) {
            game.setTurnMode(TurnMode.REGULAR);
            source.recordLimitedAction("departed", PlayerAction.FOUL);
            long before = source.getActionWindow();
            game.setTurnMode(mode);
            assertNull(source.getLimitedAction("departed"));
            assertTrue(source.getActionWindow() > before);
        }
    }

    @Test void failedActivationTraitsKeepTheConfirmedPassTag() throws Exception {
        for (String skillName : new String[] { "Bone Head", "Really Stupid", "Bloodlust" }) {
            SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
            JsonObject ready = fixture.advanceToTurn();
            String role = ready.getString("actor", null);
            GameState state = nativeState(fixture.session);
            Game game = state.getGame();
            Player<?> player = game.getActingTeam().getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            place(game, player, 5, 5, PlayerState.STANDING);
            place(game, game.getActingTeam().getPlayers()[1], 10, 10, PlayerState.STANDING);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14));
            game.getFieldModel().setBallMoving(true);
            SkillFactory skills = game.getFactory(FactoryType.Factory.SKILL);
            ((RosterPlayer) player).addSkill(skills.forName(skillName));
            List<DiceCategory> rolls = new ArrayList<>();
            for (int index = 0; index < 10; index++) {
                DiceCategory roll = new DiceCategory(); roll.parseCommand("1", game, game.getTeamHome()); rolls.add(roll);
            }
            state.getDiceRoller().getTestRolls().put("General", rolls);
            ready = view(fixture.session, role);
            JsonObject declaration = action(ready, "declarePass", player.getId());
            JsonObject after = fixture.session.apply(role, fixture.request("action", "trait-pass", ready)
                .add("actionId", declaration.get("id"))).get("state").asObject();
            if (!game.getFieldModel().getPlayerState(player).isDistracted() && !game.getActingPlayer().isSufferingBloodLust()) {
                JsonArray waypoints = new JsonArray().add(new JsonObject().add("x", 6).add("y", 5));
                after = fixture.session.apply(role, fixture.request("movement", "trait-move", after)
                    .add("playerId", player.getId()).add("kind", "move").add("targetPlayerId", JsonValue.NULL)
                    .add("waypoints", waypoints)).get("state").asObject();
            }
            for (int index = 0; index < 3; index++) {
                JsonObject decline = null;
                for (JsonValue value : after.get("actions").asArray())
                    if (value.asObject().getString("id", "").endsWith(":reroll:none")) decline = value.asObject();
                if (decline == null) break;
                assertEquals("pass", fixture.player(after, player.getId()).getString("limitedAction", null));
                after = fixture.session.apply(role, fixture.request("action", "decline-trait-reroll-" + index, after)
                    .add("actionId", decline.get("id"))).get("state").asObject();
            }
            assertTrue(game.getTurnData().isPassUsed(), skillName);
            assertEquals("pass", fixture.player(after, player.getId()).getString("limitedAction", null), skillName);
            if ("Bloodlust".equals(skillName)) assertTrue(game.getActingPlayer().isSufferingBloodLust());
            else assertTrue(game.getFieldModel().getPlayerState(player).isDistracted(), skillName);
            SetupSession recovered = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            assertEquals("pass", fixture.player(view(recovered, role), player.getId()).getString("limitedAction", null));
        }
    }

    private JsonObject view(SetupSession session, String role) { return session.reply("load", "ACCEPTED", false, role).get("state").asObject(); }
    private JsonObject action(JsonObject view, String kind, String playerId) {
        for (JsonValue value : view.get("actions").asArray()) {
            JsonObject action = value.asObject();
            if (kind.equals(action.getString("kind", null)) && (playerId == null || playerId.equals(action.getString("sourcePlayerId", null)))) return action;
        }
        throw new AssertionError("Missing " + kind + ": " + view.get("actions"));
    }
    private void place(Game game, Player<?> player, int x, int y, int status) {
        game.getFieldModel().setPlayerCoordinate(player, new FieldCoordinate(x, y));
        game.getFieldModel().setPlayerState(player, new PlayerState(status).changeActive(true));
    }
    private GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true); return (GameState) field.get(session);
    }
}
