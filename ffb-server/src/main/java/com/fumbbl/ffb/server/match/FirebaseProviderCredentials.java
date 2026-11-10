package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import com.google.auth.RequestMetadataCallback;
import com.google.auth.http.HttpTransportFactory;
import com.google.auth.oauth2.AccessToken;
import com.google.auth.oauth2.ComputeEngineCredentials;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.auth.oauth2.UserCredentials;

import java.io.IOException;
import java.net.URI;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/** Rebinds supported ADC types even when Google's default-credential discovery returned a cached instance. */
final class FirebaseProviderCredentials {
	private final FirebaseProviderBounds bounds;
	private final HttpTransportFactory transportFactory;
	private final AtomicBoolean refreshRequired = new AtomicBoolean();
	FirebaseProviderCredentials(FirebaseProviderBounds bounds, FirebaseProviderTransport transport) {
		this.bounds = bounds; this.transportFactory = () -> transport;
	}
	GoogleCredentials applicationDefault() throws IOException {
		if (new BrowserRequestTiming().budget() != null) throw new IllegalStateException("ADC discovery must precede worker traffic");
		return bind(GoogleCredentials.getApplicationDefault(transportFactory));
	}
	GoogleCredentials bind(GoogleCredentials source) {
		GoogleCredentials credential;
		if (source != null && source.getClass() == UserCredentials.class) {
			UserCredentials user = (UserCredentials) source;
			credential = user.toBuilder().setHttpTransportFactory(transportFactory).build();
		} else if (source != null && source.getClass() == ServiceAccountCredentials.class) {
			ServiceAccountCredentials service = (ServiceAccountCredentials) source;
			bounds.requireEndpoint(service.getTokenServerUri());
			credential = service.toBuilder().setHttpTransportFactory(transportFactory).build().createWithCustomRetryStrategy(false);
		} else if (source != null && source.getClass() == ComputeEngineCredentials.class) {
			bounds.requireEndpoint(URI.create(ComputeEngineCredentials.getTokenServerEncodedUrl()));
			credential = ((ComputeEngineCredentials) source).toBuilder().setHttpTransportFactory(transportFactory).build();
		} else throw new IllegalArgumentException("Unsupported Firebase ADC credential type");
		return new WorkerCredentials(credential);
	}
	void invalidateAccessToken() { refreshRequired.set(true); }

	/** Uses the supported OAuth2Credentials refresh seam and preserves one SDK-owned access-token cache. */
	private final class WorkerCredentials extends GoogleCredentials {
		private final GoogleCredentials source;
		WorkerCredentials(GoogleCredentials source) { super((AccessToken) null, source.getQuotaProjectId()); this.source = source; }
		@Override public AccessToken refreshAccessToken() throws IOException { return source.refreshAccessToken(); }
		@Override public Map<String, List<String>> getRequestMetadata(URI uri) throws IOException {
			if (refreshRequired.getAndSet(false)) try { refresh(); }
			catch (IOException failure) { refreshRequired.set(true); throw failure; }
			return super.getRequestMetadata(uri);
		}
		@Override public void getRequestMetadata(URI uri, Executor executor, RequestMetadataCallback callback) {
			Map<String, List<String>> headers;
			try { headers = getRequestMetadata(uri); }
			catch (IOException | RuntimeException failure) { callback.onFailure(failure); return; }
			callback.onSuccess(headers);
		}
		@Override public String getUniverseDomain() throws IOException { return source.getUniverseDomain(); }
		@Override public boolean createScopedRequired() { return source.createScopedRequired(); }
		@Override public GoogleCredentials createScoped(Collection<String> scopes) { return new WorkerCredentials(source.createScoped(scopes)); }
		@Override public GoogleCredentials createScoped(Collection<String> scopes, Collection<String> defaults) { return new WorkerCredentials(source.createScoped(scopes, defaults)); }
		@Override public GoogleCredentials createWithQuotaProject(String project) { return new WorkerCredentials(source.createWithQuotaProject(project)); }
		@Override public GoogleCredentials createWithCustomRetryStrategy(boolean enabled) {
			if (enabled) throw new IllegalArgumentException("Worker credential retries are forbidden");
			return new WorkerCredentials(source.createWithCustomRetryStrategy(false));
		}
	}
}
