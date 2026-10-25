package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RecoveryNativeJsonTest {
	@Test void onlyParameterKeySetsNormalizeWhileDropKeysAndHitTargetsKeepTheirOrder() {
		JsonObject first = fixture(false), permuted = fixture(true);
		for (JsonObject snapshot : new JsonObject[] {first, permuted}) {
			JsonArray keys = snapshot == first ? new JsonArray().add("NR_OF_DICE").add("BLOCK_ROLL")
				: new JsonArray().add("BLOCK_ROLL").add("NR_OF_DICE");
			JsonObject step = snapshot.get("currentStep").asObject();
			step.add("stepId", "blockRollMultiple").add("stepParameterKeys", keys)
				.add("pending", new JsonObject().add("stepId", "consumeParameter").add("stepParameterKeys", keys))
				.add("dropPlayerContext", new JsonObject().add("stepParameterKeys", new JsonArray().add("second").add("first")))
				.add("playerIdsHit", new JsonArray().add("second").add("first"));
		}
		RecoveryNativeJson format = new RecoveryNativeJson();
		assertEquals(format.normalize(first), format.normalize(permuted), "Native parameter sets ignore iteration order");
		JsonObject step = first.get("currentStep").asObject();
		assertEquals("[\"second\",\"first\"]", step.get("dropPlayerContext").asObject().get("stepParameterKeys").toString());
		assertEquals("[\"second\",\"first\"]", step.get("playerIdsHit").toString());
	}

	@Test void unorderedNativeCollectionsNormalizeButStackDiceAndReportsKeepTheirOrder() {
		JsonObject first = fixture(false), permuted = fixture(true);
		RecoveryNativeJson format = new RecoveryNativeJson();
		assertEquals(format.normalize(first), format.normalize(permuted));
		assertEquals("[6,1,5]", first.get("currentStep").asObject().get("blockRoll").toString());
		assertEquals("[\"second\",\"first\"]", first.get("stepStack").asObject().get("steps").toString());
		assertEquals("[\"injury\",\"turnover\"]", first.get("currentStep").asObject().get("reports").toString());
		assertEquals(first, format.normalize(JsonObject.readFrom(first.toString())), "Normalization is idempotent");
	}

	private JsonObject fixture(boolean reverse) {
		JsonArray categories = reverse ? new JsonArray().add("strength").add("agility") : new JsonArray().add("agility").add("strength");
		JsonObject position = new JsonObject().add("skillCategoriesNormal", categories).add("skillCategoriesDouble", categories);
		JsonArray modifiers = reverse ? new JsonArray().add("MA-decrement").add("AV-decrement")
			: new JsonArray().add("AV-decrement").add("MA-decrement");
		JsonObject player = new JsonObject().add("temporaryModifiersMap", new JsonObject().add("Dodgy Snack", modifiers));
		JsonObject team = new JsonObject().add("roster", new JsonObject().add("positionArray", new JsonArray().add(position)))
			.add("playerArray", new JsonArray().add(player));
		JsonObject a = new JsonObject().add("gameOptionId", "A").add("gameOptionValue", true);
		JsonObject b = new JsonObject().add("gameOptionId", "B").add("gameOptionValue", false);
		JsonObject game = new JsonObject().add("teamHome", team).add("teamAway", JsonObject.readFrom(team.toString()))
			.add("gameOptions", new JsonObject().add("gameOptionArray", reverse ? new JsonArray().add(b).add(a) : new JsonArray().add(a).add(b)))
			.add("fieldModel", new JsonObject().add("playerDataArray", new JsonArray()))
			.add("actingPlayer", new JsonObject().add("usedSkills", categories));
		return new JsonObject().add("game", game).add("stepStack", new JsonObject().add("steps", new JsonArray().add("second").add("first")))
			.add("currentStep", new JsonObject().add("blockRoll", new JsonArray().add(6).add(1).add(5)).add("reports", new JsonArray().add("injury").add("turnover")));
	}
}
