package com.fumbbl.ffb;


/**
 * 
 * @author Kalimar
 */
public enum CardEffect implements INamedObject {

	DISTRACTED("Distracted"),
	ILLEGALLY_SUBSTITUTED("IllegallySubstituted"),
	POISONED("Poisoned");

	private final String fName;

	CardEffect(String pName) {
		fName = pName;
	}

	public String getName() {
		return fName;
	}

}
