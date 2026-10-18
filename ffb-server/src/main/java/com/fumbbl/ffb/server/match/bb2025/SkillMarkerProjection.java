package com.fumbbl.ffb.server.match.bb2025;

import com.fumbbl.ffb.factory.SkillFactory;
import com.fumbbl.ffb.model.Player;
import com.fumbbl.ffb.model.skill.Skill;
import com.fumbbl.ffb.model.skill.SkillDisplayInfo;
import com.fumbbl.ffb.server.team.bb2025.SkillDefinitions;

import com.eclipsesource.json.JsonArray;
import com.eclipsesource.json.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/** Public presentation facts only. Core identity is resolved by the selected native factory. */
public final class SkillMarkerProjection {
    private final Map<Skill, SkillDefinitions.Definition> definitions = new HashMap<>();

    public SkillMarkerProjection(SkillFactory factory) {
        for (SkillDefinitions.Definition definition : SkillDefinitions.all().values()) {
            Skill skill = factory.forName(definition.name);
            if (skill != null) definitions.put(skill, definition);
        }
    }

    public JsonObject project(Player<?> player) {
        JsonArray entries = new JsonArray(), details = new JsonArray();
        List<Skill> skills = new ArrayList<>(player.getSkillsIncludingTemporaryOnes());
        Collections.sort(skills, (first, second) -> first.getName().compareTo(second.getName()));
        TreeSet<String> descriptions = new TreeSet<>();
        for (SkillDisplayInfo info : player.skillInfos()) descriptions.add(info.getInfo());
        for (Skill skill : skills) {
            // Keep unique star abilities and parameterless traits in the card even
            // if a specialized evaluator does not produce a display value.
            if (descriptions.stream().noneMatch(text -> text.equals(skill.getName()) || text.startsWith(skill.getName() + " (")))
                descriptions.add(skill.getName());
            SkillDefinitions.Definition definition = definitions.get(skill);
            if (definition == null) continue;
            entries.add(new JsonObject().add("id", definition.id).add("category", definition.category.name())
                .add("origin", player.getPosition().hasSkill(skill) ? "base" : "acquired"));
        }
        for (String description : descriptions) details.add(description);
        return new JsonObject().add("version", 1).add("entries", entries).add("details", details);
    }
}
