package com.fumbbl.ffb.factory;

import com.fumbbl.ffb.factory.application.NetCommandIdFactory;
import com.fumbbl.ffb.model.change.ModelChangeId;
import com.fumbbl.ffb.net.NetCommandId;

import java.lang.management.ManagementFactory;
import java.util.Locale;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class ProtocolIdLookupTest {

	private static volatile Object result;

	@Test
	void preservesEveryWireNameCaseInsensitiveLookupAndUnknownInputs() {
		ModelChangeIdFactory changes = new ModelChangeIdFactory();
		NetCommandIdFactory commands = new NetCommandIdFactory();
		for (ModelChangeId id : ModelChangeId.values()) {
			assertSame(id, changes.forName(id.getName()));
			assertSame(id, changes.forName(id.getName().toUpperCase(Locale.ROOT)));
		}
		for (NetCommandId id : NetCommandId.values()) {
			assertSame(id, commands.forName(id.getName()));
			assertSame(id, commands.forName(id.getName().toUpperCase(Locale.ROOT)));
		}
		assertNull(changes.forName(null));
		assertNull(commands.forName(null));
		assertNull(changes.forName(""));
		assertNull(commands.forName(""));
		assertNull(changes.forName("unknownProtocolId"));
		assertNull(commands.forName("unknownProtocolId"));
	}

	@Test
	void repeatedRecoveryLookupsDoNotAllocateEnumArrays() {
		java.lang.management.ThreadMXBean platform = ManagementFactory.getThreadMXBean();
		assumeTrue(platform instanceof com.sun.management.ThreadMXBean);
		com.sun.management.ThreadMXBean allocation = (com.sun.management.ThreadMXBean) platform;
		assumeTrue(allocation.isThreadAllocatedMemorySupported());
		allocation.setThreadAllocatedMemoryEnabled(true);
		ModelChangeIdFactory changes = new ModelChangeIdFactory();
		NetCommandIdFactory commands = new NetCommandIdFactory();
		String[] names = { ModelChangeId.values()[0].getName(), "unknownProtocolId" };
		String[] commandNames = { NetCommandId.values()[0].getName(), "unknownProtocolId" };
		lookup(changes, commands, names, commandNames);
		long threadId = Thread.currentThread().threadId();
		long before = allocation.getThreadAllocatedBytes(threadId);
		lookup(changes, commands, names, commandNames);
		long bytes = allocation.getThreadAllocatedBytes(threadId) - before;
		System.out.println("Recovery ID lookup allocated bytes for 40000 lookups: " + bytes);
		// Allows VM bookkeeping, while rejecting a cloned enum array per parsed field.
		assertTrue(bytes < 256 * 1024, "Repeated lookups allocated " + bytes + " bytes");
	}

	private void lookup(ModelChangeIdFactory changes, NetCommandIdFactory commands,
			String[] names, String[] commandNames) {
		for (int index = 0; index < 20_000; index++) {
			result = changes.forName(names[index & 1]);
			result = commands.forName(commandNames[index & 1]);
		}
	}
}
