# Mascotte — lavoro in corso e idee

Ultimo aggiornamento: 28 ottobre 2026.

Questo file è il promemoria condiviso per riprendere il progetto anche da un altro PC. Le idee sotto sono da progettare e implementare: non descrivono funzioni già disponibili. Aggiungere qui le nuove proposte, aggiornando stato, decisioni e prossimo passo.

**Richiamo permanente Windows → Mac:** ogni nuova funzione o modifica Windows deve comportare, nello stesso intervento, la revisione della checklist nella sezione [5. Aggiornamento Mac e allineamento con Windows](#5-aggiornamento-mac-e-allineamento-con-windows). Integrare i passi necessari, riaprire quelli già completati se cambia il requisito e annotare le eccezioni motivate. La regola è riportata anche in [AGENTS.md](AGENTS.md), per ritrovarla nelle prossime sessioni di sviluppo.

## Punto di partenza

- Base: commit `d7ca112`, versione Windows 0.8.0.
- IA locale tramite Ollama: Qwen3 1.7B, 4B Instruct (predefinito) e 8B scaricabili da Gestione, con verifica tecnica e avviso hardware per l'8B.
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

**Stato:** passi 1–4 completati. Prossimo: passo 5 (IA locale e gestione modelli). Il passo 1 ha fissato le scelte: base Electron, solo Apple Silicon, nessuna notarizzazione, migrazione dei dati con backup.

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
- [ ] **5. Portare IA locale e gestione modelli.** Integrare Ollama, selezione, download con avanzamento e annullamento, verifica del modello e gestione degli errori. Includere i modelli testuali 1.7B, 4B Instruct e 8B e i visivi Qwen3-VL 2B/4B Instruct attualmente supportati. Adattare installazione, eventuale runtime gestito e chiusura dei processi a macOS; provare prestazioni e indicazioni hardware sul Mac, senza riutilizzare automaticamente le indicazioni GPU Windows.
- [ ] **6. Portare memoria e azioni locali.** Aggiungere note modificabili/cancellabili e recupero del contesto per la chat locale, mantenendole separate dagli invii remoti. Adattare «apri calcolatrice» e «apri download» alle applicazioni e cartelle Mac, con conferma per ogni azione. Verificare salvataggio, riavvio e cancellazione delle note.
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

**Riferimento iniziale:** Windows 0.8.0 e funzioni descritte nel «Punto di partenza» di questo file; app Mac nativa documentata come versione 0.5. Nessuna eccezione di porting registrata al momento della pianificazione.

## Riprendere da un altro PC

1. Recuperare il repository aggiornato e leggere `AGENTS.md`, questo file (incluso il richiamo Windows → Mac), `windows/README.md` e `PUBBLICAZIONE.md`. Per il porting leggere anche `app/README.md`.
2. Per sviluppare su Windows, installare Git e Node.js secondo la guida, poi eseguire `npm.cmd ci` nella cartella `windows`.
3. Eseguire `npm.cmd test` e avviare il sorgente con `npm.cmd start`. Per creare i pacchetti usare `npm.cmd run build:win`.
4. Per provare l'IA locale, installare e avviare Ollama, quindi scaricare il modello da Gestione. Non aspettarsi di trovare modelli o memoria personale nel clone.
5. Scegliere una voce sopra, aggiornare lo stato prima di iniziare e annotare decisioni, verifiche e prossimo passo prima del commit.

## Nuove idee

Aggiungere qui le prossime richieste senza perdere le decisioni già prese nelle cinque voci sopra. Se riguardano Windows, aggiornare anche il piano Mac della sezione 5.
