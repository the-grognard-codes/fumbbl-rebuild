package com.fumbbl.ffb.server.local;

import org.junit.jupiter.api.Test;
import org.xbill.DNS.AAAARecord;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.CNAMERecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.Flags;
import org.xbill.DNS.Message;
import org.xbill.DNS.Name;
import org.xbill.DNS.Section;
import org.xbill.DNS.Type;

import java.io.IOException;
import java.net.BindException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FirebaseDnsCandidateTest {
	@Test void silentDnsServerReturnsWithNoChannelOrBackgroundLookupLeftRunning() throws Exception {
		try (DnsServer server = new DnsServer(query -> null)) {
			FirebaseDnsCandidate dns = new FirebaseDnsCandidate(server.address());
			long start = System.nanoTime();
			assertThrows(java.net.SocketTimeoutException.class, () -> dns.resolve("cold-provider.invalid", 443, start + 200_000_000L));
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
			assertTrue(elapsed < 400, "DNS returned in " + elapsed + " ms");
			assertEquals(0, dns.activeChannels());
			assertEquals(1, server.queries.get(), "No timeout retries");
			System.out.println("FIREBASE_DNS_SPIKE silent elapsedMs=" + elapsed + " activeChannels=0 queries=1");
		}
	}
	@Test void onlyQueryRelevantAnswersAreUsedAndCnameIsFollowedWithoutJvmResolution() throws Exception {
		try (DnsServer server = new DnsServer(query -> {
			Message answer = answer(query);
			try {
				Name alias = Name.fromString("canonical-provider.invalid.");
				answer.addRecord(new ARecord(Name.fromString("unrelated.invalid."), DClass.IN, 60, InetAddress.getLoopbackAddress()), Section.ANSWER);
				answer.addRecord(new CNAMERecord(query.getQuestion().getName(), DClass.IN, 60, alias), Section.ANSWER);
				answer.addRecord(new ARecord(alias, DClass.IN, 60, InetAddress.getByAddress(new byte[] {127, 0, 0, 2})), Section.ANSWER);
			} catch (IOException failure) { throw new IllegalStateException(failure); }
			return answer;
		})) {
			FirebaseDnsCandidate dns = new FirebaseDnsCandidate(server.address());
			assertEquals(List.of(new InetSocketAddress(InetAddress.getByAddress(new byte[] {127, 0, 0, 2}), 443)),
				dns.resolve("provider.invalid", 443, System.nanoTime() + 500_000_000L));
			assertEquals(0, dns.activeChannels()); assertEquals(1, server.queries.get());
		}
	}
	@Test void ipv6LiteralNeverConsultsDnsAndIpv6OnlyAnswerUsesOneSharedDeadline() throws Exception {
		try (DnsServer server = new DnsServer(query -> {
			Message answer = answer(query);
			if (query.getQuestion().getType() == Type.AAAA) {
				try { answer.addRecord(new AAAARecord(query.getQuestion().getName(), DClass.IN, 60, InetAddress.getByAddress(new byte[16])), Section.ANSWER); }
				catch (IOException failure) { throw new IllegalStateException(failure); }
			}
			return answer;
		})) {
			FirebaseDnsCandidate dns = new FirebaseDnsCandidate(server.address());
			assertEquals(1, dns.resolve("[::1]", 443, System.nanoTime() + 500_000_000L).size());
			assertEquals(0, server.queries.get());
			assertEquals(16, dns.resolve("ipv6-provider.invalid", 443, System.nanoTime() + 500_000_000L).getFirst().getAddress().getAddress().length);
			assertEquals(2, server.queries.get()); assertEquals(0, dns.activeChannels());
		}
	}
	@Test void mismatchedTransactionsAndAliasCyclesFailClosedAndReleaseChannels() throws Exception {
		for (boolean cycle : new boolean[] {false, true}) {
			try (DnsServer server = new DnsServer(query -> {
				Message answer = answer(query);
				if (cycle) answer.addRecord(new CNAMERecord(query.getQuestion().getName(), DClass.IN, 60, query.getQuestion().getName()), Section.ANSWER);
				else answer.getHeader().setID((query.getHeader().getID() + 1) & 0xffff);
				return answer;
			})) {
				FirebaseDnsCandidate dns = new FirebaseDnsCandidate(server.address());
				assertThrows(IOException.class, () -> dns.resolve("provider.invalid", 443, System.nanoTime() + 500_000_000L));
				assertEquals(0, dns.activeChannels()); assertEquals(1, server.queries.get());
			}
		}
	}
	@Test void truncatedUdpFallsBackToTcpWithinSameDeadlineAndClosesStalledTcpPeer() throws Exception {
		try (DnsTcpServer fixture = new DnsTcpServer(0)) {
			DnsServer server = fixture.dns;
			ServerSocket listener = fixture.listener;
			CompletableFuture<Boolean> closed = CompletableFuture.supplyAsync(() -> {
				try (Socket peer = listener.accept()) {
					peer.setSoTimeout(1_000);
					int length = (peer.getInputStream().read() << 8) | peer.getInputStream().read();
					peer.getInputStream().readNBytes(length);
					peer.getOutputStream().write(new byte[] {1, 0}); // 256-byte response which never arrives.
					peer.getOutputStream().flush();
					return peer.getInputStream().read() == -1;
				} catch (IOException failure) { throw new IllegalStateException(failure); }
			});
			FirebaseDnsCandidate dns = new FirebaseDnsCandidate(server.address());
			long start = System.nanoTime();
			assertThrows(java.net.SocketTimeoutException.class, () -> dns.resolve("provider.invalid", 443, start + 250_000_000L));
			long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
			assertTrue(elapsed < 450, "DNS TCP returned in " + elapsed + " ms");
			assertTrue(closed.get(1, TimeUnit.SECONDS));
			assertEquals(0, dns.activeChannels()); assertEquals(1, server.queries.get());
			System.out.println("FIREBASE_DNS_SPIKE tcpStall elapsedMs=" + elapsed + " activeChannels=0 peerClosed=true");
		}
	}
	@Test void tcpFixtureReservesBothProtocolsAndRetriesAnOccupiedUdpPort() throws Exception {
		try (DatagramSocket occupied = new DatagramSocket(0, InetAddress.getLoopbackAddress());
			DnsTcpServer fixture = new DnsTcpServer(occupied.getLocalPort())) {
			assertFalse(occupied.isClosed());
			assertTrue(fixture.listener.getLocalPort() != occupied.getLocalPort());
			assertEquals(fixture.listener.getLocalPort(), fixture.dns.address().getPort());
		}
	}

	@Test void expiredDeadlineNeverOpensAChannel() throws Exception {
		FirebaseDnsCandidate dns = new FirebaseDnsCandidate(new InetSocketAddress(InetAddress.getLoopbackAddress(), 53));
		assertThrows(java.net.SocketTimeoutException.class, () -> dns.resolve("provider.invalid", 443, System.nanoTime() - 1));
		assertEquals(0, dns.activeChannels());
	}

	static Message answer(Message query) {
		Message answer = new Message(query.getHeader().getID()); answer.getHeader().setFlag(Flags.QR);
		answer.addRecord(query.getQuestion(), Section.QUESTION); return answer;
	}
	/** Reserve a shared DNS endpoint before starting either protocol's test traffic. */
	private static final class DnsTcpServer implements AutoCloseable {
		private final ServerSocket listener;
		private final DnsServer dns;

		private DnsTcpServer(int preferredPort) throws IOException {
			BindException collision = null;
			ServerSocket reservedListener = null;
			DnsServer reservedDns = null;
			for (int attempt = 0; attempt < 32; attempt++) {
				ServerSocket candidate = new ServerSocket();
				try {
					candidate.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), attempt == 0 ? preferredPort : 0), 1);
					DnsServer selected = new DnsServer(candidate.getLocalPort(), query -> {
						Message answer = answer(query);
						answer.getHeader().setFlag(Flags.TC);
						return answer;
					});
					reservedListener = candidate;
					reservedDns = selected;
					break;
				} catch (BindException unavailable) {
					candidate.close();
					collision = unavailable;
				} catch (IOException failure) {
					candidate.close();
					throw failure;
				}
			}
			if (reservedListener == null) throw new IOException("Unable to reserve a shared DNS UDP/TCP endpoint", collision);
			listener = reservedListener;
			dns = reservedDns;
		}

		@Override public void close() throws Exception {
			try (listener; dns) { }
		}
	}

	static final class DnsServer implements AutoCloseable {
		private final DatagramSocket socket;
		private final Thread thread;
		final AtomicInteger queries = new AtomicInteger();
		volatile Throwable failure;
		DnsServer(Function<Message, Message> responder) throws IOException { this(0, responder); }
		DnsServer(int port, Function<Message, Message> responder) throws IOException {
			socket = new DatagramSocket(port, InetAddress.getLoopbackAddress());
			thread = Thread.ofPlatform().daemon(true).name("synthetic-provider-dns").start(() -> {
				try {
					while (!socket.isClosed()) {
						DatagramPacket packet = new DatagramPacket(new byte[65_535], 65_535); socket.receive(packet); queries.incrementAndGet();
						Message answer = responder.apply(new Message(Arrays.copyOf(packet.getData(), packet.getLength())));
						if (answer != null) { byte[] wire = answer.toWire(); socket.send(new DatagramPacket(wire, wire.length, packet.getSocketAddress())); }
					}
				} catch (Throwable stopped) { if (!socket.isClosed()) failure = stopped; }
			});
		}
		InetSocketAddress address() { return new InetSocketAddress(socket.getLocalAddress(), socket.getLocalPort()); }
		@Override public void close() throws Exception {
			socket.close(); thread.join(1_000); assertFalse(thread.isAlive(), "DNS fixture thread did not stop");
			if (failure != null) throw new AssertionError("DNS fixture failed", failure);
		}
	}
}
