package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.DiceCategory;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.dialog.DialogArgueTheCallParameter;
import com.fumbbl.ffb.dialog.DialogBribesParameter;
import com.fumbbl.ffb.inducement.Usage;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FoulBribeFlowTest {
    @Test void singlePlayerBribeDialogOutsideFoulPreservesExistingProjection() throws Exception {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        nativeState(fixture.session).getDiceRoller().setRecoveryRoll(sides -> 1);
        fixture.advanceToTurn();
        Game game = nativeState(fixture.session).getGame();
        DialogBribesParameter dialog = new DialogBribesParameter(game.getActingTeam().getId(), 1);
        dialog.addPlayerId(game.getActingTeam().getPlayers()[0].getId());
        game.setDialogParameter(dialog);
        assertTrue(new CorePromptActions(nativeState(fixture.session)).actions().isEmpty(),
            "Foul support must not change legacy bribe projections at other native steps");
    }

    @Test void decliningArgueOffersKickoffBribeForArmorAndInjuryDoublesToTheCorrectCoach() throws Exception {
        for (boolean home : new boolean[] {true, false}) for (boolean injury : new boolean[] {false, true}) {
            Scenario scenario = new Scenario(home, injury);
            scenario.choose("argueTheCall", "argue:no");
            assertTrue(scenario.game().getDialogParameter() instanceof DialogBribesParameter);
            assertEquals(2, scenario.view.get("actions").asArray().size(), "Available bribe must expose use/decline choices");
            for (JsonValue action : scenario.view.get("actions").asArray()) {
                assertEquals("bribe", action.asObject().getString("kind", null));
                assertEquals(scenario.role, action.asObject().getString("actor", null));
            }
            JsonObject request = scenario.fixture.request("action", "wrong-coach", scenario.view)
                .add("actionId", scenario.action("bribe", "bribe:no").get("id"));
            assertThrows(MatchService.Failure.class, () -> scenario.session.apply(home ? "away" : "home", request));
        }
    }

    @Test void successfulBribeSpendsOnceAndPreservesFoulerAcrossReloads() throws Exception { verifyOutcome(true, 6); }
    @Test void failedBribeSpendsOnceAndSendsOffFoulerAcrossReloads() throws Exception { verifyOutcome(true, 1); }
    @Test void decliningBribePreservesResourceAndSendsOffFoulerAcrossReloads() throws Exception { verifyOutcome(false, 6); }

    private void verifyOutcome(boolean use, int roll) throws Exception {
        JsonArray journeys = new JsonArray();
        for (boolean home : new boolean[] {true, false}) for (boolean recover : new boolean[] {false, true}) {
            Scenario scenario = new Scenario(home, true);
            JsonObject argue = scenario.view;
            if (recover) scenario.recover(false);
            scenario.choose("argueTheCall", "argue:no");
            JsonObject bribe = scenario.view;
            if (recover) scenario.recover(false);
            scenario.rolls(roll);
            JsonObject action = scenario.action("bribe", use ? "bribe:" + scenario.foulerId : "bribe:no");
            JsonObject request = scenario.fixture.request("action", "bribe-result", scenario.view).add("actionId", action.get("id"));
            scenario.view = scenario.session.apply(scenario.role, request).get("state").asObject();
            assertNull(scenario.game().getDialogParameter(), "Bribe response must finish; home=" + home + ", recover=" + recover);
            boolean saved = use && roll > 1;
            assertEquals(saved ? PlayerState.STANDING : PlayerState.BANNED,
                scenario.game().getFieldModel().getPlayerState(scenario.game().getPlayerById(scenario.foulerId)).getBase(),
                "Fouler state; home=" + home + ", recover=" + recover);
            assertEquals(saved, scenario.role.equals(scenario.view.getString("actor", null)));
            assertEquals(use ? 0 : 1, scenario.bribes());
            assertFalse(scenario.view.get("actions").asArray().isEmpty());
            int revision = scenario.view.getInt("revision", -1);
            assertTrue(scenario.session.apply(scenario.role, request).getBoolean("duplicate", false));
            assertEquals(revision, scenario.session.spectatorView().getInt("revision", -1));
            assertEquals(use ? 0 : 1, scenario.bribes(), "Retry must not spend another bribe");
            if (recover) scenario.recover(false);
            if (!recover) journeys.add(new JsonObject().add("role", scenario.role).add("argue", argue)
                .add("bribe", bribe).add("result", scenario.view).add("actionId", action.get("id")));
        }
        String directory = System.getProperty("roundup.bribeFixtures");
        if (directory != null) Files.write(Paths.get(directory, use ? "bribe-" + roll + ".json" : "bribe-decline.json"),
            journeys.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Test void legacyEmptyBribeActionsRecoverWithoutEditingNativeHistory() throws Exception {
        for (boolean home : new boolean[] {true, false}) {
            Scenario scenario = new Scenario(home, false);
            scenario.choose("argueTheCall", "argue:no");
            scenario.recover(true);
            assertEquals(2, scenario.view.get("actions").asArray().size());
            scenario.rolls(6);
            scenario.choose("bribe", "bribe:" + scenario.foulerId);
            assertNull(scenario.game().getDialogParameter());
            assertEquals(0, scenario.bribes());
        }
    }

    @Test void noRemainingBribeCompletesSendingOffWithoutOfferingOne() throws Exception {
        for (boolean home : new boolean[] {true, false}) {
            Scenario scenario = new Scenario(home, false);
            Game game = scenario.game();
            game.getTurnData().getInducementSet().getInducementMapping().forEach((type, inducement) -> {
                if (type.hasUsage(Usage.AVOID_BAN)) {
                    inducement.setUses(inducement.getValue());
                    game.getTurnData().getInducementSet().addInducement(inducement);
                }
            });
            scenario.choose("argueTheCall", "argue:no");
            assertNull(scenario.game().getDialogParameter());
            assertEquals(PlayerState.BANNED,
                scenario.game().getFieldModel().getPlayerState(scenario.game().getPlayerById(scenario.foulerId)).getBase());
            assertFalse(scenario.role.equals(scenario.view.getString("actor", null)));
            assertFalse(scenario.view.get("actions").asArray().isEmpty());
        }
    }

    @Test void failedArgueThenReloadedBribeDoesNotRollArgueAgain() throws Exception {
        Scenario scenario = new Scenario(true, false);
        scenario.rolls(2);
        scenario.choose("argueTheCall", "argue:" + scenario.foulerId);
        assertTrue(scenario.game().getDialogParameter() instanceof DialogBribesParameter);
        scenario.recover(false);
        scenario.rolls(6);
        scenario.choose("bribe", "bribe:" + scenario.foulerId);
        assertNull(scenario.game().getDialogParameter());
        assertEquals(0, scenario.bribes());
    }

    private static GameState nativeState(SetupSession session) throws Exception {
        Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
        return (GameState) field.get(session);
    }

    private final class Scenario {
        final SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture(0, true);
        SetupSession session = fixture.session;
        final String role, foulerId;
        JsonObject view;

        Scenario(boolean home, boolean injury) throws Exception {
            nativeState(session).getDiceRoller().setRecoveryRoll(sides -> 1);
            view = fixture.advanceToTurn();
            assertEquals(1, view.get("homeResources").asObject().getInt("bribes", -1));
            assertEquals(1, view.get("awayResources").asObject().getInt("bribes", -1));
            Game game = game(); game.setHomePlaying(home); role = home ? "home" : "away";
            Player<?> fouler = game.getActingTeam().getPlayers()[0]; foulerId = fouler.getId();
            Player<?> victim = game.getOtherTeam(game.getActingTeam()).getPlayers()[0];
            UtilBox.putAllPlayersIntoBox(game);
            game.getFieldModel().setPlayerCoordinate(fouler, new FieldCoordinate(7, 7));
            game.getFieldModel().setPlayerState(fouler, new PlayerState(PlayerState.STANDING).changeActive(true));
            game.getFieldModel().setPlayerCoordinate(victim, new FieldCoordinate(8, 7));
            game.getFieldModel().setPlayerState(victim, new PlayerState(PlayerState.PRONE).changeActive(true));
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(1, 14)); game.getFieldModel().setBallMoving(true);
            view = session.reply("load", "ACCEPTED", false, role).get("state").asObject();
            rolls(injury ? new int[] {6, 5, 2, 2} : new int[] {1, 1});
            choose("declareFoul", null); choose("foul", null);
            assertTrue(game.getDialogParameter() instanceof DialogArgueTheCallParameter);
        }
        Game game() throws Exception { return nativeState(session).getGame(); }
        int bribes() { return view.get(role + "Resources").asObject().getInt("bribes", 0); }
        void rolls(int... values) throws Exception {
            List<DiceCategory> rolls = new ArrayList<>();
            for (int value : values) {
                DiceCategory roll = new DiceCategory(); roll.parseCommand(Integer.toString(value), game(), game().getTeamHome()); rolls.add(roll);
            }
            nativeState(session).getDiceRoller().getTestRolls().put("General", rolls);
        }
        JsonObject action(String kind, String suffix) {
            return view.get("actions").asArray().values().stream().map(JsonValue::asObject)
                .filter(value -> kind.equals(value.getString("kind", null)) && (suffix == null || value.getString("id", "").endsWith(suffix)))
                .findFirst().orElseThrow(() -> new AssertionError("Missing " + kind + " / " + suffix + ": " + view.get("actions")));
        }
        void choose(String kind, String suffix) {
            view = session.apply(role, fixture.request("action", "decision-" + view.getInt("revision", -1), view)
                .add("actionId", action(kind, suffix).get("id"))).get("state").asObject();
        }
        void recover(boolean legacy) throws Exception {
            String artifact = session.recoveryArtifact();
            if (legacy) {
                JsonObject envelope = JsonObject.readFrom(artifact), payload = envelope.get("payload").asObject();
                for (String seat : new String[] {"homeView", "awayView"}) payload.get(seat).asObject().set("actions", new JsonArray());
                StringBuilder checksum = new StringBuilder();
                for (byte value : MessageDigest.getInstance("SHA-256").digest(payload.toString().getBytes(StandardCharsets.UTF_8)))
                    checksum.append(String.format("%02x", value & 255));
                artifact = envelope.set("sha256", checksum.toString()).toString();
            }
            session = new SetupSession(fixture.server, fixture.document, artifact);
            view = session.reply("load", "ACCEPTED", false, role).get("state").asObject();
        }
    }
}
