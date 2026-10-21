package com.fumbbl.ffb.server;

import com.fumbbl.ffb.IDialogParameter;
import com.fumbbl.ffb.dialog.DialogPlayerChoiceParameter;
import com.fumbbl.ffb.dialog.DialogReRollPropertiesParameter;
import com.fumbbl.ffb.dialog.DialogSkillUseParameter;
import com.fumbbl.ffb.net.commands.ClientCommand;
import com.fumbbl.ffb.net.commands.ClientCommandUseSkill;
import com.fumbbl.ffb.net.commands.ClientCommandUseReRoll;
import com.fumbbl.ffb.server.GameState.StepExecutionMode;
import com.fumbbl.ffb.server.net.ReceivedCommand;
import com.fumbbl.ffb.server.step.IStep;
import com.fumbbl.ffb.server.step.StepAction;
import com.fumbbl.ffb.server.step.StepCommandStatus;
import com.fumbbl.ffb.server.step.StepException;
import com.fumbbl.ffb.server.util.UtilServerDialog;
import com.fumbbl.ffb.server.util.UtilServerGame;
import com.fumbbl.ffb.util.StringTool;

import java.util.ArrayList;
import java.util.List;

class StepExecutor {

	private enum Transition {
		WAIT_FOR_COMMAND,
		START,
		FORWARD_COMMAND
	}

	private static class Context {
		StepExecutionMode mode;
		ReceivedCommand receivedCommand;
		StepAction action;
		Transition transition;
		boolean shouldContinue = true;

		Context(StepExecutionMode mode, ReceivedCommand receivedCommand) {
			this.mode = mode;
			this.receivedCommand = receivedCommand;
		}
	}

	private final GameState gameState;
	private IStep fCurrentStep;

	StepExecutor(GameState gameState) {
		this.gameState = gameState;
	}

	IStep getCurrentStep() {
		return fCurrentStep;
	}

	void setCurrentStep(IStep step) {
		fCurrentStep = step;
	}

	void pushCurrentStepOnStack() {
		if (fCurrentStep != null) {
			gameState.getStepStack().push(fCurrentStep);
		}
	}

	void cleanupStepStack(String pGotoLabel) {
		if (!StringTool.isProvided(pGotoLabel)) {
			return;
		}

		List<IStep> poppedSteps = new ArrayList<>();
		while (gameState.getStepStack().peek() != null) {
			if (pGotoLabel.equals(gameState.getStepStack().peek().getLabel())) {
				return;
			} else {
				poppedSteps.add(gameState.getStepStack().pop());
			}
		}

		gameState.getStepStack().push(poppedSteps);
	}

	void startNextStep() {
		if (progressToNextStep()) {
			logCurrentStep();
			execute(StepExecutionMode.Start, null);
		}
	}

	void handleCommand(ReceivedCommand receivedCommand) {
		if (fCurrentStep == null) {
			startNextStep();
		}
		if (fCurrentStep != null) {
			execute(StepExecutionMode.HandleCommand, receivedCommand);
		}
	}

	void execute(StepExecutionMode mode, ReceivedCommand receivedCommand) {
		Context ctx = new Context(mode, receivedCommand);
		 do {
			executeCurrentStep(ctx);
			processFlowControl(ctx);
			processStepResult(ctx);
			applyTransition(ctx);
		} while (ctx.shouldContinue);
	}

	private boolean progressToNextStep() {
		fCurrentStep = gameState.getStepStack().pop();
		return fCurrentStep != null;
	}

	private void logCurrentStep() {
		gameState.getServer().getDebugLog().logCurrentStep(IServerLogLevel.DEBUG, gameState);
	}

	private void executeCurrentStep(Context ctx) {
		if (ctx.mode == StepExecutionMode.Start) {
			fCurrentStep.start();
		} else if (ctx.receivedCommand != null) {
			handleCurrentCommand(ctx.receivedCommand);
		}

		while (fCurrentStep.getResult().getNextAction().triggerRepeat()) {
			fCurrentStep.repeat();
		}

		// Resolve only newly produced decisions during native execution, never during load/replay.
		for (int count = 0; !fCurrentStep.getResult().getNextAction().triggerNextStep(); count++) {
			ClientCommand automatic = gameState.getOptionalSkillUse().automaticCommand();
			if (automatic == null) break;
			if (count >= 128) throw new StepException("Automatic skill decisions did not advance");
			boolean home = true;
			if (gameState.getGame().getDialogParameter() instanceof DialogSkillUseParameter) {
				String player = ((DialogSkillUseParameter) gameState.getGame().getDialogParameter()).getPlayerId();
				home = gameState.getGame().getTeamHome().hasPlayer(gameState.getGame().getPlayerById(player));
			} else if (gameState.getGame().getDialogParameter() instanceof DialogReRollPropertiesParameter) {
				String player = ((DialogReRollPropertiesParameter) gameState.getGame().getDialogParameter()).getPlayerId();
				home = gameState.getGame().getTeamHome().hasPlayer(gameState.getGame().getPlayerById(player));
			} else if (gameState.getGame().getDialogParameter() instanceof DialogPlayerChoiceParameter) {
				home = gameState.getGame().getTeamHome().getId().equals(
					((DialogPlayerChoiceParameter) gameState.getGame().getDialogParameter()).getTeamId());
			}
			StepCommandStatus status = handleCurrentCommand(new ReceivedCommand(automatic, home));
			if (status == StepCommandStatus.UNHANDLED_COMMAND || status == StepCommandStatus.SKIP_STEP)
				throw new StepException("Automatic skill decision was not accepted by " + fCurrentStep.getName());
			while (fCurrentStep.getResult().getNextAction().triggerRepeat()) fCurrentStep.repeat();
		}

		UtilServerGame.syncGameModel(fCurrentStep);

		ctx.action = fCurrentStep.getResult().getNextAction();
	}

	private StepCommandStatus handleCurrentCommand(ReceivedCommand received) {
		IDialogParameter offered = gameState.getGame().getDialogParameter();
		StepCommandStatus status = fCurrentStep.handleCommand(received);
		// Some native steps leave consumed skill dialogs for the next step to clear. Do it
		// before automatic policy sees them again, while retaining newly produced decisions.
		boolean answeredSkill = received.getCommand() instanceof ClientCommandUseSkill;
		boolean answeredReroll = received.getCommand() instanceof ClientCommandUseReRoll && offered instanceof DialogReRollPropertiesParameter;
		if (gameState.getOptionalSkillUse().enabled() && (answeredSkill || answeredReroll)
			&& status == StepCommandStatus.EXECUTE_STEP && gameState.getGame().getDialogParameter() == offered)
			UtilServerDialog.hideDialog(gameState);
		return status;
	}

	private void processFlowControl(Context ctx) {
		if (ctx.action.triggerGoto()) {
			handleStepResultGotoLabel(fCurrentStep.getResult().getNextActionParameter());
		}
	}

	private void handleStepResultGotoLabel(String pGotoLabel) {
		if (!StringTool.isProvided(pGotoLabel)) {
			String stepName = (fCurrentStep != null) ? fCurrentStep.getId().getName() : "unknown";
			throw new StepException("Step " + stepName + ": No goto label set.");
		}
		fCurrentStep = null;
		while (gameState.getStepStack().peek() != null) {
			if (pGotoLabel.equals(gameState.getStepStack().peek().getLabel())) {
				return;
			} else {
				gameState.getStepStack().pop();
			}
		}
		throw new StepException("Goto unknown label " + pGotoLabel);
	}

	private void processStepResult(Context ctx) {
		if (!ctx.action.triggerNextStep()) {
			ctx.transition = Transition.WAIT_FOR_COMMAND;
		} else if (ctx.action.forwardCommand()) {
			ctx.transition = Transition.FORWARD_COMMAND;
		} else {
			ctx.transition = Transition.START;
		}
	}

	private void applyTransition(Context ctx) {
		switch (ctx.transition) {
			case WAIT_FOR_COMMAND:
				ctx.shouldContinue = false;
				break;
			case FORWARD_COMMAND:
				progressToNextStep();
				ctx.mode = StepExecutionMode.HandleCommand;
				break;
			case START:
				if (progressToNextStep()) {
					logCurrentStep();
					ctx.mode = StepExecutionMode.Start;
					ctx.receivedCommand = null;
				} else {
					ctx.shouldContinue = false;
				}
				break;
			default:
				ctx.shouldContinue = false;
				break;
		}
	}
}
