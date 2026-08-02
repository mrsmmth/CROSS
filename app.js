(() => {
  "use strict";

  const STORAGE_KEY = "three-pitch-state-v4";
  const GUIDE_KEY = "three-pitch-guide-hidden-v4";
  const NOTES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"].map((name,value)=>({name,value}));
  const DEFAULT = {root:0,base:"major",shapes:[],decorations:[],melody:0};
  const $ = id => document.getElementById(id);
  const els = {
    rootGrid:$("rootGrid"), baseGrid:$("baseGrid"), shapeGrid:$("shapeGrid"), decorationGrid:$("decorationGrid"), melodyGrid:$("melodyGrid"),
    chordName:$("chordName"), chordTones:$("chordTones"), upper:$("upperResultNote"), lower:$("lowerResultNote"), maybe:$("maybeNotes"), warning:$("melodyWarning"),
    playChord:$("playChordButton"), playMelody:$("playMelodyButton"), playUpper:$("playUpperButton"), playLower:$("playLowerButton"), harmonyCheck:$("harmonyCheckButton"),
    guide:$("guideDialog"), guideButton:$("guideButton"), guideOk:$("guideOkButton"), dontShow:$("dontShowGuide"), openDetect:$("openDetectButton")
  };

  let state = load();
  let audioContext = null;
  let computed = {upper:4,lower:7,triad:[0,4,7],all:[0,4,7]};

  function load(){
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return {...DEFAULT,...raw,shapes:Array.isArray(raw?.shapes)?raw.shapes:[],decorations:Array.isArray(raw?.decorations)?raw.decorations:[]};
    } catch { return {...DEFAULT}; }
  }
  function save(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  function nn(v){ return NOTES[((v%12)+12)%12].name; }
  function makeButton(label,className,selected,onClick,ariaLabel){
    const b=document.createElement("button"); b.type="button"; b.className=className+(selected?" selected":""); b.textContent=label;
    b.setAttribute("aria-pressed",selected?"true":"false"); if(ariaLabel)b.setAttribute("aria-label",ariaLabel); b.addEventListener("click",onClick); return b;
  }
  function baseIntervals(){
    const sus=state.shapes.includes("sus4"), dim=state.shapes.includes("dim"), aug=state.shapes.includes("aug");
    const third=sus?5:dim?3:state.base==="minor"?3:4; const fifth=dim?6:aug?8:7; return [...new Set([0,third,fifth])];
  }
  function decorationIntervals(){
    const out=[];
    for(const id of state.decorations){
      if(id==="6"||id==="dim7")out.push(9); if(id==="7")out.push(10); if(id==="maj7")out.push(11); if(id==="add9")out.push(2);
      if(id==="9")out.push(10,2); if(id==="11")out.push(10,2,5); if(id==="13")out.push(10,2,5,9);
    }
    return [...new Set(out)];
  }
  function pitches(intervals){ return intervals.map(i=>(state.root+i)%12); }
  function distanceUp(p,m){return(p-m+12)%12;} function distanceDown(p,m){return(m-p+12)%12;}
  function directional(triad,direction){
    const fn=direction==="up"?distanceUp:distanceDown;
    return triad.map(p=>({p,d:fn(p,state.melody)})).filter(x=>x.d>0).sort((a,b)=>a.d-b.d||a.p-b.p)[0]?.p ?? triad[0];
  }
  function chordLabel(){
    let label=nn(state.root); const sus=state.shapes.includes("sus4"),dim=state.shapes.includes("dim"),aug=state.shapes.includes("aug");
    if(dim&&!sus) label+=state.base==="minor"?"m♭5":"dim";
    else if(aug&&!sus) label+=state.base==="minor"?"m♯5":"aug";
    else { if(state.base==="minor")label+="m"; if(sus)label+="sus4"; if(dim)label+="♭5"; if(aug)label+="♯5"; }
    ["6","7","maj7","dim7","add9","9","11","13"].forEach(id=>{if(state.decorations.includes(id))label+=id;});
    return label;
  }
  function toggleShape(id){
    const set=new Set(state.shapes); if(set.has(id))set.delete(id); else { if(id==="dim")set.delete("aug"); if(id==="aug")set.delete("dim"); set.add(id); }
    state.shapes=[...set]; update();
  }
  function toggleDecoration(id){
    const set=new Set(state.decorations); if(set.has(id))set.delete(id); else { if(["7","maj7","dim7"].includes(id))["7","maj7","dim7"].forEach(x=>set.delete(x)); set.add(id); }
    state.decorations=[...set]; update();
  }
  function renderSelectors(){
    const triad=new Set(computed.triad), extras=new Set(computed.all.filter(x=>!triad.has(x)));
    els.rootGrid.replaceChildren(...NOTES.map(n=>makeButton(n.name,"note-button",state.root===n.value,()=>{state.root=n.value;update();})));
    els.baseGrid.replaceChildren(...[["major","Major"],["minor","Minor"]].map(([id,label])=>makeButton(label,"choice-button",state.base===id,()=>{state.base=id;update();})));
    els.shapeGrid.replaceChildren(...[["sus4","sus4"],["dim","Dim"],["aug","Aug"]].map(([id,label])=>makeButton(label,"choice-button",state.shapes.includes(id),()=>toggleShape(id))));
    els.decorationGrid.replaceChildren(...["6","7","maj7","dim7","add9","9","11","13"].map(id=>makeButton(id,"decoration-button",state.decorations.includes(id),()=>toggleDecoration(id))));
    els.melodyGrid.replaceChildren(...NOTES.map(n=>{
      let cls="note-button"; if(triad.has(n.value))cls+=" chord-tone"; else if(extras.has(n.value))cls+=" decor-tone";
      if(state.melody===n.value&&!computed.all.includes(n.value))cls+=" invalid-selected";
      return makeButton(n.name,cls,state.melody===n.value,()=>{state.melody=n.value;update();});
    }));
  }
  function renderResult(){
    els.chordName.textContent=chordLabel(); els.chordTones.textContent=computed.all.map(nn).join(" · "); els.upper.textContent=nn(computed.upper); els.lower.textContent=nn(computed.lower);
    els.warning.hidden=computed.all.includes(state.melody);
    const alternatives=computed.all.filter(p=>p!==computed.upper&&p!==computed.lower).sort((a,b)=>distanceUp(a,state.root)-distanceUp(b,state.root));
    els.maybe.innerHTML="";
    if(!alternatives.length){ const s=document.createElement("span"); s.className="maybe-empty"; s.textContent="—"; els.maybe.appendChild(s); }
    else alternatives.forEach(p=>{const s=document.createElement("span");s.className="maybe-note";s.textContent=nn(p);els.maybe.appendChild(s);});
  }
  function update(){
    const triad=[...new Set(pitches(baseIntervals()))], extras=pitches(decorationIntervals());
    computed={triad,all:[...new Set([...triad,...extras])],upper:directional(triad,"up"),lower:directional(triad,"down")};
    save(); renderSelectors(); renderResult();
  }

  function getAudioContext(){
    if(!audioContext) audioContext=new (window.AudioContext||window.webkitAudioContext)();
    if(audioContext.state==="suspended") audioContext.resume(); return audioContext;
  }
  function frequency(pitch,octave=4){ return 440*Math.pow(2,(((octave+1)*12+pitch)-69)/12); }
  function playPianoTone(pitch,start=0,duration=.72,octave=4,volume=.2){
    const ctx=getAudioContext(), now=ctx.currentTime+start, master=ctx.createGain(), filter=ctx.createBiquadFilter();
    filter.type="lowpass"; filter.frequency.setValueAtTime(2600,now); filter.Q.value=.7;
    master.gain.setValueAtTime(.0001,now); master.gain.exponentialRampToValueAtTime(volume,now+.012); master.gain.exponentialRampToValueAtTime(volume*.32,now+.18); master.gain.exponentialRampToValueAtTime(.0001,now+duration);
    master.connect(filter); filter.connect(ctx.destination);
    [[1,1],[2,.32],[3,.13]].forEach(([mult,gain])=>{const osc=ctx.createOscillator(),g=ctx.createGain();osc.type=mult===1?"triangle":"sine";osc.frequency.value=frequency(pitch,octave)*mult;g.gain.value=gain;osc.connect(g);g.connect(master);osc.start(now);osc.stop(now+duration+.03);});
  }
  function playNotes(notes,start=0,duration=.8,octave=4){ notes.forEach((p,i)=>playPianoTone(p,start,duration,octave,Math.max(.07,.2-(i*.012)))); }
  function flash(button){button.classList.remove("playing");void button.offsetWidth;button.classList.add("playing");setTimeout(()=>button.classList.remove("playing"),700);}

  els.playMelody.addEventListener("click",()=>{flash(els.playMelody);playPianoTone(state.melody);});
  els.playUpper.addEventListener("click",()=>{flash(els.playUpper);playPianoTone(computed.upper);});
  els.playLower.addEventListener("click",()=>{flash(els.playLower);playPianoTone(computed.lower);});
  els.playChord.addEventListener("click",()=>{flash(els.playChord);playNotes(computed.all,0,1,3);});
  els.harmonyCheck.addEventListener("click",()=>{
    flash(els.harmonyCheck); playPianoTone(state.melody,0,.55); playPianoTone(computed.upper,.68,.55); playPianoTone(computed.lower,1.36,.55); playNotes([state.melody,computed.upper,computed.lower],2.08,1.05,4);
  });
  els.openDetect.addEventListener("click",()=>window.open("./detect.html","threePitchCodeDetect","popup=yes,width=1040,height=900,resizable=yes,scrollbars=yes"));
  els.guideButton.addEventListener("click",()=>{els.dontShow.checked=localStorage.getItem(GUIDE_KEY)==="1";els.guide.showModal();});
  els.guideOk.addEventListener("click",()=>localStorage.setItem(GUIDE_KEY,els.dontShow.checked?"1":"0"));

  update();
  if(localStorage.getItem(GUIDE_KEY)!=="1") requestAnimationFrame(()=>els.guide.showModal());
})();
