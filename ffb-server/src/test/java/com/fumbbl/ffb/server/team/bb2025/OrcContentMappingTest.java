package com.fumbbl.ffb.server.team.bb2025;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType.Factory;
import com.fumbbl.ffb.SkillCategory;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.SpecialRule;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.GameOptionString;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/** Engine mapping probe for the source-backed Orc candidate in m6-orc-content-readiness.md. */
public class OrcContentMappingTest {
	@Test
	public void orcBaseSkillsResolveInTheBb2025FactoryWithTheirRuleCategories() {
		Game game = new Game(null, new FactoryManager());
		game.getOptions().addOption(new GameOptionString(GameOptionId.RULESVERSION).setValue("BB2025"));
		game.initializeRules();
		SkillFactory factory = game.getRules().getFactory(Factory.SKILL);
		assertSkill(factory, "Dodge", SkillCategory.AGILITY);
		assertSkill(factory, "Right Stuff", SkillCategory.TRAIT);
		assertSkill(factory, "Stunty", SkillCategory.TRAIT);
		assertSkill(factory, "Pass", SkillCategory.PASSING);
		assertSkill(factory, "Sure Hands", SkillCategory.GENERAL);
		assertSkill(factory, "Block", SkillCategory.GENERAL);
		assertSkill(factory, "Break Tackle", SkillCategory.STRENGTH);
		assertSkill(factory, "Mighty Blow", SkillCategory.STRENGTH);
		assertSkill(factory, "Taunt", SkillCategory.GENERAL);
		assertSkill(factory, "Thick Skull", SkillCategory.STRENGTH);
		assertSkill(factory, "Unsteady", SkillCategory.TRAIT);
		assertSkill(factory, "Always Hungry", SkillCategory.TRAIT);
		assertSkill(factory, "Loner", SkillCategory.TRAIT);
		assertSkill(factory, "Projectile Vomit", SkillCategory.TRAIT);
		assertSkill(factory, "Really Stupid", SkillCategory.TRAIT);
		assertSkill(factory, "Regeneration", SkillCategory.TRAIT);
		assertSkill(factory, "Throw Team-Mate", SkillCategory.TRAIT);
		assertEquals("Brawlin' Brutes", SpecialRule.BRAWLIN_BRUTES.getRuleName());
	}

	private void assertSkill(SkillFactory factory, String name, SkillCategory category) {
		Skill skill = factory.forName(name);
		assertNotNull(skill, name);
		assertEquals(category, skill.getCategory(), name);
	}
}
