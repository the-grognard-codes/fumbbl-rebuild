package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.io.IOException;
import java.io.Writer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Immutable, canonical terminal match artifact. */
public final class CompletedMatch {
	public static final String ENGINE_VERSION = "ffb-3.4.0-bb2025-m3d.1";
	public static final int MAX_BYTES = 64 * 1024 * 1024;
	private final String json;
	private final String validatedPreparation;

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
	boolean validatedFor(String preparation) { return validatedPreparation != null && validatedPreparation.equals(preparation); }
	public String json() { return json; }
	@Override public String toString() { return json; }
	@Override public boolean equals(Object other) { return other instanceof CompletedMatch && json.equals(((CompletedMatch) other).json); }
	@Override public int hashCode() { return json.hashCode(); }

	private static String canonical(String text) {
		if (text == null || new Utf8Size().bytes(text) > MAX_BYTES) throw new IllegalArgumentException("Invalid completed match");
		try { depth(text); return canonical(JsonObject.readFrom(text)); } catch (RuntimeException failure) { throw new IllegalArgumentException("Invalid completed match"); }
	}
	private static String canonical(JsonObject artifact) {
		if (artifact == null) throw new IllegalArgumentException("Invalid completed match");
		BoundedWriter writer = new BoundedWriter();
		try { write(artifact, writer, 0); return writer.text.toString(); }
		catch (IOException impossible) { throw new IllegalStateException(impossible); }
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
	private static void write(JsonValue value, BoundedWriter writer, int depth) throws IOException {
		if (!value.isObject() && !value.isArray()) { value.writeTo(writer); return; }
		if (++depth > 64) throw new IllegalArgumentException("Invalid completed match");
		boolean first = true;
		if (value.isArray()) {
			writer.write('[');
			for (JsonValue item : value.asArray()) { if (!first) writer.write(','); first = false; write(item, writer, depth); }
			writer.write(']');
		} else {
			JsonObject object = value.asObject(); List<String> names = new ArrayList<String>(object.names()); Collections.sort(names);
			writer.write('{');
			for (String name : names) {
				if (!first) writer.write(','); first = false;
				Json.value(name).writeTo(writer); writer.write(':'); write(object.get(name), writer, depth);
			}
			writer.write('}');
		}
	}
	private static final class BoundedWriter extends Writer {
		private final StringBuilder text = new StringBuilder();
		private long bytes;
		private boolean highSurrogate;
		@Override public void write(int value) {
			char ch = (char) value;
			bytes += Character.isLowSurrogate(ch) && highSurrogate ? 3 : ch < 0x80 ? 1 : ch < 0x800 ? 2 : Character.isSurrogate(ch) ? 1 : 3;
			highSurrogate = Character.isHighSurrogate(ch);
			if (bytes > MAX_BYTES) throw new IllegalArgumentException("Invalid completed match");
			text.append(ch);
		}
		@Override public void write(char[] chars, int offset, int length) { for (int index = offset; index < offset + length; index++) write(chars[index]); }
		@Override public void write(String value, int offset, int length) { for (int index = offset; index < offset + length; index++) write(value.charAt(index)); }
		@Override public void flush() { }
		@Override public void close() { }
	}
}
