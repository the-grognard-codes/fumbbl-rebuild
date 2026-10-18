/** Install in controlled browser journeys that have no native jump forecast fixture. */
export function installInitialMovementPreview() {
  window.replyToInitialMovementPreview = (request, state, emit) => {
    if (request.type !== 'movementPreview' || request.kind !== 'move' || request.waypoints.length) return false;
    const player = state.players.find(player => player.id === request.playerId);
    queueMicrotask(() => emit({version:2,type:'movementPreview',requestId:request.requestId,
      code:'ACCEPTED',matchId:state.matchId,plan:{planVersion:1,kind:'move',targetPlayerId:null,
        waypoints:[],jumpOptions:[],route:{routeVersion:3,playerId:player.id,from:{x:player.x,y:player.y},
          remaining:0,steps:[],revision:state.revision,actor:state.callerRole}}}));
    return true;
  };
}
