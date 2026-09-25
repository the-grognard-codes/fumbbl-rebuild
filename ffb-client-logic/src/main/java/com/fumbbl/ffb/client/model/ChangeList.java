package com.fumbbl.ffb.client.model;

import java.util.ArrayList;
import java.util.List;

public class ChangeList {

	public static final ChangeList INSTANCE = new ChangeList();
	private final List<VersionChangeList> versions = new ArrayList<>();

	public ChangeList() {
		versions.add(new VersionChangeList("3.4.0")
			.addImprovement("Browser matches show the authoritative DOM pitch with frozen-roster player art and readable fallback tokens")
			.addImprovement("Browser match preparation and live match now have separate routes, with direct-link and reconnect recovery")
			.addBugfix("Saved browser matches show resume requests correctly, recover their checkpoints, and keep spectators read-only")
			.addBugfix("Moles Under the Pitch team builder restores the roster workshop layout while saving server-validated account teams")
			.addFeature("Moles Under the Pitch team builder now saves validated Human teams to the signed-in account for match selection")
			.addImprovement("Browser game views reject unexpected private response fields and use You/Opponent coach labels with Home/Away for spectators")
			.addFeature("Browser players can mutually save an unfinished match and later mutually resume its compatible checkpoint")
			.addImprovement("Recoverable browser matches release completed engines after durable result commit while preserving exact request retries")
			.addImprovement("Recoverable browser games free idle resident capacity and reject new activation when retained checkpoint capacity is full")
			.addImprovement("Match MVP uses a consistent 64:56 player-to-square ratio, with native sprites on larger screens and proportional scaling at 1080p")
			.addImprovement("Match preview removes the temporary sizing slider and restores responsive sprite scaling while retaining stable fullscreen Fit")
			.addImprovement("Match preview keeps player artwork at native size while changing grid square size for visual comparison")
			.addImprovement("Match MVP adds a six-stop base square size slider and stabilizes Fit sizing in fullscreen and fractional viewport layouts")
			.addImprovement("Match MVP uses new Human and Orc chibi sprites and supports Space to confirm a previewed action without interfering with chat or dialogs")
			.addImprovement("PROD browser games use an environment-bound encrypted nginx connection with a private marker-6 runtime")
			.addImprovement("Match MVP preview adds illustrated team and resource icons, bundled fantasy typography, reference comparison and synchronized sidebar controls while preserving UI/UX Draft v2")
			.addImprovement("Match preview adds a right-side game log, local chat and End Turn controls with a reference-style team scoreboard")
			.addImprovement("DEV game service supports encrypted nginx connections with a private marker-6 runtime and preserved account identities")
			.addImprovement("Match preview adds a framed scoreboard, larger player silhouettes and a crowded formation for overlap testing")
			.addImprovement("Browser pitch preview targets 48px squares at 1080p with compact controls and a 40px fallback")
			.addImprovement("Click or tap a selected preview player again to clear selection and movement previews")
			.addFeature("Pitch interaction preview adds Human sprites, movement-risk overlays, route planning and explicit action commits")
			.addImprovement("Sample dugout players show stats, skills, injuries and match SPP on hover, focus or tap")
			.addImprovement("Pitch previews feature textured turf, stone sidelines and vertical team names in the end zones")
			.addImprovement("Pitch layout previews keep team rerolls, inducements and apothecary markers visible across screen sizes")
		.addBugfix("Browser match creators automatically enter play when their opponent starts the game")
		.addImprovement("New authenticated browser matches deploy the first eleven available roster players at setup, with three on the line and eight behind")
			.addFeature("Preview responsive browser pitches with full stadium, compact dugouts and mobile zoom layouts")
		.addImprovement("Local DEV browser game connections use an explicitly loopback-only nginx proxy")
		.addImprovement("Browser connections reject mixed environment settings and enforce local game host, path and origin boundaries")
		.addImprovement("Prepare a loopback-only DEV reverse-proxy handoff for encrypted browser game connections")
		.addImprovement("Add a guarded native DEV marker-6 launcher with separate storage and single-process ownership")
			.addImprovement("Authenticated browser players and spectators share one game view; match membership alone controls game decisions")
			.addFeature("Firebase Google and email-link sign-in opens private two-player browser sessions with presence and shared chat")
			.addFeature("New local browser matches can restore private engine checkpoints and reconcile committed requests after a server process restart")
			.addImprovement("Local browser server supports Java 21 and Jetty 12 with bounded transport recovery")
			.addBugfix("Local browser matches retain uncertain actions across reconnect and page reload, keep new actions locked until reconciliation, and link directly to final results")
			.addFeature("Complete local browser matches through touchdowns, halftime and full time, with saved results and private event replay")
			.addFeature("Local browser matches support passing, interceptions, hand-offs, fouls, throw team-mate, jumps and skill or injury choices, with searchable actions and reconnect recovery")
			.addFeature("Play local browser kickoff and core turns with server-issued movement, block, reroll and follow-up decisions")
			.addFeature("Activate prepared local matches with frozen teams, browser pre-match choices and legal setup through to kickoff readiness")
			.addFeature("Create and join local invited matches with owned saved teams, frozen rosters and durable participant roles")
			.addFeature("Local BB2025 Human starter team builder with a versioned catalog and server-computed costs and validation")
			.addFeature("Save, load, edit and import/export validated local teams with catalog status and conflicting-save protection")
			.addImprovement("Local browser prototype handles missing assets and renderer failures, and bounds connection traffic with reconnect recovery")
			.addFeature("Local browser Both Down fixtures with server-owned choices, reconnect recovery and safe choice retries")
			.addFeature("Local browser movement prototype with synchronized BB2025 fixture views and server-validated requests")
			.addFeature("Isolated local server profile with BB2025 fixture teams and container startup")
			.addBugfix("B&C: If stunned by a pitch invasion no injury was applied")
			.addBugfix("Wizard: Fireball did not affect prone or stunned players, and Fireball/Zap could not target own-team players in the 2025 ruleset")
			.addBugfix(
				"Bombardier: A team-mate avoiding the knock down with Steady Footing could cancel the turnover caused by other team-mates hit by the same bomb")
			.addBugfix("Joining a running game could leave a second ball icon on the pitch")
			.addImprovement("Player choice dialogs now grow with the number of listed players (up to 90% of the client height) instead of always showing at most 5 rows")
			.addBugfix("Tentacles: Being held did not end the player action, allowing the held player to still pass, hand off, foul or block")
			.addImprovement("Dialogs no longer react to key presses that were made before they popped up, e.g. while typing in the chat. The delay can be configured under Client Settings > Dialog Key Delay")
			.addImprovement("Active players can now show which action is being performed")
			.addBugfix("Krump and Smash: Was offered when Varag was blocked and the opposing player knocked themselves down")
			.addBugfix("Foul Appearance: Was rolled on the next move after being successfully shadowed by a player with Foul Appearance")
			.addBugfix("Stunty: Still applied a -1 modifier to interceptions for passes from stunty players")
			.addBugfix("Swarming: A double clicked end turn button during setup could skip the swarming setup")
			.addImprovement("Skipping a player choice dialog now asks for confirmation and reopens the dialog if the skip is not confirmed")
			.addBugfix("Diving Catch: Now follows NAF recommendation, active team gets first pick to choose catcher with DC (or without if a player is in the target square), then passive team, then default catch rules.")
			.addBugfix("On The Ball: Players on LoS could not use OtB during kick-off even if they were open")
			.addImprovement("Move paths sent by the client are sanitized to ensure a client does not send invalid move sequences")
			.addBugfix("Fan Interaction: Injury rolls of players pushed into the crowd or falling through a trap door applied injury modifiers like Mighty Blow of the player causing the push")
			.addBugfix("Swarming: A double clicked end turn button during setup could skip the swarming setup")
			.addBugfix("Chainsaw: Attacker down (skull or both down) when blocking a player with chainsaw did add chainsaw modifier to armour roll on attacker")
			.addBugfix("If the only available action was forgo activation, a foul action was started instead")
		);

		versions.add(new VersionChangeList("3.3.2")
			.addBugfix("Taunt: Was not available after POW results")
			.addBugfix("Bombardier: The bomber could be activated again when the bomb was caught or intercepted and thrown by another player")
		);

		versions.add(new VersionChangeList("3.3.1")
			.addBugfix("Hatred: Game hung on hovers on players with gained hatred only")
		);

		versions.add(new VersionChangeList("3.3.0")
			.addImprovement("Added scoreboard icons for the Cheering Fans offensive assist bonus")
			.addImprovement("Updated db connector to most current mariadb client")
			.addBugfix("Master Assassin: Re-rolled Stab armour breaks did not apply the resulting injury")
			.addBugfix("Selecting Fumblerooskie during a foul action could foul the active player instead")
			.addFeature("Infamous Staff - Josef Bugman")
			.addBugfix("Reset button could block hiring star players")
			.addBugfix("Emoji picker disappeared after switching between spectator and replay mode")
			.addFeature("Dwarfen Grit (Star Josef Bugman)")
			.addFeature("Optional client-side captions for spectator-triggered sounds")
			.addFeature("Added game option to disable underdog treasury spending on inducements")
			.addBugfix("Taunt was available while distracted")
			.addBugfix("Projectile Vomit did not end Blitz activation")
			.addFeature("Add game option to toggle grab vs sidestep on blitz behavior")
			.addBugfix("FA triggered after Quick Foul")
			.addBugfix("Using OtB vs G&G pass caused the game to crash if the passer moved on")
			.addImprovement("Used-player marking now shows a dedicated icon for the player who used the team's blitz action")
			.addBugfix("Self inflicted injuries never triggered Getting Even")
			.addBugfix("Star players incorrectly rolled for Getting Even")
			.addImprovement("Moved active cards into the inducements menu to reduce top-level menu width")
			.addImprovement("Added chat command to reset used skills for selected players")
			.addFeature("Added support for I'll Carry You (Stars Grak & Crumbleberry)")
			.addBugfix(
				"Special team re-rolls like Leader or Brilliant Coaching that were saved by Team Captain got converted to regular team re-rolls")
			.addBugfix("Mascot/Loner fail on DT dodge re-roll caused the game to lock up")
			.addBugfix("A manipulated client could submit an out-of-range pass that stalled the game")
			.addBugfix("Conceding in the 2025 ruleset did not let the winning coach assign the awarded touchdowns for SPP")
			.addImprovement(
				"Buying inducements now prompts before closing if petty cash remains that could still buy an inducement")
			.addBugfix(
				"Active team players ending up in the crowd (crowd push, throw team-mate, ball & chain and trap doors) always cause a turnover")
			.addBugfix(
				"Gained Hatred no longer counts as a skill advancement for the player level or the post-concession player loss check")
			.addFeature("Added game option to disable Getting Even")
			.addBugfix("Leader re-roll was granted when Leader player was fielded only for a subsequent drive of a half")
			.addBugfix("Jump up was rolled after Foul Appearance")
			.addBugfix("Foul Appearance fail on a blitz from prone (when target was adjacent) left the blitzing player prone")
			.addBugfix("Conceding teams did not lose their spp")
			.addImprovement("Player choice dialogs now display amount of selected and to be selected players")
			.addBugfix("Plague Ridden also worked for non-block casualties")
			.addBugfix(
				"Bombardier: If the original bomber was cassed by an intercepted bomb they were available for AtC at the end of drive and if successful did return to reserves")
			.addBugfix(
				"Bombardier: If the original bomber was cassed by an intercepted bomb the tooltip when hovering them in the dugout displayed the opponent team's turn number")
			.addBugfix("Steady Footing: Could be used by prone/stunned players when hit by bombs etc")
			.addBugfix("Chainsaw: Kickback always results in a knock down")
			.addBugfix("Replays with BT vs DT did not load in some cases")
			.addBugfix("TTM was only available for players with ST5 or more")
			.addBugfix("The Ballista: Re-rolls were not offered for TTM/KTM/Pass")
			.addBugfix(
				"Joining a collaborative replay already in progress did cause the joining client to hang after loading the initial state")
			.addBugfix("Cheering Fans assist was not granted to defensive team in case of a touchback")
			.addBugfix("Punt: A ball bouncing out off bounds did not cause a turnover")
			.addBugfix(
				"TTM: When double-clicking while picking up a team-mate the player could vanish upon landing/cancelling")
		);

		versions.add(new VersionChangeList("3.2.3")
			.addBugfix("Weather Mage effect only lasted until end of drive/opponents next turn")
			.addBugfix(
				"On Linux JVMs past 1.8 it was not possible to close the actions menu by clicking the active player again")
			.addBugfix(
				"Apply confusion flag if player is prone and fails the respective check (Bone Head, Really Stupid, Animal Savagery)")
			.addBugfix("Ball & Chain hit by bomb did roll for armour")
			.addBugfix("Dodgy Snack did not trigger auto marking update")
			.addBugfix("Multiblock did not generate spp")
			.addBugfix(
				"Punt: If direction or distance put the ball out of bounds re-rolling the result did not reset the ball being in bounds")
			.addBugfix("Blessing of Nuffle: Description text was incorrect")
			.addBugfix("With JVMs newer than 8, range rulers did not show the required roll anymore")
			.addBugfix("Gaining additional Hatred results in duplication of existing Hatred skill listings")
			.addBugfix("Bloodlust: When opting to move instead of fouling directly due to failed Bloodlust the game crashed")
			.addBugfix("Missing Zoat and Spite keywords caused Hatred/Getting Even to show Unknown")
		);

		versions.add(new VersionChangeList("3.2.2")
			.addBugfix("All prayer rolls resulted in Blessing of Nuffle")
		);

		versions.add(new VersionChangeList("3.2.1")
			.addBugfix("Disabling timeout button also disabled the turn timer")
			.addBugfix(
				"All ruleset: Touchback with only no ball players could result in the ball not being available for the drive")
			.addBehaviorChange(
				"All ruleset: In case of a touchback with no players or only no ball players placing the ball in a field does not bounce it anymore")
			.addBugfix("\"Did not stall\" message was displayed even if there was no potential stalling")
		);

		versions.add(new VersionChangeList("3.2.0")
			.addBugfix("Banned coach does not affect Brilliant Coaching roll")
			.addBugfix("Prevent staff and technical player types to be eligible to be raised")
			.addBugfix("Safe Pair of Hands did prevent turnovers")
			.addBugfix("Leap was not applied when combined with other positive modifiers like Very Long Legs and the " +
				"resulting modifier was lower than 2")
			.addBugfix("Player with Fend and Taunt was not able to use Taunt")
			.addBugfix("Fumbled KTM did not apply stunty to injury roll")
			.addBugfix("Give and Go did not trigger when a bomb was intercepted/caught")
			.addFeature("Wisdom of the White Dwarf (Star Grombrindal)")
			.addImprovement("Set antialiasing for non-menu text components (mainly affecting Linux environments")
			.addBugfix("Player Markings for 2020 skills caused false positives in 2025 games")
			.addBugfix("Blessing of Nuffle was not applied randomly (and still used the old name)")
			.addBugfix("Thinking Man's Troll could not be used on regeneration re-rolls")
			.addBugfix("Kaboom! did not work on bouncing bomb")
			.addBugfix("Fumblerooski was not reverted when player was held in place by tentacles")
			.addBugfix("Arm Bar against non-dodge players caused a second re-roll option in case of a failed dodge")
			.addFeature("Added game option to turn off timeouts")
			.addBugfix("Timeout did not work for first turn of a drive")
		);

		versions.add(new VersionChangeList("3.1.2")
			.addBugfix("B&C could perform Multi Block if skill was present")
			.addImprovement("Reword B&C knock out message")
			.addBugfix("B&C self cas did not generate spp")
			.addBugfix("For underdog teams with less than 50k treasury the report used treasury was reported incorrectly")
			.addBugfix("Foul Appearance triggered for the first move after blitzing a player with that skill")
			.addBugfix("Monstrous Mouth: On both downs chomp states were not always removed properly")
			.addBugfix("Leader re-roll was not restored if player returned to pitch after KO or surf")
			.addBugfix("Using Safe Pair Of Hands with Wrestle on ball carrier did not prevent turnover")
			.addBehaviorChange("Fallback checkbox for team re-roll on mascot use is now pre-selected")
			.addBugfix("Diving Catch did not trigger for kick-offs")
			.addImprovement(
				"Message about preventing Strip Ball (Stand Firm, Rooted, Chomped) is only shown if player is actually carrying the ball")
			.addBugfix("Lone Fouler did not work for Chainsaw fouls")
			.addBugfix("TTM landing on the ball did allow a pick up")
			.addBugfix("It was possible to move players on the pitch during mvp selection")
			.addBugfix("Brilliant coaching message reported a tie when rolls were equal but ignored modifiers")
			.addImprovement("Technical: Game results are now also loaded from backups if game is not in cache anymore")
			.addBugfix("Eye Gouge: In addition to not assisting, gouged players did also not cancel opposing assist")
			.addBugfix("Steady Footing was triggered for prone/stunned players being hit by Ball&Chain")
			.addBugfix("Knocking down team-mates on TTM/KTM did not cause turnovers")
			.addBugfix("Chomp was not available on blitz during Charge!")
			.addBugfix("Target selection was not always removed after a blitz")
			.addBugfix("When using swoop it is now possible to re-roll direction and distance")
			.addBugfix("Bomb knock down team-mates did not cause a turnover")
			.addBugfix("Interception rolls where not modified per tacklezone but only by one for being marked")
			.addBugfix("Prayers were not added to inducement count")
			.addBugfix(
				"When a Steady Footing player blitzed the ball carrier with a both down (both no block) and got saved by Steady Footing the ball did not bounce")
			.addBugfix("Interception SPP were not awarded")
		);

		versions.add(new VersionChangeList("3.1.1")
			.addBugfix("Reloading during kick off sequence was broken")
			.addBugfix("Steady Footing after being pushed on ball did not bounce the ball")
			.addBugfix("Hypnotic Gaze triggers Foul Appearance")
			.addBugfix("Black Ink and Zoat Gaze are only available if non-distracted players are in range")
			.addBugfix("Punt was not available when rushes were exhausted")
			.addBugfix("High Kick with no open players did not skip sequence")
			.addImprovement("Skip Pick Me Up in last turn of half")
			.addBugfix(
				"When Mascot re-roll was available without a team re-roll regular re-roll dialog did not react to mascot button and block dialog did not offer mascot")
			.addBugfix("Sprint was not considered when calculating blitz range")
		);

		versions.add(new VersionChangeList("3.1.0")
			.addBugfix("Stalling: No stalling did not grant cash bonus")
			.addImprovement("Stalling: On turn 7+ do not roll for stalling")
			.addBugfix("Do not offer Forgo for prone players")
			.addBugfix("Jump: Declining re-roll granted a free re-roll")
			.addBugfix("Hypnotic Gaze: rushing twice would end activation before selecting the target")
			.addBugfix("Brilliant Coaching: Tied result did give no re-roll to either team")
			.addImprovement("iron Man: Only players with AV 10+ or less are eligible")
			.addBugfix("Under Scrutiny: Only triggers for av breaks")
			.addBugfix("Strip Ball: no longer works against Stand Firm/Rooted players")
			.addBugfix("Master Chef was rolled twice also stealing Leader re-rolls")
			.addBugfix("Selected kick-off results for overtime did not work")
			.addBugfix(
				"Steady Footing: Attacker blocks defender with both down, defender uses Steady Footing Successfully while attacker fell down, did not cause a turnover")
			.addImprovement("TTM and KTM: reroll choice for Subpar results")
			.addBugfix("Solid Defence: During player selection it was able to move players around")
			.addBugfix("Permanent injuries were not removed by regeneration")
			.addBugfix("Charge: During kickoff blitz, Dodge and Rush skill re-rolls were not available")
			.addBugfix(
				"Hypnotic Gaze + Bloodlust: prone players now can move/feed after failed Bloodlust instead of auto-gazing and ending activation")
			.addBugfix("Fixed wording for \"Under Scrutiny\"")
			.addImprovement("Add strip ball cancel message")
			.addBugfix("Chomped state was not removed if chomper blocked chompee and rolled a skull")
			.addFeature("Implement concession rules")
			.addBugfix("Dauntless has to be handled before horns")
			.addBugfix("Support multiple cheering fans assist per team")
			.addBugfix("Ensure only players in reserves can be selected for prayers")
			.addFeature("Support icon set index for player icons")
		);

		versions.add(new VersionChangeList("3.0.0")
			.setDescription("First version of 2025 rules, a.k.a. 3rd Season - beware of bugs"));
	}

	public List<VersionChangeList> getVersions() {
		return versions;
	}

	public String fingerPrint() {
		return String.valueOf(versions.get(0).hashCode());
	}
}
