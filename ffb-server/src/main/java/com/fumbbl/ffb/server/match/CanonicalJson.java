package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import java.io.IOException;
import java.io.Writer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.function.Supplier;

/** Writes bounded canonical JSON directly, without allocating a second history object graph. */
final class CanonicalJson {
	/** @throws MatchService.Failure with RECOVERY_LIMIT if the existing recovery bounds are exceeded. */
	String encode(JsonValue value, long limit) {
		return encode(value, limit, 128, () -> new MatchService.Failure("RECOVERY_LIMIT"));
	}

	String encode(JsonValue value, long limit, int maximumDepth, Supplier<RuntimeException> failure) {
		BoundedWriter writer = new BoundedWriter(limit, maximumDepth, failure);
		try { write(value, writer, 0); return writer.text.toString(); }
		catch (IOException impossible) { throw new IllegalStateException(impossible); }
	}

	private void write(JsonValue value, BoundedWriter writer, int depth) throws IOException {
		if (!value.isObject() && !value.isArray()) { value.writeTo(writer); return; }
		if (++depth > writer.maximumDepth) throw writer.failure.get();
		boolean first = true;
		if (value.isArray()) {
			writer.write('[');
			for (JsonValue item : value.asArray()) { if (!first) writer.write(','); first = false; write(item, writer, depth); }
			writer.write(']');
		} else {
			JsonObject object = value.asObject();
			var names = new ArrayList<>(object.names()); Collections.sort(names);
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
		private final long limit;
		private final int maximumDepth;
		private final Supplier<RuntimeException> failure;
		private long bytes;
		private boolean highSurrogate;
		BoundedWriter(long limit, int maximumDepth, Supplier<RuntimeException> failure) { this.limit = limit; this.maximumDepth = maximumDepth; this.failure = failure; }
		@Override public void write(int value) {
			char ch = (char) value;
			count(ch); text.append(ch);
		}
		private void count(char ch) {
			bytes += Character.isLowSurrogate(ch) && highSurrogate ? 3 : ch < 0x80 ? 1 : ch < 0x800 ? 2 : Character.isSurrogate(ch) ? 1 : 3;
			highSurrogate = Character.isHighSurrogate(ch);
			if (bytes > limit) throw failure.get();
		}
		@Override public void write(char[] value, int offset, int length) {
			for (int i = offset; i < offset + length; i++) count(value[i]); text.append(value, offset, length);
		}
		@Override public void write(String value, int offset, int length) {
			for (int i = offset; i < offset + length; i++) count(value.charAt(i)); text.append(value, offset, offset + length);
		}
		@Override public void flush() { }
		@Override public void close() { }
	}
}
