package com.fumbbl.ffb.server.team.bb2025;

import com.fumbbl.ffb.SkillCategory;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Stable IDs and source categories for the BB2025 core Skills & Traits table. */
public final class SkillDefinitions {
	private static final Map<String, Definition> ALL;

	static {
		Map<String, Definition> data = new LinkedHashMap<>();
		add(data, "catch", "Catch", SkillCategory.AGILITY, false);
		add(data, "diving-catch", "Diving Catch", SkillCategory.AGILITY, false);
		add(data, "diving-tackle", "Diving Tackle", SkillCategory.AGILITY, false);
		add(data, "dodge", "Dodge", SkillCategory.AGILITY, true);
		add(data, "defensive", "Defensive", SkillCategory.AGILITY, false);
		add(data, "hit-and-run", "Hit And Run", SkillCategory.AGILITY, false);
		add(data, "jump-up", "Jump Up", SkillCategory.AGILITY, false);
		add(data, "leap", "Leap", SkillCategory.AGILITY, false);
		add(data, "safe-pair-of-hands", "Safe Pair Of Hands", SkillCategory.AGILITY, false);
		add(data, "sidestep", "Sidestep", SkillCategory.AGILITY, false);
		add(data, "sprint", "Sprint", SkillCategory.AGILITY, false);
		add(data, "sure-feet", "Sure Feet", SkillCategory.AGILITY, false);
		add(data, "dirty-player", "Dirty Player", SkillCategory.DEVIOUS, false);
		add(data, "eye-gouge", "Eye Gouge", SkillCategory.DEVIOUS, false);
		add(data, "fumblerooski", "Fumblerooski", SkillCategory.DEVIOUS, false);
		add(data, "lethal-flight", "Lethal Flight", SkillCategory.DEVIOUS, false);
		add(data, "lone-fouler", "Lone Fouler", SkillCategory.DEVIOUS, false);
		add(data, "pile-driver", "Pile Driver", SkillCategory.DEVIOUS, false);
		add(data, "put-the-boot-in", "Put the Boot In", SkillCategory.DEVIOUS, false);
		add(data, "quick-foul", "Quick Foul", SkillCategory.DEVIOUS, false);
		add(data, "saboteur", "Saboteur", SkillCategory.DEVIOUS, false);
		add(data, "shadowing", "Shadowing", SkillCategory.DEVIOUS, false);
		add(data, "sneaky-git", "Sneaky Git", SkillCategory.DEVIOUS, false);
		add(data, "violent-innovator", "Violent Innovator", SkillCategory.DEVIOUS, false);
		add(data, "block", "Block", SkillCategory.GENERAL, true);
		add(data, "dauntless", "Dauntless", SkillCategory.GENERAL, false);
		add(data, "fend", "Fend", SkillCategory.GENERAL, false);
		add(data, "frenzy", "Frenzy", SkillCategory.GENERAL, false);
		add(data, "kick", "Kick", SkillCategory.GENERAL, false);
		add(data, "pro", "Pro", SkillCategory.GENERAL, false);
		add(data, "steady-footing", "Steady Footing", SkillCategory.GENERAL, false);
		add(data, "strip-ball", "Strip Ball", SkillCategory.GENERAL, false);
		add(data, "sure-hands", "Sure Hands", SkillCategory.GENERAL, false);
		add(data, "tackle", "Tackle", SkillCategory.GENERAL, false);
		add(data, "taunt", "Taunt", SkillCategory.GENERAL, false);
		add(data, "wrestle", "Wrestle", SkillCategory.GENERAL, false);
		add(data, "big-hand", "Big Hand", SkillCategory.MUTATION, false);
		add(data, "claws", "Claws", SkillCategory.MUTATION, false);
		add(data, "disturbing-presence", "Disturbing Presence", SkillCategory.MUTATION, false);
		add(data, "extra-arms", "Extra Arms", SkillCategory.MUTATION, false);
		add(data, "foul-appearance", "Foul Appearance", SkillCategory.MUTATION, false);
		add(data, "horns", "Horns", SkillCategory.MUTATION, false);
		add(data, "iron-hard-skin", "Iron Hard Skin", SkillCategory.MUTATION, false);
		add(data, "monstrous-mouth", "Monstrous Mouth", SkillCategory.MUTATION, false);
		add(data, "prehensile-tail", "Prehensile Tail", SkillCategory.MUTATION, false);
		add(data, "tentacles", "Tentacles", SkillCategory.MUTATION, false);
		add(data, "two-heads", "Two Heads", SkillCategory.MUTATION, false);
		add(data, "very-long-legs", "Very Long Legs", SkillCategory.MUTATION, false);
		add(data, "accurate", "Accurate", SkillCategory.PASSING, false);
		add(data, "cannoneer", "Cannoneer", SkillCategory.PASSING, false);
		add(data, "cloud-burster", "Cloud Burster", SkillCategory.PASSING, false);
		add(data, "dump-off", "Dump-Off", SkillCategory.PASSING, false);
		add(data, "give-and-go", "Give and Go", SkillCategory.PASSING, false);
		add(data, "hail-mary-pass", "Hail Mary Pass", SkillCategory.PASSING, false);
		add(data, "leader", "Leader", SkillCategory.PASSING, false);
		add(data, "nerves-of-steel", "Nerves of Steel", SkillCategory.PASSING, false);
		add(data, "on-the-ball", "On The Ball", SkillCategory.PASSING, false);
		add(data, "pass", "Pass", SkillCategory.PASSING, false);
		add(data, "punt", "Punt", SkillCategory.PASSING, false);
		add(data, "safe-pass", "Safe Pass", SkillCategory.PASSING, false);
		add(data, "arm-bar", "Arm Bar", SkillCategory.STRENGTH, false);
		add(data, "brawler", "Brawler", SkillCategory.STRENGTH, false);
		add(data, "break-tackle", "Break Tackle", SkillCategory.STRENGTH, false);
		add(data, "bullseye", "Bullseye", SkillCategory.STRENGTH, false);
		add(data, "grab", "Grab", SkillCategory.STRENGTH, false);
		add(data, "guard", "Guard", SkillCategory.STRENGTH, true);
		add(data, "juggernaut", "Juggernaut", SkillCategory.STRENGTH, false);
		add(data, "mighty-blow", "Mighty Blow", SkillCategory.STRENGTH, true);
		add(data, "multiple-block", "Multiple Block", SkillCategory.STRENGTH, false);
		add(data, "stand-firm", "Stand Firm", SkillCategory.STRENGTH, false);
		add(data, "strong-arm", "Strong Arm", SkillCategory.STRENGTH, false);
		add(data, "thick-skull", "Thick Skull", SkillCategory.STRENGTH, false);
		add(data, "always-hungry", "Always Hungry", SkillCategory.TRAIT, false);
		add(data, "animal-savagery", "Animal Savagery", SkillCategory.TRAIT, false);
		add(data, "animosity", "Animosity", SkillCategory.TRAIT, false);
		add(data, "ball-and-chain", "Ball and Chain", SkillCategory.TRAIT, false);
		add(data, "bloodlust", "Bloodlust", SkillCategory.TRAIT, false);
		add(data, "bombardier", "Bombardier", SkillCategory.TRAIT, false);
		add(data, "bone-head", "Bone Head", SkillCategory.TRAIT, false);
		add(data, "breathe-fire", "Breathe Fire", SkillCategory.TRAIT, false);
		add(data, "chainsaw", "Chainsaw", SkillCategory.TRAIT, false);
		add(data, "decay", "Decay", SkillCategory.TRAIT, false);
		add(data, "drunkard", "Drunkard", SkillCategory.TRAIT, false);
		add(data, "hatred", "Hatred", SkillCategory.TRAIT, false);
		add(data, "hypnotic-gaze", "Hypnotic Gaze", SkillCategory.TRAIT, false);
		add(data, "insignificant", "Insignificant", SkillCategory.TRAIT, false);
		add(data, "kick-team-mate", "Kick Team-Mate", SkillCategory.TRAIT, false);
		add(data, "loner", "Loner", SkillCategory.TRAIT, false);
		add(data, "my-ball", "My Ball", SkillCategory.TRAIT, false);
		add(data, "no-ball", "No Ball", SkillCategory.TRAIT, false);
		add(data, "pick-me-up", "Pick-me-up", SkillCategory.TRAIT, false);
		add(data, "plague-ridden", "Plague Ridden", SkillCategory.TRAIT, false);
		add(data, "pogo", "Pogo", SkillCategory.TRAIT, false);
		add(data, "projectile-vomit", "Projectile Vomit", SkillCategory.TRAIT, false);
		add(data, "really-stupid", "Really Stupid", SkillCategory.TRAIT, false);
		add(data, "regeneration", "Regeneration", SkillCategory.TRAIT, false);
		add(data, "right-stuff", "Right Stuff", SkillCategory.TRAIT, false);
		add(data, "secret-weapon", "Secret Weapon", SkillCategory.TRAIT, false);
		add(data, "stab", "Stab", SkillCategory.TRAIT, false);
		add(data, "stunty", "Stunty", SkillCategory.TRAIT, false);
		add(data, "swoop", "Swoop", SkillCategory.TRAIT, false);
		add(data, "take-root", "Take Root", SkillCategory.TRAIT, false);
		add(data, "throw-team-mate", "Throw Team-Mate", SkillCategory.TRAIT, false);
		add(data, "timmm-ber", "Timmm-ber!", SkillCategory.TRAIT, false);
		add(data, "titchy", "Titchy", SkillCategory.TRAIT, false);
		add(data, "trickster", "Trickster", SkillCategory.TRAIT, false);
		add(data, "unchannelled-fury", "Unchannelled Fury", SkillCategory.TRAIT, false);
		add(data, "unsteady", "Unsteady", SkillCategory.TRAIT, false);
		ALL = Collections.unmodifiableMap(data);
	}

	private SkillDefinitions() { }

	private static void add(Map<String, Definition> data, String id, String name, SkillCategory category, boolean elite) {
		if (data.put(id, new Definition(id, name, category, elite)) != null) {
			throw new IllegalStateException("Duplicate BB2025 skill identifier: " + id);
		}
	}

	public static Map<String, Definition> all() { return ALL; }
	public static Definition forId(String id) { return ALL.get(id); }

	public static final class Definition {
		public final String id, name;
		public final SkillCategory category;
		public final boolean elite;
		private Definition(String id, String name, SkillCategory category, boolean elite) {
			this.id = id; this.name = name; this.category = category; this.elite = elite;
		}
	}
}
