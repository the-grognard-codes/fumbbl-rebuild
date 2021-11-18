package com.fumbbl.ffb.server.skillbehaviour.bb2020;

import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.ReRollSources;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.RulesCollection.Rules;
import com.fumbbl.ffb.skill.Pass;

@RulesCollection(Rules.BB2020)
public class PassBehaviour extends AbstractPassBehaviour<Pass> {
	@Override
	protected ReRollSource getReRollSource() {
		return ReRollSources.PASS;
	}
}