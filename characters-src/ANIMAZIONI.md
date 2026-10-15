# Ricetta delle animazioni

Vale per tutti i gattini (Rosso, Fumo, Biscotto): stessi stati, stesso
significato, stesso ritmo indicativo. Ogni gattino interpreta la ricetta con
le proprie parti, ma chi passa da un personaggio all'altro deve ritrovare gli
stessi gesti.

## Regole comuni

- Fotogramma 32×32. Il gattino tocca la riga 31, tranne nei salti
  (`celebrate`) e quando è sollevato (`drag`).
- Massimo **6 fotogrammi distinti** per stato. Per tenere fermo un
  fotogramma o ripeterlo si usa `sequence` (non si duplica la griglia).
- Gli effetti vengono da `characters-src/common/effects.py` (`EFFECTS`,
  `dots(n)`, `add_effect`) e stanno soprattutto nelle righe 0-7, sopra la
  testa, di solito a destra (a sinistra se la coda o la posa lo richiede).
  Possono sovrapporsi di poco alla testa, mai coprire gli occhi.
- Gli oggetti di scena (portatile, libro, foglio e matita, lente) si
  disegnano nello stile del gattino con le cifre di `EFFECT_PALETTE`
  (`7` vetro/schermo, `8` carta, `9` e `0` grigi) e il contorno `o`; stanno
  davanti alle zampe, nella parte bassa del fotogramma.
- Niente pixel isolati, contorno sempre chiuso, nessun "doppio contorno".
- Movimento minimo ma leggibile: meglio 1 px netto che 3 px confusi.

## Stati

| Stato | Idea | Fotogrammi | Ritmo | Loop |
| --- | --- | --- | --- | --- |
| `idle` | Seduto tranquillo; ammicca di rado, coda che si muove, respiro | quelli di `IDLE_FRAMES` (si possono migliorare) | 6 fps, `sequence` lunga con l'ammiccare raro | sì |
| `sleep` | Occhi chiusi, respiro lento (`body_dy` 0/1), coda bassa; una `z_s` e poi una `z_l` che salgono e spariscono | 4 | durate ~600 ms | sì |
| `listening` | Attento: occhi `wide`, orecchie che fremono (`twitch` alternato a `up`) | 2-3 | 6 fps | sì |
| `thinking` | Sguardo verso l'alto o di lato (`look_left`/`look_right`), puntini che compaiono uno alla volta: `dots(1)`, `dots(2)`, `dots(3)` | 4 | 3 fps | sì |
| `working` | Davanti a un piccolo portatile (schermo acceso `7`), zampe che battono sui tasti alternate, occhi concentrati (`half` o `open`) | 4 | 8 fps | sì |
| `reading` | Con un libro aperto davanti; occhi che scorrono da sinistra a destra; una pagina che si gira | 4-6 | 4 fps | sì |
| `writing` | Con un foglio e una matita in zampa; la matita si muove; espressione concentrata (bocca `o` o lingua fuori se c'è) | 4 | 6 fps | sì |
| `running` | Eseguendo un comando: occhi `wide` decisi, coda alta, piccolo saltello del corpo (`body_dy`), `bolt` che lampeggia sopra | 4 | 8 fps | sì |
| `waiting` | Ti chiama: una zampa anteriore sollevata bassa (`raised`), coda ferma, bocca `open` (miagola), `exclaim` sopra che rimbalza di 1 px | 4 | 6 fps | sì |
| `done` | Contento: occhi `happy`, bocca `smile`, guance rosa se disponibili, coda alta che ondeggia, una `sparkle_s` che pulsa | 4 | 6 fps | sì |
| `celebrate` | Salto di gioia: accovacciato (`body_dy` 1) → in aria (tutto il gattino 3-4 px più su) con `sparkle_l` e `heart` → atterraggio → posa felice finale con stelline. Le anteriori alzate sostituiscono quelle a terra, senza zampe duplicate. | 6 | 10 fps | **no** (resta sulla posa felice) |
| `error` | Spaventato: occhi `x` o `wide`, bocca `frown`, coda gonfia/dritta, `sweat` accanto alla testa; tremolio orizzontale di 1 px | 4 | 10 fps | sì |
| `talk` | Parla: bocca che si apre e chiude (`open`, `none`, `o`, `none`), occhi aperti, un ammicco ogni tanto | 4 | 6 fps | sì |
| `look` | Controllo visivo: tiene una lente d'ingrandimento davanti a un occhio (vetro `7`), lo sguardo si sposta | 4 | 4 fps | sì |
| `drag` | Preso in braccio: sollevato di 2-3 px (i piedi non toccano), occhi `wide`, bocca `o`, coda giù; oscilla di 1 px a destra e sinistra | 2-4 | 6 fps | sì |

## Consegna per ogni gattino

```
characters-src/<id>/
├── parts.py        # la funzione kitten(...) e la PALETTE (unita a EFFECT_PALETTE)
├── animations.py   # ANIMATIONS = {stato: {"frames": [...], "sequence": [...]?, "fps": n?, "durations": [...]?, "loop": bool?}}
└── build.py        # build(out_root, preview_root): scrive il pacchetto e le anteprime
```

`build.py` chiama `pixelkit.build_pack(out_root / "<id>", ...)` con
`meta = {"id", "name", "author": "Mascotte", "scale": 4, "bubble": {...}}`
e `preview_dir = preview_root / "<id>"`, quindi produce `character.json`,
`sprites.png`, `contact.png` e una GIF per stato.
