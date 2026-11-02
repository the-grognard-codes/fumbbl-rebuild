package com.fumbbl.ffb.server.match;

import com.fumbbl.ffb.FieldCoordinate;
import com.fumbbl.ffb.net.commands.ClientCommandFieldCoordinate;

/** A local direction choice committed together with entering native Punt targeting. */
final class PuntDirectionCommand extends ClientCommandFieldCoordinate {
    final FieldCoordinate canonicalTarget;

    PuntDirectionCommand(FieldCoordinate target, String role) {
        super("home".equals(role) ? target : target.transform());
        canonicalTarget = target;
    }
}
