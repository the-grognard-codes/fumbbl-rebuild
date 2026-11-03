package com.fumbbl.ffb.server.skillbehaviour.bb2025;

import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.server.injury.modification.SavageMaulingModification;
import com.fumbbl.ffb.server.model.SkillBehaviour;
import com.fumbbl.ffb.skill.bb2025.special.SavageMauling;

@RulesCollection(RulesCollection.Rules.BB2025)
public class SavageMaulingBehaviour extends SkillBehaviour<SavageMauling> {

	public SavageMaulingBehaviour() {
		super();

		registerModifier(new SavageMaulingModification());
	}
}
