package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** Opt-in tools entry point. Matches are interleaved, never accessed concurrently.
 * CPU parallelism belongs to independent host processes: engine factories have shared state.
 */
public final class TrainingEngineHost {

	private final Map<String, BogrukEngineFixture> matches = new LinkedHashMap<>();
	public static void main(String[] args) throws Exception {
		new TrainingEngineHost().run(args.length == 0 ? 4 : Integer.parseInt(args[0]));
	}

	private void run(int capacity) throws Exception {
		if (capacity < 1 || capacity > 32) throw new IllegalArgumentException("Capacity must be 1..32");
		try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
			String line;
			while ((line = input.readLine()) != null) {
				String requestId = "", matchId = "";
				JsonObject response;
				try {
					JsonObject command = JsonObject.readFrom(line);
					requestId = command.getString("id", "");
					matchId = command.getString("match", "");
					String operation = command.getString("operation", "");
					String role = command.getString("role", "away");
					if (matchId.isEmpty() || !("home".equals(role) || "away".equals(role)))
						throw new IllegalArgumentException("Invalid match or role");
					if ("create".equals(operation)) {
						if (matches.size() >= capacity || matches.containsKey(matchId))
							throw new IllegalArgumentException("Host capacity or duplicate match");
						matches.put(matchId, new BogrukEngineFixture(command.getString("homeRoster", "Human"),
							command.getString("awayRoster", "Orc"), command.getLong("seed", 42), true));
						response = matches.get(matchId).reply(role);
					} else if ("close".equals(operation)) {
						closeMatch(matchId);
						response = new JsonObject().add("code", "ACCEPTED");
					} else {
						BogrukEngineFixture fixture = matches.get(matchId);
						if (fixture == null) throw new IllegalArgumentException("Unknown match");
						if ("load".equals(operation)) response = fixture.reply(role);
						else if ("apply".equals(operation)) response = fixture.apply(role, command.get("request").asObject());
						else throw new IllegalArgumentException("Unknown operation");
					}
					if ("home".equals(role) && matches.containsKey(matchId)) response.add("trainingMovement", matches.get(matchId).homeMovement());
				} catch (Exception failure) {
					closeMatch(matchId);
					failure.printStackTrace(System.err);
					response = new JsonObject().add("code", "HARNESS_FAILURE").add("error", failure.toString());
				}
				MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
				response.add("trainingResources", new JsonObject().add("heapUsedMiB", heap.getUsed() / 1048576.0)
					.add("heapCommittedMiB", heap.getCommitted() / 1048576.0));
				System.out.println(new JsonObject().add("id", requestId).add("match", matchId).add("response", response));
			}
		} finally {
			for (BogrukEngineFixture fixture : matches.values()) fixture.close();
			matches.clear();
		}
	}

	private void closeMatch(String matchId) {
		BogrukEngineFixture fixture = matches.remove(matchId);
		if (fixture != null) fixture.close();
	}
}
