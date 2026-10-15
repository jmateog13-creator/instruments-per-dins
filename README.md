# Instruments per dins

Web educativa en 3D per a 3r d'ESO: un instrument per cada subfamília. Es pot girar, desmuntar, tocar i recórrer en una visita guiada que ensenya com es produeix el so.

| Família | Subfamília | Instrument |
|---|---|---|
| Corda | Fregada | Violí |
| Corda | Pinçada | Guitarra |
| Corda | Percudida | Piano |
| Vent | Fusta | Flauta travessera |
| Vent | Metall | Trompeta |
| Percussió | Afinada | Xilòfon |
| Percussió | No afinada | Caixa |

Enllaç directe a un instrument: afegeix `#violi`, `#guitarra`, `#piano`, `#flauta`, `#trompeta`, `#xilofon` o `#caixa` al final de l'adreça.

## Executar-ho en local

Els mòduls ES no funcionen obrint l'`index.html` directament; cal un servidor:

```bash
python3 -m http.server 8765
```

i obrir <http://localhost:8765/>.

## Estructura

- `index.html` — pàgina, estils i interfície.
- `app.js` — motor comú (Three.js r160 des de jsDelivr): escena, càmera, etiquetes, despiece, visita guiada, partícules d'aire, ones i síntesi de so.
- `inst/*.js` — un mòdul per instrument.
- `SPEC.md` — especificació per afegir instruments nous.

Models simplificats: les vibracions estan exagerades i a càmera lenta perquè es vegin.
