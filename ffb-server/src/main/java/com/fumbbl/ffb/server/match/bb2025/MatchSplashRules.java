package com.fumbbl.ffb.server.match.bb2025;

import com.fumbbl.ffb.Weather;
import com.fumbbl.ffb.kickoff.KickoffResult;

/** BB2025 rule labels and team attribution for committed splash events. */
public final class MatchSplashRules {
    public enum KickoffSide { KICKING, RECEIVING, NEUTRAL }
    public record KickoffPresentation(String code, KickoffSide side) { }

    public KickoffPresentation kickoffPresentation(KickoffResult result) {
        if (!(result instanceof com.fumbbl.ffb.kickoff.bb2025.KickoffResult kickoff))
            throw new IllegalArgumentException("Unsupported kickoff ruleset");
        KickoffSide side = switch (kickoff) {
            case HIGH_KICK, QUICK_SNAP -> KickoffSide.RECEIVING;
            case SOLID_DEFENCE, CHARGE -> KickoffSide.KICKING;
            default -> KickoffSide.NEUTRAL;
        };
        return new KickoffPresentation(kickoff.name(), side);
    }

    public String weatherReminder(Weather weather) {
        return switch (weather) {
            case SWELTERING_HEAT -> "D3 players from each team miss the next drive after this drive ends.";
            case VERY_SUNNY -> "−1 to Passing Ability tests.";
            case POURING_RAIN -> "−1 to pick up, catch and intercept.";
            case BLIZZARD -> "−1 to rush; only Quick and Short Passes.";
            case NICE -> "No additional weather effects.";
            case INTRO -> throw new IllegalArgumentException("Intro is not match weather");
        };
    }

    public boolean isChangingWeather(String code) {
        return com.fumbbl.ffb.kickoff.bb2025.KickoffResult.WEATHER_CHANGE.name().equals(code);
    }
}
