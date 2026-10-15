// Flauta travessera (sistema Boehm, de plata) — mòdul d'instrument
// Unitats: mm. La flauta jeu al llarg de l'eix X: corona a -X, peu a +X.
// Les claus miren amunt (+Y); el flautista quedaria cap a +Z (no el modelem).
export default function (ctx) {
  const { THREE, V3, groups, mat, M, add, geo, fx, synth, heat } = ctx;
  const PI = Math.PI, TAU = PI * 2;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  const G = groups(['cap', 'cos', 'claus', 'peu', 'peuClaus', 'aire']);

  /* ---------------- mides ---------------- */
  const X_CORK = -297;   // tap de suro (a 17 mm de l'embocadura)
  const X_EMB = -280;    // centre del forat d'embocadura
  const X_FOOT = 336;    // final del peu
  const RO = 9.95;       // radi exterior del tub (bore 19 mm)
  const ROD_Y = 7, ROD_Z = -14;   // eix de les claus (barra), al costat de fora
  const OPEN_ANG = -0.28;         // gir d'una clau oberta (rad)
  const CHIM_TOP = 12.0;          // alçada de la vora dels forats (xemeneies)
  const L_DO4 = X_FOOT - X_EMB;   // longitud de la columna per al Do4

  /* ---------------- materials ---------------- */
  const silverO = { color: 0xe3e6e9, metalness: 1, roughness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.15 };
  const mHead = mat('cap', { ...silverO }, { xray: true });
  const mBody = mat('cos', { ...silverO }, { xray: true });
  const mFoot = mat('peu', { ...silverO }, { xray: true });
  const mPlate = M.silver('embocadura');
  mPlate.side = THREE.DoubleSide;
  const mEmbDark = mat('embocadura', { color: 0x07080a, roughness: 0.95, metalness: 0 }, { xray: true });
  const mCrown = M.silver('corona');
  const mCork = M.felt('corona', 0xa0703f);
  const mKey = M.silver('claus');
  const mRod = M.nickel('claus');
  const mPad = M.felt('coixinets', 0xefe3c4);
  const mChim = mat('coixinets', { ...silverO }, { xray: true });
  const mHoleDark = mat('coixinets', { color: 0x07080a, roughness: 0.95, metalness: 0 }, { xray: true });
  const mPostBody = M.silver('cos');
  const mPostFoot = M.silver('peu');
  const mAirCore = mat('columna', { color: 0x4aa8c8, transparent: true, opacity: 0.1, roughness: 0.6, metalness: 0, depthWrite: false }, { phys: false });
  const glowMat = o => new THREE.MeshBasicMaterial(Object.assign({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  }, o));
  const noRay = () => {};

  /* ---------------- ajudes de geometria ---------------- */
  // Lathe al voltant de l'eix X: punts [[radi, x], ...]
  const latheX = (pts, seg = 64) => { const g = geo.lathe(pts, seg); g.rotateZ(-PI / 2); return g; };
  // Malla de quadrícula (u tancat o obert) amb normals suaus
  function gridGeo(nu, nv, fn, closeU) {
    const pos = [], idx = [], cols = closeU ? nu : nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const p = fn(i / nu, j / nv); pos.push(p[0], p[1], p[2]); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const i1 = closeU ? (i + 1) % nu : i + 1;
      const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }

  /* ================= CAP (head joint) ================= */
  // corona amb el seu anell
  add(G.cap, latheX([[0, -339.5], [2.4, -339.3], [4.1, -338.5], [5, -337.2], [8.6, -336.6], [10.3, -335.4], [10.9, -333.6],
    [10.9, -328], [10.45, -327.3], [10.45, -325.6], [10.9, -325], [10.9, -322.9], [10.3, -322], [0, -322]]), mCrown, 'corona');
  // tub del cap: una mica cònic per dins cap a la corona; tenó fins a -130
  add(G.cap, latheX([[8.55, -321.5], [9.75, -321.5], [9.75, -300], [9.85, -250], [9.95, -200], [9.95, -131], [9.6, -130],
    [9.5, -130], [9.5, -160], [9.2, -220], [8.85, -270], [8.55, -321.5]], 72), mHead, 'cap');
  // tap de suro, placa i vareta de la corona (es veuen amb raigs X)
  add(G.cap, geo.cyl(8.45, 8, 'x', 32), mCork, 'corona', { pos: [-302, 0, 0] });
  add(G.cap, geo.cyl(8.5, 0.9, 'x', 32), mCrown, 'corona', { pos: [-297.6, 0, 0] });
  add(G.cap, geo.cyl(1.2, 16, 'x', 12), mCrown, 'corona', { pos: [-314, 0, 0] });

  // placa de l'embocadura (corbada en les dues direccions, amb forat ovalat)
  const PA = 21, PB = 13.2, PZC = 2.0, PN = 3.0;   // contorn: superel·lipse (a: llarg X, z: través)
  const HA = 6.1, HB = 5.1;                       // forat d'embocadura ovalat
  const PY0 = 14.0, PT = 1.3;                     // alçada de la cara de sota i gruix
  const bend = (a, z) => (Math.sqrt(900 - z * z) - 30) + (Math.sqrt(2025 - a * a) - 45);
  const spow = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), e);
  const outerP = u => { const f = u * TAU; return [PA * spow(Math.cos(f), 2 / PN), PZC + PB * spow(Math.sin(f), 2 / PN)]; };
  const innerP = (u, k = 1) => { const f = u * TAU; return [HA * k * Math.cos(f), HB * k * Math.sin(f)]; };
  const lerp2 = (p, q, v) => [p[0] + (q[0] - p[0]) * v, p[1] + (q[1] - p[1]) * v];
  const yTop = (a, z, v) => PY0 + PT + bend(a, z) - 0.5 * smooth(0.8, 1, v);
  add(G.cap, gridGeo(96, 10, (u, v) => { const p = lerp2(innerP(u), outerP(u), v); return [X_EMB + p[0], yTop(p[0], p[1], v), p[1]]; }, true), mPlate, 'embocadura');
  add(G.cap, gridGeo(96, 8, (u, v) => { const p = lerp2(innerP(u, 1.28), outerP(u), v); return [X_EMB + p[0], PY0 + bend(p[0], p[1]), p[1]]; }, true), mPlate, 'embocadura');
  add(G.cap, gridGeo(96, 2, (u, v) => { const p = outerP(u); return [X_EMB + p[0], PY0 + bend(p[0], p[1]) + v * (PT - 0.5), p[1]]; }, true), mPlate, 'embocadura');
  // paret del forat (de dins del tub fins a dalt de la placa) i xemeneia exterior
  add(G.cap, gridGeo(72, 4, (u, v) => { const p = innerP(u); return [X_EMB + p[0], 6.6 + v * (yTop(p[0], p[1], 0) - 6.6), p[1]]; }, true), mPlate, 'embocadura');
  add(G.cap, gridGeo(72, 4, (u, v) => { const p = innerP(u, 1.28); return [X_EMB + p[0], 6.6 + v * (PY0 + bend(p[0], p[1]) + 0.1 - 6.6), p[1]]; }, true), mPlate, 'embocadura');
  // fons fosc del forat
  add(G.cap, geo.cyl(1, 0.2, 'y', 36), mEmbDark, 'embocadura', { pos: [X_EMB, 10.15, 0], scale: [HA, 1, HB], cast: false });

  /* ================= COS (body) ================= */
  add(G.cos, latheX([[10.05, -152], [10.9, -152], [11.2, -150.8], [11.2, -139], [10.9, -137.5], [9.95, -136.5], [9.95, 236],
    [9.5, 236], [9.5, -130], [10.05, -130], [10.05, -152]], 72), mBody, 'cos');

  /* ================= PEU (foot joint) ================= */
  add(G.peu, latheX([[10.05, 220], [10.95, 220], [11.25, 221.2], [11.25, 232.5], [10.95, 234], [9.95, 235], [9.95, 328.5],
    [10.55, 329], [10.7, 330.5], [10.7, 334.8], [10.35, 336], [9.5, 336], [9.5, 237], [10.05, 236.5], [10.05, 220]], 72), mFoot, 'peu');

  /* ================= forats, claus, barres i pilars ================= */
  // at = primera nota (índex) en què aquest forat queda obert. 99 = sempre tapat en aquestes notes.
  // Simplificat: cada nota més aguda destapa forats des de baix cap amunt.
  const HOLES = [
    { x: -48, rh: 3.6, at: 99 },
    { x: -12, rh: 5.2, at: 99 },
    { x: 20, rh: 6.0, at: 7, note: 7 },
    { x: 38, rh: 6.0, at: 6, note: 6 },
    { x: 78, rh: 6.3, at: 5, note: 5 },
    { x: 100, rh: 6.3, at: 5 },
    { x: 123, rh: 6.5, at: 4, note: 4 },
    { x: 149, rh: 6.5, at: 4 },
    { x: 174, rh: 6.7, at: 3, note: 3 },
    { x: 201, rh: 6.7, at: 2, note: 2 },
    { x: 243, rh: 6.6, at: 2, foot: true },
    { x: 263, rh: 6.9, at: 1, foot: true, note: 1 },
    { x: 298, rh: 7.0, at: 1, foot: true, note: 0 }
  ];
  const cupProfile = rc => [[0, 0.3], [rc - 1.0, 0], [rc - 0.45, 0], [rc, 0.45], [rc, 2.0], [rc - 0.25, 3.0],
    [rc - 1.1, 3.85], [rc * 0.55, 4.35], [0, 4.5]];
  const screwGeo = new THREE.SphereGeometry(1.5, 14, 6, 0, TAU, 0, PI / 2);

  for (const h of HOLES) {
    const gT = h.foot ? G.peu : G.cos;
    // xemeneia del forat (vora soldada al tub) i fons fosc
    const ro = h.rh + 0.75, yb = Math.sqrt(RO * RO - ro * ro) - 0.4;
    add(gT, geo.lathe([[h.rh, yb], [ro, yb], [ro, CHIM_TOP - 0.7], [ro + 0.2, CHIM_TOP - 0.35], [h.rh + 0.6, CHIM_TOP],
      [h.rh, CHIM_TOP - 0.15], [h.rh, yb]], 40), mChim, 'coixinets', { pos: [h.x, 0, 0] });
    add(gT, geo.cyl(h.rh, 0.3, 'y', 32), mHoleDark, 'coixinets', { pos: [h.x, RO + 0.25, 0], cast: false });

    // clau: grup que gira sobre la barra
    const kg = new THREE.Group();
    kg.position.set(0, ROD_Y, ROD_Z);
    (h.foot ? G.peuClaus : G.claus).add(kg);
    const rc = h.rh + 2.0, cy = CHIM_TOP + 0.6 - ROD_Y, cz = -ROD_Z;
    const cupOpts = { pos: [h.x, cy, cz] };
    if (h.note !== undefined) cupOpts.note = h.note;
    add(kg, geo.lathe(cupProfile(rc), 48), mKey, 'claus', cupOpts);
    add(kg, geo.cyl(rc - 0.7, 1.2, 'y', 40), mPad, 'coixinets', { pos: [h.x, cy, cz] });
    add(kg, screwGeo, mKey, 'claus', { pos: [h.x, cy + 4.45, cz], cast: false });
    // braç de la clau, de la tassa fins al tub que gira
    add(kg, geo.curveTube([[h.x, cy + 2.2, cz - rc + 0.6], [h.x, cy + 0.6, cz - rc - 2.0], [h.x, 0.9, 1.6], [h.x, 0, 0]], 1.2, 16, 8), mKey, 'claus');
    // tub que gira al voltant de la barra
    add(kg, geo.cyl(2.1, h.rh < 4 ? 8 : 12, 'x', 20), mKey, 'claus', { pos: [h.x, 0, 0] });
    add(kg, geo.cyl(2.45, 1.0, 'x', 20), mKey, 'claus', { pos: [h.x - (h.rh < 4 ? 4 : 6), 0, 0], cast: false });
    add(kg, geo.cyl(2.45, 1.0, 'x', 20), mKey, 'claus', { pos: [h.x + (h.rh < 4 ? 4 : 6), 0, 0], cast: false });
    h.kg = kg;
    h.open = 0;
  }

  // barres (eixos d'acer) amb els caps dels cargols
  function rod(g, x0, x1) {
    add(g, geo.cyl(1.05, x1 - x0, 'x', 12), mRod, 'claus', { pos: [(x0 + x1) / 2, ROD_Y, ROD_Z] });
    add(g, geo.cyl(1.9, 1.6, 'x', 16), mRod, 'claus', { pos: [x0 - 0.6, ROD_Y, ROD_Z] });
    add(g, geo.cyl(1.4, 1.2, 'x', 16), mRod, 'claus', { pos: [x1 + 0.4, ROD_Y, ROD_Z] });
  }
  rod(G.claus, -69, 215);
  rod(G.peuClaus, 227, 319);

  // pilars soldats al tub que aguanten les barres, i la tira (costella) on van soldats
  const RD = Math.hypot(ROD_Y, ROD_Z), UY = ROD_Y / RD, UZ = ROD_Z / RD;
  function post(g, x, m, part) {
    add(g, geo.tube([x, UY * 9.4, UZ * 9.4], [x, ROD_Y, ROD_Z], 1.45, 1, 12), m, part);
    add(g, geo.tube([x, UY * 9.9, UZ * 9.9], [x, UY * 10.9, UZ * 10.9], 2.8, 1, 18), m, part, { cast: false });
    add(g, new THREE.SphereGeometry(2.65, 18, 12), m, part, { pos: [x, ROD_Y, ROD_Z] });
  }
  for (const x of [-66, -31, 58, 89, 136, 187.5, 212]) post(G.cos, x, mPostBody, 'cos');
  for (const x of [230, 253, 280, 316]) post(G.peu, x, mPostFoot, 'peu');
  function rib(g, x0, x1, m, part) {
    const th = Math.atan2(-UY, UZ);
    const r = new THREE.CylinderGeometry(10.25, 10.25, x1 - x0, 10, 1, true, th - 0.3, 0.6);
    r.rotateZ(-PI / 2); r.translate((x0 + x1) / 2, 0, 0);
    add(g, r, m, part, { cast: false });
  }
  rib(G.cos, -72, 216, mPostBody, 'cos');
  rib(G.peu, 226, 320, mPostFoot, 'peu');

  /* ================= COLUMNA D'AIRE (interior) ================= */
  const AIR_LEN = X_FOOT - 1 - X_CORK, AIR_MID = (X_FOOT - 1 + X_CORK) / 2;
  add(G.aire, geo.cyl(7.4, AIR_LEN, 'x', 28), mAirCore, 'columna', { pos: [AIR_MID, 0, 0], cast: false });
  // capa brillant amb colors per vèrtex: taronja = aire comprimit, blau = aire expandit
  const glowGeo = new THREE.CylinderGeometry(8.6, 8.6, AIR_LEN, 28, 160, true);
  glowGeo.rotateZ(-PI / 2); glowGeo.translate(AIR_MID, 0, 0);
  const NV = glowGeo.attributes.position.count;
  const gx = new Float32Array(NV); for (let i = 0; i < NV; i++) gx[i] = glowGeo.attributes.position.getX(i);
  const gcol = new Float32Array(NV * 3);
  glowGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  const glow = new THREE.Mesh(glowGeo, glowMat({ vertexColors: true }));
  glow.raycast = noRay; glow.renderOrder = 3; G.aire.add(glow);
  // anelles d'aire que s'apropen (comprimit) i se separen (expandit)
  const NR = 46;
  const ringGeo = new THREE.TorusGeometry(8.0, 0.35, 6, 36); ringGeo.rotateY(PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, glowMat({ color: 0xffffff }), NR);
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false; rings.raycast = noRay; rings.renderOrder = 4; G.aire.add(rings);
  const ringX0 = new Float32Array(NR);
  for (let j = 0; j < NR; j++) ringX0[j] = X_EMB + 4 + (X_FOOT - 3 - X_EMB - 4) * j / (NR - 1);
  const dummy = new THREE.Object3D(), tc = new THREE.Color();
  for (let j = 0; j < NR; j++) { dummy.position.set(ringX0[j], 0, 0); dummy.updateMatrix(); rings.setMatrixAt(j, dummy.matrix); rings.setColorAt(j, tc.setRGB(0.05, 0.12, 0.15)); }
  // anell que marca on s'acaba la columna (primer forat obert)
  const endRing = new THREE.Mesh(new THREE.TorusGeometry(9.0, 0.9, 8, 40).rotateY(PI / 2), glowMat({ color: 0xffffff }));
  endRing.raycast = noRay; endRing.renderOrder = 4; G.aire.add(endRing);

  /* ================= RAIG D'AIRE (bufada) ================= */
  const NS = 32;
  // 6 vèrtexs per tall: làmina plana (esq., centre, dreta) + làmina vertical (baix, centre, dalt)
  const jetPos = new Float32Array((NS + 1) * 6 * 3), jetCol = new Float32Array((NS + 1) * 6 * 3), jetIdx = [];
  for (let i = 0; i < NS; i++) {
    const a = i * 6, b = a + 6;
    for (const [p, q] of [[0, 1], [1, 2], [3, 4], [4, 5]]) jetIdx.push(a + p, a + q, b + p, a + q, b + q, b + p);
  }
  const jetGeo = new THREE.BufferGeometry();
  jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPos, 3));
  jetGeo.setAttribute('color', new THREE.BufferAttribute(jetCol, 3));
  jetGeo.setIndex(jetIdx);
  const jet = new THREE.Mesh(jetGeo, glowMat({ vertexColors: true, side: THREE.DoubleSide }));
  jet.frustumCulled = false; jet.raycast = noRay; jet.renderOrder = 5; jet.visible = false; G.cap.add(jet);
  const LIP = [X_EMB, 18.6, 13.5];     // on serien els llavis (no hi ha persona)
  const EDGE = [X_EMB, 14.9, -5.1];    // vora de l'altra banda del forat
  const JD = V3(0, EDGE[1] - LIP[1], EDGE[2] - LIP[2]).normalize();

  /* ================= lògica de notes ================= */
  const firstOpen = ni => { let best = null; for (const h of HOLES) if (ni >= h.at && (!best || h.x < best.x)) best = h; return best; };
  // final efectiu de la columna (una mica més enllà del primer forat obert)
  const NOTES = [
    { label: 'Do4', f: 261.63 }, { label: 'Re4', f: 293.66 }, { label: 'Mi4', f: 329.63 }, { label: 'Fa4', f: 349.23 },
    { label: 'Sol4', f: 392.0 }, { label: 'La4', f: 440.0 }, { label: 'Si4', f: 493.88 }, { label: 'Do5', f: 523.25 }
  ];
  const endFor = ni => { const n = NOTES[ni] || NOTES[0]; return Math.min(X_FOOT, X_EMB + L_DO4 * NOTES[0].f / n.f); };
  for (const h of HOLES) { h.open = 0 >= h.at ? 1 : 0; h.kg.rotation.x = OPEN_ANG * h.open; }
  let xEnd = endFor(0);
  const tmp3 = new Float32Array(3);
  const vA = V3(0, 0, 0), vB = V3(0, 0, 0);

  return {
    id: 'flauta',
    family: 'Vent fusta',
    name: 'Flauta travessera',
    intro: "La flauta travessera es toca de costat: bufes per sobre d'un forat i l'aire de dins del tub vibra. Amb les claus fas el tub d'aire més llarg o més curt per canviar de nota.",
    floorY: -95,
    camera: {
      explore: { pos: [505, 475, 815], target: [150, -15, 0] },
      exploded: { pos: [700, 680, 1140], target: [230, -20, 0] }
    },
    parts: {
      embocadura: { name: 'Embocadura', text: "És el forat on es bufa, envoltat d'una placa corbada on es recolza el llavi de baix. L'aire xoca contra la vora del forat i comença a vibrar.", dato: "És de metall però és de vent fusta: abans es feia de fusta, i el so no el fan els llavis sinó l'aire que xoca contra una vora." },
      cap: { name: 'Cap', text: "És el tros de dalt de la flauta, on hi ha l'embocadura. Per dins es fa una mica més estret cap a la punta.", dato: 'Per afinar, el flautista treu o fica una mica el cap dins del cos: com més llarga és la flauta, més greu sona.' },
      corona: { name: 'Corona', text: "És el tap de metall de la punta. A dins hi ha un tap de suro que tanca el tub just abans de l'embocadura.", dato: 'Si el tap de suro es mou de lloc, la flauta desafina, sobretot a les notes agudes.' },
      cos: { name: 'Cos', text: "És el tub llarg del mig, amb la majoria de forats i claus. Per dins fa uns 19 mm d'amplada.", dato: 'El sistema de claus que es fa servir avui el va inventar Theobald Boehm al segle XIX.' },
      claus: { name: 'Claus', text: "Les claus tapen i destapen forats: com més forats tapats, més llarg és el tub d'aire i més greu és la nota. Aquí les posicions dels dits estan simplificades.", dato: 'Uns molls molt prims, com agulles, fan tornar cada clau al seu lloc.' },
      coixinets: { name: 'Coixinets i forats', text: "Sota cada clau hi ha un coixinet tou que tapa el forat sense que s'escapi l'aire. On hi ha el primer forat obert, s'acaba el tub d'aire.", dato: 'Els coixinets solen ser de feltre embolicat amb una pell molt fina.' },
      peu: { name: 'Peu', text: "És el tros final, amb les claus de les notes més greus. Si ho tapes tot, l'aire fa tota la llargada de la flauta i sona la nota més greu.", dato: 'Amb aquest peu, la nota més greu de la flauta és el Do central del piano.' },
      columna: { name: "Columna d'aire", text: "És l'aire de dins del tub: és el que vibra i fa el so. Va de l'embocadura fins al primer forat obert.", dato: "Per fer el La, l'aire de dins va i ve 440 vegades cada segon." }
    },
    labels: [
      { part: 'corona', group: 'cap', at: [-334, 10.5, 2], internal: false },
      { part: 'embocadura', group: 'cap', at: [-280, 15.6, 10], internal: false },
      { part: 'cap', group: 'cap', at: [-215, 8, 6], internal: false },
      { part: 'cos', group: 'cos', at: [-100, 8, 6], internal: false },
      { part: 'claus', group: 'claus', at: [123, 17.5, 0], internal: false },
      { part: 'coixinets', group: 'claus', at: [174, 12.3, 8.6], internal: false },
      { part: 'peu', group: 'peu', at: [318, 7, 7], internal: false },
      { part: 'columna', group: 'aire', at: [-120, 0, 8.6], internal: true }
    ],
    explode: {
      claus: [0, 55, 0, 0],
      peuClaus: [130, 55, 0, 0.08],
      cap: [-120, 0, 0, 0.15],
      peu: [130, 0, 0, 0.2],
      cos: [0, 0, 0, 0],
      aire: [0, -60, 20, 0.3]
    },
    notes: NOTES,
    options: null,
    chain: ['Bufada', 'Embocadura', "Columna d'aire", 'Forats oberts', 'Aire'],
    tour: [
      { part: 'embocadura', chain: 0, title: 'La bufada', note: 5,
        text: "Els llavis no vibren: fan un raig d'aire prim i ràpid. El raig passa per sobre del forat de l'embocadura.",
        cam: { pos: [-175, 125, 200], target: [-285, 8, 0] }, slow: 0.35, xray: false },
      { part: 'embocadura', chain: 1, title: "L'embocadura", note: 5,
        text: "El raig xoca contra la vora de l'altra banda del forat. Una vegada entra al tub i una altra en surt, molt de pressa. Aquest anar i venir fa vibrar l'aire de dins.",
        cam: { pos: [-232, 78, 104], target: [-281, 13, 0] }, slow: 0.25, xray: false },
      { part: 'columna', chain: 2, title: 'Dins del tub', note: 0,
        text: "El que vibra és l'aire de dins del tub, no el metall. Al mig, l'aire es comprimeix (taronja) i s'expandeix (blau) una vegada i una altra. Com més llarga és aquesta columna d'aire, més greu és la nota.",
        cam: { pos: [20, 330, 860], target: [150, 0, 0] }, slow: 0.5, xray: true },
      { part: 'claus', chain: 3, title: 'Les claus', note: 7,
        text: "Quan prems una clau, el coixinet baixa i tapa el forat. Per al Do4 estan totes tapades. Per a cada nota més aguda se n'obre alguna més, des de baix.",
        cam: { pos: [300, 230, 340], target: [150, 5, 0] }, slow: 0.6, xray: false },
      { part: 'coixinets', chain: 4, title: 'El so surt', note: 3,
        text: "El so surt pel primer forat obert i per l'embocadura. Si tots els forats estan tapats, també surt pel final del peu. Després viatja per l'aire fins a les teves orelles.",
        cam: { pos: [200, 380, 840], target: [140, 0, 0] }, slow: 0.8, xray: false }
    ],
    soundSource: { group: 'cos', at: [60, 14, 0] },

    play(note) {
      const f = (note && note.f) || 440;
      synth.additive({
        f,
        partials: [{ k: 1, a: 1, tau: 10 }, { k: 2, a: 0.3, tau: 8 }, { k: 3, a: 0.12, tau: 6 }, { k: 4, a: 0.05, tau: 5 }, { k: 5, a: 0.02, tau: 4 }],
        attack: 0.07, hold: 1.3, release: 0.25,
        vibrato: { rate: 5, depth: 10 },
        noise: { amount: 0.04, dur: 1.62, hp: 1500, lp: 8000 },
        gain: 0.9
      });
      return { attack: 0.07, hold: 1.3, release: 0.25 };
    },

    update(dt, s) {
      dt = Math.min(dt || 0, 0.1);
      const ni = (typeof s.noteIndex === 'number' && s.noteIndex >= 0) ? Math.min(s.noteIndex, NOTES.length - 1) : 0;
      const env = clamp01(s.env || 0);
      const ph = TAU * (s.fvis || 1) * (s.t || 0);
      const sp = Math.sin(ph);
      const kk = 1 - Math.exp(-dt * 9);

      /* claus: s'obren o es tanquen suaument i es queden així */
      for (const h of HOLES) {
        const tgt = ni >= h.at ? 1 : 0;
        h.open += (tgt - h.open) * kk;
        if (Math.abs(tgt - h.open) < 1e-4) h.open = tgt;
        h.kg.rotation.x = OPEN_ANG * h.open;
      }

      /* columna d'aire: ona estacionària (pressió màxima al mig, mínima als extrems) */
      xEnd += (endFor(ni) - xEnd) * kk;
      const L = Math.max(40, xEnd - X_EMB);
      for (let i = 0; i < NV; i++) {
        const x = gx[i];
        let r = 0.008, g = 0.025, b = 0.035;
        if (x >= X_EMB) {
          const u = (x - X_EMB) / L;
          const inside = 1 - smooth(1, 1 + 10 / L, u);
          const p = env > 0.001 ? Math.sin(PI * Math.min(u, 1)) * sp * env * inside : 0;
          const calm = 1 - 0.85 * Math.abs(p);
          r += 0.01 * inside * calm; g += 0.05 * inside * calm; b += 0.075 * inside * calm;
          if (p !== 0) {
            heat.color(p, tmp3, 0);
            r += tmp3[0] * 0.85; g += tmp3[1] * 0.85; b += tmp3[2] * 0.85;
          }
        }
        gcol[i * 3] = r; gcol[i * 3 + 1] = g; gcol[i * 3 + 2] = b;
      }
      glowGeo.attributes.color.needsUpdate = true;

      // anelles: desplaçament màxim als extrems, compressió al mig
      const A = Math.min(0.2 * L / PI, 28) * env;
      for (let j = 0; j < NR; j++) {
        const x0 = ringX0[j];
        let x = x0, r = 0.012, g = 0.03, b = 0.04;
        if (x0 <= xEnd) {
          const u = (x0 - X_EMB) / L;
          x = Math.max(X_CORK + 3, Math.min(X_FOOT - 2, x0 + A * Math.cos(PI * u) * sp));
          const ud = (x - X_EMB) / L;
          const edge = smooth(-0.02, 0.06, ud) * (1 - smooth(0.94, 1.02, ud));
          heat.color(Math.sin(PI * u) * sp * env, tmp3, 0);
          r = (0.02 + tmp3[0] * 0.5) * edge + 0.01;
          g = (0.08 + tmp3[1] * 0.5) * edge + 0.02;
          b = (0.11 + tmp3[2] * 0.5) * edge + 0.03;
        }
        dummy.position.set(x, 0, 0); dummy.updateMatrix(); rings.setMatrixAt(j, dummy.matrix);
        rings.setColorAt(j, tc.setRGB(r, g, b));
      }
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      endRing.position.x = Math.min(xEnd, X_FOOT - 0.8);
      const eb = 0.25 + 0.75 * env * (0.6 + 0.4 * Math.abs(sp));
      endRing.material.color.setRGB(0.55 * eb, 0.9 * eb, 1.0 * eb);

      /* raig d'aire de la bufada: va i ve contra la vora (to de vora) */
      jet.visible = env > 0.005;
      if (jet.visible) {
        for (let k = 0; k <= NS; k++) {
          const sj = (k / NS) * 1.4;
          const w = Math.sin(ph - 3.4 * sj);
          let dy = env * (0.3 + 2.4 * sj * sj) * w;
          if (sj > 1) { const e = (sj - 1) / 0.4; dy += w < 0 ? -e * 10 * (-w) : e * 3 * w; }
          const cx = LIP[0], cyy = LIP[1] + (EDGE[1] - LIP[1]) * sj + dy, czz = LIP[2] + (EDGE[2] - LIP[2]) * sj;
          const hw = 1.4 + 2.2 * sj, hv = 0.5 + 0.6 * sj;
          const o = k * 18;
          const P = [[cx - hw, cyy], [cx, cyy], [cx + hw, cyy], [cx, cyy - hv], [cx, cyy], [cx, cyy + hv]];
          const fade = smooth(0, 0.1, sj) * (1 - 0.85 * smooth(1.0, 1.4, sj)) * env;
          for (let q = 0; q < 6; q++) {
            jetPos[o + q * 3] = P[q][0]; jetPos[o + q * 3 + 1] = P[q][1]; jetPos[o + q * 3 + 2] = czz;
            const kq = (q === 1 ? 1 : q === 4 ? 0.6 : 0) * fade;
            jetCol[o + q * 3] = 0.3 * kq; jetCol[o + q * 3 + 1] = 0.6 * kq; jetCol[o + q * 3 + 2] = 0.72 * kq;
          }
        }
        jetGeo.attributes.position.needsUpdate = true;
        jetGeo.attributes.color.needsUpdate = true;
      }

      /* partícules d'aire */
      if (env > 0.02) {
        // raig que surt dels llavis
        G.cap.localToWorld(vA.set(LIP[0], LIP[1], LIP[2]));
        fx.air(vA, JD, 260 * env, 0.12, 110);
        // quan el raig passa per sobre de la vora, l'aire surt per l'altra banda
        if (sp > 0.2) {
          G.cap.localToWorld(vA.set(X_EMB, 16.2, -7));
          fx.air(vA, vB.set(0, 0.45, -1), 280 * env * sp, 0.3, 120);
        }
        // aire pel primer forat obert
        const fo = firstOpen(ni);
        if (fo) {
          (fo.foot ? G.peu : G.cos).localToWorld(vA.set(fo.x, CHIM_TOP + 1.5, 0));
          fx.air(vA, vB.set(0, 1, 0.35), 380 * env * (0.55 + 0.45 * Math.abs(sp)), 0.45, 150);
        }
        // aire pel final del peu
        G.peu.localToWorld(vA.set(X_FOOT + 1, 0, 0));
        fx.air(vA, vB.set(1, 0, 0), (fo ? 120 : 400) * env, 0.4, fo ? 90 : 160);
      }
    }
  };
}
