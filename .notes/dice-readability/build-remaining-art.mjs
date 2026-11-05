import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'assets/game/ui/dice-events-v1');
const review = path.join(root, '.notes/dice-readability/complete-art');
await mkdir(output, { recursive: true });
await mkdir(review, { recursive: true });
const C = { blue:'#2b598a', light:'#78b5d8', dark:'#193354', ink:'#192c43', gold:'#e6b847', ivory:'#efdcaf', red:'#b64448', green:'#86ab69', leather:'#98592c' };
const p = (d, fill=C.blue, extra='') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (d, color=C.light, width=1.5) => p(d,'none',`stroke="${color}" stroke-width="${width}"`);
const circle = (x,y,r,fill=C.gold) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const group = (body, transform) => `<g transform="${transform}">${body}</g>`;
const star = (x=24,y=24,s=1) => group(p('M0-9 3-3 9-2 5 3 6 9 0 6-6 9-5 3-9-2-3-3Z',C.gold),`translate(${x} ${y}) scale(${s})`);
const cross = (x=24,y=24,s=1) => group(p('M-3-10H3V-3H10V3H3V10H-3V3H-10V-3H-3Z',C.ivory),`translate(${x} ${y}) scale(${s})`);
const arrow = (d, head) => line(d,C.gold,2.8)+p(head,C.gold);
const ball = group(p('M5 24Q24 3 43 24Q24 45 5 24Z',C.leather)+line('M13 17q3 7 0 14m22-14q-3 7 0 14',C.ivory,2.2)+line('M17 23h14m-11-3v6m4-6v6m4-6v6',C.ivory,1.5),'translate(4 5) scale(.82)');
const bomb = circle(24,28,13,C.dark)+p('m20 14 1-5h7l1 5Z',C.blue)+line('M25 9q-3-8 6-6',C.gold,2)+star(35,5,.35)+line('M15 25q0-7 7-7',C.light,2);
const boot = p('M15 9 28 11 27 29 34 34 42 36v7H23L9 34l4-13Z')+p('m12 28 14 3 8 6-11 2-13-7Z',C.dark)+line('m16 17 10 2m-11 3 10 2',C.gold)+line('m24 37 14 2',C.light)+line('M12 35 23 44h19',C.gold,2)+p('m26 44v3h3v-3m7 0v3h3v-3',C.gold);
const helmet = p('M10 25V18Q10 5 24 5t14 13v7l-6 10H16Z')+p('M21 6h6v10h-6Z',C.gold)+p('M13 19q11-4 22 0l-3 10H16Z',C.dark)+line('M12 26h24m-21 5h18m-13-6v9m8-9v9',C.light)+circle(12,23,2)+circle(36,23,2);
const person = circle(24,10,5,C.ivory)+p('m17 18 7-3 7 3-2 12 6 10-5 4-7-11-5 10-5-3 7-13Z')+line('m17 19-9 9m22-8 10 5',C.gold,3);
const eye = p('M3 24Q24 2 45 24Q24 46 3 24Z',C.ivory)+circle(24,24,10,C.blue)+circle(24,24,4,C.dark)+circle(27,20,2,C.light);
const spiral = p('M3 24Q24 2 45 24Q24 46 3 24Z',C.ivory)+line('M34 25c2-17-24-18-23-1s23 16 21 1-15-11-14 0 10 8 8 0',C.dark,2.8);
const mouth = p('M5 15Q24 5 43 15L39 35Q24 45 9 35Z',C.dark)+p('m8 16 6 1 2 12 5-11h6l5 11 2-12 6-1-4 18H12Z',C.ivory)+p('M15 35q9-9 18 0',C.red);
const drop = p('M24 5Q7 25 12 35q12 16 24 0Q41 25 24 5Z',C.red)+line('M18 24q-6 10 1 13',C.ivory,1.2);
const head = p('M11 18Q10 5 24 5t13 13l5 5-6 3-3 14H15l-3-14-6-3Z')+p('m14 20 7 1-4 5Zm20 0-7 1 4 5Z',C.ivory)+p('m20 32 4-3 4 3',C.dark)+line('M17 36h14',C.gold);
const shield = p('M7 8 24 3 41 8 38 30 24 45 10 30Z')+p('M12 12 24 8 36 12 33 29 24 39 15 29Z',C.dark);
const coin = circle(24,25,15,C.gold)+circle(24,25,10,C.leather)+star(24,24,.7);
const cup = p('M12 7h24v13Q35 32 24 33 13 32 12 20Z',C.gold)+line('M12 11H5v8q1 7 10 7m21-15h7v8q-1 7-10 7',C.gold,3)+p('M21 33h6v7h8v5H13v-5h8Z',C.blue);
const hand = p('M10 43 7 33 8 17q0-3 3-3t3 3v10l2-15q0-3 3-3t3 3v14l2-11q1-3 3-2t2 4l-1 12 5-6q2-2 4 0t0 5l-8 11-4 4Z')+line('m13 31 8 5m-11 4 14 2',C.gold,2);
const flame = p('M25 3Q23 15 35 20l1-10q16 23 1 33H13Q-1 33 12 17l1 9Q22 18 25 3Z',C.gold)+p('M24 23q-15 13-4 20h10q7-8-6-20Z',C.red);
const skull = p('M10 24v-8Q11 4 24 4t14 12v8l-7 5v11H17V29Z',C.ivory)+p('m14 17 8 2-2 7-6-2m20-7-8 2 2 7 6-2M24 25l-4 5h8Z',C.dark)+line('M21 34v6m6-6v6',C.dark);
const snack = p('M6 14q7-9 14-4l8 2q3 9 13 7v17Q24 45 6 34Z',C.leather)+p('M6 14q7-8 14-3l8 2q2 6 9 7L6 24Z',C.ivory)+circle(13,29,1.5,C.gold)+circle(26,32,1.5,C.gold);
const footprint = p('M13 5q8-2 9 9l-2 14-11 1-2-12q-1-10 6-12Z',C.ivory)+p('m9 33 10-1 1 8-10 2Z',C.gold)+line('m9 15 11-1m-10 7 10-1',C.dark,2);
const keg = p('M13 6q11-4 22 0l5 11v19l-5 8q-11 4-22 0L8 36V17Z',C.leather)+line('M17 7q-5 17 0 35m7-36v38m7-37q5 17 0 35',C.dark)+p('m11 11 26 0 2 6H9Zm-2 23h30l-3 7H12Z',C.gold);
const bolt = p('M25 3 9 27h12l-2 18 21-28H27l7-14Z',C.gold);
const beard = p('M11 22 24 17 37 22l-2 15-6-2-5 11-5-11-6 2Z',C.ivory)+line('M18 24v10m6-12v17m6-15v10',C.blue);
const bone = p('M10 8q-6-1-6 5 0 5 5 5l21 21q0 6 6 5 6 1 6-5 5-4 0-8-3-3-6 0L16 13q1-6-6-5Z',C.ivory);
const wand = line('M10 40 32 15',C.ivory,5)+line('M10 40 24 24',C.blue,3)+star(35,11,.9);
const motifs = new Map();
const add = (id,label,body,reportIds=[],reference=null,category='Skills and traits') => motifs.set(id,{id,label,body,reportIds,reference,category});
const action = (id,label,body,ids=[]) => add(id,label,body,ids,null,'Actions and movement');
action('pick-up','Pick up',group(ball,'translate(8 15) scale(.6)')+group(hand,'translate(-2 -4) rotate(125 24 24) scale(.8)'),['pickUpRoll']);
action('jump','Jump',group(boot,'translate(5 -5) scale(.8)')+p('M5 40h13v5H5Zm26 0h13v5H31Z',C.dark)+arrow('M6 29Q20 1 40 21','m34 18 9 6-10 1Z'),['leapRoll']);
action('leap','Leap',group(person,'translate(5 -2) rotate(30 24 24) scale(.8)')+arrow('M4 34Q20 1 42 24','m36 20 8 7-10-1Z'),['leapRoll']);
add('jump-up','Jump Up',group(boot,'translate(-3 3) scale(.8)')+arrow('M38 41V10','M32 14 38 4 44 14Z'),['jumpUpRoll'],'jump-up');
action('landing','Landing',group(boot,'translate(5 -4) scale(.8)')+line('M5 43h38',C.gold,3)+arrow('M7 7v19','M3 22 7 30 12 22Z'),['rightStuffRoll']);
action('interception','Interception',group(ball,'translate(-1 -10) scale(.7)')+group(hand,'translate(12 9) scale(.8)')+arrow('M4 20h15','m14 15 8 5-8 5Z'),['interceptionRoll']);
add('bloodlust','Bloodlust',group(mouth,'translate(0 -3) scale(1 .8)')+group(drop,'translate(10 17) scale(.55)'),['bloodLustRoll'],'bloodlust');
add('bone-head','Bone Head',head+circle(24,11,7,C.dark)+circle(17,23,2,C.dark)+circle(31,23,2,C.dark),['confusionRoll'],'bone-head');
add('really-stupid','Really Stupid',head+line('M16 21h6m5 0h6',C.dark,2)+p('M21 34h6v7h-6Z',C.red)+star(39,7,.45),['confusionRoll'],'really-stupid');
add('animal-savagery','Animal Savagery',head+p('M10 16 3 4 17 9m21 7 7-12-14 5',C.gold)+line('m14 17 8 4m12-4-8 4',C.dark,2)+p('m18 32 2 8 3-7m7-1-2 8-3-7',C.ivory),['confusionRoll'],'animal-savagery');
add('take-root','Take Root',p('M17 4h14l-3 24 7 6 9 4-1 5-15-8-3 11-4-10-14 8-3-4 14-12Z',C.leather)+line('M23 9v18m4 7 4 8m-13-7-5 6',C.gold)+p('M16 15Q1 5 5 2q13-1 17 12m8-4Q41-3 44 5q-1 10-14 12',C.green),['confusionRoll'],'take-root');
add('unchannelled-fury','Unchannelled Fury',head+group(flame,'translate(-1 -3) scale(1 .42)')+line('m14 20 8 3m12-3-8 3',C.red,2)+p('m18 34 3 7 3-7 3 7 3-7',C.ivory),['confusionRoll'],'unchannelled-fury');
add('hypnotic-gaze','Hypnotic Gaze',spiral,['hypnoticGazeRoll'],'hypnotic-gaze');
action('throw-team-mate','Throw Team-mate',group(person,'translate(4 5) rotate(50 24 24) scale(.75)')+arrow('M5 30Q12 2 40 12','m35 6 9 8-10 1Z'),['throwTeamMateRoll']);
add('kick-team-mate','Kick Team-mate',group(boot,'translate(-3 13) scale(.65)')+group(person,'translate(22 2) scale(.5) rotate(25 24 24)')+star(24,30,.5),['kickTeamMateRoll'],'kick-team-mate');
action('stand-up','Stand up',group(person,'translate(-3 2) scale(.9)')+arrow('M39 39V14','m34 17 5-10 5 10Z'),['standUpRoll']);
add('pro','Pro',shield+star(24,22,1.1),['reRoll'],'pro');
add('loner','Loner',group(person,'translate(5 2) scale(.8)')+line('M7 5v38m34-38v38',C.gold,2),['reRoll'],'loner');
action('reroll','Reroll test',p('M14 13h21v22H14Z')+circle(20,19,2,C.ivory)+circle(29,28,2,C.ivory)+arrow('M7 29Q0 4 24 4','m20 1 9 3-8 5Z')+arrow('M41 19q7 25-17 25','M28 39 20 44 28 47Z'),['reRoll']);
add('always-hungry','Always Hungry',mouth,['alwaysHungryRoll'],'always-hungry');
add('animosity','Animosity',group(head,'translate(-2 9) scale(.6)')+group(head,'translate(24 9) scale(.6)')+line('M24 3v12m-3 22 6 7m0-7-6 7',C.red,2.4),['animosityRoll'],'animosity');
add('dauntless','Dauntless',group(shield,'translate(7 0) scale(.85)')+group(person,'translate(-4 14) scale(.65)')+star(29,19,.7),['dauntlessRoll'],'dauntless');
add('foul-appearance','Foul Appearance',head+circle(12,28,3,C.green)+circle(34,13,3,C.green)+circle(30,35,2,C.green)+line('M4 8q6 4 0 9m40 14q-5 4 0 9',C.green,2),['foulAppearanceRoll'],'foul-appearance');
add('regeneration','Regeneration',bone+line('M24 33V18',C.green,2)+p('M24 24Q11 24 14 14q11-2 10 10m1-5q2-10 12-9 1 10-12 9',C.green),['regenerationRoll'],'regeneration');
action('bribe','Bribe',group(hand,'translate(-5 8) rotate(60 24 24) scale(.8)')+group(coin,'translate(17 -1) scale(.65)'),['bribesRoll']);
action('argue-the-call','Argue the Call',p('M4 5h33v23H21L9 38V28H4Z')+line('M20 10v10',C.gold,3)+circle(20,24,1.5)+group(helmet,'translate(23 24) scale(.5)'),['argueTheCall']);
add('chainsaw','Chainsaw',p('M5 29 28 6q5-5 10 1t-1 10L15 40Z',C.ivory)+line('M10 29 31 9',C.dark,3)+p('M3 32 14 27 23 37 13 46 4 42Z')+line('m6 33 9 8',C.gold,3)+line('m15 19-3-3m10-4-3-3m12-4 1-4m8 12 4 1m-9 5 3 3m-9 4 3 3',C.gold,2),['chainsawRoll'],'chainsaw');
action('lightning','Lightning',bolt,['spellEffectRoll']);
action('fireball','Fireball',flame,['spellEffectRoll']);
action('zap','Zap',wand+group(bolt,'translate(-2 12) scale(.5)'),['spellEffectRoll']);
action('bomb','Bomb',bomb,['spellEffectRoll']);
add('dodgy-snack','Dodgy Snack',snack+group(skull,'translate(19 14) scale(.5)'),['dodgySnackRoll']);
add('steady-footing','Steady Footing',p('M4 44 9 33 21 29 30 34 42 33 46 44Z',C.dark)+group(boot,'translate(5 -4) scale(.8)'),['steadyFootingRoll'],'steady-footing');
add('team-captain','Team Captain',helmet+p('M7 36h34v9H7Z')+star(24,40,.45),['teamCaptainRoll']);
add('getting-even','Getting Even',group(shield,'translate(0 3) scale(.8)')+arrow('M36 9q15 20-3 32','m28 34 4 10 8-7Z')+star(20,23,.7),['gettingEvenRoll']);
add('saboteur','Saboteur',group(bomb,'translate(8 5) scale(.75)')+p('M5 5 11 10 9 17 16 24 13 28 5 20 1 14Z',C.ivory)+line('M14 27 29 41',C.gold,4),['saboteurRoll'],'saboteur');
add('chomp','Chomp',mouth+group(bone,'translate(11 17) scale(.55)'),['chompRoll']);
add('look-into-my-eyes','Look Into My Eyes',group(eye,'translate(0 4) scale(.65)')+group(eye,'translate(18 4) scale(.65)')+arrow('M8 37h31','m34 32 9 5-9 5Z'),['lookIntoMyEyesRoll']);
add('dwarfen-wisdom','Dwarfen Wisdom',group(helmet,'translate(0 -2) scale(1 .85)')+group(beard,'translate(0 7) scale(1 .85)')+star(38,7,.45),['dwarfenWisdomRoll']);
action('escape','Escape',p('M4 8h17v34H4Z',C.dark)+line('M8 10v30m6-30v30',C.light,2)+group(boot,'translate(20 15) scale(.55)')+arrow('M22 12h19','m36 7 9 5-9 5Z'),['escapeRoll']);
add('all-you-can-eat','All You Can Eat',group(snack,'translate(-1 10) scale(.7)')+group(snack,'translate(18 3) scale(.65)')+line('M5 6v12m-3-12v5h6V6',C.gold,1.5),['allYouCanEat']);
add('baleful-hex','Baleful Hex',eye+star(24,24,.75)+line('M6 5l6 6m30-6-6 6M6 43l6-6m30 6-6-6',C.gold),['balefulHex']);
add('breathe-fire','Breathe Fire',group(head,'translate(-6 7) scale(.7)')+group(flame,'translate(32 29) rotate(90) scale(.5) translate(-24 -24)'),['breatheFire'],'breathe-fire');
add('catch-of-the-day','Catch of the Day',p('M9 26Q22 6 37 23L45 14v24l-9-8Q21 44 9 26Z')+circle(15,23,2,C.ivory)+line('M7 3h20v10q0 7-7 6',C.gold,2),['catchOfTheDay']);
add('projectile-vomit','Projectile Vomit',group(head,'translate(-5 1) scale(.7)')+p('M21 25q9-8 12 3l4 6 8 4-2 6H26l-6-6 5-7Z',C.green)+circle(40,22,2,C.green)+circle(33,17,1.5,C.green),['projectileVomit'],'projectile-vomit');
add('mascot','Mascot',circle(12,11,7)+circle(36,11,7)+p('M8 25Q7 9 24 9t16 16L35 42H13Z')+circle(17,24,3,C.ivory)+circle(31,24,3,C.ivory)+p('M17 32q7-7 14 0l-7 6Z',C.gold),['mascotUsed']);
add('old-pro','Old Pro',helmet+group(beard,'translate(4 14) scale(.8 .6)')+star(38,38,.6),['oldPro']);
add('pick-me-up','Pick-me-up',p('M10 18h24v23H10Z')+line('M34 22h8v12h-8',C.gold,2)+cross(22,29,.65)+line('M15 13q-4-5 1-9m10 9q-4-5 1-9',C.light),['pickMeUp'],'pick-me-up');
add('then-i-started-blastin',"Then I Started Blastin'",group(bomb,'translate(-4 10) scale(.65)')+group(bomb,'translate(20 10) scale(.65)')+star(24,9,.8),['thenIStartedBlastin']);
action('stalling-throw','Stalling throw',circle(12,13,9,C.ivory)+line('M12 6v8l5 3',C.dark,2)+p('m28 27 10-5 7 8-7 9-11-2Z',C.light)+arrow('M24 5q20 3 17 14','m36 14 5 9 5-9Z'),['throwAtStallingPlayer']);
add('thrown-keg','Thrown Keg',group(keg,'translate(6 9) rotate(-25 20 20) scale(.75)')+arrow('M3 21Q13 1 35 5','m31 1 10 5-10 4Z'),['thrownKeg']);
action('trap-door','Trap Door',p('M3 30 25 20 45 30 23 43Z',C.dark)+p('M4 27 9 8 30 3 25 20Z',C.leather)+line('m10 23 5-13m3 10 5-13',C.gold)+arrow('M35 6v16','m30 17 5 10 5-10Z'),['trapDoor']);
action('throw-at-player','Throw at player',group(person,'translate(22 11) scale(.6)')+p('M4 12 12 5 20 10 16 19 7 20Z',C.light)+arrow('M5 29q10-8 18 2','m18 25 8 7-10 2Z'),['throwAtPlayer']);
action('biased-referee','Biased Referee',p('M10 6 19 3h10l9 3 8 12-8 5v21H10V23l-8-5Z',C.ivory)+line('M15 7v34m9-34v34m9-34v34',C.dark,4)+group(coin,'translate(23 22) scale(.52)'),['biasedRef']);
add('shadowing','Shadowing',group(footprint,'translate(-2 5) rotate(-20 15 24) scale(.8)')+group(footprint,'translate(23 -1) rotate(20 15 24) scale(.8)'),['tentaclesShadowingRoll'],'shadowing');
action('throw-in','Throw-in distance',group(ball,'translate(12 15) scale(.6)')+line('M5 3v41',C.ivory,2)+arrow('M10 10q18-6 27 12','m31 19 10 8-10 1Z'),['throwIn']);
action('kick-direction','Kick direction',group(boot,'translate(-2 16) scale(.62)')+arrow('M24 27 41 10','m34 9 11-4-4 11Z'),['kickoffScatter']);
action('fan-factor','Fan factor',group(person,'translate(-6 12) scale(.65)')+group(person,'translate(18 12) scale(.65)')+group(person,'translate(7 -1) scale(.7)')+star(7,7,.4)+star(41,7,.4),['fanFactor']);
action('bounce','Bounce',group(ball,'translate(20 18) scale(.55)')+arrow('M4 37Q12 4 22 33q5-20 15-15','m32 13 10 7-10 2Z')+line('M3 44h41',C.light),['scatterBall']);
action('throw-bomb','Throw Bomb',group(bomb,'translate(8 9) scale(.75)')+arrow('M3 27Q12 1 38 8','m33 3 10 7-11 2Z'),['passRoll']);
action('hail-mary-pass','Hail Mary Pass',group(ball,'translate(18 22) scale(.55)')+arrow('M5 39Q5-10 39 12','m34 5 9 10-12-1Z')+line('M8 39h8m4 0h4',C.light),['passRoll']);
action('hail-mary-bomb','Hail Mary Bomb',group(bomb,'translate(19 20) scale(.55)')+arrow('M5 39Q5-10 39 12','m34 5 9 10-12-1Z')+line('M8 39h8m4 0h4',C.light),['passRoll']);

const approved = { dodge:['Dodge',3,['dodgeRoll']], rush:['Rush',3,['goForItRoll']], pass:['Pass',3,['passRoll']], catch:['Catch',3,['catchRoll']], tentacles:['Tentacles',3,['tentaclesShadowingRoll']], weather:['Weather',1,['weather']], deviation:['Deviation',3,['kickoffScatter']], scatter:['Scatter',3,['scatterBall','scatterPlayer']] };
const manifest = [];
for (const [id,[label,version,reportIds]] of Object.entries(approved)) {
  await copyFile(path.join(root,`.notes/dice-readability/art-samples/${id}-v${version}.svg`),path.join(output,`${id}.svg`));
  manifest.push({id,label,file:`${id}.svg`,category:'Approved samples',reportIds,approvedSampleVersion:version});
}
for (const item of motifs.values()) {
  const {body,...entry} = item;
  const fits = {'pick-up':'translate(0 3)',leap:'translate(0 6)','unchannelled-fury':'translate(0 3)',animosity:'translate(1 1) scale(.94)','breathe-fire':'translate(3 0)',shadowing:'translate(4 2) scale(.9)'};
  const fittedBody = fits[item.id] ? group(body,fits[item.id]) : body;
  await writeFile(path.join(output,`${item.id}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="${item.label.replaceAll('&','&amp;').replaceAll("'",'&apos;')}"><g stroke="${C.ink}" stroke-width="1.35" stroke-linejoin="round" stroke-linecap="round">${fittedBody}</g></svg>\n`);
  manifest.push({...entry,file:`${item.id}.svg`});
}
for (const [index, direction] of ['north','northeast','east','southeast','south','southwest','west','northwest'].entries()) {
  const id = `direction-${direction}`;
  const body = group(p('M20 43V20H10L24 4l14 16H28v23Z',C.gold),`rotate(${index*45} 24 24)`);
  await writeFile(path.join(output,`${id}.svg`),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="${direction}"><g stroke="${C.ink}" stroke-width="1.5">${body}</g></svg>\n`);
  manifest.push({id,label:direction,file:`${id}.svg`,category:'Direction indicators',reportIds:[],rotationDegrees:index*45});
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify({version:1,viewBox:'0 0 48 48',events:manifest,
  retainedAnimatedOutcomes:['armor','stun','ko','casualty','bh','mng','ni','stat','dead'],
  unknownEventPolicy:'Preserve existing text; omit icon. Generic direction falls back to scatter artwork.',
  scope:'Existing recognized on-pitch rolls plus Deviation. Other absent adapters deferred.'},null,2)+'\n');

const groups = ['Approved samples','Actions and movement','Skills and traits','Direction indicators'];
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;');
const style = `*{box-sizing:border-box}body{margin:0;padding:24px;background:#101c2b;color:#e9ecdc;font:15px system-ui}h1{font-size:26px}h2{font-size:21px;margin-top:30px}.grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}article{border:1px solid #466276;border-radius:6px;overflow:hidden;background:#14283b}h3{font-size:13px;min-height:34px;margin:10px}.art{background:#729747;display:flex;justify-content:center;align-items:center;gap:10px;min-height:145px;padding:8px;flex-wrap:wrap}.art img:first-child{width:96px;height:96px}.small{display:flex;gap:10px;align-items:center}.small img:first-child{width:48px;height:48px}.small img:last-child{width:32px;height:32px}.ref{display:flex;align-items:center;gap:8px;padding:8px;font-size:10px;color:#afc9da}.ref img{width:26px;height:35px;object-fit:contain}p{color:#afc9da} @media(max-width:650px){body{padding:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
for (const [part,category] of groups.entries()) {
  const entries = manifest.filter(e=>e.category===category);
  const cards = entries.map(e=>`<article data-event="${e.id}"><h3>${escape(e.label)}</h3><div class="art"><img src="../../../assets/game/ui/dice-events-v1/${e.file}" alt="${escape(e.label)}"/><div class="small"><img src="../../../assets/game/ui/dice-events-v1/${e.file}" alt=""/><img src="../../../assets/game/ui/dice-events-v1/${e.file}" alt=""/></div></div>${e.reference?`<div class="ref"><img src="../../../assets/game/ui/player-skill-markers-v1/illustrated/${e.reference}.png" alt="Existing skill reference"/>Existing skill motif</div>`:''}</article>`).join('');
  // Review folder is three levels below repository root.
  await writeFile(path.join(review,`sheet-${part+1}.html`),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dice icons: ${category}</title><style>${style}</style><h1>${category}</h1><p>96px detail · 48px / 32px thumbnails · approved lighter pitch-green preview</p><main class="grid">${cards}</main></html>`);
}
await writeFile(path.join(review,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Complete dice event art</title><style>${style}</style><h1>Dice event artwork</h1><p>${manifest.length} SVG assets. Catch v3 locked; Weather v1 locked. Existing injury animations retained.</p>${groups.map((g,i)=>`<h2><a style="color:#e6b847" href="sheet-${i+1}.html">${g}</a></h2>`).join('')}</html>`);
console.log(`Wrote ${manifest.length} SVG assets (${motifs.size} new event motifs + 8 approved + 8 direction arrows).`);
