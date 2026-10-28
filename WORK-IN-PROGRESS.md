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

**Stato:** passo 1 in corso. L'analisi delle differenze è registrata e propone Electron come base. Il porting non è iniziato.

**Obiettivo:** rendere disponibili su Mac le funzioni attuali di Windows, mantenendo il piano aggiornato quando Windows evolve. La base Mac nativa esiste già in `app/`: personaggio, animazioni, aggancio al Dock e alle finestre, eventi e micro chat Claude/Codex.

**Scelta tecnica da definire al passo 1:** riutilizzare la base Electron di `windows/` anche su macOS è la proposta per condividere più codice in futuro; aggiornare l'app nativa Swift rimane un'alternativa. La scelta non è ancora stata adottata e questo piano non avvia il porting.

**Stima iniziale indicativa:** 3–5 giornate con la base Electron condivisa, oppure 6–10 giornate mantenendo Swift, con accesso a un Mac per compilazione e prove. Da rivedere dopo il primo passo e ogni ampliamento del perimetro. Le proposte delle sezioni 1–4 non ancora implementate non sono incluse nella stima.

### Passi da eseguire in ordine

- [ ] **1. Fotografare le differenze e scegliere la base.** Confrontare il comportamento Windows corrente con `app/`, registrare versione/commit di riferimento e decidere Electron condiviso o Swift. Definire versioni macOS e architetture da supportare (Apple Silicon e, se previsto, Intel), disponibilità del Mac di prova e criteri di parità.
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
    - **Ancora da decidere per chiudere il passo:** adozione definitiva di Electron, supporto Intel, firma/notarizzazione (serve un account Apple Developer) e criteri di parità.
- [ ] **2. Preparare avvio e struttura del codice.** Separare le funzioni comuni dagli adattatori Windows/macOS; adattare percorsi, ricerca delle CLI, risorse e avvio dei processi. Se si sceglie Electron, predisporre build e identificativo Mac senza sovrascrivere la vecchia app o i suoi dati durante le prove. Verificare avvio e chiusura sul Mac.
- [ ] **3. Verificare mascotte e integrazione desktop.** Riprodurre personaggi, dimensioni, posizione, trasparenza, trascinamento, menu e stati animati. Adattare aggancio al Dock e alla finestra attiva; provare più schermi, riduzione a icona, cambio scrivania e tutto schermo.
- [ ] **4. Allineare chat Codex e Claude.** Portare interfaccia e comportamento Windows, conferma prima di ogni invio remoto, cronologie separate, nuova conversazione, interruzione, timeout ed errori. Verificare ricerca delle CLI, permessi dei processi, invio tramite stdin e arresto dei processi figli su Mac, prima con CLI simulate e poi con una prova reale autorizzata.
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
