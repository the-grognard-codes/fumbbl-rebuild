package com.fumbbl.ffb.server.local;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Properties;

/** Operator-only startup diagnosis: exception classes/frames, never messages or values. */
public final class NativeDevProbe {
    public static void main(String[] args) throws Exception {
        Properties properties = new Properties();
        try (java.io.InputStream input = Files.newInputStream(Paths.get("/etc/moles-game-v2-dev/server.properties"))) {
            properties.load(input);
        }
        try {
            java.lang.reflect.Method start = NativeMarker6ServerMain.class.getDeclaredMethod("start", Properties.class);
            start.setAccessible(true);
            // Use the real entry point's directory validation and exclusive runtime lock.
            start.invoke(new NativeMarker6ServerMain(), properties);
        } catch (Exception failure) {
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                System.err.println(cause.getClass().getName());
                for (StackTraceElement frame : cause.getStackTrace()) {
                    if (frame.getClassName().startsWith("com.fumbbl") || frame.getClassName().startsWith("com.google"))
                        System.err.println(frame.getClassName() + "." + frame.getMethodName() + ":" + frame.getLineNumber());
                }
            }
            System.exit(1);
        }
    }
}
