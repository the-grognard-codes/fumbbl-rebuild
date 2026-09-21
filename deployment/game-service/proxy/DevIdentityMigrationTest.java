import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;

/** Synthetic H2 source/target contract tests; no real identities or credentials. */
public final class DevIdentityMigrationTest {
    public static void main(String[] args) throws Exception {
        for (String scenario : new String[] {"valid", "foreign", "lifecycle", "nonempty", "orphan"}) {
            try (Connection source = DriverManager.getConnection("jdbc:h2:mem:source" + scenario);
                 Connection target = DriverManager.getConnection("jdbc:h2:mem:target" + scenario)) {
                source.createStatement().execute("CREATE TABLE internal_account(account_id VARCHAR(36) PRIMARY KEY)");
                source.createStatement().execute("CREATE TABLE game_identity(issuer VARCHAR(255),subject VARCHAR(255),account_id VARCHAR(36))");
                String account = "11111111-1111-4111-8111-111111111111";
                source.createStatement().execute("INSERT INTO internal_account VALUES ('" + account + "')");
                source.createStatement().execute("INSERT INTO game_identity VALUES ('" + (scenario.equals("foreign") ? "foreign" : DevIdentityMigration.ISSUER) + "','synthetic', '" + (scenario.equals("orphan") ? "22222222-2222-4222-8222-222222222222" : account) + "')");
                if (scenario.equals("lifecycle")) source.createStatement().execute("CREATE TABLE account_lifecycle(id INT)");
                target.createStatement().execute("CREATE TABLE ffb_v2_account(account_id VARCHAR(36) PRIMARY KEY,state VARCHAR(32))");
                target.createStatement().execute("CREATE TABLE ffb_v2_identity(issuer VARCHAR(255),subject VARCHAR(255),account_id VARCHAR(36),state VARCHAR(32))");
                target.createStatement().execute("CREATE TABLE ffb_v2_account_scope(account_id VARCHAR(36),scope VARCHAR(32))");
                if (scenario.equals("nonempty")) target.createStatement().execute("INSERT INTO ffb_v2_account VALUES ('existing','ACTIVE')");
                boolean accepted = false;
                try { accepted = DevIdentityMigration.migrate(source, target) == 1; }
                catch (IllegalStateException expected) { }
                if (accepted != scenario.equals("valid")) throw new AssertionError(scenario);
                if (accepted) {
                    try (ResultSet rows = target.createStatement().executeQuery("SELECT COUNT(*) FROM ffb_v2_account_scope WHERE scope IN ('PLAYER','SPECTATOR')")) {
                        rows.next(); if (rows.getInt(1) != 2) throw new AssertionError();
                    }
                    try { DevIdentityMigration.migrate(source, target); throw new AssertionError("retry must reject"); }
                    catch (IllegalStateException expected) { }
                }
            }
        }
        System.out.println("PASS identity parity/default scopes, foreign issuer, lifecycle boundary, nonempty target, orphan link and repeat rejection.");
    }
}
