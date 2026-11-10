package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BrowserMatchTransportMetricsTest {
	@Test void numericSamplesAreBoundedOrderedAndExposeCaptureGaps() {
		BrowserMatchTransportMetrics metrics = new BrowserMatchTransportMetrics();
		for (int index = 0; index < 300; index++) metrics.taskFinished(
			new BrowserRequestTiming.TaskMeasurement(2, index, index * 2L, index == 299));
		JsonObject snapshot = metrics.toJson();
		JsonArray samples = snapshot.get("workerTaskSamples").asArray();
		assertEquals(256, samples.size());
		assertEquals(44, samples.get(0).asObject().getLong("sequence", -1));
		assertEquals(299, samples.get(255).asObject().getLong("sequence", -1));
		assertEquals(598, samples.get(255).asObject().getLong("executionNanos", -1));
		for (var sample : samples) for (var field : sample.asObject()) assertTrue(field.getValue().isNumber());
		JsonObject totals = snapshot.get("workerTasks").asArray().get(2).asObject();
		assertEquals(300, totals.getLong("count", -1));
		assertEquals(1, totals.getLong("overruns", -1));
		assertEquals(598, totals.getLong("maxExecutionNanos", -1));
	}
}
