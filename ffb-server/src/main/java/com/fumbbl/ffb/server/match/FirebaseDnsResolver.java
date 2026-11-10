package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.server.local.BrowserRequestTiming;

import org.xbill.DNS.AAAARecord;
import org.xbill.DNS.ARecord;
import org.xbill.DNS.Address;
import org.xbill.DNS.CNAMERecord;
import org.xbill.DNS.DClass;
import org.xbill.DNS.Flags;
import org.xbill.DNS.Message;
import org.xbill.DNS.Name;
import org.xbill.DNS.Opcode;
import org.xbill.DNS.Rcode;
import org.xbill.DNS.Record;
import org.xbill.DNS.Section;
import org.xbill.DNS.Type;

import java.io.EOFException;
import java.io.IOException;
import java.net.IDN;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.nio.channels.DatagramChannel;
import java.nio.channels.SelectionKey;
import java.nio.channels.Selector;
import java.nio.channels.SocketChannel;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/** Deadline-bound DNS over owned nonblocking channels; discovery is startup-only. */
public class FirebaseDnsResolver {
	private final InetSocketAddress server;
	private final AtomicInteger channels = new AtomicInteger();
	public FirebaseDnsResolver() {
		if (new BrowserRequestTiming().budget() != null) throw new IllegalStateException("Firebase DNS discovery must precede worker traffic");
		String configured = System.getProperty("ffb.firebase.dnsServer");
		InetSocketAddress endpoint;
		if (configured == null) endpoint = org.xbill.DNS.ResolverConfig.getCurrentConfig().server();
		else {
			try { endpoint = new InetSocketAddress(Address.getByAddress(configured), 53); }
			catch (UnknownHostException invalid) { throw new IllegalArgumentException("Firebase DNS server must be a literal IP address"); }
		}
		if (endpoint == null || endpoint.isUnresolved() || endpoint.getPort() <= 0) throw new IllegalArgumentException("Resolved Firebase DNS endpoint required");
		this.server = endpoint;
	}
	public FirebaseDnsResolver(InetSocketAddress server) {
		if (server == null || server.isUnresolved() || server.getPort() <= 0) throw new IllegalArgumentException("Resolved DNS endpoint required");
		this.server = server;
	}
	public final int activeChannels() { return channels.get(); }

	public final List<InetSocketAddress> resolve(String host, int port, long deadline) throws IOException {
		remaining(deadline);
		String literal = host.startsWith("[") && host.endsWith("]") ? host.substring(1, host.length() - 1) : host;
		byte[] bytes = Address.toByteArray(literal, Address.IPv4);
		if (bytes == null) bytes = Address.toByteArray(literal, Address.IPv6);
		if (bytes != null) return List.of(new InetSocketAddress(InetAddress.getByAddress(host, bytes), port));
		Name name = Name.fromString(IDN.toASCII(host) + ".");
		for (int type : new int[] {Type.A, Type.AAAA}) {
			Name current = name;
			Set<Name> followed = new HashSet<>();
			for (int queries = 0; queries < 8; queries++) {
				if (!followed.add(current)) throw new IOException("DNS alias cycle");
				Record question = Record.newRecord(current, type, DClass.IN);
				Message query = Message.newQuery(question);
				Message answer = response(query, udp(query.toWire(), deadline));
				if (answer.getHeader().getFlag(Flags.TC)) answer = response(query, tcp(query.toWire(), deadline));
				if (answer.getHeader().getFlag(Flags.TC)) throw new IOException("Truncated DNS TCP answer");
				if (answer.getRcode() != Rcode.NOERROR) throw new UnknownHostException("DNS lookup rejected: " + Rcode.string(answer.getRcode()));
				Set<Name> inAnswer = new HashSet<>();
				List<InetSocketAddress> result = new ArrayList<>();
				for (int aliases = 0; aliases < 8; aliases++) {
					if (!inAnswer.add(current)) throw new IOException("DNS answer alias cycle");
					Name target = null;
					for (Record record : answer.getSection(Section.ANSWER)) {
						if (!record.getName().equals(current) || record.getDClass() != DClass.IN) continue;
						if (record instanceof CNAMERecord alias) target = alias.getTarget();
						else if (type == Type.A && record instanceof ARecord address) result.add(new InetSocketAddress(address.getAddress(), port));
						else if (type == Type.AAAA && record instanceof AAAARecord address) result.add(new InetSocketAddress(address.getAddress(), port));
						if (result.size() > 16) throw new IOException("DNS address limit exceeded");
					}
					if (!result.isEmpty()) { remaining(deadline); return List.copyOf(result); }
					if (target == null) break;
					current = target;
				}
				if (current.equals(question.getName())) break;
			}
		}
		throw new UnknownHostException("No usable provider address");
	}

	private Message response(Message query, byte[] wire) throws IOException {
		Message answer = new Message(wire);
		if (answer.getHeader().getID() != query.getHeader().getID() || !answer.getHeader().getFlag(Flags.QR)
			|| answer.getHeader().getOpcode() != Opcode.QUERY || answer.getHeader().getCount(Section.QUESTION) != 1
			|| !query.getQuestion().equals(answer.getQuestion())) throw new IOException("DNS response does not match question");
		return answer;
	}
	private byte[] udp(byte[] query, long deadline) throws IOException {
		channels.incrementAndGet();
		try (DatagramChannel channel = DatagramChannel.open(); Selector selector = Selector.open()) {
			channel.configureBlocking(false); channel.connect(server); channel.register(selector, SelectionKey.OP_WRITE);
			ByteBuffer output = ByteBuffer.wrap(query);
			while (output.hasRemaining()) { ready(selector, SelectionKey.OP_WRITE, deadline); channel.write(output); }
			ByteBuffer input = ByteBuffer.allocate(65_535);
			while (true) {
				ready(selector, SelectionKey.OP_READ, deadline);
				int count = channel.read(input);
				if (count > 0) { byte[] bytes = new byte[count]; input.flip(); input.get(bytes); return bytes; }
			}
		} finally { channels.decrementAndGet(); }
	}
	private byte[] tcp(byte[] query, long deadline) throws IOException {
		channels.incrementAndGet();
		try (SocketChannel channel = SocketChannel.open(); Selector selector = Selector.open()) {
			channel.configureBlocking(false); channel.register(selector, SelectionKey.OP_CONNECT);
			channel.connect(server);
			while (!channel.finishConnect()) ready(selector, SelectionKey.OP_CONNECT, deadline);
			ByteBuffer output = ByteBuffer.allocate(query.length + 2).putShort((short) query.length).put(query).flip();
			while (output.hasRemaining()) { ready(selector, SelectionKey.OP_WRITE, deadline); channel.write(output); }
			ByteBuffer length = ByteBuffer.allocate(2); read(channel, selector, length, deadline); length.flip();
			int size = Short.toUnsignedInt(length.getShort());
			if (size < 12) throw new IOException("Invalid DNS TCP frame");
			ByteBuffer input = ByteBuffer.allocate(size); read(channel, selector, input, deadline);
			return input.array();
		} finally { channels.decrementAndGet(); }
	}
	private void read(SocketChannel channel, Selector selector, ByteBuffer input, long deadline) throws IOException {
		while (input.hasRemaining()) {
			ready(selector, SelectionKey.OP_READ, deadline);
			if (channel.read(input) < 0) throw new EOFException("DNS peer closed before complete frame");
		}
	}
	private void ready(Selector selector, int interest, long deadline) throws IOException {
		selector.keys().iterator().next().interestOps(interest);
		selector.selectedKeys().clear();
		while (selector.select(remaining(deadline)) == 0) {
			if (Thread.currentThread().isInterrupted()) throw new IOException("DNS interrupted");
		}
		remaining(deadline);
	}
	private long remaining(long deadline) throws SocketTimeoutException {
		long nanos = deadline - System.nanoTime();
		if (nanos <= 0) throw new SocketTimeoutException("Provider DNS deadline expired");
		return Math.max(1, (nanos + 999_999) / 1_000_000);
	}
}
