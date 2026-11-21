package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;


/** Immutable, canonical terminal match artifact. */
public final class CompletedMatch {
	public static final String ENGINE_VERSION = "ffb-3.4.0-bb2025-m3d.1";
	public static final int MAX_BYTES = 64 * 1024 * 1024;
	private String json;
	private final String validatedPreparation;
	private JsonObject retainedArtifact;
	private MatchDocument retainedPreparation;

	public CompletedMatch(String json) { this.json = canonical(json); validatedPreparation = null; }
	/** Freeze an existing artifact without parsing or copying its retained history. */
	CompletedMatch(JsonObject artifact) { this.json = canonical(artifact); validatedPreparation = null; }
	/** Validate the resident graph before freezing it; retain only its small immutable context. */
	CompletedMatch(JsonObject artifact, MatchDocument document) {
		MatchJson codec = new MatchJson();
		json = canonical(artifact);
		codec.validateCompletion(artifact, document);
		validatedPreparation = codec.completionScope(document);
	}
	/** Setup loads finish recovery JDBC reads before validating a retained result. */
	CompletedMatch(MatchDocument document, JsonObject artifact) {
		retainedPreparation = document;
		retainedArtifact = artifact;
		validatedPreparation = null;
	}
	boolean validatedFor(String preparation) { return validatedPreparation != null && validatedPreparation.equals(preparation); }
	public synchronized String json() {
		if (retainedArtifact != null) {
			new MatchJson().validateCompletion(retainedArtifact, retainedPreparation);
			json = canonical(retainedArtifact);
			retainedArtifact = null;
			retainedPreparation = null;
		}
		return json;
	}
	@Override public String toString() { return json(); }
	@Override public boolean equals(Object other) { return other instanceof CompletedMatch && json().equals(((CompletedMatch) other).json()); }
	@Override public int hashCode() { return json().hashCode(); }

	private static String canonical(String text) {
		if (text == null || new Utf8Size().bytes(text) > MAX_BYTES) throw new IllegalArgumentException("Invalid completed match");
		try { depth(text); return canonical(JsonObject.readFrom(text)); } catch (RuntimeException failure) { throw new IllegalArgumentException("Invalid completed match"); }
	}
	private static String canonical(JsonObject artifact) {
		if (artifact == null) throw new IllegalArgumentException("Invalid completed match");
		return new CanonicalJson().encode(artifact, MAX_BYTES, 64, () -> new IllegalArgumentException("Invalid completed match"));
	}

	private static void depth(String text) {
		boolean quoted = false, escaped = false; int depth = 0;
		for (int index = 0; index < text.length(); index++) {
			char ch = text.charAt(index);
			if (quoted) { if (escaped) escaped = false; else if (ch == '\\') escaped = true; else if (ch == '"') quoted = false; }
			else if (ch == '"') quoted = true;
			else if (ch == '{' || ch == '[') { if (++depth > 64) throw new IllegalArgumentException(); }
			else if (ch == '}' || ch == ']') depth--;
		}
		if (quoted || depth != 0) throw new IllegalArgumentException();
	}
}
