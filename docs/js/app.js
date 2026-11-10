
const LETTERS="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const norm=s=>String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/ø/g,"o").trim();
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

/* ---------- rooms ---------- */
const CFG=window.AG_CONFIG||{};
const NATIVE=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
let ROOM=null,NET=null,PRACTICE=false;
const newRoomId=()=>{const a="abcdefghjkmnpqrstuvwxyz23456789";let s="";const r=new Uint32Array(10);(window.crypto||{getRandomValues:x=>x.map(()=>Math.random()*4e9)}).getRandomValues(r);for(const v of r)s+=a[v%a.length];return s};
const validRoom=r=>typeof r==="string"&&/^[a-z0-9]{6,16}$/.test(r);
const publicBase=()=>(CFG.PUBLIC_URL||location.href.split("?")[0].split("#")[0]);
const inviteLink=()=>publicBase()+"?g="+ROOM;

let ME=ls.get("ag-device");if(!ME){ME="d"+newRoomId();ls.set("ag-device",ME)}
const savedName=ls.get("ag-name")||"";
$("myName").value=savedName;$("homeName").value=savedName;

const blank=()=>({phase:"lobby",mode:"all",game:"high",players:[],li:0,pi:0,turns:[],skipped:[],used:[],rev:0,ts:0});
let S=blank();
const seats={}; // id -> {name,t,guest}

/* ---------- connection ---------- */
function connStatus(up,msg){
  $("dot").className="dot"+(up||PRACTICE?" live":"");
  $("connText").textContent=msg||(!ROOM?"Ready":PRACTICE?"Practice on this phone":up?"Live: moves show on every phone":"Connecting…");
}
function send(topic,obj){return NET?NET.publish(topic,obj):false}
function onState(g){
  if(!g||!Array.isArray(g.players))return;
  if(g.rev>S.rev||(g.rev===S.rev&&g.ts>S.ts)){S=g;render()}
}
function onSeat(id,v){
  if(!v){if(seats[id]){delete seats[id];render()}return}
  if(!v.name)return;
  const cur=seats[id];
  if(!cur||(v.u||0)>=(cur.u||0)){seats[id]=v;render()}
}
function enterRoom(room,practice){
  leaveRoom(true);
  ROOM=room;PRACTICE=!!practice;S=blank();lastTurnKey=undefined;
  NET=practice?AGNet.local():AGNet.online();
  NET.join(room,{onState,onSeat,onStatus:connStatus});
  if(!practice){ls.set("ag-room",room);try{history.replaceState(null,"","?g="+room)}catch(e){}}
  connStatus(NET.connected);render();window.scrollTo(0,0);
}
function leaveRoom(quiet){
  if(NET)NET.leave();NET=null;ROOM=null;PRACTICE=false;
  for(const k of Object.keys(seats))delete seats[k];
  S=blank();
  if(!quiet){try{history.replaceState(null,"",location.pathname)}catch(e){}connStatus(false);render()}
}
function commit(mutate){
  const next=JSON.parse(JSON.stringify(S));
  const err=mutate(next);
  if(err){flash(err,"err");return false}
  next.rev=(S.rev||0)+1;next.ts=Date.now();
  if(!send("state",next)){flash("Not connected right now. Give it a moment and try again.","err");return false}
  const before=S;S=next;render();notifyNext(before,next);return true;
}
function flash(t,cls){const el=S.phase==="lobby"?$("lobbyMsg"):$("msg");el.textContent=t||"";el.className="msg "+(cls||"")}

/* ---------- rules ---------- */
function advance(g){
  if(g.mode==="all"){g.pi++;if(g.pi>=g.players.length){g.pi=0;g.li++}}
  else{g.li++;g.pi=(g.pi+1)%g.players.length}
  skipDead(g);
  if(g.li>=roundsOf(g))g.phase="over";
}
// letters with no goalkeeper in our list are skipped in Goalkeepers mode
const NO_KEEPER=["Q","U","X","Y"];
// relay through A–Z: drop the hardest letters so everyone gets the same number of turns
const DROP_ORDER=["X","Z","Q","Y","U","V","J","K","I","O","E"];
function relayDrops(game,n){
  if(game==="pairs"||n<2)return [];
  const dead=game==="keepers"?NO_KEEPER:[];
  let left=26-dead.length;const out=[];
  for(const L of DROP_ORDER){if(left%n===0)break;if(!dead.includes(L)){out.push(L);left--}}
  return out;
}
function skipDead(g){
  if(isPairs(g))return;
  const dead=(g.game==="keepers"?NO_KEEPER:[]).concat(g.dropped||[]);
  while(g.li<26&&dead.includes(LETTERS[g.li])){if(!g.skipped.includes(LETTERS[g.li]))g.skipped.push(LETTERS[g.li]);g.li++}
}
// ---- player lookup ----
const K=x=>norm(x).replace(/['’`]/g,"").replace(/[-.]/g," ").replace(/\s+/g," ").trim();
const SURNAME_FIRST=new Set(["son","park","ki","lee","hwang","seol","kim","li","sun","zheng","dong","jung","ji"]);
const POSN={D:"Defender",M:"Midfielder",F:"Striker",G:"Goalkeeper"};
const posWords=ps=>[...ps].filter(x=>POSN[x]).map(x=>POSN[x].toLowerCase()).join(" / ");
const LOW_PENALTY=15;
const isLow=g=>(g||S).game==="low";
const isKeep=g=>(g||S).game==="keepers";
const isPairs=g=>(g||S).game==="pairs";
const PAIR_ROUNDS=10;
const roundsOf=g=>isPairs(g)?(g.pairs||[]).length:26;
const pairOf=(g,li)=>(g.pairs||[])[li]||["?","?"];
const labelAt=(g,li)=>isPairs(g)?pairOf(g,li).join("").toUpperCase():LETTERS[li];
const unit=n=>isPairs()?(n===1?"point":"points"):isKeep()?(n===1?"clean sheet":"clean sheets"):(n===1?"goal":"goals");
const ptsFor=(g,goals)=>isLow(g)&&goals===0?LOW_PENALTY:goals;
const ptsOf=t=>t.pts!=null?t.pts:t.goals;
const ranked=()=>S.players.map((p,i)=>({...p,i})).sort((a,b)=>isLow()?a.score-b.score:b.score-a.score);
const curPos=()=>isPairs()?null:isKeep()?"G":(S.positions?S.positions[S.li]:null);
const randPositions=()=>LETTERS.map(()=>"DMF"[Math.floor(Math.random()*3)]);
const mkIdx=(list,defPos)=>list.map(([name,goals,pos,alias])=>{
  const t=norm(name).replace(/['’.]/g,"").split(/\s+/).filter(Boolean);
  const sur=t.length>1?t.slice(1):t;
  const letters=new Set(sur.map(x=>x[0]));
  const sf=t.length>1&&SURNAME_FIRST.has(t[0]);
  if(sf)letters.add(t[0][0]);
  const aliasK=alias?K(alias):"";if(aliasK)letters.add(aliasK[0]);
  return {name,goals,aliasK,pos:pos||defPos||"",key:K(name),key2:sf?K(sur.join(" ")+" "+t[0]):"",alt:sf?K(t[0]):"",first:t.length>1?K(t[0]):"",surK:K(sur.join(" ")),lastK:K(t[t.length-1]),letters};
});
const IDX=mkIdx(PL),KIDX=mkIdx(KP,"G");
const pool=()=>isKeep()?KIDX:IDX;
function genericLetterOK(q,L){
  const w=K(q).split(" ").filter(Boolean),l=L.toLowerCase();
  if(!w.length)return false;
  if(w.length===1)return w[0][0]===l;
  return w.slice(1).some(x=>x[0]===l);
}
function candidates(q,idx){idx=idx||pool();
  const k=K(q);if(!k)return [];
  const exact=idx.filter(p=>p.key===k||p.key2===k||(p.aliasK&&p.aliasK===k));if(exact.length)return exact;
  const qt=k.split(" ");
  let m=idx.filter(p=>p.surK===k||p.lastK===k||p.alt===k);
  if(qt.length>1){
    const rest=qt.slice(1).join(" "),last=qt[qt.length-1];
    const same=idx.filter(p=>(p.surK===rest||p.lastK===last)&&p.first);
    const by3=same.filter(p=>p.first.slice(0,3)===qt[0].slice(0,3));if(by3.length)return by3;
    const byFirst=same.filter(p=>p.first[0]===qt[0][0]);if(byFirst.length)return byFirst;
    if(!m.length)m=idx.filter(p=>p.surK===rest||p.lastK===last);
  }
  return m;
}
function lev(a,b){if(Math.abs(a.length-b.length)>3)return 9;const d=[...Array(b.length+1).keys()];
  for(let i=1;i<=a.length;i++){let prev=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t}}return d[b.length]}
function fuzzy(q,L){const idx=pool();
  const k=K(q),l=L.toLowerCase();if(k.replace(/ /g,"").length<4)return [];
  const len=k.replace(/ /g,"").length,lim=len>=9?3:len>=5?2:1;let best=9,hits=[];
  const lastT=k.split(" ").pop();
  for(const p of idx){if(!p.letters.has(l))continue;
    const d=Math.min(lev(k,p.key),lev(k,p.surK),lev(k,p.lastK),lev(lastT,p.lastK)+(k.includes(" ")?1:0),p.alt?lev(k,p.alt):9,p.aliasK?lev(k,p.aliasK):9);
    if(d<best){best=d;hits=[p]}else if(d===best)hits.push(p)}
  return best<=lim?hits:[];
}
const canPlay=(g,dev)=>{const p=g.players[g.pi];return !!p&&(p.guest||p.dev===dev)};
const seatList=()=>Object.entries(seats).map(([id,v])=>({id,...v})).sort((a,b)=>a.t-b.t);

/* ---------- render ---------- */
let viewTable=false,lastKey="";
function render(){
  const ph=S.phase,inRoom=!!ROOM;
  if(ph!=="over")viewTable=false;
  $("home").hidden=inRoom;$("leaveBtn").hidden=!inRoom;
  if(!inRoom){["lobby","game","result","alerts"].forEach(id=>$(id).hidden=true);renderHome();return}
  $("lobby").hidden=ph!=="lobby";
  $("game").hidden=!(ph==="playing"||(ph==="over"&&viewTable));
  $("result").hidden=!(ph==="over"&&!viewTable);
  if(ph==="lobby")renderLobby();
  else if(ph==="over"&&!viewTable)renderResult();
  else renderGame();
  $("alerts").hidden=PRACTICE||!(seats[ME]||S.players.some(p=>p.dev===ME));
  $("ntfyStep").hidden=false;
  renderAlerts();
  checkMyTurn();
}
function renderLobby(){
  const list=seatList(),box=$("seats");box.innerHTML="";
  if(!list.length)box.innerHTML='<div class="waiting">Nobody\'s in yet. Type your name and tap Join.</div>';
  list.forEach(p=>{
    const d=document.createElement("div");d.className="seat";
    const n=document.createElement("div");n.innerHTML='<div class="nm"></div><div class="tag"></div>';
    n.querySelector(".nm").textContent=p.name;
    n.querySelector(".tag").textContent=p.id===ME?"You":(p.guest?"Shares a phone":"On their phone");
    d.appendChild(n);
    const b=document.createElement("button");b.type="button";b.textContent=p.id===ME?"Leave":"Remove";
    b.onclick=()=>{send("seat/"+p.id,null);delete seats[p.id];render()};d.appendChild(b);
    box.appendChild(d);
  });
  $("joinBox").hidden=!!seats[ME];
  $("modeAll").checked=S.mode!=="relay";$("modeRelay").checked=S.mode==="relay";
  $("gameHigh").checked=!isLow()&&!isKeep();$("gameLow").checked=isLow();$("gameKeep").checked=isKeep();$("gameEuro").checked=isPairs();$("gameHigh").checked=$("gameHigh").checked&&!isPairs();
  $("start").disabled=!list.length;
  $("start").textContent=list.length<2?"Kick off":"Kick off with "+list.length+" players";
  $("soloHint").hidden=PRACTICE||list.length>1;
  $("inviteBox").hidden=PRACTICE;$("practiceNote").hidden=!PRACTICE;
  $("guestRow").hidden=PRACTICE;$("clearRow").hidden=PRACTICE;
  $("waShare").href="https://wa.me/?text="+encodeURIComponent(inviteText());
  $("shareBtn").hidden=!(navigator.share||NATIVE);
  if(PRACTICE)$("start").textContent="Kick off";
}
const myTurn=()=>canPlay(S,ME);
function renderGame(){
  const PR=isPairs(),pr=pairOf(S,S.li).map(x=>x.toUpperCase());
  if(PR&&!EIDX)loadEurope().then(render).catch(()=>{});
  const over=S.phase==="over",L=over?"FT":PR?pr.join(" "):LETTERS[S.li];
  $("big").classList.toggle("pair",PR&&!over);
  const strip=$("strip");strip.innerHTML="";
  if(PR){(S.pairs||[]).forEach((_,i)=>{const d=document.createElement("div");d.textContent=String(i+1);
      if(i<S.li)d.className=S.skipped.includes(labelAt(S,i))?"done skip":"done";else if(i===S.li&&!over)d.className="now";strip.appendChild(d)})}
  else LETTERS.forEach((x,i)=>{const d=document.createElement("div");d.textContent=x;
    if(i<S.li)d.className=S.skipped.includes(x)?"done skip":"done";
    if(i===S.li&&!over)d.className="now";strip.appendChild(d)});
  const key=S.li+":"+S.pi+":"+S.phase,big=$("big");big.textContent=L;
  if(key!==lastKey){big.classList.remove("pop");void big.offsetWidth;big.classList.add("pop");$("pname").value="";hideChoices();$("msg").textContent="";lastKey=key}
  const cur=S.players[S.pi];
  const inGame=S.players.some(p=>p.dev===ME);
  if(over){$("onball").textContent="Full time";$("onball").className="label";$("who").textContent="Match over";$("hint").textContent="Start a new game to play again."}
  else{const mine=myTurn();$("onball").textContent=mine?"Your turn":"On the ball";$("onball").className="label"+(mine?" yourturn":"");
    $("who").textContent=cur?cur.name:"";$("hint").textContent=(PR?"First name "+pr[0]+", surname "+pr[1]+" · round "+(S.li+1)+" of "+roundsOf(S):(curPos()?"A "+POSN[curPos()].toLowerCase()+" whose surname begins with ":"Surname beginning with ")+L)+(S.mode==="all"&&S.players.length>1?" · turn "+(S.pi+1)+" of "+S.players.length:"")}
  $("skipL").hidden=PR&&S.mode==="relay";
  $("pass").textContent=isLow()?"Pass (+"+LOW_PENALTY+")":"Pass (0)";
  const P=!over&&curPos();$("posPill").hidden=!P;if(P)$("posPill").textContent=POSN[P];
  const canAct=!over&&myTurn();
  $("controls").hidden=!canAct;$("waiting").hidden=canAct||over;
  if(!canAct&&!over&&cur)$("waiting").textContent=(inGame?"":"You're watching this match and can join the next one. ")+"Waiting for "+cur.name+(PR?" to name a player with initials "+pr[0]+" "+pr[1]+"…":" to pick a "+(curPos()?POSN[curPos()].toLowerCase():"player")+" beginning with "+L+"…");
  renderTable();renderLog();
}
function renderTable(){
  const order=ranked();
  $("scoreHead").textContent=isPairs()?"Points":isKeep()?"Clean sheets":"Goals";
  $("tableLabel").textContent=isPairs()?"Table · most points wins":isKeep()?"Table · most clean sheets wins":isLow()?"Table · fewest goals wins":"Table · most goals wins";
  $("table").innerHTML=order.map((p,k)=>`<tr class="${S.phase==="playing"&&p.i===S.pi?"active":""}"><td class="pos">${k+1}</td><td>${esc(p.name)}${p.dev===ME?' <span class="tag">You</span>':""}</td><td class="r">${p.count}</td><td class="pts">${p.score}</td></tr>`).join("");
}
function renderLog(){
  const nm=i=>S.players[i]?S.players[i].name:"?";
  const items=[...S.turns].reverse();
  $("log").innerHTML=items.length?items.map(t=>`<div><span class="L">${t.letter}${t.pos?'<span class="pt">'+t.pos.replace("F","ST").replace("D","DEF").replace("M","MID")+'</span>':""}</span><span class="n ${t.pass?"pass":""}">${esc(nm(t.pi))}: ${t.skip?"skipped "+t.letter+" for everyone":t.pass?"passed":esc(t.name)}</span><span class="gl">${t.skip?"–":(ptsOf(t)!==t.goals?(t.pass?"":"0 → ")+"+"+ptsOf(t):(t.pass?"–":"+"+t.goals))}</span></div>`).join(""):'<div><span class="L">–</span><span class="n pass">No turns yet.</span><span></span></div>';
}
function renderResult(){
  const order=ranked();
  if(!order.length){$("winner").textContent="Full time";$("winSub").textContent="";return}
  const top=order.filter(p=>p.score===order[0].score);
  $("winner").textContent=top.length>1?"Draw: "+top.map(p=>p.name).join(" & "):order[0].name+" wins";
  $("winSub").textContent=order.map(p=>p.name+" "+p.score).join(" · ");
}

/* ---------- lobby actions ---------- */
function joinMe(){
  const name=$("myName").value.trim();
  if(!name){flash("Type your name first.","err");$("myName").focus();return}
  ls.set("ag-name",name);
  const v={...(seats[ME]||{}),name,t:seats[ME]?seats[ME].t:Date.now(),u:Date.now()};
  if(!send("seat/"+ME,v)){flash("Still connecting. Try again in a moment.","err");return}
  seats[ME]=v;flash("You're in. Kick off when everyone's here.","ok");render();
}
$("join").onclick=joinMe;
$("myName").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();joinMe()}});
$("addGuest").onclick=()=>{
  const name=$("guestName").value.trim();if(!name)return;
  const id="g"+Math.random().toString(36).slice(2,9),v={name,t:Date.now(),u:Date.now(),guest:true};
  if(!send("seat/"+id,v)){flash("Still connecting. Try again in a moment.","err");return}
  seats[id]=v;$("guestName").value="";render();
};
const pickedGame=()=>$("gameLow").checked?"low":$("gameKeep").checked?"keepers":$("gameEuro").checked?"pairs":"high";
["gameHigh","gameLow","gameKeep","gameEuro"].forEach(id=>$(id).onchange=()=>commit(g=>{g.game=pickedGame()}));
["modeAll","modeRelay"].forEach(id=>$(id).onchange=()=>commit(g=>{g.mode=$("modeRelay").checked?"relay":"all"}));
$("clearSquad").onclick=()=>$("clearConfirm").hidden=false;
$("clearNo").onclick=()=>$("clearConfirm").hidden=true;
$("clearYes").onclick=()=>{Object.keys(seats).forEach(id=>{send("seat/"+id,null);delete seats[id]});$("clearConfirm").hidden=true;render()};
$("start").onclick=async()=>{
  const list=seatList();
  if(!list.length){flash("Someone needs to join first.","err");return}
  let pairs=null;
  if(pickedGame()==="pairs"){
    flash("Loading European players…","");
    try{await loadEurope()}catch(e){flash("Couldn't load the player list. Check your internet and try again.","err");return}
    // every player gets their own two letters each turn, PAIR_ROUNDS turns each
    const n=list.length,relay=$("modeRelay").checked;
    pairs=drawPairs(relay&&n>1?Math.ceil(PAIR_ROUNDS/n)*n:PAIR_ROUNDS);if(relay&&n>1&&pairs.length%n)pairs=pairs.slice(0,pairs.length-pairs.length%n);flash("");
  }
  commit(g=>{
    g.phase="playing";g.game=pickedGame();g.pairs=pairs;g.positions=randPositions();g.mode=$("modeRelay").checked?"relay":"all";g.li=0;g.pi=0;g.turns=[];g.skipped=[];g.used=[];
    g.players=list.map(p=>({name:p.name,dev:p.guest?null:p.id,guest:!!p.guest,score:0,count:0}));
    g.dropped=g.mode==="relay"?relayDrops(g.game,list.length):[];skipDead(g);
  });
};

/* ---------- turn actions ---------- */
$("pname").addEventListener("input",()=>{flash("");hideChoices()});
$("pname").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submit()}});
function turnGuard(g,li,pi){if(g.phase!=="playing"||g.li!==li||g.pi!==pi)return "That turn has moved on.";if(!canPlay(g,ME))return "It's not your turn.";return null}
function hideChoices(){$("choices").hidden=true;$("choices").innerHTML=""}
function showChoices(text,opts){
  const box=$("choices");box.innerHTML="";
  const p=document.createElement("p");p.textContent=text;box.appendChild(p);
  const row=document.createElement("div");row.className="opts";
  opts.forEach(([label,fn,primary])=>{const b=document.createElement("button");b.type="button";b.textContent=label;if(primary)b.className="primary";b.onclick=fn;row.appendChild(b)});
  box.appendChild(row);box.hidden=false;
}
function play(name,key,goals,reveal){
  const li=S.li,pi=S.pi,L=labelAt(S,li);
  hideChoices();
  if(S.used.includes(key)){flash(name+" has already been named this game.","err");return}
  if(commit(g=>{const e=turnGuard(g,li,pi);if(e)return e;if(g.used.includes(key))return name+" has already been named this game.";
    const pts=ptsFor(g,goals);
    g.turns.push({letter:L,pos:!isPairs(g)&&g.positions?g.positions[li]:"",pi,name,key,goals,pts,pass:false,li});g.used.push(key);
    g.players[pi].score+=pts;g.players[pi].count++;advance(g)})){
    const m=$("msg");m.className="msg ok";m.innerHTML="";const r=document.createElement("span");r.className="reveal";
    if(window.agHaptic)window.agHaptic();
    r.textContent=reveal||(name+": "+goals+" "+unit(goals)+(isLow()&&goals===0?". That's +"+LOW_PENALTY+"!":""));m.appendChild(r);
  }
}
const retry=()=>{hideChoices();$("pname").focus();$("pname").select()};
function submit(){
  if(isPairs())return submitPairs();
  const q=$("pname").value.trim(),L=LETTERS[S.li],l=L.toLowerCase();
  hideChoices();
  if(!q){flash("Type a player's name first, or pass.","err");return}
  const all=candidates(q);
  if(isKeep()&&!all.length){
    const out=candidates(q,IDX).filter(p=>p.letters.has(l));
    if(out.length){flash((out.length===1?out[0].name:q)+" isn't a goalkeeper. Name a keeper.","err");return}
  }
  const fit=all.filter(p=>p.letters.has(l));
  if(all.length&&!fit.length){flash(all[0].name+"'s surname doesn't start with "+L+".","err");return}
  const P=curPos(),want=P?POSN[P].toLowerCase():"";
  const posFit=P?fit.filter(p=>!p.pos||p.pos.includes(P)):fit;
  if(fit.length&&!posFit.length){
    flash(fit.length===1?fit[0].name+" is listed as a "+posWords(fit[0].pos)+", not a "+want+".":"None of the players called "+q+" are listed as a "+want+".","err");return}
  if(posFit.length){
    const free=posFit.filter(p=>!S.used.includes(p.key));
    if(!free.length){flash(fit[0].name+" has already been named this game.","err");return}
    if(free.length===1){play(free[0].name,free[0].key,free[0].goals);return}
    const list=[...free].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,16);
    showChoices("Which one do you mean?",list.map(p=>[p.name,()=>play(p.name,p.key,p.goals)]).concat([["None of these",retry]]));
    return;
  }
  if(!genericLetterOK(q,L)){flash(q+"'s surname doesn't start with "+L+".","err");return}
  const fz=(fuzzy(q,L)||[]).filter(p=>!S.used.includes(p.key)&&(!P||!p.pos||p.pos.includes(P))).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8);
  if(fz.length){
    showChoices(fz.length===1?"Did you mean "+fz[0].name+"?":"Did you mean one of these?",
      fz.map(p=>[fz.length===1?"Yes, "+p.name:p.name,()=>play(p.name,p.key,p.goals),fz.length===1]).concat([["No, let me retype",retry]]));
    return;
  }
  flash("Can't find "+(isKeep()?"a goalkeeper":"a player")+" called "+q+" in our list. Check the spelling and try again, or pass.","err");
}
$("submit").onclick=submit;
$("pass").onclick=()=>{const li=S.li,pi=S.pi;commit(g=>{const e=turnGuard(g,li,pi);if(e)return e;const pts=ptsFor(g,0);g.turns.push({letter:labelAt(g,li),pos:!isPairs(g)&&g.positions?g.positions[li]:"",pi,pass:true,goals:0,pts,li});g.players[pi].score+=pts;advance(g)})};
$("skipL").onclick=()=>{const li=S.li,pi=S.pi,L=LETTERS[li];commit(g=>{const e=turnGuard(g,li,pi);if(e)return e;
  if(isPairs(g)&&g.mode==="relay")return "Use Pass in Two letters relay.";
  const LB=labelAt(g,li);g.turns.push({letter:LB,pi,skip:true,pass:true,goals:0,li,prevPi:pi});g.skipped.push(LB);g.li++;if(g.mode==="all")g.pi=0;skipDead(g);if(g.li>=roundsOf(g))g.phase="over"})};
const toLobby=()=>commit(g=>{g.phase="lobby";g.li=0;g.pi=0;g.turns=[];g.skipped=[];g.used=[];g.players=[]});
$("restart").onclick=()=>$("confirmRow").hidden=false;
$("noRestart").onclick=()=>$("confirmRow").hidden=true;
$("yesRestart").onclick=()=>{$("confirmRow").hidden=true;toLobby()};
$("again").onclick=toLobby;
$("seeTable").onclick=()=>{viewTable=true;render()};

/* ---------- Two letters: Europe ---------- */
let EIDX=null,EPAIRS=null,eLoading=null;
const STAT_WORD={g:"career goals",a:"career assists",cs:"career clean sheets",pg:"top-flight goals in England",pa:"top-flight assists in England",pcs:"top-flight clean sheets in England",dcs:"top-flight clean sheets in England",ecs:"career clean sheets (estimated)",xg:"career goals (approx.)",ea:"career assists (estimated)",xcs:"career clean sheets (estimated)"};
function loadEurope(){
  if(EIDX)return Promise.resolve();
  if(eLoading)return eLoading;
  eLoading=fetch("europe.txt").then(r=>{if(!r.ok)throw new Error("load");return r.text()}).then(txt=>{
    const list=[],types=[];
    for(const line of txt.split("\n")){if(!line)continue;const [name,pos,b]=line.split("|");
      const m=b?b.match(/^(\d+)(g|a|cs|pg|pa|pcs|dcs|ecs|xg|xcs|ea)$/):null;list.push([name,m?+m[1]:0,pos||""]);types.push(m?m[2]:"")}
    EIDX=mkIdx(list);EIDX.forEach((p,i)=>p.type=types[i]);
    EPAIRS={};for(const p of EIDX){if(!p.first)continue;const k=p.first[0]+p.lastK[0];if(/^[a-z]{2}$/.test(k))(EPAIRS[k]=EPAIRS[k]||[]).push(p)}
  }).catch(e=>{eLoading=null;throw e});
  return eLoading;
}
function drawPairs(n){
  const ok=Object.keys(EPAIRS).filter(k=>EPAIRS[k].length>=15),out=[];
  while(out.length<n&&ok.length){const k=ok.splice(Math.floor(Math.random()*ok.length),1)[0];out.push([k[0],k[1]])}
  return out;
}
const pairPool=(f,s)=>EIDX.filter(p=>p.first&&p.first[0]===f&&p.letters.has(s));
function playPair(p){
  const pts=10+(p.goals||0);
  const reveal=p.type?p.name+": 10 + "+(p.goals||0)+" "+STAT_WORD[p.type]+" = "+pts+" points":p.name+": 10 points";
  play(p.name,p.key,pts,reveal);
}
function submitPairs(){
  const q=$("pname").value.trim();hideChoices();
  if(!q){flash("Type a player's name first, or pass.","err");return}
  if(!EIDX){flash("Still loading the player list. Try again in a second.","");loadEurope().then(render).catch(()=>{});return}
  const [f,s2]=pairOf(S,S.li),F=f.toUpperCase(),S2=s2.toUpperCase();
  const all=candidates(q,EIDX);
  const fit=all.filter(p=>p.first&&p.first[0]===f&&p.letters.has(s2));
  if(all.length&&!fit.length){flash((all.length===1?all[0].name:q)+" doesn't match "+F+" "+S2+". First name must start with "+F+" and surname with "+S2+".","err");return}
  if(fit.length){
    const free=fit.filter(p=>!S.used.includes(p.key));
    if(!free.length){flash(fit[0].name+" has already been named this game.","err");return}
    if(free.length===1){playPair(free[0]);return}
    const list=[...free].sort((a,b)=>a.name.localeCompare(b.name)).slice(0,16);
    showChoices("Which one do you mean?",list.map(p=>[p.name,()=>playPair(p)]).concat([["None of these",retry]]));
    return;
  }
  const w=K(q).split(" ");
  if(w.length<2){flash("Type his first name and surname.","err");return}
  if(w[0][0]!==f||!w.slice(1).some(x=>x[0]===s2)){flash(q+" doesn't match "+F+" "+S2+".","err");return}
  const k=K(q),len=k.replace(/ /g,"").length,lim=len>=9?3:len>=5?2:1;let best=9,hits=[];
  for(const p of pairPool(f,s2)){if(S.used.includes(p.key))continue;
    const d=Math.min(lev(k,p.key),lev(w[w.length-1],p.lastK)+1);
    if(d<best){best=d;hits=[p]}else if(d===best)hits.push(p)}
  if(best<=lim&&hits.length){hits=hits.sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8);
    showChoices(hits.length===1?"Did you mean "+hits[0].name+"?":"Did you mean one of these?",
      hits.map(p=>[hits.length===1?"Yes, "+p.name:p.name,()=>playPair(p),hits.length===1]).concat([["No, let me retype",retry]]));return}
  flash("Can't find a player called "+q+" in England or Europe's top leagues. Check the spelling and try again, or pass.","err");
}

/* ---------- turn alerts ---------- */
const NTFY="https://ntfy.sh/";
const topicFor=dev=>"alphabetgoals-"+ROOM+"-"+dev;
const gameLink=()=>ROOM&&!PRACTICE?inviteLink():publicBase();
const isIOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
let swReg=null,audioCtx=null,myLastMove=0,lastTurnKey=null,flashTimer=null;
if(!NATIVE&&"serviceWorker" in navigator){navigator.serviceWorker.register("sw.js").then(r=>swReg=r).catch(()=>{})}
const notifOK=()=>"Notification" in window&&Notification.permission==="granted";
function unlockAudio(){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume()}catch(e){}}
document.addEventListener("pointerdown",unlockAudio,{once:true});
function chime(){try{if(!audioCtx)return;const t=audioCtx.currentTime;
  [[880,0],[1175,.18]].forEach(([f,d])=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,t+d);g.gain.exponentialRampToValueAtTime(0.3,t+d+.02);g.gain.exponentialRampToValueAtTime(0.0001,t+d+.35);
    o.connect(g).connect(audioCtx.destination);o.start(t+d);o.stop(t+d+.4)})}catch(e){}}
function turnText(g){if(isPairs(g)){const pr=pairOf(g,g.li).map(x=>x.toUpperCase());return "Your turn: name a player with initials "+pr[0]+" "+pr[1];}
  const L=LETTERS[g.li],P=isKeep(g)?"G":(g.positions?g.positions[g.li]:null);
  return "Your turn: "+(P?"a "+POSN[P].toLowerCase():"a player")+" beginning with "+L;}
function flashTitle(){if(flashTimer)return;const base=document.title;let on=false;
  flashTimer=setInterval(()=>{document.title=(on=!on)?"🔔 Your turn!":base},1000);
  const stop=()=>{if(!document.hidden){clearInterval(flashTimer);flashTimer=null;document.title=base;document.removeEventListener("visibilitychange",stop)}};
  document.addEventListener("visibilitychange",stop);}
function alertMyTurn(){
  chime();if(window.agHaptic)window.agHaptic();
  try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}
  if(document.hidden){
    flashTitle();
    if(notifOK()){const body=turnText(S),opts={body,tag:"ag-turn",renotify:true,icon:"icon-192.png",badge:"icon-192.png"};
      if(swReg&&swReg.showNotification)swReg.showNotification("Alphabet Goals ⚽",opts).catch(()=>{});
      else{try{new Notification("Alphabet Goals ⚽",opts)}catch(e){}}}
  }
}
function checkMyTurn(){
  const mine=S.phase==="playing"&&S.players.length>1&&S.players[S.pi]&&S.players[S.pi].dev===ME;
  const key=mine?S.li+":"+S.pi+":"+S.turns.length:null;
  if(mine&&key!==lastTurnKey&&lastTurnKey!==undefined&&Date.now()-myLastMove>1500)alertMyTurn();
  lastTurnKey=key;
}
lastTurnKey=undefined; // no alert for the state that loads with the page
setTimeout(()=>{if(lastTurnKey===undefined)lastTurnKey=null},4000);
function notifyNext(before,g){
  myLastMove=Date.now();
  if(g.phase!=="playing")return;
  const p=g.players[g.pi];if(!p||!p.dev||p.dev===ME)return;
  if(before.phase==="playing"&&before.li===g.li&&before.pi===g.pi)return; // turn didn't move on
  const seat=seats[p.dev];if(!seat||!seat.ntfy)return;
  fetch(NTFY+topicFor(p.dev),{method:"POST",body:turnText(g),headers:{Title:"Alphabet Goals - your go!",Tags:"soccer",Priority:"high",Click:gameLink()}}).catch(()=>{});
}
function renderAlerts(){
  const pop=notifOK(),lock=!!(seats[ME]&&seats[ME].ntfy);
  const st=$("alertState");st.textContent=[pop?"pop-ups on":"",lock?"lock screen on":""].filter(Boolean).join(" · ")||"off";
  st.className="astate"+(pop||lock?" on":"");
  $("ntfyTopic").value=topicFor(ME);
  $("ntfyDeep").href="ntfy://ntfy.sh/"+topicFor(ME);
  $("stepAndroid").hidden=isIOS;$("stepIosLead").textContent=isIOS?"Copy your alert code":"If that button does nothing, copy your alert code";
  $("alertOn").textContent=pop?"Alerts are on ✓":"Turn on alerts";
}
function setNtfyFlag(){if(!seats[ME])return;const v={...seats[ME],ntfy:true,u:Date.now()};if(send("seat/"+ME,v))seats[ME]=v;renderAlerts()}
$("alertOn").onclick=async()=>{
  unlockAudio();chime();
  const m=$("alertOnMsg");
  if(!("Notification" in window)){m.className="msg";m.textContent=isIOS?"Sound and buzz are on. For pop-ups on iPhone, add the game to your Home Screen first (Share → Add to Home Screen), open it from there and tap this again.":"Sound is on. This browser doesn't do pop-up notifications.";return}
  try{const r=await Notification.requestPermission();
    m.className="msg "+(r==="granted"?"ok":"err");
    m.textContent=r==="granted"?"Done. You'll get a pop-up when it's your go.":"Notifications are blocked. Allow them for this site in your browser settings, then tap again.";
  }catch(e){m.textContent="Couldn't turn on pop-ups in this browser."}
  renderAlerts();
};
$("copyTopic").onclick=()=>{const v=$("ntfyTopic").value;
  (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(()=>{$("ntfyMsg").className="msg ok";$("ntfyMsg").textContent="Copied. Now paste it in ntfy."}).catch(()=>{$("ntfyTopic").select()});
  setNtfyFlag();};
$("ntfyDeep").addEventListener("click",()=>setNtfyFlag());
$("ntfyTest").onclick=()=>{
  setNtfyFlag();const m=$("ntfyMsg");m.className="msg";m.textContent="Sending…";
  fetch(NTFY+topicFor(ME),{method:"POST",body:"Test alert. This is what you'll see when it's your go.",headers:{Title:"Alphabet Goals - test",Tags:"soccer",Click:gameLink()}})
    .then(r=>{m.className="msg "+(r.ok?"ok":"err");m.textContent=r.ok?"Sent. Check your phone. If nothing arrives, make sure you subscribed in ntfy.":"Couldn't send just now. Try again in a moment."})
    .catch(()=>{m.className="msg err";m.textContent="Couldn't send. Check your internet and try again."});
};

/* ---------- home, invites, leaving ---------- */
function inviteText(){return "⚽ Alphabet Goals: name a footballer for every letter, best score wins. Tap to join my game:\n"+inviteLink()}
function renderHome(){
  const last=ls.get("ag-room");$("backGame").hidden=!validRoom(last);
}
function homeName(){
  const n=$("homeName").value.trim();
  if(!n){$("homeMsg").className="msg err";$("homeMsg").textContent="Type your name first.";$("homeName").focus();return null}
  ls.set("ag-name",n);$("myName").value=n;$("homeMsg").textContent="";return n;
}
function seatMe(name){
  const v={...(seats[ME]||{}),name,t:seats[ME]?seats[ME].t:Date.now(),u:Date.now()};
  if(send("seat/"+ME,v)){seats[ME]=v;render();return true}
  return false;
}
function seatWhenReady(name,tries){
  tries=tries||0;
  if(seatMe(name))return;
  if(tries<40&&ROOM)setTimeout(()=>seatWhenReady(name,tries+1),250);
}
$("newGame").onclick=()=>{const n=homeName();if(!n)return;enterRoom(newRoomId(),false);seatWhenReady(n)};
$("practice").onclick=()=>{const n=homeName();if(!n)return;enterRoom("practice",true);seatWhenReady(n)};
$("backGame").onclick=()=>{const r=ls.get("ag-room");if(validRoom(r))enterRoom(r,false)};
$("homeName").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("newGame").click()}});
$("leaveBtn").onclick=()=>{if(ROOM&&S.phase==="lobby"&&seats[ME]&&!PRACTICE){send("seat/"+ME,null)}leaveRoom(false)};
$("howBtn").onclick=()=>{const d=$("howto");if(d.showModal)d.showModal();else d.setAttribute("open","")};
$("howto").addEventListener("click",e=>{if(e.target===$("howto"))$("howto").close()});
$("copyLink").onclick=()=>{const v=inviteLink(),m=$("inviteMsg");
  (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(()=>{m.className="msg ok";m.textContent="Link copied. Paste it to your mates."}).catch(()=>{m.className="msg";m.textContent=v})};
$("shareBtn").onclick=async()=>{
  const data={title:"Alphabet Goals",text:"⚽ Join my Alphabet Goals game",url:inviteLink()};
  try{
    if(NATIVE&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Share)await window.Capacitor.Plugins.Share.share({...data,dialogTitle:"Invite your mates"});
    else if(navigator.share)await navigator.share(data);
  }catch(e){}
};
if(NATIVE){
  const PL=window.Capacitor.Plugins||{};
  window.agHaptic=()=>{try{PL.Haptics&&PL.Haptics.impact({style:"MEDIUM"})}catch(e){}};
  try{PL.StatusBar&&PL.StatusBar.setStyle({style:"DARK"})}catch(e){}
  // Android back button: close the guide, then go home, then leave the app
  if(PL.App)PL.App.addListener("backButton",()=>{
    const d=$("howto");if(d.open){d.close();return}
    if(ROOM){$("leaveBtn").click();return}
    PL.App.exitApp();
  });
  // coming back to the app: reconnect quickly
  if(PL.App)PL.App.addListener("resume",()=>connStatus(NET&&NET.connected));
}
window.addEventListener("online",()=>connStatus(NET&&NET.connected));
window.addEventListener("offline",()=>connStatus(false,PRACTICE?null:"You're offline. Moves will send when you're back."));

(function boot(){
  const g=new URLSearchParams(location.search).get("g");
  if(validRoom(g)){enterRoom(g,false);return}
  render();
})();
