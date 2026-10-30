package com.fumbbl.ffb.server.net;

import com.fumbbl.ffb.PlayerState;
import com.fumbbl.ffb.SoundId;
import com.fumbbl.ffb.model.Animation;
import com.fumbbl.ffb.model.PlayerResult;
import com.fumbbl.ffb.model.RosterPlayer;
import com.fumbbl.ffb.model.ZappedPlayer;
import com.fumbbl.ffb.model.change.ModelChangeList;
import com.fumbbl.ffb.net.commands.ServerCommand;
import com.fumbbl.ffb.net.commands.ServerCommandAddPlayer;
import com.fumbbl.ffb.net.commands.ServerCommandModelSync;
import com.fumbbl.ffb.net.commands.ServerCommandRemovePlayer;
import com.fumbbl.ffb.net.commands.ServerCommandSound;
import com.fumbbl.ffb.net.commands.ServerCommandUnzapPlayer;
import com.fumbbl.ffb.net.commands.ServerCommandZapPlayer;
import com.fumbbl.ffb.report.ReportList;
import com.fumbbl.ffb.server.FantasyFootballServer;
import com.fumbbl.ffb.server.GameState;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
/** Serializes browser work and records native engine events for projection/recovery. */
public class ServerCommunication implements Runnable {
	private final FantasyFootballServer server;
	private final BlockingQueue<Runnable> queue = new LinkedBlockingQueue<>();
	private final Object enqueueLock = new Object();
	private final Runnable shutdownMarker = () -> { };
	private final CountDownLatch stopped = new CountDownLatch(1);
	private boolean stopping;
	private volatile Thread workerThread;

	public ServerCommunication(FantasyFootballServer server) { this.server = server; }

	public boolean execute(Runnable work) {
		if (work == null) return false;
		synchronized (enqueueLock) {
			if (stopping && Thread.currentThread() != workerThread) return false;
			return queue.offer(work);
		}
	}

	@Override public void run() {
		workerThread = Thread.currentThread();
		try {
			while (true) {
				Runnable work;
				try { work = queue.take(); }
				catch (InterruptedException interrupted) { continue; }
				try { work.run(); }
				catch (RuntimeException failure) { server.getDebugLog().logWithOutGameId(failure); }
				synchronized (enqueueLock) { if (stopping && queue.isEmpty()) break; }
			}
		} finally { stopped.countDown(); }
	}

	public void shutdown() {
		synchronized (enqueueLock) { if (!stopping) { stopping = true; queue.offer(shutdownMarker); } }
		if (Thread.currentThread() == workerThread || workerThread == null) return;
		try {
			if (!stopped.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out draining browser commands");
		} catch (InterruptedException interrupted) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("Interrupted draining browser commands", interrupted);
		}
	}

	public int getQueueLength() { return queue.size(); }

	private void record(GameState gameState, ServerCommand command) { gameState.getGameLog().add(command); }

	public void sendAddPlayer(GameState gameState, String pTeamId, RosterPlayer pPlayer, PlayerState pPlayerState,
														PlayerResult pPlayerResult) {
		ServerCommandAddPlayer addPlayersCommand = new ServerCommandAddPlayer(pTeamId, pPlayer, pPlayerState,
			pPlayerResult);
		addPlayersCommand.setCommandNr(gameState.generateCommandNr());
		record(gameState, addPlayersCommand);
	}

	public void sendRemovePlayer(GameState gameState, String pPlayerId) {
		ServerCommandRemovePlayer removePlayerCommand = new ServerCommandRemovePlayer(pPlayerId);
		removePlayerCommand.setCommandNr(gameState.generateCommandNr());
		record(gameState, removePlayerCommand);
	}

	public void sendSound(GameState gameState, SoundId pSound) {
		ServerCommandSound soundCommand = new ServerCommandSound(pSound);
		soundCommand.setCommandNr(gameState.generateCommandNr());
		record(gameState, soundCommand);
	}

	public void sendModelSync(GameState gameState, ModelChangeList pModelChanges, ReportList pReports,
														Animation pAnimation, SoundId pSound, long pGameTime, long pTurnTime) {
		ServerCommandModelSync syncCommand = new ServerCommandModelSync(pModelChanges, pReports, pAnimation, pSound,
			pGameTime, pTurnTime);
		syncCommand.setCommandNr(gameState.generateCommandNr());
		gameState.observeModelSync(syncCommand);
		record(gameState, syncCommand);
	}

	public void sendZapPlayer(GameState gameState, RosterPlayer player) {
		ServerCommandZapPlayer commandZapPlayer = new ServerCommandZapPlayer(player.getId(), player.getTeam().getId());
		record(gameState, commandZapPlayer);
	}

	public void sendUnzapPlayer(GameState gameState, ZappedPlayer player) {
		ServerCommandUnzapPlayer commandUnzapPlayer = new ServerCommandUnzapPlayer(player.getId(),
			player.getTeam().getId());
		record(gameState, commandUnzapPlayer);
	}

}
