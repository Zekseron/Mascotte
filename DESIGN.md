# Mascotte — documento di progetto

Una piccola mascotte che vive in un angolo dello schermo:

- **reagisce** con animazioni a quello che fanno Claude Code e Codex, senza
  interpellare nessuna IA (solo eventi, quindi nessun consumo);
- **su richiesta** fa una domanda al volo o un controllo visivo di una parte
  dello schermo, usando Claude o Codex;
- ha un **aspetto intercambiabile**: il personaggio è un pacchetto (una
  cartella con un'immagine e un file di descrizione) che chiunque può
  sostituire con il proprio.

## Scelte tecniche

| Parte | Scelta | Perché |
| --- | --- | --- |
| App | Swift + AppKit, compilata con Swift Package Manager | Swift 6.4 è già sul Mac (Command Line Tools): niente da installare. Tauri richiederebbe Rust, assente. App leggera, accesso diretto a finestre trasparenti, scorciatoie globali e screenshot. Limite: solo macOS. |
| Personaggi | Pacchetto `mascotte-pack/1`: `character.json` + `sprites.png` | Indipendente dall'app e da come è stato disegnato: va bene un foglio sprite fatto con Aseprite, Piskel, Photoshop o con i nostri script. |
| Disegno del gattino | Python + Pillow (`tools/pixelkit.py`) | Il gattino è scritto come testo, pixel per pixel: si legge, si modifica e si rigenera con un comando. |
| Prova dei pacchetti | Pagina HTML (`viewer/`) | Per vedere e validare un personaggio senza avviare l'app. |

## Pezzi

1. **Fondamenta (fatto)**: formato del pacchetto, Rosso in pixel art, visore.
2. **App (fatto)**: finestra trasparente sempre in primo piano, trascinabile, che anima
   il personaggio; menu per scegliere il personaggio e la grandezza.
3. **Eventi (fatto, attivo)**: server locale autenticato
   (solo `127.0.0.1`) + hook di Claude Code.
4. **Codex (fatto, attivo)**: hook stabili e script ponte
   su `notify` che continua ad avvisare anche Codex Computer Use.
5. **Micro chat (fatto)**: clic sul gattino o menu → finestra compatta,
   scelta Claude/Codex, input e conversazione tramite `claude -p` o `codex exec`.
   Sessioni separate per IA, cronologia locale, Nuova chat e Interrompi.
6. **Controllo visivo**: selezione di un'area → screenshot → domanda all'IA →
   esito nel fumetto.
7. **Server MCP**: le IA comandano la mascotte (reagisci, di', screenshot).
8. **Da immagine a personaggio**: `tools/da_immagine.py` fa la prima bozza
   automatica da un'immagine (ritaglio, sfondo rimosso se uniforme,
   riduzione a 32×32 o 48×48, palette di circa 10 colori, contorno) e la
   scrive come griglia di testo di `pixelkit`; poi si ritocca a mano, si
   divide in parti e si animano gli stati come per il gattino. Rende più
   facile anche ad altri creare il proprio personaggio.
9. **Rifiniture**: più sessioni insieme, modalità concentrazione, avvio
   automatico, import diretto da Aseprite.

## Stati

L'app traduce gli eventi in uno di questi stati. L'elenco completo, con le
regole di ripiego, è in [`spec/states.json`](spec/states.json): è la fonte
unica per app e visore.

| Stato | Quando | Se il personaggio non lo ha, usa |
| --- | --- | --- |
| `idle` | Riposo | — (**obbligatorio**) |
| `sleep` | Nessuna attività da un po' | `idle` |
| `listening` | Hai appena scritto all'IA | `thinking` |
| `thinking` | L'IA sta ragionando | `idle` |
| `working` | L'IA usa uno strumento | `thinking` |
| `reading` | Legge o cerca nei file | `working` |
| `writing` | Scrive o modifica file | `working` |
| `running` | Esegue un comando | `working` |
| `waiting` | Serve la tua attenzione (permesso, domanda) | `idle` |
| `done` | L'IA ha finito il turno | `idle` |
| `celebrate` | Successo esplicito (es. test passati) | `done` |
| `error` | Qualcosa è andato storto | `idle` |
| `talk` | Mostra un fumetto con una risposta | `idle` |
| `look` | Sta facendo un controllo visivo | `thinking` |
| `drag` | La stai trascinando | `idle` |

Il ripiego è a catena: un personaggio con il solo `idle` funziona già, e
ogni animazione in più lo rende più espressivo. Quanto dura uno stato lo
decide l'app (per esempio `done` per qualche secondo, poi `idle`).

## Formato del pacchetto `mascotte-pack/1`

```
characters/<id>/
├── character.json
└── sprites.png
```

`sprites.png` è una griglia di fotogrammi tutti della stessa misura, con
sfondo trasparente. Ogni animazione occupa una riga.

```json
{
  "format": "mascotte-pack/1",
  "id": "gattino",
  "name": "Gattino",
  "author": "Nome Cognome",
  "license": "CC-BY-4.0",
  "sheet": "sprites.png",
  "frame": { "width": 32, "height": 32 },
  "scale": 4,
  "bubble": { "x": 16, "y": 6 },
  "animations": {
    "idle":  { "row": 0, "frames": [0, 0, 0, 1, 0, 2], "fps": 6 },
    "done":  { "row": 5, "frames": 6, "fps": 10, "loop": false },
    "sleep": { "row": 1, "frames": 2, "durations": [900, 900] }
  },
  "fallbacks": { "celebrate": "talk" }
}
```

| Campo | Obbligatorio | Significato |
| --- | --- | --- |
| `format` | sì | Sempre `"mascotte-pack/1"`. |
| `name` | sì | Nome mostrato nell'app. |
| `id`, `author`, `license` | no | Identificativo (default: nome della cartella), autore, licenza. |
| `sheet` | sì | Nome del PNG, relativo alla cartella. |
| `frame.width`, `frame.height` | sì | Misura di un fotogramma, da 1 a 512 pixel per lato. Il PNG deve esserne un multiplo. |
| `scale` | no | Ingrandimento suggerito, intero da 1 a 8 (default 4). Il fotogramma ingrandito non può superare 2048 punti per lato. L'utente può cambiarlo entro questi limiti. |
| `bubble` | no | Punto del fotogramma, in pixel, da cui parte il fumetto (default: centro in alto). |
| `animations` | sì | Una voce per stato; `idle` è obbligatorio. |
| `animations.<stato>.row` | sì | Riga del foglio sprite (da 0). |
| `animations.<stato>.frames` | sì | Un numero N (colonne da 0 a N-1) oppure una lista di colonne, per ripetere o tenere fermi dei fotogrammi senza duplicarli. |
| `animations.<stato>.fps` | no | Fotogrammi al secondo, 1–30 (default 8). |
| `animations.<stato>.durations` | no | Durata in millisecondi di ogni voce di `frames`; se c'è, prevale su `fps`. |
| `animations.<stato>.loop` | no | `true` di default; `false` = suona una volta e resta sull'ultimo fotogramma. |
| `fallbacks` | no | Sostituisce il ripiego predefinito di alcuni stati. |

Regole di validazione: stati sconosciuti e campi in più vengono ignorati con
un avviso (compatibilità futura); colonne o righe fuori dal foglio sono
errori; un pacchetto senza `idle` non si carica.

L'app limita `character.json` a 256 KiB e il PNG a 16 MiB, 8192 pixel per
lato e 32 megapixel totali prima di decodificarlo. I file, anche se sono link simbolici, devono
risolversi dentro la cartella del pacchetto.

### Indice dei personaggi `mascotte-index/1`

`characters/index.json` elenca i pacchetti disponibili, per il selettore del
visore e dell'app. Lo genera `tools/build_all.py`.

```json
{
  "format": "mascotte-index/1",
  "default": "rosso",
  "characters": [
    { "id": "rosso", "name": "Rosso", "path": "Cat/rosso/" },
    { "id": "fumo", "name": "Fumo", "path": "fumo/" },
    { "id": "biscotto", "name": "Biscotto", "path": "biscotto/" }
  ]
}
```

`path` è relativo a `characters/`, senza `..`, e termina con `/`. Se
`default` non corrisponde a nessun id si usa il primo personaggio.

Consigli per chi disegna un personaggio:

- un **contorno scuro** (non nero puro) lo rende visibile su sfondi chiari e
  scuri, perché la finestra è trasparente;
- lascia qualche riga libera **in alto** per effetti come `z`, `!`, `?`;
- tieni il personaggio **appoggiato al bordo inferiore** del fotogramma, così
  non "salta" quando cambia stato.

## Estensioni compatibili per pose (0.4 Mac / 0.5 Windows)

Le cartelle possono essere raggruppate in una categoria: `characters/Cat/rosso`
e altre cartelle `characters/<categoria>/<id>`. Gli ID non cambiano; index.json contiene path relativo
e category per ogni voce. Il loader Mac riconosce anche i pacchetti piatti precedenti.

- `animations.<stato>.frameRows`: lista opzionale di righe, stessa lunghezza di
  frames, ogni valore intero dentro il foglio. Prevale sulla row comune per quel
  fotogramma. Permette una sequenza lunga senza un atlas troppo largo.
- `perch`: opzionale, `{animation: {row,frames,frameRows,fps,loop}, anchor: {x,y}}`.
  L’animazione segue le stesse regole delle altre. Anchor è il bacino in pixel
  del fotogramma, coordinate dall’alto; deve restare dentro il fotogramma.
  L’app sceglie questa posa quando è agganciata e torna alla posa di stato allo
  sgancio. Le vecchie app ignorano queste estensioni: aggiornare il runtime insieme
  a pacchetti con pose aggiuntive. Rosso non usa queste estensioni.

- `perch.singing`: animazione opzionale validata con le stesse regole di `animation`.
  Se presente abilita il comando manuale «Canta sul bordo», solo mentre la mascotte
  è agganciata. Un secondo clic o lo sgancio lo disattiva; non cambia gli stati IA
  e non attiva acquisizione audio. Assente nei vecchi pacchetti: si usa la idle seduta.

- `pixelRatio`: opzionale, intero 1–8 (default 1). I pixel dello sprite restano
  invariati; grandezza in punti = frame × scala / pixelRatio. Per esempio, un frame alto 448 con pixelRatio=4 misura 112 punti a 1×. Rosso resta pixelRatio=1.
