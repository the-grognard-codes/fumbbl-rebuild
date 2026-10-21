package com.fumbbl.ffb.test.skill.pass;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.PassingDistance;
import com.fumbbl.ffb.PlayerAction;
import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.mechanics.Mechanic;
import com.fumbbl.ffb.mechanics.PassMechanic;
import com.fumbbl.ffb.mechanics.PassRangeService;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.test.GameStateBuilder;
import com.fumbbl.ffb.test.TestServer;
import com.fumbbl.ffb.util.UtilActingPlayer;

import java.util.Collections;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class HailMaryPassRangeTest {

	private final PassRangeService service = new PassRangeService();

	@Test void ballAndBombReachEveryPitchSquareInNonBlizzardWeather() throws Exception {
		Game game = game("BB2025");
		for (Weather weather : Weather.values()) {
			if (weather == Weather.BLIZZARD) continue;
			game.getFieldModel().setWeather(weather);
			for (PlayerAction action : hailMaryActions()) {
				for (int x = 0; x < FieldCoordinate.FIELD_WIDTH; x++) {
					for (int y = 0; y < FieldCoordinate.FIELD_HEIGHT; y++) {
						assertTrue(service.isInRange(game, thrower(game), new FieldCoordinate(x, y), action));
					}
				}
			}
		}
		assertFalse(service.isInRange(game, thrower(game), new FieldCoordinate(24, 7), PlayerAction.PASS));
	}

	@Test void blizzardBallAndBombUseOrdinaryGeometricQuickAndShortCap() throws Exception {
		Game game = game("BB2025");
		game.getFieldModel().setWeather(Weather.BLIZZARD);
		PassMechanic mechanic = game.getMechanic(Mechanic.Type.PASS);
		for (PlayerAction action : hailMaryActions()) {
			for (int x = 0; x < FieldCoordinate.FIELD_WIDTH; x++) {
				for (int y = 0; y < FieldCoordinate.FIELD_HEIGHT; y++) {
					FieldCoordinate target = new FieldCoordinate(x, y);
					assertEquals(mechanic.findPassingDistance(game, new FieldCoordinate(3, 7), target, false) != null,
						service.isInRange(game, thrower(game), target, action), target.toString());
				}
			}
			assertTrue(service.isInRange(game, thrower(game), new FieldCoordinate(9, 7), action));
			assertFalse(service.isInRange(game, thrower(game), new FieldCoordinate(10, 7), action));
			assertFalse(service.isInRange(game, thrower(game), new FieldCoordinate(24, 7), action));
		}
		assertEquals(6, mechanic.minimumRoll(thrower(game), PassingDistance.LONG_BOMB, Collections.emptySet()).get().intValue());
	}

	@Test void bb2025RejectsNullAndOffPitchTargets() throws Exception {
		Game game = game("BB2025");
		for (PlayerAction action : hailMaryActions()) {
			for (FieldCoordinate target : new FieldCoordinate[] {null, new FieldCoordinate(-1, 7),
				new FieldCoordinate(26, 7), new FieldCoordinate(3, -1), new FieldCoordinate(3, 15)}) {
				assertFalse(service.isInRange(game, thrower(game), target, action));
			}
		}
	}

	@Test void olderRulesetsKeepUnlimitedHailMaryRangeAndBlizzardAvailability() throws Exception {
		for (String rules : new String[] {"BB2016", "BB2020"}) {
			Game game = game(rules);
			PassMechanic mechanic = game.getMechanic(Mechanic.Type.PASS);
			assertTrue(mechanic.isHailMaryPassAvailable(game, thrower(game)));
			game.getFieldModel().setWeather(Weather.BLIZZARD);
			assertFalse(mechanic.isHailMaryPassAvailable(game, thrower(game)));
			for (PlayerAction action : hailMaryActions()) {
				assertTrue(service.isInRange(game, thrower(game), new FieldCoordinate(24, 7), action));
			}
		}
	}

	@Test void bb2025HailMaryAvailabilityRequiresSkillAndAllowsBlizzard() throws Exception {
		Game game = game("BB2025");
		game.getFieldModel().setWeather(Weather.BLIZZARD);
		PassMechanic mechanic = game.getMechanic(Mechanic.Type.PASS);
		assertTrue(mechanic.isHailMaryPassAvailable(game, thrower(game)));
		assertFalse(mechanic.isHailMaryPassAvailable(game, game.getPlayerById("opponent")));
	}

	private Game game(String rules) throws Exception {
		Game game = new GameStateBuilder(new TestServer().getGameState()).withRule(rules).withWeather(Weather.NICE)
			.withTeam(true, team -> team.player("thrower", player -> player.at(3, 7).stats(6, 3, 3, 3, 9).skill("Hail Mary Pass")))
			.withTeam(false, team -> team.player("opponent", player -> player.at(15, 7).stats(6, 3, 3, 3, 9)))
			.build().getGame();
		UtilActingPlayer.changeActingPlayer(game, "thrower", PlayerAction.HAIL_MARY_PASS, false);
		return game;
	}

	private Player<?> thrower(Game game) { return game.getPlayerById("thrower"); }
	private PlayerAction[] hailMaryActions() { return new PlayerAction[] {PlayerAction.HAIL_MARY_PASS, PlayerAction.HAIL_MARY_BOMB}; }
}
