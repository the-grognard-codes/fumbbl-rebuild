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
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			OutputStream sink = new OutputStream() {
				@Override public void write(int value) { }
				@Override public void write(byte[] bytes, int offset, int length) { }
			};
			try (Writer writer = new OutputStreamWriter(new DigestOutputStream(sink, digest), StandardCharsets.UTF_8)) { value.writeTo(writer); }
			char[] hex = new char[64]; int index = 0;
			for (byte item : digest.digest()) { hex[index++] = Character.forDigit((item & 0xff) >>> 4, 16); hex[index++] = Character.forDigit(item & 0xf, 16); }
			return new String(hex);
		} catch (IOException | NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
	}
}
