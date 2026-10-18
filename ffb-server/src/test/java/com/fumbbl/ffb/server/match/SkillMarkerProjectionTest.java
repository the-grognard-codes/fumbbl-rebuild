package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType;
import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Game;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.RosterPosition;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.model.skill.SkillWithValue;
import com.fumbbl.ffb.option.GameOptionId;
import com.fumbbl.ffb.option.GameOptionString;
import com.fumbbl.ffb.server.match.bb2025.SkillMarkerProjection;
import com.fumbbl.ffb.server.team.bb2025.SkillDefinitions;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import com.eclipsesource.json.JsonValue;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SkillMarkerProjectionTest {
    private SkillFactory factory() {
        Game game = new Game(null, new FactoryManager());
        game.getOptions().addOption(new GameOptionString(GameOptionId.RULESVERSION).setValue("BB2025"));
        game.initializeRules();
        return game.getFactory(FactoryType.Factory.SKILL);
    }

    @Test void everyCoreIdentityResolvesAndUniqueStarSkillsStayInDetailsOnly() {
        SkillFactory factory = factory();
        RosterPlayer player = new RosterPlayer();
        for (SkillDefinitions.Definition definition : SkillDefinitions.all().values()) player.addSkill(factory.forName(definition.name));
        Skill unique = factory.forName("Working in Tandem");
        assertTrue(unique != null);
        player.addSkill(unique);
        JsonObject data = new SkillMarkerProjection(factory).project(player);
        assertEquals(108, data.get("entries").asArray().size());
        Set<String> ids = new HashSet<>();
        for (JsonValue value : data.get("entries").asArray()) {
            JsonObject entry = value.asObject();
            assertTrue(ids.add(entry.getString("id", null)));
            assertEquals(SkillDefinitions.forId(entry.getString("id", null)).category.name(), entry.getString("category", null));
        }
        assertTrue(data.get("details").toString().contains(unique.getName()));
        assertFalse(ids.contains("working-in-tandem"));
    }

    @Test void temporaryCoreGainsAreAcquiredDeduplicatedAndExpireWithoutHidingSpentSkills() {
        SkillFactory factory = factory();
        Skill block = factory.forName("Block"), dodge = factory.forName("Dodge");
        RosterPlayer player = new RosterPlayer(); player.addSkill(block);
        player.addTemporarySkills("test", new HashSet<>(java.util.Arrays.asList(new SkillWithValue(block), new SkillWithValue(dodge))));
        SkillMarkerProjection projection = new SkillMarkerProjection(factory);
        JsonArray entries = projection.project(player).get("entries").asArray();
        assertEquals(2, entries.size());
        for (JsonValue value : entries) assertEquals("acquired", value.asObject().getString("origin", null));
        player.removeTemporarySkills("test");
        assertEquals(1, projection.project(player).get("entries").asArray().size());
        player.markUsed(block, new Game(null, new FactoryManager()));
        assertTrue(player.isUsed(block));
        assertEquals(1, projection.project(player).get("entries").asArray().size());
    }

    @Test void nativeRosterOriginAndNumericDetailsArePreservedSeparatelyFromMarkerIdentity() {
        SkillFactory factory = factory();
        Skill guard = factory.forName("Guard"), loner = factory.forName("Loner");
        RosterPosition position = mock(RosterPosition.class);
        when(position.hasSkill(guard)).thenReturn(true);
        RosterPlayer player = new RosterPlayer();
        player.updatePosition(position, false, null, 0);
        player.addSkill(guard); player.addSkill(loner);
        player.addTemporarySkills("improved-loner", java.util.Collections.singleton(new SkillWithValue(loner, "3")));
        JsonObject projection = new SkillMarkerProjection(factory).project(player);
        assertEquals("base", projection.get("entries").asArray().get(0).asObject().getString("origin", null));
        assertTrue(projection.get("details").toString().contains("Loner (3+)"));
        assertEquals("loner", projection.get("entries").asArray().get(1).asObject().getString("id", null));
    }

    @Test void newAndLegacyRecoveryRetainMarkerFactsWithoutChangingOldRecordedProjections() {
        SetupSessionMovementTest.Fixture fixture = new SetupSessionMovementTest.Fixture();
        JsonObject before = fixture.session.reply("load", "ACCEPTED", false, "home").get("state").asObject();
        SetupSession restored = new SetupSession(fixture.server, fixture.document, fixture.session.recoveryArtifact());
        assertEquals(before.get("players"), restored.reply("after", "ACCEPTED", false, "home").get("state").asObject().get("players"));
        // Historical public projections intentionally lack this optional field.
        JsonObject envelope = JsonObject.readFrom(fixture.session.recoveryArtifact());
        stripMarkers(envelope);
        // The checksum covers canonical payload bytes, as in the existing checkpoint fixtures.
        JsonObject payload = envelope.get("payload").asObject();
        envelope.set("sha256", checksum(payload.toString()));
        SetupSession legacy = new SetupSession(fixture.server, fixture.document, envelope.toString());
        JsonArray players = legacy.reply("legacy", "ACCEPTED", false, "home").get("state").asObject().get("players").asArray();
        for (JsonValue value : players) assertTrue(value.asObject().get("skillMarkers") != null);
    }

    private void stripMarkers(JsonValue value) {
        if (value.isObject()) {
            JsonObject object = value.asObject(); object.remove("skillMarkers");
            for (String name : object.names()) stripMarkers(object.get(name));
        } else if (value.isArray()) for (JsonValue item : value.asArray()) stripMarkers(item);
    }
    private String checksum(String text) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(); for (byte value : digest) hex.append(String.format("%02x", value & 255));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
