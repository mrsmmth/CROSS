(() => {
  "use strict";
  const STORAGE_KEY="three-pitch-detect-v4";
  const NOTES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"].map((name,value)=>({name,value}));
  const QUALITY_LIBRARY=[
    {suffix:"",quality:"Major",ints:[0,4,7],weight:3},{suffix:"m",quality:"Minor",ints:[0,3,7],weight:3},{suffix:"sus4",quality:"sus4",ints:[0,5,7],weight:2.2},{suffix:"dim",quality:"Dim",ints:[0,3,6],weight:1.8},{suffix:"aug",quality:"Aug",ints:[0,4,8],weight:1.5},
    {suffix:"6",quality:"6",ints:[0,4,7,9],weight:1.6},{suffix:"7",quality:"7",ints:[0,4,7,10],weight:2.5},{suffix:"maj7",quality:"maj7",ints:[0,4,7,11],weight:2.2},{suffix:"m7",quality:"m7",ints:[0,3,7,10],weight:2.5},{suffix:"m7♭5",quality:"m7♭5",ints:[0,3,6,10],weight:1.7},{suffix:"dim7",quality:"dim7",ints:[0,3,6,9],weight:1.4},{suffix:"add9",quality:"add9",ints:[0,2,4,7],weight:1.5},{suffix:"9",quality:"9",ints:[0,2,4,7,10],weight:1.5}
  ];
  const CHORDS=[]; for(let root=0;root<12;root++)for(const q of QUALITY_LIBRARY)CHORDS.push({root,name:NOTES[root].name+q.suffix,quality:q.quality,tones:[...new Set(q.ints.map(i=>(root+i)%12))],weight:q.weight});
  const $=id=>document.getElementById(id), els={heard:$("heardNotesGrid"),count:$("heardCount"),clear:$("clearHeardButton"),previous:$("previousChord"),next:$("nextChord"),list:$("candidateList"),close:$("closeDetectButton")};
  let state=load();
  function load(){try{return {heard:[],previous:"",next:"",...JSON.parse(localStorage.getItem(STORAGE_KEY))};}catch{return {heard:[],previous:"",next:""};}}
  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  function nn(v){return NOTES[((v%12)+12)%12].name;}
  function button(note){const b=document.createElement("button");b.type="button";b.className="note-button"+(state.heard.includes(note.value)?" selected":"");b.textContent=note.name;b.setAttribute("aria-pressed",state.heard.includes(note.value));b.onclick=()=>{const s=new Set(state.heard);s.has(note.value)?s.delete(note.value):s.add(note.value);state.heard=[...s].sort((a,b)=>a-b);update();};return b;}
  function find(name){return CHORDS.find(c=>c.name===name)||null;}
  function rootMotion(from,to){if(!from||!to)return 0;const move=(to.root-from.root+12)%12;if(move===5||move===7)return 11;if(move===2||move===10)return 6;if(move===0)return 2;if(move===1||move===11)return 1;return 3;}
  function common(a,b){return(!a||!b)?0:a.tones.filter(t=>b.tones.includes(t)).length*3;}
  function score(c){
    const matched=state.heard.filter(n=>c.tones.includes(n)).length, missing=state.heard.length-matched, extra=c.tones.filter(n=>!state.heard.includes(n)).length;
    let total=matched*31-missing*38-extra*7+c.weight;
    if(state.heard.length&&matched===state.heard.length)total+=28;
    if(state.heard.length===c.tones.length&&missing===0&&extra===0)total+=30;
    if(state.heard.includes(c.root))total+=5;
    const prev=find(state.previous),next=find(state.next); total+=rootMotion(prev,c)+common(prev,c)+rootMotion(c,next)+common(c,next);
    if(prev&&next&&prev.root===next.root&&c.root!==prev.root)total+=2;
    return {total,matched,missing,extra};
  }
  function renderCandidates(){
    els.list.innerHTML="";
    if(state.heard.length<1){els.list.innerHTML='<div class="empty-candidates">聞こえた音を選ぶと候補が表示されます。</div>';return;}
    const ranked=CHORDS.map(c=>({c,...score(c)})).filter(x=>x.matched>0).sort((a,b)=>b.total-a.total||b.matched-a.matched||a.extra-b.extra||a.c.name.localeCompare(b.c.name,"ja")).slice(0,12);
    ranked.forEach((x,i)=>{const row=document.createElement("div");row.className="candidate-row";const context=(state.previous||state.next)?"前後コードを加味":"聞こえた音で判定";row.innerHTML=`<div class="candidate-rank">${i+1}</div><div class="candidate-name">${x.c.name}</div><div class="candidate-tones">${x.c.tones.map(nn).join(" · ")}</div><div class="candidate-score">${Math.max(1,Math.round(x.total))}</div><div class="candidate-reason">${x.matched}/${state.heard.length}音一致・余分${x.extra}音 / ${context}</div>`;els.list.appendChild(row);});
  }
  function update(){save();els.heard.replaceChildren(...NOTES.map(button));els.count.textContent=`${state.heard.length}音選択`;renderCandidates();}
  const optionHtml=['<option value="">指定なし</option>',...CHORDS.filter(c=>["Major","Minor","7","maj7","m7","sus4","Dim","Aug"].includes(c.quality)).map(c=>`<option value="${c.name}">${c.name}</option>`)].join("");
  els.previous.innerHTML=optionHtml;els.next.innerHTML=optionHtml;els.previous.value=state.previous;els.next.value=state.next;
  els.previous.onchange=()=>{state.previous=els.previous.value;update();};els.next.onchange=()=>{state.next=els.next.value;update();};els.clear.onclick=()=>{state.heard=[];update();};els.close.onclick=()=>window.close();
  update();
})();
