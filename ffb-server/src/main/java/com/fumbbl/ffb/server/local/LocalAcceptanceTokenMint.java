package com.fumbbl.ffb.server.local;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;

/** Mints real DEV Firebase custom tokens for throwaway acceptance identities; tokens are never logged. */
public final class LocalAcceptanceTokenMint {
	static final String PROJECT = "dev-moles-under-the-pitch-org";
	static final Path OUTPUT_ROOT = Paths.get("/output");

	private LocalAcceptanceTokenMint() { }

	public static void main(String[] args) {
		try {
			if (args.length != 4) throw new IllegalArgumentException("ARGS");
			String outputPath = args[0];
			String homeUid = args[1];
			String awayUid = args[2];
			String spectatorUid = args[3];
			validateInputs(outputPath, homeUid, awayUid, spectatorUid,
				System.getenv("ACCEPTANCE_FIREBASE_PROJECT"), System.getenv("ACCEPTANCE_SIGNING_SERVICE_ACCOUNT"));
			FirebaseOptions options = FirebaseOptions.builder()
				.setCredentials(GoogleCredentials.getApplicationDefault())
				.setProjectId(PROJECT)
				.setServiceAccountId(System.getenv("ACCEPTANCE_SIGNING_SERVICE_ACCOUNT"))
				.build();
			FirebaseApp app = FirebaseApp.initializeApp(options, "coach-match-acceptance-token-mint");
			try {
				FirebaseAuth auth = FirebaseAuth.getInstance(app);
				String json = "{\"home\":{\"uid\":\"" + homeUid + "\",\"token\":\"" + auth.createCustomToken(homeUid)
					+ "\"},\"away\":{\"uid\":\"" + awayUid + "\",\"token\":\"" + auth.createCustomToken(awayUid)
					+ "\"},\"spectator\":{\"uid\":\"" + spectatorUid + "\",\"token\":\"" + auth.createCustomToken(spectatorUid) + "\"}}\n";
				writeTokenFile(Paths.get(outputPath), json);
			} finally { app.delete(); }
			System.out.println("Acceptance Firebase tokens written to the ignored output file.");
		} catch (Exception failure) {
			String message = failure.getMessage() == null ? "" : failure.getMessage().toLowerCase(java.util.Locale.ROOT);
			String code = message.contains("signblob") || message.contains("permission_denied") || message.contains("permission denied")
				? "IAM_SIGN_BLOB_PERMISSION_REQUIRED" : "ACCEPTANCE_TOKEN_MINT_FAILED";
			System.err.println(code);
			System.exit(1);
		}
	}

	static void validateInputs(String outputPath, String homeUid, String awayUid, String spectatorUid,
		String project, String serviceAccountId) {
		if (!PROJECT.equals(project)) throw new IllegalArgumentException("PROJECT");
		if (serviceAccountId == null || !serviceAccountId.matches("(?:[A-Za-z0-9._+-]+@dev-moles-under-the-pitch-org\\.iam\\.gserviceaccount\\.com|dev-moles-under-the-pitch-org@appspot\\.gserviceaccount\\.com)")) {
			throw new IllegalArgumentException("SERVICE_ACCOUNT");
		}
		Path path = Paths.get(outputPath).normalize();
		requireOutputPath(path);
		Set<String> identities = new HashSet<>();
		for (String uid : new String[] {homeUid, awayUid, spectatorUid}) {
			if (uid == null || !uid.matches("acceptance-(home|away|spectator)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) {
				throw new IllegalArgumentException("UID");
			}
			if (!identities.add(uid)) throw new IllegalArgumentException("DUPLICATE_UID");
		}
	}

	static void writeTokenFile(Path path, String json) throws IOException {
		Path output = path.toAbsolutePath().normalize();
		requireOutputPath(output);
		Files.createDirectories(output.getParent());
		Path temporary = Files.createTempFile(output.getParent(), ".acceptance-token-", ".tmp");
		try {
			try { Files.setPosixFilePermissions(temporary, EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)); }
			catch (UnsupportedOperationException ignored) { }
			Files.write(temporary, json.getBytes(StandardCharsets.UTF_8), StandardOpenOption.TRUNCATE_EXISTING);
			try { Files.move(temporary, output, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
			catch (AtomicMoveNotSupportedException ignored) { Files.move(temporary, output, StandardCopyOption.REPLACE_EXISTING); }
		} finally { Files.deleteIfExists(temporary); }
	}

	private static void requireOutputPath(Path path) {
		String normalized = path.toString().replace('\\', '/');
		if (!normalized.startsWith("/output/") || normalized.contains("/../")) {
			throw new IllegalArgumentException("OUTPUT_PATH");
		}
	}
}
