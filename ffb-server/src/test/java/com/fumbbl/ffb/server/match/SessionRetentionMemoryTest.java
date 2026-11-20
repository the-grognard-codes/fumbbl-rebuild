package com.fumbbl.ffb.server.match;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "SESSION_RETENTION_MEMORY_RUN", matches = "1")
class SessionRetentionMemoryTest {
	@TempDir Path outputDirectory;
	@Test void lateSessionFitsItsRetainedBudgetAndIsCollectableAfterCompletionAndIdleEviction() throws Exception {
		runProbe("completion", "-Xmx256m", 90);
		runProbe("idle", "-Xmx256m", 90);
		runProbe("sequence", "-Xmx384m", 240);
	}

	@Test void measureNearLimitCheckpointAndResultWithOtherResidents() throws Exception {
		runProbe("materialization", "-Xmx768m", 240);
	}

	private void runProbe(String mode, String heapLimit, int timeoutSeconds) throws Exception {
		String classPath = System.getProperty("surefire.test.class.path", System.getProperty("java.class.path"));
		String executableName = System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java";
		String javaExecutable = Path.of(System.getProperty("java.home"), "bin", executableName).toString();
		Path outputFile = outputDirectory.resolve(mode + ".log");
		Path checkpoints = Files.createDirectory(outputDirectory.resolve(mode));
		Process process = new ProcessBuilder(javaExecutable, heapLimit, "-XX:+UseSerialGC", "-cp", classPath,
			SessionRetentionMemoryProbe.class.getName(), mode, checkpoints.toString())
			.redirectErrorStream(true).redirectOutput(outputFile.toFile()).start();
		boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
		if (!finished) {
			process.destroyForcibly();
			process.waitFor(5, TimeUnit.SECONDS);
		}
		String output = new String(Files.readAllBytes(outputFile), StandardCharsets.UTF_8);
		assertTrue(finished, "Session retention probe timed out: " + output);
		assertEquals(0, process.exitValue(), output);
		assertTrue(output.contains("retention-passed mode=" + mode), output);
		output.lines().filter(line -> line.startsWith("retention-passed")).forEach(System.out::println);
	}
}
