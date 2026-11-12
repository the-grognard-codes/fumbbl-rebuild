package com.fumbbl.ffb.server.match;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Default for in-memory repositories; JDBC supplies its own fixed-query batch. */
final class LobbyReadBatch {
	interface Finder<T> { T find(String id) throws SQLException; }

	<T> Map<String, T> read(List<String> ids, LobbyReadBudget budget, Finder<T> finder, Function<T, String> json) throws SQLException {
		budget.entries(ids.size());
		Map<String, T> result = new LinkedHashMap<>();
		for (String id : ids) {
			budget.check();
			try {
				T record = finder.find(id);
				if (record != null) { budget.admit(json.apply(record)); result.put(id, record); }
			} catch (LobbyReadBudget.InvalidRecord | RecoveryRepository.CorruptRecord unavailable) {
				// A corrupt/oversized entry is unavailable; page budget and storage failures propagate.
			}
		}
		return result;
	}
}
