package com.fumbbl.ffb.server.match;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;

import java.util.function.LongSupplier;

/** Startup/lifecycle ownership for the one bounded provider client used by the browser runtime. */
final class FirebaseProviderRuntime implements AutoCloseable {
	final FirebaseAuth auth;
	final FirebaseProviderTransport transport;
	final FirebaseProviderCircuitBreaker breaker;
	final FirebaseProviderErrors errors = new FirebaseProviderErrors();
	private final FirebaseProviderCredentials credentials;
	private final FirebaseApp app;
	FirebaseProviderRuntime(String project) {
		FirebaseProviderBounds bounds = new FirebaseProviderBounds();
		FirebaseProviderTransport opened = null;
		FirebaseApp created = null;
		try {
			opened = new FirebaseProviderTransport(bounds);
			credentials = new FirebaseProviderCredentials(bounds, opened);
			GoogleCredentials credential;
			FirebaseProviderTransport.Operation bootstrap = opened.begin();
			try (bootstrap) { credential = credentials.applicationDefault(); }
			bootstrap.requireCompleted();
			FirebaseOptions options = FirebaseOptions.builder().setCredentials(credential).setProjectId(project)
				.setHttpTransport(opened).setConnectTimeout(bounds.connectMillis()).setReadTimeout(bounds.ioMillis()).setWriteTimeout(bounds.ioMillis()).build();
			created = FirebaseApp.initializeApp(options, "ffb-browser-v2-" + project);
			auth = FirebaseAuth.getInstance(created); app = created; transport = opened;
			breaker = new FirebaseProviderCircuitBreaker(bounds, System::nanoTime);
		} catch (Exception failure) {
			if (created != null) created.delete();
			if (opened != null) try { opened.close(); } catch (Exception ignored) { /* Initialization already failed closed. */ }
			throw new IllegalStateException("Firebase Admin initialization failed (" + failure.getClass().getSimpleName() + ")");
		}
	}
	FirebaseProviderRuntime(FirebaseAuth auth, LongSupplier nanos) {
		this(auth, new FirebaseProviderTransport(new FirebaseProviderBounds(), true), new FirebaseProviderBounds(), null, nanos);
	}
	FirebaseProviderRuntime(FirebaseAuth auth, FirebaseProviderTransport transport, FirebaseProviderBounds bounds,
		FirebaseProviderCredentials credentials, LongSupplier nanos) {
		this.auth = auth; this.transport = transport; this.credentials = credentials; this.app = null;
		this.breaker = new FirebaseProviderCircuitBreaker(bounds, nanos);
	}
	void failedCredential(Throwable failure) { if (credentials != null && errors.credentialRejected(failure)) credentials.invalidateAccessToken(); }
	@Override public void close() throws Exception { try { if (app != null) app.delete(); } finally { transport.close(); } }
}
