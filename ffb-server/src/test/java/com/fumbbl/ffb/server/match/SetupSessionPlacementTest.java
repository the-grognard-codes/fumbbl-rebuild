package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;
import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.server.DebugLog;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameCache;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.team.bb2025.TeamDraft;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SetupSessionPlacementTest {
    @Test
    void projectsFrozenTeamArtAndRestoresLegacyCheckpointsWithoutPresentationFields() throws Exception {
        Fixture fixture = new Fixture();
        JsonObject view = fixture.setup();
        assertEquals("Old World Classic", view.get("homeTeamArt").asObject().getString("league", null));
        assertEquals("human", view.get("awayTeamArt").asObject().getString("rosterId", null));
        JsonObject legacy = JsonObject.readFrom(fixture.session.recoveryArtifact());
        removeTeamArt(legacy);
        StringBuilder checksum = new StringBuilder();
        for (byte value : java.security.MessageDigest.getInstance("SHA-256").digest(legacy.get("payload").toString()
            .getBytes(java.nio.charset.StandardCharsets.UTF_8))) checksum.append(String.format("%02x", value & 255));
        legacy.set("sha256", checksum.toString());
        SetupSession restored = new SetupSession(fixture.server, fixture.document, legacy.toString());
        JsonObject restoredView = restored.reply("load", "ACCEPTED", false, "away").get("state").asObject();
        assertEquals(view.get("homeTeamArt"), restoredView.get("homeTeamArt"));
        assertEquals(view.get("awayTeamArt"), restoredView.get("awayTeamArt"));
    }

    @Test
    void preservesBothHostingIdentitiesAcrossEmptyPositionsRecipientsAndRecovery() {
        for (String homeRoster : new String[] { "human", "orc" }) {
            String awayRoster = "human".equals(homeRoster) ? "orc" : "human";
            Fixture fixture = new Fixture(homeRoster, awayRoster);
            JsonObject initial = fixture.session.reply("initial", "ACCEPTED", false, "home").get("state").asObject();
            for (JsonValue item : initial.get("players").asArray()) assertTrue(item.asObject().get("x").isNull());
            JsonObject expectedHome = initial.get("homeTeamArt").asObject();
            JsonObject expectedAway = initial.get("awayTeamArt").asObject();
            assertEquals(homeRoster, expectedHome.getString("rosterId", null));
            assertEquals("human".equals(homeRoster) ? "Old World Classic" : "Badlands Brawl", expectedHome.getString("league", null));
            assertEquals(awayRoster, expectedAway.getString("rosterId", null));
            assertEquals("human".equals(awayRoster) ? "Old World Classic" : "Badlands Brawl", expectedAway.getString("league", null));
            fixture.setup();
            SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
            for (String role : new String[] { "home", "away", "spectator" }) {
                JsonObject state = restored.reply("restored-" + role, "ACCEPTED", false, role).get("state").asObject();
                assertEquals(expectedHome, state.get("homeTeamArt"));
                assertEquals(expectedAway, state.get("awayTeamArt"));
            }
        }
    }

    private void removeTeamArt(JsonValue value) {
        if (value.isObject()) {
            JsonObject object = value.asObject();
            object.remove("homeTeamArt"); object.remove("awayTeamArt");
            for (JsonObject.Member member : object) removeTeamArt(member.getValue());
        } else if (value.isArray()) for (JsonValue child : value.asArray()) removeTeamArt(child);
    }

    @Test
    void swapsOnlyTwoOwnOnPitchPlayersInOneRecoverableDecision() {
        Fixture fixture = new Fixture();
        JsonObject before = fixture.setup();
        String actor = before.getString("actor", null);
        JsonObject first = fixture.pitchPlayer(before, actor, 0);
        JsonObject second = fixture.pitchPlayer(before, actor, 1);
        int originalX = first.getInt("x", -1), originalY = first.getInt("y", -1);
        JsonObject request = fixture.place("swap", before, first.getString("id", null),
            second.getInt("x", -1), second.getInt("y", -1));

        JsonObject swapped = fixture.session.apply(actor, request);
        assertEquals("ACCEPTED", swapped.getString("code", null));
        JsonObject state = swapped.get("state").asObject();
        assertEquals(second.getInt("x", -1), fixture.player(state, first.getString("id", null)).getInt("x", -1));
        assertEquals(second.getInt("y", -1), fixture.player(state, first.getString("id", null)).getInt("y", -1));
        assertEquals(originalX, fixture.player(state, second.getString("id", null)).getInt("x", -1));
        assertEquals(originalY, fixture.player(state, second.getString("id", null)).getInt("y", -1));
        assertEquals(before.getInt("revision", -1) + 1, state.getInt("revision", -1));
        assertTrue(fixture.session.apply(actor, request).getBoolean("duplicate", false));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        assertTrue(restored.apply(actor, request).getBoolean("duplicate", false));

        JsonObject third = fixture.pitchPlayer(state, actor, 2);
        state = fixture.session.apply(actor, fixture.request("place", "to-reserve", state)
            .add("playerId", third.get("id")).add("to", JsonValue.NULL)).get("state").asObject();
        JsonObject occupied = fixture.place("reserve-occupied", state, third.getString("id", null),
            originalX, originalY);
        assertEquals("ILLEGAL_PLACEMENT", fixture.failure(actor, occupied));
        assertEquals("ILLEGAL_PLACEMENT", fixture.failure(actor, fixture.place("opponent-half", state,
            first.getString("id", null), actor.equals("home") ? 13 : 12, 7)));
    }

    @Test
    void reportsNativeSetupErrorsOnConfirmAndExactRetries() {
        Fixture fixture = new Fixture();
        JsonObject state = fixture.setup();
        String actor = state.getString("actor", null);
        JsonObject first = fixture.pitchPlayer(state, actor, 0);
        JsonObject second = fixture.pitchPlayer(state, actor, 1);
        int x = actor.equals("home") ? 9 : 16;
        state = fixture.session.apply(actor, fixture.place("wide-1", state, first.getString("id", null), x, 1)).get("state").asObject();
        state = fixture.session.apply(actor, fixture.place("wide-2", state, second.getString("id", null), x, 2)).get("state").asObject();
        JsonObject confirm = fixture.request("confirm", "confirm", state);

        JsonObject rejected = fixture.session.apply(actor, confirm);
        assertEquals("ILLEGAL_SETUP", rejected.getString("code", null));
        JsonArray errors = rejected.get("setupErrors").asArray();
        assertTrue(errors.size() > 0);
        assertTrue(errors.toString().contains("wide zone"));
        assertTrue(errors.toString().contains("Line of Scrimmage"));
        assertEquals(state.getInt("revision", -1), rejected.get("state").asObject().getInt("revision", -1));
        JsonObject retry = fixture.session.apply(actor, confirm);
        assertTrue(retry.getBoolean("duplicate", false));
        assertEquals(errors, retry.get("setupErrors"));
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        JsonObject recoveredRetry = restored.apply(actor, confirm);
        assertTrue(recoveredRetry.getBoolean("duplicate", false));
        assertEquals(errors, recoveredRetry.get("setupErrors"));
    }

    private static final class Fixture {
        final FantasyFootballServer server = mock(FantasyFootballServer.class);
        final MatchDocument document;
        final SetupSession session;
        private int sequence;

        Fixture() {
            this("human", "human");
        }

        Fixture(String homeRoster, String awayRoster) {
            FrozenTeam home = frozen("00000000-0000-0000-0000-000000000011", "home", homeRoster);
            FrozenTeam away = frozen("00000000-0000-0000-0000-000000000012", "away", awayRoster);
            document = new MatchDocument("00000000-0000-0000-0000-000000000021", 3, "away", MatchDocument.Lifecycle.ACTIVATED,
                new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away));
            FactoryManager manager = new FactoryManager();
            when(server.getFactoryManager()).thenReturn(manager);
            when(server.getFactorySource()).thenReturn(server);
            when(server.forContext(any())).thenReturn(server);
            Map<FactoryType.Factory, INamedObjectFactory> factories = manager.getFactoriesForContext(FactoryType.FactoryContext.APPLICATION, server);
            when(server.getFactory(any())).thenAnswer(invocation -> factories.get(invocation.getArgument(0)));
            when(server.getDebugLog()).thenReturn(mock(DebugLog.class));
            when(server.getGameCache()).thenReturn(mock(GameCache.class));
            when(server.getCommunication()).thenReturn(mock(ServerCommunication.class));
            session = new SetupSession(server, document, -2, true, true, true, true, true, true);
        }

        private FrozenTeam frozen(String id, String role, String roster) {
            RosterCatalog catalog = new RosterCatalog(roster);
            List<TeamDraft.Player> players = new ArrayList<>();
            for (int slot = 1; slot <= 11; slot++)
                players.add(new TeamDraft.Player("player" + slot, slot, "orc".equals(roster) ? "orc-lineman" : "lineman", Collections.emptyList()));
            Map<String, Integer> resources = new LinkedHashMap<>();
            for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
            TeamDraft draft = new TeamDraft(RosterCatalog.VERSION, "BB2025", roster, RosterCatalog.PRESET,
                "player1", players, resources);
            return new FrozenTeam(id, 1, role, draft, 550000, 0, catalog);
        }

        JsonObject setup() {
            JsonObject state = session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
            while (!"SETUP".equals(state.getString("phase", null))) {
                JsonObject prompt = state.get("prompt").asObject();
                JsonObject choice = request("choice", "choice-" + ++sequence, state)
                    .add("promptId", prompt.get("id"))
                    .add("optionId", "coin".equals(prompt.getString("kind", null)) ? "heads" : "receive");
                state = session.apply(state.getString("actor", null), choice).get("state").asObject();
            }
            return state;
        }

        JsonObject request(String operation, String id, JsonObject state) {
            return new JsonObject().add("version", 1).add("type", "setup").add("operation", operation)
                .add("requestId", id).add("matchId", document.matchId).add("expectedRevision", state.getInt("revision", -1));
        }

        JsonObject place(String id, JsonObject state, String playerId, int x, int y) {
            return request("place", id, state).add("playerId", playerId)
                .add("to", new JsonObject().add("x", x).add("y", y));
        }

        JsonObject pitchPlayer(JsonObject state, String role, int index) {
            int found = 0;
            for (JsonValue item : state.get("players").asArray()) {
                JsonObject player = item.asObject();
                if (role.equals(player.getString("role", null)) && "pitch".equals(player.getString("offPitch", null))) {
                    if (found++ == index) return player;
                }
            }
            throw new AssertionError("Missing pitch player " + index);
        }

        JsonObject player(JsonObject state, String id) {
            for (JsonValue item : state.get("players").asArray()) {
                JsonObject player = item.asObject();
                if (id.equals(player.getString("id", null))) return player;
            }
            throw new AssertionError("Missing player " + id);
        }

        String failure(String role, JsonObject request) {
            try {
                session.apply(role, request);
            } catch (MatchService.Failure failure) {
                return failure.code;
            }
            throw new AssertionError("Expected rejection");
        }
    }
}
