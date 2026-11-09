package com.fumbbl.ffb.server.local;

import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonArray;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicLongArray;
import java.util.function.LongSupplier;

/** Thread-safe operational counters for the local browser transport. */
public class BrowserMatchTransportMetrics {
	private static final int TASK_SAMPLE_LIMIT = 256;
	private final BrowserRequestTiming.TaskMeasurement[] taskSamples = new BrowserRequestTiming.TaskMeasurement[TASK_SAMPLE_LIMIT];
	private long taskSequence;
	private final AtomicLongArray taskCounts = new AtomicLongArray(BrowserRequestTiming.TaskKind.values().length);
	private final AtomicLongArray taskQueueNanos = new AtomicLongArray(BrowserRequestTiming.TaskKind.values().length);
	private final AtomicLongArray taskExecutionNanos = new AtomicLongArray(BrowserRequestTiming.TaskKind.values().length);
	private final AtomicLongArray taskMaxExecutionNanos = new AtomicLongArray(BrowserRequestTiming.TaskKind.values().length);
	private final AtomicLongArray taskOverruns = new AtomicLongArray(BrowserRequestTiming.TaskKind.values().length);

	synchronized void taskFinished(BrowserRequestTiming.TaskMeasurement measurement) {
		int kind = measurement.kind();
		taskCounts.incrementAndGet(kind);
		taskQueueNanos.addAndGet(kind, measurement.queueNanos());
		taskExecutionNanos.addAndGet(kind, measurement.executionNanos());
		taskMaxExecutionNanos.accumulateAndGet(kind, measurement.executionNanos(), Math::max);
		if (measurement.overrun()) taskOverruns.incrementAndGet(kind);
		taskSamples[(int) (taskSequence++ % TASK_SAMPLE_LIMIT)] = measurement;
	}
	private final AtomicLong admissionRejected = new AtomicLong();
	private final AtomicLong activeConnections = new AtomicLong();
	private final AtomicLong activeConnectionsHighWater = new AtomicLong();
	private final AtomicLong deliveryQueueBytes = new AtomicLong();
	private final AtomicLong deliveryQueueBytesHighWater = new AtomicLong();
	private final AtomicLong deliveryQueueDelayMillis = new AtomicLong();
	private final AtomicLong deliveryQueueDelayHighWaterMillis = new AtomicLong();
	private final AtomicLong deliveryQueueDepth = new AtomicLong();
	private final AtomicLong deliveryQueueHighWater = new AtomicLong();
	private final AtomicLong ingressDelayMillis = new AtomicLong();
	private final AtomicLong ingressQueueDepth = new AtomicLong();
	private final AtomicLong ingressQueueHighWater = new AtomicLong();
	private final AtomicLong ingressOverload = new AtomicLong();
	private final AtomicLong outboundOverload = new AtomicLong();
	private final AtomicLong slowDisconnects = new AtomicLong();
	private volatile LongSupplier activeConnectionSupplier = activeConnections::get;

	void admissionRejected() { admissionRejected.incrementAndGet(); }
	void activeConnections(long count) { update(activeConnections, activeConnectionsHighWater, count); }
	void activeConnectionSupplier(LongSupplier supplier) { activeConnectionSupplier = supplier; }
	void ingressOverload() { ingressOverload.incrementAndGet(); }
	void outboundOverload() { outboundOverload.incrementAndGet(); }
	void slowDisconnect() { slowDisconnects.incrementAndGet(); }
	void ingressDelay(long delayMillis) { ingressDelayMillis.addAndGet(Math.max(0, delayMillis)); }
	void ingressQueueDepth(long depth) { update(ingressQueueDepth, ingressQueueHighWater, depth); }
	void deliveryQueued(int bytes) {
		updateHighWater(deliveryQueueHighWater, deliveryQueueDepth.incrementAndGet());
		updateHighWater(deliveryQueueBytesHighWater, deliveryQueueBytes.addAndGet(bytes));
	}
	void deliveryCompleted(int bytes) {
		deliveryQueueDepth.updateAndGet(depth -> Math.max(0, depth - 1));
		deliveryQueueBytes.updateAndGet(depth -> Math.max(0, depth - bytes));
	}
	void deliveryCleared(long count, long bytes) {
		if (count > 0) deliveryQueueDepth.updateAndGet(depth -> Math.max(0, depth - count));
		if (bytes > 0) deliveryQueueBytes.updateAndGet(depth -> Math.max(0, depth - bytes));
	}
	void deliveryQueueDelay(long delayMillis) {
		long delay = Math.max(0, delayMillis);
		deliveryQueueDelayMillis.addAndGet(delay);
		updateHighWater(deliveryQueueDelayHighWaterMillis, delay);
	}

	private void update(AtomicLong depthCounter, AtomicLong highWater, long depth) {
		long current = Math.max(0, depth);
		depthCounter.set(current);
		updateHighWater(highWater, current);
	}

	private void updateHighWater(AtomicLong highWater, long current) {
		highWater.accumulateAndGet(current, Math::max);
	}

	public JsonObject toJson() {
		JsonArray tasks = new JsonArray();
		for (int kind = 0; kind < taskCounts.length(); kind++) tasks.add(new JsonObject().add("kind", kind)
			.add("count", taskCounts.get(kind)).add("queueNanos", taskQueueNanos.get(kind))
			.add("executionNanos", taskExecutionNanos.get(kind)).add("maxExecutionNanos", taskMaxExecutionNanos.get(kind))
			.add("overruns", taskOverruns.get(kind)));
		return new JsonObject().add("activeConnections", activeConnectionSupplier.getAsLong()).add("activeConnectionsHighWater", activeConnectionsHighWater.get())
			.add("workerTasks", tasks)
			.add("workerTaskSamples", taskSamples())
			.add("admissionRejected", admissionRejected.get())
			.add("ingressQueueDepth", ingressQueueDepth.get()).add("ingressQueueHighWater", ingressQueueHighWater.get())
			.add("ingressDelayMillis", ingressDelayMillis.get()).add("ingressOverload", ingressOverload.get())
			.add("deliveryQueueDepth", deliveryQueueDepth.get()).add("deliveryQueueHighWater", deliveryQueueHighWater.get())
			.add("deliveryQueueBytes", deliveryQueueBytes.get()).add("deliveryQueueBytesHighWater", deliveryQueueBytesHighWater.get())
			.add("deliveryQueueDelayMillis", deliveryQueueDelayMillis.get()).add("deliveryQueueDelayHighWaterMillis", deliveryQueueDelayHighWaterMillis.get())
			.add("outboundOverload", outboundOverload.get()).add("slowDisconnects", slowDisconnects.get());
	}

	/** Bounded numeric samples let load captures measure percentiles and detect sampling gaps. */
	private synchronized JsonArray taskSamples() {
		JsonArray samples = new JsonArray();
		for (long sequence = Math.max(0, taskSequence - TASK_SAMPLE_LIMIT); sequence < taskSequence; sequence++) {
			BrowserRequestTiming.TaskMeasurement sample = taskSamples[(int) (sequence % TASK_SAMPLE_LIMIT)];
			samples.add(new JsonObject().add("sequence", sequence).add("kind", sample.kind())
				.add("queueNanos", sample.queueNanos()).add("executionNanos", sample.executionNanos())
				.add("overrun", sample.overrun() ? 1 : 0));
		}
		return samples;
	}
}
