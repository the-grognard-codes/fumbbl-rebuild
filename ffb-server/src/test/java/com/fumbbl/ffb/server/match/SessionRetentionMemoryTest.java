package com.fumbbl.ffb.server.match;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "SESSION_RETENTION_MEMORY_RUN", matches = "1")
class SessionRetentionMemoryTest {
	@TempDir Path outputDirectory;
	@Test void lateSessionFitsItsRetainedBudgetAndIsCollectableAfterCompletionAndIdleEviction() throws Exception {
		String classPath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
		String executableName = System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java";
		String javaExecutable = Path.of(System.getProperty("java.home"), "bin", executableName).toString();
		for (String mode : new String[] { "completion", "idle", "sequence" }) {
			Path outputFile = outputDirectory.resolve(mode + ".log");
			Process process = new ProcessBuilder(javaExecutable, "sequence".equals(mode) ? "-Xmx384m" : "-Xmx256m", "-XX:+UseSerialGC", "-cp", classPath,
				SessionRetentionMemoryProbe.class.getName(), mode).redirectErrorStream(true).redirectOutput(outputFile.toFile()).start();
			boolean finished = process.waitFor("sequence".equals(mode) ? 240 : 90, TimeUnit.SECONDS);
			if (!finished) { process.destroyForcibly(); process.waitFor(5, TimeUnit.SECONDS); }
			String output = Files.readString(outputFile, StandardCharsets.UTF_8);
			assertTrue(finished, "Session retention probe timed out: " + output);
			assertEquals(0, process.exitValue(), output);
			assertTrue(output.contains("retention-passed mode=" + mode), output);
			output.lines().filter(line -> line.startsWith("retention-passed")).forEach(System.out::println);
		}
	}
}
