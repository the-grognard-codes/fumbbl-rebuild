package com.fumbbl.ffb.server.team.bb2025;

import com.fumbbl.ffb.server.local.BrowserTeamJson;
import com.fumbbl.ffb.server.team.SavedTeamJson;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TeamFormationsTest {
	private final TeamFormations service = new TeamFormations();

	@Test void approvedStarterFixtureIsSharedWithTheBrowserContract() throws Exception {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int number = 1; number <= 11; number++) players.add(new TeamDraft.Player("p" + number, number, number, "Player", "lineman", List.of()));
		JsonObject approved = JsonObject.readFrom(Files.readString(Path.of("..", "browser-client", "test", "fixtures", "starter-formations.json")));
		assertEquals(approved, service.encode(service.defaults(players)));
	}

	@Test void startersMapActualNumbersAndPreserveAllFourSuppliedLayouts() {
		TeamFormations.FormationSet templates = service.defaults(roster());
		assertEquals("5-4-2 Offense", templates.offense().getFirst().name());
		assertEquals("Chevron Defense", templates.defense().getFirst().name());
		assertEquals(List.of("5-4-2 Offense", "7-2-2 Offense"), templates.offense().stream().map(TeamFormations.Formation::name).toList());
		assertEquals(List.of("Chevron Defense", "Anchor Defense"), templates.defense().stream().map(TeamFormations.Formation::name).toList());
		assertEquals(7, templates.offense().get(1).players().stream().filter(player -> player.depth() == 0).count());
		assertEquals(new TeamFormations.Assignment(29, 2, 2), templates.defense().getFirst().players().stream()
			.filter(player -> player.jerseyNumber() == 29).findFirst().orElseThrow());
		assertEquals(5, templates.offense().getFirst().players().stream().filter(player -> player.depth() == 0).count());
		assertEquals(new TeamFormations.Assignment(20, 7, 0), templates.offense().getFirst().players().stream()
			.filter(player -> player.jerseyNumber() == 20).findFirst().orElseThrow());
		assertEquals(templates, service.decode(service.encode(templates)));
	}

	@Test void rejectsInvalidGeometryCountsNamesAndUnknownFields() {
		JsonObject valid = service.encode(service.defaults(roster()));
		for (String mutation : List.of("duplicateNumber", "duplicateSquare", "wideZone", "los", "outside", "count", "name", "extra", "group")) {
			JsonObject input = JsonObject.readFrom(valid.toString());
			JsonArray group = input.get("offense").asArray();
			JsonObject formation = group.get(0).asObject();
			JsonArray players = formation.get("players").asArray();
			switch (mutation) {
				case "duplicateNumber" -> players.get(0).asObject().set("jerseyNumber", players.get(1).asObject().get("jerseyNumber"));
				case "duplicateSquare" -> players.get(0).asObject().set("column", players.get(1).asObject().get("column"));
				case "wideZone" -> players.get(0).asObject().set("column", 0);
				case "los" -> { for (int index = 0; index < 3; index++) players.get(index).asObject().set("depth", 4); }
				case "outside" -> players.get(0).asObject().set("depth", 13);
				case "count" -> players.remove(0);
				case "name" -> formation.set("name", "<bad>");
				case "extra" -> formation.add("extra", true);
				case "group" -> { group.add(formation); group.add(formation); group.add(formation); }
				default -> throw new AssertionError();
			}
			assertThrows(IllegalArgumentException.class, () -> service.decode(input), mutation);
		}
	}

	@Test void draftRoundTripRetainsIntentionalEmptyAndMissingRosterReferences() {
		TeamDraft original = draft(null);
		SavedTeamJson json = new SavedTeamJson(new RosterCatalog());
		TeamDraft initialized = new BrowserTeamJson(new RosterCatalog()).decodeDraft(json.encodeDraft(original));
		assertEquals(service.defaults(roster()), initialized.formations);
		TeamDraft empty = draft(new TeamFormations.FormationSet(List.of(), List.of()));
		assertEquals(empty.formations, new BrowserTeamJson(new RosterCatalog()).decodeDraft(json.encodeDraft(empty)).effectiveFormations());
		List<TeamDraft.Player> changed = new ArrayList<>(roster()); changed.removeFirst();
		TeamDraft edited = new TeamDraft(2, "Team", RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET,
			null, changed, original.resources, null, initialized.formations);
		assertEquals(initialized.formations, new BrowserTeamJson(new RosterCatalog()).decodeDraft(json.encodeDraft(edited)).formations);
	}

	private TeamDraft draft(TeamFormations.FormationSet formations) {
		return new TeamDraft(2, "Team", RosterCatalog.VERSION, "BB2025", "human", RosterCatalog.PRESET, null, roster(),
			Map.of("rerolls", 0, "assistantCoaches", 0, "cheerleaders", 0, "apothecary", 0, "dedicatedFans", 0), null, formations);
	}
	private List<TeamDraft.Player> roster() {
		List<TeamDraft.Player> players = new ArrayList<>();
		for (int index = 10; index >= 0; index--) players.add(new TeamDraft.Player("p" + index, index + 1, index + 20, "Player", "lineman", List.of()));
		return players;
	}
}
