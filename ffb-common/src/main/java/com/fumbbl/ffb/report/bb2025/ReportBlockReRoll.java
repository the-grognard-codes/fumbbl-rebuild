package com.fumbbl.ffb.report.bb2025;

import com.fumbbl.ffb.ReRollSource;
import com.fumbbl.ffb.RulesCollection;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.json.IJsonOption;
import com.fumbbl.ffb.json.UtilJson;
import com.fumbbl.ffb.report.IReport;
import com.fumbbl.ffb.report.NoDiceReport;
import com.fumbbl.ffb.report.ReportId;
import com.fumbbl.ffb.report.UtilReport;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

/**
 * @author Kalimar
 */
@RulesCollection(RulesCollection.Rules.BB2025)
public class ReportBlockReRoll extends NoDiceReport {

	private int[] blockRoll;
	private String playerId;
	private ReRollSource reRollSource;
	private int[] rerolledIndexes;
	private String defenderId;
	private int[] blockRollAfterReroll;

	public ReportBlockReRoll() {
		super();
	}

	public ReportBlockReRoll(int[] blockRoll, String playerId, ReRollSource reRollSource) {
		this(blockRoll, playerId, reRollSource, null);
	}

	public ReportBlockReRoll(int[] blockRoll, String playerId, ReRollSource reRollSource, int[] rerolledIndexes) {
		this(blockRoll, playerId, reRollSource, rerolledIndexes, null);
	}

	public ReportBlockReRoll(int[] blockRoll, String playerId, ReRollSource reRollSource, int[] rerolledIndexes, String defenderId) {
		this(blockRoll, playerId, reRollSource, rerolledIndexes, defenderId, null);
	}

	public ReportBlockReRoll(int[] blockRoll, String playerId, ReRollSource reRollSource, int[] rerolledIndexes, String defenderId, int[] blockRollAfterReroll) {
		this.blockRoll = blockRoll;
		this.playerId = playerId;
		this.reRollSource = reRollSource;
		this.rerolledIndexes = rerolledIndexes == null ? null : rerolledIndexes.clone();
		this.defenderId = defenderId;
		this.blockRollAfterReroll = blockRollAfterReroll == null ? null : blockRollAfterReroll.clone();
	}

	public ReportId getId() {
		return ReportId.BLOCK_RE_ROLL;
	}

	public int[] getBlockRoll() {
		return blockRoll;
	}

	public String getPlayerId() {
		return playerId;
	}

	public ReRollSource getReRollSource() {
		return reRollSource;
	}
	// transformation

	public IReport transform(IFactorySource source) {
		return new ReportBlockReRoll(blockRoll, playerId, reRollSource, rerolledIndexes, defenderId, blockRollAfterReroll);
	}

	// JSON serialization

	public JsonObject toJsonValue() {
		JsonObject jsonObject = new JsonObject();
		IJsonOption.REPORT_ID.addTo(jsonObject, getId());
		IJsonOption.BLOCK_ROLL.addTo(jsonObject, blockRoll);
		IJsonOption.PLAYER_ID.addTo(jsonObject, playerId);
		IJsonOption.RE_ROLL_SOURCE.addTo(jsonObject, reRollSource);
		if (defenderId != null) IJsonOption.DEFENDER_ID.addTo(jsonObject, defenderId);
		if (blockRollAfterReroll != null) {
			JsonArray pool = new JsonArray();
			for (int die : blockRollAfterReroll) pool.add(die);
			jsonObject.add("blockRollAfterReroll", pool);
		}
		if (rerolledIndexes != null) {
			JsonArray indexes = new JsonArray();
			for (int index : rerolledIndexes) indexes.add(index);
			jsonObject.add("rerolledIndexes", indexes);
		}
		return jsonObject;
	}

	public ReportBlockReRoll initFrom(IFactorySource source, JsonValue jsonValue) {
		JsonObject jsonObject = UtilJson.toJsonObject(jsonValue);
		UtilReport.validateReportId(this, (ReportId) IJsonOption.REPORT_ID.getFrom(source, jsonObject));
		playerId = IJsonOption.PLAYER_ID.getFrom(source, jsonObject);
		blockRoll = IJsonOption.BLOCK_ROLL.getFrom(source, jsonObject);
		reRollSource = (ReRollSource) IJsonOption.RE_ROLL_SOURCE.getFrom(source, jsonObject);
		defenderId = IJsonOption.DEFENDER_ID.getFrom(source, jsonObject);
		JsonValue pool = jsonObject.get("blockRollAfterReroll");
		blockRollAfterReroll = pool == null ? null : pool.asArray().values().stream().mapToInt(JsonValue::asInt).toArray();
		JsonValue indexes = jsonObject.get("rerolledIndexes");
		rerolledIndexes = indexes == null ? null : indexes.asArray().values().stream().mapToInt(JsonValue::asInt).toArray();
		return this;
	}

}
