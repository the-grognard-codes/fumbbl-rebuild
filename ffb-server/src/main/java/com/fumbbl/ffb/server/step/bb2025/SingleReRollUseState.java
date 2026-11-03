package com.fumbbl.ffb.server.step.bb2025;

import com.fumbbl.ffb.ReRollSource;

public interface SingleReRollUseState {

	void setReRollSource(ReRollSource reRollSource);

	String getId();

	void setId(String playerId);
}
