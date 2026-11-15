package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonValue;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** Hashes the existing JSON encoding without materializing another serialized copy. */
final class JsonDigest {
	String sha256(JsonValue value) {
		return hex(digest(value::writeTo));
	}

	String sha256(String value) { return hex(sha256Bytes(value)); }
	byte[] sha256Bytes(String value) { return digest(writer -> writer.write(value)); }

	private byte[] digest(Source source) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			try (Writer encoder = new OutputStreamWriter(new DigestOutputStream(OutputStream.nullOutputStream(), digest), StandardCharsets.UTF_8)) {
				// StreamEncoder.write(String) otherwise allocates char[length], even when its
				// byte sink is streaming. Bound raw strings and large JsonString runs alike.
				source.writeTo(new Writer() {
					@Override public void write(String text, int offset, int length) throws IOException {
						for (int end = offset + length; offset < end; offset += 8192) encoder.write(text, offset, Math.min(8192, end - offset));
					}
					@Override public void write(char[] chars, int offset, int length) throws IOException { encoder.write(chars, offset, length); }
					@Override public void flush() throws IOException { encoder.flush(); }
					@Override public void close() { }
				});
			}
			return digest.digest();
		} catch (IOException | NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
	}

	@FunctionalInterface private interface Source { void writeTo(Writer writer) throws IOException; }

	String sha256(byte[] json) {
		try { return hex(MessageDigest.getInstance("SHA-256").digest(json)); }
		catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
	}

	private String hex(byte[] bytes) {
		char[] hex = new char[64]; int index = 0;
		for (byte item : bytes) { hex[index++] = Character.forDigit((item & 0xff) >>> 4, 16); hex[index++] = Character.forDigit(item & 0xf, 16); }
		return new String(hex);
	}
}
