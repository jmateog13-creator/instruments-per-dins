// Portada: mapa de l'orquestra (vist des de dalt) per triar instrument, filtres i llista.
import { INSTR, SUBS, BY_ID } from './cataleg.js';

const $ = s => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const CX = 520, CY = 600, D2R = Math.PI / 180;
const P = (a, r) => [CX + r * Math.sin(a * D2R), CY - r * Math.cos(a * D2R)];
const f1 = v => v.toFixed(1);

function wedge(a0, a1, r0, r1) {
  const g = 0.7, gr = 3;                     // petit espai entre sectors
  a0 += g; a1 -= g; r0 += gr; r1 -= gr;
  const [x0, y0] = P(a0, r0), [x1, y1] = P(a0, r1), [x2, y2] = P(a1, r1), [x3, y3] = P(a1, r0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}A${r1} ${r1} 0 ${big} 1 ${f1(x2)} ${f1(y2)}L${f1(x3)} ${f1(y3)}A${r0} ${r0} 0 ${big} 0 ${f1(x0)} ${f1(y0)}Z`;
}
// cadires dins d'un sector, en files
function chairs(a0, a1, r0, r1, n) {
  if (!n) return '';
  const rows = Math.max(1, Math.round(Math.sqrt(n * (r1 - r0) / ((a1 - a0) * D2R * (r0 + r1) / 2))));
  const per = Math.ceil(n / rows), out = [];
  let k = 0;
  for (let i = 0; i < rows && k < n; i++) {
    const r = r0 + (r1 - r0) * (i + 0.5) / rows;
    const m = Math.min(per, n - k);
    for (let j = 0; j < m; j++, k++) {
      const a = a0 + (a1 - a0) * (j + 0.5) / m;
      const [x, y] = P(a, r);
      out.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="4.2"/>`);
    }
  }
  return `<g class="chairs">${out.join('')}</g>`;
}

/* ---------- mapa ---------- */
const svg = $('#orqMap');
let html = `<title>Mapa de l'orquestra simfònica vista des de dalt</title>
<path class="floor" d="M${CX - 590} ${CY + 30}A590 590 0 0 1 ${CX + 590} ${CY + 30}Z"/>
<path class="floor2" d="M${CX - 470} ${CY + 30}A470 470 0 0 1 ${CX + 470} ${CY + 30}Z"/>`;
for (const it of INSTR) {
  if (!it.seat) continue;
  const [a0, a1, r0, r1] = it.seat, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
  const [lx, ly] = P(am, rm);
  const narrow = (a1 - a0) * D2R * rm < 78;
  html += `<g class="seat" data-id="${it.id}" data-s="${it.s}" style="--c:var(${SUBS[it.s].color})" tabindex="0" role="button" aria-label="${it.name}: ${SUBS[it.s].fam.toLowerCase()} ${SUBS[it.s].sub.toLowerCase()}">
    <path d="${wedge(a0, a1, r0, r1)}"/>${chairs(a0 + 2, a1 - 2, r0 + 8, r1 - 8, it.n)}
    <text x="${f1(lx)}" y="${f1(ly)}" class="${narrow ? 'sm' : ''}">${it.short}</text></g>`;
}
// director
html += `<g class="podium"><circle cx="${CX}" cy="${CY}" r="34"/><text x="${CX}" y="${CY + 4}">Director</text></g>`;
// convidada: guitarra
const g = BY_ID.guitarra;
html += `<g class="seat guest" data-id="guitarra" data-s="pincada" style="--c:var(--c-pincada)" tabindex="0" role="button" aria-label="Guitarra: corda pinçada (convidada, no és de l'orquestra)">
  <rect x="872" y="566" width="156" height="62" rx="12"/><text x="950" y="592">${g.short}</text><text x="950" y="612" class="note">convidada</text></g>`;
svg.innerHTML = html;

/* ---------- fitxa ---------- */
const card = { box: $('#seatCard'), fam: $('#scFam'), name: $('#scName'), desc: $('#scDesc'), go: $('#scGo') };
let shown = null;
function show(id) {
  const it = BY_ID[id]; if (!it) return; shown = id;
  const S = SUBS[it.s];
  card.box.style.setProperty('--c', `var(${S.color})`);
  card.fam.textContent = `${S.fam} · ${S.sub}`;
  card.name.textContent = it.name;
  card.desc.textContent = it.desc;
  card.go.hidden = false;
  card.go.textContent = 'Entra-hi →';
  svg.querySelectorAll('.seat').forEach(s => s.classList.toggle('on', s.dataset.id === id));
}
const go = id => { location.hash = id; };
svg.querySelectorAll('.seat').forEach(s => {
  s.addEventListener('pointerenter', () => show(s.dataset.id));
  s.addEventListener('focus', () => show(s.dataset.id));
  s.addEventListener('click', () => go(s.dataset.id));
  s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(s.dataset.id); } });
});
card.go.addEventListener('click', () => shown && go(shown));

/* ---------- filtres per família ---------- */
const chips = document.querySelectorAll('#famFilter button');
chips.forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.f;
  chips.forEach(c => c.setAttribute('aria-pressed', String(c === b)));
  svg.querySelectorAll('.seat').forEach(s => {
    const off = f !== 'tots' && SUBS[s.dataset.s].fam !== f;
    s.classList.toggle('dim', off);
    s.setAttribute('tabindex', off ? '-1' : '0');
  });
  document.querySelectorAll('#orqList .lcard').forEach(c => { c.hidden = f !== 'tots' && SUBS[c.dataset.s].fam !== f; });
}));

/* ---------- llista per subfamílies ---------- */
const order = Object.keys(SUBS);
$('#orqList').innerHTML = order.map(k => {
  const its = INSTR.filter(i => i.s === k);
  return its.map(it => `<a class="lcard" href="#${it.id}" data-s="${k}" style="--c:var(${SUBS[k].color})">
    <span class="lsub">${SUBS[k].fam} · ${SUBS[k].sub}</span><span class="lname">${it.name}</span><span class="ldesc">${it.desc}</span></a>`).join('');
}).join('');

/* ---------- sorprèn-me ---------- */
$('#randomBtn').addEventListener('click', () => { const it = INSTR[Math.floor(Math.random() * INSTR.length)]; go(it.id); });

show('violi');
