package com.fumbbl.ffb.server.skilluse;

import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.util.LinkedHashMap;
import java.util.Map;

/** Answers belong to a native step, so recovery does not consult a changed preference. */
public final class OptionalSkillChoices {
	private final Map<String, Boolean> answers = new LinkedHashMap<>();
	private String pendingKey, playerId, skillName;

	public Boolean answer(String key) { return answers.get(key); }
	public void accept(String key) { answers.put(key, true); }
	public boolean pending() { return pendingKey != null; }

	public void ask(String key, String player, String skill) {
		pendingKey = key; playerId = player; skillName = skill;
	}

	public boolean handle(ClientCommandUseSkill command) {
		if (!pending() || !playerId.equals(command.getPlayerId()) || command.getSkill() == null
			|| !skillName.equals(command.getSkill().getName())) return false;
		answers.put(pendingKey, command.isSkillUsed());
		pendingKey = null; playerId = null; skillName = null;
		return true;
	}

	public JsonObject toJson() {
		if (answers.isEmpty() && !pending()) return null;
		JsonObject saved = new JsonObject(), values = new JsonObject();
		answers.forEach(values::add);
		saved.add("answers", values);
		if (pending()) saved.add("pending", pendingKey).add("playerId", playerId).add("skill", skillName);
		return saved;
	}

	public void restore(JsonValue value) {
		answers.clear(); pendingKey = null; playerId = null; skillName = null;
		if (value == null) return;
		JsonObject saved = value.asObject();
		for (JsonObject.Member member : saved.get("answers").asObject()) answers.put(member.getName(), member.getValue().asBoolean());
		pendingKey = saved.getString("pending", null);
		if (pending()) {
			playerId = saved.get("playerId").asString();
			skillName = saved.get("skill").asString();
		}
	}
}
