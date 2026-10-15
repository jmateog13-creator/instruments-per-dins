// Triangle — mòdul d'instrument (Percussió no afinada)
// Unitats: mm. Y amunt. El triangle penja al pla XY (z = 0), mirant cap a +Z (el músic és a +Z).
// La cantonada oberta és la de baix a la dreta (+X). El suport és a l'esquerra (-X).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, geo, fx, synth, heat } = ctx;
  const add = (g, ge, m, part, o) => ctx.add(g, ge, m, part, o || {});

  const G = groups(['suport', 'pinca', 'cordill', 'barra', 'batedor']);

  // ---------------------------------------------------------------- mides
  const SIDE = 200;                    // costat (línia central), mm
  const RB = 5;                        // radi de la barra (10 mm de diàmetre)
  const RC = 13;                       // radi de les cantonades arrodonides (línia central)
  const H = SIDE * Math.sqrt(3) / 2;   // alçada del triangle
  const YT = 2 * H / 3, YB = -H / 3;   // vèrtex de dalt i costat de baix (línia central)
  const VT = [0, YT], VL = [-SIDE / 2, YB], VR = [SIDE / 2, YB];
  const DT = RC * Math.sqrt(3);        // distància del vèrtex al punt de tangència
  const GAP = 22;                      // on s'acaben les puntes, des del vèrtex obert
  const E_LEN = 22;                    // tros de punta que forma la «cantonada oberta»
  const FLOOR = -950;
  const PIV_Y = 181;                   // on el cordill passa per la pinça (eix del balanceig)
  const ARM_Y = 226;                   // braç horitzontal del suport
  const XP = -330;                     // pal del suport

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = u => { u = clamp01(u); return u * u * (3 - 2 * u); };

  // ---------------------------------------------------------------- materials
  const steel = part => mat(part, { color: 0xd3d8de, metalness: 1, roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.12 });
  const barMat = steel('barra');
  const endMat = steel('cantonada');
  const cordMat = mat('cordill', { color: 0xf1eee4, roughness: 0.32, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const clipMat = M.chrome('pinca');
  const knobMat = M.plastic('pinca', 0x1b1c1f);
  const standMat = mat('suport', { color: 0x1e2124, metalness: 0.7, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const standChrome = M.chrome('suport');
  const rubberMat = M.plastic('suport', 0x151515);
  const gripMat = M.plastic('batedor', 0x1d1d21);
  const rodMat = mat('batedor', { color: 0xc9ced4, metalness: 1, roughness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.15 });
  const ferruleMat = M.chrome('batedor');

  // ---------------------------------------------------------------- camí de la barra
  // Sentit antihorari: punta A (costat dret, a prop de la cantonada oberta) -> dalt -> esquerra -> baix -> punta B.
  const nrm2 = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const uR = nrm2(VT[0] - VR[0], VT[1] - VR[1]);   // de VR cap a VT
  const uL = nrm2(VL[0] - VT[0], VL[1] - VT[1]);   // de VT cap a VL
  const uB = [1, 0];                               // de VL cap a VR
  const P = (v, u, d) => [v[0] + u[0] * d, v[1] + u[1] * d];
  const A0 = P(VR, uR, GAP), T1 = P(VT, uR, -DT), T2 = P(VT, uL, DT), T3 = P(VL, uL, -DT), T4 = P(VL, uB, DT), B0 = P(VR, uB, -GAP);
  const CT = [0, YT - 2 * RC];
  const CL = P(VL, [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)], 2 * RC);

  const raw = [];
  const segLine = (a, b, n) => { for (let i = 0; i < n; i++) { const u = i / n; raw.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); } };
  const segArc = (c, a0, a1, n) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; raw.push([c[0] + RC * Math.cos(a), c[1] + RC * Math.sin(a)]); } };
  segLine(A0, T1, 60);
  segArc(CT, Math.PI / 6, 5 * Math.PI / 6, 24);
  segLine(T2, T3, 60);
  segArc(CL, 5 * Math.PI / 6, 3 * Math.PI / 2, 24);
  segLine(T4, B0, 60);
  raw.push(B0);
  const rawS = [0];
  for (let i = 1; i < raw.length; i++) rawS.push(rawS[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const LTOT = rawS[rawS.length - 1];

  // taula cada 1 mm: posició i normal cap enfora (en el pla del triangle)
  const NT = Math.floor(LTOT) + 2;
  const TX = new Float32Array(NT), TY = new Float32Array(NT), NX = new Float32Array(NT), NY = new Float32Array(NT);
  {
    let j = 0;
    for (let i = 0; i < NT; i++) {
      const s = Math.min(i, LTOT);
      while (j < raw.length - 2 && rawS[j + 1] < s) j++;
      const u = (s - rawS[j]) / Math.max(1e-6, rawS[j + 1] - rawS[j]);
      TX[i] = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * u;
      TY[i] = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * u;
    }
    for (let i = 0; i < NT; i++) {
      const a = Math.max(0, i - 2), b = Math.min(NT - 1, i + 2);
      const t = nrm2(TX[b] - TX[a], TY[b] - TY[a]);
      NX[i] = t[1]; NY[i] = -t[0];             // recorregut antihorari: la normal de la dreta mira enfora
    }
  }
  const idxS = s => Math.max(0, Math.min(NT - 1, Math.round(s)));
  const ptS = s => { const i = idxS(s); return [TX[i], TY[i]]; };
  const sNear = (x, y) => { let best = 0, bd = 1e9; for (let i = 0; i < NT; i++) { const d = (TX[i] - x) ** 2 + (TY[i] - y) ** 2; if (d < bd) { bd = d; best = i; } } return best; };

  // ---------------------------------------------------------------- grups de balanceig (el triangle i el cordill es mouen junts)
  function swingPair(group) {
    const sw = new THREE.Group(); sw.position.set(0, PIV_Y, 0); group.add(sw);
    const inner = new THREE.Group(); inner.position.set(0, -PIV_Y, 0); sw.add(inner);
    return { sw, inner };
  }
  const SB = swingPair(G.barra), SC = swingPair(G.cordill);

  // ---------------------------------------------------------------- la barra (3 tubs deformables)
  const RAD = 12;
  function makeBarMesh(geom, material, part, s0, s1, seg) {
    const cnt = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(cnt * 3), 3));
    const mesh = add(SB.inner, geom, material, part, { note: 0 });
    const overlay = heat.overlay(mesh);
    const ringS = new Float32Array(seg + 1), ringNX = new Float32Array(seg + 1), ringNY = new Float32Array(seg + 1);
    for (let i = 0; i <= seg; i++) {
      const s = s0 + (s1 - s0) * i / seg, k = idxS(s);
      ringS[i] = s; ringNX[i] = NX[k]; ringNY[i] = NY[k];
    }
    return {
      geom, mesh, overlay, cnt, seg, ringS, ringNX, ringNY,
      base: Float32Array.from(geom.attributes.position.array),
      dIn: new Float32Array(seg + 1), dOut: new Float32Array(seg + 1), hv: new Float32Array(seg + 1)
    };
  }
  const mainPts = [];
  for (let s = E_LEN; s < LTOT - E_LEN - 1; s += 3) { const p = ptS(s); mainPts.push([p[0], p[1], 0]); }
  { const p = ptS(LTOT - E_LEN); mainPts.push([p[0], p[1], 0]); }
  const MAIN_SEG = 320;
  const pA0 = ptS(0), pA1 = ptS(E_LEN), pB0 = ptS(LTOT - E_LEN), pB1 = [B0[0], B0[1]];
  const barParts = [
    makeBarMesh(geo.curveTube(mainPts, RB, MAIN_SEG, RAD), barMat, 'barra', E_LEN, LTOT - E_LEN, MAIN_SEG),
    makeBarMesh(geo.tube([pA0[0], pA0[1], 0], [pA1[0], pA1[1], 0], RB, 10, RAD), endMat, 'cantonada', 0, E_LEN, 10),
    makeBarMesh(geo.tube([pB0[0], pB0[1], 0], [pB1[0], pB1[1], 0], RB, 10, RAD), endMat, 'cantonada', LTOT - E_LEN, LTOT, 10)
  ];
  // puntes arrodonides
  const capGeo = new THREE.SphereGeometry(RB, 18, 12);
  const capA = add(SB.inner, capGeo, endMat, 'cantonada', { pos: [A0[0], A0[1], 0], note: 0 });
  const capB = add(SB.inner, capGeo, endMat, 'cantonada', { pos: [B0[0], B0[1], 0], note: 0 });

  // ---------------------------------------------------------------- mà que apaga (no és una peça: no es pot clicar)
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a17d, roughness: 0.6, metalness: 0 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2f4a6b, roughness: 0.9, metalness: 0 });
  const hand = new THREE.Group();
  SB.inner.add(hand);
  const handMesh = (g, m, pos, scale) => {
    const me = new THREE.Mesh(g, m);
    if (pos) me.position.set(...pos);
    if (scale) me.scale.set(...scale);
    me.castShadow = true; me.raycast = () => {};
    hand.add(me); return me;
  };
  // marc local de la mà: X al llarg de la barra, Y cap enfora (palmell), Z cap al davant
  handMesh(new THREE.SphereGeometry(1, 28, 18), skin, [0, 19, -16], [40, 11, 34]);
  const FR = 7.4;
  [[-24, 2.1], [-8, 2.5], [8, 2.5], [24, 2.3]].forEach(([x, phiEnd]) => {
    const pts = [[x, 18, 0], [x, 17, 12]];
    for (let k = 1; k <= 4; k++) { const ph = 1.0 + (phiEnd - 1.0) * k / 4; pts.push([x, 13.6 * Math.cos(ph), 13.6 * Math.sin(ph)]); }
    handMesh(geo.curveTube(pts, FR, 24, 12), skin);
    handMesh(new THREE.SphereGeometry(FR, 14, 10), skin, pts[pts.length - 1]);
  });
  {
    const th = [[-34, 17, -28], [-31, 9, -21], [-24, 0, -15], [-16, -6, -12]];
    handMesh(geo.curveTube(th, 8, 20, 12), skin);
    handMesh(new THREE.SphereGeometry(8, 14, 10), skin, th[th.length - 1]);
  }
  handMesh(geo.curveTube([[0, 22, -36], [0, 52, -110], [0, 86, -190]], 25, 24, 20), skin);
  handMesh(geo.curveTube([[0, 78, -170], [0, 100, -230], [0, 118, -280]], 31, 16, 20), sleeve);
  hand.visible = false;
  // on agafa la mà: al mig del costat esquerre
  const sGrip = sNear((VT[0] + VL[0]) / 2, (VT[1] + VL[1]) / 2);
  const gripPt = ptS(sGrip);
  const gN = V3(NX[sGrip], NY[sGrip], 0);
  // la mà ve del davant (on és el músic): els dits passen per darrere la barra i el polze, per davant
  const gT = V3(uL[0], uL[1], 0);                     // de VT cap a VL (així X × Y = Z)
  const gZ = V3(0, 0, -1);
  hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(gT, gN, gZ));

  // ---------------------------------------------------------------- cordill (bucle de niló per la cantonada de dalt)
  const topInner = CT[1] + RC - RB;                  // part interior de la cantonada de dalt
  const RCO = 0.9, ZC = RB + RCO + 0.2;
  const loop = [
    [0, PIV_Y + 0.4, 0], [0, PIV_Y - 2, 2.4], [0, 172, 3.6], [0, 150, 5.2], [0, 125, ZC], [0, 106, ZC],
    [0, 100, ZC - 0.6], [0, topInner - 0.6, 4.2], [0, topInner - RCO - 0.4, 0], [0, topInner - 0.6, -4.2], [0, 100, -ZC + 0.6],
    [0, 106, -ZC], [0, 125, -ZC], [0, 150, -5.2], [0, 172, -3.6], [0, PIV_Y - 2, -2.4]
  ];
  add(SC.inner, geo.curveTube(loop, RCO, 220, 8, true), cordMat, 'cordill', { cast: false });
  add(SC.inner, new THREE.SphereGeometry(2.1, 12, 8), cordMat, 'cordill', { pos: [0, 162, -4.6] });   // nus
  add(SC.inner, geo.cyl(1.4, 7, 'y', 8), cordMat, 'cordill', { pos: [0.8, 156, -4.8], rot: [0, 0, 0.35] });

  // ---------------------------------------------------------------- pinça (fleix d'acer al voltant del braç + cargol)
  function thick(pts, th) {
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const n1 = (() => { const q = i > 0 ? a : p, r = i > 0 ? p : b; const t = nrm2(r[0] - q[0], r[1] - q[1]); return [-t[1], t[0]]; })();
      const n2 = (() => { const q = i < pts.length - 1 ? p : a, r = i < pts.length - 1 ? b : p; const t = nrm2(r[0] - q[0], r[1] - q[1]); return [-t[1], t[0]]; })();
      const m = nrm2(n1[0] + n2[0], n1[1] + n2[1]);
      const len = (th / 2) / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]);
      L.push([p[0] + m[0] * len, p[1] + m[1] * len]);
      R.push([p[0] - m[0] * len, p[1] - m[1] * len]);
    }
    return geo.shape(L.concat(R.reverse()));
  }
  {
    const RJ = 9.2, TAB = 1.05, CW = 20;
    const prof = [[TAB, 164], [TAB, 198], [RJ, 211], [RJ, ARM_Y]];
    for (let k = 1; k < 18; k++) { const a = Math.PI * k / 18; prof.push([RJ * Math.cos(a), ARM_Y + RJ * Math.sin(a)]); }
    prof.push([-RJ, ARM_Y], [-RJ, 211], [-TAB, 198], [-TAB, 164]);
    const g = geo.ext(thick(prof, 1.6), CW, { bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 2 });
    g.translate(0, 0, -CW / 2);
    add(G.pinca, g, clipMat, 'pinca', { rot: [0, -Math.PI / 2, 0] });
    // ullets del forat per on passa el cordill
    const eye = new THREE.TorusGeometry(3.3, 0.85, 8, 24);
    add(G.pinca, eye, clipMat, 'pinca', { pos: [0, PIV_Y - 1, 2.1] });
    add(G.pinca, eye, clipMat, 'pinca', { pos: [0, PIV_Y - 1, -2.1] });
    // cargol de pressió amb pom
    add(G.pinca, geo.cyl(1.8, 10, 'z', 12), clipMat, 'pinca', { pos: [0, ARM_Y - 2, 11.5] });
    add(G.pinca, geo.lathe([[0, 0], [6.4, 0], [7.2, 1.2], [7.2, 6.2], [6.2, 7.6], [2.6, 8.4], [0, 8.4]], 24), knobMat, 'pinca',
      { pos: [0, ARM_Y - 2, 15], rot: [Math.PI / 2, 0, 0] });
    add(G.pinca, geo.cyl(3.2, 1.6, 'z', 16), clipMat, 'pinca', { pos: [0, ARM_Y - 2, 10.6] });
  }

  // ---------------------------------------------------------------- suport (trípode amb braç horitzontal)
  {
    // pal de dalt + colze + braç, tot d'una peça
    const sp = [];
    const RCOL = 30;
    for (let y = -300; y < ARM_Y - RCOL; y += 20) sp.push([XP, y, 0]);
    for (let k = 0; k <= 8; k++) { const a = Math.PI - (Math.PI / 2) * k / 8; sp.push([XP + RCOL + RCOL * Math.cos(a), ARM_Y - RCOL + RCOL * Math.sin(a), 0]); }
    for (let x = XP + RCOL + 20; x <= 40; x += 20) sp.push([x, ARM_Y, 0]);
    sp.push([46, ARM_Y, 0]);
    add(G.suport, geo.curveTube(sp, 6.5, 260, 16), standChrome, 'suport');
    add(G.suport, geo.lathe([[0, 0], [7.4, 0], [7.4, 9], [6.4, 11.5], [0, 11.5]], 20), rubberMat, 'suport',
      { pos: [44, ARM_Y, 0], rot: [0, 0, -Math.PI / 2] });
    // pal de baix (més gruixut) i anella amb pom de fixació
    const POST_BOT = FLOOR + 80;
    add(G.suport, geo.tube([XP, POST_BOT, 0], [XP, -280, 0], 10.5, 1, 20), standMat, 'suport');
    add(G.suport, geo.lathe([[0, -16], [12, -16], [14, -13], [14, 13], [12, 16], [0, 16]], 24), standMat, 'suport', { pos: [XP, -282, 0] });
    add(G.suport, geo.cyl(2.2, 16, 'z', 10), standChrome, 'suport', { pos: [XP, -282, 20] });
    add(G.suport, geo.lathe([[0, 0], [8, 0], [9, 3], [9, 8], [7, 11], [0, 11]], 20), rubberMat, 'suport',
      { pos: [XP, -282, 26], rot: [Math.PI / 2, 0, 0] });
    add(G.suport, geo.tube([XP - 8, -282, 33], [XP + 8, -282, 33], 2.6, 1, 10), rubberMat, 'suport');
    // trípode
    const HUB = FLOOR + 230, LOW = FLOOR + 95;
    add(G.suport, geo.lathe([[0, -22], [15, -22], [17, -18], [17, 18], [15, 22], [0, 22]], 24), standMat, 'suport', { pos: [XP, HUB, 0] });
    add(G.suport, geo.lathe([[0, -14], [14, -14], [15.5, -11], [15.5, 11], [14, 14], [0, 14]], 24), standMat, 'suport', { pos: [XP, LOW, 0] });
    const footGeo = new THREE.SphereGeometry(10, 18, 10);
    for (const az of [Math.PI / 6, 5 * Math.PI / 6, 3 * Math.PI / 2]) {
      const cx = Math.cos(az), cz = Math.sin(az);
      const top = [XP + cx * 16, HUB - 8, cz * 16], foot = [XP + cx * 300, FLOOR + 10, cz * 300];
      add(G.suport, geo.tube(top, foot, 6, 1, 14), standMat, 'suport');
      add(G.suport, footGeo, rubberMat, 'suport', { pos: [foot[0], FLOOR + 6, foot[2]], scale: [1, 0.6, 1] });
      const u = 0.45, mid = [top[0] + (foot[0] - top[0]) * u, top[1] + (foot[1] - top[1]) * u, top[2] + (foot[2] - top[2]) * u];
      add(G.suport, geo.tube([XP + cx * 15, LOW, cz * 15], mid, 3.6, 1, 10), standMat, 'suport');
      add(G.suport, geo.cyl(4.2, 9, 'y', 12), standChrome, 'suport', { pos: mid });
    }
  }

  // ---------------------------------------------------------------- batedor
  const LB = 195, LC = 168, RBT = 3.2;                   // llargada, punt de contacte, radi de la vareta
  const beat = new THREE.Group();
  G.batedor.add(beat);
  {
    const hg = geo.lathe([[0, 0], [6.2, 0], [7.6, 2.5], [7.6, 12], [6.7, 18], [6.7, 74], [7.2, 80], [5.6, 86], [0, 86]], 28);
    hg.rotateZ(-Math.PI / 2);
    add(beat, hg, gripMat, 'batedor');
    add(beat, geo.cyl(4.4, 10, 'x', 18), ferruleMat, 'batedor', { pos: [89, 0, 0] });
    add(beat, geo.cyl(RBT, LB - 92, 'x', 16), rodMat, 'batedor', { pos: [92 + (LB - 92) / 2, 0, 0] });
    add(beat, new THREE.SphereGeometry(RBT, 16, 10), rodMat, 'batedor', { pos: [LB, 0, 0] });
  }
  const XAX = V3(1, 0, 0);
  function hitCfg(X, Nraw, Draw, thW, thR) {
    const N = V3(...Nraw).normalize();
    const D = V3(...Draw); D.addScaledVector(N, -D.dot(N)).normalize();
    const contact = V3(...X).addScaledVector(N, RB + RBT);
    return { X, N, D0: D, G0: contact.clone().addScaledVector(D, -LC), thW, thR };
  }
  const xSoft = [VR[0] + (VT[0] - VR[0]) * 0.78, VR[1] + (VT[1] - VR[1]) * 0.78, 0];
  const CFG = {
    cop: hitCfg([-15, YB, 0], [0, -1, 0.3], [-0.75, 0, -0.66], 0.5, 0.42),
    soft: hitCfg(xSoft, [0.866, 0.5, 0.4], [-0.4, -0.15, -0.9], 0.24, 0.3)
  };
  // redoble: dins la cantonada tancada de baix a l'esquerra
  const RC_D = 34, RG = RB + RBT + 2.5;                 // marge: la barra també es mou
  const rollB = V3(VL[0] + RC_D, YB + RG, 0);
  const rollL = V3(VL[0] + 0.5 * RC_D + 0.866 * RG, YB + 0.866 * RC_D - 0.5 * RG, 0);
  const rollMid = rollB.clone().add(rollL).multiplyScalar(0.5);
  const rollD = V3(-0.35, 0.1, -1).normalize();
  const rollG = rollMid.clone().addScaledVector(rollD, -LC);
  const rollRest = { G: rollG.clone().add(V3(0, 0, 60)), D: rollD.clone() };

  const pose = { G: V3(), D: V3(1, 0, 0) };
  const tmpPose = { G: V3(), D: V3() }, tmpPose2 = { G: V3(), D: V3() };
  function poseTheta(cfg, th, out) {
    out.G.copy(cfg.G0);
    out.D.copy(cfg.D0).multiplyScalar(Math.cos(th)).addScaledVector(cfg.N, Math.sin(th));
    return out;
  }
  function poseAim(target, out) { out.G.copy(rollG); out.D.copy(target).sub(rollG).normalize(); return out; }
  function lerpPose(a, b, u, out) {
    out.G.copy(a.G).lerp(b.G, u);
    out.D.copy(a.D).lerp(b.D, u);
    if (out.D.lengthSq() < 1e-6) out.D.copy(b.D);
    out.D.normalize();
    return out;
  }
  // trasllat d'una posició a una altra: el batedor passa per davant del triangle per no travessar la barra
  function movePose(a, b, u, out) {
    lerpPose(a, b, ease(u), out);
    out.G.z += 70 * Math.sin(Math.PI * clamp01(u));
    return out;
  }
  function applyPose(p) { beat.position.copy(p.G); beat.quaternion.setFromUnitVectors(XAX, p.D); }
  poseTheta(CFG.cop, CFG.cop.thR, pose);
  applyPose(pose);
  const beatLabel = pose.G.clone().addScaledVector(pose.D, 45).toArray();

  // ---------------------------------------------------------------- notes i so
  const notes = [
    { label: 'Cop', f: 1300, kind: 'cop' },
    { label: 'Redoble', f: 1300, kind: 'roll' },
    { label: 'Apagat', f: 1300, kind: 'mute' },
    { label: 'Suau', f: 1300, kind: 'soft' }
  ];
  const TRI = [
    { k: 1, a: 0.5, tau: 3.4 },
    { k: 1.51, a: 0.22, tau: 2.6 },
    { k: 2.7, a: 0.62, tau: 4.2 },
    { k: 3.86, a: 0.34, tau: 3.0 },
    { k: 5.2, a: 0.52, tau: 3.6 },
    { k: 6.71, a: 0.3, tau: 2.5 },
    { k: 8.6, a: 0.44, tau: 2.9 },
    { k: 10.3, a: 0.22, tau: 2.1 },
    { k: 12.7, a: 0.3, tau: 2.3 }
  ];
  const timers = [];
  const ROLL_P = 0.083, ROLL_N = 18, ROLL_DUR = ROLL_P * ROLL_N;

  // ---------------------------------------------------------------- estat de l'animació
  const T_STR = 0.06, T_BACK = 0.3, T_GRIP = 0.36, T_LET = 0.95, T_OUT = 1.3;
  const LAMBDA = 115, K1 = 2 * Math.PI / LAMBDA, K2 = 2 * Math.PI / (LAMBDA * 1.25);
  const A_IN = 3.2, A_OUT = 2.0;                        // mm (exagerat)
  const sCop = sNear(CFG.cop.X[0], CFG.cop.X[1]);
  const sSoft = sNear(xSoft[0], xSoft[1]);
  const sCorner = sNear(CL[0] - RC * 0.5, CL[1] - RC * 0.866);
  const airS = [sNear(50, YB + H / 2), sNear(-50, YB + H / 2), sNear(0, YB)];
  const EXC = {
    cop: { s0: sCop, amp: 1, sw: [0.05, 0.016, 0.004] },
    mute: { s0: sCop, amp: 1, sw: [0.05, 0.016, 0.004] },
    soft: { s0: sSoft, amp: 0.45, sw: [0.012, -0.006, -0.022] },
    roll: { s0: sCorner, amp: 0.75, sw: [0.008, 0.004, 0.006] }
  };

  let pending = null, act = null, lastT = 0, moved = false, airK = 0, flip = false;
  const validIdx = i => typeof i === 'number' && i >= 0 && i < notes.length;
  const noteIdx = note => {
    if (typeof note === 'number') return note;
    if (!note) return -1;
    let i = notes.indexOf(note);
    if (i < 0) i = notes.findIndex(n => n.label === note.label);
    return i;
  };

  function startNote(idx, t) {
    const kind = notes[idx].kind;
    const from = { G: pose.G.clone(), D: pose.D.clone() };
    let tMove = 0.14;
    if (kind !== 'roll') {
      const w = poseTheta(kind === 'soft' ? CFG.soft : CFG.cop, (kind === 'soft' ? CFG.soft : CFG.cop).thW, tmpPose);
      if (from.G.distanceTo(w.G) < 30 && from.D.dot(w.D) > 0.97) tMove = 0.05;
    }
    act = { idx, kind, t0: t, from, tMove, tHit: kind === 'roll' ? tMove : tMove + T_STR };
  }

  function restoreBar() {
    SB.sw.rotation.set(0, 0, 0); SC.sw.rotation.set(0, 0, 0);
    if (!moved) return;
    for (const b of barParts) {
      const pa = b.geom.attributes.position, ca = b.geom.attributes.color;
      pa.array.set(b.base); ca.array.fill(0);
      pa.needsUpdate = true; ca.needsUpdate = true;
    }
    capA.position.set(A0[0], A0[1], 0); capB.position.set(B0[0], B0[1], 0);
    moved = false;
  }

  function beaterPose(tt) {
    const a = act;
    if (a.kind === 'roll') {
      if (tt < a.tMove) return movePose(a.from, poseAim(rollB, tmpPose), tt / a.tMove, pose);
      const tr = tt - a.tMove;
      if (tr < ROLL_DUR) {
        const u = 0.5 - 0.5 * Math.cos(Math.PI * tr / ROLL_P);
        return poseAim(tmpPose2.G.copy(rollB).lerp(rollL, u), pose);
      }
      const endU = 0.5 - 0.5 * Math.cos(Math.PI * ROLL_N);
      const endP = poseAim(tmpPose2.G.copy(rollB).lerp(rollL, endU), tmpPose);
      return lerpPose(endP, rollRest, ease((tr - ROLL_DUR) / 0.35), pose);
    }
    const cfg = a.kind === 'soft' ? CFG.soft : CFG.cop;
    if (tt < a.tMove) return movePose(a.from, poseTheta(cfg, cfg.thW, tmpPose), tt / a.tMove, pose);
    if (tt < a.tHit) { const v = (tt - a.tMove) / T_STR; return poseTheta(cfg, cfg.thW * (1 - v * v), pose); }
    const v = clamp01((tt - a.tHit) / T_BACK);
    return poseTheta(cfg, cfg.thR * (1 - Math.pow(1 - v, 3)), pose);
  }

  // ---------------------------------------------------------------- objecte de l'instrument
  return {
    id: 'triangle',
    family: 'Percussió no afinada',
    name: 'Triangle',
    intro: "El triangle és una barra d'acer doblegada que penja d'un cordill. Quan el batedor la colpeja, la barra vibra i fa un so agut i brillant que dura molta estona.",
    floorY: FLOOR,
    camera: {
      explore: { pos: [300, 160, 1000], target: [-60, 10, 0] },
      exploded: { pos: [620, 260, 2350], target: [-150, -280, -60] }
    },
    parts: {
      barra: {
        name: "Barra d'acer",
        text: "És una barra d'acer d'uns 10 mm de gruix, doblegada en forma de triangle. Quan la colpeges, vibra i fa un so agut i brillant.",
        dato: 'Els triangles d’orquestra solen fer entre 15 i 25 cm de costat. Com més gran és el triangle, més greu sona.'
      },
      cantonada: {
        name: 'Cantonada oberta',
        text: 'Una de les tres cantonades no està tancada: les dues puntes de la barra no es toquen. Així el triangle no fa una nota clara i sona més brillant.',
        dato: 'Per això el triangle és de percussió no afinada: no hi pots tocar una melodia.'
      },
      cordill: {
        name: 'Cordill',
        text: 'És un cordill prim de niló que penja el triangle per la cantonada de dalt. Així la barra vibra lliure: si l’aguantes amb la mà, el so s’apaga.',
        dato: 'Sovint és fil de pescar, perquè és prim i fort i gairebé no frena la vibració.'
      },
      pinca: {
        name: 'Pinça',
        text: 'És una pinça de metall que aguanta el cordill. S’enganxa a un suport o a un faristol, i així el músic té les dues mans lliures.',
        dato: 'Sense suport, el músic aguanta la pinça amb una mà i toca amb l’altra.'
      },
      suport: {
        name: 'Suport',
        text: 'És un peu de tres potes amb un braç horitzontal, semblant a un faristol. Aguanta el triangle a l’altura de les mans.',
        dato: 'A l’orquestra, sovint el percussionista penja el triangle del seu propi faristol.'
      },
      batedor: {
        name: 'Batedor',
        text: 'És una vareta d’acer amb un mànec per agafar-la bé. Les varetes gruixudes fan un so fort, i les primes, un so més suau.',
        dato: 'Els percussionistes tenen batedors de diversos gruixos i trien el que va millor per a cada obra.'
      }
    },
    labels: [
      { part: 'barra', group: 'barra', at: [gripPt[0] + gN.x * (RB + 1), gripPt[1] + gN.y * (RB + 1), 0], internal: false },
      { part: 'cantonada', group: 'barra', at: [(A0[0] + B0[0]) / 2 + 3, (A0[1] + B0[1]) / 2 - 2, 0], internal: false },
      { part: 'cordill', group: 'cordill', at: [0, 140, 5.4], internal: false },
      { part: 'pinca', group: 'pinca', at: [0, 214, 10.2], internal: false },
      { part: 'suport', group: 'suport', at: [XP, -420, 11], internal: false },
      { part: 'batedor', group: 'batedor', at: beatLabel, internal: false }
    ],
    explode: {
      batedor: [220, -40, 240, 0],
      barra: [0, -190, 0, 0.08],
      cordill: [0, -70, 0, 0.16],
      pinca: [0, 90, 0, 0.24],
      suport: [-200, 0, -160, 0.32]
    },
    notes,
    options: null,
    chain: ['Batedor', "Barra d'acer", 'Vibració', 'Aire'],
    tour: [
      {
        part: 'batedor', chain: 0, note: 0, title: 'El batedor',
        text: 'El batedor és una vareta d’acer. Colpeja la barra per fora, al costat de baix, i rebota de seguida. Si es quedés enganxat, apagaria el so.',
        cam: { pos: [210, -170, 330], target: [20, -70, 40] }, slow: 0.35, xray: false
      },
      {
        part: 'barra', chain: 2, note: 0, title: 'La barra vibra',
        text: 'Després del cop, la barra es doblega una mica endavant i enrere, molt de pressa. Aquestes ones corren per tota la barra, d’una punta a l’altra. Al mapa de vibració, el taronja i el blau mostren cap a quin costat es mou cada tros.',
        cam: { pos: [90, 40, 430], target: [0, 20, 0] }, slow: 0.3, xray: false
      },
      {
        part: 'cantonada', chain: 2, note: 0, title: 'La cantonada oberta',
        text: 'Mira la cantonada de baix a la dreta: les dues puntes de la barra no es toquen. Gràcies a aquesta obertura, el triangle no fa una nota clara i sona més brillant. Per això és un instrument de percussió no afinada.',
        cam: { pos: [215, -10, 195], target: [86, -50, 0] }, slow: 0.4, xray: false
      },
      {
        part: 'cordill', chain: 1, note: 2, title: 'Penjat d’un cordill',
        text: 'El triangle penja d’un cordill prim perquè la barra pugui vibrar lliure. Si l’agafes amb la mà, la vibració s’atura i el so s’apaga de cop. Els músics ho fan expressament quan volen un so curt.',
        cam: { pos: [190, 170, 420], target: [-25, 90, 0] }, slow: 0.6, xray: false
      },
      {
        part: 'barra', chain: 3, note: 1, title: 'El so surt',
        text: 'La barra empeny l’aire i les vibracions arriben a les teves orelles. Ara sents un redoble: el batedor repica molt ràpid dins d’una cantonada tancada. Tot i ser tan petit, el triangle se sent per sobre de tota l’orquestra.',
        cam: { pos: [330, 230, 1050], target: [-60, 20, 0] }, slow: 1, xray: false
      }
    ],
    soundSource: { group: 'barra', at: [0, 10, 0] },

    play(note, opt) {
      let idx = noteIdx(note);
      if (!validIdx(idx)) idx = 0;
      const n = notes[idx], f = n.f;
      while (timers.length) clearTimeout(timers.pop());
      pending = idx;
      try {
        if (n.kind === 'roll') {
          for (let k = 0; k < ROLL_N; k++) {
            const last = k === ROLL_N - 1;
            const g = (last ? 0.6 : (k % 2 ? 0.4 : 0.48)) * (0.9 + 0.2 * Math.random()) * (k < 2 ? 0.8 : 1);
            const hit = () => synth.additive({
              f, partials: TRI.map(p => ({ k: p.k, a: p.a * (0.85 + 0.3 * Math.random()), tau: p.tau })),
              attack: 0.001, release: last ? null : 0.22,
              noise: { amount: 0.18, dur: 0.006, hp: 3000 }, gain: g
            });
            if (k === 0) hit(); else timers.push(setTimeout(hit, Math.round(k * ROLL_P * 1000)));
          }
          return { attack: 0.01, hold: ROLL_DUR + 0.05, release: 1.2 };
        }
        if (n.kind === 'mute') {
          synth.additive({ f, partials: TRI, attack: 0.001, hold: 0.33, release: 0.05, noise: { amount: 0.45, dur: 0.012, hp: 2500 }, gain: 0.95 });
          return { attack: 0.004, hold: 0.5, release: 0.25 };
        }
        if (n.kind === 'soft') {
          synth.additive({
            f, partials: TRI.map(p => ({ k: p.k, a: p.a * (p.k > 5 ? 0.45 : 1), tau: p.tau })),
            attack: 0.002, noise: { amount: 0.1, dur: 0.008, hp: 3000 }, gain: 0.42
          });
          return { attack: 0.004, hold: 0, release: 1.4 };
        }
        synth.additive({ f, partials: TRI, attack: 0.001, noise: { amount: 0.45, dur: 0.012, hp: 2500 }, gain: 0.95 });
      } catch (e) { /* sense àudio: l'animació continua */ }
      return { attack: 0.004, hold: 0, release: 1.8 };
    },

    update(dt, s) {
      const t = s.t || 0, env = s.env || 0;
      if (pending !== null) { startNote(pending, t); pending = null; }
      else if (t + 1e-4 < lastT) {
        if (act && t < act.t0) act.t0 = t;
        else if (validIdx(s.noteIndex)) startNote(s.noteIndex, t);
      }
      if (act && t < act.t0) act.t0 = t;
      lastT = t;
      if (!act) return;
      const tt = t - act.t0;

      // --- batedor: arc, cop i rebot (o repic dins la cantonada)
      applyPose(beaterPose(tt));

      // --- mà que apaga (només «Apagat»)
      let damp = 1;
      if (act.kind === 'mute') {
        let off = 1;
        if (tt < 0.16) off = 1;
        else if (tt < T_GRIP) off = 1 - ease((tt - 0.16) / (T_GRIP - 0.16));
        else if (tt < T_LET) off = 0;
        else if (tt < T_OUT) off = ease((tt - T_LET) / (T_OUT - T_LET));
        hand.visible = off < 0.985 && env > 0;
        hand.position.set(gripPt[0] + gN.x * 150 * off, gripPt[1] + gN.y * 150 * off, 90 * off);
        if (tt > T_GRIP) damp = Math.exp(-(tt - T_GRIP) / 0.06);
      } else hand.visible = false;

      // --- barra: ones de flexió que corren des del punt del cop + mapa de vibració
      const ex = EXC[act.kind];
      const tau = tt - act.tHit;
      const a = tau > 0 ? ex.amp * env * clamp01(tau / 0.02) * damp : 0;
      if (a <= 0.003 || env <= 0) { restoreBar(); return; }

      // balanceig suau al cordill
      const swA = clamp01(env * 5) * Math.exp(-tau / 2.2) * (act.kind === 'mute' && tt > T_GRIP ? Math.exp(-(tt - T_GRIP) / 0.15) : 1);
      const sp = Math.sin(2 * Math.PI * tau / 1.05) * swA, sp2 = Math.sin(2 * Math.PI * tau / 0.8 + 0.4) * swA;
      SB.sw.rotation.set(ex.sw[0] * sp, ex.sw[1] * sp2, ex.sw[2] * sp);
      SC.sw.rotation.copy(SB.sw.rotation);

      const fv = s.fvis || 1.5, wt = 2 * Math.PI * fv * tau;
      const front = 1.5 * LAMBDA * fv * tau + 25;
      const doHeat = !!s.heat;
      for (const b of barParts) {
        for (let i = 0; i <= b.seg; i++) {
          const d = Math.abs(b.ringS[i] - ex.s0);
          const m = clamp01((front - d) / 50) * (0.6 + 0.4 * Math.exp(-d / 180)) * a;
          const w1 = m * Math.cos(K1 * d - wt), w2 = m * Math.sin(K2 * d - wt + 0.6);
          b.dIn[i] = A_IN * w1; b.dOut[i] = A_OUT * w2; b.hv[i] = Math.max(-1, Math.min(1, w1));
        }
        const pa = b.geom.attributes.position, ca = b.geom.attributes.color;
        const Pp = pa.array, C = ca.array, B = b.base, R1 = RAD + 1;
        for (let k = 0; k < b.cnt; k++) {
          const i = Math.min(b.seg, (k / R1) | 0);
          const di = b.dIn[i];
          Pp[k * 3] = B[k * 3] + b.ringNX[i] * di;
          Pp[k * 3 + 1] = B[k * 3 + 1] + b.ringNY[i] * di;
          Pp[k * 3 + 2] = B[k * 3 + 2] + b.dOut[i];
          if (doHeat) heat.color(b.hv[i], C, k);
        }
        pa.needsUpdate = true;
        if (doHeat) ca.needsUpdate = true;
      }
      // les puntes segueixen la barra
      const e0 = barParts[1], e1 = barParts[2];
      capA.position.set(A0[0] + e0.ringNX[0] * e0.dIn[0], A0[1] + e0.ringNY[0] * e0.dIn[0], e0.dOut[0]);
      const j = e1.seg;
      capB.position.set(B0[0] + e1.ringNX[j] * e1.dIn[j], B0[1] + e1.ringNY[j] * e1.dIn[j], e1.dOut[j]);
      moved = true;

      // --- aire: petites bufades a banda i banda de la barra
      if (a > 0.05) {
        SB.inner.updateWorldMatrix(true, false);
        const sk = airS[airK = (airK + 1) % airS.length], ik = idxS(sk);
        flip = !flip;
        const n = V3(NX[ik], NY[ik], 0);
        const p = SB.inner.localToWorld(V3(TX[ik] + n.x * (RB + 2), TY[ik] + n.y * (RB + 2), 0));
        const dir = n.clone().multiplyScalar(0.55).add(V3(0, 0, flip ? 0.85 : -0.85)).transformDirection(SB.inner.matrixWorld);
        fx.air(p, dir, 150 * a * (0.4 + 0.6 * Math.abs(Math.cos(wt))), 0.5, 130);
      }
    }
  };
}
