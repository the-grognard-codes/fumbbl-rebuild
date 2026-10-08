import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {StadiumGestureScheduler} from './stadium-gestures.ts';

const ActiveSection=createContext<string|null>(null);
export const useActiveCrowdSection=()=>useContext(ActiveSection);
/** Camera travel updates eligibility without restarting the random cadence. */
export function CrowdGestureProvider({eligible,children}:{eligible:readonly string[];children:ReactNode}){
  const visible=useRef(eligible),[active,setActive]=useState<string|null>(null);
  visible.current=eligible;
  useEffect(()=>{
    let mounted=true;
    const scheduler=new StadiumGestureScheduler({
      setTimeout:(callback,delay)=>window.setTimeout(callback,delay),
      clearTimeout:id=>window.clearTimeout(id)},Math.random,()=>visible.current,
      piece=>{if(mounted)setActive(piece);});
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>{if(preference.matches||document.hidden)scheduler.stop();else scheduler.start();};
    preference.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);sync();
    return()=>{mounted=false;preference.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);scheduler.stop();};
  },[]);
  return <ActiveSection.Provider value={active}>{children}</ActiveSection.Provider>;
}
