package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.CatchScatterThrowInMode;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.Mode;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences.UseCase;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferences;
import com.fumbbl.ffb.server.step.AbstractStepWithReRoll;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepParameter;
import com.fumbbl.ffb.server.step.StepParameterKey;
import com.fumbbl.ffb.server.step.StepParameterSet;
import com.fumbbl.ffb.server.step.bb2025.move.StepGoForIt;
import com.fumbbl.ffb.server.step.bb2025.move.StepMoveDodge;
import com.fumbbl.ffb.server.step.bb2025.move.StepPickUp;
import com.fumbbl.ffb.server.step.bb2025.shared.StepCatchScatterThrowIn;
import com.fumbbl.ffb.util.UtilBox;

import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OptionalRerollSkillUseTest {
    private final UseCase[] cases = {UseCase.DODGE_MOVEMENT, UseCase.SURE_FEET, UseCase.SURE_HANDS, UseCase.CATCH};

    @Test void answeringAnOlderCombinedRerollPromptDoesNotApplyChangedPolicyToItsStaleSkill() throws Exception {
        Fixture fixture = new Fixture(UseCase.DODGE_MOVEMENT, Mode.ALWAYS_ASK);
        fixture.game.getTurnData().setReRolls(1);
        fixture.state.pushCurrentStepOnStack(); fixture.state.getStepStack().push(fixture.step); fixture.state.startNextStep();
        fixture.step.handleCommand(fixture.answer(false));
        DialogReRollPropertiesParameter menu = (DialogReRollPropertiesParameter) fixture.game.getDialogParameter();
        JsonObject oldMenu = menu.toJsonValue();
        com.fumbbl.ffb.json.IJsonOption.SKILL.addTo(oldMenu, fixture.skill);
        DialogReRollPropertiesParameter restoredMenu = new DialogReRollPropertiesParameter().initFrom(fixture.game.getRules(), oldMenu);
        fixture.game.setDialogParameter(restoredMenu);
        fixture.configure(Mode.ALWAYS_USE);
        fixture.state.handleCommand(new ReceivedCommand(new ClientCommandUseReRoll(menu.getReRolledAction(), ReRollSources.TEAM_RE_ROLL), true));
        assertEquals(2, fixture.rolls.get());
        assertFalse(fixture.game.getDialogParameter() == restoredMenu);
    }

    @Test void asksBeforeSpendingAndAcceptsExactlyOneRerollEvenAfterPreferenceChanges() throws Exception {
        for (UseCase useCase : cases) {
            Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK);
            fixture.step.start();
            assertEquals(1, fixture.rolls.get(), useCase.name());
            assertTrue(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter, useCase.name());
            assertEquals(fixture.player.getId(), ((DialogSkillUseParameter) fixture.game.getDialogParameter()).getPlayerId());
            fixture.configure(Mode.ALWAYS_USE);
            fixture.step.initFrom(fixture.game.getRules(), fixture.step.toJsonValue());
            assertEquals(1, fixture.rolls.get(), "Deserialization must not execute a decision");
            fixture.step.handleCommand(fixture.answer(true));
            assertEquals(2, fixture.rolls.get(), useCase.name());
            assertEquals(StepAction.NEXT_STEP, fixture.step.getResult().getNextAction(), useCase.name());
        }
    }

    @Test void declinePreservesTeamAndProChoicesWithoutReofferingTheDeclinedSkill() throws Exception {
        for (UseCase useCase : cases) {
            Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK);
            ((RosterPlayer) fixture.player).addSkill(fixture.game.getRules().getSkillFactory().forName("Pro"));
            fixture.game.getTurnData().setReRolls(1);
            fixture.step.start();
            fixture.step.handleCommand(fixture.answer(false));
            assertEquals(1, fixture.rolls.get(), useCase.name());
            assertEquals(1, fixture.game.getTurnData().getReRolls());
            assertFalse(fixture.game.getFieldModel().getPlayerState(fixture.player).hasUsedPro());
            assertTrue(fixture.game.getDialogParameter() instanceof DialogReRollPropertiesParameter, useCase.name());
            DialogReRollPropertiesParameter alternatives = (DialogReRollPropertiesParameter) fixture.game.getDialogParameter();
            assertNull(alternatives.getReRollSkill(), useCase.name());
            fixture.step.handleCommand(new ReceivedCommand(new ClientCommandUseReRoll(
                alternatives.getReRolledAction(), ReRollSources.TEAM_RE_ROLL), true));
            assertEquals(2, fixture.rolls.get(), useCase.name());
            assertEquals(0, fixture.game.getTurnData().getReRolls());
            assertEquals(StepAction.NEXT_STEP, fixture.step.getResult().getNextAction(), useCase.name());
        }
    }

    @Test void alwaysUseKeepsNativeAutomaticRerollsWithoutOpeningAPrompt() throws Exception {
        for (UseCase useCase : cases) {
            Fixture fixture = new Fixture(useCase, Mode.ALWAYS_USE);
            fixture.step.start();
            assertEquals(2, fixture.rolls.get(), useCase.name());
            assertFalse(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter, useCase.name());
            assertEquals(StepAction.NEXT_STEP, fixture.step.getResult().getNextAction(), useCase.name());
        }
    }

    @Test void declinedSkillCanUseProWithoutSpendingATeamRerollOrLeavingAStaleMenu() throws Exception {
        for (UseCase useCase : cases) {
            Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK);
            ((RosterPlayer) fixture.player).addSkill(fixture.game.getRules().getSkillFactory().forName("Pro"));
            fixture.game.getTurnData().setReRolls(1);
            fixture.state.pushCurrentStepOnStack(); fixture.state.getStepStack().push(fixture.step); fixture.state.startNextStep();
            fixture.state.handleCommand(fixture.answer(false));
            DialogReRollPropertiesParameter menu = (DialogReRollPropertiesParameter) fixture.game.getDialogParameter();
            fixture.state.handleCommand(new ReceivedCommand(new ClientCommandUseReRoll(menu.getReRolledAction(), ReRollSources.PRO), true));
            assertEquals(3, fixture.rolls.get(), useCase.name());
            assertTrue(fixture.game.getFieldModel().getPlayerState(fixture.player).hasUsedPro());
            assertEquals(1, fixture.game.getTurnData().getReRolls());
            assertFalse(fixture.game.getDialogParameter() == menu);
        }
    }

    @Test void openSkillRerollsRecoverWithTheirDeadlineAndTimeoutOnlyDeclinesTheSkill() throws Exception {
        for (UseCase useCase : cases) {
            Fixture fixture = new Fixture(useCase, Mode.ALWAYS_ASK);
            fixture.game.getTurnData().setReRolls(1);
            fixture.state.pushCurrentStepOnStack();
            fixture.state.getStepStack().push(fixture.step);
            fixture.state.startNextStep();
            fixture.base.session.expireReactiveDecision(System.currentTimeMillis());
            JsonObject before = fixture.base.session.decorateSaveResume(fixture.base.session.reply("load", "ACCEPTED", false, "home"))
                .get("state").asObject().get("reaction").asObject();
            assertEquals("home", before.getString("actor", null));
            long deadline = before.getLong("expiresAt", -1);
            fixture.configure(Mode.ALWAYS_USE);
            SetupSession recovered = new SetupSession(fixture.base.server, fixture.base.document, fixture.base.session.recoveryArtifact());
            recovered.configureSkillUsePreferences(SkillUsePreferences.defaults(), SkillUsePreferences.defaults());
            Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
            GameState state = (GameState) field.get(recovered);
            state.getDiceRoller().setRecoveryRoll(sides -> { throw new AssertionError("Timeout cannot roll or spend a reroll"); });
            assertFalse(recovered.expireReactiveDecision(deadline - 1));
            JsonObject after = recovered.decorateSaveResume(recovered.reply("load", "ACCEPTED", false, "home"))
                .get("state").asObject().get("reaction").asObject();
            assertEquals(before.getString("id", null), after.getString("id", null));
            assertEquals(deadline, after.getLong("expiresAt", -1));
            assertTrue(recovered.expireReactiveDecision(deadline));
            assertFalse(recovered.isFailed());
            assertEquals(1, state.getGame().getTurnData().getReRolls());
            assertTrue(state.getGame().getDialogParameter() instanceof DialogReRollPropertiesParameter);
            assertNull(((DialogReRollPropertiesParameter) state.getGame().getDialogParameter()).getReRollSkill());
            JsonObject remainingView = recovered.decorateSaveResume(recovered.reply("load", "ACCEPTED", false, "home")).get("state").asObject();
            if (remainingView.get("reaction") != null) {
                JsonObject remaining = remainingView.get("reaction").asObject();
                assertTrue(remaining.getLong("expiresAt", -1) > deadline, "Remaining resources need their own deadline");
                assertFalse(before.getString("id", null).equals(remaining.getString("id", null)));
            }
        }
    }

    @Test void tackleMovementDecisionRetainsOriginalRollAndDecliningAllowsDodgeReroll() throws Exception {
        Fixture fixture = new Fixture(UseCase.DODGE_MOVEMENT, Mode.ALWAYS_USE);
        Player<?> tackler = fixture.game.getTeamAway().getPlayers()[0];
        Skill tackle = fixture.game.getRules().getSkillFactory().forName("Tackle");
        ((RosterPlayer) tackler).addSkill(tackle);
        fixture.state.getOptionalSkillUse().configure(SkillUsePreferences.defaults(),
            SkillUsePreferences.defaults().with(UseCase.TACKLE_MOVEMENT, Mode.ALWAYS_ASK));
        fixture.step.start();
        assertEquals(1, fixture.rolls.get());
        assertEquals(tackler.getId(), ((DialogSkillUseParameter) fixture.game.getDialogParameter()).getPlayerId());
        fixture.step.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(tackle, false, tackler.getId(), null, false), false));
        assertEquals(2, fixture.rolls.get());
        assertEquals(StepAction.NEXT_STEP, fixture.step.getResult().getNextAction());
    }

    @Test void dodgePolicyAlsoAppliesToTheNativePreDivingTackleRerollChoice() throws Exception {
        for (Mode mode : Mode.values()) {
            Fixture fixture = new Fixture(UseCase.DODGE_MOVEMENT, mode);
			fixture.place(fixture.game.getTeamAway().getPlayers()[0], 7, 8);
            ((RosterPlayer) fixture.game.getTeamAway().getPlayers()[0]).addSkill(
                fixture.game.getRules().getSkillFactory().forName("Diving Tackle"));
            fixture.state.getDiceRoller().setRecoveryRoll(sides -> fixture.rolls.getAndIncrement() == 0 ? 3 : 6);
            fixture.step.start();
            assertEquals(1, fixture.rolls.get());
            if (mode == Mode.ALWAYS_ASK) {
                assertTrue(fixture.game.getDialogParameter() instanceof DialogSkillUseParameter);
                fixture.step.handleCommand(fixture.answer(false));
                assertEquals(1, fixture.rolls.get(), "Declining Dodge keeps the successful original roll for the Diving Tackle decision");
            } else {
                assertTrue(fixture.game.getDialogParameter() instanceof DialogReRollPropertiesParameter);
                fixture.step.handleCommand(new ReceivedCommand(fixture.state.getOptionalSkillUse().automaticCommand(), true));
                assertEquals(2, fixture.rolls.get());
            }
            assertEquals(StepAction.NEXT_STEP, fixture.step.getResult().getNextAction());
        }
    }

    @Test void tackleSkipsSuccessfulDodgesAndRestoresAFailedRollWithoutRollingAgain() throws Exception {
        for (boolean success : new boolean[] {false, true}) {
            Fixture fixture = new Fixture(UseCase.DODGE_MOVEMENT, Mode.ALWAYS_USE);
            Player<?> opponent = fixture.game.getTeamAway().getPlayers()[0];
            Skill tackle = fixture.game.getRules().getSkillFactory().forName("Tackle");
            ((RosterPlayer) opponent).addSkill(tackle);
            fixture.game.getTurnData().setReRolls(1);
            fixture.state.getOptionalSkillUse().configure(SkillUsePreferences.defaults(),
                SkillUsePreferences.defaults().with(UseCase.TACKLE_MOVEMENT, Mode.ALWAYS_ASK));
            fixture.state.getDiceRoller().setRecoveryRoll(sides -> { fixture.rolls.incrementAndGet(); return success ? 6 : 1; });
            fixture.step.start();
            assertEquals(1, fixture.rolls.get());
            if (success) assertFalse(fixture.step.getOptionalSkillChoices().pending());
            else {
                fixture.step.initFrom(fixture.game.getRules(), fixture.step.toJsonValue());
                fixture.step.handleCommand(new ReceivedCommand(new ClientCommandUseSkill(tackle, true, opponent.getId(), null, false), false));
                assertEquals(1, fixture.rolls.get());
                assertTrue(fixture.game.getDialogParameter() instanceof DialogReRollPropertiesParameter);
                assertNull(((DialogReRollPropertiesParameter) fixture.game.getDialogParameter()).getReRollSkill());
            }
        }
    }

    private static final class Fixture {
        final SetupSessionMovementTest.Fixture base;
        final GameState state;
        final Game game;
        final Player<?> player;
        final Skill skill;
        final UseCase useCase;
        final AbstractStepWithReRoll step;
        final AtomicInteger rolls = new AtomicInteger();

        Fixture(UseCase useCase, Mode mode) throws Exception {
            this.useCase = useCase;
            base = new SetupSessionMovementTest.Fixture();
            Field field = SetupSession.class.getDeclaredField("state"); field.setAccessible(true);
            state = (GameState) field.get(base.session);
            state.getDiceRoller().setRecoveryRoll(sides -> 1);
            base.advanceToTurn();
            game = state.getGame(); game.setHomePlaying(true); game.setThrowerId(null);
            UtilBox.putAllPlayersIntoBox(game);
            player = game.getTeamHome().getPlayers()[1];
            place(player, 9, 7);
            game.getActingPlayer().setPlayerId(player.getId()); game.getActingPlayer().setPlayerAction(PlayerAction.MOVE);
            game.getFieldModel().setBallInPlay(true);
            game.getFieldModel().setBallMoving(true);
            game.getFieldModel().setBallCoordinate(new FieldCoordinate(9, 7));
            String name = useCase == UseCase.DODGE_MOVEMENT ? "Dodge" : useCase == UseCase.SURE_FEET ? "Sure Feet"
                : useCase == UseCase.SURE_HANDS ? "Sure Hands" : "Catch";
            skill = game.getRules().getSkillFactory().forName(name); ((RosterPlayer) player).addSkill(skill);
            configure(mode);
            StepParameterSet parameters = new StepParameterSet();
            parameters.add(StepParameter.from(StepParameterKey.GOTO_LABEL_ON_FAILURE, "failed"));
            if (useCase == UseCase.SURE_HANDS) step = new StepPickUp(state);
            else if (useCase == UseCase.SURE_FEET) {
                step = new StepGoForIt(state);
                game.getActingPlayer().setGoingForIt(true);
                game.getActingPlayer().setCurrentMove(player.getMovementWithModifiers() + 1);
            } else if (useCase == UseCase.DODGE_MOVEMENT) {
                step = new StepMoveDodge(state);
                game.getActingPlayer().setDodging(true);
                place(game.getTeamAway().getPlayers()[0], 8, 8);
                step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_FROM, new FieldCoordinate(8, 7)));
                step.setParameter(StepParameter.from(StepParameterKey.COORDINATE_TO, new FieldCoordinate(9, 7)));
            } else {
                step = new StepCatchScatterThrowIn(state);
                step.setParameter(StepParameter.from(StepParameterKey.CATCH_SCATTER_THROW_IN_MODE, CatchScatterThrowInMode.CATCH_HAND_OFF));
            }
            step.init(parameters);
            state.getDiceRoller().setRecoveryRoll(sides -> rolls.getAndIncrement() == 0 ? 1 : 6);
        }

        void configure(Mode mode) { state.getOptionalSkillUse().configure(SkillUsePreferences.defaults().with(useCase, mode), SkillUsePreferences.defaults()); }
        ReceivedCommand answer(boolean use) { return new ReceivedCommand(new ClientCommandUseSkill(skill, use, player.getId(), null, false), true); }
        void place(Player<?> target, int x, int y) {
            game.getFieldModel().setPlayerCoordinate(target, new FieldCoordinate(x, y));
            game.getFieldModel().setPlayerState(target, new PlayerState(PlayerState.STANDING));
        }
    }
}
