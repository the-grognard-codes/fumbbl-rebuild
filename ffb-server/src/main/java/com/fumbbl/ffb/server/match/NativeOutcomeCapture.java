package com.fumbbl.ffb.server.match;

import com.eclipsesource.json.JsonObject;
import com.fumbbl.ffb.net.commands.ServerCommand;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.server.GameLog;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Captures the home-oriented public native report/model stream since a durable command cursor. */
final class NativeOutcomeCapture {
    Capture since(GameLog log, int afterCommandNr) { return since(log, afterCommandNr, null); }

    Capture since(GameLog log, int afterCommandNr, NativeRollPresentation presentation) {
        if (log == null || afterCommandNr < 0) throw new IllegalArgumentException("Invalid native command cursor");
        List<ServerCommand> pending = new ArrayList<>();
        int lastCommandNr = afterCommandNr;
        for (ServerCommand command : log.getServerCommands()) {
            int number = command.getCommandNr();
            if (number <= 0) {
                if (command instanceof ServerCommandModelSync) throw new IllegalStateException("Unnumbered native model sync");
                continue;
            }
            if (number <= afterCommandNr) continue;
            lastCommandNr = Math.max(lastCommandNr, number);
            if (command instanceof ServerCommandModelSync) pending.add(command);
        }
        pending.sort(Comparator.comparingInt(ServerCommand::getCommandNr));
        List<JsonObject> publicSyncs = new ArrayList<>(pending.size());
        int previous = afterCommandNr;
        for (ServerCommand command : pending) {
            if (command.getCommandNr() <= previous) throw new IllegalStateException("Duplicate native model sync");
            JsonObject publicSync = command.toJsonValue().asObject();
            if (presentation != null) presentation.decorate((ServerCommandModelSync) command, publicSync);
            publicSyncs.add(publicSync);
            previous = command.getCommandNr();
        }
        return new Capture(lastCommandNr, Collections.unmodifiableList(publicSyncs));
    }

    static final class Capture {
        final int lastCommandNr;
        final List<JsonObject> modelSyncs;
        Capture(int lastCommandNr, List<JsonObject> modelSyncs) {
            this.lastCommandNr = lastCommandNr;
            this.modelSyncs = modelSyncs;
        }
    }
}
