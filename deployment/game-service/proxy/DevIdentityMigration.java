import java.nio.file.Files;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** One-shot legacy DEV identity handoff. No private values in output. */
public final class DevIdentityMigration {
    static final String ISSUER = "https://securetoken.google.com/dev-moles-under-the-pitch-org";
    public static void main(String[] args) {
        try {
            String password = Files.readString(Paths.get("/etc/moles-game-v2-dev/secrets/db_password")).trim();
            try (Connection source = DriverManager.getConnection("jdbc:h2:file:/etc/moles-game-v2-dev/retained-20260921/accounts;ACCESS_MODE_DATA=r;IFEXISTS=TRUE", "sa", "");
                 Connection target = DriverManager.getConnection("jdbc:mariadb://127.0.0.1:3306/ffb_m6_dev", "ffb_m6_runtime", password)) {
                int count = migrate(source, target);
                System.out.println("Preserved " + count + " DEV identity links and account IDs; default PLAYER/SPECTATOR scopes only.");
            }
        } catch (Exception failure) {
            System.err.println("DEV identity handoff failed; retain both stores and inspect before retry. No values logged.");
            System.exit(1);
        }
    }

    static int migrate(Connection source, Connection target) throws Exception {
        Set<String> tables = new HashSet<>();
        try (ResultSet rows = source.getMetaData().getTables(null, "PUBLIC", "%", new String[] {"TABLE"})) {
            while (rows.next()) tables.add(rows.getString("TABLE_NAME"));
        }
        if (!tables.equals(Set.of("INTERNAL_ACCOUNT", "GAME_IDENTITY"))) throw new IllegalStateException();
        Set<String> accounts = new HashSet<>();
        try (ResultSet rows = source.createStatement().executeQuery("SELECT account_id FROM internal_account")) {
            while (rows.next()) {
                String id = rows.getString(1);
                if (!UUID.fromString(id).toString().equals(id) || !accounts.add(id)) throw new IllegalStateException();
            }
        }
        Map<String, String> links = new LinkedHashMap<>();
        try (ResultSet rows = source.createStatement().executeQuery("SELECT issuer,subject,account_id FROM game_identity")) {
            while (rows.next()) {
                String subject = rows.getString(2), account = rows.getString(3);
                if (!ISSUER.equals(rows.getString(1)) || subject == null || subject.isEmpty() || subject.length() > 128
                    || !accounts.contains(account) || links.put(subject, account) != null) throw new IllegalStateException();
            }
        }
        if (!new HashSet<>(links.values()).equals(accounts)) throw new IllegalStateException();
        target.setAutoCommit(false);
        try {
            for (String table : new String[] {"ffb_v2_account", "ffb_v2_identity", "ffb_v2_account_scope"}) {
                try (ResultSet rows = target.createStatement().executeQuery("SELECT COUNT(*) FROM " + table)) {
                    if (!rows.next() || rows.getLong(1) != 0) throw new IllegalStateException();
                }
            }
            try (PreparedStatement insert = target.prepareStatement("INSERT INTO ffb_v2_account(account_id,state) VALUES (?,'ACTIVE')");
                 PreparedStatement scope = target.prepareStatement("INSERT INTO ffb_v2_account_scope(account_id,scope) VALUES (?,?)");
                 PreparedStatement identity = target.prepareStatement("INSERT INTO ffb_v2_identity(issuer,subject,account_id,state) VALUES (?,?,?,'ACTIVE')")) {
                for (String account : accounts) {
                    insert.setString(1, account); insert.executeUpdate();
                    for (String name : new String[] {"PLAYER", "SPECTATOR"}) {
                        scope.setString(1, account); scope.setString(2, name); scope.executeUpdate();
                    }
                }
                for (Map.Entry<String, String> link : links.entrySet()) {
                    identity.setString(1, ISSUER); identity.setString(2, link.getKey()); identity.setString(3, link.getValue()); identity.executeUpdate();
                }
            }
            Map<String, String> actual = new LinkedHashMap<>();
            try (ResultSet rows = target.createStatement().executeQuery("SELECT issuer,subject,account_id,state FROM ffb_v2_identity")) {
                while (rows.next()) {
                    if (!ISSUER.equals(rows.getString(1)) || !"ACTIVE".equals(rows.getString(4))) throw new IllegalStateException();
                    actual.put(rows.getString(2), rows.getString(3));
                }
            }
            if (!links.equals(actual)) throw new IllegalStateException();
            target.commit();
            return links.size();
        } catch (Exception failure) { target.rollback(); throw failure; }
    }
}
