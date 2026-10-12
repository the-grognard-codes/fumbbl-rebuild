package com.fumbbl.ffb.server.team;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.sql.DriverManager;
import java.util.Arrays;

/** Operator entry point. Passwords come only from a local file and never appear in output or argv. */
public final class ObsoleteSavedTeamCleanupMain {
	private ObsoleteSavedTeamCleanupMain() { }
	public static void main(String[] arguments) {
		try {
			int status = run(arguments);
			if (status != 0) System.exit(status);
		}
		catch (Exception failure) {
			String code = failure.getMessage();
			if ("COMMIT_OUTCOME_UNKNOWN".equals(code)) {
				System.err.println("CLEANUP_COMMIT_OUTCOME_UNKNOWN: run inventory before any further action");
				System.exit(3);
			}
			if ("COMMIT_COMPLETED_CLOSE_FAILED".equals(code)) {
				System.err.println("CLEANUP_COMMITTED_VERIFICATION_PENDING: run inventory; do not repeat apply yet");
				System.exit(3);
			}
			if (!Arrays.asList("PLAN_SIZE", "PLAN_VERSION", "PLAN_IDENTITY", "PLAN_ENTRY", "PLAN_COUNTS", "PLAN_SHAPE",
				"PLAN_TARGET_MISMATCH", "PLAN_ROW_CHANGED", "PLAN_ROW_DUPLICATED", "SCHEMA_VERSION", "TABLE_SHAPE",
				"DEPENDENT_TABLES_UNREVIEWED", "DATABASE_UNAVAILABLE", "ENVIRONMENT", "DATABASE",
				"PLAN_DIGEST_MISMATCH", "ARGUMENTS", "CONFIGURATION").contains(code)) code = "DATABASE_OR_PLAN_ERROR";
			System.err.println("CLEANUP_FAILED " + code);
			System.exit(2);
		}
	}
	static int run(String[] arguments) throws Exception {
		if (arguments.length < 2 || arguments.length > 4) throw new IllegalArgumentException("ARGUMENTS");
		String mode = arguments[0], environment = arguments[1];
		if (!environment.matches("[A-Za-z0-9_-]{1,80}")) throw new IllegalArgumentException("ENVIRONMENT");
		if (!("inventory".equals(mode) && arguments.length == 2 || "plan".equals(mode) && arguments.length == 3
			|| "apply".equals(mode) && arguments.length == 4)) throw new IllegalArgumentException("ARGUMENTS");
		String url = System.getenv("MUTP_CLEANUP_JDBC_URL");
		String user = System.getenv("MUTP_CLEANUP_DB_USER");
		String passwordPath = System.getenv("MUTP_CLEANUP_DB_PASSWORD_FILE");
		if (url == null || !url.startsWith("jdbc:mariadb:") || user == null || user.isEmpty()
			|| passwordPath == null || passwordPath.isEmpty()) throw new IllegalArgumentException("CONFIGURATION");
		String password = new String(Files.readAllBytes(Paths.get(passwordPath)), StandardCharsets.UTF_8).trim();
		JdbcObsoleteSavedTeamStore store = new JdbcObsoleteSavedTeamStore(() -> DriverManager.getConnection(url, user, password));
		ObsoleteSavedTeamCleanup cleanup = new ObsoleteSavedTeamCleanup();
		if ("apply".equals(mode)) {
			byte[] bytes = Files.readAllBytes(Paths.get(arguments[2]));
			String text = new String(bytes, StandardCharsets.UTF_8);
			if (!ObsoleteSavedTeamCleanup.sha256(text).equals(arguments[3])) throw new IllegalArgumentException("PLAN_DIGEST_MISMATCH");
			ObsoleteSavedTeamCleanup.Plan plan = ObsoleteSavedTeamCleanup.Plan.parse(text);
			ObsoleteSavedTeamCleanup.Result result = cleanup.execute(store, url, environment, plan);
			return reportCommitted(cleanup, store, environment, url, result, System.out, System.err);
		} else {
			ObsoleteSavedTeamCleanup.Plan plan = cleanup.inventory(store, environment, url);
			System.out.println("environment=" + environment + " accountScanned=" + plan.accountScanned
				+ " localScanned=" + plan.localScanned + " obsolete=" + plan.entries.size() + " excluded=" + plan.excluded);
			if ("plan".equals(mode)) {
				String text = plan.json().toString();
				Path path = Paths.get(arguments[2]);
				Files.write(path, text.getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
				System.out.println("planSha256=" + ObsoleteSavedTeamCleanup.sha256(text));
			}
		}
		return 0;
	}
	static int reportCommitted(ObsoleteSavedTeamCleanup cleanup, ObsoleteSavedTeamCleanup.Store store,
		String environment, String url, ObsoleteSavedTeamCleanup.Result result, PrintStream out, PrintStream err) {
		out.println("committed=true deleted=" + result.deleted + " alreadyAbsent=" + result.alreadyAbsent);
		try {
			ObsoleteSavedTeamCleanup.Plan after = cleanup.inventory(store, environment, url);
			out.println("postCommitVerification=complete remainingObsolete=" + after.entries.size()
				+ " currentOrExcluded=" + after.excluded);
			return 0;
		} catch (Exception failure) {
			err.println("CLEANUP_COMMITTED_VERIFICATION_PENDING: run inventory; do not repeat apply yet");
			return 3;
		}
	}
}
