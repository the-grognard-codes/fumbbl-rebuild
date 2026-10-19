package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/** Opt-in JSON-lines bridge for computer-player/test/engine-match.mjs, with no network or credentials. */
public final class BogrukEngineHarness {

	public static void main(String[] args) throws Exception {
		if (args.length != 3) throw new IllegalArgumentException("Expected home roster, away roster, and seed");
		BogrukEngineFixture fixture = new BogrukEngineFixture(args[0], args[1], Long.parseLong(args[2]));
		try (BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
			String line;
			while ((line = input.readLine()) != null) {
				JsonObject response;
				try {
					JsonObject command = JsonObject.readFrom(line);
					String role = command.getString("role", "away");
					if (!"home".equals(role) && !"away".equals(role)) throw new IllegalArgumentException("Invalid role");
					String operation = command.getString("operation", null);
					if ("restore".equals(operation)) { fixture.restore(); response = fixture.reply(role); }
					else if ("load".equals(operation)) response = fixture.reply(role);
					else if ("apply".equals(operation)) response = fixture.apply(role, command.get("request").asObject());
					else throw new IllegalArgumentException("Invalid harness operation");
				} catch (MatchService.Failure failure) {
					response = new JsonObject().add("version", 2).add("code", failure.code);
				} catch (RuntimeException failure) {
					failure.printStackTrace(System.err);
					response = new JsonObject().add("version", 2).add("code", "HARNESS_FAILURE");
				}
				System.out.println(response);
			}
		}
	}
}
