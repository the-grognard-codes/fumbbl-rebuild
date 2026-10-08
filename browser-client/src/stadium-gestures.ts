export const STADIUM_GESTURE_MS = 2000;
export type GestureClock = {setTimeout:(callback:()=>void,delay:number)=>number;clearTimeout:(id:number)=>void};

/** Local decorative bursts. One section at a time, independent of game state. */
export class StadiumGestureScheduler {
  private timer:number|null=null;
  private running=false;
  private active:string|null=null;
  private readonly clock:GestureClock;
  private readonly random:()=>number;
  private readonly eligible:()=>readonly string[];
  private readonly change:(piece:string|null)=>void;
  constructor(clock:GestureClock,random:()=>number,eligible:()=>readonly string[],change:(piece:string|null)=>void) {
    this.clock=clock;this.random=random;this.eligible=eligible;this.change=change;
  }
  start():void {
    if(this.running)return;
    this.running=true;
    this.schedule();
  }
  stop():void {
    this.running=false;
    if(this.timer!==null)this.clock.clearTimeout(this.timer);
    this.timer=null;
    if(this.active!==null){this.active=null;this.change(null);}
  }
  private sample():number {return Math.min(1-Number.EPSILON,Math.max(0,this.random()));}
  private schedule():void {
    if(!this.running)return;
    this.timer=this.clock.setTimeout(()=>{
      this.timer=null;
      const pieces=this.eligible();
      if(!pieces.length){this.schedule();return;}
      this.active=pieces[Math.floor(this.sample()*pieces.length)];
      this.change(this.active);
      this.timer=this.clock.setTimeout(()=>{
        this.timer=null;this.active=null;this.change(null);this.schedule();
      },STADIUM_GESTURE_MS);
    },3500+Math.floor(this.sample()*12000));
  }
}
