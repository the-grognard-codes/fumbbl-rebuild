package com.fumbbl.ffb.skill.bb2025;

import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.RulesCollection.Rules;
import com.fumbbl.ffb.SkillCategory;
import com.fumbbl.ffb.model.property.NamedProperties;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.model.skill.SkillUsageType;
import com.fumbbl.ffb.model.skill.SkillValueEvaluator;

@RulesCollection(Rules.BB2025)
public class Bloodlust extends Skill {

	public Bloodlust() {
		super("Bloodlust", SkillCategory.TRAIT, 2, true, SkillUsageType.REGULAR);
	}

	@Override
	public void postConstruct() {
		registerProperty(NamedProperties.enableStandUpAndEndBlitzAction);
		registerProperty(NamedProperties.needsToRollForActionBlockingIsEasier);
	}

	@Override
	public String getConfusionMessage() {
		return "needs to bite a thrall";
	}

	@Override
	public SkillValueEvaluator evaluator() {
		return SkillValueEvaluator.ROLL;
	}
}
