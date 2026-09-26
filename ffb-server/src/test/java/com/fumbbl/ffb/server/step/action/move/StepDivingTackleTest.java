package com.fumbbl.ffb.server.step.action.move;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.GameRules;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.ServerMode;

import org.junit.jupiter.api.Test;

import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;

class StepDivingTackleTest {
	private final FantasyFootballServer server = new FantasyFootballServer(ServerMode.STANDALONE, new Properties());
	private final Game game = new Game(server, server.getFactoryManager());
	private final GameRules rules = game.getRules();

	StepDivingTackleTest() {
		rules.initialize(game);
	}

	@Test
	void recoveryPreservesUnansweredModifyingSkillChoice() {
		JsonObject checkpoint = new StepDivingTackle(null).toJsonValue();
		assertEquals(checkpoint, new StepDivingTackle(null).initFrom(rules, checkpoint).toJsonValue());
	}

	@Test
	void recoveryPreservesAnsweredModifyingSkillChoice() {
		for (boolean used : new boolean[] {false, true}) {
			JsonObject checkpoint = new StepDivingTackle(null).toJsonValue().add("usingModifyingSkill", used);
			assertEquals(checkpoint, new StepDivingTackle(null).initFrom(rules, checkpoint).toJsonValue());
		}
	}
}
