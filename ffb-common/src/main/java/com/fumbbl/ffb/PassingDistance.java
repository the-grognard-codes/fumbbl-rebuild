package com.fumbbl.ffb;

/**
 * 
 * @author Kalimar
 */
public enum PassingDistance implements INamedObject {

	QUICK_PASS("Quick Pass", 0, 'Q'),
	SHORT_PASS("Short Pass", 1, 'S'),
	LONG_PASS("Long Pass", 2, 'L'),
	LONG_BOMB("Long Bomb", 3, 'B'),
	PASS_TO_PARTNER("Pass to Partner", 0, 'R');

	private final String fName;
	private final int passingModifier;
	private final char fShortcut;

	PassingDistance(String pName, int passingModifier, char pShortcut) {
		fName = pName;
		this.passingModifier = passingModifier;
		fShortcut = pShortcut;
	}

	public String getName() {
		return fName;
	}

	public int getPassingModifier() {
		return passingModifier;
	}

	public char getShortcut() {
		return fShortcut;
	}

}
