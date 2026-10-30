package com.fumbbl.ffb.test;

import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.server.GameState;
import com.fumbbl.ffb.server.match.SetupSession;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
/** Keeps injected engine fixtures on the same presentation-observer path as a real session. */
final class SetupSessionFixtureState extends GameState {
    private Object blockPresentation;
    private Method observeBlockSync;

    SetupSessionFixtureState() throws IOException {
        super(new TestServer().getServer());
    }



    void attachTo(SetupSession session) throws ReflectiveOperationException {
        Field presentation = SetupSession.class.getDeclaredField("blockPresentation");
        presentation.setAccessible(true);
        blockPresentation = presentation.get(session);
        observeBlockSync = blockPresentation.getClass().getDeclaredMethod("observe", GameState.class, ServerCommandModelSync.class);
        observeBlockSync.setAccessible(true);
        Field engine = SetupSession.class.getDeclaredField("state");
        engine.setAccessible(true);
        engine.set(session, this);
    }

    @Override public void observeModelSync(ServerCommandModelSync sync) {
        if (blockPresentation == null) return;
        try {
            observeBlockSync.invoke(blockPresentation, this, sync);
        } catch (IllegalAccessException | InvocationTargetException failure) {
            throw new IllegalStateException("Cannot observe fixture block presentation", failure);
        }
    }
}
