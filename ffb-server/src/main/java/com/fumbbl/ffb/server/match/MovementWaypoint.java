package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.eclipsesource.json.JsonObject;

/** A jump is an explicit coach instruction, never an inferred two-square walk. */
public final class MovementWaypoint {

	private final boolean jump;
	private final FieldCoordinate coordinate;

	MovementWaypoint(FieldCoordinate coordinate, boolean jump) {
		this.coordinate = coordinate;
		this.jump = jump;
	}

	public MovementWaypoint(JsonObject point) {
		coordinate = new FieldCoordinate(point.get("x").asInt(), point.get("y").asInt());
		jump = point.getBoolean("jump", false);
		if (point.size() != (jump ? 3 : 2) || !point.names().contains("x") || !point.names().contains("y"))
			throw new IllegalArgumentException("Invalid movement waypoint");
	}

	public boolean isJump() { return jump; }
	FieldCoordinate coordinate() { return coordinate; }

	public JsonObject json() {
		JsonObject point = new JsonObject().add("x", coordinate.getX()).add("y", coordinate.getY());
		if (jump) point.add("jump", true);
		return point;
	}
}
