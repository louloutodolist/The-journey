
// Stickman Odyssey - single-file JS with data + scenes.
// Runs on Phaser 3.80+ loaded from CDN.
// No external assets; everything drawn with vector graphics/text.

const CONFIG = {
  W: 1024, H: 576, TILE: 32
};

const STATE = {
  player: { x: 8*CONFIG.TILE, y: 8*CONFIG.TILE, hp: 20, hpMax: 20, spirit: 0, gold: 10, atk: 4, def: 1, weapon: 'Wood Staff', skills:['Strike','Breathe','Metta'], karma:0, rapport:{} },
  chapter: 1,
  questLog: [],
  flags: {}
};

// --- Content (expandable) --- //

const TEACHINGS = [
  { id:'metta', title:'Metta (Loving-kindness)', text:"Cultivate unconditional friendliness toward yourself and all beings. Visualize someone you care for and silently repeat: 'May you be safe. May you be happy. May you be healthy. May you live with ease.' Then widen the circle.", rewardSpirit: 2 },
  { id:'tonglen', title:'Tonglen (Sending/Receiving)', text:"On the in-breath, imagine drawing in others' pain as dark smoke; on the out-breath, offer relief and compassion as clear light. Practice with humility and common sense.", rewardSpirit: 3 },
  { id:'shanti', title:'Shanti (Peace)', text:"Shanti is peace. Pause, sense the body, then speak or act only from steadiness. What is truly helpful here?", rewardSpirit: 2 },
];

const SKILLS = {
  'Strike': { type:'physical', power:1.0, cost:0, desc:'Simple staff strike.' },
  'Breathe': { type:'recover', spirit:1, heal:2, cost:0, desc:'Recover breath, heal a little.' },
  'Metta': { type:'focus', power:0.6, spiritGain:2, cost:0, desc:'A compassionate stance empowers your resolve.' },
  'StunTap': { type:'status', power:0.3, inflict:'stun', cost:0, desc:'Quick tap that may stun.'}
};

const ITEMS = [
  { id:'herb', name:'Forest Herb', kind:'consumable', heal:6, price:6, desc:'Bitter but healing.' },
  { id:'tea', name:'Calming Tea', kind:'consumable', heal:3, spirit:2, price:7, desc:'A warm pause.' },
  { id:'rope', name:'Rope', kind:'tool', price:4, desc:'Useful in side quests.'},
];

// 50 NPCs (a few with deeper content). The rest have short lines and can be expanded later.
const NPCS = (()=>{
  const arr = [];
  const key = (id, name, role, x, y, talk=[]) => ({ id, name, role, x, y, talk });
  // Key characters with choices
  arr.push(key('mentor','Old Conductor','mentor', 12*CONFIG.TILE, 8*CONFIG.TILE, [
    { text:"The line ended; your road begins. Will you travel with a soft heart?", choices:[
      {label:"Yes, teach me Metta.", effect: (scene)=> gainTeaching(scene,'metta') },
      {label:"I only need strength.", effect:(scene)=> { addKarma(-1); scene.notice('Pride dims insight (-Karma)'); } }
    ]}
  ]));
  arr.push(key('scav','Dock Scavenger','trader', 20*CONFIG.TILE, 12*CONFIG.TILE, [
    { text:"Ropes and herbs—honest salvage. Want anything?", shop:true}
  ]));
  arr.push(key('guard','Quiet Guard','ally', 14*CONFIG.TILE, 5*CONFIG.TILE, [
    { text:"If words fail, keep your breath steady. Trouble ahead—want to spar to practice?", choices:[
      {label:"Spar (turn-based).", effect:(scene)=> scene.startCombat({name:'Guard Drill', hp:14, atk:3, def:1, skills:['Strike','StunTap']}, {training:true}) },
      {label:"Not now.", effect:(scene)=> scene.notice('The guard nods.') }
    ]}
  ]));
  // Fill to ~50
  const names = ["Courier","Violinist","Fisher","Mapmaker","Archivist","Astronomer","Tinkerer","Monk","Baker","Scribe","Rider","Herbalist","Sailor","Nomad","Painter","Potter","Brewer","Healer","Carpenter","Smith","Glassblower","Gardener","Linguist","Tailor","Dyer","Clerk","Poet","Hatcher","Keeper","Miner","Weaver","Sentinel","Scout","Dancer","Cook","Gambler","Scholar","Mechanic","Child","Pilgrim","Elder","Vendor","Navigator","Swimmer","Mason","Bee-keeper","Shepherd","Harvester","Courier B","Courier C"];
  let i=0;
  for(const nm of names){
    arr.push(key('npc'+i, nm, 'townsfolk', (6+i%20)*CONFIG.TILE, (3+Math.floor(i/20)*6)*CONFIG.TILE, [
      { text:`${nm}: The world is wider than it looks. Keep your eyes kind.`}
    ])); i++;
  }
  return arr;
})();

const ENCOUNTERS = [
  { name:'Dock Rat', hp:12, atk:3, def:1, skills:['Strike']},
  { name:'Desert Shade', hp:16, atk:4, def:1, skills:['Strike','StunTap']},
];

function addKarma(v){ STATE.player.karma += v; }
function addSpirit(v){ STATE.player.spirit = Math.max(0, STATE.player.spirit + v); }

// --- Utility drawing --- //
function drawStick(g, x,y, color=0xffffff, facing=1){
  const s = 10;
  g.lineStyle(2, color, 1);
  g.strokeCircle(x, y-12, 6); // head
  g.strokeLineShape(new Phaser.Geom.Line(x, y-6, x, y+10)); // body
  g.strokeLineShape(new Phaser.Geom.Line(x, y+10, x-6, y+18)); // leg
  g.strokeLineShape(new Phaser.Geom.Line(x, y+10, x+6, y+18)); // leg
  g.strokeLineShape(new Phaser.Geom.Line(x, y, x+8*facing, y-2)); // arm
}

// --- Scenes --- //

class Overworld extends Phaser.Scene{
  constructor(){ super('overworld'); }
  create(){
    this.cameras.main.setBackgroundColor('#0b0e12');
    // Ground grid
    this.grid = this.add.graphics();
    this.grid.lineStyle(1, 0x243244, 0.7);
    for(let x=0;x<CONFIG.W;x+=CONFIG.TILE) this.grid.strokeLineShape(new Phaser.Geom.Line(x,0,x,CONFIG.H));
    for(let y=0;y<CONFIG.H;y+=CONFIG.TILE) this.grid.strokeLineShape(new Phaser.Geom.Line(0,y,CONFIG.W,y));
    // Player
    this.player = this.add.graphics();
    this.playerState = STATE.player;
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E');
    this.npcEls = [];
    NPCS.forEach(n=>{
      const g = this.add.graphics();
      drawStick(g, n.x, n.y, 0x9ad1ff);
      g.setData('id', n.id);
      this.npcEls.push(g);
    });
    this.hint = this.add.text(10, CONFIG.H-24, 'Move: WASD/Arrows  •  Interact: E  •  Menu: M', {fontFamily:'ui', fontSize:12, color:'#99a7b6'}).setDepth(10);
    this.ui = new UIPortal(this);
    this.time.addEvent({ delay: 40, loop:true, callback: ()=> this.redraw() });
    this.notice('Chapter '+STATE.chapter+': The Station at Dawn');
  }
  redraw(){
    this.player.clear();
    drawStick(this.player, this.playerState.x, this.playerState.y, 0xffffff);
  }
  update(){
    const speed = 2.2;
    let dx=0, dy=0;
    if(this.keys.A.isDown||this.keys.LEFT.isDown) dx-=1;
    if(this.keys.D.isDown||this.keys.RIGHT.isDown) dx+=1;
    if(this.keys.W.isDown||this.keys.UP.isDown) dy-=1;
    if(this.keys.S.isDown||this.keys.DOWN.isDown) dy+=1;
    const len = Math.hypot(dx,dy)||1;
    this.playerState.x = Phaser.Math.Clamp(this.playerState.x + speed*dx/len, 12, CONFIG.W-12);
    this.playerState.y = Phaser.Math.Clamp(this.playerState.y + speed*dy/len, 18, CONFIG.H-12);
    // Interact
    if(Phaser.Input.Keyboard.JustDown(this.keys.E)){
      const target = this.closestNPC();
      if(target && Phaser.Math.Distance.Between(this.playerState.x,this.playerState.y,target.x,target.y) < 30){
        openDialog(this, target);
      }else{
        this.notice('No one nearby.');
      }
    }
    if(Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey('M'))){
      this.ui.toggleMenu();
    }
  }
  closestNPC(){
    let best=null, bd=1e9;
    for(const g of this.npcEls){
      const n = NPCS.find(n=>n.id===g.getData('id'));
      const d = Phaser.Math.Distance.Between(this.playerState.x,this.playerState.y,n.x,n.y);
      if(d<bd){bd=d; best=n;}
    }
    return best;
  }
  startCombat(enemy, opts={}){
    this.scene.launch('combat', { enemy, return:'overworld', opts });
    this.scene.pause();
  }
  notice(msg){ this.ui.toast(msg); }
}

class Combat extends Phaser.Scene{
  constructor(){ super('combat'); }
  init(data){ this.enemy = structuredClone(data.enemy); this.return=data.return||'overworld'; this.opts=data.opts||{}; }
  create(){
    this.cameras.main.setBackgroundColor('#121c25');
    this.g = this.add.graphics();
    // Draw combatants
    drawStick(this.g, 250, 320, 0xffffff);
    drawStick(this.g, 760, 320, 0xffb1b1, -1);
    this.add.text(240, 260, 'You', {fontFamily:'ui', fontSize:14});
    this.add.text(700, 260, this.enemy.name, {fontFamily:'ui', fontSize:14});
    this.ui = new UIPortal(this);
    this.turn = 'player';
    this.playerHP = STATE.player.hp;
    this.enemyHP = this.enemy.hp;
    this.status = {};
    this.renderBars();
    this.promptPlayer();
  }
  renderBars(){
    const bar = (x,y,cur,max,color)=>{
      const w=220,h=12;
      const pct = Math.max(0, cur)/max;
      this.add.rectangle(x,y,w,h,0x1b2835).setOrigin(0,0);
      this.add.rectangle(x,y,Math.max(0,Math.floor(w*pct)),h,color).setOrigin(0,0);
    };
    bar(140,200,this.playerHP,STATE.player.hpMax,0x62ffa0);
    bar(620,200,this.enemyHP,this.enemy.hp,0xff6262);
    this.add.text(140,182,`HP ${this.playerHP}/${STATE.player.hpMax}  Spirit ${STATE.player.spirit}`,{fontFamily:'ui',fontSize:12});
    this.add.text(620,182,`HP ${this.enemyHP}/${this.enemy.hp}`,{fontFamily:'ui',fontSize:12});
  }
  promptPlayer(){
    const skills = STATE.player.skills;
    this.ui.dialog(`Choose your action:`, [
      ...skills.map(s=>({label:s, cb:()=> this.useSkill(s)})),
      {label:'Item', cb:()=> this.useItem()},
      {label:'De-escalate', cb:()=> this.deescalate()},
      {label:'Run', cb:()=> this.finish('fled')},
    ]);
  }
  damage(from,to,base){
    const atk = (from.atk||STATE.player.atk);
    const def = (to.def||this.enemy.def);
    const raw = Math.max(1, Math.round(base + atk - def));
    return raw;
  }
  useSkill(name){
    const S = SKILLS[name];
    let log = '';
    if(S.type==='physical'){
      const dmg = this.damage(STATE.player,this.enemy, Math.round(3*S.power));
      this.enemyHP = Math.max(0, this.enemyHP - dmg);
      log = `You used ${name}. Dealt ${dmg}.`;
    }else if(S.type==='recover'){
      this.playerHP = Math.min(STATE.player.hpMax, this.playerHP + (S.heal||2));
      addSpirit(S.spirit||0);
      log = `You steady your breath. +${S.heal||2} HP, +${S.spirit||0} Spirit.`;
    }else if(S.type==='focus'){
      addSpirit(S.spiritGain||2);
      const dmg = this.damage(STATE.player,this.enemy, Math.round(2*S.power));
      this.enemyHP = Math.max(0, this.enemyHP - dmg);
      log = `You center in compassion. +${S.spiritGain||2} Spirit, and a focused strike for ${dmg}.`;
    }else if(S.type==='status'){
      const dmg = this.damage(STATE.player,this.enemy, Math.round(2*S.power));
      this.enemyHP = Math.max(0, this.enemyHP - dmg);
      if(Math.random()<0.25) this.status.enemyStunned = 1;
      log = `You used ${name}. ${this.status.enemyStunned?'Enemy stunned! ':''}Dealt ${dmg}.`;
    }
    this.afterPlayer(log);
  }
  useItem(){
    const usable = ITEMS.filter(i=>i.kind==='consumable');
    this.ui.dialog('Use which item?', usable.map(it=>({
      label:`${it.name} (+${it.heal||0} HP${it.spirit?`, +${it.spirit} Spirit`:''})`,
      cb:()=>{
        this.playerHP = Math.min(STATE.player.hpMax, this.playerHP + (it.heal||0));
        addSpirit(it.spirit||0);
        this.afterPlayer(`You used ${it.name}.`);
      }
    })).concat([{label:'Back', cb:()=>this.promptPlayer()}]));
  }
  deescalate(){
    const success = Math.random()< (0.35 + STATE.player.spirit*0.02);
    if(success){ addKarma(1); this.finish('deescalated'); }
    else{ this.afterPlayer('You try to de-escalate, but tension remains.'); }
  }
  afterPlayer(log){
    this.children.removeAll(); // clear scene and redraw
    this.create();
    this.ui.toast(log);
    if(this.enemyHP<=0){ this.finish('win'); return; }
    this.time.delayedCall(600, ()=> this.enemyTurn(), [], this);
  }
  enemyTurn(){
    if(this.status.enemyStunned){ this.status.enemyStunned=0; this.ui.toast('Enemy is stunned.'); this.promptPlayer(); return; }
    const choice = Phaser.Utils.Array.GetRandom(this.enemy.skills||['Strike']);
    let dmg = Math.max(1, Math.round((this.enemy.atk||3) + (choice==='Strike'?3:2) - STATE.player.def));
    this.playerHP = Math.max(0, this.playerHP - dmg);
    this.ui.toast(`${this.enemy.name} used ${choice}. You took ${dmg}.`);
    if(this.playerHP<=0){ this.finish('lose'); }
    else this.time.delayedCall(700, ()=> this.promptPlayer(), [], this);
  }
  finish(result){
    // Persist back to overworld
    STATE.player.hp = Math.max(1, this.playerHP);
    // Rewards
    if(result==='win'){
      addSpirit(1); STATE.player.gold += 3; this.ui.toast('Victory! +Spirit +Gold');
    }else if(result==='deescalated'){
      addSpirit(2); this.ui.toast('Peace over force. +Spirit');
    }else if(result==='lose'){
      addKarma(-1); this.ui.toast('You were overwhelmed. -Karma');
    }
    this.time.delayedCall(800, ()=>{
      this.scene.stop();
      this.scene.resume(this.return);
    });
  }
}

class UIPortal{
  constructor(scene){
    this.scene = scene;
    this.root = document.createElement('div');
    this.root.className='ui-panel';
    this.root.innerHTML = `
      <span class="badge">HP: <b id="hpV"></b></span>
      <span class="badge">Spirit: <b id="spV"></b></span>
      <span class="badge">Gold: <b id="gdV"></b></span>
      <span class="badge">Karma: <b id="kmV"></b></span>
      <span class="badge">Weapon: <b id="wpV"></b></span>
      <span class="badge"><b>Press M</b> Menu</span>
    `;
    document.body.appendChild(this.root);
    this.dialogEl = null;
    this.toastEl = null;
    this.menuOpen = false;
    this.sync();
    scene.events.on('update', ()=> this.sync());
  }
  sync(){
    const p=STATE.player;
    this.root.querySelector('#hpV').textContent = `${p.hp}/${p.hpMax}`;
    this.root.querySelector('#spV').textContent = p.spirit;
    this.root.querySelector('#gdV').textContent = p.gold;
    this.root.querySelector('#kmV').textContent = p.karma;
    this.root.querySelector('#wpV').textContent = p.weapon;
  }
  dialog(text, choices=[]){
    this.closeDialog();
    const el = document.createElement('div');
    el.className='dialog';
    el.innerHTML = `<div style="font-size:14px; margin-bottom:6px">${text}</div>`;
    for(const c of choices){
      const a = document.createElement('div');
      a.className = 'choice';
      a.textContent = c.label;
      a.onclick = ()=>{ this.closeDialog(); c.cb && c.cb(); };
      el.appendChild(a);
    }
    document.body.appendChild(el);
    this.dialogEl = el;
  }
  closeDialog(){ if(this.dialogEl){ this.dialogEl.remove(); this.dialogEl=null; } }
  toast(text){
    if(this.toastEl) this.toastEl.remove();
    const el = document.createElement('div');
    el.className = 'float-notice';
    el.textContent = text;
    document.body.appendChild(el);
    this.toastEl = el;
    setTimeout(()=>{ el.remove(); this.toastEl=null; }, 2200);
  }
  toggleMenu(){
    if(this.menuOpen){ this.menu.remove(); this.menuOpen=false; return; }
    const el = document.createElement('div');
    el.className='dialog';
    const inv = ITEMS.filter(i=>i.kind==='consumable').map(i=>`• ${i.name}`).join('<br>');
    const teach = TEACHINGS.map(t=>`• ${t.title}`).join('<br>');
    el.innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <div>
          <b>Skills</b><br>${STATE.player.skills.map(s=>'• '+s).join('<br>')}
          <br><br><b>Teachings</b><br>${teach}
        </div>
        <div>
          <b>Items (examples)</b><br>${inv}
          <br><br><b>Quests</b><br>${STATE.questLog.map(q=>'• '+q).join('<br>') || '• (empty)'}
        </div>
      </div>
      <div class="choice" id="learnMetta">Reflect on Metta (+Spirit)</div>
      <div class="choice" id="closeMenu">Close</div>
    `;
    document.body.appendChild(el);
    el.querySelector('#closeMenu').onclick = ()=>{ el.remove(); this.menuOpen=false; };
    el.querySelector('#learnMetta').onclick = ()=>{
      gainTeaching(this.scene, 'metta', true);
    };
    this.menu = el; this.menuOpen = true;
  }
}

function gainTeaching(scene, id, viaMenu=false){
  const t = TEACHINGS.find(x=>x.id===id);
  if(!t){ scene.notice('Teaching not found'); return; }
  addSpirit(t.rewardSpirit);
  if(!viaMenu) scene.ui.dialog(`<b>${t.title}</b><br>${t.text}<br><br><i>+${t.rewardSpirit} Spirit</i>`, [{label:'Thank you', cb:()=>{}}]);
  else scene.ui.toast(`${t.title}: +${t.rewardSpirit} Spirit`);
}

// Dialog helpers
function openDialog(scene, npc){
  // Trader?
  if(npc.talk && npc.talk[0] && npc.talk[0].shop){
    const stock = ITEMS;
    scene.ui.dialog(`${npc.name}: ${npc.talk[0].text}`, stock.map(it=>({label:`Buy ${it.name} (${it.price}g)`, cb:()=>{
      if(STATE.player.gold>=it.price){ STATE.player.gold-=it.price; scene.notice(`Purchased ${it.name}`); }
      else scene.notice('Not enough gold.');
    }})).concat([{label:'Leave', cb:()=>{}}]));
    return;
  }
  // Normal scripted dialog
  let idx=0;
  const next = ()=>{
    if(idx>=npc.talk.length){ scene.ui.closeDialog(); return; }
    const node = npc.talk[idx++];
    if(node.choices){
      scene.ui.dialog(node.text, node.choices.map(c=>({label:c.label, cb:()=>{ c.effect && c.effect(scene); }})).concat([{label:'(close)', cb:()=>{}}]));
    }else{
      scene.ui.dialog(node.text, [{label:'Continue', cb:()=> next()}]);
    }
  };
  next();
}

// Boot game
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: CONFIG.W, height: CONFIG.H, parent:'game',
  physics:{ default:'arcade' },
  scene:[Overworld, Combat]
});
