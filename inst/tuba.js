// Tuba en Si bemoll (4 pistons drets) — mòdul d'instrument (Vent metall)
// Unitats: mm. Y amunt. La tuba està dreta, amb el pavelló cap amunt.
// El músic és a +Z (davant): el broquet mira cap a +Z i els pistons són al davant (z = 80).
// El cos (canó del pavelló, branca gran i corba de baix) és al pla z = -35.
// Camí de l'aire: broquet → tudel → pistons 1-2-3-4 (amb les seves bombes) → bomba d'afinació
//                 → branca gran (baixa) → corba de baix → canó del pavelló (puja) → pavelló.
export default function (ctx) {
  const { THREE, V3, groups, mat, M, geo, fx, synth } = ctx;
  const add = (g, ge, m, part, o) => ctx.add(g, ge, m, part, o || {});
  const PI = Math.PI;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, u) => a + (b - a) * u;

  const G = groups(['broquet', 'tudel', 'pistons', 'bomba1', 'bomba2', 'bomba3', 'bomba4', 'bombaAfin', 'tubs', 'pavello']);

  // ---------------------------------------------------------------- materials
  // Còpies dels materials del motor amb raigs X (per veure el camí de l'aire per dins).
  const pick = (ref, extra) => {
    const o = { color: ref.color.clone(), metalness: ref.metalness, roughness: ref.roughness, side: THREE.DoubleSide };
    if (ref.clearcoat !== undefined) { o.clearcoat = ref.clearcoat; o.clearcoatRoughness = ref.clearcoatRoughness; }
    return Object.assign(o, extra || {});
  };
  const brassRef = M.brass('tubs'), silverRef = M.silver('broquet'), nickelRef = M.nickel('pistons');
  const brass = (part, extra) => mat(part, pick(brassRef, Object.assign({ clearcoat: 0.8, clearcoatRoughness: 0.1 }, extra || {})), { xray: true });
  const mBroquet = mat('broquet', pick(silverRef), { phys: false, xray: true });
  const mTudel = brass('tudel');
  const mPist = brass('pistons');
  const mSlide = brass('bombes');
  const mTubs = brass('tubs');
  const mGuard = brass('tubs', { roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const mBell = brass('pavello');
  const mPiston = mat('pistons', pick(nickelRef), { phys: false, xray: true });   // pistó per dins de la camisa
  const mStem = M.nickel('pistons');
  const mSkirt = M.nickel('pistons');
  const mPearl = mat('pistons', {
    color: 0xF4EFE6, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    iridescence: 0.55, iridescenceIOR: 1.35, sheen: 0.35, sheenColor: new THREE.Color(0xFFE6F0), side: THREE.DoubleSide
  });
  const mFelt = M.felt('pistons', 0x7A1F24);
  const mCork = mat('bombes', { color: 0xA87A4E, roughness: 0.95 });

  // Brillantor de l'aire (no són peces: no es poden seleccionar)
  const GLOW = new THREE.Color(0x66E0FF), BEAD = new THREE.Color(0xC8F6FF);
  const glowMat = op => new THREE.MeshBasicMaterial({
    color: GLOW, transparent: true, opacity: op, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.FrontSide, toneMapped: false
  });
  const noPick = o => { o.raycast = () => {}; o.castShadow = false; o.receiveShadow = false; return o; };

  // ---------------------------------------------------------------- ajudes de corbes
  function densify(arr, step) {
    const out = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      const a = out[out.length - 1], b = arr[i], L = a.distanceTo(b);
      if (L < 0.05) continue;
      const k = Math.max(1, Math.ceil(L / step));
      for (let j = 1; j <= k; j++) out.push(a.clone().lerp(b, j / k));
    }
    return out;
  }
  // Polilínia amb cantonades arrodonides. Cada punt: [x,y,z] o [x,y,z,radi].
  function rounded(pts, rDef = 8) {
    const P = pts.map(p => V3(p[0], p[1], p[2]));
    const R = pts.map(p => (p.length > 3 ? p[3] : rDef));
    const out = [P[0].clone()];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
      const l1 = d1.length(), l2 = d2.length();
      if (l1 < 1e-6 || l2 < 1e-6) continue;
      d1.multiplyScalar(1 / l1); d2.multiplyScalar(1 / l2);
      const th = Math.acos(Math.max(-1, Math.min(1, d1.dot(d2))));
      if (th < 1e-3 || R[i] <= 0) { out.push(b.clone()); continue; }
      let t = R[i] * Math.tan(th / 2);
      t = Math.min(t, l1 * (i - 1 === 0 ? 0.95 : 0.5), l2 * (i + 1 === P.length - 1 ? 0.95 : 0.5));
      const p1 = b.clone().addScaledVector(d1, -t), p2 = b.clone().addScaledVector(d2, t);
      const m = Math.max(5, Math.ceil(12 * th / (PI / 2)));
      for (let k = 0; k <= m; k++) {
        const u = k / m;
        out.push(p1.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(b, 2 * u * (1 - u)).addScaledVector(p2, u * u));
      }
    }
    out.push(P[P.length - 1].clone());
    return densify(out, 5);
  }
  const plen = P => { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; };
  function splitRuns(P, keyOf) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const k = keyOf(P[i].clone().add(P[i + 1]).multiplyScalar(0.5));
      const last = out[out.length - 1];
      if (last && last.key === k) last.P.push(P[i + 1]);
      else out.push({ key: k, P: [P[i], P[i + 1]] });
    }
    return out;
  }
  // Tub amb radi variable al llarg d'una polilínia (els tubs de la tuba s'eixamplen a poc a poc).
  // r: número o funció r(u), u = 0..1 al llarg del tub.
  const _c = V3(0, 0, 0);
  function varTubeGeo(P, r, radial, segs) {
    const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
    curve.arcLengthDivisions = Math.max(200, P.length * 4);
    segs = segs || Math.max(12, Math.round(plen(P) / 2.5));
    const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    const rf = typeof r === 'function' ? r : () => r;
    const pos = g.attributes.position;
    for (let i = 0; i <= segs; i++) {
      curve.getPointAt(i / segs, _c);
      const rr = rf(i / segs);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        pos.setXYZ(k, _c.x + (pos.getX(k) - _c.x) * rr, _c.y + (pos.getY(k) - _c.y) * rr, _c.z + (pos.getZ(k) - _c.z) * rr);
      }
    }
    pos.needsUpdate = true; g.computeBoundingSphere(); g.computeBoundingBox();
    return { g, segs };
  }
  const tubeAlong = (group, P, r, m, part, radial = 18) => add(group, varTubeGeo(P, r, radial).g, m, part);
  // Cilindre orientat en una direcció qualsevol
  function cylAlong(group, center, dir, r, len, m, part, seg = 28) {
    const me = add(group, geo.cyl(r, len, 'y', seg), m, part, { pos: [center.x, center.y, center.z] });
    me.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
    return me;
  }
  // Virolla (anella) en un punt d'una polilínia (frac = 0..1 de la llargada)
  function ringAt(group, P, frac, r, len, m, part) {
    const L = plen(P) * frac; let acc = 0, i = 1;
    for (; i < P.length - 1; i++) { const d = P[i].distanceTo(P[i - 1]); if (acc + d >= L) break; acc += d; }
    const a = P[i - 1], b = P[i], u = clamp01((L - acc) / Math.max(1e-6, a.distanceTo(b)));
    return cylAlong(group, a.clone().lerp(b, u), b.clone().sub(a), r, len, m, part, 32);
  }
  // Lathe orientat al llarg de -Z: la y del perfil creix cap a -Z a partir de z0
  const zLathe = (group, prof, m, part, x, y, z0, seg = 56) =>
    add(group, geo.lathe(prof, seg), m, part, { pos: [x, y, z0], rot: [-PI / 2, 0, 0] });
  // Virolla vertical (al voltant de l'eix Y)
  const yRing = (group, x, y, z, r, h, m, part) =>
    add(group, geo.lathe([[r - 0.6, -h / 2], [r + 1.4, -h / 2 + 0.8], [r + 1.8, -h / 2 + 2], [r + 1.8, h / 2 - 2], [r + 1.4, h / 2 - 0.8], [r - 0.6, h / 2]], 64), m, part, { pos: [x, y, z] });
  // Travessa (barra de reforç) amb plaquetes a les puntes
  function brace(group, part, m, a, b, r = 2.6) {
    add(group, geo.tube(a, b, r, 1, 10), m, part);
    const A = V3(a[0], a[1], a[2]), B = V3(b[0], b[1], b[2]), d = B.clone().sub(A).normalize();
    cylAlong(group, A, d, r * 2.4, 1.8, m, part, 18);
    cylAlong(group, B, d, r * 2.4, 1.8, m, part, 18);
  }

  // ---------------------------------------------------------------- mides principals
  const ZB = -35;                 // pla del cos
  const XB = -170;                // eix del canó del pavelló
  const XR = 100;                 // eix de la branca gran
  const YJ = -270;                // on comença la corba de baix
  const BOW_R = 135, BOW_CX = (XB + XR) / 2;   // corba de baix (semicercle)
  const BELL_TOP = 470, BELL_Y0 = 100;         // vora del pavelló i unió pavelló/canó
  const bellR = y => 210 * Math.pow(56 / (BELL_TOP - y + 56), 0.7);       // radi del canó i del pavelló
  const BR_TOP = 200;
  const branchR = y => 13 + 17 * Math.pow(clamp01((BR_TOP - y) / (BR_TOP - YJ)), 1.6); // branca gran: 13 → 30
  const bowR = u => lerp(branchR(YJ), bellR(YJ), u);
  const ZV = 80, CAS_R = 17;      // pistons: pla i radi de la camisa
  const VX = { 1: -84, 2: -36, 3: 12, 4: 60 };
  const Y_IN = { 1: 40, 2: 10, 3: 40, 4: 10 }, Y_OUT = { 1: 10, 2: 40, 3: 10, 4: 40 };
  const VR = 9.5;                 // radi dels tubs dels pistons
  const MP = { x: 40, y: 300, z: 268 };   // vora del broquet

  // ================================================================ BROQUET
  {
    const prof = [
      [16.0, 0.5], [15.6, 3], [14.6, 8], [12.6, 14], [9.8, 20], [7.0, 25], [4.8, 29], [4.0, 33], [4.0, 40],
      [4.6, 55], [5.6, 72], [6.6, 92], [9.2, 94], [9.4, 80], [9.8, 70], [11.5, 64], [12.5, 54], [13.5, 44],
      [15.5, 34], [18.5, 24], [21.0, 14], [22.6, 7], [23.4, 3], [23.5, 1], [23.1, -0.5], [22.0, -1.5],
      [20.5, -1.8], [18.8, -1.5], [17.2, -0.8], [16.0, 0.5]
    ];
    zLathe(G.broquet, prof, mBroquet, 'broquet', MP.x, MP.y, MP.z, 72);
  }
  // Llavis que vibren (brillantor, no és una peça de l'instrument)
  const lipMat = new THREE.MeshBasicMaterial({ color: 0xFF8A66, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const lipRingMat = lipMat.clone();
  const lipDisc = noPick(new THREE.Mesh(new THREE.CircleGeometry(15, 40), lipMat));
  const lipRing = noPick(new THREE.Mesh(new THREE.TorusGeometry(18.5, 2.6, 10, 48), lipRingMat));
  for (const o of [lipDisc, lipRing]) { o.position.set(MP.x, MP.y, MP.z + 2.5); o.renderOrder = 6; o.visible = false; G.broquet.add(o); }

  // ================================================================ TUDEL (tub d'entrada)
  const LEAD_PTS = [[MP.x, MP.y, 152], [MP.x, MP.y, 124, 24], [-128, 190, ZV, 60], [-128, 40, ZV, 28], [VX[1] - CAS_R + 5, 40, ZV]];
  const leadR = u => 7.2 + 2.3 * u;
  {
    // receptor del broquet
    zLathe(G.tudel, [[9.6, 0], [12.4, 0], [13.2, 1], [13.2, 4], [12.0, 5.2], [11.8, 8], [11.4, 30], [10.2, 35], [8.4, 38.5]], mTudel, 'tudel', MP.x, MP.y, 188);
    const P = rounded(LEAD_PTS);
    tubeAlong(G.tudel, P, leadR, mTudel, 'tudel', 20);
    // virolles del tudel
    ringAt(G.tudel, P, 0.33, 9.6, 6, mTudel, 'tudel');
    ringAt(G.tudel, P, 0.66, 10.4, 6, mTudel, 'tudel');
    add(G.tudel, geo.cyl(11.6, 5, 'x', 32), mTudel, 'tudel', { pos: [VX[1] - CAS_R - 3, 40, ZV] });  // entrada al pistó 1
    // travesses: tudel ↔ pistó 1, tudel ↔ canó del pavelló, receptor ↔ bomba d'afinació
    brace(G.tudel, 'tudel', mTudel, [-118.6, 88, ZV], [-100.6, 88, ZV]);
    brace(G.tudel, 'tudel', mTudel, [-131, 160, 71.5], [-150, 160, 19.5]);
    brace(G.tudel, 'tudel', mTudel, [50, 292, 158], [139, 236, 86]);
  }

  // ================================================================ PISTONS (camises, botons, colzes)
  const mov = { 1: null, 2: null, 3: null, 4: null };   // part mòbil de cada pistó
  const PRESS = 22;                                      // recorregut del pistó (mm)
  {
    const knurl = [[3.8, 0], [17.2, 0]];
    for (let k = 0; k < 7; k++) { const y = 0.6 + k * 1.0; knurl.push([17.7, y], [17.3, y + 0.5]); }
    knurl.push([17.4, 7.6], [16.0, 8.4], [5.6, 8.6], [3.8, 8.6]);
    const bottom = [[0, -10], [8, -9.6], [14, -8.4], [17, -6.2], [17.6, -4.6], [17.6, -0.8], [17.1, 0]];
    for (let n = 1; n <= 4; n++) {
      const x = VX[n];
      add(G.pistons, geo.cyl(CAS_R, 130, 'y', 48), mPist, 'pistons', { pos: [x, 35, ZV] });          // camisa (y -30 → 100)
      add(G.pistons, geo.cyl(18, 6, 'y', 48), mPist, 'pistons', { pos: [x, 101, ZV] });              // virolla de dalt
      add(G.pistons, geo.cyl(18, 6, 'y', 48), mPist, 'pistons', { pos: [x, -31, ZV] });              // virolla de baix
      add(G.pistons, geo.cyl(17.6, 3, 'y', 48), mPist, 'pistons', { pos: [x, 82, ZV] });             // anella
      add(G.pistons, geo.lathe(knurl, 56), mPist, 'pistons', { pos: [x, 104, ZV] });                   // tapa de dalt
      add(G.pistons, geo.lathe(bottom, 56), mPist, 'pistons', { pos: [x, -34, ZV] });                  // tapa de baix
      // part mòbil: pistó + tija + botó
      const g = new THREE.Group(); G.pistons.add(g); mov[n] = g;
      add(g, geo.cyl(15.4, 110, 'y', 40), mPiston, 'pistons', { pos: [x, 37, ZV] });                // pistó (es veu amb raigs X)
      for (const y of [-14, 88]) add(g, geo.cyl(15.8, 3, 'y', 40), mPiston, 'pistons', { pos: [x, y, ZV] });
      add(g, geo.cyl(3.0, 34, 'y', 16), mStem, 'pistons', { pos: [x, 126, ZV] });                    // tija
      add(g, geo.cyl(7.5, 3, 'y', 28), mFelt, 'pistons', { pos: [x, 141.5, ZV] });                   // feltre
      add(g, geo.lathe([[0, 0], [11.8, 0], [12.6, 0.8], [12.6, 6.4], [12.2, 7.2], [11.0, 7.5], [0, 7.5]], 48), mSkirt, 'pistons', { pos: [x, 143, ZV] });
      add(g, geo.lathe([[10.8, -0.2], [10.6, 0.4], [8.8, 1.1], [4.8, 1.5], [0, 1.6]], 48), mPearl, 'pistons', { pos: [x, 150.5, ZV] });
      // collarets de les sortides cap a la bomba (darrere)
      const ports = n === 4 ? [50, -10] : [-10, 60];
      for (const y of ports) add(G.pistons, geo.cyl(11.4, 5, 'z', 32), mPist, 'pistons', { pos: [x, y, ZV - CAS_R + 1] });
    }
    // colzes entre pistons (tubs curts de camisa a camisa)
    for (let n = 1; n <= 3; n++) {
      const xa = VX[n] + CAS_R - 3, xb = VX[n + 1] - CAS_R + 3, y = Y_OUT[n];
      add(G.pistons, geo.tube([xa, y, ZV], [xb, y, ZV], VR, 1, 20), mPist, 'pistons');
      add(G.pistons, geo.cyl(10.8, 3.5, 'x', 32), mPist, 'pistons', { pos: [(xa + xb) / 2, y, ZV] });
    }
    add(G.pistons, geo.cyl(11.6, 5, 'x', 32), mPist, 'pistons', { pos: [VX[4] + CAS_R + 2, 40, ZV] });   // sortida del pistó 4
    // travesses: pistó 4 ↔ bomba d'afinació, pistó 1 ↔ canó del pavelló
    brace(G.pistons, 'pistons', mPist, [77, 85, ZV], [138.5, 85, ZV]);
    brace(G.pistons, 'pistons', mPist, [-99, -12, 73], [-144, -12, 0]);
  }

  // ================================================================ BOMBES DELS PISTONS
  // Les bombes 1, 2 i 3 pugen per darrere dels pistons; la del 4t pistó (la més llarga) baixa.
  // Cada bomba: una U al pla y-z. La part fixa (tubets i fundes) és dels pistons; la U que es mou, de la bomba.
  const TOP = { 1: 200, 2: 110, 3: 280 }, BOT4 = -300;
  const SLIDE = {};
  for (let n = 1; n <= 4; n++) {
    const x = VX[n];
    if (n < 4) {
      SLIDE[n] = {
        group: 'bomba' + n, up: true, pa: -10, pb: 60, end: TOP[n],
        moving: m => (m.z < 37 && m.y > 46) || (m.z >= 37 && m.z < 60 && m.y > 100),
        sleeves: [[x, 34, 24], [x, 88, 50]]
      };
    } else {
      SLIDE[n] = {
        group: 'bomba4', up: false, pa: 50, pb: -10, end: BOT4,
        moving: m => (m.z < 37 && m.y < 16) || (m.z >= 37 && m.z < 60 && m.y < -44),
        sleeves: [[x, 28, 24], [x, -32, 50]]
      };
    }
    const sd = SLIDE[n];
    sd.pts = [[x, sd.pa, ZV - CAS_R + 4], [x, sd.pa, 24, 10], [x, sd.end, 24, 13], [x, sd.end, 50, 13], [x, sd.pb, 50, 10], [x, sd.pb, ZV - CAS_R + 4]];
    const runs = splitRuns(rounded(sd.pts), m => (sd.moving(m) ? 'slide' : 'fixed'));
    for (const r of runs) {
      if (r.key === 'fixed') tubeAlong(G.pistons, r.P, VR, mPist, 'pistons', 18);
      else tubeAlong(G[sd.group], r.P, VR - 0.4, mSlide, 'bombes', 18);
    }
    // fundes (tubs exteriors fixos) on entra la U
    for (const [sx, sy, sz] of sd.sleeves) {
      add(G.pistons, geo.cyl(11.2, 24, 'y', 32), mPist, 'pistons', { pos: [sx, sy, sz] });
      const yEnd = sd.up ? sy + 12 : sy - 12;
      add(G.pistons, geo.cyl(12.0, 2.6, 'y', 32), mPist, 'pistons', { pos: [sx, yEnd, sz] });
    }
    // pom per estirar la bomba
    const ky = sd.up ? sd.end + VR + 3 : sd.end - VR - 3;
    add(G[sd.group], geo.cyl(2.4, 6, 'y', 14), mSlide, 'bombes', { pos: [x, sd.up ? ky - 2 : ky + 2, 37] });
    add(G[sd.group], new THREE.SphereGeometry(4.6, 18, 12), mSlide, 'bombes', { pos: [x, sd.up ? ky + 2 : ky - 2, 37] });
    // travessa entre les dues cames de la U
    const yb = sd.up ? sd.end - 34 : sd.end + 60;
    add(G[sd.group], geo.tube([x, yb, 24 + VR - 1], [x, yb, 50 - VR + 1], 2.0, 1, 10), mSlide, 'bombes');
  }

  // ================================================================ BOMBA D'AFINACIÓ (gran U de dalt)
  const MAIN_PTS = [[VX[4] + CAS_R - 2, 40, ZV], [150, 40, ZV, 30], [150, 310, ZV, 55], [XR, 310, ZB, 55], [XR, BR_TOP, ZB]];
  const mainR = u => (u < 0.06 ? lerp(VR, 12, u / 0.06) : 12);
  {
    const P = rounded(MAIN_PTS);
    tubeAlong(G.bombaAfin, P, mainR, mSlide, 'bombes', 20);
    // fundes de la bomba (on llisca la U) i virolles
    add(G.bombaAfin, geo.cyl(13.8, 34, 'y', 36), mSlide, 'bombes', { pos: [150, 225, ZV] });
    add(G.bombaAfin, geo.cyl(14.6, 3, 'y', 36), mSlide, 'bombes', { pos: [150, 242, ZV] });
    add(G.bombaAfin, geo.cyl(13.8, 30, 'y', 36), mSlide, 'bombes', { pos: [XR, 222, ZB] });
    add(G.bombaAfin, geo.cyl(14.6, 3, 'y', 36), mSlide, 'bombes', { pos: [XR, 237, ZB] });
    add(G.bombaAfin, geo.cyl(13.2, 4, 'y', 36), mSlide, 'bombes', { pos: [150, 120, ZV] });
    // travessa entre les dues cames
    brace(G.bombaAfin, 'bombes', mSlide, [145, 160, 69], [104, 160, -24], 2.4);
    // nansa per estirar la bomba (a dalt de la U)
    const dx = XR - 150, dz = ZB - ZV, a = Math.atan2(-dz, dx);
    add(G.bombaAfin, new THREE.TorusGeometry(13, 2.2, 10, 28, PI), mSlide, 'bombes', { pos: [(150 + XR) / 2, 318, (ZV + ZB) / 2], rot: [0, a, 0] });
    // clau de l'aigua (al punt més baix de la bomba)
    add(G.bombaAfin, geo.cyl(3.4, 6, 'y', 18), mSlide, 'bombes', { pos: [128, 29, ZV] });
    add(G.bombaAfin, geo.cyl(4.8, 2.4, 'y', 22), mSlide, 'bombes', { pos: [128, 25, ZV] });
    add(G.bombaAfin, geo.cyl(4.0, 1.2, 'y', 22), mCork, 'bombes', { pos: [128, 26.6, ZV] });
    add(G.bombaAfin, geo.box(128, 166, 22.4, 23.8, ZV - 1.3, ZV + 1.3), mSlide, 'bombes');
    add(G.bombaAfin, geo.box(160, 172, 21.0, 22.6, ZV - 3.5, ZV + 3.5), mSlide, 'bombes');
  }

  // ================================================================ TUBS (branca gran, corba de baix, canó)
  const BOW_PTS = [];
  for (let i = 0; i <= 48; i++) { const th = PI * i / 48; BOW_PTS.push(V3(BOW_CX + BOW_R * Math.cos(th), YJ - BOW_R * Math.sin(th), ZB)); }
  {
    // branca gran (cònica, baixa per darrere dels pistons)
    const prof = []; for (let i = 0; i <= 40; i++) { const y = YJ + (BR_TOP - YJ) * i / 40; prof.push([branchR(y), y - YJ]); }
    add(G.tubs, geo.lathe(prof, 48), mTubs, 'tubs', { pos: [XR, YJ, ZB] });
    yRing(G.tubs, XR, BR_TOP - 6, ZB, branchR(BR_TOP - 6), 12, mTubs, 'tubs');
    // corba de baix
    add(G.tubs, varTubeGeo(densify(BOW_PTS, 5), bowR, 40).g, mTubs, 'tubs');
    // canó del pavelló (part de baix, fins a la unió amb el pavelló)
    const sp = []; for (let i = 0; i <= 50; i++) { const y = YJ + (BELL_Y0 - YJ) * i / 50; sp.push([bellR(y), y - YJ]); }
    add(G.tubs, geo.lathe(sp, 64), mTubs, 'tubs', { pos: [XB, YJ, ZB] });
    yRing(G.tubs, XB, BELL_Y0 - 7, ZB, bellR(BELL_Y0 - 7), 14, mTubs, 'tubs');
    // virolles de les unions de la corba
    yRing(G.tubs, XR, YJ, ZB, branchR(YJ), 18, mTubs, 'tubs');
    yRing(G.tubs, XB, YJ, ZB, bellR(YJ), 18, mTubs, 'tubs');
    yRing(G.tubs, XB, -40, ZB, bellR(-40), 10, mTubs, 'tubs');
    // protector de la corba de baix
    const GA = 1.15;
    add(G.tubs, new THREE.TorusGeometry(BOW_R, 34.8, 16, 48, GA).rotateZ(-PI / 2 - GA / 2), mGuard, 'tubs', { pos: [BOW_CX, YJ, ZB] });
    for (const s of [-1, 1]) {
      const al = -PI / 2 + s * GA / 2;
      const ring = add(G.tubs, new THREE.TorusGeometry(34.8, 1.6, 8, 48), mGuard, 'tubs', { pos: [BOW_CX + BOW_R * Math.cos(al), YJ + BOW_R * Math.sin(al), ZB] });
      ring.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(-Math.sin(al), Math.cos(al), 0));
    }
    // travessa entre el canó i la branca gran
    brace(G.tubs, 'tubs', mTubs, [XB + bellR(-150) - 0.5, -150, ZB], [XR - branchR(-150) + 0.5, -150, ZB], 2.8);
  }

  // ================================================================ PAVELLÓ
  {
    const prof = [];
    for (let i = 0; i <= 90; i++) { const y = BELL_Y0 + (BELL_TOP - BELL_Y0) * Math.pow(i / 90, 0.7); prof.push([bellR(y), y - BELL_Y0]); }
    add(G.pavello, geo.lathe(prof, 112), mBell, 'pavello', { pos: [XB, BELL_Y0, ZB] });
    // vora enrotllada
    add(G.pavello, new THREE.TorusGeometry(bellR(BELL_TOP) + 0.6, 3.6, 14, 160), mBell, 'pavello', { pos: [XB, BELL_TOP, ZB], rot: [PI / 2, 0, 0] });
    // garlanda (unió amb el canó)
    add(G.pavello, geo.lathe([[bellR(BELL_Y0) - 0.5, 0], [bellR(BELL_Y0) + 2.2, 1.2], [bellR(BELL_Y0) + 2.6, 4], [bellR(BELL_Y0 + 14) + 2.6, 12], [bellR(BELL_Y0 + 20) + 1.2, 18], [bellR(BELL_Y0 + 22), 20]], 72), mBell, 'pavello', { pos: [XB, BELL_Y0, ZB] });
    // travessa pavelló ↔ branca gran
    brace(G.pavello, 'pavello', mBell, [XB + bellR(140) - 0.5, 140, ZB], [XR - branchR(140) + 0.5, 140, ZB], 2.6);
  }

  // ================================================================ CAMÍ DE L'AIRE (brillantor)
  const pieces = {}, allPieces = [];
  function piece(id, group, P, rIn, rOut) {
    const L = plen(P), segs = Math.max(6, Math.round(L / 3));
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    const p = { id, group, P, cum, L, segs, inner: null, outer: null };
    p.inner = noPick(new THREE.Mesh(varTubeGeo(P, rIn, 8, segs).g, glowMat(0)));
    p.inner.renderOrder = 5; p.inner.visible = false; G[group].add(p.inner);
    if (rOut) {
      p.outer = noPick(new THREE.Mesh(varTubeGeo(P, rOut, 12, segs).g, glowMat(0)));
      p.outer.renderOrder = 6; p.outer.visible = false; G[group].add(p.outer);
    }
    pieces[id] = p; allPieces.push(p);
    return id;
  }
  const line = (a, b) => rounded([a, b]);
  piece('mp', 'broquet', line([MP.x, MP.y, MP.z], [MP.x, MP.y, 152]), 3.0, 0);
  piece('lead', 'tudel', rounded(LEAD_PTS.map((p, i) => (i === LEAD_PTS.length - 1 ? [VX[1] - CAS_R, 40, ZV] : p))), u => 0.5 * leadR(u), u => leadR(u) + 1.8);
  for (let n = 1; n <= 3; n++) piece('k' + n, 'pistons', line([VX[n] + CAS_R, Y_OUT[n], ZV], [VX[n + 1] - CAS_R, Y_OUT[n], ZV]), 4.4, VR + 1.8);
  piece('main', 'bombaAfin', rounded(MAIN_PTS.map((p, i) => (i === 0 ? [VX[4] + CAS_R, 40, ZV] : p))), 5.4, u => mainR(u) + 1.9);
  piece('branch', 'tubs', line([XR, BR_TOP, ZB], [XR, YJ, ZB]), u => 0.45 * branchR(lerp(BR_TOP, YJ, u)), u => branchR(lerp(BR_TOP, YJ, u)) + 2.2);
  piece('bow', 'tubs', densify(BOW_PTS, 5), u => 0.45 * bowR(u), u => bowR(u) + 2.4);
  piece('stack', 'tubs', line([XB, YJ, ZB], [XB, BELL_Y0, ZB]), u => 0.45 * bellR(lerp(YJ, BELL_Y0, u)), u => bellR(lerp(YJ, BELL_Y0, u)) + 2.4);
  // pavelló: l'aire va per l'eix; la brillantor és una campana interior
  {
    const P = densify([V3(XB, BELL_Y0, ZB), V3(XB, BELL_TOP + 2, ZB)], 5);
    const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
    pieces.bell = { id: 'bell', group: 'pavello', P, cum, L: plen(P), bell: true };
  }
  const bellGlowProf = [];
  for (let i = 0; i <= 48; i++) { const y = BELL_Y0 + (BELL_TOP - BELL_Y0) * Math.pow(i / 48, 0.75); bellGlowProf.push([bellR(y) * 0.82, y - BELL_Y0]); }
  const bellGlow = noPick(new THREE.Mesh(geo.lathe(bellGlowProf, 80), glowMat(0)));
  bellGlow.material.side = THREE.DoubleSide;
  bellGlow.position.set(XB, BELL_Y0, ZB);
  bellGlow.renderOrder = 6; bellGlow.visible = false; G.pavello.add(bellGlow);

  // pistons: camí obert (sense prémer) i camí desviat per la bomba (prement)
  const VALVE = {};
  for (let n = 1; n <= 4; n++) {
    const x = VX[n], yi = Y_IN[n], yo = Y_OUT[n], sd = SLIDE[n];
    const open = piece('v' + n + 'o', 'pistons', rounded([[x - CAS_R, yi, ZV], [x - 4, yi, ZV, 5], [x + 4, yo, ZV, 5], [x + CAS_R, yo, ZV]]), 4.2, 0);
    const pressedPts = [
      [x - CAS_R, yi, ZV], [x - 4, yi, ZV, 5], [x - 4, sd.pa, ZV, 5], [x, sd.pa, ZV - 10, 4],
      [x, sd.pa, 24, 10], [x, sd.end, 24, 13], [x, sd.end, 50, 13], [x, sd.pb, 50, 10],
      [x, sd.pb, ZV - 10, 4], [x + 4, sd.pb, ZV, 5], [x + 4, yo, ZV, 5], [x + CAS_R, yo, ZV]
    ];
    const runs = splitRuns(rounded(pressedPts), m => (sd.moving(m) ? sd.group : 'pistons'));
    const pressed = runs.map((r, i) => piece('v' + n + 'p' + i, r.key, r.P, 4.2, VR + 1.8));
    VALVE[n] = { open: [open], pressed };
  }
  const routes = {};
  function routeFor(vs) {
    const key = vs.slice().sort().join('');
    if (routes[key]) return routes[key];
    const v = n => (vs.includes(n) ? VALVE[n].pressed : VALVE[n].open);
    const ids = ['mp', 'lead', ...v(1), 'k1', ...v(2), 'k2', ...v(3), 'k3', ...v(4), 'main', 'branch', 'bow', 'stack', 'bell'];
    const list = ids.map(id => pieces[id]), offs = [];
    let tot = 0; for (const p of list) { offs.push(tot); tot += p.L; }
    return (routes[key] = { list, offs, total: tot });
  }

  // polsos de llum que viatgen pel camí
  const NB = 140, SPEED = 2600, RATE = 14;   // mm per segon visual, polsos per segon
  const beads = []; for (let i = 0; i < NB; i++) beads.push({ alive: false, s: 0, w: 0 });
  const bPos = new Float32Array(NB * 3), bCol = new Float32Array(NB * 3);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const TN = 32, tdata = new Uint8Array(TN * TN * 4);
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    const dx = (i + 0.5) / TN * 2 - 1, dy = (j + 0.5) / TN * 2 - 1, r = Math.sqrt(dx * dx + dy * dy);
    const k = (j * TN + i) * 4; tdata[k] = tdata[k + 1] = tdata[k + 2] = 255;
    tdata[k + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - r), 1.7));
  }
  const dotTex = new THREE.DataTexture(tdata, TN, TN);
  dotTex.magFilter = THREE.LinearFilter; dotTex.minFilter = THREE.LinearFilter; dotTex.needsUpdate = true;
  const bMat = new THREE.PointsMaterial({
    size: 50, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
  });
  const beadPts = noPick(new THREE.Points(bGeo, bMat));
  beadPts.frustumCulled = false; beadPts.renderOrder = 8; G.tudel.add(beadPts);

  const _p = V3(0, 0, 0), _o = V3(0, 0, 0), _air = V3(0, 0, 0), _up = V3(0, 1, 0);
  function sampleRoute(R, s, out) {
    let i = 0; while (i < R.list.length - 1 && s > R.offs[i] + R.list[i].L) i++;
    const p = R.list[i], ls = Math.min(p.L, Math.max(0, s - R.offs[i]));
    let lo = 0, hi = p.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.cum[mid] <= ls) lo = mid; else hi = mid; }
    const seg = p.cum[hi] - p.cum[lo], u = seg > 0 ? (ls - p.cum[lo]) / seg : 0;
    out.lerpVectors(p.P[lo], p.P[hi], u);
    // els grups es desplacen quan es desmunta: corregim respecte del grup del tudel
    _o.copy(G[p.group].position).sub(G.tudel.position);
    return out.add(_o);
  }

  // ---------------------------------------------------------------- notes i so
  // Freqüències reals que sonen (tuba en Si bemoll) i pistons de cada nota.
  const notes = [
    { label: 'Do', f: 65.41, valves: [1, 3] },
    { label: 'Re', f: 73.42, valves: [1, 2] },
    { label: 'Mi', f: 82.41, valves: [2] },
    { label: 'Fa', f: 87.31, valves: [] },
    { label: 'Sol', f: 98.00, valves: [1, 2] },
    { label: 'La', f: 110.00, valves: [2] },
    { label: 'Si♭', f: 116.54, valves: [] },
    { label: 'Do agut', f: 130.81, valves: [1] }
  ];
  // So de metall greu i rodó. La fonamental es reforça poc (els altaveus petits no la reprodueixen):
  // els harmònics 2–5 porten el pes perquè la nota se senti greu també en un portàtil.
  const AMP = [0.5, 1.0, 0.95, 0.8, 0.62, 0.42, 0.28, 0.18, 0.12, 0.08, 0.05, 0.035, 0.022];
  const partials = AMP.map((a, i) => ({ k: i + 1, a, tau: 1.3 / (1 + 0.08 * (i + 1)) }));

  // ---------------------------------------------------------------- estat d'animació
  const press = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let lastT = 0, lastIdx = -1, spawnAcc = 0, beadsDirty = false;
  const RING = []; for (let k = 0; k < 6; k++) RING.push([Math.cos(k * PI / 3) * 105, Math.sin(k * PI / 3) * 105]);

  return {
    id: 'tuba',
    family: 'Vent metall',
    name: 'Tuba',
    intro: 'És l\'instrument més greu de la família del metall. Els llavis vibren lentament dins d\'un broquet gran i fan vibrar l\'aire d\'un tub de llautó d\'uns 5,5 metres, enrotllat, que acaba en un pavelló que mira cap amunt.',
    floorY: -440,
    camera: {
      explore: { pos: [840, 470, 1760], target: [-60, 20, 0] },
      exploded: { pos: [1150, 820, 2450], target: [-30, 90, 60] }
    },
    parts: {
      broquet: { name: 'Broquet', text: 'És la copa on el músic posa els llavis i bufa. És molt gran perquè, per fer notes greus, els llavis han de vibrar lentament.', dato: 'La copa és gairebé el doble d\'ampla que la del broquet d\'una trompeta.' },
      tudel: { name: 'Tudel', text: 'És el primer tub, on encaixa el broquet. Porta l\'aire que vibra fins als pistons.', dato: 'És estret al principi i es va eixamplant a poc a poc, com tot el tub de la tuba.' },
      pistons: { name: 'Pistons', text: 'Són quatre vàlvules que es premen amb els dits de la mà dreta. Cada pistó desvia l\'aire per un tros de tub extra i la nota baixa.', dato: 'El quart pistó serveix sobretot per fer les notes més greus.' },
      bombes: { name: 'Bombes', text: 'Són els tubs en forma d\'U on l\'aire fa la volta quan prems un pistó. La bomba d\'afinació, la més gran, s\'estira o s\'empeny per afinar tota la tuba.', dato: 'La bomba del quart pistó és la més llarga, perquè és la que fa baixar més la nota.' },
      tubs: { name: 'Tubs', text: 'La tuba és un tub de llautó molt llarg, enrotllat en forma d\'oval. Desenrotllat, faria uns 5,5 metres!', dato: 'La corba de baix porta un protector, per si la tuba es recolza a terra o rep un cop.' },
      pavello: { name: 'Pavelló', text: 'És la gran campana del final del tub, i mira cap amunt. Per aquí surt el so de la tuba.', dato: 'Fa més de 40 centímetres d\'amplada: hi cabria una pilota de bàsquet.' }
    },
    labels: [
      { part: 'broquet', group: 'broquet', at: [MP.x, MP.y + 24, MP.z - 8], internal: false },
      { part: 'tudel', group: 'tudel', at: [-128, 125, ZV + 9], internal: false },
      { part: 'pistons', group: 'pistons', at: [-12, 152, ZV], internal: false },
      { part: 'bombes', group: 'bomba3', at: [VX[3], TOP[3] + 12, 37], internal: false },
      { part: 'tubs', group: 'tubs', at: [BOW_CX, YJ - BOW_R, ZB + 34], internal: false },
      { part: 'pavello', group: 'pavello', at: [XB, BELL_TOP, ZB + bellR(BELL_TOP)], internal: false }
    ],
    explode: {
      broquet: [0, 70, 260, 0],
      tudel: [-70, 50, 210, 0.05],
      pistons: [70, 10, 230, 0.15],
      bomba1: [20, 150, 110, 0.27],
      bomba2: [70, 130, 110, 0.29],
      bomba3: [120, 170, 110, 0.31],
      bomba4: [140, -60, 110, 0.33],
      bombaAfin: [230, 130, 20, 0.2],
      tubs: [0, 0, -140, 0.1],
      pavello: [-60, 320, -110, 0.22]
    },
    notes,
    options: null,
    chain: ['Llavis', 'Broquet', 'Tubs i pistons', 'Pavelló', 'Aire'],
    tour: [
      { part: 'broquet', chain: 0, title: 'Els llavis i el broquet', text: 'El músic posa els llavis dins del broquet i bufa. Els llavis vibren com quan fas una pedorreta, però més a poc a poc que en una trompeta. Com més lenta és la vibració, més greu és la nota.', cam: { pos: [330, 430, 600], target: [MP.x, MP.y, 215] }, slow: 0.45, xray: false, note: 6 },
      { part: 'tubs', chain: 2, title: 'Un tub molt llarg', text: 'La tuba és un tub de llautó d\'uns 5,5 metres, enrotllat perquè es pugui aguantar. Amb els raigs X veus el camí que fa l\'aire per dins. Com més llarg és el tub, més greu és la nota.', cam: { pos: [680, 260, 1180], target: [-40, 10, 0] }, slow: 1, xray: true, note: 3 },
      { part: 'pistons', chain: 2, title: 'Els pistons', text: 'Quan prems un pistó, baixa i desvia l\'aire per un tros de tub extra. El camí es fa més llarg i la nota baixa. Mira el Do: amb els pistons 1 i 3, l\'aire fa molta més volta.', cam: { pos: [270, 340, 580], target: [-12, 70, 60] }, slow: 0.9, xray: true, note: 0 },
      { part: 'bombes', chain: 2, title: 'Les bombes', text: 'Cada pistó té la seva bomba, un tub en forma d\'U. La del segon pistó és la més curta i la del quart, la més llarga. La bomba d\'afinació, a dalt, serveix per afinar tota la tuba.', cam: { pos: [540, 280, 420], target: [0, 40, 40] }, slow: 0.9, xray: false, note: 1 },
      { part: 'pavello', chain: 3, title: 'El pavelló', text: 'Al final, el tub s\'eixampla molt i forma el pavelló, que mira cap amunt. Per aquí surt el so. Les ones de so reboten a les parets i al sostre i omplen tota la sala.', cam: { pos: [260, 860, 780], target: [XB, 360, ZB] }, slow: 1, xray: false, note: 6 }
    ],
    soundSource: { group: 'pavello', at: [XB, BELL_TOP + 20, ZB] },

    play(note) {
      const n = typeof note === 'number' ? notes[note] : note;
      const f = (n && n.f) || 116.54;
      synth.additive({
        f, partials, attack: 0.08, hold: 1.1, release: 0.3,
        vibrato: { rate: 4.5, depth: 4 },
        noise: { amount: 0.03, dur: 0.12, lp: 900, hp: 90 },
        gain: 1.0
      });
      // L'envolupant visual dura més que el so perquè es vegi l'aire recórrer tot el tub.
      return { attack: 0.08, hold: 1.9, release: 0.4 };
    },

    update(dt, s) {
      const env = s.env || 0, t = s.t || 0;
      const nt = notes[s.noteIndex] || s.note || {};
      const vs = (nt && nt.valves) || [];

      // --- pistons: baixen mentre sona la nota i pugen quan s'apaga
      for (let n = 1; n <= 4; n++) {
        const want = env > 0.3 && vs.includes(n) ? 1 : 0;
        press[n] += (want - press[n]) * Math.min(1, dt * 14);
        mov[n].position.y = -PRESS * press[n];
      }

      // --- nota nova?
      const reset = t < lastT - 1e-4 || s.noteIndex !== lastIdx;
      const dT = reset ? 0 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t; lastIdx = s.noteIndex;
      if (reset) { for (const b of beads) b.alive = false; spawnAcc = 0; beadsDirty = true; }

      // --- llavis que vibren (lents: com més greu, més lents)
      const lipOn = env > 0.01;
      lipDisc.visible = lipRing.visible = lipOn;
      if (lipOn) {
        const buzz = 1.2 + (nt.f || 100) / 45;
        const w = Math.sin(2 * PI * buzz * t);
        lipDisc.scale.set(1, 0.25 + 0.75 * (0.5 + 0.5 * w), 1);
        lipMat.opacity = 0.75 * env;
        lipRing.scale.setScalar(1 + 0.07 * w * env);
        lipRingMat.opacity = 0.45 * env * (0.7 + 0.3 * w);
      }

      // --- el camí de l'aire s'omple a velocitat visible
      for (const p of allPieces) { p.inner.visible = false; if (p.outer) p.outer.visible = false; }
      bellGlow.visible = false;
      let bellFrac = 0;
      const R = routeFor(vs);
      if (env > 0) {
        const front = SPEED * t, sh = Math.sin((s.time || 0) * 5);
        R.list.forEach((p, i) => {
          const frac = clamp01((front - R.offs[i]) / p.L);
          if (frac <= 0) return;
          if (p.bell) {
            bellFrac = frac;
            bellGlow.visible = true; bellGlow.material.opacity = 0.2 * env * frac;
            return;
          }
          const k = Math.max(1, Math.ceil(frac * p.segs));
          p.inner.visible = true;
          p.inner.geometry.setDrawRange(0, k * 8 * 6);
          p.inner.material.opacity = (s.xray ? 0.42 : 0.6) * env;
          if (p.outer) {
            p.outer.visible = true;
            p.outer.geometry.setDrawRange(0, k * 12 * 6);
            p.outer.material.opacity = env * (s.xray ? 0.05 : 0.3 + 0.06 * sh);
          }
        });
      }

      // --- aire que surt pel pavelló, cap amunt (quan hi arriba)
      if (bellFrac > 0.02 && env > 0.02) {
        const rate = 560 * env * Math.min(1, bellFrac * 3);
        _air.set(XB, BELL_TOP + 6, ZB).add(G.pavello.position);
        fx.air(_air, _up, rate * 0.3, 0.3, 300);
        for (const [dx, dz] of RING) {
          _air.set(XB + dx, BELL_TOP + 6, ZB + dz).add(G.pavello.position);
          fx.air(_air, _up, rate * 0.7 / RING.length, 0.32, 280);
        }
      }

      // --- polsos que viatgen pel tub
      if (env > 0.2) {
        spawnAcc += dT * RATE;
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const b = beads.find(q => !q.alive);
          if (b) { b.alive = true; b.s = spawnAcc * SPEED * (1 / RATE); b.w = Math.random() * PI * 2; }
        }
      }
      let any = false;
      for (let i = 0; i < NB; i++) {
        const b = beads[i];
        if (b.alive) { b.s += SPEED * dT; if (b.s >= R.total || env <= 0) b.alive = false; }
        if (b.alive) {
          any = true;
          sampleRoute(R, b.s, _p);
          bPos[i * 3] = _p.x; bPos[i * 3 + 1] = _p.y; bPos[i * 3 + 2] = _p.z;
          const fade = Math.min(1, (R.total - b.s) / 160);
          const br = Math.min(1, env * 1.6) * (0.8 + 0.2 * Math.sin((s.time || 0) * 9 + b.w)) * fade;
          bCol[i * 3] = BEAD.r * br; bCol[i * 3 + 1] = BEAD.g * br; bCol[i * 3 + 2] = BEAD.b * br;
        } else {
          bCol[i * 3] = bCol[i * 3 + 1] = bCol[i * 3 + 2] = 0;
        }
      }
      if (any || beadsDirty) {
        bGeo.attributes.position.needsUpdate = true; bGeo.attributes.color.needsUpdate = true;
        beadsDirty = any;
      }
    }
  };
}
