package com.fumbbl.ffb.server.team.bb2025;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType.Factory;
import com.fumbbl.ffb.SkillCategory;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.GameOptionString;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class SkillDefinitionsTest {
	@Test
	public void everySourceSkillAndTraitResolvesInTheBb2025Factory() {
		RosterCatalog catalog = new RosterCatalog();
		assertEquals(108, catalog.getSkills().size());
		assertEquals(72, catalog.getSkills().values().stream().filter(option -> option.selectable).count());
		assertEquals(36, catalog.getSkills().values().stream().filter(option -> !option.selectable).count());
		assertEquals("block,dodge,guard,mighty-blow", catalog.getSkills().values().stream()
			.filter(option -> option.elite).map(option -> option.id).sorted().collect(Collectors.joining(",")));
		Map<String, Integer> counts = new HashMap<>();
		for (RosterCatalog.SkillOption option : catalog.getSkills().values()) {
			counts.merge(option.category, 1, Integer::sum);
		}
		for (String category : new String[] { "A", "D", "G", "M", "P", "S" }) assertEquals(12, counts.get(category).intValue());
		assertEquals(36, counts.get("T").intValue());
	}

	@Test
	public void skillsUseBb2025Categories() {
		SkillFactory current = factory();
		assertEquals(SkillCategory.AGILITY, current.forName("Hit And Run").getCategory());
		assertEquals(SkillCategory.GENERAL, current.forName("Steady Footing").getCategory());
		assertEquals(SkillCategory.TRAIT, current.forName("Bloodlust").getCategory());
	}

	private SkillFactory factory() {
		Game game = new Game(null, new FactoryManager());
		game.getOptions().addOption(new GameOptionString(GameOptionId.RULESVERSION).setValue("BB2025"));
		game.initializeRules();
		return game.getRules().getFactory(Factory.SKILL);
	}
}
