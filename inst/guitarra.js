export default function (ctx) {
  const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /* Es construeix en coordenades de guitarra (x al llarg, y a l'ample, z amunt) dins d'un subgrup girat */
  const G = groups(['back', 'sides', 'braces', 'top', 'bridge', 'strings', 'neck']);
  const R = {};
  for (const k in G) { const r = new THREE.Group(); r.rotation.x = -Math.PI / 2; r.position.x = -500; G[k].add(r); R[k] = r; }
  const W = (x, y, z) => [x - 500, z, -y];

  /* ---------- model del so ---------- */
  const TAU0 = [3.4, 3.0, 2.7, 2.3, 2.0, 1.8], P = 0.2;
  function H(f) {
    const roll = 1 / (1 + (f / 3200) ** 2);
    return (0.25 + 1.5 / (1 + ((f - 98) / 14) ** 2) + 1.1 / (1 + ((f - 205) / 28) ** 2) + 0.6 / (1 + ((f - 410) / 70) ** 2) + 0.35 / (1 + ((f - 1000) / 600) ** 2)) * roll;
  }
  let HMAX = 0; for (let f = 60; f < 4000; f++) HMAX = Math.max(HMAX, H(f));
  const VC = []; { const cs = []; for (let k = 1; k <= 12; k++) cs.push([k, Math.sin(k * Math.PI * P) / (k * k)]);
    let m = 0; for (let i = 0; i <= 100; i++) { const u = i / 100; let y = 0; for (const [k, a] of cs) y += a * Math.sin(k * Math.PI * u); m = Math.max(m, Math.abs(y)); }
    for (const [k, a] of cs) VC.push([k, a / m]); }
  let FN = 0; for (let i = 0; i < 200; i++) { let F = 0; for (const [k, a] of VC) F += a * k * Math.cos(k * 2 * Math.PI * i / 200); FN = Math.max(FN, Math.abs(F)); }

  /* ---------- materials ---------- */
  const lacq = { clearcoat: 0.75, clearcoatRoughness: 0.18, envMapIntensity: 0.6 };
  const rosC = document.createElement('canvas'); rosC.width = rosC.height = 1024;
  { const g = rosC.getContext('2d'), c = 512, k = c / 60;
    const ring = (r0, r1, col) => { g.beginPath(); g.arc(c, c, r1 * k, 0, 2 * Math.PI); g.arc(c, c, r0 * k, 0, 2 * Math.PI, true); g.fillStyle = col; g.fill(); };
    ring(50, 60, '#1A110B'); ring(50.8, 51.5, '#EFE4CC'); ring(58.4, 59.1, '#EFE4CC'); ring(51.9, 52.4, '#9C3A22'); ring(57.6, 58.1, '#9C3A22');
    const pal = ['#7B2A1C', '#2F5A3A', '#E9DCBF', '#C58B3C', '#1A120C', '#E9DCBF'];
    for (let a = 0; a < 144; a++) for (let r = 0; r < 4; r++) { const r0 = 52.8 + r * 1.2, a0 = a / 144 * 2 * Math.PI, a1 = (a + 1) / 144 * 2 * Math.PI;
      g.beginPath(); g.arc(c, c, (r0 + 1.2) * k, a0, a1); g.arc(c, c, r0 * k, a1, a0, true); g.closePath(); g.fillStyle = pal[(a + (r % 2 ? 2 : 0) + Math.floor(a / 6) * (r === 1 || r === 2 ? 1 : 0)) % pal.length]; g.fill(); } }
  const tRos = new THREE.CanvasTexture(rosC); tRos.colorSpace = THREE.SRGBColorSpace;

  const mTop = mat('tapa', { map: tex.spruce(1, 1), color: 0xDCC39A, roughness: 0.5, side: THREE.DoubleSide, ...lacq, clearcoat: 0.55, envMapIntensity: 0.4 }, { xray: true });
  const mTopEdge = mat('boca', { map: tex.spruce(1 / 120, 1 / 60), color: 0xC9A56E, roughness: 0.6, side: THREE.DoubleSide }, { xray: true });
  const mRos = mat('boca', { map: tRos, roughness: 0.35, ...lacq }, { xray: true });
  const mLip = mat('boca', { color: 0xE0BE85, roughness: 0.45, ...lacq }, { xray: true });
  const mPurf = mat('tapa', { color: 0xEDE2C9, roughness: 0.4, ...lacq }, { xray: true });
  const mBind = mat('costats', { color: 0x2A140A, roughness: 0.3, ...lacq });
  const mSides = M.wood('costats', tex.rosewood(1 / 700, 1 / 110));
  const mBack = M.wood('fons', tex.rosewood(1 / 520, 1 / 420));
  const mBackBind = mat('fons', { color: 0x2A140A, roughness: 0.3, ...lacq });
  const mBrace = M.rawWood('varetatge', tex.spruce(1 / 120, 1 / 60), { color: 0xF2DDB0 });
  const mBridge = M.wood('pont', tex.rosewood(1 / 520, 1 / 420), { color: 0x8A6A5A });
  const mBone = M.bone('pont');
  const mInlay = mat('pont', { color: 0xE6D8B8, roughness: 0.4 });
  const mFb = M.ebony('mastil');
  const mFret = mat('mastil', { color: 0xDADBD6, metalness: 1, roughness: 0.22 }, { phys: false });
  const mNeck = M.wood('mastil', tex.mahogany(1 / 360, 1 / 80));
  const mNut = M.bone('mastil');
  const mHead = M.wood('capcal', tex.rosewood(1 / 520, 1 / 420), { color: 0xB08A78 });
  const mRoller = mat('capcal', { color: 0xEFE8DA, roughness: 0.3, clearcoat: 0.5 });
  const mBrass = M.brass('capcal');
  const mPearl = mat('capcal', { color: 0xF2ECDF, roughness: 0.25, clearcoat: 1, sheen: 0.6, sheenColor: new THREE.Color(0xBFD8E8) });

  /* ---------- geometria (mm) ---------- */
  const TOP = 100, SAD = 167.5, NUT = 823, HOLE = { x: 328, r: 43 };
  function bodyW(x) { const es = [[150, 150, 183], [285, 110, 118], [385, 105, 140]], v = []; for (const [c, rx, ry] of es) { const u = (x - c) / rx; if (Math.abs(u) < 1) v.push(ry * Math.sqrt(1 - u * u)); } if (!v.length) return 0; const k = 9, m = Math.max(...v); return m + k * Math.log(v.reduce((s, x) => s + Math.exp((x - m) / k), 0)); }
  const OUT = []; { const N = 140; for (let i = 0; i <= N; i++) { const x = 245 - 245 * Math.cos(Math.PI * i / N); OUT.push([x, bodyW(x)]); } for (let i = N - 1; i >= 1; i--) { const x = 245 - 245 * Math.cos(Math.PI * i / N); OUT.push([x, -bodyW(x)]); } }
  function offset(pts, d) { const n = pts.length; return pts.map((p, i) => { const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [p[0] - (-dy / L) * d, p[1] - (dx / L) * d]; }); }
  const ring = (o, i) => { const s = geo.shape(o); s.holes.push(geo.path(i)); return s; };
  const box = geo.box;

  // fons
  add(R.back, geo.ext(geo.shape(OUT), 2.5), mBack, 'fons');
  add(R.back, geo.ext(ring(OUT, offset(OUT, 4)), 3.2).translate(0, 0, -0.35), mBackBind, 'fons');
  add(R.back, box(6, 484, -2.2, 2.2, 2.5, 3.2), mBackBind, 'fons', { cast: false });
  // costats
  add(R.sides, geo.ext(ring(OUT, offset(OUT, 2.5)), 95).translate(0, 0, 2.5), mSides, 'costats');
  add(R.sides, box(2, 10, -30, 30, 2.5, 97.5), mSides, 'costats', { cast: false });
  add(R.sides, box(478, 489, -40, 40, 2.5, 97.5), mSides, 'costats', { cast: false });
  // varetatge
  function beam(g, p0, p1, w, h, z0, m, part) { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy); const me = add(g, new THREE.BoxGeometry(L, w, h), m, part, { pos: [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z0 + h / 2] }); me.rotation.z = Math.atan2(dy, dx); return me; }
  for (let i = 0; i < 7; i++) { const t = i / 6; beam(R.braces, [296, -14 + 28 * t], [78 + Math.abs(t - .5) * 34, -118 + 236 * t], 5, 6.5, 93.5, mBrace, 'varetatge'); }
  for (const x of [272, 408]) { const w = bodyW(x) - 4; beam(R.braces, [x, -w], [x, w], 8, 13, 87, mBrace, 'varetatge'); }
  beam(R.braces, [60, -60], [110, -140], 5, 5, 95, mBrace, 'varetatge'); beam(R.braces, [60, 60], [110, 140], 5, 5, 95, mBrace, 'varetatge');
  add(R.braces, box(150, 178, -55, 55, 97, 100), mBrace, 'varetatge');

  // tapa deformable
  const topGeo = (() => {
    const NX = 170, NY = 56, pos = [], uv = [], shp = [], idx = [], map = new Int32Array((NX + 1) * (NY + 1)).fill(-1);
    for (let i = 0; i <= NX; i++) { const x = 245 - 245 * Math.cos(Math.PI * i / NX), w = bodyW(x);
      for (let j = 0; j <= NY; j++) { const v = -1 + 2 * j / NY, y = v * w; if (Math.hypot(x - HOLE.x, y) < HOLE.r) continue; map[i * (NY + 1) + j] = pos.length / 3; pos.push(x, y, TOP); uv.push(x / 490, (y + 200) / 400); shp.push((1 - v * v) * Math.exp(-(((x - 185) / 150) ** 2)) * (1 - 0.5 * Math.exp(-(((x - HOLE.x) / 70) ** 2)))); } }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) { const a = map[i * (NY + 1) + j], b = map[(i + 1) * (NY + 1) + j], c = map[(i + 1) * (NY + 1) + j + 1], d = map[i * (NY + 1) + j + 1]; if (a < 0 || b < 0 || c < 0 || d < 0) continue; idx.push(a, b, d, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3)); g.setIndex(idx); g.computeVertexNormals(); g.userData.shape = Float32Array.from(shp); return g;
  })();
  const topMesh = add(R.top, topGeo, mTop, 'tapa');
  heat.overlay(topMesh);
  add(R.top, geo.ext(ring(OUT, offset(OUT, 4)), 3.3).translate(0, 0, 97.5), mBind, 'costats');
  add(R.top, geo.ext(ring(offset(OUT, 4), offset(OUT, 5.6)), 0.35).translate(0, 0, 100.2), mPurf, 'tapa', { cast: false });
  add(R.top, new THREE.RingGeometry(43, 50.2, 128).translate(HOLE.x, 0, 100.45), mLip, 'boca', { cast: false });
  add(R.top, new THREE.RingGeometry(50, 60, 160).translate(HOLE.x, 0, 100.55), mRos, 'boca', { cast: false });
  add(R.top, new THREE.CylinderGeometry(43, 43, 2.6, 96, 1, true).rotateX(Math.PI / 2).translate(HOLE.x, 0, 99.2), mTopEdge, 'boca');

  // pont
  add(R.bridge, geo.ext(geo.rrect(145, 178, -92, 92, 5), 3.2, { bevelThickness: .9, bevelSize: .9, bevelSegments: 3 }).translate(0, 0, 101.4), mBridge, 'pont');
  add(R.bridge, geo.ext(geo.rrect(145, 176, -42, 42, 2.5), 3.6, { bevelThickness: .6, bevelSize: .6, bevelSegments: 2 }).translate(0, 0, 104.6), mBridge, 'pont');
  add(R.bridge, box(146, 157, -42, 42, 108.8, 111.2), mBridge, 'pont');
  add(R.bridge, box(149.5, 153, -41.5, 41.5, 111.2, 111.6), mInlay, 'pont', { cast: false });
  add(R.bridge, new THREE.BoxGeometry(3.2, 80, 12.4).translate(SAD, 0, 110.3), mBone, 'pont');

  // mànec, diapasó, trasts i capçal
  const hw = x => 31.5 - 5.5 * (x - 375) / (NUT - 375);
  add(R.neck, geo.ext(geo.shape([[375, -31.5], [NUT, -hw(NUT)], [NUT, hw(NUT)], [375, 31.5]]), 5.6, { bevelThickness: .5, bevelSize: .5, bevelSegments: 2 }).translate(0, 0, 100.9), mFb, 'mastil');
  for (let k = 1; k <= 19; k++) { const x = NUT - 650 * (1 - Math.pow(2, -k / 12)); add(R.neck, new THREE.CylinderGeometry(1.05, 1.05, 2 * hw(x) - 1.6, 12).translate(x, 0, 107.2), mFret, 'mastil', { cast: false }); }
  add(R.neck, geo.ext(geo.shape([[495, -24.5], [818, -20.5], [818, 20.5], [495, 24.5]]), 16, { bevelThickness: 6, bevelSize: 5, bevelSegments: 5 }).translate(0, 0, 78.4), mNeck, 'mastil');
  { const s = new THREE.Shape(); s.moveTo(489, 100); s.lineTo(489, 5); s.lineTo(503, 5); s.quadraticCurveTo(512, 62, 566, 84); s.lineTo(566, 100); s.closePath();
    add(R.neck, geo.ext(s, 42, { bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 4 }).rotateX(Math.PI / 2).translate(0, 21, 0), mNeck, 'mastil'); }
  add(R.neck, box(NUT - 3, NUT + 3, -26.5, 26.5, 106.4, 113), mNut, 'mastil');
  const HEADA = 0.21, head = new THREE.Group(); head.position.set(NUT + 3, 0, 104); head.rotation.y = HEADA; R.neck.add(head);
  { const s = geo.shape([[0, -27], [150, -33], [186, -34], [193, -20], [184, 0], [193, 20], [186, 34], [150, 33], [0, 27]]);
    s.holes.push(geo.path([[30, 8], [164, 8], [166, 14], [164, 20], [30, 20], [28, 14]])); s.holes.push(geo.path([[30, -20], [164, -20], [166, -14], [164, -8], [30, -8], [28, -14]]));
    add(head, geo.ext(s, 17, { bevelThickness: 1.3, bevelSize: 1.3, bevelSegments: 3 }).translate(0, 0, -16), mHead, 'capcal'); }
  const ROLLX = [52, 90, 128];
  for (const x of ROLLX) { add(head, new THREE.CylinderGeometry(4.2, 4.2, 66, 20).translate(x, 0, -7), mRoller, 'capcal');
    for (const s of [-1, 1]) { add(head, new THREE.CylinderGeometry(1.8, 1.8, 24, 10).rotateX(Math.PI / 2).translate(x, s * 41, -27), mBrass, 'capcal');
      add(head, new THREE.CylinderGeometry(8.5, 8.5, 5, 28).rotateX(Math.PI / 2).scale(1, 0.62, 1).translate(x, s * 41, -41), mPearl, 'capcal');
      add(head, box(x - 6, x + 6, s * 33, s * 42, -13, -3), mBrass, 'capcal', { cast: false }); } }
  for (const s of [-1, 1]) add(head, box(26, 160, s > 0 ? 33 : -34.4, s > 0 ? 34.4 : -33, -15, 0), mBrass, 'capcal', { cast: false });
  const headPt = (x, y, z) => [NUT + 3 + x * Math.cos(HEADA) + z * Math.sin(HEADA), y, 104 - x * Math.sin(HEADA) + z * Math.cos(HEADA)];

  // cordes
  const SY = i => -29 + 11.6 * i, NY = i => -21 + 8.4 * i;
  const RADS = [0.62, 0.55, 0.48, 0.56, 0.47, 0.41];
  const strings = [];
  for (let i = 0; i < 6; i++) {
    const wound = i < 3, r = RADS[i], a = [SAD, SY(i), 116.6 + r], b = [NUT, NY(i), 113 + r];
    const sm = M.string('cordes', wound);
    const g = geo.tube(a, b, r, 180, 8);
    const m = add(R.strings, g, sm, 'cordes', { note: i });
    m.userData.base = Float32Array.from(g.attributes.position.array); m.userData.mat = sm;
    add(R.strings, geo.tube(a, b, 6, 1, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }), 'cordes', { note: i, cast: false });
    strings.push(m);
    add(R.bridge, geo.tube([SAD - 1.5, SY(i), 116.6 + r], [151, SY(i), 111.4], r, 1, 6), sm, 'cordes', { cast: false, pick: false });
    const ry = (i < 3 ? -14 : 14) + ((i % 3) - 1) * 3.2, e = headPt(ROLLX[i % 3], ry, -2.8);
    add(R.neck, geo.tube(b, e, r, 1, 6), sm, 'cordes', { cast: false, pick: false });
  }

  /* ---------- animació ---------- */
  const tc = V3(0, 0, 0), up = V3(0, 1, 0);
  let Ff = 0, topActive = false;
  const NOTES = [
    { label: 'Mi greu', f: 82.41, s: 0 }, { label: 'La', f: 110, s: 1 }, { label: 'Re', f: 146.83, s: 2 },
    { label: 'Sol', f: 196, s: 3 }, { label: 'Si', f: 246.94, s: 4 }, { label: 'Mi agut', f: 329.63, s: 5 }
  ];

  return {
    id: 'guitarra', family: 'Corda pinçada', name: 'Guitarra',
    intro: 'Pinces una corda amb el dit i comença a vibrar. La vibració passa al pont i a la tapa, que és la que empeny l’aire i fa que la sentis.',
    floorY: -205,
    camera: {
      explore: { pos: [-820, 720, 1300], target: [130, -10, 0] },
      exploded: { pos: [-1300, 1050, 1850], target: [170, 90, 0] }
    },
    parts: {
      tapa: { name: 'Tapa harmònica', text: 'És l’altaveu de la guitarra. El pont la fa vibrar i ella empeny l’aire.', dato: 'Avet o cedre · uns 2 mm de gruix' },
      varetatge: { name: 'Varetatge', text: 'Llistons de fusta enganxats a sota de la tapa en forma de ventall. La fan forta sense que deixi de vibrar.', dato: 'El va fer famós el guitarrer Antonio de Torres, al segle XIX' },
      pont: { name: 'Pont', text: 'Aquí s’hi lliguen les cordes. Passa la vibració de les cordes a la tapa.', dato: 'Les cordes s’hi lliguen fent un nus' },
      boca: { name: 'Boca', text: 'Per aquí entra i surt l’aire de dins de la caixa. Ajuda a fer més forts els sons greus.', dato: 'La roseta que l’envolta és decoració' },
      cordes: { name: 'Cordes', text: 'Les agudes són de niló i les greus van folrades de fil metàl·lic. Soles gairebé no se senten: necessiten la caixa.', dato: 'Afinació: Mi, La, Re, Sol, Si, Mi' },
      mastil: { name: 'Mànec i diapasó', text: 'Quan prems un trast, la part de corda que vibra és més curta i la nota és més aguda.', dato: 'El trast 12 és just a la meitat de la corda: hi trobes l’octava' },
      capcal: { name: 'Capçal i clavilles', text: 'Girant les clavilles tibes o afluixes les cordes. Com més tibada, més aguda sona.', dato: 'Cada corda té la seva clavilla' },
      costats: { name: 'Costats', text: 'Fusta doblegada amb calor que uneix la tapa i el fons. Tanquen la caixa.', dato: 'Fan uns 10 cm d’alçada' },
      fons: { name: 'Fons', text: 'La part de darrere de la caixa. Fa rebotar el so cap a la boca.', dato: 'Sovint és de palissandre o de xiprer' }
    },
    labels: [
      { part: 'cordes', group: 'strings', at: W(600, SY(5) + 0.66 * (NY(5) - SY(5)), 118) },
      { part: 'mastil', group: 'neck', at: W(700, -26, 107) },
      { part: 'capcal', group: 'neck', at: headPt(170, -34, 0).length ? W(...headPt(170, -34, 0)) : W(1000, 0, 100) },
      { part: 'pont', group: 'bridge', at: W(160, 92, 106) },
      { part: 'boca', group: 'top', at: W(HOLE.x, -55, 101) },
      { part: 'tapa', group: 'top', at: W(205, 150, 101) },
      { part: 'varetatge', group: 'braces', at: W(120, -70, 100), internal: true },
      { part: 'costats', group: 'sides', at: W(40, -bodyW(40), 50) },
      { part: 'fons', group: 'back', at: W(250, -150, 2.5), internal: true }
    ],
    explode: { strings: [0, 330, 0, 0], bridge: [0, 245, 0, 0.08], top: [0, 175, 0, 0.16], braces: [0, 88, 0, 0.24], back: [0, -175, 0, 0.32] },
    notes: NOTES,
    options: null,
    chain: ['Dit', 'Corda', 'Pont', 'Tapa', 'Aire'],
    tour: [
      { part: 'cordes', chain: 1, title: 'La corda', text: 'Quan pinces la corda i la deixes anar, comença a vibrar. Aquí la veus a càmera lenta: de veritat ho fa moltíssimes vegades per segon.', cam: { pos: [-150, 190, 250], target: [-10, 114, 0] }, slow: 0.35 },
      { part: 'pont', chain: 2, title: 'El pont', text: 'La corda estira el pont una vegada i una altra. Així la vibració passa a la caixa. El brill taronja és aquesta força.', cam: { pos: [-470, 260, 250], target: [-335, 108, 0] }, slow: 0.5 },
      { part: 'tapa', chain: 3, title: 'La tapa', text: 'El pont fa moure la tapa. Taronja: puja. Blau: baixa. Està molt exagerat: de veritat es mou menys que el gruix d’un cabell.', cam: { pos: [-260, 980, 330], target: [-250, 90, 0] }, slow: 0.7, xray: true },
      { part: 'boca', chain: 4, title: 'La boca', text: 'Quan la tapa baixa, empeny l’aire de dins i surt per la boca. Quan puja, l’aire torna a entrar.', cam: { pos: [-430, 240, 330], target: [-172, 130, 0] }, slow: 0.8 },
      { part: 'tapa', chain: 4, title: 'Fins a l’orella', text: 'La tapa i la boca empenyen l’aire de l’habitació. Aquestes ones arriben a la teva orella i les sents com a so.', cam: { pos: [-1300, 900, 2000], target: [0, 80, 0] }, slow: 1 }
    ],
    soundSource: { group: 'top', at: W(245, 0, 100) },

    play(note) {
      const si = note.s, f0 = note.f, partials = [];
      for (let k = 1; k * f0 < 6000 && k <= 40; k++) { const f = k * f0; partials.push({ k, a: Math.abs(Math.sin(k * Math.PI * P) / k * H(f)), tau: TAU0[si] / (1 + 0.0016 * f) }); }
      synth.additive({ f: f0, partials, attack: 0.002, noise: { amount: 0.03, dur: 0.012, lp: 5000 } });
      return { attack: 0.005, hold: 0, release: TAU0[si] / (1 + 0.0016 * f0) };
    },

    update(dt, s) {
      const env = s.env, active = s.note.s, wt = 2 * Math.PI * s.fvis * s.t;
      strings.forEach((m, i) => {
        const on = i === active && env > 0, pa = m.geometry.attributes.position, b = m.userData.base, arr = pa.array;
        const e = on ? 0.15 + env * 0.5 : 0; m.userData.mat.emissive.setRGB(e * 0.95, e * 0.45, e * 0.12);
        if (on) {
          const amp = 9 * Math.pow(env, 0.7);
          for (let r = 0; r <= 180; r++) { const u = r / 180; let d = 0; for (const [k, a] of VC) d += a * Math.sin(k * Math.PI * u) * Math.cos(k * wt); d *= amp;
            for (let j = 0; j < 9; j++) { const id = (r * 9 + j) * 3; arr[id] = b[id]; arr[id + 1] = b[id + 1] + d; arr[id + 2] = b[id + 2] + d * 0.3; } }
          pa.needsUpdate = true; m.userData.moved = true;
        } else if (m.userData.moved) { arr.set(b); pa.needsUpdate = true; m.userData.moved = false; }
      });
      let F = 0; for (const [k, a] of VC) F += a * k * Math.cos(k * wt); F /= FN;
      Ff += (F - Ff) * Math.min(1, dt * 18 * (s.view === 'tour' ? 0.6 : 1) + 0.15);
      const force = env * Math.abs(Ff);
      if (s.selected !== 'pont') { const e = force * (s.view === 'tour' && s.tourStep === 1 ? 1.6 : 0.9); mBridge.emissive.setRGB(e, e * 0.45, e * 0.12); mBone.emissive.setRGB(e, e * 0.45, e * 0.12); }
      const resp = Math.sqrt(H(s.f) / HMAX);
      if (env > 0) {
        const A = env * Ff * 8 * resp, pa = topGeo.attributes.position.array, ca = topGeo.attributes.color.array, sh = topGeo.userData.shape;
        for (let i = 0, N = sh.length; i < N; i++) { const d = sh[i] * A; pa[i * 3 + 2] = TOP + d; heat.color(d / 5, ca, i); }
        topGeo.attributes.position.needsUpdate = true; topGeo.attributes.color.needsUpdate = true; topGeo.computeVertexNormals(); topActive = true;
        if (env > 0.04 && Math.cos(wt) > 0.15) { tc.set(...W(HOLE.x, 0, 102)); G.top.localToWorld(tc); fx.air(tc, up, 520 * env, 0.45, 230); }
      } else if (topActive) { const pa = topGeo.attributes.position.array; for (let i = 2; i < pa.length; i += 3) pa[i] = TOP; topGeo.attributes.position.needsUpdate = true; topGeo.computeVertexNormals(); topActive = false; }
    }
  };
}
