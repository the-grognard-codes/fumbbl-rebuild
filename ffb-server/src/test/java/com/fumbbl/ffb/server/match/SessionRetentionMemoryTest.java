package com.fumbbl.ffb.server.match;

import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionRetentionMemoryTest {
	@Test void lateSessionFitsItsRetainedBudgetAndIsCollectableAfterCompletionAndIdleEviction() throws Exception {
		String classPath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
		String javaExecutable = Path.of(System.getProperty("java.home"), "bin", "java.exe").toString();
		if (!System.getProperty("os.name").startsWith("Windows")) javaExecutable = Path.of(System.getProperty("java.home"), "bin", "java").toString();
		for (String mode : new String[] { "completion", "idle", "sequence" }) {
			Process process = new ProcessBuilder(javaExecutable, "sequence".equals(mode) ? "-Xmx384m" : "-Xmx256m", "-XX:+UseSerialGC", "-cp", classPath,
				SessionRetentionMemoryProbe.class.getName(), mode).redirectErrorStream(true).start();
			boolean finished = process.waitFor("sequence".equals(mode) ? 240 : 90, TimeUnit.SECONDS);
			if (!finished) { process.destroyForcibly(); process.waitFor(5, TimeUnit.SECONDS); }
			assertTrue(finished, "Session retention probe timed out");
			String output = new String(process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
			assertEquals(0, process.exitValue(), output);
			assertTrue(output.contains("retention-passed mode=" + mode), output);
			output.lines().filter(line -> line.startsWith("retention-passed")).forEach(System.out::println);
		}
	}
}
