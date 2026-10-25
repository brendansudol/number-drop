(() => {
  'use strict';
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const $ = id => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d');
  const W = 480, H = 540, LINE = 99, STORAGE = 'number-drop-v1';
  const palette = [null, ['#eaa66a','#d98248'], ['#ef947d','#df6c54'], ['#efd46f','#d5ac38'], ['#a5cc8b','#75a760'], ['#83c8c7','#4a9e9b'], ['#b4a0d5','#8a6bb4'], ['#df9bb4','#bb6e92'], ['#efb26f','#d78d3b'], ['#9eafc8','#788ba6'], ['#91b9a1','#628f76'], ['#f3a34f','#dc7a2c'], ['#ed746c','#d74747']];
  const roundFont = '"Nunito", "Arial Rounded MT Bold", sans-serif';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch {}
  const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 8 });
  engine.gravity.y = 1.15;
  let score = 0, best = Number(prefs.best) || 0, biggest = 2, drops = 0;
  let max = [5,10,11,12,20].includes(prefs.max) ? prefs.max : 10;
  let mode = prefs.mode === 'challenge' ? 'challenge' : 'unlimited';
  let sound = prefs.sound === true, paused = false, gameOver = false, modalPaused = false;
  let current = 2, next = 4, aim = W / 2, simTime = 0, cooldown = 0;
  let pieces = [], particles = [], floaters = [], mergeQueue = [], discovered = new Set([1,2]);
  let pendingMerge = new Set(), lastMergeAt = -9999, combo = 0, lastAnnounce = 0;
  let audio, toastTimer, messageTimer, savedAt = 0;

  function colors(n) { return palette[n <= 12 ? n : 1 + (Math.floor(Math.log2(n)) * 3 + n) % 10]; }
  function radius(n) { return Math.min(48, 22 + Math.log2(n) * 2.15); }
  function clampX(x, n = current) { const r = radius(n); return Math.max(r + 7, Math.min(W - r - 7, x)); }
  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ best, max, mode, sound,
        session: !gameOver ? { score, biggest, drops, current, next, aim, discovered: [...discovered], pieces: pieces.filter(b => b.position.y > 15).map(b => ({ n:b.number, x:b.position.x, y:b.position.y, angle:b.angle })) } : null
      }));
    } catch {}
  }
  function announce(text) { $('announcer').textContent = text; }
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000); }
  function playTone(n, merge = false) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime;
      const notes = merge ? [0,4,7] : [0];
      notes.forEach((semitone,i) => {
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine'; osc.frequency.value = (merge ? 330 + Math.log2(n) * 45 : 220) * 2 ** (semitone / 12);
        gain.gain.setValueAtTime(0, now+i*.065);gain.gain.linearRampToValueAtTime(.065,now+i*.065+.012);gain.gain.exponentialRampToValueAtTime(.001, now+i*.065+.3);
        osc.connect(gain).connect(audio.destination);osc.start(now+i*.065);osc.stop(now+i*.065+.32);
      });
    } catch {}
  }
  function updateSound() {
    $('sound').innerHTML = sound ? '<svg viewBox="0 0 24 24"><path d="m11 5-6 5H2v4h3l6 5zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>' : '<svg viewBox="0 0 24 24"><path d="m11 5-6 5H2v4h3l6 5zM17 9l5 6m0-6-5 6"/></svg>';
    $('sound').setAttribute('aria-pressed', String(sound)); $('sound').setAttribute('aria-label', sound ? 'Turn sound off' : 'Turn sound on'); $('sound').title = sound ? 'Turn sound off' : 'Turn sound on';
  }
  function updateUI() {
    $('score').textContent = score.toLocaleString(); $('best').textContent = best.toLocaleString(); $('biggest').textContent = biggest.toLocaleString();
    $('range').value = max; $('drop-value').textContent = current;
    $('drop').setAttribute('aria-label', `Drop number ${current}`);
    $('mode').innerHTML = mode === 'unlimited' ? '<span>∞</span> Unlimited play' : '<span>✧</span> Challenge';
    $('mode').setAttribute('aria-label', `${mode === 'unlimited' ? 'Unlimited play' : 'Challenge mode'}. Change game mode.`);
    const nc = $('next').getContext('2d'); nc.clearRect(0,0,120,120); drawCharacter(nc,next,60,60,43,0,1);
    $('next').setAttribute('aria-label', `Next number: ${next}`);
    let target = 4; while (discovered.has(target) && target < 65536) target *= 2;
    $('discovery-number').innerHTML = `${target}<span class="eyes"><i></i><i></i></span>`;
    $('discovery-number').style.background = colors(target)[0];
    $('discovery-number').style.fontSize = target >= 1000 ? '23px' : target >= 100 ? '31px' : '';
    $('discovery-equation').innerHTML = `<span>${target/2}</span> + <span>${target/2}</span> = <strong>${target}</strong>`;
    $('discovery-equation').style.fontSize = target >= 1000 ? '13px' : '';
    $('discovery-copy').textContent = `Bring two ${target / 2}s together.`;
    $('progress-dots').innerHTML = [2,4,8,16,32,64,128,256].map(n=>`<span class="${discovered.has(n)?'reached':''}"></span>`).join('');
    $('progress-dots').setAttribute('aria-label', `Discovered ${[2,4,8,16,32,64,128,256].filter(n=>discovered.has(n)).length} of 8 doubling milestones`);
    $('board-tip').classList.toggle('gone', drops > 0);
    $('board-tip').setAttribute('aria-hidden', String(drops > 0));
    updateSound();
  }
  function makePiece(n,x,y,angle=0) {
    const r = radius(n);
    const body = Bodies.circle(clampX(x,n),y,r,{restitution:.22,friction:.48,frictionStatic:.8,frictionAir:.012, density:.0018, sleepThreshold:70});
    body.number = n; body.r = r; body.born = simTime; body.overflow = 0;
    Body.setAngle(body,angle); pieces.push(body); Composite.add(engine.world,body); return body;
  }
  function resetWorld() {
    Composite.clear(engine.world,false); Engine.clear(engine); pieces=[];particles=[];floaters=[];mergeQueue=[];pendingMerge.clear();
    const wallOpts={isStatic:true,friction:.7,restitution:.1};
    Composite.add(engine.world,[Bodies.rectangle(W/2,H+30,W+150,60,wallOpts),Bodies.rectangle(-30,H/2,60,H*3,wallOpts),Bodies.rectangle(W+30,H/2,60,H*3,wallOpts)]);
  }
  function newGame() {
    resetWorld();score=0;biggest=2;drops=0;current=2;next=4;aim=W/2;simTime=0;cooldown=0;gameOver=false;combo=0;lastMergeAt=-9999;discovered=new Set([1,2]);
    makePiece(2,W/2,H-radius(2)-1);setPaused(false);$('end-overlay').hidden=true;$('merge-message').classList.remove('show');updateUI();save();announce('New game. Drop the 2 onto its match to make 4.');
  }
  function randomNumber() {
    const matches=pieces.filter(b=>b.number<=max);
    if (matches.length && Math.random()<.35) return matches[Math.floor(Math.random()*matches.length)].number;
    return 1+Math.floor(Math.random()*max);
  }
  function drop() {
    if (paused || gameOver || modalPaused || simTime < cooldown) return;
    if (mode === 'unlimited' && pieces.some(b=>b.position.y-b.r<LINE && simTime-b.born>1500)) {
      const lowest=[...pieces].sort((a,b)=>b.position.y-a.position.y).slice(0,Math.max(4,Math.floor(pieces.length*.2)));
      lowest.forEach(b=>removePiece(b));toast('A little more room to keep growing!');
    }
    const b=makePiece(current,aim,48);Body.setVelocity(b,{x:0,y:1.4});playTone(current);drops++;current=next;next=randomNumber();aim=clampX(aim);cooldown=simTime+440;updateUI();save();
  }
  function removePiece(b) { Composite.remove(engine.world,b);pieces=pieces.filter(p=>p!==b); }
  function scheduleMerges(event) {
    for (const pair of event.pairs) {
      const a=pair.bodyA,b=pair.bodyB;
      if (!a.number || a.number!==b.number || pendingMerge.has(a.id) || pendingMerge.has(b.id) || simTime-a.born<100 || simTime-b.born<100) continue;
      pendingMerge.add(a.id);pendingMerge.add(b.id);mergeQueue.push([a,b]);
    }
  }
  Events.on(engine,'collisionStart',scheduleMerges); Events.on(engine,'collisionActive',scheduleMerges);
  function merge(a,b) {
    if (!pieces.includes(a)||!pieces.includes(b)) return;
    const n=a.number*2,x=clampX((a.position.x+b.position.x)/2,n),y=Math.min(H-radius(n)-1,(a.position.y+b.position.y)/2);
    removePiece(a);removePiece(b);
    const child=makePiece(n,x,y);Body.setVelocity(child,{x:(a.velocity.x+b.velocity.x)*.12,y:-1.4});
    score+=n*10;best=Math.max(best,score);biggest=Math.max(biggest,n);discovered.add(n);combo=simTime-lastMergeAt<1200?combo+1:1;lastMergeAt=simTime;
    const message=`${n/2} + ${n/2} = ${n}`;
    $('merge-message').textContent=combo>1?`${message} · ${combo}× combo!`:message;
    $('merge-message').classList.add('show');clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('merge-message').classList.remove('show'),1800);
    if(!reducedMotion) for(let i=0;i<15;i++){const t=Math.random()*Math.PI*2,s=1.3+Math.random()*2.6;particles.push({x,y,vx:Math.cos(t)*s,vy:Math.sin(t)*s-1.7,life:1,c:[colors(n)[0],'#e8c76b','#fffdf1'][i%3],size:2+Math.random()*3});}
    floaters.push({x,y:y-20,text:`+${n*10}`,life:1});playTone(n,true);updateUI();save();
    if(simTime-lastAnnounce>500){announce(`${message}. Score ${score}.`);lastAnnounce=simTime;}
  }
  function setPaused(value) {
    paused=value;$('pause-overlay').hidden=!value;$('pause').setAttribute('aria-label',value?'Resume game':'Pause game');$('pause').title=value?'Resume game':'Pause game';
    $('pause').innerHTML=value?'<svg viewBox="0 0 24 24"><path d="m8 4 12 8-12 8z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';
    $('drop').disabled=value||gameOver;
  }
  function finishGame() { gameOver=true;$('end-summary').textContent=`${score.toLocaleString()} points. A biggest number of ${biggest}. Beautifully doubled.`;$('end-overlay').hidden=false;$('drop').disabled=true;announce(`Game complete. Score ${score}.`);save(); }
  function drawCharacter(c,n,x,y,r,angle=0,opacity=1) {
    const [light,dark]=colors(n);c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=opacity;
    // Soft, original number characters with a gently rounded silhouette.
    const size=r*1.84,left=-size/2,top=-size/2,corner=size*.32;
    c.shadowColor='#345c4825';c.shadowBlur=4;c.shadowOffsetY=3;
    const grad=c.createLinearGradient(0,top,0,-top);grad.addColorStop(0,light);grad.addColorStop(1,dark);
    c.beginPath();c.roundRect(left,top,size,size,corner);c.fillStyle=grad;c.fill();c.shadowColor='transparent';
    c.lineWidth=1.4;c.strokeStyle=dark;c.stroke();
    c.beginPath();c.roundRect(left+3,top+3,size-6,size-9,corner-2);c.strokeStyle='#ffffff38';c.lineWidth=1.3;c.stroke();
    c.beginPath();c.ellipse(-r*.28,-r*.62,r*.32,r*.065,-.3,0,Math.PI*2);c.fillStyle='#ffffff6b';c.fill();
    const digits=String(n).length;
    c.fillStyle='#fffdf1';c.font=`1000 ${r*(digits===1?1.3:digits===2?1.02:digits===3?.76:.58)}px ${roundFont}`;
    c.textAlign='center';c.textBaseline='middle';c.shadowColor='#6d53332a';c.shadowOffsetY=2;c.fillText(n,0,-r*.2);c.shadowColor='transparent';
    const ey=r*.48,ex=r*.25;
    for(const e of [-ex,ex]){c.beginPath();c.ellipse(e,ey,r*.115,r*.13,0,0,Math.PI*2);c.fillStyle='#fffef5';c.fill();c.beginPath();c.ellipse(e+r*.015,ey+r*.025,r*.066,r*.075,0,0,Math.PI*2);c.fillStyle='#354a3c';c.fill();c.beginPath();c.arc(e+r*.03,ey-r*.01,r*.025,0,Math.PI*2);c.fillStyle='#fff';c.fill();}
    c.beginPath();c.arc(0,ey+r*.055,r*.1,.18,Math.PI-.18);c.strokeStyle='#43513c';c.lineWidth=Math.max(1,r*.04);c.stroke();
    for(const e of [-r*.48,r*.48]){c.beginPath();c.ellipse(e,ey+r*.13,r*.11,r*.055,0,0,Math.PI*2);c.fillStyle='#fff2d53e';c.fill();}c.restore();
  }
  function draw() {
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='#bbd2c520';ctx.lineWidth=.7;ctx.beginPath();for(let x=0;x<=W;x+=26){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=0;y<=H;y+=26){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();
    if(mode==='challenge') {ctx.save();ctx.setLineDash([4,6]);ctx.strokeStyle=pieces.some(b=>b.position.y-b.r<LINE&&simTime-b.born>1800)?'#d9826e':'#b0c5b68a';ctx.beginPath();ctx.moveTo(12,LINE);ctx.lineTo(W-12,LINE);ctx.stroke();ctx.setLineDash([]);ctx.font=`8px ${roundFont}`;ctx.fillStyle='#92aa97';ctx.fillText('KEEP BELOW THE LINE',13,LINE-9);ctx.restore();}
    if (!gameOver) {
      let bottom=H-radius(current);for(const b of pieces){const d=Math.abs(b.position.x-aim);if(d<b.r+radius(current)-4)bottom=Math.min(bottom,b.position.y-b.r-radius(current));}
      ctx.save();ctx.setLineDash([3,6]);ctx.strokeStyle='#86b09a66';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(aim,80);ctx.lineTo(aim,Math.max(85,bottom));ctx.stroke();ctx.restore();
      ctx.fillStyle='#739c8225';ctx.beginPath();ctx.ellipse(aim,H-8,radius(current)*.65,3.5,0,0,Math.PI*2);ctx.fill();
      drawCharacter(ctx,current,aim,44+(!reducedMotion?Math.sin(simTime*.002)*2:0),radius(current),0,simTime<cooldown?.45:.95);
    }
    for(const b of pieces){const age=simTime-b.born;const grow=age<180? .75+.25*Math.min(1,age/180):1;drawCharacter(ctx,b.number,b.position.x,b.position.y,b.r*grow,b.angle);}
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.c;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.life*5);ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);ctx.restore();}
    ctx.textAlign='center';ctx.font=`900 16px ${roundFont}`;for(const f of floaters){ctx.globalAlpha=Math.max(0,f.life);ctx.fillStyle='#417650';ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;
  }
  function step() {
    simTime+=1000/60;Engine.update(engine,1000/60);
    const queue=mergeQueue;mergeQueue=[];for(const [a,b] of queue)merge(a,b);pendingMerge.clear();
    for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.05;p.life-=.022;}particles=particles.filter(p=>p.life>0);
    for(const f of floaters){f.y-=.6;f.life-=.014;}floaters=floaters.filter(f=>f.life>0);
    for(const b of [...pieces]){
      if(b.position.y>H+150 || b.position.x < -150 || b.position.x>W+150) removePiece(b);
      if(mode==='challenge' && simTime-b.born>2000 && b.position.y-b.r<LINE && b.speed<.8){b.overflow+=1000/60;if(b.overflow>1400)finishGame();}else b.overflow=0;
    }
    $('drop').disabled=gameOver||simTime<cooldown;
    if(simTime-savedAt>2500){save();savedAt=simTime;}
  }
  let last=0,accumulator=0;
  function tick(time) {
    const elapsed=last?Math.min(time-last,50):0;last=time;
    if(!paused&&!gameOver&&!modalPaused){accumulator+=elapsed;while(accumulator>=1000/60){step();accumulator-=1000/60;if(gameOver)break;}}else accumulator=0;
    draw();requestAnimationFrame(tick);
  }
  function pointerAim(event) {const rect=canvas.getBoundingClientRect();aim=clampX((event.clientX-rect.left)/rect.width*W);}
  let pointerDown=false,pointerStart=0;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointerDown=true;pointerStart=e.pointerId;pointerAim(e);canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||pointerDown)pointerAim(e);});
  canvas.addEventListener('pointerup',e=>{if(pointerDown&&e.pointerId===pointerStart){pointerAim(e);drop();}pointerDown=false;});
  canvas.addEventListener('pointercancel',()=>{pointerDown=false;});
  document.addEventListener('keydown',e=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||$('dialog').open)return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();aim=clampX(aim+(e.key==='ArrowLeft'?-13:13));}
    if((e.code==='Space'||e.key==='Enter')&&(e.target===canvas||e.target===document.body)){e.preventDefault();if(!e.repeat)drop();}
    if(e.key.toLowerCase()==='p'&&!gameOver){e.preventDefault();setPaused(!paused);}
    if(e.key==='Escape'&&paused)setPaused(false);
  });
  $('drop').addEventListener('click',drop);$('pause').addEventListener('click',()=>{if(!gameOver)setPaused(!paused);});$('resume').addEventListener('click',()=>setPaused(false));$('play-again').addEventListener('click',newGame);
  $('sound').addEventListener('click',()=>{sound=!sound;updateSound();playTone(4,true);save();});
  function closeDialog() { $('dialog').close();modalPaused=false; }
  function showDialog(html) {modalPaused=true;$('dialog-content').innerHTML=html;$('dialog').showModal();}
  $('dialog').querySelector('.dialog-close').addEventListener('click',closeDialog);
  $('dialog').addEventListener('close',()=>{modalPaused=false;});
  $('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  $('help').addEventListener('click',()=>{
    showDialog('<span class="dialog-symbol">✦</span><h2>A little drop.<br>A lovely double.</h2><p>Move your number left or right, then tap the board or press <strong>Drop</strong>. On a keyboard, use the arrow keys and Space.</p><p>When two matching numbers touch, they become their double. <strong>2 + 2 = 4. Then 4 + 4 = 8!</strong> Every merge earns ten times the new number in points.</p><p><strong>Unlimited play</strong> makes space at the bottom when the board fills up. In <strong>Challenge</strong>, keep your stack below the dotted line.</p><p>Your game and personal best are saved on this device. Press P to pause, any time.</p><button class="primary" id="got-it">Let’s play <span>→</span></button>');$('got-it').onclick=closeDialog;
  });
  function confirmReset(onConfirm) {
    if(drops===0){onConfirm();return;}
    showDialog('<span class="dialog-symbol">↻</span><h2>A fresh little start?</h2><p>This clears your board and score. Your personal best will stay with you.</p><button class="primary" id="confirm-reset">Start a new game</button><button class="dialog-cancel" id="cancel-reset">Keep this game</button>');
    $('confirm-reset').onclick=()=>{closeDialog();onConfirm();};$('cancel-reset').onclick=closeDialog;
  }
  $('restart').addEventListener('click',()=>confirmReset(newGame));
  $('range').addEventListener('change',()=>{max=Number($('range').value);current=randomNumber();next=randomNumber();aim=clampX(aim);updateUI();save();toast(`New drops use numbers 1–${max}. Your board stays.`);});
  $('mode').addEventListener('click',()=>{
    showDialog('<span class="dialog-symbol">∞</span><h2>Your kind of play.</h2><p>Changing modes starts a fresh board.</p><button class="mode-option" id="choose-unlimited"><strong>∞ &nbsp; Unlimited play</strong><span>Room to explore. The board makes space as you grow.</span></button><button class="mode-option" id="choose-challenge"><strong>✧ &nbsp; Challenge</strong><span>Keep your numbers below the line. How far can you go?</span></button>');
    for(const m of ['unlimited','challenge'])$('choose-'+m).onclick=()=>{closeDialog();if(m!==mode)confirmReset(()=>{mode=m;newGame();toast(m==='challenge'?'Challenge on. Keep below the dotted line.':'No rush. Let’s make some doubles.');});};
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){save();if(drops>0&&!gameOver)setPaused(true);}});
  window.addEventListener('pagehide',save);
  const resize=new ResizeObserver(()=>{const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(canvas.clientWidth*dpr);canvas.height=Math.round(canvas.clientHeight*dpr);draw();});resize.observe(canvas);
  // Resume only valid game data, keeping storage errors from interrupting play.
  const s=prefs.session;
  if(s && Array.isArray(s.pieces) && s.pieces.length<250 && Number.isFinite(s.score) && Number.isFinite(s.current) && s.current>0){
    resetWorld();score=Math.max(0,s.score);best=Math.max(best,score);biggest=Math.max(2,Number(s.biggest)||2);drops=Math.max(0,Number(s.drops)||0);current=s.current;next=Number(s.next)||4;aim=clampX(Number(s.aim)||W/2);discovered=new Set(Array.isArray(s.discovered)?s.discovered:[1,2]);
    for(const p of s.pieces)if(Number.isFinite(p.n)&&p.n>0&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.y>-100&&p.y<H+50)makePiece(p.n,p.x,p.y,Number(p.angle)||0);
    updateUI();
  }else newGame();
  if(matchMedia('(pointer: coarse)').matches)$('drop-hint').textContent='Slide to aim · tap to drop';
  if(document.fonts)document.fonts.ready.then(updateUI);
  requestAnimationFrame(tick);
})();
