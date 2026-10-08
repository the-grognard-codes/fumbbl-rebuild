package com.fumbbl.ffb.modifiers;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.Player;

public class PickupContext implements ModifierContext {
	private final Player<?> player;
	private final Game game;
	private final FieldCoordinate coordinate;

	public PickupContext(Game game, Player<?> player) {
		this(game, player, null);
	}

	/** Future entry position; existing resolution reads the current native player square. */
	public PickupContext(Game game, Player<?> player, FieldCoordinate coordinate) {
		this.player = player;
		this.game = game;
		this.coordinate = coordinate;
	}

	public FieldCoordinate getCoordinate() {
		return coordinate == null ? game.getFieldModel().getPlayerCoordinate(player) : coordinate;
	}

	@Override
	public Player<?> getPlayer() {
		return player;
	}

	@Override
	public Game getGame() {
		return game;
	}
}
