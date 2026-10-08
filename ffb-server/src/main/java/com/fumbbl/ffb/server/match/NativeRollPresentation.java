package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.FieldCoordinateBounds;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.ReportConfusionRoll;
import com.fumbbl.ffb.report.ReportReRoll;
import com.fumbbl.ffb.report.ReportSkillRoll;
import com.fumbbl.ffb.report.ReportStandUpRoll;
import com.fumbbl.ffb.report.mixed.ReportDodgeRoll;
import com.fumbbl.ffb.report.mixed.ReportPassRoll;
import com.fumbbl.ffb.report.mixed.ReportTentaclesShadowingRoll;
import com.fumbbl.ffb.report.mixed.ReportThrowTeamMateRoll;
import com.fumbbl.ffb.server.DiceInterpreter;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.mechanic.RollMechanic;
import com.fumbbl.ffb.server.step.AbstractStepWithReRoll;
import com.fumbbl.ffb.server.step.bb2025.block.StepBlockRoll;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.HashMap;
import java.util.Map;

/** Public roll facts frozen from the resident native game, without executing it again. */
final class NativeRollPresentation {
    private final Map<String, Integer> agility = new HashMap<>();
    private final Map<String, Integer> passing = new HashMap<>();
    private final Map<String, Integer> strength = new HashMap<>();
    private final Map<String, Integer> bloodLust = new HashMap<>();
    private final Map<String, Integer> loner = new HashMap<>();
    private final int pro;
    private final boolean proTestRetry;
    private int proReports;
    private final String movingPlayerId;
    private final Map<String, JsonValue> squares = new HashMap<>();

    NativeRollPresentation(GameState state) {
        Game game = state.getGame();
        proTestRetry = state.getCurrentStep() instanceof AbstractStepWithReRoll
            && ((AbstractStepWithReRoll) state.getCurrentStep()).getDeferredReRoll() != null
            || state.getCurrentStep() instanceof StepBlockRoll
            && "pro-test".equals(((StepBlockRoll) state.getCurrentStep()).getBlockRerollPhase());
        RollMechanic mechanic = (RollMechanic) game.getFactory(FactoryType.Factory.MECHANIC).forName(Mechanic.Type.ROLL.name());
        pro = mechanic.minimumProRoll();
        movingPlayerId = game.getActingPlayer().getPlayerId();
        for (Team team : new Team[] {game.getTeamHome(), game.getTeamAway()}) for (Player<?> player : team.getPlayers()) {
            agility.put(player.getId(), player.getAgilityWithModifiers(game));
            passing.put(player.getId(), player.getPassingWithModifiers(game));
            strength.put(player.getId(), player.getStrengthWithModifiers());
            if (player.hasSkillProperty(NamedProperties.needsToRollForActionBlockingIsEasier))
                bloodLust.put(player.getId(), player.getSkillIntValue(NamedProperties.needsToRollForActionBlockingIsEasier));
            if (player.hasSkillProperty(NamedProperties.hasToRollToUseTeamReroll))
                loner.put(player.getId(), mechanic.minimumLonerRoll(player));
            squares.put(player.getId(), square(game.getFieldModel().getPlayerCoordinate(player)));
        }
    }

    void decorate(ServerCommandModelSync command, JsonObject publicSync) {
        JsonArray changes = publicSync.get("modelChangeList").asObject().get("modelChangeArray").asArray();
        for (JsonValue value : changes) {
            JsonObject change = value.asObject();
            if ("fieldModelSetPlayerCoordinate".equals(change.getString("modelChangeId", null))) {
                JsonValue coordinate = change.get("modelChangeValue");
                JsonValue point = JsonValue.NULL;
                if (coordinate != null && coordinate.isArray()) {
                    JsonArray array = coordinate.asArray();
                    if (array.size() == 2) point = square(new FieldCoordinate(array.get(0).asInt(), array.get(1).asInt()));
                }
                squares.put(change.getString("modelChangeKey", ""), point);
            }
        }
        IReport[] reports = command.getReportList().getReports();
        JsonArray publicReports = publicSync.get("reportList").asObject().get("reports").asArray();
        for (int index = 0; index < reports.length; index++) {
            IReport report = reports[index];
            JsonObject publicReport = publicReports.get(index).asObject();
            if (report instanceof ReportReRoll) {
                ReportReRoll reroll = (ReportReRoll) report;
                Integer minimum = reroll.getReRollSource() == ReRollSources.PRO ? Integer.valueOf(pro)
                    : reroll.getReRollSource() == ReRollSources.LONER ? loner.get(reroll.getPlayerId()) : null;
                if (reroll.getRoll() > 0 && minimum != null) {
                    facts(publicReport, reroll.getPlayerId(), minimum, minimum, 0);
                    if (reroll.getReRollSource() == ReRollSources.PRO) publicReport.add("logTest", new JsonObject()
                        .add("version", 1).add("rerolled", proTestRetry || proReports++ > 0));
                }
                continue;
            }
            if (report instanceof ReportStandUpRoll) {
                ReportStandUpRoll stand = (ReportStandUpRoll) report;
                facts(publicReport, stand.getPlayerId(), 4, stand.getMinimumRoll(), stand.getModifier());
                continue;
            }
            if (report instanceof ReportTentaclesShadowingRoll) {
                ReportTentaclesShadowingRoll reaction = (ReportTentaclesShadowingRoll) report;
                boolean shadowing = reaction.getSkill().hasSkillProperty(NamedProperties.canFollowPlayerLeavingTacklezones);
                int base = shadowing ? 4 : 6;
                int modifier = shadowing ? 0 : strength.getOrDefault(reaction.getDefenderId(), 0) - strength.getOrDefault(movingPlayerId, 0);
                facts(publicReport, reaction.getDefenderId(), base, reaction.getMinimumRoll(), modifier);
                publicReport.add("logActors", new JsonObject().add("version", 1).add("actorId", reaction.getDefenderId())
                    .add("targetId", movingPlayerId == null ? JsonValue.NULL : JsonValue.valueOf(movingPlayerId)));
                continue;
            }
            if (!(report instanceof ReportSkillRoll)) continue;
            ReportSkillRoll roll = (ReportSkillRoll) report;
            int modifier = 0;
            for (com.fumbbl.ffb.modifiers.RollModifier<?> item : roll.getRollModifiers()) modifier -= item.getModifier();
            Integer base;
            switch (report.getId()) {
                case PICK_UP_ROLL:
                    base = report instanceof com.fumbbl.ffb.report.bb2025.ReportPickupRoll
                        && ((com.fumbbl.ffb.report.bb2025.ReportPickupRoll) report).isSecureTheBall() ? 2 : agility.get(roll.getPlayerId());
                    break;
                case PASS_ROLL:
                    base = report instanceof ReportPassRoll && ((ReportPassRoll) report).isHailMaryPass() ? 2 : passing.get(roll.getPlayerId());
                    break;
                case GO_FOR_IT_ROLL: base = 2; break;
                case DODGE_ROLL:
                case CATCH_ROLL:
                case JUMP_ROLL:
                case JUMP_UP_ROLL:
                case RIGHT_STUFF_ROLL:
                case INTERCEPTION_ROLL:
                case SAFE_THROW_ROLL: base = agility.get(roll.getPlayerId()); break;
                case HYPNOTIC_GAZE_ROLL: base = 3; modifier = 0; break;
                case BLOOD_LUST_ROLL: base = bloodLust.get(roll.getPlayerId()); modifier = base == null ? 0 : base - roll.getMinimumRoll(); break;
                case CONFUSION_ROLL:
                    Skill skill = ((ReportConfusionRoll) report).getConfusionSkill();
                    base = skill != null && (skill.hasSkillProperty(NamedProperties.needsToRollHighToAvoidConfusion)
                        || skill.hasSkillProperty(NamedProperties.needsToRollForActionButKeepsTacklezone)) ? 4 : 2;
                    modifier = base - roll.getMinimumRoll(); break;
                case THROW_TEAM_MATE_ROLL:
                    base = 2;
                    if (((ReportThrowTeamMateRoll) report).getPassingDistance() != null)
                        modifier -= ((ReportThrowTeamMateRoll) report).getPassingDistance().getModifier2020();
                    break;
                default: base = roll.getMinimumRoll() + modifier; break;
            }
            if (base == null || base < 1) continue;
            if (report instanceof ReportDodgeRoll && ((ReportDodgeRoll) report).getStatBasedRollModifier() != null)
                modifier += ((ReportDodgeRoll) report).getStatBasedRollModifier().getModifier();
            if (report instanceof ReportPassRoll && ((ReportPassRoll) report).getStatBasedRollModifier() != null)
                modifier -= ((ReportPassRoll) report).getStatBasedRollModifier().getModifier();
            if (report instanceof ReportPassRoll && !((ReportPassRoll) report).isHailMaryPass()
                && ((ReportPassRoll) report).getPassingDistance() != null)
                modifier -= ((ReportPassRoll) report).getPassingDistance().getModifier2020();
            facts(publicReport, roll.getPlayerId(), base, roll.getMinimumRoll(), modifier);
        }
    }

    private void facts(JsonObject report, String playerId, int base, int minimum, int modifier) {
        report.add("logRoll", new JsonObject().add("version", 1).add("base", base)
            .add("target", DiceInterpreter.getInstance().minimumSuccessfulSkillRoll(minimum))
            .add("modifier", modifier).add("square", squares.getOrDefault(playerId, JsonValue.NULL)));
    }

    private JsonValue square(FieldCoordinate coordinate) {
        return FieldCoordinateBounds.FIELD.isInBounds(coordinate)
            ? new JsonObject().add("x", coordinate.getX()).add("y", coordinate.getY()) : JsonValue.NULL;
    }
}
