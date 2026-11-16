package com.fumbbl.ffb.server.step;

import java.util.List;

/** Technical stage allowance shared by native kick-off commands and their projections. */
public interface KickoffAdjustmentBudget {
    // Maintainer decision, ADR 0008 amended by #560; not a tabletop rules limit.
    int KICKOFF_ADJUSTMENT_LIMIT = 50;

    boolean kickoffAdjustmentsExhausted();

    void recordSelectionAdjustment();

    /** Participants that have completed placement or movement in the current event. */
    int completedParticipants();

    int allowedParticipants();

    List<String> selectedParticipantIds();

    /** Whether the current placement stage edits participants already on the pitch. */
    boolean usesPitchRedeployment();
}
