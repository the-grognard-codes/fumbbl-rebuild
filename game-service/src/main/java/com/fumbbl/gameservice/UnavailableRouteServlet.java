package com.fumbbl.gameservice;

import java.io.IOException;

import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/** Explicitly denies every host path other than the versioned player WebSocket. */
public final class UnavailableRouteServlet extends HttpServlet {
	@Override protected void service(HttpServletRequest request, HttpServletResponse response) throws IOException {
		response.sendError(HttpServletResponse.SC_NOT_FOUND);
	}
}
