# Instruments per dins

Web educativa en 3D per a 3r d'ESO: 21 instruments de l'orquestra, ordenats per família i subfamília. Es pot girar, desmuntar, tocar i recórrer en una visita guiada que ensenya com es produeix el so.

| Família | Subfamília | Instruments |
|---|---|---|
| Corda | Fregada | Violí, Viola, Violoncel, Contrabaix |
| Corda | Pinçada | Guitarra, Arpa |
| Corda | Percudida | Piano |
| Vent | Fusta | Flauta travessera, Clarinet, Oboè, Fagot |
| Vent | Metall | Trompeta, Trompa, Trombó de vares, Tuba |
| Percussió | Afinada | Xilòfon, Timbals |
| Percussió | No afinada | Caixa, Bombo, Plats, Triangle |

Enllaç directe a un instrument: afegeix `#` i el nom del fitxer de `inst/` al final de l'adreça (per exemple `#violoncel`, `#trombo`, `#timbals`).

## Executar-ho en local

Els mòduls ES no funcionen obrint l'`index.html` directament; cal un servidor:

```bash
python3 -m http.server 8765
```

i obrir <http://localhost:8765/>.

## Estructura

- `index.html` — pàgina, estils i interfície (portada, mapa de l'orquestra i visor 3D).
- `cataleg.js` — llista d'instruments: família, subfamília, descripció i lloc a l'orquestra.
- `orquestra.js` — portada i mapa de l'orquestra per triar instrument.
- `app.js` — motor comú (Three.js r160 des de jsDelivr): escena, càmera, etiquetes, despiece, visita guiada, partícules d'aire, ones i síntesi de so.
- `inst/*.js` — un mòdul per instrument.
- `SPEC.md` — especificació per afegir instruments nous.

Models simplificats: les vibracions estan exagerades i a càmera lenta perquè es vegin.
