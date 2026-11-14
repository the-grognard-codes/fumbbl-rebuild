package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.db.JdbcConnections;
import com.fumbbl.ffb.server.match.ComputerOpponentService;
import com.fumbbl.ffb.server.match.FirebaseV2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;
import com.fumbbl.ffb.server.match.JdbcMatchRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.JdbcV2PrincipalDirectory;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.skilluse.JdbcSkillUsePreferenceRepository;
import com.fumbbl.ffb.server.skilluse.SkillUsePreferenceService;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.servlet.ServletHolder;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;

/** The v2 host serves the authenticated game endpoint and a local health probe. */
public final class BrowserV2Runtime {
	public static void mount(FantasyFootballServer server, ServletContextHandler context,
		JdbcConnections connections) throws SQLException {
		try (Connection connection = connections.open()) { new Marker6Schema().verify(connection); }
		String project = server.getProperty("local.browser.v2.firebase.project");
		BrowserV2TransportPolicy policy = new BrowserV2TransportPolicy(server.getProperty("server.base"), server.getProperty("local.browser.v2.proxy.profile"));
		if (!policy.firebaseProject().equals(project) || System.getenv("FIREBASE_AUTH_EMULATOR_HOST") != null)
			throw new IllegalArgumentException("Firebase project must match the fixed transport profile");
		Clock clock = Clock.systemUTC();
		RosterCatalog catalog = new RosterCatalog();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		MatchService matches = new MatchService(new JdbcMatchRepository(connections::open), teams, catalog);
		// New activations use r4.1 checkpoints. Existing r2.2/r2.3 checkpoints restore under their recorded runtime.
		SetupApplication setup = new SetupApplication(server, matches, new JdbcRecoveryRepository(connections::open, true), true, true);
		setup.configureStorageAdmission(connections::requireAvailable);
		SkillUsePreferenceService skillUsePreferences = new SkillUsePreferenceService(
			new JdbcSkillUsePreferenceRepository(connections::open), new JdbcMatchMembershipRepository(connections::open));
		setup.configureSkillUsePreferences(skillUsePreferences);
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections::open, clock);
		FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(project, directory);
		context.addEventListener(new ServletContextListener() {
			@Override public void contextDestroyed(ServletContextEvent event) {
				try { verifier.close(); } catch (Exception failure) { throw new IllegalStateException("Firebase transport cleanup failed", failure); }
			}
		});
		V2MatchAccess access = new V2MatchAccess(new JdbcMatchMembershipRepository(connections::open), verifier.liveDirectory(), clock);
		String computerTokenHash = server.getProperty("local.browser.v2.computer.token.sha256");
		if (computerTokenHash == null || computerTokenHash.isEmpty())
			computerTokenHash = System.getenv("FFB_COMPUTER_SERVICE_TOKEN_SHA256");
		ComputerOpponentService computers = new ComputerOpponentService(computerTokenHash);
		BrowserV2Adapter adapter = new BrowserV2Adapter(verifier, access,
			setup, matches, new V2PreparationService(connections::open, teams, catalog, clock, computers),
			new BrowserSavedTeamJson(teams, true), computers);
		adapter.configureSkillUsePreferences(skillUsePreferences);
		adapter.configureDiagnostics(policy.diagnosticsAllowed());
		mountRoutes(context, server, adapter);
	}

	/** The isolated v2 route surface intentionally exposes no legacy servlet paths. */
	static void mountRoutes(ServletContextHandler context, FantasyFootballServer server, BrowserV2Adapter adapter) {
		context.addServlet(new ServletHolder(new BrowserMatchServlet(server, adapter)), "/browser/v2");
		context.addServlet(new ServletHolder(new EngineHealthServlet(server)), "/health/engine");
		context.addServlet(new ServletHolder(new HttpServlet() {
			@Override protected void service(HttpServletRequest request, HttpServletResponse response) { response.setStatus(404); }
		}), "/*");
	}

	static final class EngineHealthServlet extends HttpServlet {
		private final FantasyFootballServer server;

		EngineHealthServlet(FantasyFootballServer server) { this.server = server; }

		@Override protected void doGet(HttpServletRequest request, HttpServletResponse response) {
			String remoteAddress = request.getRemoteAddr();
			if (!loopback(remoteAddress)) {
				response.setStatus(HttpServletResponse.SC_NOT_FOUND);
				return;
			}
			response.setHeader("Cache-Control", "no-store");
			response.setStatus(server.getCommunication().isHealthy()
				? HttpServletResponse.SC_NO_CONTENT : HttpServletResponse.SC_SERVICE_UNAVAILABLE);
		}

		private boolean loopback(String address) {
			// Servlet peer addresses are numeric. Reject hostnames before parsing so this cannot perform DNS I/O.
			if (address == null || address.length() > 128) return false;
			int zone = address.indexOf('%');
			if (zone >= 0 && address.contains(":")) address = address.substring(0, zone);
			if (!address.matches("[0-9a-fA-F:.]+") || !address.contains(":") && !address.matches("[0-9.]+")) return false;
			try { return InetAddress.getByName(address).isLoopbackAddress(); }
			catch (UnknownHostException invalid) { return false; }
		}
	}
}
