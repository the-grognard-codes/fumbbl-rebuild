package com.fumbbl.ffb.server.local;

import org.eclipse.jetty.client.HttpClient;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.net.spi.InetAddressResolver;
import java.net.spi.InetAddressResolverProvider;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/** Child-JVM-only fault injection into the actual JDK resolver used by pinned Jetty. */
public final class FirebaseDnsFeasibilityProbe {
	private static final CountDownLatch entered = new CountDownLatch(1);
	private static final CountDownLatch release = new CountDownLatch(1);
	private static final CountDownLatch finished = new CountDownLatch(1);
	private static final CountDownLatch interruption = new CountDownLatch(1);
	private static final AtomicBoolean interrupted = new AtomicBoolean();

	public static final class StalledResolver extends InetAddressResolverProvider {
		@Override public String name() { return "synthetic-firebase-spike"; }
		@Override public InetAddressResolver get(Configuration configuration) {
			return new InetAddressResolver() {
				@Override public Stream<InetAddress> lookupByName(String host, LookupPolicy policy) throws UnknownHostException {
					if (!"firebase-spike.invalid".equals(host)) return configuration.builtinResolver().lookupByName(host, policy);
					entered.countDown();
					try {
						while (true) try { release.await(); break; }
						catch (InterruptedException ignored) { interrupted.set(true); interruption.countDown(); }
						throw new UnknownHostException("Synthetic stalled DNS released by test cleanup");
					} finally { finished.countDown(); }
				}
				@Override public String lookupByAddress(byte[] address) throws UnknownHostException { return configuration.builtinResolver().lookupByAddress(address); }
			};
		}
	}

	public static void main(String[] args) throws Exception {
		HttpClient client = new HttpClient();
		client.setAddressResolutionTimeout(200);
		client.start();
		try {
			long start = System.nanoTime();
			boolean rejected = false;
			try { client.newRequest("http://firebase-spike.invalid/").timeout(1_000, TimeUnit.MILLISECONDS).send(); }
			catch (Exception expected) { rejected = true; }
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
			if (!interruption.await(1, TimeUnit.SECONDS)) throw new AssertionError("Jetty did not interrupt its DNS resolver");
			if (!rejected || entered.getCount() != 0 || finished.getCount() != 1 || elapsed >= 1_250) throw new AssertionError("DNS probe did not reach expected fault boundary");
			System.out.println("FIREBASE_SPIKE dns elapsedMs=" + elapsed + " resolverStillRunning=true interruptObserved=" + interrupted.get());
		} finally {
			release.countDown();
			if (!finished.await(3, TimeUnit.SECONDS)) throw new AssertionError("Synthetic resolver leaked after test cleanup");
			client.stop();
		}
	}
}
