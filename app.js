import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const $=s=>document.querySelector(s);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);

const LIST=[
  {fam:'Corda',items:[{id:'violi',sub:'Fregada',name:'Violí'},{id:'guitarra',sub:'Pinçada',name:'Guitarra'},{id:'piano',sub:'Percudida',name:'Piano'}]},
  {fam:'Vent',items:[{id:'flauta',sub:'Fusta',name:'Flauta travessera'},{id:'trompeta',sub:'Metall',name:'Trompeta'}]},
  {fam:'Percussió',items:[{id:'xilofon',sub:'Afinada',name:'Xilòfon'},{id:'caixa',sub:'No afinada',name:'Caixa'}]}
];
const IDS=LIST.flatMap(f=>f.items.map(i=>i.id));

/* ================= menú de famílies ================= */
const nav=$('#families');
nav.innerHTML=LIST.map(f=>`<div class="fam"><span class="famname">${f.fam}</span><div class="famitems">${f.items.map(i=>`<button type="button" data-id="${i.id}" aria-pressed="false"><span class="sub">${f.fam==='Percussió'?'Percussió '+i.sub.toLowerCase():(f.fam==='Corda'?'Corda ':'Vent ')+i.sub.toLowerCase()}</span><span class="nm">${i.name}</span></button>`).join('')}</div></div>`).join('');
nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.id!==st.id) load(b.dataset.id);}));

/* ================= estat ================= */
const st={id:null,view:'explore',xray:false,heat:true,labels:true,sel:null,noteIndex:0,opt:0,tourI:0,loading:false};
let inst=null,root=null,G={};

/* ================= àudio ================= */
let AC=null,master=null;const voices=[];
function ensureAudio(){
  if(AC) return AC;
  AC=new (window.AudioContext||window.webkitAudioContext)();
  master=AC.createGain();master.gain.value=0.9;
  const comp=AC.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=4;
  master.connect(comp);comp.connect(AC.destination);
  return AC;
}
function stopVoices(){while(voices.length){const v=voices.shift();try{v.stop();}catch(e){}}}
const synth={
  get ctx(){return ensureAudio();},
  get out(){ensureAudio();return master;},
  additive({f=220,partials=[],attack=0.003,hold=0,release=null,vibrato=null,noise=null,gain=1,dur=null}={}){
    try{
      const ac=ensureAudio();if(ac.state==='suspended') ac.resume();
      const sr=ac.sampleRate,maxTau=Math.max(0.05,...partials.map(p=>p.tau||0.5)),T0=attack+hold;
      let total=dur??(T0+(release!=null?Math.min(release*6,maxTau*6+0.2):maxTau*6));
      if(noise&&noise.dur) total=Math.max(total,noise.dur*1.5);
      total=clamp(total,0.12,7);
      const len=Math.floor(sr*total),buf=ac.createBuffer(1,len,sr),d=buf.getChannelData(0);
      const vr=vibrato?2*Math.PI*vibrato.rate/sr:0,vd=vibrato?Math.pow(2,(vibrato.depth||0)/1200)-1:0,n0=Math.floor(T0*sr);
      for(const p of partials){
        const fk=f*(p.k||1);if(!(fk>0)||fk>sr/2-500||!p.a) continue;
        const w=2*Math.PI*fk/sr,dec=Math.exp(-1/(sr*(p.tau||0.5)));let e=1,ph=0;
        for(let i=0;i<len;i++){if(i>n0){e*=dec;if(e<2e-4) break;}ph+=vibrato?w*(1+vd*Math.sin(vr*i)):w;d[i]+=p.a*e*Math.sin(ph);}
      }
      let peak=0;for(let i=0;i<len;i++) peak=Math.max(peak,Math.abs(d[i]));if(peak<1e-6) peak=1;
      if(noise&&noise.amount){
        const la=noise.lp?1-Math.exp(-2*Math.PI*noise.lp/sr):1,ha=noise.hp?1-Math.exp(-2*Math.PI*noise.hp/sr):0;
        const nd=noise.dur?Math.exp(-1/(sr*noise.dur*0.35)):1;let lp=0,hl=0,ne=1;
        for(let i=0;i<len;i++){const x=Math.random()*2-1;lp+=(x-lp)*la;hl+=(lp-hl)*ha;ne*=nd;if(noise.dur&&ne<1e-4) break;d[i]+=(lp-(ha?hl:0))*noise.amount*peak*ne*1.6;}
      }
      const na=Math.max(1,Math.floor(attack*sr)),rel=release!=null?Math.exp(-1/(sr*release)):1;let re=1;
      for(let i=0;i<len;i++){let g=i<na?i/na:1;if(release!=null&&i>n0){re*=rel;g*=re;}d[i]*=g;}
      peak=0;for(let i=0;i<len;i++) peak=Math.max(peak,Math.abs(d[i]));
      const sc=peak>0?0.62*gain/peak:0;for(let i=0;i<len;i++) d[i]*=sc;
      const at=Math.min(len,64);for(let i=0;i<at;i++) d[i]*=i/at;
      const src=ac.createBufferSource();src.buffer=buf;src.connect(master);src.start();
      voices.push(src);src.onended=()=>{const k=voices.indexOf(src);if(k>=0) voices.splice(k,1);};
      if(voices.length>14){const v=voices.shift();try{v.stop();}catch(e){}}
    }catch(e){console.warn(e);}
  }
};

/* ================= 3D ================= */
const canvas=$('#gl'),boxEl=$('#canvasBox');
let renderer=null;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});}catch(e){renderer=null;}
if(!renderer){$('#glfail').hidden=false;throw new Error('WebGL no disponible');}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=0.85;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),0.04).texture;
const camera=new THREE.PerspectiveCamera(32,1,2,40000);
camera.position.set(-1500,1300,2400);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;controls.dampingFactor=0.08;controls.maxPolarAngle=1.55;controls.autoRotateSpeed=0.45;
scene.add(new THREE.HemisphereLight(0xdfe8f0,0x2a2018,0.55));
const key=new THREE.DirectionalLight(0xfff0dc,2.3);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-0.0003;key.shadow.normalBias=1.2;
scene.add(key,key.target);
const rimL=new THREE.DirectionalLight(0x9fd8ff,0.9);scene.add(rimL);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(20000,20000).rotateX(-Math.PI/2),new THREE.ShadowMaterial({opacity:0.38}));
floor.receiveShadow=true;scene.add(floor);

/* ---------- textures de fusta ---------- */
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function grain(o){return (g,w,h)=>{const r=mulberry(o.seed);g.fillStyle=o.base;g.fillRect(0,0,w,h);
  for(let i=0;i<o.bands;i++){const y=r()*h,hh=8+r()*70;g.globalAlpha=0.04+r()*0.09;g.fillStyle=r()<.5?o.dark:o.light;g.fillRect(0,y,w,hh);}
  let y=0;while(y<h){y+=o.gap[0]+r()*(o.gap[1]-o.gap[0]);g.globalAlpha=o.alpha[0]+r()*(o.alpha[1]-o.alpha[0]);g.strokeStyle=r()<o.lr?o.light:o.dark;g.lineWidth=o.lw[0]+r()*(o.lw[1]-o.lw[0]);
    g.beginPath();const amp=o.wave*(0.3+r()),fr=(1+Math.floor(r()*4))*2*Math.PI/w,ph=r()*6.28;for(let x=0;x<=w;x+=6){const yy=y+amp*Math.sin(x*fr+ph)+amp*.35*Math.sin(x*fr*3+ph*2);x?g.lineTo(x,yy):g.moveTo(x,yy);}g.stroke();}
  if(o.flame){g.globalAlpha=1;for(let x=0;x<w;x+=2){const v=Math.sin(x*0.09)+0.5*Math.sin(x*0.023+1.7)+0.3*Math.sin(x*0.31);g.fillStyle=v>0?`rgba(255,235,200,${(0.12*v).toFixed(3)})`:`rgba(60,25,5,${(-0.13*v).toFixed(3)})`;g.fillRect(x,0,2,h);}}
  g.globalAlpha=1;};}
const WOODS={
  spruce:grain({seed:7,base:'#E4C48C',dark:'#B98C52',light:'#F3DEB0',bands:26,gap:[2,6],alpha:[.12,.38],lw:[.6,1.6],wave:1.2,lr:.25}),
  maple:grain({seed:9,base:'#D9A866',dark:'#9C6A35',light:'#F0CF98',bands:20,gap:[3,8],alpha:[.08,.22],lw:[.5,1.2],wave:2,lr:.3,flame:true}),
  rosewood:grain({seed:3,base:'#4A2213',dark:'#1E0C06',light:'#8A4826',bands:40,gap:[1.5,5],alpha:[.15,.5],lw:[.6,2.2],wave:9,lr:.35}),
  rosewoodBar:grain({seed:13,base:'#6E2E18',dark:'#331207',light:'#A5552E',bands:36,gap:[1.5,5],alpha:[.15,.45],lw:[.6,2],wave:6,lr:.4}),
  mahogany:grain({seed:11,base:'#7A4223',dark:'#4A2410',light:'#A0613A',bands:30,gap:[2,5],alpha:[.12,.35],lw:[.6,1.4],wave:2,lr:.3}),
  ebony:grain({seed:5,base:'#1B1715',dark:'#0C0A09',light:'#2E2723',bands:16,gap:[2,6],alpha:[.2,.5],lw:[.5,1.2],wave:1,lr:.4})
};
const ANISO=renderer.capabilities.getMaxAnisotropy(),canvases={};
function woodTex(name,rx=1,ry=1){
  if(!canvases[name]){const c=document.createElement('canvas');c.width=2048;c.height=1024;WOODS[name](c.getContext('2d'),c.width,c.height);canvases[name]=c;}
  const t=new THREE.CanvasTexture(canvases[name]);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=ANISO;t.repeat.set(rx,ry);return t;
}
const tex={};for(const k in WOODS) tex[k]=(rx,ry)=>woodTex(k,rx,ry);

/* ---------- registre de materials i peces ---------- */
let mats={},pickables=[],heatMeshes=[];
function mat(part,opts={},{phys=true,xray=false}={}){
  const m=phys?new THREE.MeshPhysicalMaterial(opts):new THREE.MeshStandardMaterial(opts);
  m.userData={part,xray,baseOp:opts.opacity??1,baseTr:!!opts.transparent};
  (mats[part]??=[]).push(m);return m;
}
const lacq={clearcoat:0.75,clearcoatRoughness:0.18,envMapIntensity:0.6};
const M={
  wood:(part,t,o={})=>mat(part,{map:t,color:o.color??0xffffff,roughness:0.42,...lacq},{xray:o.xray}),
  rawWood:(part,t,o={})=>mat(part,{map:t,color:o.color??0xffffff,roughness:0.78},{phys:false,xray:o.xray}),
  brass:(part,o={})=>mat(part,{color:0xE2B45A,metalness:1,roughness:0.2,clearcoat:0.4,clearcoatRoughness:0.15},{xray:o.xray}),
  silver:(part,o={})=>mat(part,{color:0xE4E5E8,metalness:1,roughness:0.16},{phys:false,xray:o.xray}),
  nickel:(part,o={})=>mat(part,{color:0xD6D7D3,metalness:1,roughness:0.26},{phys:false,xray:o.xray}),
  chrome:(part,o={})=>mat(part,{color:0xF2F3F5,metalness:1,roughness:0.07},{phys:false,xray:o.xray}),
  ebony:(part,o={})=>mat(part,{map:woodTex('ebony',1/400,1/80),roughness:0.45,clearcoat:0.3},{xray:o.xray}),
  bone:(part,o={})=>mat(part,{color:0xF1EADB,roughness:0.35,clearcoat:0.3},{xray:o.xray}),
  ivory:(part,o={})=>mat(part,{color:0xF6F1E4,roughness:0.3,clearcoat:0.6,clearcoatRoughness:0.2},{xray:o.xray}),
  blackKey:(part,o={})=>mat(part,{color:0x141414,roughness:0.3,clearcoat:0.9,clearcoatRoughness:0.12},{xray:o.xray}),
  felt:(part,color=0xC23A2E,o={})=>{const c=new THREE.Color(color);return mat(part,{color:c,roughness:1,sheen:1,sheenRoughness:0.6,sheenColor:c.clone().lerp(new THREE.Color(0xffffff),0.4)},{xray:o.xray});},
  skin:(part,o={})=>mat(part,{color:0xD9D3C6,roughness:0.75,envMapIntensity:0.5,sheen:0.4,sheenColor:new THREE.Color(0xffffff),side:THREE.DoubleSide,...(o.opacity?{transparent:true,opacity:o.opacity}:{})},{xray:o.xray}),
  plastic:(part,color=0x222222,o={})=>mat(part,{color,roughness:0.35,clearcoat:0.5},{xray:o.xray}),
  string:(part,wound,o={})=>wound?mat(part,{color:0xD9D9D4,metalness:1,roughness:0.3},{phys:false,xray:o.xray}):mat(part,{color:0xF4F0E6,roughness:0.25,clearcoat:1,clearcoatRoughness:0.1},{xray:o.xray})
};
function add(group,geometry,material,part,o={}){
  const me=new THREE.Mesh(geometry,material);me.castShadow=o.cast!==false;me.receiveShadow=true;me.userData.part=part;
  if(o.note!==undefined) me.userData.note=o.note;
  if(o.pos) me.position.set(...o.pos);if(o.rot) me.rotation.set(...o.rot);if(o.scale) me.scale.set(...o.scale);
  group.add(me);if(o.pick!==false) pickables.push(me);return me;
}
const geo={
  box:(x0,x1,y0,y1,z0,z1)=>new THREE.BoxGeometry(Math.abs(x1-x0),Math.abs(y1-y0),Math.abs(z1-z0)).translate((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),
  shape:pts=>{const s=new THREE.Shape();s.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0],pts[i][1]);s.closePath();return s;},
  path:pts=>{const s=new THREE.Path();s.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++) s.lineTo(pts[i][0],pts[i][1]);s.closePath();return s;},
  rrect:(x0,x1,y0,y1,r)=>{const s=new THREE.Shape();s.moveTo(x0+r,y0);s.lineTo(x1-r,y0);s.quadraticCurveTo(x1,y0,x1,y0+r);s.lineTo(x1,y1-r);s.quadraticCurveTo(x1,y1,x1-r,y1);s.lineTo(x0+r,y1);s.quadraticCurveTo(x0,y1,x0,y1-r);s.lineTo(x0,y0+r);s.quadraticCurveTo(x0,y0,x0+r,y0);return s;},
  ext:(shape,depth,bevel)=>new THREE.ExtrudeGeometry(shape,Object.assign({depth,curveSegments:24,bevelEnabled:!!bevel},bevel||{})),
  tube:(a,b,r,seg=1,rad=8)=>new THREE.TubeGeometry(new THREE.LineCurve3(V3(...a),V3(...b)),seg,r,rad,false),
  curveTube:(pts,r,seg=64,rad=12,closed=false)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>V3(...p)),closed,'centripetal'),seg,r,rad,closed),
  cyl:(r,len,axis='y',seg=32,rTop=r)=>{const g=new THREE.CylinderGeometry(rTop,r,len,seg);if(axis==='x') g.rotateZ(-Math.PI/2);else if(axis==='z') g.rotateX(Math.PI/2);return g;},
  lathe:(pts,seg=64)=>new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),seg)
};

/* ---------- aire (partícules) ---------- */
const PN=2400,pPos=new Float32Array(PN*3),pCol=new Float32Array(PN*3),pVel=new Float32Array(PN*3),pLife=new Float32Array(PN),pMax=new Float32Array(PN);
const spriteC=document.createElement('canvas');spriteC.width=spriteC.height=64;{const g=spriteC.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.4,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);}
const pGeo=new THREE.BufferGeometry();pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const pMat=new THREE.PointsMaterial({size:7,map:new THREE.CanvasTexture(spriteC),vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true});
const points=new THREE.Points(pGeo,pMat);points.frustumCulled=false;scene.add(points);
let pHead=0,frameDt=1/60;const AIR=new THREE.Color(0x52C8D6),_d=new THREE.Vector3(),_u=new THREE.Vector3(),_v=new THREE.Vector3();
const fx={air(pos,dir,rate,spread=0.4,speed=220){
  let n=rate*frameDt;n=Math.floor(n)+(Math.random()<n%1?1:0);if(n<=0) return;
  _d.copy(dir).normalize();_u.set(1,0,0);if(Math.abs(_d.x)>0.9) _u.set(0,1,0);_u.cross(_d).normalize();_v.copy(_d).cross(_u);
  for(let c=0;c<n;c++){const i=pHead;pHead=(pHead+1)%PN;const a=Math.random()*Math.PI*2,r=Math.random()*spread,sp=speed*(0.6+Math.random()*0.8);
    pPos[i*3]=pos.x;pPos[i*3+1]=pos.y;pPos[i*3+2]=pos.z;
    for(let k=0;k<3;k++){const dk=k===0?'x':k===1?'y':'z';pVel[i*3+k]=sp*(_d[dk]+r*(Math.cos(a)*_u[dk]+Math.sin(a)*_v[dk]));}
    pLife[i]=0.001;pMax[i]=1.4+Math.random()*1.1;}
}};
function stepAir(dt){
  for(let i=0;i<PN;i++){if(pLife[i]<=0) continue;pLife[i]+=dt;const t=pLife[i]/pMax[i];
    if(t>=1){pLife[i]=0;pCol[i*3]=pCol[i*3+1]=pCol[i*3+2]=0;continue;}
    const damp=Math.exp(-dt*0.9);for(let k=0;k<3;k++){pVel[i*3+k]*=damp;pPos[i*3+k]+=pVel[i*3+k]*dt;}
    const a=Math.min(1,t/0.08)*Math.pow(1-t,1.4)*0.85;pCol[i*3]=AIR.r*a;pCol[i*3+1]=AIR.g*a;pCol[i*3+2]=AIR.b*a;}
  pGeo.attributes.position.needsUpdate=true;pGeo.attributes.color.needsUpdate=true;
}
function clearAir(){pLife.fill(0);pCol.fill(0);pGeo.attributes.color.needsUpdate=true;}

/* ---------- mapa de vibració ---------- */
const heatMat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4,side:THREE.DoubleSide});
const heat={
  overlay(mesh){const g=mesh.geometry;if(!g.attributes.color) g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3),3));
    const h=new THREE.Mesh(g,heatMat);h.visible=false;h.renderOrder=2;mesh.add(h);heatMeshes.push(h);return h;},
  color(s,out,i){s=clamp(s,-1,1);const a=Math.abs(s)*0.9;if(s>=0){out[i*3]=1*a;out[i*3+1]=0.42*a;out[i*3+2]=0.1*a;}else{out[i*3]=0.12*a;out[i*3+1]=0.55*a;out[i*3+2]=1*a;}}
};

/* ---------- ones de so ---------- */
const shellMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  uniforms:{uA:{value:0},uC:{value:new THREE.Color(0x52C8D6)}},
  vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
  fragmentShader:'uniform float uA;uniform vec3 uC;varying vec3 vN;varying vec3 vV;void main(){float r=1.-abs(dot(normalize(vN),normalize(vV)));float a=pow(r,3.)*uA;gl_FragColor=vec4(uC*a,a);}'});
const shellGeo=new THREE.SphereGeometry(1,64,32);
const shells=[];for(let i=0;i<10;i++){const m=new THREE.Mesh(shellGeo,shellMat.clone());m.visible=false;m.userData={born:-1,e:0};scene.add(m);shells.push(m);}
let shellIdx=0,lastShellT=-1,nextShell=0,instSize=1000;

/* ================= ctx per als mòduls ================= */
function makeCtx(){
  return {THREE,V3,mat,M,tex,add,geo,fx,synth,heat,
    groups(names){const o={};for(const n of names){const g=new THREE.Group();g.name=n;root.add(g);o[n]=g;G[n]=g;}return o;}};
}

/* ================= etiquetes ================= */
const labelsEl=$('#labels'),leaders=$('#leaders');let tags=[];
function buildLabels(){
  labelsEl.innerHTML='';leaders.innerHTML='';
  tags=(inst.labels||[]).filter(l=>G[l.group]&&inst.parts[l.part]).map(l=>{
    const b=document.createElement('button');b.type='button';b.className='tag';b.textContent=inst.parts[l.part].name;b.addEventListener('click',()=>select(l.part));labelsEl.appendChild(b);
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line');ln.setAttribute('stroke','rgba(233,237,240,.45)');ln.setAttribute('stroke-width','1');ln.setAttribute('stroke-dasharray','3 3');leaders.appendChild(ln);
    const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('r','3');c.setAttribute('fill','#E9EDF0');leaders.appendChild(c);
    return {l,b,ln,c};});
}
const tmp=new THREE.Vector3();
function updLabels(W,Hh){
  const show=st.labels&&st.view!=='tour',focus=st.view==='tour'?inst.tour[st.tourI]?.part:null;
  for(const {l,b,ln,c} of tags){
    let op=show||l.part===focus?1:0;
    if(l.internal) op*=Math.max(st.xray?1:0,clamp((E-0.2)*3));
    tmp.set(...l.at);G[l.group].localToWorld(tmp);tmp.project(camera);
    if(tmp.z>1||op<0.02){b.style.opacity=0;b.style.pointerEvents='none';ln.setAttribute('opacity',0);c.setAttribute('opacity',0);continue;}
    const sx=(tmp.x*.5+.5)*W,sy=(-tmp.y*.5+.5)*Hh;
    let dx=sx-W*0.45,dy=sy-Hh*0.5;const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
    const lx=sx+dx*64,ly=sy+dy*40,tw=b.offsetWidth,th=b.offsetHeight;
    const tx=clamp(dx<0?lx-tw:lx,8,W-tw-8),ty=clamp(ly-th/2,8,Hh-th-8);
    b.style.transform=`translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)`;b.style.opacity=op;b.style.pointerEvents=op>0.5?'auto':'none';
    b.classList.toggle('sel',l.part===st.sel);
    ln.setAttribute('x1',sx);ln.setAttribute('y1',sy);ln.setAttribute('x2',dx<0?tx+tw:tx);ln.setAttribute('y2',ty+th/2);ln.setAttribute('opacity',op);
    c.setAttribute('cx',sx);c.setAttribute('cy',sy);c.setAttribute('opacity',op);
  }
}

/* ================= aspecte (raigs X, selecció) ================= */
function applyLook(){
  for(const part in mats) for(const m of mats[part]){
    const u=m.userData;let op=u.baseOp;if(u.xray&&st.xray) op=Math.min(op,0.16);
    const tr=u.baseTr||op<1;if(m.transparent!==tr){m.transparent=tr;m.needsUpdate=true;}
    m.opacity=op;m.depthWrite=op>=0.99;
  }
}
let prevSel=null;
function select(part){st.sel=part;sync();}
function selGlow(T){
  if(prevSel!==st.sel){if(prevSel&&mats[prevSel]) for(const m of mats[prevSel]) m.emissive&&m.emissive.setRGB(0,0,0);prevSel=st.sel;}
  if(st.sel&&mats[st.sel]){const e=0.08+0.06*Math.sin(T*4);for(const m of mats[st.sel]) m.emissive&&m.emissive.setRGB(e,e*0.45,e*0.12);}
}

/* ================= càmera ================= */
let fly=null;
function flyTo(cam,dur=1.8,done){fly={p0:camera.position.clone(),t0:controls.target.clone(),p1:V3(...cam.pos),t1:V3(...cam.target),t:0,dur:REDUCE?0.01:dur,done};controls.enabled=false;controls.autoRotate=false;}

/* ================= so i envolupant ================= */
let env=0,envShape={attack:0.01,hold:0,release:1},playT=-1e9,tv=0,slow=1;
function envAt(t){const {attack=0.01,hold=0,release=1}=envShape;if(t<0) return 0;if(t<attack) return t/attack;if(t<attack+hold) return 1;return Math.exp(-(t-attack-hold)/Math.max(0.05,release));}
function play(i=st.noteIndex){
  if(!inst) return;st.noteIndex=clamp(i,0,inst.notes.length-1);
  let r=null;try{r=inst.play(inst.notes[st.noteIndex],st.opt);}catch(e){console.warn(e);}
  envShape=Object.assign({attack:0.01,hold:0,release:1},r||{});playT=performance.now()/1000;tv=0;nextShell=0;sync();
}

/* ================= interfície ================= */
const caption={info:$('#infoBox'),tour:$('#tourBox')};
function segBtns(el,items,get,set){
  el.innerHTML='';items.forEach((t,i)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.addEventListener('click',()=>{set(i);sync();});el.appendChild(b);});el._get=get;
}
function sync(){
  if(!inst) return;
  for(const el of [$('#sNotes'),$('#sOpt')]) if(el._get) [...el.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===el._get())));
  nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===st.id)));
  document.querySelectorAll('#views button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===st.view)));
  $('#tgX').setAttribute('aria-pressed',String(st.xray));$('#tgHeat').setAttribute('aria-pressed',String(st.heat));$('#tgLbl').setAttribute('aria-pressed',String(st.labels));
  if(st.view!=='tour'){
    const p=st.sel&&inst.parts[st.sel];
    $('#iEyebrow').textContent=p?inst.name:inst.family;
    $('#iTitle').textContent=p?p.name:inst.name;$('#iText').textContent=p?p.text:inst.intro;$('#iDato').textContent=p?(p.dato||''):'Toca una peça per saber què fa.';
  }
}
function setupUI(){
  $('#pFam').textContent=inst.family;$('#pName').textContent=inst.name;
  segBtns($('#sNotes'),inst.notes.map(n=>n.label),()=>st.noteIndex,i=>play(i));
  const o=inst.options;$('#gOpt').hidden=!o;
  if(o){$('#lOpt').textContent=o.label;segBtns($('#sOpt'),o.items,()=>st.opt,i=>{st.opt=i;play();});}else{$('#sOpt').innerHTML='';$('#sOpt')._get=null;}
  $('#chain').innerHTML=inst.chain.map((s,i)=>(i?'<span class="ar" aria-hidden="true">→</span>':'')+`<span class="st">${s}</span>`).join('');
  chainEls=[...document.querySelectorAll('#chain .st')];
  $('#tDots').innerHTML=inst.tour.map(()=>'<i></i>').join('');
}
let chainEls=[];
document.querySelectorAll('#views button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.v)));
function setView(v){
  if(!inst) return;
  if(v==='tour'){tourGo(0);return;}
  st.view=v;slow=1;caption.info.hidden=false;caption.tour.hidden=true;
  if(st.xray&&v!=='tour'){/* es manté el que hagi triat l'alumne */}
  ET=v==='exploded'?1:0;flyTo(inst.camera[v==='exploded'?'exploded':'explore'],1.8);sync();
}
function tourGo(i){
  st.tourI=clamp(i,0,inst.tour.length-1);const s=inst.tour[st.tourI];
  st.view='tour';st.xray=!!s.xray;slow=s.slow??1;ET=0;applyLook();st.sel=s.part||null;
  caption.info.hidden=true;caption.tour.hidden=false;
  $('#tStep').textContent=`Pas ${st.tourI+1} de ${inst.tour.length}`;$('#tTitle').textContent=s.title;$('#tText').textContent=s.text;
  [...$('#tDots').children].forEach((d,j)=>d.classList.toggle('on',j<=st.tourI));
  $('#tNext').textContent=st.tourI===inst.tour.length-1?'Acabar':'Següent';
  sync();flyTo(s.cam,1.9,()=>play(s.note??st.noteIndex));
}
$('#tNext').addEventListener('click',()=>{if(st.tourI===inst.tour.length-1) setView('explore');else tourGo(st.tourI+1);});
$('#tPrev').addEventListener('click',()=>{if(st.tourI===0) setView('explore');else tourGo(st.tourI-1);});
$('#tReplay').addEventListener('click',()=>play());
$('#play').addEventListener('click',()=>play());
$('#tgX').addEventListener('click',()=>{st.xray=!st.xray;applyLook();sync();});
$('#tgHeat').addEventListener('click',()=>{st.heat=!st.heat;sync();});
$('#tgLbl').addEventListener('click',()=>{st.labels=!st.labels;sync();});

/* ---------- selecció amb el ratolí ---------- */
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let down=null,hoverDirty=false,hovered=null;
function setMouse(e){const r=canvas.getBoundingClientRect();mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);}
function pick(){
  ray.setFromCamera(mouse,camera);
  for(const x of ray.intersectObjects(pickables,false)){
    const o=x.object,p=o.userData.part;if(!p) continue;
    const m=Array.isArray(o.material)?o.material[0]:o.material;
    if(o.userData.note===undefined&&m&&m.opacity<0.2) continue;
    if(!o.visible) continue;
    return o;
  }
  return null;
}
canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};hideHint();});
canvas.addEventListener('pointermove',e=>{setMouse(e);hoverDirty=true;});
canvas.addEventListener('pointerup',e=>{
  if(!down) return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y)>5;down=null;if(moved) return;
  setMouse(e);const o=pick();if(!o) return;
  if(o.userData.note!==undefined){st.sel=o.userData.part;play(o.userData.note);}
  else select(o.userData.part);
});
controls.addEventListener('start',()=>{controls.autoRotate=false;hideHint();});
function hideHint(){$('#hint').classList.add('gone');}
document.addEventListener('keydown',e=>{
  if(!inst) return;
  if(e.target.closest&&e.target.closest('button,input,textarea,select')) return;
  if(e.key===' '||e.key==='Enter'){e.preventDefault();play();}
  else if(/^[1-9]$/.test(e.key)&&+e.key<=inst.notes.length) play(+e.key-1);
  else if(e.key==='d'||e.key==='D') setView(st.view==='exploded'?'explore':'exploded');
  else if(e.key==='x'||e.key==='X'){st.xray=!st.xray;applyLook();sync();}
});

/* ================= càrrega d'instruments ================= */
let E=1,ET=1,loadToken=0;
function disposeRoot(){
  if(!root) return;scene.remove(root);
  const texs=new Set();
  root.traverse(o=>{if(o.geometry) o.geometry.dispose();const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of ms){if(m===heatMat) continue;for(const k of ['map','normalMap','roughnessMap']) if(m[k]) texs.add(m[k]);m.dispose();}});
  texs.forEach(t=>t.dispose());root=null;
}
async function load(id){
  const tok=++loadToken;st.loading=true;$('#loading').hidden=false;
  let def;
  try{def=(await import(`./inst/${id}.js`)).default;}catch(e){console.error(e);if(tok===loadToken){$('#loading').textContent='No s’ha pogut carregar aquest instrument.';}return;}
  if(tok!==loadToken) return;
  stopVoices();disposeRoot();clearAir();shells.forEach(s=>s.visible=false);
  mats={};pickables=[];heatMeshes=[];G={};prevSel=null;
  root=new THREE.Group();scene.add(root);
  try{inst=def(makeCtx());}catch(e){console.error(e);$('#loading').textContent='Aquest instrument té un error.';return;}
  st.id=id;st.view='explore';st.sel=null;st.noteIndex=0;st.opt=0;st.xray=false;env=0;playT=-1e9;slow=1;
  try{history.replaceState(null,'','#'+id);}catch(e){}
  root.traverse(o=>{if(o.isMesh&&o.castShadow===undefined) o.castShadow=true;});
  // mida, terra i ombres
  E=1;ET=1;applyExplode();
  const bb=new THREE.Box3().setFromObject(root),size=bb.getSize(new THREE.Vector3()),ctr=bb.getCenter(new THREE.Vector3());
  instSize=Math.max(size.x,size.y,size.z,300);
  floor.position.y=inst.floorY??(bb.min.y-30);
  const R=instSize*0.85;Object.assign(key.shadow.camera,{left:-R,right:R,top:R,bottom:-R,near:10,far:instSize*8});key.shadow.camera.updateProjectionMatrix();
  key.position.set(ctr.x-instSize*0.5,ctr.y+instSize*1.6,ctr.z+instSize*0.9);key.target.position.copy(ctr);
  rimL.position.set(ctr.x+instSize,ctr.y+instSize*0.5,ctr.z-instSize);
  pMat.size=clamp(instSize/150,4,10);
  controls.minDistance=instSize*0.12;controls.maxDistance=instSize*7;
  buildLabels();setupUI();applyLook();
  caption.info.hidden=false;caption.tour.hidden=true;
  $('#loading').hidden=true;$('#loading').textContent='Carregant…';st.loading=false;
  const c=inst.camera.explore;camera.position.set(c.pos[0]*1.8,c.pos[1]*1.8,c.pos[2]*1.8);controls.target.set(...c.target);
  sync();resize();
  setTimeout(()=>{if(tok!==loadToken) return;ET=0;flyTo(inst.camera.explore,2.4,()=>{if(!REDUCE&&st.view==='explore') controls.autoRotate=true;});},300);
}
function applyExplode(){
  if(!inst||!inst.explode) return;
  for(const k in inst.explode){const g=G[k];if(!g) continue;const [dx=0,dy=0,dz=0,d=0]=inst.explode[k];const p=ease(clamp((E-d)/0.65));g.position.set(dx*p,dy*p,dz*p);}
}

/* ================= mida ================= */
let W=800,Hh=600;
function resize(){W=boxEl.clientWidth;Hh=boxEl.clientHeight;if(!W||!Hh) return;renderer.setSize(W,Hh,false);camera.aspect=W/Hh;camera.updateProjectionMatrix();leaders.setAttribute('viewBox',`0 0 ${W} ${Hh}`);}
new ResizeObserver(resize).observe(boxEl);resize();

/* ================= bucle ================= */
const clock=new THREE.Clock(),center=new THREE.Vector3();
const S={};
function frame(){
  requestAnimationFrame(frame);
  const dt=Math.min(0.05,clock.getDelta()),T=performance.now()/1000;frameDt=dt;
  if(!inst){renderer.render(scene,camera);return;}
  if(E!==ET){const sp=dt/1.9;E=ET>E?Math.min(ET,E+sp):Math.max(ET,E-sp);applyExplode();}
  if(fly){fly.t+=dt;const k=ease(Math.min(1,fly.t/fly.dur));camera.position.lerpVectors(fly.p0,fly.p1,k);controls.target.lerpVectors(fly.t0,fly.t1,k);if(fly.t>=fly.dur){const d=fly.done;fly=null;controls.enabled=true;d&&d();}}
  env=envAt(T-playT);if(env<0.003) env=0;
  if(env>0) tv+=dt*slow;
  const note=inst.notes[st.noteIndex]||{},f=note.f||220,fvis=0.45+0.0018*Math.min(f,1000);
  Object.assign(S,{env,t:tv,time:T,f,fvis,note,noteIndex:st.noteIndex,opt:st.opt,heat:st.heat,xray:st.xray,view:st.view,tourStep:st.view==='tour'?st.tourI:-1,explode:E,selected:st.sel,dt});
  try{inst.update(dt,S);}catch(e){if(!frame.err){console.error(e);frame.err=true;}}
  for(const h of heatMeshes) h.visible=st.heat&&env>0.01;
  stepAir(dt);
  /* ones */
  const src=inst.soundSource;
  if(src&&G[src.group]&&env>0.05&&tv>=nextShell&&T-lastShellT>0.32){
    const s=shells[shellIdx];shellIdx=(shellIdx+1)%shells.length;center.set(...src.at);G[src.group].localToWorld(center);
    s.position.copy(center);s.userData.born=T;s.userData.e=env;s.visible=true;nextShell=tv+(REDUCE?3:1)/fvis;lastShellT=T;
  }
  for(const s of shells){if(!s.visible) continue;const t=(T-s.userData.born)/3.2;if(t>=1){s.visible=false;continue;}
    s.scale.setScalar(instSize*0.15+t*instSize*2.4);s.material.uniforms.uA.value=Math.pow(1-t,2)*s.userData.e*0.5;}
  /* cadena */
  const el=T-playT;
  chainEls.forEach((c,i)=>{const tourOn=st.view==='tour'&&inst.tour[st.tourI]?.chain===i&&env>0.02;c.classList.toggle('on',(env>0.06&&el>i*0.18)||tourOn);});
  selGlow(T);
  if(hoverDirty&&!fly){hoverDirty=false;const o=pick();const p=o?o.userData.part:null;if(p!==hovered){hovered=p;canvas.style.cursor=o?'pointer':'grab';}}
  controls.update();
  renderer.render(scene,camera);
  updLabels(W,Hh);
}
requestAnimationFrame(frame);

const start=(location.hash||'').slice(1);
load(IDS.includes(start)?start:'guitarra');
