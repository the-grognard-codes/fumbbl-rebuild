package com.fumbbl.ffb.server.local;

import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.match.FirebaseV2PrincipalAuthenticator;
import com.fumbbl.ffb.server.match.JdbcMatchMembershipRepository;
import com.fumbbl.ffb.server.match.JdbcMatchRepository;
import com.fumbbl.ffb.server.match.JdbcRecoveryRepository;
import com.fumbbl.ffb.server.match.JdbcV2PrincipalDirectory;
import com.fumbbl.ffb.server.match.MatchService;
import com.fumbbl.ffb.server.match.SetupApplication;
import com.fumbbl.ffb.server.match.V2MatchAccess;
import com.fumbbl.ffb.server.match.V2PreparationService;
import com.fumbbl.ffb.server.team.JdbcSavedTeamRepository;
import com.fumbbl.ffb.server.team.SavedTeamService;
import com.fumbbl.ffb.server.team.bb2025.RosterCatalog;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.eclipse.jetty.ee8.servlet.ServletContextHandler;
import org.eclipse.jetty.ee8.servlet.ServletHolder;

/** The v2 host serves only one authenticated game endpoint. */
public final class BrowserV2Runtime {
	public static void mount(FantasyFootballServer server, ServletContextHandler context,
		JdbcMatchMembershipRepository.Connections connections) throws SQLException {
		try (Connection connection = connections.open()) { new Marker6Schema().verify(connection); }
		String project = server.getProperty("local.browser.v2.firebase.project");
		if (project == null || project.trim().isEmpty()) throw new IllegalArgumentException("Firebase project required");
		Clock clock = Clock.systemUTC();
		RosterCatalog catalog = new RosterCatalog();
		SavedTeamService teams = new SavedTeamService(new JdbcSavedTeamRepository(connections::open, true), catalog);
		MatchService matches = new MatchService(new JdbcMatchRepository(connections::open), teams, catalog);
		SetupApplication setup = new SetupApplication(server, matches, new JdbcRecoveryRepository(connections::open));
		JdbcV2PrincipalDirectory directory = new JdbcV2PrincipalDirectory(connections::open, clock);
		FirebaseV2PrincipalAuthenticator verifier = new FirebaseV2PrincipalAuthenticator(project, directory);
		V2MatchAccess access = new V2MatchAccess(new JdbcMatchMembershipRepository(connections::open), verifier.liveDirectory(), clock);
		BrowserV2Adapter adapter = new BrowserV2Adapter(verifier, access,
			setup, matches, new V2PreparationService(connections::open, teams, catalog, clock), new BrowserSavedTeamJson(teams, true));
		mountRoutes(context, server, adapter);
	}

	/** The isolated v2 route surface intentionally exposes no legacy servlet paths. */
	static void mountRoutes(ServletContextHandler context, FantasyFootballServer server, BrowserV2Adapter adapter) {
		context.addServlet(new ServletHolder(new BrowserMatchServlet(server, adapter)), "/browser/v2");
		context.addServlet(new ServletHolder(new HttpServlet() {
			@Override protected void service(HttpServletRequest request, HttpServletResponse response) { response.setStatus(404); }
		}), "/*");
	}
}
