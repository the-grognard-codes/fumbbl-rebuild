package com.fumbbl.ffb.server;

import com.fumbbl.ffb.FactoryManager;
import com.fumbbl.ffb.FactoryType.Factory;
import com.fumbbl.ffb.FactoryType.FactoryContext;
import com.fumbbl.ffb.FantasyFootballException;
import com.fumbbl.ffb.factory.IFactorySource;
import com.fumbbl.ffb.factory.INamedObjectFactory;
import com.fumbbl.ffb.server.commandline.InifileParamFilter;
import com.fumbbl.ffb.server.commandline.InifileParamFilterResult;
import com.fumbbl.ffb.server.local.BrowserMatchAdapter;
import com.fumbbl.ffb.server.local.BrowserMatchServlet;
import com.fumbbl.ffb.server.local.BrowserSavedTeamJson;
import com.fumbbl.ffb.server.local.BrowserV2Runtime;
import com.fumbbl.ffb.server.local.BrowserV2TransportPolicy;
import com.fumbbl.ffb.server.match.JdbcMatchRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.net.ServerCommunication;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;
import com.fumbbl.ffb.server.util.rng.Fortuna;

import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.servlet.ServletHolder;
import org.eclipse.jetty.ee8.websocket.server.config.JettyWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;

import java.io.File;
import java.io.FileInputStream;
import java.sql.DriverManager;
import java.util.Map;
import java.util.Properties;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
/** Hosts browser matches on a single engine worker. V1 is explicit local diagnostics only. */
public class FantasyFootballServer implements IFactorySource {
	private final Properties properties;
	private final FactoryManager factoryManager = new FactoryManager();
	private final Map<Factory, INamedObjectFactory> factories;
	private DebugLog debugLog;
	private Fortuna fortuna;
	private ServerCommunication communication;
	private Server httpServer;
	private boolean resourcesStopped;
	private boolean blockingNewGames;

	public FantasyFootballServer(ServerMode mode, Properties properties) {
		if (mode != ServerMode.STANDALONE) throw new IllegalArgumentException("Browser startup requires standalone mode");
		this.properties = properties;
		String selection = properties.getProperty("local.browser.v2.enabled", "true");
		if (!"true".equals(selection) && !"false".equals(selection))
			throw new IllegalArgumentException("Browser V2 selection must be true or false");
		if (!isBrowserV2() && !Boolean.parseBoolean(properties.getProperty("server.local")))
			throw new IllegalArgumentException("V1 diagnostics require explicit local mode");
		factories = factoryManager.getFactoriesForContext(getContext(), this);
		for (INamedObjectFactory factory : factories.values()) factory.initialize(null);
	}

	public boolean isBrowserV2() { return Boolean.parseBoolean(properties.getProperty("local.browser.v2.enabled", "true")); }
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
		if (isBrowserV2()) {
			BrowserV2Runtime.mount(this, context, this::openConnection);
		} else {
			mountDiagnostics(context);
		}
		httpServer.setHandler(context);
		httpServer.start();
		System.err.println("Browser " + (isBrowserV2() ? "V2" : "V1 diagnostics") + " running on port " + connector.getLocalPort());
	}

	private java.sql.Connection openConnection() throws java.sql.SQLException {
		return DriverManager.getConnection(getProperty(IServerProperty.DB_URL), getProperty(IServerProperty.DB_USER),
			getProperty(IServerProperty.DB_PASSWORD));
	}

	private void mountDiagnostics(ServletContextHandler context) {
		BrowserMatchAdapter adapter = new BrowserMatchAdapter(this, getProperty("local.browser.home.token"),
			getProperty("local.browser.away.token"), BrowserMatchAdapter.Fixture.valueOf(properties.getProperty("local.browser.fixture", "MOVEMENT")));
		RosterCatalog catalog = new RosterCatalog();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(this::openConnection), catalog);
		adapter.setSavedTeams(new BrowserSavedTeamJson(teams));
		adapter.setPreparedMatches(new MatchService(new JdbcMatchRepository(this::openConnection), teams, catalog),
			new JdbcRecoveryRepository(this::openConnection));
		context.addServlet(new ServletHolder(new BrowserMatchServlet(this, adapter)), "/browser/v1/*");
		context.addServlet(new ServletHolder(new HttpServlet() {
			@Override protected void service(HttpServletRequest request, HttpServletResponse response) { response.setStatus(404); }
		}), "/*");
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
		try { if (communication != null) communication.shutdown(); }
		catch (RuntimeException exception) { if (failure == null) failure = exception; else failure.addSuppressed(exception); }
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
