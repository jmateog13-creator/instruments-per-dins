# Instruments per dins — especificació dels mòduls d'instrument

Web educativa per a 3r d'ESO (Catalunya). Una sola pàgina amb un menú de 7 subfamílies; cada instrument és un model 3D (Three.js r160) que es pot girar, desmuntar (despiece), tocar i recórrer en una visita guiada que ensenya com es produeix i surt el so.

El motor (`app.js`) ja fa: renderer, llums, entorn, ombres, terra, OrbitControls, etiquetes HTML amb línies, selecció de peces (ressaltat emissiu), raigs X, animació del despiece, visita guiada amb vols de càmera, cadena d'energia, ones de so (esferes) i àudio. **Tu escrius només un mòdul d'instrument** a `inst/<id>.js`.

## Format del fitxer

- Mòdul ES **sense cap `import`**. Tot el que necessites arriba per `ctx`.
- `export default function (ctx) { ...; return { ... } }`
- Ha de passar `node --check` (copia'l a un `.mjs` per comprovar-ho).

## Unitats i eixos

- Mil·límetres. Eix **Y amunt** (món de Three.js). X i Z horitzontals.
- Construeix l'instrument al voltant de l'origen. La càmera i el terra els defineixes tu (`camera`, `floorY`).
- Les peces es posen dins de grups (`ctx.groups([...])`). Els grups no tenen transformació pròpia: el motor els desplaça quan es desmunta. Les coordenades `at` de les etiquetes i de `soundSource` són locals del grup = coordenades del món amb l'instrument muntat.

## ctx (el que et dona el motor)

```js
const { THREE, V3, groups, mat, M, tex, add, geo, fx, synth, heat } = ctx;
```

- `THREE` — el mòdul complet de three r160.
- `V3(x,y,z)` — `new THREE.Vector3`.
- `groups(['cos','tapa',...])` → `{cos: Group, tapa: Group, ...}` (fills de l'arrel de l'instrument).
- `mat(part, opts, {phys=true, xray=false, body=false})` → material registrat (MeshPhysicalMaterial si `phys`, si no MeshStandardMaterial). `part` = id de peça (per ressaltar-la quan se selecciona). `xray:true` → es torna transparent amb els raigs X. `opts` són les opcions normals de Three (map, color, roughness, metalness, clearcoat...).
- `M` — materials preparats, tots registrats amb la peça que passis:
  - `M.wood(part, texture, {color, xray})` laca brillant (clearcoat) sobre textura de fusta
  - `M.rawWood(part, texture, {color, xray})` fusta mat (interior, varetes)
  - `M.brass(part)` llautó polit, `M.silver(part)` plata/niquel, `M.nickel(part)` acer niquelat, `M.chrome(part)`
  - `M.ebony(part)`, `M.bone(part)` (os/marfil), `M.ivory(part)` (tecles blanques), `M.blackKey(part)`
  - `M.felt(part, color)` feltre, `M.skin(part)` pell/membrana translúcida, `M.plastic(part, color)`, `M.string(part, wound)` corda (wound=true metàl·lica entorxada, false niló/tripa)
- `tex` — textures procedurals de fusta (CanvasTexture). Cada funció retorna una textura nova: `tex.spruce(rx,ry)`, `tex.maple(rx,ry)` (auró amb flama), `tex.rosewood(rx,ry)`, `tex.ebony(rx,ry)`, `tex.mahogany(rx,ry)`, `tex.rosewoodBar(rx,ry)` (palissandre per a làmines). La veta va en la direcció **u** de la textura. `rx, ry` = repetició (les UV de `ExtrudeGeometry` van en mm, per això sovint `1/500` etc.).
- `add(group, geometry, material, part, opts)` → `THREE.Mesh` afegit al grup, amb ombres i seleccionable.
  - `opts.pos:[x,y,z]`, `opts.rot:[x,y,z]` (radians), `opts.scale:[x,y,z]`
  - `opts.cast` (def. true), `opts.pick` (def. true)
  - `opts.note: índex` → clicar aquesta peça toca aquesta nota de `notes` (tecla, làmina, corda...).
- `geo` — ajudes de geometria:
  - `geo.box(x0,x1,y0,y1,z0,z1)` caixa entre límits
  - `geo.shape([[x,y],...])`, `geo.path([[x,y],...])` → `THREE.Shape` / `THREE.Path`
  - `geo.rrect(x0,x1,y0,y1,r)` → Shape rectangle arrodonit
  - `geo.ext(shape, depth, bevel?)` → ExtrudeGeometry al llarg de **+z** del pla de la forma (bevel = `{bevelThickness, bevelSize, bevelSegments}` o res)
  - `geo.tube(a:[x,y,z], b:[x,y,z], r, seg=1, radial=8)` tub recte
  - `geo.curveTube(points:[[x,y,z],...], r, seg=64, radial=12, closed=false)` tub per una corba suau (CatmullRom)
  - `geo.cyl(r, len, axis='y', seg=32, rTop=r)` cilindre centrat a l'origen amb l'eix indicat ('x'|'y'|'z')
  - `geo.lathe([[r,y],...], seg=64)` LatheGeometry al voltant de l'eix Y
- `fx.air(posWorld:Vector3, dirWorld:Vector3, rate, spread=0.4, speed=220)` — emet partícules d'aire **aquest fotograma** (crida-ho a cada `update` mentre surti aire; `rate` = partícules per segon, ~200–600).
- `heat` — mapa de vibració (taronja = puja, blau = baixa):
  - `heat.overlay(mesh)` → crea i retorna una malla germana que comparteix la geometria (cal que tingui atribut `color`; el motor l'hi afegeix si no en té). La mostra el motor quan `s.heat` és cert.
  - `heat.color(s, out, i)` escriu a `out[i*3..i*3+2]` el color additiu per a un desplaçament normalitzat `s ∈ [-1, 1]`.
- `synth` — so (s'està executant un AudioContext només després d'un clic):
  - `synth.additive({f, partials:[{k, a, tau}], attack=0.003, hold=0, release=null, vibrato=null, noise=null, gain=1, dur=null})`
    - `k` = ràtio de freqüència (pot ser inharmònica, p. ex. xilòfon 1, 3.9, 9.2), `a` = amplitud relativa, `tau` = segons de decaïment de l'harmònic.
    - `attack` segons; `hold` segons sostinguts (vent, arc); `release` segons de caiguda final (si és null, només decauen els `tau`).
    - `vibrato:{rate, depth}` (depth en cents, p. ex. 15).
    - `noise:{amount, dur, lp, hp}` soroll filtrat (bufada, cop de baqueta, bordons). `lp`/`hp` en Hz. `dur` en s.
    - `dur` = durada total del buffer (per defecte la calcula).
  - `synth.ctx` (AudioContext) i `synth.out` (node de sortida) si vols fer alguna cosa pròpia.

## El que has de retornar

```js
return {
  id: 'violi',                       // igual que el nom del fitxer
  family: 'Corda fregada',           // subfamília en català
  name: 'Violí',
  intro: 'Una o dues frases que expliquin com sona.',
  floorY: -200,                      // y del terra (ombra), per sota de tot, també desmuntat
  camera: {
    explore:  { pos:[x,y,z], target:[x,y,z] },
    exploded: { pos:[x,y,z], target:[x,y,z] }   // prou lluny per veure-ho tot separat
  },
  parts: {                           // 6–10 peces
    tapa: { name:'Tapa', text:'Màxim 2 frases curtes.', dato:'Una dada curiosa curta' }
  },
  labels: [ { part:'tapa', group:'tapa', at:[x,y,z], internal:false } ],  // una per peça; internal = només es veu desmuntat o amb raigs X
  explode: { tapa:[dx,dy,dz,delay] },   // desplaçament en mm quan està del tot desmuntat; delay 0–0.35 (ordre d'arrencada)
  notes: [ { label:'Sol', f:196 } ],    // 4–8 botons de nota; pots afegir camps propis (pistons, tecla, corda...)
  options: { label:'Tècnica', items:['Arc','Pizzicato'] },  // o null
  chain: ['Arc','Corda','Pont','Tapa','Aire'],               // camí de l'energia, 4–5 passos
  tour: [                                                    // 4–5 passos
    { part:'corda', chain:1, title:'La corda', text:'2–3 frases curtes.', cam:{pos:[..], target:[..]}, slow:0.4, xray:false }
  ],
  soundSource: { group:'tapa', at:[x,y,z] },   // d'on surten les ones de so
  play(note, opt) {                            // toca el so i diu com ha de ser l'animació
    synth.additive({...});
    return { attack:0.02, hold:0.8, release:1.2 };  // envolupant visual (s.env)
  },
  update(dt, s) {
    // s = { env (0–1), t (temps visual des de l'última nota, ja alentit), time (temps real),
    //       f, fvis (freqüència visual en Hz, ~0.5–3), note, noteIndex, opt,
    //       heat, xray, view ('explore'|'exploded'|'tour'), tourStep, explode (0–1), selected }
    // Anima: vibracions, peces que es mouen (arc, martellet, pistons, baqueta), aire amb fx.air...
  }
};
```

## Regles d'animació

- **Tot alentit**: una vibració real és de centenars de Hz. Fes servir `s.fvis` (ja és lenta) i `s.t`: fase = `2*Math.PI*s.fvis*s.t`.
- **Exagerat però creïble**: una corda pot moure's uns mm, una membrana o una tapa uns quants mm, una làmina uns mm.
- Si deformes una malla, guarda'n les posicions base i restaura-les quan `s.env` arribi a 0. Recalcula normals només mentre es mou. Mantén-te per sota de ~15.000 vèrtexs animats.
- Quan la malla que vibra té mapa de vibració: `heat.overlay(mesh)` una vegada, i a cada fotograma omple l'atribut `color` amb `heat.color(s_norm, colors, i)` i marca `needsUpdate`.
- Les peces mecàniques (martellet, apagador, pistons, arc, baqueta, clau de la flauta) s'han d'animar quan sona la nota: és el més important per entendre l'instrument.
- Les coses s'han de moure també quan l'instrument està desmuntat (no passa res si no encaixen).

## Aspecte

- Ha de semblar un instrument real ben fet: silueta reconeixible, proporcions correctes, materials (fusta lacada, metall, feltre, os), detalls que el fan creïble. Res de caixes grises.
- Simplifica sense fer-ho cutre: formes suaus (`lathe`, `ext` amb bevel, `curveTube`), no polígons durs.
- Mida real en mm.

## Textos (molt important)

- **Català correcte**, per a alumnes de 14–15 anys.
- Frases curtes, paraules de cada dia, una idea per frase. Res de fórmules, ni Hz a cada frase, ni termes com "Helmholtz" o "inharmònic". Si cal un terme tècnic (p. ex. "ànima", "embocadura", "ressonador"), explica'l amb poques paraules.
- `parts.text` ≤ 2 frases. `tour.text` ≤ 3 frases. `dato`: una dada curiosa i certa (material, mida, història).
- Tota la informació ha de ser certa. Si dubtes d'una dada, no la posis.
