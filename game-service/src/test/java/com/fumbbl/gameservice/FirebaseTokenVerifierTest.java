package com.fumbbl.gameservice;

import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.LowLevelHttpRequest;
import com.google.api.client.http.LowLevelHttpResponse;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

class FirebaseTokenVerifierTest {
	private FirebaseApp app;
	private FixtureTransport transport;
	@AfterEach void removeApp() { if (app != null) app.delete(); }
	@Test void sdkVerifiesSignedTokensAndRejectsSecurityBoundaryFailuresForBothProjects() throws Exception {
		for (String project : new String[] { "dev-moles-under-the-pitch-org", "molesunderthepitch-dotorg" }) {
			String otherProject = project.equals("dev-moles-under-the-pitch-org") ? "molesunderthepitch-dotorg" : "dev-moles-under-the-pitch-org";
			Fixture fixture = Fixture.create(); FirebaseTokenVerifier verifier = verifier(project, fixture);
			assertDoesNotThrow(() -> verifier.verify(fixture.token(project, "https://securetoken.google.com/" + project, Instant.now().plusSeconds(300).getEpochSecond(), false)));
			assertRejected(verifier, fixture.token(project, "https://securetoken.google.com/" + project, Instant.now().plusSeconds(300).getEpochSecond(), true));
			assertRejected(verifier, fixture.token("other-project", "https://securetoken.google.com/" + project, Instant.now().plusSeconds(300).getEpochSecond(), false));
			assertRejected(verifier, fixture.token(otherProject, "https://securetoken.google.com/" + otherProject, Instant.now().plusSeconds(300).getEpochSecond(), false));
			assertRejected(verifier, fixture.token(project, "https://securetoken.google.com/other-project", Instant.now().plusSeconds(300).getEpochSecond(), false));
			assertRejected(verifier, fixture.token(project, "https://securetoken.google.com/" + project, Instant.now().minusSeconds(300).getEpochSecond(), false));
			assertRejected(verifier, "not.a.jwt");
			transport.disabled = true;
			assertRejected(verifier, fixture.token(project, "https://securetoken.google.com/" + project, Instant.now().plusSeconds(300).getEpochSecond(), false));
			transport.disabled = false;
			transport.validSince = Instant.now().plusSeconds(60).getEpochSecond();
			assertRejected(verifier, fixture.token(project, "https://securetoken.google.com/" + project, Instant.now().plusSeconds(300).getEpochSecond(), false));
			fixture.close();
			app.delete(); app = null;
		}
	}
	private FirebaseTokenVerifier verifier(String project, Fixture fixture) {
		transport = new FixtureTransport(fixture.certificatePem);
		app = FirebaseApp.initializeApp(FirebaseOptions.builder().setProjectId(project).setCredentials(GoogleCredentials.create(new AccessToken("test", new Date(System.currentTimeMillis() + 3600000L)))).setHttpTransport(transport).build(), "test-" + UUID.randomUUID());
		return new FirebaseTokenVerifier(FirebaseAuth.getInstance(app), project);
	}
	private static void assertRejected(FirebaseTokenVerifier verifier, String token) { assertThrows(TokenVerifier.TokenRejectedException.class, () -> verifier.verify(token)); }
	private static final class Fixture implements AutoCloseable {
		final File store; final PrivateKey key; final String certificatePem;
		private Fixture(File store, PrivateKey key, String certificatePem) { this.store = store; this.key = key; this.certificatePem = certificatePem; }
		static Fixture create() throws Exception {
			File file = Files.createTempFile("firebase-verifier", ".p12").toFile(); Files.delete(file.toPath()); String java = System.getProperty("java.home") + File.separator + "bin" + File.separator + "keytool" + (System.getProperty("os.name").startsWith("Windows") ? ".exe" : "");
			Process process = new ProcessBuilder(java, "-genkeypair", "-alias", "test", "-keyalg", "RSA", "-keysize", "2048", "-dname", "CN=test", "-validity", "2", "-storetype", "PKCS12", "-keystore", file.getAbsolutePath(), "-storepass", "changeit", "-keypass", "changeit", "-noprompt").redirectErrorStream(true).start(); if (process.waitFor() != 0) throw new IllegalStateException("keytool failed");
			KeyStore keys = KeyStore.getInstance("PKCS12"); try (InputStream input = Files.newInputStream(file.toPath())) { keys.load(input, "changeit".toCharArray()); }
			Certificate certificate = keys.getCertificate("test"); String pem = "-----BEGIN CERTIFICATE-----\n" + Base64.getMimeEncoder(64, "\n".getBytes(StandardCharsets.US_ASCII)).encodeToString(certificate.getEncoded()) + "\n-----END CERTIFICATE-----\n";
			return new Fixture(file, (PrivateKey) keys.getKey("test", "changeit".toCharArray()), pem);
		}
		String token(String audience, String issuer, long exp, boolean corruptSignature) throws Exception {
			String header = part("{\"alg\":\"RS256\",\"kid\":\"test\",\"typ\":\"JWT\"}"); String payload = part("{\"aud\":\"" + audience + "\",\"iss\":\"" + issuer + "\",\"sub\":\"fixture-user\",\"user_id\":\"fixture-user\",\"iat\":" + (exp - 600) + ",\"auth_time\":" + (exp - 600) + ",\"exp\":" + exp + "}");
			Signature signer = Signature.getInstance("SHA256withRSA"); signer.initSign(key); signer.update((header + "." + payload).getBytes(StandardCharsets.US_ASCII)); String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign()); if (corruptSignature) signature = (signature.startsWith("A") ? "B" : "A") + signature.substring(1); return header + "." + payload + "." + signature;
		}
		private String part(String json) { return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8)); }
		public void close() { store.delete(); }
	}
	private static final class FixtureTransport extends HttpTransport {
		private final String cert;
		private boolean disabled;
		private long validSince;
		FixtureTransport(String cert) { this.cert = cert; }
		protected LowLevelHttpRequest buildRequest(String method, String url) { return new LowLevelHttpRequest() { public void addHeader(String name, String value) { } public LowLevelHttpResponse execute() { return new Response(url.contains("metadata/x509") ? "{\"test\":" + quote(cert) + "}" : "{\"users\":[{\"localId\":\"fixture-user\",\"validSince\":\"" + validSince + "\",\"disabled\":" + disabled + "}]}"); } }; }
		private static String quote(String value) { return "\"" + value.replace("\\", "\\\\").replace("\n", "\\n") + "\""; }
	}
	private static final class Response extends LowLevelHttpResponse {
		private final byte[] body; Response(String body) { this.body = body.getBytes(StandardCharsets.UTF_8); }
		public InputStream getContent() { return new ByteArrayInputStream(body); } public String getContentEncoding() { return null; } public long getContentLength() { return body.length; } public String getContentType() { return "application/json"; } public String getStatusLine() { return "HTTP/1.1 200 OK"; } public int getStatusCode() { return 200; } public String getReasonPhrase() { return "OK"; } public int getHeaderCount() { return 1; } public String getHeaderName(int index) { return "Cache-Control"; } public String getHeaderValue(int index) { return "public, max-age=300"; }
	}
}


