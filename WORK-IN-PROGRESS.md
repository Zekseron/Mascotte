# Mascotte — lavoro in corso e idee

Ultimo aggiornamento: 28 ottobre 2026.

Questo file è il promemoria condiviso per riprendere il progetto anche da un altro PC. Le idee sotto sono da progettare e implementare: non descrivono funzioni già disponibili. Aggiungere qui le nuove proposte, aggiornando stato, decisioni e prossimo passo.

**Richiamo permanente Windows → Mac:** ogni nuova funzione o modifica Windows deve comportare, nello stesso intervento, la revisione della checklist nella sezione [5. Aggiornamento Mac e allineamento con Windows](#5-aggiornamento-mac-e-allineamento-con-windows). Integrare i passi necessari, riaprire quelli già completati se cambia il requisito e annotare le eccezioni motivate. La regola è riportata anche in [AGENTS.md](AGENTS.md), per ritrovarla nelle prossime sessioni di sviluppo.

## Punto di partenza

- Base: commit `d7ca112`, versione Windows 0.8.0.
- IA locale tramite Ollama: Qwen3 1.7B, 4B Instruct (predefinito) e 8B scaricabili da Gestione, con verifica tecnica e avviso hardware per l'8B. **Su Mac il catalogo è diverso** (eccezione motivata, scelta dell'utente per l'hardware Mac da 16 GB di memoria condivisa): `gemma4:e4b` predefinito, `qwen3.5:2b` leggero, `qwen3.5:9b` pesante, tutti multimodali. Windows non richiede porting inverso: il catalogo per piattaforma sta in `windows/lib/local-ai.cjs`.
- Memoria locale tramite note esplicite e recupero per parole in comune; non è addestramento del modello.
- Ogni invio a Codex o Claude richiede conferma dell'utente. Mantenere questa scelta nelle evoluzioni future.
- Le azioni attuali sul PC sono limitate ad aprire Calcolatrice e Download, con conferma ogni volta.
- L'osservazione permette ora di allegare e confermare singoli fotogrammi anche ai modelli locali Qwen3-VL 2B e 4B Instruct. Il 2B e stato provato realmente su CPU (vedi windows/REPORT-VISIONE-LOCALE.md). Nessun controllo automatico delle finestre e ancora disponibile.
- Modelli, runtime scaricati, chat e note personali non sono nel repository. Su un nuovo PC vanno predisposti separatamente.

## 1. Integrazione di llama.cpp

**Stato:** proposta, non iniziata.

**Obiettivo:** valutare un motore locale gestito direttamente da Mascotte, come alternativa a Ollama, con configurazione semplice su un nuovo PC.

Da fare:

- [ ] Definire un'interfaccia comune per i motori locali: disponibilità, modello, generazione, interruzione ed errori, preservando chat e memoria.
- [ ] Realizzare un prototipo con il server locale di llama.cpp, avviato e chiuso da Mascotte, senza richiedere compilazione all'utente.
- [ ] Definire download e verifica di runtime e modelli GGUF compatibili, licenze e aggiornamenti. Conservare i file nella cartella dati utente, fuori da Git.
- [ ] Verificare CPU e accelerazione GPU su Windows, inclusa NVIDIA RTX 5050; misurare tempi, RAM e VRAM a parità di modello e impostazioni rispetto a Ollama.
- [ ] Decidere, sulla base delle prove, se offrire entrambi i motori oppure proporre una migrazione. Non rimuovere Ollama senza una decisione esplicita.

**Primo passo:** prototipo isolato con un modello già supportato e una richiesta testuale, usando solo localhost.

**Criterio di completamento:** installazione su PC pulito, download del modello, chat, annullamento e chiusura del processo funzionanti; errori comprensibili e dati personali preservati. Documentare i risultati prima di scegliere il motore predefinito.

Punti del codice da cui partire: `windows/lib/local-ai.cjs`, `windows/main.cjs`, `windows/renderer/chat.js`.

## 2. Interazione con le finestre osservate

**Stato:** proposta, non iniziata.

**Obiettivo:** permettere alla mascotte di svolgere operazioni nella finestra scelta dall'utente, con conferma delle azioni.

**Primo caso concreto:** mentre l'utente lavora in Cisco Packet Tracer, chiedere alla mascotte di esportare in un file la configurazione dello switch configurato nell'esercizio.

Da chiarire durante la progettazione:

- Quale switch e quale configurazione esportare: corrente, salvata o entrambe; formato e destinazione del file.
- Come accedere ai dati: valutare prima interfacce accessibili o funzioni di esportazione dell'app, poi eventuale automazione di tastiera e mouse. Non presumere l'esistenza di un'API Packet Tracer.
- Quando servono OCR o un modello con capacità visive. I modelli Qwen3-VL sono ora disponibili per analizzare singoli fotogrammi; i modelli testuali restano senza visione. Va verificata l'affidabilita delle letture sul programma concreto.
- Quali passaggi possono restare deterministici e quali richiedono interpretazione del modello.

Da fare:

- [ ] Preparare un esercizio Packet Tracer di prova, senza dati personali, e documentare la procedura manuale di esportazione.
- [ ] Progettare un piano di azioni visibile: finestra, dispositivo, operazioni e file di destinazione; chiedere conferma prima di eseguirlo.
- [ ] Limitare l'automazione alla finestra scelta, ricontrollando che sia ancora quella prevista. Prevedere arresto immediato e gestione degli imprevisti.
- [ ] Realizzare il primo flusso per un solo switch. Chiedere conferma prima di sovrascrivere file o modificare la configurazione del dispositivo.
- [ ] Verificare che il file esportato contenga la configurazione effettiva, confrontandolo con l'esportazione manuale. Segnalare risultati incompleti senza inventare le parti mancanti.
- [ ] Mantenere elaborazione e dati sul PC quando possibile; se occorre Codex o Claude, mostrare cosa sarà inviato e chiedere ogni volta conferma.

**Primo passo:** analisi della procedura manuale su Packet Tracer e scelta del metodo di accesso alla configurazione. Il prototipo deve leggere/esportare senza cambiare le impostazioni dello switch.

**Criterio di completamento:** su un esercizio di prova, l'utente seleziona finestra e switch, approva il piano e ottiene un file fedele alla configurazione; annullamento, finestra sbagliata e file già esistente sono gestiti correttamente.

Punti del codice da cui partire: `windows/lib/capture.cjs`, gestione osservazione e azioni in `windows/main.cjs`, `windows/renderer/chat.js`.

## 3. Strumenti di automazione per processi semplici

**Stato:** da progettare. Estende il caso Packet Tracer della voce 2 a procedure riutilizzabili in altre applicazioni.

**Obiettivo:** permettere a Mascotte di eseguire compiti richiesti dall'utente, utilizzando strumenti controllati anziché affidarsi soltanto alla descrizione di una schermata.

- [ ] Definire strumenti per leggere i controlli della finestra, selezionare elementi, digitare testo ed esportare file; valutare accessibilità Windows prima delle coordinate del mouse.
- [ ] Introdurre un catalogo di procedure per compiti concreti, con condizioni iniziali, passaggi e verifica del risultato.
- [ ] Mostrare piano, finestra interessata e file coinvolti; richiedere conferma prima dell'esecuzione, con possibilità di interrompere.
- [ ] Fermarsi se cambia la finestra prevista, manca un controllo o il risultato non coincide con quello atteso. Richiedere una nuova conferma se il piano cambia.
- [ ] Salvare una procedura riuscita come proposta riutilizzabile soltanto dopo la revisione dell'utente.

**Primo passo:** realizzare una procedura limitata di lettura/esportazione su una finestra di prova, senza modificare la configurazione dell'applicazione.

**Criterio di completamento:** esecuzione confermata, risultato verificabile, annullamento funzionante e nessuna azione su finestre diverse da quella scelta. La lettura di testo e documenti deve restare distinta dalle istruzioni autorizzate dall'utente.

## 4. Collegamento ad altre IA e secondo parere sulle schermate

**Stato:** integrazione parziale esistente; da aggiungere il passaggio diretto dalla risposta locale al secondo parere con immagine.

**Obiettivo:** consentire all'utente di chiedere aiuto a Codex o Claude quando il modello locale non basta, includendo un fotogramma scelto e il contesto necessario.

- [ ] Aggiungere “Chiedi un secondo parere su questa schermata” alle risposte locali, mantenendo anche l'invio del solo testo.
- [ ] Chiedere un nuovo fotogramma o conservarlo temporaneamente per il secondo parere con una durata e una cancellazione definite; oggi le immagini non sono conservate nella cronologia.
- [ ] Mostrare servizio destinatario, domanda, immagine e contesto prima di ogni invio; consentire modifica o annullamento. Nessun passaggio remoto automatico senza conferma.
- [ ] Usare le sessioni Codex/Claude avviate da Mascotte e chiarire l'utilizzo dell'account remoto; non presumere un collegamento automatico a questa conversazione di sviluppo.
- [ ] Consentire di salvare una nota verificata dalla risposta remota soltanto dopo revisione dell'utente; non trattarla come addestramento automatico.
- [ ] Rendere il secondo parere sempre richiedibile dall'utente, senza dipendere dalla capacità del modello locale di riconoscere i propri errori.

**Primo passo:** collegare la conferma esistente di invio dei fotogrammi al pulsante di approfondimento locale, mantenendo isolati memoria e cronologie non selezionate.

**Criterio di completamento:** immagine e testo inviati solo dopo conferma al destinatario scelto, risposta mostrata, annullamento senza invio e rimozione dei dati temporanei. Verificare inizialmente con servizi simulati.

**Osservazione dalle prove:** il Qwen3-VL 2B ha risposto erroneamente a due domande Cisco, con spiegazioni sicure ma inesatte. La prova sintetica di lettura dell'immagine non dimostra affidabilità tecnica: distinguere riconoscimento visivo e correttezza della risposta.

## 5. Aggiornamento Mac e allineamento con Windows

**Stato:** passi 1–6 completati. In corso: estensione delle azioni locali (frasi naturali e apertura di altre app), poi passo 7 (osservazione e fotogrammi). Il passo 1 ha fissato le scelte: base Electron, solo Apple Silicon, nessuna notarizzazione, migrazione dei dati con backup.

**Obiettivo:** rendere disponibili su Mac le funzioni attuali di Windows, mantenendo il piano aggiornato quando Windows evolve. La base Mac nativa esiste già in `app/`: personaggio, animazioni, aggancio al Dock e alle finestre, eventi e micro chat Claude/Codex.

**Scelta tecnica (decisa al passo 1, 28 ottobre 2026):** la base Electron di `windows/` viene usata anche su macOS, in modo da condividere il codice. L'app nativa Swift non viene più sviluppata e resta come riferimento fino al collaudo.

**Stima iniziale indicativa:** 3–5 giornate con la base Electron condivisa, oppure 6–10 giornate mantenendo Swift, con accesso a un Mac per compilazione e prove. Da rivedere dopo il primo passo e ogni ampliamento del perimetro. Le proposte delle sezioni 1–4 non ancora implementate non sono incluse nella stima.

### Passi da eseguire in ordine

- [x] **1. Fotografare le differenze e scegliere la base.** Confrontare il comportamento Windows corrente con `app/`, registrare versione/commit di riferimento e decidere Electron condiviso o Swift. Definire versioni macOS e architetture da supportare (Apple Silicon e, se previsto, Intel), disponibilità del Mac di prova e criteri di parità.
  - **Analisi del 28 ottobre 2026 (commit `a976df3`, Windows 0.8.0, Mac Swift 0.5).** Fatta su Mac Apple Silicon con macOS 27.0.1.
    - **Verifiche eseguite:**
      - `swift build` riuscito e `--self-test` con 149 verifiche, nessuna fallita.
      - Test in `tools/test` e `viewer/test` superati.
      - `npm test` in `windows/` su macOS: 35 test su 37 superati.
      - Ollama e la CLI Codex non sono installati su questo Mac; c'è la CLI Claude.
    - **Confronto delle funzioni.**
      - Già presenti su Mac: personaggi, animazioni, menu, aggancio al Dock e alla finestra attiva (con `CGWindowList`), server eventi, chat Claude/Codex.
      - Il protocollo eventi è identico: porta 8766, `POST /event`, token Bearer, `events.json`.
      - La chat Mac però invia senza conferma.
      - Assenti su Mac: IA locale Ollama con modelli testuali e visivi, note di memoria, azioni locali, osservazione con fotogrammi, gestione hook dall'app (oggi solo `configura-eventi.py`), scheda Gestione, aggiornamenti.
    - **Base proposta: Electron condiviso.** Circa il 75–80% di `windows/` è già indipendente dal sistema.
      - Parti da adattare: `window-helper.ps1`, `hookCommand` (PowerShell) in `lib/setup.cjs`, updater e installer, percorso della Calcolatrice, link di download Ollama, assenza di un target mac in `package.json`.
      - Vanno rivisti i 13 controlli `process.platform === 'win32'` in `main.cjs`.
      - La logica `CGWindowList` di `AttachmentController.swift` può diventare un piccolo helper che emette lo stesso JSON di `window-helper.ps1`.
    - **Problemi Mac nel codice Windows.**
      - `assertRegularPath` in `lib/storage.cjs` rifiuta qualsiasi link negli antenati del percorso. Su macOS `/var` è un link a `/private/var`, e per questo fallisce il test della memoria locale.
      - Il test di `installationDirectory` in `updater.test.cjs` fallisce per lo stesso motivo.
      - Su macOS i dati finirebbero in `userData/Windows-preview`, separati da quelli della vecchia app: vedi passo 9.
    - **Difetti dell'app Swift** (non correggerli se si adotta Electron; tenerne conto nel collaudo):
      - manca `NSApp.mainMenu`, quindi i comandi Cmd+C/V/A/Z nella chat sono probabilmente assenti (non provato a mano);
      - Interrompi e timeout non chiudono i processi nipoti (controllo `getpgid` in `ChatClient.swift`);
      - il server eventi si ferma sullo stato `.waiting` e non ha una porta di ripiego.
    - **Decisioni del 28 ottobre 2026:**
      - **Base:** Electron condiviso con `windows/`. L'app Swift in `app/` resta come riferimento fino al collaudo di parità; la sua logica di rilevamento finestre diventa l'helper Mac per l'aggancio.
      - **Architetture:** solo Apple Silicon (arm64). Intel resta escluso finché non c'è un Mac Intel per le prove.
      - **Distribuzione:** firma ad hoc, senza notarizzazione. Su altri Mac il primo avvio va autorizzato a mano; documentarlo nelle guide (passo 12).
      - **Dati della vecchia app:** migrazione con backup da `~/Library/Application Support/Mascotte` (impostazioni da UserDefaults `local.mascotte.app` e `chat/history.json`); dettagli nel passo 9.
      - **Criteri di parità:** sono comprese tutte le funzioni Windows 0.8.0 del «Punto di partenza». Al posto della barra delle applicazioni c'è il Dock, e l'aggancio alla finestra attiva usa l'helper Mac. Restano escluse, perché esclusive di Windows, l'installer NSIS e l'avvio del runtime Ollama gestito (`ollama.exe`): su Mac si guida l'utente a installare Ollama, a meno di una decisione diversa al passo 5.
- [x] **2. Preparare avvio e struttura del codice.** Separare le funzioni comuni dagli adattatori Windows/macOS; adattare percorsi, ricerca delle CLI, risorse e avvio dei processi. Se si sceglie Electron, predisporre build e identificativo Mac senza sovrascrivere la vecchia app o i suoi dati durante le prove. Verificare avvio e chiusura sul Mac.
  - **Eseguito il 28 ottobre 2026 su Mac Apple Silicon, macOS 27.0.1.** Il passo è completato.
    - **Dati:** su Mac la cartella è `~/Library/Application Support/Mascotte Electron` (override `MASCOTTE_DATA_DIR` o `MASCOTTE_WINDOWS_DATA_DIR`). Verificato con elenco con date prima/dopo: `~/Library/Application Support/Mascotte` invariata dopo avvio e chiusura (sorgente e pacchetto).
    - **Struttura:** nuovo `windows/lib/platform.cjs` con le capacità per piattaforma (`windowAttach`, `managedOllama`, `localActions`, `watch`, `hooks`, `management`, `hideDock`, `allSpaces`, link guida). I controlli `process.platform === 'win32'` di `main.cjs` ora li usano; su Mac le funzioni dei passi 3–10 restano spente. Link Ollama e Git per Mac corretti.
    - **Link di sistema:** `assertRegularPath` ignora fuori da Windows i link di proprietà di root (`/var`, `/tmp`); su Windows resta totale. Test in `test/platform.test.cjs`. Il test dell'updater su percorsi `/var` è saltato fuori da Windows (updater solo Windows fino al passo 10).
    - **CLI:** `findCLI` trova `claude` (`~/.nvm/.../bin/claude`, binario nativo) e Codex (app ChatGPT) anche con `PATH=/usr/bin:/bin`. Limite: una CLI installata come script JS con shebang `env node` non partirebbe senza `node` nel PATH (da rivedere al passo 4).
    - **Finestra:** `thickFrame` ignorato su Mac, lasciato. Applicati livello `screen-saver` e `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true})`, più `app.dock.hide()`: da verificare al passo 3.
    - **Build:** `npm run build:mac` produce `dist/mac-arm64/Mascotte.app` e `dist/Mascotte-Mac-0.8.0-arm64.zip`, firma ad hoc, `LSUIElement` true, bundle id `local.mascotte.desktop` passato da riga di comando (l'`appId` comune `local.mascotte.windows` è rimasto invariato per non toccare NSIS/updater Windows). Icona: per ora quella predefinita di Electron.
    - **Verificato:** `npm test` (38 superati, 3 saltati, 0 falliti), `viewer/test` (56 su 56), avvio da sorgente e da pacchetto, porta eventi aperta, `events.json` scritto nella nuova cartella, evento POST con risposta 204, chiusura senza processi residui e `events.json` rimosso.
    - **Verifica visiva dell'utente, avvio da sorgente:** la mascotte appare ed è trasparente e trascinabile. L'icona nella barra dei menu apre la chat. L'icona nel Dock non compare. Il menu col tasto destro e Esci funzionano.
    - **Rimandato al passo 3:** comportamento su tutto schermo e scrivanie, più schermi. Ritocchi ai testi: il log di avvio dice «Mascotte Windows preview» e la voce di menu dice «barra delle applicazioni» invece di Dock.
    - **Futuro:** la cartella `windows/` non è stata rinominata (troppi riferimenti in CI e documenti); possibile passo successivo, es. `desktop/`.
- [x] **3. Verificare mascotte e integrazione desktop.** Riprodurre personaggi, dimensioni, posizione, trasparenza, trascinamento, menu e stati animati. Adattare aggancio al Dock e alla finestra attiva; provare più schermi, riduzione a icona, cambio scrivania e tutto schermo.
  - **Eseguito il 28 ottobre 2026 su Mac Apple Silicon, macOS 27.0.1 (un solo schermo).** Il passo è completato. Il 28 ottobre 2026 l'utente ha eseguito le prove manuali elencate sotto, con esito positivo. Non provati: più schermi (era disponibile un solo schermo) e le pose «perch»/«Canta» (il personaggio Rosso non le prevede). Da coprire nel collaudo del passo 11. Il clic su «Aggancia alla barra» ora passa correttamente lo schermo anche su Windows: va riprovato su un PC Windows.
    - **Aggancio alla finestra attiva.** Nuovo helper Swift `windows/lib/mac/window-helper.swift`, stesso protocollo di `window-helper.ps1` (righe JSON `visible|hidden|closed|unavailable` con `x,y,width,height`, comandi `pause`/`resume`/`stop`, opzione `--once` per i test). Logica ripresa da `AttachmentController.swift`: app in primo piano (`NSWorkspace`), finestra normale più alta (`CGWindowList`, layer 0, almeno 100×60), esclusa Mascotte. Legge solo ID, PID, stato e bounds: nessun nome o immagine, quindi nessun permesso «Registrazione schermo». Coordinate in punti con origine in alto a sinistra, uguali a `screen` di Electron (su Mac `main.cjs` non converte). Con «Nascondi» (Cmd+H) la finestra sparisce dall'elenco: l'helper guarda l'app e dà `hidden`, non `closed`.
    - **Compilazione.** `scripts/mac-helper.cjs` (richiamato da `npm run resources`, quindi da `npm start`) compila con `swiftc -O` in `windows/resources/mac/` (gitignorata) solo se il sorgente è cambiato; fuori da macOS non fa nulla. `build:mac` lo richiede e lo include con `extraResources` (Contents/Resources, firmato ad hoc). `capabilities().windowAttach` su Mac è attivo solo se l'helper esiste. `attachment.cjs` sceglie il comando per piattaforma (`helperCommand`) e ha `parseState`; il comando Windows è invariato.
    - **Aggancio al Dock.** `lib/geometry.cjs`: `barEdge` (bordo inferiore della workArea: cima del Dock in basso, fondo dello schermo se il Dock è laterale o nascosto) e `barHit` (rilascio trascinando sul Dock: in basso o su un lato; su Windows solo la barra in basso, come prima). Il Dock nascosto automaticamente non riduce la workArea, quindi non si può agganciare trascinando: si usa la voce di menu.
    - **Testi.** «Aggancia al Dock» su Mac (`can.barLabel`), messaggio di errore e log di avvio neutri. Restano da rendere per piattaforma i testi di chat e Gestione (passi 4–10), ad esempio «Configurazione hook disponibile nel pacchetto Windows».
    - **Finestra.** Su Mac ordine `app.dock.hide()`, `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen, skipTransformProcessType})`, poi `setAlwaysOnTop('screen-saver')`; aggiunto `display-added`. Corretto il clic sulla voce di menu del Dock (passava l'oggetto menu come schermo).
    - **Icona nella barra dei menu:** lasciato il ritaglio dello sprite a colori. Un'immagine template monocromatica sarebbe una sagoma poco leggibile a 18 pt e non verificabile senza vedere lo schermo; da rivalutare dopo la prova visiva.
    - **Pose «perch» e «Canta»:** i menu e la logica sono già condivisi, ma l'unico personaggio presente (`rosso`) non definisce `perch`, quindi non sono provabili.
    - **Verificato da terminale:** `npm test` (46 superati, 0 falliti, 3 saltati) con compilazione ed esecuzione dell'helper, `viewer/test` 56 su 56; helper provato a mano: coordinate diverse dopo aver portato Finder in primo piano, `hidden`/`visible` con Cmd+H, spostamento della finestra seguito a 30 Hz, `pause`/`resume`/`stop`; helper avviato da Electron (`WindowFollower`) con stato valido; finestra della mascotte a livello 1000 (screen-saver) e visibile; `build:mac` riuscito, helper nel `.app` firmato ad hoc (`codesign --verify --deep --strict` ok); avvio da sorgente e da pacchetto senza processi residui; `~/Library/Application Support/Mascotte` invariata.
    - **Non verificato:** stato `hidden` per finestra ridotta con Cmd+M e per cambio scrivania o tutto schermo (la sessione non può inviare tasti), più schermi (un solo schermo), Dock a sinistra o a destra, trascinamento, click-through e aspetto (nessun clic né schermata possibile).
    - **Prove manuali per l'utente:**
      1. Dock in basso e visibile: trascina la mascotte sul Dock; deve posarsi sopra di esso. Verifica la voce «Aggancia al Dock» dal menu col tasto destro.
      2. Dock a sinistra o a destra (Impostazioni di Sistema > Scrivania e Dock): la mascotte si posa in basso sul bordo dello schermo; trascinandola sul Dock si aggancia.
      3. Dock nascosto automaticamente: «Aggancia al Dock» la porta sul bordo inferiore dello schermo.
      4. Aggancio alla finestra attiva (menu > Aggancio): la mascotte segue la barra del titolo mentre sposti e ridimensioni la finestra, anche a bordo schermo.
      5. Riduci la finestra agganciata nel Dock: la mascotte sparisce e ricompare quando la riapri. Prova anche Cmd+H e la chiusura della finestra (la mascotte si sgancia).
      6. Cambia scrivania (Ctrl+freccia) con la mascotte agganciata al Dock e libera: deve restare visibile. Con la finestra agganciata su un'altra scrivania sparisce e torna con essa.
      7. Metti un'app a tutto schermo: la mascotte deve restare sopra, libera o agganciata al Dock.
      8. Con più schermi: trascinala sul secondo schermo, agganciala al Dock e a una finestra lì; scollega o ricollega uno schermo e controlla che resti visibile.
      9. Trascinamento e click-through: clic sulla parte trasparente deve passare all'app sotto; clic sul personaggio apre la chat. Controlla che l'icona nella barra dei menu sia leggibile con barra chiara e scura.
- [x] **4. Allineare chat Codex e Claude.** Portare interfaccia e comportamento Windows, conferma prima di ogni invio remoto, cronologie separate, nuova conversazione, interruzione, timeout ed errori. Verificare ricerca delle CLI, permessi dei processi, invio tramite stdin e arresto dei processi figli su Mac, prima con CLI simulate e poi con una prova reale autorizzata.
  - **Eseguito il 28 ottobre 2026 su Mac Apple Silicon, macOS 27.0.1. Completato:** prove con CLI finte e poi prove manuali reali dell'utente con il pacchetto e il PATH minimo, tutte positive.
    - **Correzioni dopo le prove reali:**
      - **Focus:** riaprendo la chat dalla barra dei menu il cursore non tornava nel campo di testo. `renderer/chat.js` ora rimette il focus sul campo quando la finestra lo riceve, a meno che sia aperto un dialogo o sia in uso un altro campo.
      - **Errore Claude:** con `--output-format json` Claude scrive l'errore su stdout e esce con codice 1, mentre `decodeOutput` mostrava solo il messaggio generico. Ora mostra il testo reale (es. «OAuth session expired»), con un test in `core.test.cjs`.
      - Entrambe le correzioni sono codice comune: valgono anche per Windows e vanno riprovate lì.
    - **Causa del primo errore Claude:** login della CLI in `~/.nvm` (2.1.287) scaduto, non un difetto di Mascotte. Dopo il nuovo login dell'utente la richiesta reale funziona. Su questo Mac esistono anche le CLI di VS Code e dell'app Claude; Mascotte usa quella nel PATH.
    - **CLI trovate.** `claude` 2.1.287 è un binario nativo Mach-O (`~/.nvm/.../bin/claude` è un link a `claude.exe` nativo). Codex 0.164 è nella app ChatGPT (`/Applications/ChatGPT.app/.../CodexCLI.app/Contents/MacOS/codex`, Mach-O) e non è nel PATH. Quindi nel caso reale non serve `node`. Il caso di uno script npm con shebang `#!/usr/bin/env node` è gestito comunque (vedi sotto).
    - **Script JS.** `commandFor` (solo non Windows) legge la prima riga: se è uno shebang con `node` esegue `process.execPath` con `ELECTRON_RUN_AS_NODE=1` sul percorso reale dello script (come il ramo Windows per `.cmd`) e aggiunge in coda al PATH del figlio la cartella della CLI e quella dello script. Scelta motivata: non dipende dal `node` dell'utente né da un PATH ricco (Finder), il comando resta un file preciso senza shell; l'aggiunta al PATH serve solo agli eventuali nipoti che richiamano `node` (con nvm/Homebrew quella cartella contiene `node`). Shebang diversi (sh, python) e binari nativi restano eseguiti direttamente. Chiavi API rimosse dall'ambiente come prima, `shell:false`, prompt su stdin.
    - **Processi.** Il figlio è già `detached:true` su Mac, quindi in un proprio gruppo. `stop()` invia SIGTERM al gruppo e SIGKILL dopo 1 s; a chiusura del figlio il gruppo viene comunque chiuso con SIGKILL (nipoti rimasti). Alla chiusura dell'app `before-quit` chiama `stop(…, true)` (SIGKILL immediato, senza timer che l'uscita renderebbe inutile). Aggiunti `SIGTERM`/`SIGHUP`/`SIGINT` → `app.quit()` fuori da Windows, così anche la chiusura da terminale passa da `before-quit`. Chiudere la finestra chat interrompe già l'eventuale richiesta.
    - **Chat su Mac.** Menu applicazione minimale `appMenu` + `editMenu` su darwin (`can.appMenu`; Windows invariato). Focus: `app.focus({steal:true})` prima di `show()`/`focus()` e chat visibile su tutte le scrivanie e sopra il tutto schermo (`setVisibleOnAllWorkspaces`, come la mascotte). Messaggio «CLI non trovata» con «Mac» al posto di «PC» (`can.deviceName`). Font `-apple-system` prima di `system-ui`. Conferma prima dell'invio, cronologie per motore e «Nuova» sono codice comune e non sono stati modificati.
    - **Verificato da terminale:** `npm test` 50 superati, 0 falliti, 3 saltati (il test del passo precedente più i nuovi); `viewer/test` 56 su 56. Nuovi test: stop e timeout uccidono un nipote creato da una CLI finta; `stop` forzato; script `env node` con link simbolico, PATH `/usr/bin:/bin` e `findCLI` + `runCLI` fino alla risposta; binari nativi e script sh invariati. Avvio con `MASCOTTE_PREVIEW=1 npm start`: «Mascotte pronta», nessun errore, chiusura con SIGTERM senza processi residui. `npm run build:mac` riuscito; il binario del pacchetto esegue JS con `ELECTRON_RUN_AS_NODE=1` e PATH minimo. `~/.claude` e `~/.codex` non toccati; nessuna richiesta reale.
    - **Non verificato:** nessuna richiesta reale a Claude o Codex (autenticazione, limiti, formato reale dell'output, parametri del Codex 0.164 della app ChatGPT); focus e Cmd+C/V (menu e focus ragionati sul codice, nessun clic possibile); chiusura dell'app con una richiesta in corso (provata solo la logica di `stop`, non con l'app e una CLI finta collegata); comportamento della chat sul tutto schermo; pacchetto avviato da Finder con PATH reale.
    - **Prove manuali per l'utente:**
      1. Clic sulla mascotte e sull'icona nella barra dei menu: la chat si apre davanti e scrivendo i caratteri compaiono subito (senza cliccare altrove). Prova anche con un'app a tutto schermo.
      2. Cmd+C, Cmd+V, Cmd+X, Cmd+A, Cmd+Z nel campo di testo; la barra dei menu in alto mostra «Mascotte» e «Modifica» quando la chat ha il focus.
      3. Invia un messaggio con Claude: compare la conferma con il testo, annullando non parte nulla.
      4. Una richiesta reale con Claude e una con Codex (tab Gestione: entrambe «trovato»): risposta mostrata, stato e animazione corretti.
      5. Durante una risposta lunga premi Interrompi; in Terminale `pgrep -fl "claude|codex"` non deve mostrare processi rimasti.
      6. «Nuova» azzera solo la conversazione del motore scelto.
      7. Conversazioni diverse con Codex e Claude, esci con «Esci» e riapri: ogni motore ha la sua cronologia.
      8. Con una richiesta in corso scegli «Esci» dal menu: nessun processo claude/codex rimasto.
      9. Dal pacchetto `dist/mac-arm64/Mascotte.app` (primo avvio autorizzato a mano) ripeti 1, 4 e 5: è il caso con PATH minimo.
- [x] **5. Portare IA locale e gestione modelli.** Integrare Ollama, selezione, download con avanzamento e annullamento, verifica del modello e gestione degli errori. Su Mac il catalogo dei modelli è diverso da Windows (decisione dell'utente, 28 ottobre 2026); adattare installazione e chiusura dei processi a macOS; provare prestazioni e indicazioni hardware sul Mac, senza riutilizzare le indicazioni GPU Windows.
  - **Prove reali dell'utente (28 ottobre 2026, Mac M3 16 GB, Ollama 0.40.12, con le solite app aperte). Esito positivo, passo completato.**
    - Download di `gemma4:e4b` da Gestione, verifica e chat locale funzionanti.
    - Italiano giudicato ottimo. Una domanda tecnica su VLAN e trunk ha avuto una risposta corretta nell'insieme, con un'imprecisione: «solo il router legge il tag VLAN»; manca anche la VLAN nativa. Per dettagli d'esame serve una verifica, come già osservato con Qwen3-VL su Windows.
    - Memoria: «consuma abbastanza RAM» durante l'uso. Con `keep_alive` di 2 minuti il modello viene scaricato (verificato con `/api/ps`: nessun modello in memoria dopo la pausa). Decisione: `gemma4:e4b` resta il predefinito e `keep_alive` resta a 2 minuti.
    - Non provati: i modelli 2B e 9B, la ripresa del download dopo l'annullamento in modo misurato, i tempi in secondi.
  - **Correzione dopo le prove: risposte tagliate.**
    - Con `num_predict` 512 Gemma 4 si fermava a metà frase. Ora la lunghezza massima dipende dalla piattaforma: Mac 1536 token, Windows 512 invariato.
    - Se Ollama riporta `done_reason: "length"`, in fondo alla risposta compare «Risposta interrotta… Scrivi «continua» per il resto», con un test in `local-ai.test.cjs`. L'avviso è codice comune, quindi compare anche su Windows: va riprovato lì.
    - Dopo la correzione la stessa domanda è arrivata completa.
  - **Decisioni dell'utente (28 ottobre 2026).** Catalogo Mac: predefinito `gemma4:e4b` (multimodale), leggero `qwen3.5:2b`, pesante `qwen3.5:9b` con avviso sulle prestazioni adattato alla memoria condivisa da 16 GB. Windows invariato (qwen3:1.7b, qwen3:4b-instruct predefinito, qwen3:8b, qwen3-vl:2b-instruct, qwen3-vl:4b-instruct). Su Mac Mascotte non avvia Ollama (`managedOllama` false): guida l'installazione (https://ollama.com/download/mac).
  - **Tag verificati sul registro ufficiale** (`registry.ollama.ai/v2/library/<nome>/manifests/<tag>` e pagine `ollama.com/library`, sola lettura, 28 ottobre 2026). Tutti e tre i tag esistono con quel nome esatto, licenza Apache 2.0, formato `gguf` (nel manifest `model_format`), file `projector` presente, quindi multimodali con testo e immagini; capacità dichiarate dalla pagina: vision, tools, thinking.
    - `gemma4:e4b`: 6,58 GB (modello Q4_K_M 5,49 GB + proiettore visivo 0,99 GB + bozza 0,10 GB), contesto 128K, richiede Ollama 0.30.9. La pagina riporta anche audio.
    - `qwen3.5:2b`: 2,68 GB (modello Q8_0 2,01 GB + proiettore 0,67 GB), contesto 256K, richiede Ollama 0.30.0.
    - `qwen3.5:9b`: 6,55 GB (modello Q4_K_M 5,63 GB + proiettore 0,92 GB), contesto 256K, richiede Ollama 0.30.0.
    - I tag standard sono GGUF e Ollama li esegue su Metal. Le versioni MLX sono tag separati (`gemma4:e4b-mlx`, 9,5 GB; `qwen3.5:2b-mlx`, 3,1 GB…): nel loro manifest `model_format` è `safetensors`. Il catalogo usa i tag standard, non quelli MLX.
  - **Controllo del formato.** `/api/show` e `/api/tags` riportano in `details.format` il `model_format` del manifest (codice `server/routes.go` di `ollama/ollama`: `Format: m.Config.ModelFormat`; esempio `"gguf"` in `docs/api.md`). Su Mac `checkModel` accetta `gguf` e `safetensors` (valore dei tag MLX), solo per i tag del catalogo; su Windows resta solo `gguf`. Cloud o formati sconosciuti vengono rifiutati; restano obbligatorie la capacità `completion` e, per i modelli visivi, `vision`. Il valore `safetensors` per MLX viene dal manifest, non da una risposta reale di `/api/show`: da confermare con l'installazione reale.
  - **Fatto (codice).** Catalogo per piattaforma in `lib/local-ai.cjs` (tag, etichetta, visione, avviso, formati, `keep_alive`, `think`, testo introduttivo e nota visiva); `main.cjs` lo passa all'interfaccia e normalizza il modello salvato (fuori catalogo: ritorno al predefinito della piattaforma, senza errori); `renderer/chat.js` costruisce l'elenco, gli avvisi e i testi con «PC/Mac» dal catalogo (`renderer/chat.html` non ha più opzioni fisse). Visione: `supportsVision` vale per tutti i modelli Mac, quindi il predefinito accetta un fotogramma senza modello «VL» separato; la cattura su Mac resta spenta (passo 7). `keep_alive`: Windows 0, Mac `'2m'` (da misurare). `think` resta false per i modelli Mac. Il download (`/api/pull`, avanzamento, annullamento, ripresa) è codice comune, provato su Mac con server finto. Testi hook e aggiornamenti non toccati (passi 8 e 10).
  - **Verificato da terminale:** `npm test` (56 superati, 0 falliti, 3 saltati), `viewer/test` 56 su 56; nuovi test su catalogo Mac/Windows, predefinito, ritorno al predefinito, formati, visione, `keep_alive`, download con annullamento e ripresa; `MASCOTTE_PREVIEW=1 npm start` senza errori e chiusura con SIGTERM senza processi residui; `npm run build:mac` riuscito.
  - **Non verificato:** nessuna prova con Ollama reale (non era installato), nessun download né chat reale; testi e menu a tendina dell'interfaccia non visti a schermo; formato reale di `/api/show` per i tre tag; consumo di memoria e tempi con `keep_alive` 0 e 2 minuti; qualità delle risposte in italiano e su domande tecniche; comportamento di `think:false` con Gemma 4 e Qwen3.5 (previsto dalla documentazione, da provare).
  - **Prove manuali per l'utente (con Ollama installato e aperto):**
    1. Gestione > IA locale: l'elenco mostra Qwen3.5 2B, Gemma 4 E4B (selezionato) e Qwen3.5 9B; «Installa Ollama» apre la pagina per Mac; nel terminale `ollama --version` deve essere almeno 0.30.9.
    2. Scarica `gemma4:e4b` con «Scarica / aggiorna modello» (circa 6,6 GB): l'avanzamento sale in percentuale; premi «Annulla download» a metà, poi di nuovo «Scarica» e controlla che riprenda dalle parti già scaricate e arrivi a «pronto per la chat».
    3. «Verifica modello»: esito «Modello locale pronto». Se compare «non è compatibile» o «non trovato», annota l'output di `curl -s http://127.0.0.1:11434/api/show -d '{"model":"gemma4:e4b"}'` (campi `details.format` e `capabilities`).
    4. Chat con motore Locale: tre domande in italiano (es. «Spiegami in tre righe cos'è una VLAN»); la risposta deve essere in italiano, senza testo di ragionamento visibile.
    5. Una domanda tecnica: «Su uno switch Cisco come configuro una porta in trunk con VLAN 10 e 20?», e giudica correttezza e tempi.
    6. Memoria e tempi, con le solite app aperte: in Monitoraggio Attività (scheda Memoria) annota memoria usata e pressione prima, durante e dopo la risposta; cronometra la prima risposta dopo una pausa lunga e una seconda subito dopo.
    7. Confronto `keep_alive`: con il valore attuale (2 minuti) manda due domande a 30 secondi di distanza e annota il tempo della seconda; con `ollama ps` verifica che il modello resti caricato circa 2 minuti e poi sparisca. Per il confronto con 0, cambia temporaneamente `keepAlive` del catalogo `darwin` in `lib/local-ai.cjs` e riavvia. Decidi quale valore tenere in base a tempo di risposta e memoria occupata.
    8. Se vuoi, scarica `qwen3.5:2b` e `qwen3.5:9b` (circa 2,7 e 6,6 GB), cambia modello dall'elenco e ripeti le domande 4 e 5; con il 9B guarda la pressione della memoria e l'eventuale uso di swap. Controlla che l'avviso del 9B compaia solo selezionandolo.
    9. Salva in `settings.json` (cartella `~/Library/Application Support/Mascotte Electron`) un `localModel` che non esiste, per esempio `qwen3:8b`, e riavvia: deve tornare a Gemma 4 E4B senza errori.

- [x] **6. Portare memoria e azioni locali.** Aggiungere note modificabili/cancellabili e recupero del contesto per la chat locale, mantenendole separate dagli invii remoti. Adattare «apri calcolatrice» e «apri download» alle applicazioni e cartelle Mac, con conferma per ogni azione. Verificare salvataggio, riavvio e cancellazione delle note.
  - **Eseguito il 28 ottobre 2026 su Mac M3. Prove dell'utente superate.**
    - **Problema emerso nelle prove.** L'utente aveva chiesto al modello di salvare una nota e poi aveva fatto «Nuova». La nota non era mai stata salvata: `memory.json` non esisteva, e le note si salvavano solo dal pulsante «Ricorda…» o dalla scheda Gestione. Il modello rispondeva come se l'avesse fatto.
    - **Nuovo modulo `windows/lib/local-commands.cjs`, con test in `test/local-commands.test.cjs`.** Gestisce senza modello:
      - le azioni predefinite: su Mac Calcolatrice in `/System/Applications/Calculator.app` e cartella `~/Downloads`; su Windows invariate;
      - «ricorda: …», «ricordati che …» e «salva nota: …», che propongono il salvataggio con conferma;
      - «che note ho?» e simili, che elencano le note.
    - **Istruzioni del modello.** Ora dicono che il modello non può salvare o leggere note da solo e non deve dire di averlo fatto.
    - **Mac.** `can.localActions` è attivo; il messaggio di salvataggio dice «Mac» invece di «PC».
    - **Codice comune.** I comandi per le note e le istruzioni del modello valgono anche per Windows e vanno riprovati lì.
    - **Richieste dell'utente dopo le prove (ora soddisfatte dall'estensione qui sotto):**
      - capire frasi naturali come «puoi aprirmi la calcolatrice?», non solo le frasi esatte;
      - aprire anche altre app installate.
    - **Estensione (28 ottobre 2026): frasi naturali, app installate e altre cartelle.** Implementata e verificata da terminale; le prove manuali sotto restano da fare.
    - **Prova dell'utente:** funziona. Corretto un caso: «apri chrome» non trovava «Google Chrome» perché si confrontava solo l'inizio del nome. Ora, se l'inizio non basta, si cerca una parola intera nel nome (chrome → Google Chrome, code → Visual Studio Code); con più corrispondenze Mascotte chiede quale aprire. Ultimo controllo dell'utente su Chrome ancora da fare.
      - **Riconoscimento senza modello** (`lib/local-commands.cjs`): normalizza maiuscole, accenti, apostrofi e punteggiatura finale; toglie le formule di cortesia (puoi, potresti, riesci a, per favore, per piacere, grazie, mi, ti va di); riconosce i verbi apri/aprimi/aprire, avvia/avviami, lancia/lanciami, fai partire, esegui; toglie articoli e «app», «applicazione», «programma», «cartella». Il verbo deve essere il comando principale (inizio frase dopo la cortesia): «come si apre una porta trunk?» o «apri Safari e poi spiegami le VLAN» vanno al modello. Le frasi esatte di prima restano identiche.
      - **App (solo Mac):** elenco dei `.app` di `/Applications`, `/Applications/Utilities`, `/System/Applications`, `/System/Applications/Utilities`, `~/Applications` (un livello, cache di 60 s) più Finder. I link simbolici che escono dalla cartella sono ignorati, con l'unica eccezione dei volumi di sistema di sola lettura (Safari è un link a `/System/Cryptexes`). Alias italiani (Calcolatrice, Impostazioni, Note, Terminale, Monitoraggio Attività, …) verso i nomi reali dei bundle. Ordine: nome o alias esatto, poi prefisso unico; più corrispondenze: «Ho trovato più app: …. Quale?»; app inesistente: «Non trovo un'app chiamata «X» sul Mac.» con fino a 3 suggerimenti, solo se la frase è breve (al massimo 3 parole, senza «e», «poi», «che»…); altrimenti va al modello.
      - **Cartelle:** Download, Documenti, Scrivania, Immagini (Mac e Windows, dalla cartella utente) e Applicazioni (solo Mac).
      - **Sicurezza:** ogni apertura passa dalla conferma, che mostra nome e percorso completo («Aprire l'app Safari (/Applications/Safari.app).»). Solo `shell.openPath` su un percorso ricostruito lato main, mai da testo libero. Alla conferma `validateTarget` ricontrolla che il percorso esista e sia ancora una cartella nota o un'app nelle cartelle ammesse (anche dopo `realpath`).
      - **Modello locale:** le istruzioni dicono che Mascotte può aprire app e cartelle con conferma e che il modello non deve dire di averlo fatto lui.
      - **Verificato da terminale:** test automatici su cartella temporanea con finti `.app` (varianti positive e negative, alias, ambiguità, suggerimenti, link simbolico fuori cartella, Windows solo Calcolatrice e cartelle) e prova di sola lettura sul Mac reale. Nessuna app è stata aperta. Non verificato: apertura reale dei bundle dalla chat (dialogo, `shell.openPath`).
      - **Prove manuali per l'utente (chat Locale):**
        1. «puoi aprirmi la calcolatrice?»: compare la conferma con il percorso; «Conferma» apre la Calcolatrice.
        2. «potresti avviare Safari» e «lancia Terminale»: conferma con il percorso corretto; «Annulla» non apre nulla.
        3. «apri l'app Note» e «apri Impostazioni di Sistema».
        4. «mi apri i download per favore», «apri la scrivania», «apri la cartella Documenti».
        5. «apri google»: deve rispondere con l'elenco delle app Google senza azione; «apri Whatsapp» (se non installata): «Non trovo un'app…».
        6. «come si apre una porta trunk?» e «apri Safari e poi spiegami le VLAN»: nessuna conferma, risponde il modello.
    - **Attività Windows futura (non fatta):** aprire app qualsiasi su Windows richiede la scansione dei collegamenti del menu Start (e ricontrollo dei percorsi alla conferma). Per ora su Windows valgono solo Calcolatrice e cartelle utente, anche con frasi naturali.
- [ ] **7. Portare osservazione e fotogrammi.** Aggiungere scelta della finestra, anteprima locale, arresto e allegato di un solo fotogramma dopo conferma. Gestire i permessi macOS per la cattura e il caso di autorizzazione negata o revocata. Provare immagini con Codex/Claude simulati e Ollama visivo, cancellazione dei temporanei e assenza di immagini nella cronologia.
- [ ] **8. Portare la gestione degli hook.** Adattare launcher e percorsi macOS, mantenendo anteprima, applicazione con backup, conservazione delle altre integrazioni e controllo delle modifiche concorrenti. Verificare eventi Claude/Codex, aggiornamento degli hook senza duplicati, errori e normale flusso di approvazione degli hook.
- [ ] **9. Preservare i dati Mac esistenti.** Definire e verificare il trattamento di impostazioni, personaggi e cronologie della precedente app Swift in `~/Library/Application Support/Mascotte`. Se serve una migrazione, predisporre backup e recupero; mantenere fuori dai pacchetti account, modelli, chat e note personali.
- [ ] **10. Preparare pacchetti e aggiornamenti Mac.** Produrre l'app per le architetture scelte, adattare controllo release, download, verifica di integrità, sostituzione, riavvio e ripristino in caso di errore; definire anche l'aggiornamento da sorgenti. Decidere e documentare firma/notarizzazione e limiti della distribuzione. Provare installazione su un altro Mac o profilo pulito e aggiornamento preservando i dati.
- [ ] **11. Eseguire il collaudo di parità.** Verificare tutti i passi precedenti su Mac reale, includendo servizi locali non disponibili, CLI mancanti, interruzione, permessi negati, riavvio e aggiornamento fallito. Eseguire i controlli Windows pertinenti se viene modificato codice condiviso. Registrare hardware, versione macOS, risultati e limiti rimasti.
- [ ] **12. Aggiornare guide e distribuzione.** Aggiornare README principale, istruzioni Mac, privacy, esportazione e procedura di release in base alla soluzione effettiva. Riportare versione Mac, funzioni verificate e differenze residue; ricontrollare questa checklist contro la versione Windows più recente prima di considerare concluso l'allineamento.

**Primo passo:** confronto aggiornato Windows/Mac e decisione sulla base tecnica; nessuna riscrittura prima di aver definito il perimetro.

**Criterio di completamento:** funzioni Windows comprese nel perimetro disponibili e verificate su Mac reale, installazione e aggiornamento provati, dati preservati e differenze residue documentate. Una build riuscita da sola non completa il porting.

### Richiamo per ogni aggiornamento Windows

Prima di chiudere un intervento Windows, controllare se cambia uno dei passi sopra e aggiornare questa sezione nello stesso intervento. Per le nuove attività annotare funzione, passo Mac coinvolto, lavoro mancante e verifica prevista. Le eccezioni devono avere una motivazione esplicita.

Quando le proposte delle sezioni 1–4 diventano funzioni Windows, aggiungere anche i passi Mac per il nuovo motore locale, l'automazione delle finestre e il secondo parere con immagine; fino ad allora restano proposte, non funzioni da dichiarare già disponibili.

**Riferimento iniziale:** Windows 0.8.0 e funzioni descritte nel «Punto di partenza» di questo file; app Mac nativa documentata come versione 0.5. Eccezione di porting registrata il 28 ottobre 2026: il catalogo dei modelli locali è diverso su Mac (vedi passo 5); aggiungere o cambiare un modello locale va deciso per piattaforma, e Windows non richiede porting inverso.

## Riprendere da un altro PC

1. Recuperare il repository aggiornato e leggere `AGENTS.md`, questo file (incluso il richiamo Windows → Mac), `windows/README.md` e `PUBBLICAZIONE.md`. Per il porting leggere anche `app/README.md`.
2. Per sviluppare su Windows, installare Git e Node.js secondo la guida, poi eseguire `npm.cmd ci` nella cartella `windows`.
3. Eseguire `npm.cmd test` e avviare il sorgente con `npm.cmd start`. Per creare i pacchetti usare `npm.cmd run build:win`.
4. Per provare l'IA locale, installare e avviare Ollama, quindi scaricare il modello da Gestione. Non aspettarsi di trovare modelli o memoria personale nel clone.
5. Scegliere una voce sopra, aggiornare lo stato prima di iniziare e annotare decisioni, verifiche e prossimo passo prima del commit.

## Nuove idee

Aggiungere qui le prossime richieste senza perdere le decisioni già prese nelle cinque voci sopra. Se riguardano Windows, aggiornare anche il piano Mac della sezione 5.
