package com.fumbbl.ffb.server.inducements.bb2025.prayers;

import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.inducement.bb2025.Prayer;
import com.fumbbl.ffb.server.inducements.bb2025.prayers.AbstractPlayerSelector;

@RulesCollection(RulesCollection.Rules.BB2025)
public class GreasyCleatsHandler extends com.fumbbl.ffb.server.inducements.bb2025.prayers.AbstractGreasyCleatsHandler {
	@Override
	public Prayer handledPrayer() {
		return Prayer.GREASY_CLEATS;
	}

	@Override
	protected AbstractPlayerSelector selector() {
		return OpponentPlayerSelector.INSTANCE;
	}
}
