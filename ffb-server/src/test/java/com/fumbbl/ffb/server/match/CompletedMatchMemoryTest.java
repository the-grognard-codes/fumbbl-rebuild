package com.fumbbl.ffb.server.match;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CompletedMatchMemoryTest {
	@Test void completionFitsInBoundedHeapWhileRetainingRepeatedMatchHistory() throws Exception {
		String classPath = System.getProperty("surefire.test.class.path");
		if (classPath == null || classPath.isEmpty()) classPath = System.getProperty("java.class.path");
		assertNotNull(classPath);
		String java = Paths.get(System.getProperty("java.home"), "bin", executable("java")).toString();

		assertProbe(java, classPath, "128m", "completed-bytes=", "");
		assertProbe(java, classPath, "384m", "persisted-completion-passed", "persist");
		assertProbe(java, classPath, "256m", "retained-read-passed", "retained");
	}

	private void assertProbe(String java, String classPath, String heap, String expected, String mode) throws Exception {
		String[] command = mode.isEmpty() ? new String[] { java, "-Xmx" + heap, "-cp", classPath, CompletedMatchMemoryProbe.class.getName() }
			: new String[] { java, "-Xmx" + heap, "-cp", classPath, CompletedMatchMemoryProbe.class.getName(), mode };
		Process process = new ProcessBuilder(command)
			.redirectErrorStream(true).start();
		boolean finished = process.waitFor(45, TimeUnit.SECONDS);
		if (!finished) {
			process.destroyForcibly();
			assertTrue(process.waitFor(5, TimeUnit.SECONDS), "timed-out completion probe did not terminate at " + heap);
		}
		assertTrue(finished, "bounded-heap completion probe timed out at " + heap);
		String output = readOutput(process.getInputStream());
		assertEquals(0, process.exitValue(), "bounded-heap completion probe failed at " + heap + ": " + output);
		assertTrue(output.contains(expected), "probe did not finish expected path at " + heap + ": " + output);
	}

	private String readOutput(InputStream input) throws Exception {
		try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
			byte[] buffer = new byte[4096]; int count;
			while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
			return new String(output.toByteArray(), StandardCharsets.UTF_8);
		}
	}

	private String executable(String base) { return System.getProperty("os.name", "").startsWith("Windows") ? base + ".exe" : base; }
}
