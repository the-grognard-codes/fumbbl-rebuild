package com.fumbbl.ffb.server;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType.Factory;
import com.fumbbl.ffb.FactoryType.FactoryContext;
import com.fumbbl.ffb.FantasyFootballException;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.server.commandline.InifileParamFilter;
import com.fumbbl.ffb.server.commandline.InifileParamFilterResult;
import com.fumbbl.ffb.server.db.JdbcRequestConnections;
import com.fumbbl.ffb.server.local.BrowserV2Runtime;
import com.fumbbl.ffb.server.local.BrowserV2TransportPolicy;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.util.rng.Fortuna;

import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;

import java.io.File;
import java.io.FileInputStream;
import java.util.Map;
import java.util.Properties;
/** Hosts V2 browser matches on a single engine worker. */
public class FantasyFootballServer implements IFactorySource {
	private final Properties properties;
	private final FactoryManager factoryManager = new FactoryManager();
	private final Map<Factory, INamedObjectFactory> factories;
	private DebugLog debugLog;
	private Fortuna fortuna;
	private ServerCommunication communication;
	private Server httpServer;
	private JdbcRequestConnections jdbcConnections;
	private boolean resourcesStopped;
	private boolean blockingNewGames;

	public FantasyFootballServer(ServerMode mode, Properties properties) {
		if (mode != ServerMode.STANDALONE) throw new IllegalArgumentException("Browser startup requires standalone mode");
		this.properties = properties;
		String selection = properties.getProperty("local.browser.v2.enabled", "true");
		if (!"true".equals(selection))
			throw new IllegalArgumentException("Browser V1 is retired; local.browser.v2.enabled must be omitted or true");
		factories = factoryManager.getFactoriesForContext(getContext(), this);
		for (INamedObjectFactory factory : factories.values()) factory.initialize(null);
	}

	public FactoryManager getFactoryManager() { return factoryManager; }
	public DebugLog getDebugLog() { return debugLog; }
	public void setDebugLog(DebugLog debugLog) { this.debugLog = debugLog; }
	public Fortuna getFortuna() { return fortuna; }
	public void setFortuna(Fortuna fortuna) { this.fortuna = fortuna; }
	public ServerCommunication getCommunication() { return communication; }
	public void setCommunication(ServerCommunication communication) { this.communication = communication; }
	public String getProperty(String name) { return properties.getProperty(name); }
	public String[] getPropertyKeys() { return properties.stringPropertyNames().toArray(new String[0]); }
	public Properties getProperties() { return properties; }
	public boolean isBlockingNewGames() { return blockingNewGames; }
	public void setBlockingNewGames(boolean blocking) { blockingNewGames = blocking; }

	public void run() throws Exception {
		jdbcConnections = new JdbcRequestConnections(getProperty(IServerProperty.DB_URL),
			getProperty(IServerProperty.DB_USER), getProperty(IServerProperty.DB_PASSWORD));
		File logFolder = new File(properties.getProperty(IServerProperty.SERVER_LOG_FOLDER, "logs"));
		if ((!logFolder.isDirectory() && !logFolder.mkdirs()) || !logFolder.canWrite())
			throw new IllegalArgumentException("Cannot write server log folder");
		String logFile = getProperty(IServerProperty.SERVER_LOG_FILE);
		debugLog = new DebugLog(this, logFile == null ? new File(logFolder, "browser-server.log") : new File(logFile), logFolder,
			Integer.parseInt(properties.getProperty(IServerProperty.SERVER_LOG_LEVEL, "1")));
		fortuna = new Fortuna();
		Class.forName(getProperty(IServerProperty.DB_DRIVER));
		communication = new ServerCommunication(this);
		new Thread(communication, "browser-engine").start();
		httpServer = new Server();
		ServerConnector connector = new ServerConnector(httpServer);
		connector.setPort(Integer.parseInt(getProperty(IServerProperty.SERVER_PORT)));
		connector.setHost(new BrowserV2TransportPolicy(getProperty("server.base"), getProperty("local.browser.v2.proxy.profile"))
			.bindHost(getProperty("local.transport.container.forwarding")));
		httpServer.addConnector(connector);
		ServletContextHandler context = new ServletContextHandler();
		context.setContextPath("/");
		JettyWebSocketServletContainerInitializer.configure(context, null);
		BrowserV2Runtime.mount(this, context, jdbcConnections);
		httpServer.setHandler(context);
		httpServer.start();
		System.err.println("Browser V2 running on port " + connector.getLocalPort());
	}

	public static void main(String[] arguments) throws Exception {
		InifileParamFilterResult filtered = new InifileParamFilter().filterForInifile(arguments);
		String[] remaining = filtered.getFilteredArgs();
		if (remaining.length > 0 && !(remaining.length == 1 && "standalone".equalsIgnoreCase(remaining[0])))
			throw new IllegalArgumentException("Usage: java -jar FantasyFootballServer.jar [-inifile path] [-override path]");
		Properties properties = new Properties();
		try (FileInputStream input = new FileInputStream(filtered.getIniFileName())) { properties.load(input); }
		if (filtered.getOverrideFileName() != null) {
			try (FileInputStream input = new FileInputStream(filtered.getOverrideFileName())) { properties.load(input); }
		}
		FantasyFootballServer server = new FantasyFootballServer(ServerMode.STANDALONE, properties);
		Runtime.getRuntime().addShutdownHook(new Thread(server::shutdownResources, "browser-server-shutdown"));
		try { server.run(); }
		catch (Exception failure) { server.shutdownResources(); throw failure; }
	}

	public void stop(int status) { shutdownResources(); System.exit(status); }

	/** Stop ingress and drain queued browser mutations before the process exits. */
	public synchronized void shutdownResources() {
		if (resourcesStopped) return;
		blockingNewGames = true;
		RuntimeException failure = null;
		try { if (httpServer != null) httpServer.stop(); }
		catch (Exception exception) { failure = new IllegalStateException("Cannot stop browser transport", exception); }
		boolean engineStopped = communication == null;
		try { if (communication != null) { communication.shutdown(); engineStopped = true; } }
		catch (RuntimeException exception) { if (failure == null) failure = exception; else failure.addSuppressed(exception); }
		// An undrained worker still needs socket deadlines. A later successful stop closes them.
		if (engineStopped && jdbcConnections != null) jdbcConnections.close();
		if (failure != null) throw failure;
		resourcesStopped = true;
		System.err.println("Browser server shut down; engine queue drained.");
	}

	@Override
	public FactoryContext getContext() {
		return FactoryContext.APPLICATION;
	}

	@SuppressWarnings("unchecked")
	@Override
	public <T extends INamedObjectFactory> T getFactory(Factory factory) {
		return (T) factories.get(factory);
	}

	@Override
	public void logError(long gameId, String message) {
		debugLog.log(IServerLogLevel.ERROR, gameId, message);
	}

	@Override
	public void logDebug(long gameId, String message) {
		debugLog.log(IServerLogLevel.DEBUG, gameId, message);
	}

	@Override
	public void logWithOutGameId(Throwable throwable) {
		debugLog.logWithOutGameId(throwable);
	}

	public IFactorySource getFactorySource() {
		return this;
	}

	@Override
	public IFactorySource forContext(FactoryContext context) {
		if (context == getContext()) {
			return this;
		}
		throw new FantasyFootballException("Trying to get game context from application.");
	}

	public boolean isInTestMode() {
		String testSetting = getProperty(IServerProperty.SERVER_TEST);
		return Boolean.parseBoolean(testSetting);
	}

	public void closeResources(long id) {
		debugLog.closeResources(id);
	}
}
