package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import com.eclipsesource.json.JsonObject;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;

/** One authorized lobby page. Limits supplement the worker's existing absolute deadline. */
public final class LobbyReadBudget {
	public static final int MAX_ENTRIES = 100;
	public static final int RECORD_BYTES = 2 * 1024 * 1024;
	public static final int PAGE_BYTES = 16 * 1024 * 1024;
	private final BrowserRequestTiming timing = new BrowserRequestTiming();
	private int encodedBytes, decodedBytes, tokens;
	private long workBytes;
	int remainingEncodedBytes() { check(); return PAGE_BYTES - encodedBytes; }
	void work(long bytes) { check(); if (bytes > PAGE_BYTES - workBytes) exhausted(); workBytes += bytes; }

	public void check() {
		if (timing.budget() != null && timing.budget().allowanceMillis(2000, 50) == 0) exhausted();
	}

	public void entries(int count) { check(); if (count > MAX_ENTRIES) exhausted(); }

	/** Reject before materializing an unbounded JDBC string, decoding or allocating a JSON tree. */
	String read(ResultSet rows, int column, BoundedJsonStorageCodec codec) throws SQLException {
		check();
		try (Reader reader = rows.getCharacterStream(column)) {
			if (reader == null) exhausted(); // SQL CASE rejects oversized non-null storage columns before driver allocation.
			StringBuilder text = new StringBuilder();
			char[] buffer = new char[4096];
			int count;
			while ((count = reader.read(buffer)) != -1) {
				check();
				if (text.length() + count > Math.min(RECORD_BYTES, PAGE_BYTES - encodedBytes)) exhausted();
				text.append(buffer, 0, count);
			}
			String stored = text.toString();
			int bytes = stored.getBytes(StandardCharsets.UTF_8).length;
			if (bytes > RECORD_BYTES || bytes > PAGE_BYTES - encodedBytes) exhausted();
			encodedBytes += bytes;
			guard(stored);
			if (codec.hasCodecHeader(stored)) {
				JsonObject envelope = JsonObject.readFrom(stored);
				int expected = envelope.getInt("decodedBytes", -1);
				if (expected > RECORD_BYTES || expected > PAGE_BYTES - decodedBytes) exhausted();
			}
			if (!codec.hasCodecHeader(stored) && bytes > PAGE_BYTES - decodedBytes) exhausted();
			String decoded = codec.decode(stored);
			admit(decoded);
			return decoded;
		} catch (IOException failure) { throw new SQLException("Lobby stored JSON read failed", failure); }
	}

	public void admit(String json) {
		check();
		if (json.length() > RECORD_BYTES || json.length() > PAGE_BYTES - decodedBytes) exhausted();
		int bytes = json.getBytes(StandardCharsets.UTF_8).length;
		if (bytes > RECORD_BYTES || bytes > PAGE_BYTES - decodedBytes) exhausted();
		decodedBytes += bytes;
		guard(json);
	}

	/** Bound nesting and structural parse work across the page, checking time every 4 KiB. */
	private void guard(String json) {
		boolean quoted = false, escaped = false;
		int depth = 0;
		for (int index = 0; index < json.length(); index++) {
			if ((index & 4095) == 0) check();
			char value = json.charAt(index);
			if (quoted) {
				if (escaped) escaped = false;
				else if (value == '\\') escaped = true;
				else if (value == '"') quoted = false;
			} else if (value == '"') quoted = true;
			else if (value == '{' || value == '[') { if (++depth > 128) throw new IllegalArgumentException("Stored JSON nesting limit"); }
			else if (value == '}' || value == ']') depth--;
			if (!quoted && (value == ',' || value == ':' || value == '{' || value == '[') && ++tokens > 500_000) exhausted();
		}
	}

	public void response(JsonObject json) {
		check();
		try {
			json.writeTo(new java.io.Writer() {
				private int chars;
				@Override public void write(char[] buffer, int offset, int length) {
					check();
					if (length > 85_000 - chars) exhausted(); // <=255 KiB UTF-8, including surrogate pairs.
					chars += length;
				}
				@Override public void flush() { }
				@Override public void close() { }
			});
		} catch (IOException impossible) { throw new IllegalStateException(impossible); }
	}

	private void exhausted() { throw new MatchService.Failure("RATE_LIMITED"); }
}
