package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.property.ISkillProperty;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.net.commands.ClientCommandActingPlayer;
import com.fumbbl.ffb.net.commands.ClientCommandBlock;
import com.fumbbl.ffb.server.match.CoreTurnActions.Action;

import java.util.List;

/** Native BB2025 special block declarations and exact target command variants. */
final class SpecialBlockActions {
    void declarations(Player<?> player, PlayerState status, boolean canBlock, String role, List<Action> actions) {
        if (!canBlock) return;
        declare(player, status, role, actions, "Stab", "declareStab", PlayerAction.STAB,
            NamedProperties.providesStabBlockAlternative);
        declare(player, status, role, actions, "Chainsaw", "declareChainsaw", PlayerAction.CHAINSAW,
            NamedProperties.providesChainsawBlockAlternative);
        declare(player, status, role, actions, "Projectile Vomit", "declareProjectileVomit", PlayerAction.PROJECTILE_VOMIT,
            NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFail);
        declare(player, status, role, actions, "Breathe Fire", "declareBreatheFire", PlayerAction.BREATHE_FIRE,
            NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFailWithTurnover);
    }

    void targets(Player<?> attacker, PlayerAction action, Player<?> target, String role, List<Action> actions) {
        boolean canChoose = action == PlayerAction.BLOCK || action.isBlitzing();
        String prefix = action.isBlitzing() ? "Blitz - " : action == PlayerAction.BLOCK ? "Block - " : "";
        if ((canChoose || action == PlayerAction.STAB)
            && attacker.hasSkillProperty(NamedProperties.providesStabBlockAlternative))
            add(attacker, target, role, actions, "blockStab", prefix + "Stab", true, false, false, false);
        if ((canChoose || action == PlayerAction.CHAINSAW)
            && attacker.hasSkillProperty(NamedProperties.providesChainsawBlockAlternative))
            add(attacker, target, role, actions, "blockChainsaw", prefix + "Chainsaw", false, true, false, false);
        if ((canChoose && attacker.hasUnusedSkillProperty(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFail)
            || action == PlayerAction.PROJECTILE_VOMIT && attacker.hasSkillProperty(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFail)))
            add(attacker, target, role, actions, "blockProjectileVomit", prefix + "Projectile Vomit", false, false, true, false);
        if ((canChoose && attacker.hasUnusedSkillProperty(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFailWithTurnover)
            || action == PlayerAction.BREATHE_FIRE && attacker.hasSkillProperty(NamedProperties.canPerformArmourRollInsteadOfBlockThatMightFailWithTurnover)))
            add(attacker, target, role, actions, "blockBreatheFire", prefix + "Breathe Fire", false, false, false, true);
    }

    private void declare(Player<?> player, PlayerState status, String role, List<Action> actions, String name,
                         String kind, PlayerAction playerAction, ISkillProperty property) {
        if (!player.canDeclareSkillAction(property, status)) return;
        actions.add(new Action(kind + "-" + player.getId(), kind, name + " with " + player.getName(), role,
            new ClientCommandActingPlayer(player.getId(), playerAction, false), player.getId()));
    }

    private void add(Player<?> attacker, Player<?> target, String role, List<Action> actions, String kind, String label,
                     boolean stab, boolean chainsaw, boolean vomit, boolean fire) {
        actions.add(new Action(kind + "-" + target.getId(), kind, label + " " + target.getName(), role,
            new ClientCommandBlock(attacker.getId(), target.getId(), stab, chainsaw, vomit, fire, false), target.getId()));
    }
}
