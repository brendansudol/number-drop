const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const Matter=require('../vendor/matter.min.js');
const source=fs.readFileSync(__dirname+'/../game.js','utf8');
function boot(data={}) {
  let raf,clock=0,stored=JSON.stringify(data);const els=new Map(),docListeners={};
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  function el(id){if(!els.has(id))els.set(id,{id,style:{},hidden:true,disabled:false,value:'',textContent:'',listeners:{},attrs:{},classList:{toggle(){},add(){},remove(){}},width:960,height:1080,clientWidth:480,clientHeight:540,tagName:id==='board'?'CANVAS':'BUTTON',getContext:()=>context,setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.listeners[k]=v;},querySelector:()=>el('close'),showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();},getBoundingClientRect:()=>({left:0,top:0,width:480,height:540}),focus(){},setPointerCapture(){}});return els.get(id);}
  const sandbox={Matter,console,document:{getElementById:el,addEventListener:(k,v)=>docListeners[k]=v,body:el('body')},localStorage:{getItem:()=>stored,setItem:(k,v)=>stored=v},matchMedia:()=>({matches:false}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:f=>raf=f,setTimeout:()=>1,clearTimeout(){},window:{addEventListener(){}}};
  vm.runInNewContext(source,sandbox);raf(1);
  const step=(n=180)=>{for(let i=0;i<n;i++){clock+=1000/60;raf(clock);}};
  const click=id=>el(id).listeners.click?.();
  return {step,click,el,state:()=>JSON.parse(stored),key:k=>docListeners.keydown({key:k,code:k===' '?'Space':k,target:el('board'),preventDefault(){}})};
}
const game=boot();assert.equal(game.state().session.pieces[0].n,2);
game.click('drop');game.step();assert.equal(game.el('score').textContent,'40');assert.deepEqual(game.state().session.pieces.map(p=>p.n),[4]);
game.click('drop');game.step();assert.equal(game.el('score').textContent,'120');assert.equal(game.state().session.biggest,8);console.log('PASS: physical 2+2→4 and 4+4→8, with exactly 120 points');
game.click('pause');const before=game.state().session.drops;game.click('drop');game.step();assert.equal(game.state().session.drops,before);assert.equal(game.el('drop').disabled,true);game.click('resume');console.log('PASS: pause blocks input and simulation');
const restored=boot(game.state());restored.step();assert.equal(restored.el('score').textContent,'120');assert.equal(restored.state().session.biggest,8);console.log('PASS: saved game restores score, board, and discovery');
const session=(pieces)=>({score:0,biggest:4,drops:1,current:2,next:4,aim:240,discovered:[1,2],pieces});
const triple=boot({session:session([{n:2,x:213,y:510},{n:2,x:240,y:350},{n:2,x:267,y:510}])});triple.step(360);assert.equal(triple.state().session.pieces.reduce((s,p)=>s+p.n,0),6);assert.equal(triple.el('score').textContent,'40');console.log('PASS: simultaneous collisions merge each piece at most once');
const chain=boot({session:session([{n:2,x:240,y:420},{n:2,x:240,y:466},{n:4,x:240,y:514}])});chain.step(420);assert.equal(chain.el('score').textContent,'120');assert.deepEqual(chain.state().session.pieces.map(p=>p.n),[8]);console.log('PASS: collision chain 2+2→4, then 4+4→8');
game.el('range').value='5';game.el('range').listeners.change();assert.ok(game.state().session.current<=5&&game.state().session.next<=5);assert.equal(game.state().session.score,120);console.log('PASS: number-range changes preserve existing progress');
const full=[];for(let row=0;row<9;row++)for(let col=0;col<7;col++)full.push({n:11+row*7+col,x:36+col*68,y:503-row*64});
const challenge=boot({mode:'challenge',session:session(full)});challenge.step(600);assert.equal(challenge.el('end-overlay').hidden,false);assert.equal(challenge.el('drop').disabled,true);console.log('PASS: sustained overflow ends Challenge and disables Drop');
const unlimited=boot({mode:'unlimited',session:session(full)});unlimited.step(180);const oldCount=unlimited.state().session.pieces.length;unlimited.click('drop');assert.ok(unlimited.state().session.pieces.length<oldCount);assert.equal(unlimited.el('end-overlay').hidden,true);console.log('PASS: Unlimited mode clears bottom pieces to keep play going');
