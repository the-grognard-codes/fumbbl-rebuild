package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.Json;
import com.eclipsesource.json.JsonHandler;
import com.eclipsesource.json.JsonParser;

import java.util.ArrayList;
import java.util.List;

/** Validates, counts and joins embedded replay arrays without retaining a replay object graph. */
final class JsonArrayText {
	int count(String text) { Handler handler = new Handler(null); handler.parse(text); return handler.count; }

	String concat(String before, String after) {
		StringBuilder output = new StringBuilder(Math.addExact(before.length(), after.length()));
		output.append('[');
		Handler handler = new Handler(output);
		handler.parse(before); handler.parse(after);
		return output.append(']').toString();
	}

	private static final class Handler extends JsonHandler<Void, Void> {
		private final StringBuilder output;
		private final List<Integer> items = new ArrayList<>();
		private int depth, count;
		private boolean arrayRoot;
		Handler(StringBuilder output) { this.output = output; }
		void parse(String text) {
			arrayRoot = false;
			new JsonParser(this).parse(text);
			if (!arrayRoot) throw new IllegalArgumentException("Expected replay array");
		}
		private void append(String text) { if (output != null) output.append(text); }
		private void separate() {
			int previous = items.get(depth - 1); items.set(depth - 1, previous + 1);
			if (previous > 0) append(",");
		}
		@Override public Void startArray() {
			if (depth == 0) arrayRoot = true; else append("[");
			depth++; items.add(0); return null;
		}
		@Override public void endArray(Void array) { if (depth > 1) append("]"); depth--; items.remove(depth); }
		@Override public Void startObject() { append("{"); depth++; items.add(0); return null; }
		@Override public void endObject(Void object) { append("}"); depth--; items.remove(depth); }
		@Override public void startArrayValue(Void array) {
			if (depth == 1) { if (count++ > 0) append(","); } else separate();
		}
		@Override public void endObjectName(Void object, String name) {
			separate(); if (output != null) output.append(Json.value(name)); append(":");
		}
		@Override public void endString(String value) { if (output != null) output.append(Json.value(value)); }
		@Override public void endNumber(String value) { append(value); }
		@Override public void endBoolean(boolean value) { append(Boolean.toString(value)); }
		@Override public void endNull() { append("null"); }
	}
}
