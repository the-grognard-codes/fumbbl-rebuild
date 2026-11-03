package com.fumbbl.ffb;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

@Retention(RetentionPolicy.RUNTIME)
public @interface RulesCollection {

	enum Rules {
		// Registration layers, not alternative playable editions.
		COMMON,
		BB2025
	}

	Rules value() default Rules.COMMON;
}
