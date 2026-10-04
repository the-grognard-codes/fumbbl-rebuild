package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
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

class SetupSessionConcessionTest {
    @Test
    void nonActingCoachConcedesAndOpponentWinsWithReplayableResult() {
        RosterCatalog catalog = new RosterCatalog();
        List<TeamDraft.Player> players = new ArrayList<>();
        for (int slot = 1; slot <= 11; slot++)
            players.add(new TeamDraft.Player("player" + slot, slot, "lineman", Collections.emptyList()));
        Map<String, Integer> resources = new LinkedHashMap<>();
        for (String resource : catalog.getResources().keySet()) resources.put(resource, 0);
        TeamDraft draft = new TeamDraft(RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, "player1", players, resources);
        FrozenTeam home = new FrozenTeam("00000000-0000-0000-0000-000000000011", 1, "home", draft, 550000, 0, catalog);
        FrozenTeam away = new FrozenTeam("00000000-0000-0000-0000-000000000012", 1, "away", draft, 550000, 0, catalog);
        MatchDocument document = new MatchDocument("00000000-0000-0000-0000-000000000021", 3, "away", MatchDocument.Lifecycle.ACTIVATED,
            new MatchDocument.Member("home", "home", home), new MatchDocument.Member("away", "away", away));
        FantasyFootballServer server = mock(FantasyFootballServer.class);
        FactoryManager manager = new FactoryManager();
        when(server.getFactoryManager()).thenReturn(manager);
        when(server.getFactorySource()).thenReturn(server);
        when(server.forContext(any())).thenReturn(server);
        Map<FactoryType.Factory, INamedObjectFactory> factories = manager.getFactoriesForContext(FactoryType.FactoryContext.APPLICATION, server);
        when(server.getFactory(any())).thenAnswer(invocation -> factories.get(invocation.getArgument(0)));
        when(server.getDebugLog()).thenReturn(mock(DebugLog.class));
        when(server.getGameCache()).thenReturn(mock(GameCache.class));
        when(server.getCommunication()).thenReturn(mock(ServerCommunication.class));
        SetupSession session = new SetupSession(server, document, -2, true, true, true, true, true, true);
        JsonObject initialClock = session.decorateSaveResume(session.reply("load", "ACCEPTED", false, "home"))
            .get("state").asObject().get("clock").asObject();
        JsonObject playerCard = session.reply("load", "ACCEPTED", false, "home")
            .get("state").asObject().get("players").asArray().get(0).asObject();
        assertEquals("Human", playerCard.getString("positionRace", null));
        assertEquals("Lineman", playerCard.getString("positionRole", null));
        assertEquals("Reserve", playerCard.getString("status", null));
        assertEquals(600000L, initialClock.get("homeReserveMs").asLong());
        assertEquals(600000L, initialClock.get("awayReserveMs").asLong());
        JsonObject checkpointClock = JsonObject.readFrom(session.recoveryArtifact()).get("payload").asObject().get("clock").asObject();
        assertEquals(0L, checkpointClock.get("homeUsedMs").asLong());
        assertEquals(0L, checkpointClock.get("awayUsedMs").asLong());
        SetupSession recovered = new SetupSession(server, document, session.recoveryArtifact());
        assertEquals(initialClock.get("homeReserveMs").asLong(), recovered.decorateSaveResumeState(recovered.spectatorView())
            .get("clock").asObject().get("homeReserveMs").asLong());
        String nonActor = "home".equals(session.reply("load", "ACCEPTED", false, "home").get("state").asObject().getString("actor", null)) ? "away" : "home";
        JsonObject request = new JsonObject().add("version", 1).add("type", "setup").add("operation", "concede")
            .add("requestId", "concession-1").add("matchId", document.matchId).add("expectedRevision", 0);

        JsonObject response = session.apply(nonActor, request);

        assertEquals("ACCEPTED", response.getString("code", null));
        assertEquals("FULL_TIME", response.get("state").asObject().getString("phase", null));
        assertTrue(session.isComplete());
        int homeScore = response.get("state").asObject().getInt("homeScore", -1);
        int awayScore = response.get("state").asObject().getInt("awayScore", -1);
        assertTrue("home".equals(nonActor) ? awayScore > homeScore : homeScore > awayScore);
        JsonObject result = JsonObject.readFrom(session.completedMatch().json());
        assertEquals("FULL_TIME", result.get("events").asArray().get(result.get("events").asArray().size() - 1).asObject().getString("kind", null));
        assertEquals("ACCEPTED", session.apply(nonActor, request).getString("code", null));
        assertTrue(session.apply(nonActor, request).getBoolean("duplicate", false));
    }
}
