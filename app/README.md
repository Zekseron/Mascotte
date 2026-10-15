# Mascotte — app macOS (pezzo 2)

App nativa (Swift + AppKit) che mostra il personaggio animato in una finestra
trasparente, sempre in primo piano, in un angolo dello schermo. Riceve eventi locali da Claude Code e Codex tramite gli hook descritti in
[`../tools/README.md`](../tools/README.md). Gli stati si possono anche provare dal menu.
Nessuna dipendenza esterna. Richiede macOS 13 o successivo e i Command Line
Tools (Swift 6.x); non serve Xcode.

## Compilare e avviare

```sh
cd app
swift build                      # compila (debug)
swift run Mascotte               # avvia senza creare l'app
scripts/bundle.sh                # compila in release e crea build.noindex/Mascotte.app
open build.noindex/Mascotte.app          # avvia l'app vera (nessuna icona nel Dock)
```

`scripts/bundle.sh` si può lanciare da qualunque cartella: copia nelle risorse
`characters/` e `spec/states.json` del progetto, scrive l'`Info.plist`
(`local.mascotte.app`, versione 0.5, `LSUIElement`) e firma ad hoc.
Se l'app è già aperta, chiudila (menu ▸ Esci) prima di ricreare il pacchetto.

Controlli senza aprire finestre:

```sh
build.noindex/Mascotte.app/Contents/MacOS/Mascotte --self-test         # logica: esce con 0 (ok) o 1
build.noindex/Mascotte.app/Contents/MacOS/Mascotte --list-characters   # personaggi trovati e perché
```

`swift test` non è usato: con i soli Command Line Tools manca XCTest, per
questo i controlli sono dentro `--self-test`.

## Uso

### Personaggi e categorie (0.4)

**Personaggio → Cat → Rosso** seleziona il pacchetto pubblico in `characters/Cat/rosso`. Grandezza ricordata per personaggio.

### Aggancio a Dock e finestra

Il menu **Aggancio** offre **Libera / sgancia**, **Aggancia al Dock** e **Aggancia alla finestra attiva**. Porta la finestra desiderata in primo piano e usa il menu della zampa o il clic destro sulla mascotte. Segue posizione e dimensioni del bordo superiore; quando la finestra non è sul desktop corrente si nasconde, poi ritorna. Chiudere la finestra o trascinare la mascotte la sgancia. Solo l'aggancio al Dock viene ricordato al riavvio.

La posizione è limitata all'area visibile: sulle finestre massimizzate resta all'interno dello schermo. Dock laterale o automatico: usa il bordo inferiore dell'area utile, senza seguire le singole icone. Gli eventi IA continuano a cambiare stato.

Il tracker legge solo metadati geometrici locali con Quartz (ID, PID, rettangolo e visibilità); non cattura screenshot o contenuti delle finestre e non invia questi dati alle IA. Controlla cinque volte al secondo mentre l'aggancio è attivo e la mascotte è mostrata.

- **Trascina** il personaggio per spostarlo (durante il trascinamento è in
  stato `drag`; al rilascio torna allo stato di prima e la posizione viene
  ricordata). La prima volta sta in basso a destra dello schermo principale.
- **Clic** senza trascinare: apre la micro chat vicino al gattino. Puoi scegliere
  Claude o Codex, scrivere e inviare direttamente; Invio invia, Maiusc+Invio va
  a capo. Il menu offre anche **Apri micro chat**. Se dorme, il clic lo sveglia. **Clic destro** (o Ctrl+clic): lo stesso menu della barra.
- **Menu nella barra** (icona zampa): Personaggio, Grandezza (2×–6×), Prova uno
  stato (i 15 stati; se il personaggio non ne ha uno è indicato il ripiego),
  Mostra/Nascondi, Apri la cartella dei personaggi, Esci. Personaggio,
  grandezza, posizione e visibilità sono ricordati.
- **Tempi degli stati** (in `StateController.swift`): `idle` e `sleep` restano
  finché non cambia qualcosa; dopo 5 minuti di `idle` senza interazioni si passa
  a `sleep`; `done`, `error`, `talk` tornano a `idle` dopo 4 s; `celebrate` 1 s
  dopo la fine della sua animazione; gli altri 5 s.

## Dove mettere un personaggio personalizzato

Un personaggio è una cartella con `character.json` e il foglio sprite (formato
`mascotte-pack/1`, vedi `DESIGN.md`). Copiala in:

```
~/Library/Application Support/Mascotte/characters/<nome>/
```

(l'app crea la cartella al primo avvio; il menu ▸ Apri la cartella dei
personaggi la apre). Il personaggio compare nel menu alla prossima apertura,
senza riavviare. Gli elenchi sono unificati in quest'ordine, e con lo stesso
`id` vince il primo:

1. cartella indicata dalla variabile d'ambiente `MASCOTTE_CHARACTERS` (se impostata);
2. `~/Library/Application Support/Mascotte/characters/`;
3. `characters/` dentro l'app (`Contents/Resources/characters`).

Un `index.json` (`mascotte-index/1`) nella cartella, se c'è, dà solo l'ordine e il
predefinito. I pacchetti non validi sono ignorati e il motivo è nel log. Solo se
non si trova nessun personaggio, con `swift run` si prova `characters/` del
progetto (`MASCOTTE_ROOT` o il percorso da cui è stato compilato).

`states.json` si cerca in `Contents/Resources`, poi in `MASCOTTE_ROOT/spec`, poi
nel progetto; se manca c'è una copia incorporata (identica, la verifica `--self-test`).

## Log e impostazioni

- Log: `~/Library/Logs/Mascotte/mascotte.log`.
- Impostazioni: `defaults read local.mascotte.app`; per azzerarle
  `defaults delete local.mascotte.app` (con `swift run` il dominio è `Mascotte`).

## Eventi locali (pezzi 3–4)

Il server ascolta solo su `127.0.0.1:8766`, con `POST /event` autenticato.
Le credenziali locali sono in `~/Library/Application Support/Mascotte/events.json`
(con permessi `0600`), generate all’avvio e rimosse alla chiusura. Se la porta
è occupata, l’app continua a funzionare e segnala il problema nel log.

Un solo punto per cambiare stato: `StateController.set(_ state: String, source: String, hold: Hold = .automatic)`.
`hold` può essere `.automatic` (regole sopra), `.seconds(n)` o `.forever`.

## Limiti noti

- Solo macOS. Firma **ad hoc**: va bene sul Mac che l'ha compilata; su un altro
  Mac Gatekeeper chiederà conferma (non c'è notarizzazione).
- Le zone trasparenti lasciano passare i clic alle finestre sotto (si controlla
  il pixel sotto il cursore); serve che macOS consegni i movimenti del mouse,
  altrimenti la finestra resta cliccabile ovunque. Da verificare a mano.
- Sopra le app a tutto schermo e su tutte le scrivanie dipende dal
  comportamento di macOS per i pannelli non attivanti: da verificare a mano.
- Con più schermi la posizione si ricorda in coordinate globali; se lo schermo
  sparisce la finestra torna in basso a destra.
- Nessun controllo visivo dello schermo (pezzo 6), nessun avvio automatico (pezzo 9).

Verifica del ponte e del server (porta casuale, cartella temporanea, nessuna GUI):

```sh
cd ..
MASCOTTE_TEST_BINARY="$PWD/app/build.noindex/Mascotte.app/Contents/MacOS/Mascotte" \
  python3 -m unittest discover -s tools/test -v
```

## Micro chat

Richiede le CLI Claude Code e/o Codex già installate e autenticate. Usa il login
dei tuoi account, senza richiedere API key. Ogni invio usa il normale utilizzo
dell’IA scelta. Le impostazioni del modello restano quelle della rispettiva CLI.

- Le conversazioni Claude e Codex sono separate e continuano tramite il loro
  session ID. Chiudere e riaprire la finestrella conserva il contesto.
- **Nuova** avvia una conversazione nuova per la sola IA selezionata.
- **Interrompi**, chiudere la finestrella o uscire dall’app ferma una richiesta
  in corso. Una risposta bloccata viene interrotta dopo 3 minuti.
- Errori di accesso, limiti e altri errori sono mostrati nella chat; il messaggio
  resta nel campo di input per riprovare.
- La cronologia visualizzata (ultimi 60 messaggi per IA, massimo 8.000 caratteri
  per messaggio salvato) è in `~/Library/Application Support/Mascotte/chat/history.json`,
  con permessi `0600`; il file non supera 1 MiB. Le CLI conservano anche le proprie sessioni.
- I prompt passano su stdin, non negli argomenti del processo, e non sono scritti
  nel log di Mascotte. Claude non ha strumenti; Codex usa il sandbox read-only.

Test: `--self-test` aggiunge i controlli della micro chat, usando una CLI simulata
locale: nessuna richiesta o consumo dei modelli. La prova di risposta reale è lasciata
all’invio dell’utente.

Riferimenti: [Claude headless](https://code.claude.com/docs/en/headless),
[Codex non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode).
