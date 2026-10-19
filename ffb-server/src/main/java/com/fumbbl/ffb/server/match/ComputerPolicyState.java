package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.Arrays;
import java.util.HashSet;

/** Bounded private coach memory and progress observed from authoritative resolved states. */
final class ComputerPolicyState {

	private JsonValue policyState = JsonValue.NULL;
	private String turnKey = "initial";
	private int stalledTurns;
	private int drive;
	private String possession = "none";
	private Integer position;
	private boolean ownTurnOpen;
	private boolean hadPossession;
	private boolean progressed;

	ComputerPolicyState() { }

	ComputerPolicyState(JsonObject saved) {
		exact(saved, "version", "policyState", "turnKey", "stalledTurns", "drive", "possession", "position",
			"ownTurnOpen", "hadPossession", "progressed");
		if (saved.getInt("version", -1) != 1) throw new IllegalArgumentException("Unsupported computer memory");
		policyState = saved.get("policyState");
		if (!policyState.isNull()) validateState(policyState.asObject());
		turnKey = text(saved.get("turnKey"), 100);
		stalledTurns = number(saved.get("stalledTurns"), 0, 255);
		drive = number(saved.get("drive"), 0, 100);
		possession = saved.get("possession").asString();
		if (!Arrays.asList("none", "home", "away").contains(possession)) throw new IllegalArgumentException("Invalid possession");
		position = saved.get("position").isNull() ? null : number(saved.get("position"), 0, 25);
		if ((position != null) != "away".equals(possession)) throw new IllegalArgumentException("Invalid progress position");
		ownTurnOpen = saved.get("ownTurnOpen").asBoolean();
		hadPossession = saved.get("hadPossession").asBoolean();
		progressed = saved.get("progressed").asBoolean();
	}

	JsonObject json() {
		return new JsonObject().add("version", 1).add("policyState", policyState).add("turnKey", turnKey)
			.add("stalledTurns", stalledTurns).add("drive", drive).add("possession", possession)
			.add("position", position == null ? JsonValue.NULL : JsonValue.valueOf(position))
			.add("ownTurnOpen", ownTurnOpen).add("hadPossession", hadPossession).add("progressed", progressed);
	}

	JsonValue policyState() { return policyState; }

	JsonObject progress() { return new JsonObject().add("turnKey", turnKey).add("stalledTurns", stalledTurns); }

	void validateDecision(JsonObject decision, ComputerCoach coach, boolean currentRevision) {
		exact(decision, "policyVersion", "reason", "nextPolicyState");
		if (!ComputerOpponentService.BOGRUK_ID.equals(coach.opponentId)
			|| !coach.policyVersion.equals(decision.getString("policyVersion", null)))
			throw new IllegalArgumentException("Computer policy differs");
		text(decision.get("reason"), 200);
		JsonObject next = decision.get("nextPolicyState").asObject();
		validateState(next);
		if (!currentRevision) return; // Request history resolves an exact retry before any state advancement.
		if (!turnKey.equals(next.getString("turnKey", null))) throw new IllegalArgumentException("Stale computer turn");
		if (!policyState.isNull() && turnKey.equals(policyState.asObject().getString("turnKey", null))) {
			JsonObject previous = policyState.asObject();
			if (previous.getBoolean("mistakeUsed", false) && !next.getBoolean("mistakeUsed", false)
				|| next.getInt("actions", -1) < previous.getInt("actions", 0))
				throw new IllegalArgumentException("Computer turn allowance cannot be replenished");
		}
	}

	void accept(JsonObject decision) {
		policyState = JsonObject.readFrom(decision.get("nextPolicyState").toString());
	}

	/** Called for both teams, including automatic reactive deadlines; no policy request is necessary. */
	void observe(JsonObject view, boolean normalHomePlaying) {
		String nextKey = view.getInt("half", 1) + ":" + view.getInt("drive", 1) + ":" + view.getInt("awayTurn", 0);
		int nextDrive = view.getInt("drive", 1);
		if (drive != nextDrive) {
			stalledTurns = 0; possession = "none"; position = null;
			ownTurnOpen = false; hadPossession = false; progressed = false;
		}
		drive = nextDrive;
		JsonObject ballState = view.get("ballState").asObject();
		String nextPossession = "none";
		Integer nextPosition = null;
		// Native ballMoving also describes a loose ground ball. Possession comes from carrier identity.
		JsonValue carrierValue = ballState.get("carrierPlayerId");
		String carrier = carrierValue == null || carrierValue.isNull() ? null : carrierValue.asString();
		for (JsonValue value : view.get("players").asArray()) {
			JsonObject player = value.asObject();
			if (carrier != null && carrier.equals(player.getString("id", null))) {
				nextPossession = player.getString("role", "none");
				if ("away".equals(nextPossession) && !player.get("x").isNull()) nextPosition = 25 - player.getInt("x", 25);
			}
		}
		if (!possession.equals(nextPossession)) {
			stalledTurns = 0; progressed = false; hadPossession = false;
		} else if (nextPosition != null && position != null && nextPosition > position) {
			stalledTurns = 0;
			if (ownTurnOpen) progressed = true;
		}
		boolean ownTurn = !normalHomePlaying && "PLAY".equals(view.getString("phase", null))
			&& view.getInt("awayTurn", 0) > 0 && view.get("kickoff") == null;
		if (ownTurnOpen && (!ownTurn || !turnKey.equals(nextKey))) {
			if ("away".equals(nextPossession) && hadPossession && !progressed) stalledTurns = Math.min(255, stalledTurns + 1);
			ownTurnOpen = false; hadPossession = false; progressed = false;
		}
		if (ownTurn && !ownTurnOpen) { ownTurnOpen = true; progressed = false; }
		if (ownTurn && "away".equals(nextPossession)) hadPossession = true;
		turnKey = nextKey;
		possession = nextPossession;
		position = nextPosition;
	}

	private void validateState(JsonObject value) {
		exact(value, "version", "turnKey", "actions", "mistakeUsed", "plan");
		if (value.getInt("version", -1) != 1) throw new IllegalArgumentException("Unsupported computer state");
		text(value.get("turnKey"), 100);
		number(value.get("actions"), 0, 256);
		value.get("mistakeUsed").asBoolean();
		if (!value.get("plan").isNull()) {
			JsonObject plan = value.get("plan").asObject();
			exact(plan, "playerId", "kind", "targetPlayerId", "target");
			text(plan.get("playerId"), 200);
			if (!Arrays.asList("move", "blitz", "foul", "pass", "handOff", "secureBall").contains(plan.getString("kind", null)))
				throw new IllegalArgumentException("Invalid computer plan");
			if (!plan.get("targetPlayerId").isNull()) text(plan.get("targetPlayerId"), 200);
			JsonObject target = plan.get("target").asObject();
			exact(target, "x", "y"); number(target.get("x"), 0, 25); number(target.get("y"), 0, 14);
		}
	}

	private void exact(JsonObject value, String... keys) {
		if (value.size() != keys.length || !new HashSet<>(value.names()).equals(new HashSet<>(Arrays.asList(keys))))
			throw new IllegalArgumentException("Unexpected computer fields");
	}

	private int number(JsonValue value, int minimum, int maximum) {
		int result = value.asInt();
		if (result < minimum || result > maximum) throw new IllegalArgumentException("Invalid computer number");
		return result;
	}

	private String text(JsonValue value, int maximum) {
		String result = value.asString();
		if (result.isEmpty() || result.length() > maximum || result.indexOf('\n') >= 0 || result.indexOf('\r') >= 0)
			throw new IllegalArgumentException("Invalid computer text");
		return result;
	}
}
