# Creare e caricare una mascotte

Mascotte può mostrare altri personaggi oltre a Rosso. Una mascotte è una **cartella con due file**: `character.json` (la descrizione) e `sprites.png` (i disegni). Questa guida spiega come devono essere fatti, come crearli, come provarli e come caricarli nell'app.

In breve:

1. Disegni i fotogrammi in una griglia PNG (`sprites.png`): una riga per ogni stato (riposo, pensa, scrive…).
2. Descrivi la griglia in `character.json`: nome, misura di un fotogramma, quale riga e quali colonne usa ogni stato.
3. Provi la cartella nel visore (`viewer/`).
4. In Mascotte: **ingranaggio → Mascotte → Aggiungi mascotte…** e scegli la cartella.

## 1. Il formato del pacchetto

```
la-mia-mascotte/
├── character.json    obbligatorio
└── sprites.png       obbligatorio (si chiama proprio così)
```

Gli altri file nella cartella vengono ignorati: Mascotte copia solo questi due e non esegue mai nulla.

### `sprites.png`

Una griglia di fotogrammi tutti della stessa misura, con fondo trasparente.

- Ogni **riga** è un'animazione (uno stato), ogni **colonna** è un fotogramma di quella animazione.
- Larghezza del PNG = colonne × larghezza del fotogramma; altezza = righe × altezza del fotogramma. Devono essere multipli esatti.
- Fotogramma da 1 a 512 pixel per lato (Rosso è 32 × 32).
- Limiti del file: al massimo 16 MB e 8192 × 8192 pixel (e non oltre 33 milioni di pixel in tutto).
- Pixel art: niente sfumature, niente bordi sfocati. L'app ingrandisce senza ammorbidire.
- Il personaggio sta sul fondo del fotogramma (nei fotogrammi di Rosso tocca la riga più bassa), tranne quando salta o viene sollevato.

Esempio: Rosso ha fotogrammi 32 × 32, 15 righe e 6 colonne, quindi un PNG di 192 × 480 pixel.

### `character.json`

Esempio minimo (un solo stato, quello obbligatorio):

```json
{
  "format": "mascotte-pack/1",
  "id": "mio-gatto",
  "name": "Mio gatto",
  "author": "Il tuo nome",
  "license": "Solo uso personale",
  "scale": 4,
  "bubble": { "x": 16, "y": 7 },
  "sheet": "sprites.png",
  "frame": { "width": 32, "height": 32 },
  "animations": {
    "idle": { "row": 0, "frames": 4, "fps": 6 }
  }
}
```

Campi:

| Campo | Obbligatorio | Significato |
| --- | --- | --- |
| `format` | sì | Sempre `"mascotte-pack/1"`. |
| `name` | sì | Il nome che vedi nei menu. |
| `sheet` | sì | Sempre `"sprites.png"` per le mascotte personali. |
| `frame` | sì | `{ "width": …, "height": … }`: la misura di un fotogramma in pixel (1–512). |
| `animations` | sì | Le animazioni per stato (vedi sotto). Lo stato `idle` è obbligatorio. |
| `id` | consigliato | Nome interno: solo lettere minuscole, cifre e trattini (massimo 40 caratteri), per esempio `mio-gatto`. Se manca si usa il nome della cartella. Non può essere uguale a quello di un personaggio incluso nell'app (`rosso`) né di un'altra tua mascotte. |
| `author`, `license` | no | Testo libero. |
| `scale` | no | Grandezza iniziale, da 1 a 8 (predefinita 4). Si cambia poi da Impostazioni. |
| `bubble` | no | Punto del fotogramma (`x`, `y` in pixel) da cui parte il fumetto. Predefinito: centro, in alto. |
| `pixelRatio` | no | Intero da 1 a 8 per sprite disegnati più grandi del necessario: grandezza in punti = fotogramma × scala ÷ pixelRatio. Predefinito 1. |
| `fallbacks`, `perch` | no | Ripieghi propri e posa seduta sul bordo di una finestra o della barra: per usi avanzati, vedi [DESIGN.md](DESIGN.md). |

Il fotogramma ingrandito non può superare 2048 punti per lato: con fotogrammi grandi i valori di grandezza troppo alti non sono disponibili.

### Le animazioni

Ogni stato ha questa forma:

```json
"thinking": { "row": 3, "frames": 4, "fps": 3 }
```

- `row`: la riga del PNG (si parte da 0).
- `frames`: quanti fotogrammi, partendo dalla colonna 0 (`4` vale colonne 0, 1, 2, 3), **oppure** una lista di colonne per ripetere o tenere fermo un fotogramma, per esempio `[0, 0, 0, 1, 2, 1]`.
- `fps`: fotogrammi al secondo, da 1 a 30 (predefinito 8).
- `durations`: facoltativo, lista di millisecondi uno per fotogramma (come `frames`); sostituisce `fps`.
- `loop`: `false` per fermarsi sull'ultimo fotogramma (predefinito `true`).

### Gli stati

L'unico stato obbligatorio è **`idle`**. Gli altri sono facoltativi: se uno manca, Mascotte usa quello di ripiego indicato qui (e così via fino a `idle`). Il file `spec/states.json` è la fonte di questa tabella.

| Stato | Quando compare | Se manca usa |
| --- | --- | --- |
| `idle` | Riposo | (obbligatorio) |
| `sleep` | Nessuna attività da un po' | `idle` |
| `listening` | Hai appena scritto all'IA | `thinking` |
| `thinking` | L'IA sta ragionando | `idle` |
| `working` | L'IA usa uno strumento | `thinking` |
| `reading` | L'IA legge o cerca nei file | `working` |
| `writing` | L'IA scrive o modifica file | `working` |
| `running` | L'IA esegue un comando | `working` |
| `waiting` | Serve la tua attenzione | `idle` |
| `done` | L'IA ha finito | `idle` |
| `celebrate` | Successo (per esempio test passati) | `done` |
| `error` | Qualcosa è andato storto | `idle` |
| `talk` | Mostra una risposta nel fumetto | `idle` |
| `look` | Controllo visivo dello schermo | `thinking` |
| `drag` | La stai trascinando | `idle` |

Consiglio: parti da `idle`, `thinking`, `done` ed `error`; aggiungi gli altri quando ne hai voglia. Un pacchetto con tutti i quindici stati è il più bello da vedere. Per Rosso si è seguita la ricetta in [characters-src/ANIMAZIONI.md](characters-src/ANIMAZIONI.md): puoi riusarla come guida per ritmo e gesti.

## 2. Come crearlo

### Strada A: con `pixelkit` (i disegni sono testo)

È il metodo usato per Rosso. Servono Python 3 e Pillow (`pip install pillow`). Ogni fotogramma è una griglia di caratteri: ogni carattere è un colore della palette, il punto `.` è trasparente. Lo strumento `tools/pixelkit.py` assembla i fotogrammi, scrive `sprites.png` e `character.json` e genera anche un foglio di anteprima e una GIF per stato.

1. Copia la cartella `characters-src/Cat/rosso/` con un altro nome (per esempio `characters-src/Personali/mio-gatto/`: la cartella `characters-private/` è esclusa da Git e va bene per i personaggi che non vuoi pubblicare).
2. In `parts.py` ridisegna le parti e la `PALETTE`; in `animations.py` metti i fotogrammi di ogni stato (`ANIMATIONS`); in `build.py` cambia `id`, `name` e il percorso di uscita.
3. Esegui `python3 characters-src/…/build.py`: scrive la cartella con i due file e le anteprime in `work/previews/`.
4. Guarda `contact.png` (tutti i fotogrammi) e le GIF, correggi e ripeti.

Le regole di disegno di Rosso (massimo 6 fotogrammi distinti per stato, contorno sempre chiuso, nessun pixel isolato) sono spiegate in [characters-src/ANIMAZIONI.md](characters-src/ANIMAZIONI.md). Lo strumento è descritto nel commento all'inizio di `tools/pixelkit.py`.

### Strada B: a mano, con un editor di pixel art

Va bene qualsiasi programma (Aseprite, Piskel, Pixelorama, GIMP…).

1. Crea una tela larga (colonne × larghezza fotogramma) e alta (righe × altezza fotogramma), con fondo trasparente.
2. Disegna ogni animazione su una riga, un fotogramma per colonna, a partire dalla colonna 0. Usa guide o una griglia della misura del fotogramma per non sbagliare.
3. Esporta come **PNG** con trasparenza e chiamalo `sprites.png`. Non ridimensionare e non applicare filtri.
4. Scrivi `character.json` (modello nella sezione precedente) con la misura del fotogramma e, per ogni stato, la riga e i fotogrammi usati.
5. Metti i due file nella stessa cartella.

## 3. Provarlo nel visore

Il visore controlla il pacchetto con le stesse regole dell'app e mostra gli errori in italiano, con il punto esatto da correggere. Dalla cartella del progetto:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Apri <http://127.0.0.1:8765/viewer/> e trascina sulla pagina la cartella della mascotte (oppure i due file). Il visore mostra l'elenco dei controlli, il personaggio animato per ogni stato e il punto del fumetto. In alternativa apri `viewer/index.html` con un doppio clic e trascina la cartella.

Se il visore non segnala errori, anche l'app accetterà il pacchetto. L'app applica in più due regole: il foglio deve chiamarsi `sprites.png` e l'`id` deve essere composto da minuscole, cifre e trattini.

## 4. Caricarlo in Mascotte

1. Apri la micro chat e premi l'**ingranaggio** in alto a destra.
2. Apri la sezione **Mascotte** e premi **Aggiungi mascotte…**.
3. Scegli la cartella con `character.json` e `sprites.png`.

Mascotte controlla il pacchetto per intero **prima** di copiare qualcosa. Se è valido, copia i due file nella cartella dati dell'app (`characters/<id>/`, nella cartella dei dati di Mascotte: su Mac `~/Library/Application Support/Mascotte Electron`, su Windows `%LOCALAPPDATA%\Mascotte`); la cartella originale non viene toccata. Se qualcosa non va, vedi un messaggio che dice cosa correggere e non viene copiato nulla.

Poi la mascotte compare nel menu **Personaggio** (clic destro sulla mascotte, categoria «Personali») e nel selettore della sezione Mascotte. Da lì scegli anche la **grandezza di base**.

Per toglierla: **Rimuovi** accanto al suo nome, nella stessa sezione (se era quella in uso torna Rosso). Rosso non si può rimuovere.

Limiti: al massimo 30 mascotte personali; l'`id` non può coincidere con quello di Rosso né con un'altra tua mascotte; non sono ammessi collegamenti (link simbolici) al posto dei due file. Per correggere una mascotte già caricata, rimuovila e aggiungila di nuovo.

## Diritti d'autore e riservatezza

Carica solo personaggi disegnati da te o per i quali hai il permesso di chi li ha creati: non usare personaggi protetti da diritto d'autore (di fumetti, giochi, film…) senza autorizzazione. Le mascotte personali restano sul tuo computer, nella cartella dati dell'app, e **non vanno nel repository pubblico**: Mascotte non le invia da nessuna parte. Se vuoi tenerne i sorgenti nella repo, mettili in `characters-private/` (esclusa da Git).
