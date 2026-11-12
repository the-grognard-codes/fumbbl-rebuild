package com.fumbbl.ffb.server.match;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Collections;
import java.util.List;

/** Fixed-batch SQL projection that prevents the driver allocating oversized stored records. */
final class LobbyReadQuery {
	String columns(String column, LobbyReadBudget budget) {
		String length = "OCTET_LENGTH(" + column + ")";
		return "CASE WHEN " + length + "<=" + LobbyReadBudget.RECORD_BYTES
			+ " AND SUM(CASE WHEN " + length + "<=" + LobbyReadBudget.RECORD_BYTES + " THEN " + length
			+ " ELSE 0 END) OVER ()<=" + budget.remainingEncodedBytes()
			+ " THEN " + column + " ELSE NULL END," + length;
	}

	String slots(List<String> ids) { return String.join(",", Collections.nCopies(ids.size(), "?")); }

	void bind(PreparedStatement query, List<String> ids) throws SQLException {
		for (int index = 0; index < ids.size(); index++) query.setString(index + 1, ids.get(index));
	}
}
