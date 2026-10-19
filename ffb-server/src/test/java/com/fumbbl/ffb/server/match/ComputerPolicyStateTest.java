package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ComputerPolicyStateTest {

	@Test void countsOnlyCompletedPossessionTurnsAndRetainsFrustrationAcrossRecovery() {
		ComputerPolicyState memory = new ComputerPolicyState();
		memory.observe(view(1, 1, "away", 15), false);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
		memory.observe(view(1, 1, "away", 15), true);
		assertEquals(1, memory.progress().getInt("stalledTurns", -1));
		memory = new ComputerPolicyState(JsonObject.readFrom(memory.json().toString()));
		memory.observe(view(1, 2, "away", 15), false);
		memory.observe(view(1, 2, "away", 15), true);
		assertEquals(2, memory.progress().getInt("stalledTurns", -1));
		assertEquals("1:1:2", memory.progress().getString("turnKey", null));
	}

	@Test void forwardProgressPossessionChangesAndDrivesResetFrustration() {
		ComputerPolicyState memory = stalled();
		memory.observe(view(1, 2, "away", 15), false);
		memory.observe(view(1, 2, "away", 14), false);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
		memory.observe(view(1, 2, "away", 14), true);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
		memory = stalled();
		memory.observe(view(1, 1, "home", 15), true);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
		memory = stalled();
		memory.observe(view(2, 1, "away", 15), true);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
	}

	@Test void nativeMovingFlagOnALooseGroundBallStillResetsPossession() {
		ComputerPolicyState memory = stalled();
		JsonObject inFlight = view(1, 1, "none", 15);
		inFlight.get("ballState").asObject().set("moving", true);
		memory.observe(inFlight, true);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
		memory.observe(view(1, 1, "none", 15), true);
		assertEquals(0, memory.progress().getInt("stalledTurns", -1));
	}

	@Test void recoveredMistakeAllowanceCannotBeReplenishedWithinTheSameTurn() {
		ComputerPolicyState memory = new ComputerPolicyState();
		memory.observe(view(1, 1, "away", 15), false);
		JsonObject used = decision("1:1:1", 3, true);
		memory.validateDecision(used, coach(), true);
		memory.accept(used);
		ComputerPolicyState recovered = new ComputerPolicyState(JsonObject.readFrom(memory.json().toString()));
		assertThrows(IllegalArgumentException.class, () -> recovered.validateDecision(decision("1:1:1", 4, false), coach(), true));
		assertThrows(IllegalArgumentException.class, () -> recovered.validateDecision(decision("1:1:1", 2, true), coach(), true));
		recovered.validateDecision(used, coach(), false);
		recovered.observe(view(1, 1, "away", 15), true);
		recovered.observe(view(1, 2, "away", 15), false);
		recovered.validateDecision(decision("1:1:2", 1, false), coach(), true);
	}

	@Test void rejectsUnboundedUnknownOrWrongPolicyMetadata() {
		ComputerPolicyState memory = new ComputerPolicyState();
		memory.observe(view(1, 1, "away", 15), false);
		JsonObject oversized = decision("1:1:1", 257, false);
		assertThrows(IllegalArgumentException.class, () -> memory.validateDecision(oversized, coach(), true));
		JsonObject unknown = decision("1:1:1", 1, false).add("extra", true);
		assertThrows(IllegalArgumentException.class, () -> memory.validateDecision(unknown, coach(), true));
		assertThrows(IllegalArgumentException.class, () -> memory.validateDecision(decision("1:1:1", 1, false),
			new ComputerCoach(ComputerOpponentService.BUGMAN_ID, "random-v1", 1), true));
	}

	private ComputerPolicyState stalled() {
		ComputerPolicyState memory = new ComputerPolicyState();
		memory.observe(view(1, 1, "away", 15), false);
		memory.observe(view(1, 1, "away", 15), true);
		return memory;
	}

	private ComputerCoach coach() { return new ComputerCoach(ComputerOpponentService.BOGRUK_ID, "bogruk-v1", 1); }

	private JsonObject decision(String key, int actions, boolean used) {
		return new JsonObject().add("policyVersion", "bogruk-v1").add("reason", "Pursue the ball")
			.add("nextPolicyState", new JsonObject().add("version", 1).add("turnKey", key)
				.add("actions", actions).add("mistakeUsed", used).add("plan", JsonValue.NULL));
	}

	private JsonObject view(int drive, int turn, String owner, int x) {
		String id = "none".equals(owner) ? null : "carrier";
		return new JsonObject().add("half", 1).add("drive", drive).add("awayTurn", turn).add("phase", "PLAY")
			.add("ballState", new JsonObject().add("carrierPlayerId", id == null ? JsonValue.NULL : JsonValue.valueOf(id)).add("moving", false))
			.add("players", new JsonArray().add(new JsonObject().add("id", "carrier").add("role", owner).add("x", x)));
	}
}
