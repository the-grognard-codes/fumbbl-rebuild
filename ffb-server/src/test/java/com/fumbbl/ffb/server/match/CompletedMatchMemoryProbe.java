package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

/** Child process used by CompletedMatchMemoryTest to enforce a real heap ceiling. */
public final class CompletedMatchMemoryProbe {
	private static final int EVENT_COUNT = 1_200;
	private static final int PLAYER_COUNT = 22;

	public static void main(String[] arguments) throws Exception {
		if (arguments.length > 0 && "retained".equals(arguments[0])) {
			BogrukEngineFixture fixture = new BogrukEngineFixture("human", "orc", 0xB06A7L);
			RecoveryRepository.Record record = paddedRecoveryRecord(fixture, 40 * 1024 * 1024);
			RetainedConcession retained = new RetainedConcession(record, fixture.document);
			if (retained.closed() || retained.unsupported()) throw new AssertionError("valid retained recovery was not preserved");
			if (!"home".equals(retained.view("home").getString("callerRole", null)))
				throw new AssertionError("retained recovery did not return the home view");
			System.out.println("retained-read-passed bytes=" + record.json.length());
			return;
		}
		if (arguments.length > 0 && "persist".equals(arguments[0])) {
			MatchServiceTest persistence = new MatchServiceTest();
			persistence.setup();
			persistence.completeRetainedHistory();
			System.out.println("persisted-completion-passed");
			return;
		}
		JsonArray events = new JsonArray();
		JsonArray transcriptRecords = new JsonArray();
		for (int revision = 0; revision < EVENT_COUNT; revision++) {
			events.add(record(revision));
			transcriptRecords.add(record(revision));
		}
		JsonObject transcript = new JsonObject().add("version", 1).add("records", transcriptRecords);
		JsonObject artifact = new JsonObject().add("formatVersion", 3).add("events", events).add("transcript", transcript);

		// The caller retains artifact and all nested history while canonicalization runs.
		CompletedMatch completed = new CompletedMatch(artifact);
		if (completed.json().length() < 5 * 1024 * 1024 || events.size() != EVENT_COUNT) {
			throw new AssertionError("probe did not retain a representative completed-match history");
		}
		System.out.println("completed-bytes=" + completed.json().length());
	}

	private static RecoveryRepository.Record paddedRecoveryRecord(BogrukEngineFixture fixture, int paddingSize) throws Exception {
		JsonObject payload = JsonObject.readFrom(fixture.session.recoveryArtifact()).get("payload").asObject();
		StringBuilder padding = new StringBuilder(paddingSize);
		for (int index = 0; index < paddingSize; index++) padding.append('x');
		payload.add("diagnosticPadding", padding.toString());
		JsonObject envelope = new JsonObject().add("payload", payload).add("sha256", new JsonDigest().sha256(payload));
		return new RecoveryRepository.Record(fixture.document.matchId, 1, envelope.toString());
	}

	private static JsonObject record(int revision) {
		JsonArray players = new JsonArray();
		for (int number = 1; number <= PLAYER_COUNT; number++) {
			players.add(new JsonObject().add("id", "player-" + number).add("number", number)
				.add("position", new JsonObject().add("x", (revision + number) % 26).add("y", number % 15))
				.add("status", new JsonArray().add("standing").add("active"))
				.add("skills", new JsonArray().add("block").add("dodge").add("sure-hands")));
		}
		JsonArray actions = new JsonArray();
		for (int action = 0; action < 4; action++) {
			actions.add(new JsonObject().add("kind", "move").add("playerId", "player-" + (action + 1))
				.add("description", "The player moves to a recorded square during the saved match."));
		}
		JsonObject state = new JsonObject().add("revision", revision).add("phase", "PLAY")
			.add("turn", revision % 16).add("players", players).add("actions", actions)
			.add("ball", new JsonObject().add("x", revision % 26).add("y", revision % 15));
		return new JsonObject().add("revision", revision).add("kind", "ACTION").add("state", state);
	}
}
