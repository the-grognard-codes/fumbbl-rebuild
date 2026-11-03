package com.fumbbl.ffb.util;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.Team;
import com.fumbbl.ffb.model.property.NamedProperties;

import java.util.ArrayList;
import java.util.List;

public class UtilPassing {

	public static double RULER_WIDTH = 1.74;

	public static Player<?>[] findInterceptors(Game pGame, Player<?> pThrower, FieldCoordinate pTargetCoordinate) {
		List<Player<?>> interceptors = new ArrayList<>();
		if ((pTargetCoordinate != null) && (pThrower != null)) {
			boolean passesNotIntercepted = pThrower.hasSkillProperty(NamedProperties.passesAreNotIntercepted);
			FieldCoordinate throwerCoordinate = pGame.getFieldModel().getPlayerCoordinate(pThrower);
			Team otherTeam = pGame.getTeamHome().hasPlayer(pThrower) ? pGame.getTeamAway() : pGame.getTeamHome();
			Player<?>[] otherPlayers = otherTeam.getPlayers();
			for (Player<?> otherPlayer : otherPlayers) {
				if (passesNotIntercepted && !UtilCards.hasSkillToCancelProperty(otherPlayer, NamedProperties.passesAreNotIntercepted)) {
					continue; // Cloud Burster 2025: no interception unless cancelled (e.g., Very Long Legs 2025)
				}
				PlayerState interceptorState = pGame.getFieldModel().getPlayerState(otherPlayer);
				FieldCoordinate interceptorCoordinate = pGame.getFieldModel().getPlayerCoordinate(otherPlayer);
				if ((interceptorCoordinate != null) && (interceptorState != null) && interceptorState.hasTacklezones()
					&& !otherPlayer.hasSkillProperty(NamedProperties.preventCatch)) {
					if (canIntercept(throwerCoordinate, pTargetCoordinate, interceptorCoordinate)) {
						interceptors.add(otherPlayer);
					}
				}
			}
		}
		return interceptors.toArray(new Player[0]);
	}

	private static boolean canIntercept(FieldCoordinate pThrowerCoordinate, FieldCoordinate pTargetCoordinate,
			FieldCoordinate pIinterceptorCoordinate) {
		int receiverX = pTargetCoordinate.getX() - pThrowerCoordinate.getX();
		int receiverY = pTargetCoordinate.getY() - pThrowerCoordinate.getY();
		int interceptorX = pIinterceptorCoordinate.getX() - pThrowerCoordinate.getX();
		int interceptorY = pIinterceptorCoordinate.getY() - pThrowerCoordinate.getY();
		int a = ((receiverX - interceptorX) * (receiverX - interceptorX))
				+ ((receiverY - interceptorY) * (receiverY - interceptorY));
		int b = (interceptorX * interceptorX) + (interceptorY * interceptorY);
		int c = (receiverX * receiverX) + (receiverY * receiverY);
		double d1 = Math.abs((receiverY * (interceptorX + 0.5)) - (receiverX * (interceptorY + 0.5)));
		double d2 = Math.abs((receiverY * (interceptorX + 0.5)) - (receiverX * (interceptorY - 0.5)));
		double d3 = Math.abs((receiverY * (interceptorX - 0.5)) - (receiverX * (interceptorY + 0.5)));
		double d4 = Math.abs((receiverY * (interceptorX - 0.5)) - (receiverX * (interceptorY - 0.5)));
		return (c > a) && (c > b) && (RULER_WIDTH > (2 * Math.min(Math.min(Math.min(d1, d2), d3), d4) / Math.sqrt(c)));
	}

}
