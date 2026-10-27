# Log di implementazione e verifica — 26 ottobre 2026

Per gli esiti successivi e la build corretta vedi **Ripresa del 27 ottobre 2026** in fondo al documento. Le sezioni del 26 ottobre descrivono lo stato storico al commit.

## Stato al commit

Implementazione salvata; collaudo esteso interrotto su richiesta dell'utente. La build nella radice e lo ZIP locale sono stati generati prima delle ultime correzioni: **rigenerarli dal sorgente prima di considerare conclusa la verifica della versione finale**. I binari e le copie di prova non sono versionati.

## Funzioni aggiunte

- Schede Chat e Gestione nella micro chat Windows.
- Scelta persistente del clone Git Mascotte; controllo dell'origine, del ramo seguito e delle modifiche locali; aggiornamento fast-forward, controllo Node 22+, `npm ci` e compilazione del pacchetto.
- Output di build separato per ogni aggiornamento, per supportare anche l'app avviata da una precedente cartella `dist/win-unpacked`.
- Installer esterno al runtime da sostituire: prepara lo ZIP, segnala di essere pronto, attende la chiusura dell'app, conserva un backup e riavvia. Errori ed esito sono locali.
- Crea / aggiorna hook dalla scheda Gestione, mantenendo anteprima, conferma, backup e controllo delle modifiche concorrenti già esistenti.
- Osservazione facoltativa di una finestra Windows con anteprima locale e invio di un singolo fotogramma alla chat solo dopo anteprima e conferma. Nessun invio IA reale è stato effettuato durante queste verifiche.
- Guide Windows e README aggiornati.

## Verifiche eseguite

1. Controlli statici JavaScript e `git diff --check` riusciti.
2. Suite esistente `npm.cmd test`: **23 test superati, nessun errore, nessun test saltato**. Eseguita prima delle ultime correzioni dell'installer e del layout. Il test stop/timeout richiede circa 90 secondi nella sandbox; ripetuto da solo fuori dalla sandbox passa in circa 1,3 secondi.
3. Build Windows completa riuscita e copiata nella radice. Questa build precede le ultime correzioni descritte sotto.
4. Apertura della build impacchettata e della scheda Gestione tramite Computer Use su Windows.
5. Collaudo con app, dati, configurazioni Codex/Claude, clone e remoto Git separati in `work/management-e2e/`. Il percorso contiene spazi e una lettera accentata. Per rendere il test isolato, il driver sostituisce le risposte dei dialoghi nativi e il solo controllo dell'identità del remoto; status Git, fast-forward dal remoto locale, npm e build sono reali. Non sono stati modificati gli hook personali.
6. Driver integrato: selezione repo, annullamento dell'anteprima hook senza scritture, applicazione con backup, conservazione delle voci estranee, seconda applicazione senza duplicati, annullamento dell'aggiornamento e rifiuto della repo con modifiche locali: **superati**.
7. Layout corretto provato a 440×680 e 400×600: pulsante Invia visibile e altezza del contenuto entro la finestra.
8. Aggiornamento completo iniziale: fast-forward e build riusciti, app chiusa; sostituzione fallita e versione precedente riavviata. Il collaudo ha quindi individuato un difetto reale dell'installer.
9. Dopo la correzione `original-fs`, ripetuta la sola installazione con lo ZIP già compilato e il runtime Electron incluso: **riuscita in circa 7,7 secondi**, backup della versione precedente conservato, nessun errore su stderr. Questo tentativo non comprendeva il riavvio automatico finale.

## Difetti trovati e correzioni nel sorgente

- **Blocco ASAR nell'installer:** `fs` di Electron tratta `app.asar` come archivio virtuale; controllarlo con queste API può mantenerne aperto un handle e impedire la rinomina della cartella su Windows. L'installer ora usa `original-fs` quando gira sotto Electron. È il modulo previsto dalla [documentazione Electron](https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file) per trattare l'archivio come file normale. La ripetizione dell'installazione ha verificato la correzione.
- **Errore originale nascosto:** la pulizia dello staging poteva fallire e sostituire l'errore di installazione. La pulizia ora è asincrona, ritenta e scrive il proprio errore nel log senza nascondere quello originale. Le rinomine ritentano per un tempo limitato in caso di blocchi temporanei Windows; un errore di ripristino indica dove è conservato il backup.
- **Pulsante Invia fuori dalla finestra iniziale:** aumentate dimensioni iniziali e minime e limitata l'altezza dell'anteprima, mantenendo lo scorrimento nel pannello appropriato.
- **Log tecnici nella scheda Gestione:** lo stato mostra la fase dell'operazione; l'output dei comandi viene conservato per la diagnosi degli errori.

## Da sistemare o controllare alla ripresa

- Rigenerare la build finale con `npm.cmd run build:win` e ripetere la suite dopo queste ultime correzioni.
- Ripetere dall'interfaccia il ciclo completo con l'installer corretto: conferma, download, build, chiusura, sostituzione, backup, riavvio e visualizzazione dell'esito. Il test dell'installazione corretta è stato completato separatamente, non l'intero ciclo finale.
- Provare l'aggiornamento partendo dalla radice della repo e da `dist/win-unpacked`, compreso lo spostamento nella cartella stabile e il successivo aggiornamento degli hook.
- Aggiungere una regressione automatica che esegua l'installer con il runtime Electron e un vero `app.asar`, verificando sostituzione e backup; la suite esistente non copre questo caso.
- Provare ZIP non valido, destinazione non scrivibile, runtime/file ancora occupati, errore della build e fallimento del ripristino. Confermare che l'app precedente rimanga utilizzabile e i backup siano recuperabili.
- Stabilizzare il driver di collaudo: una cattura della pagina durante la chiusura ha restituito `UnknownVizError`; trattare il distacco previsto dal processo in uscita senza confonderlo con un errore applicativo. I driver e gli artefatti temporanei sono in `work/management-e2e/`, esclusi da Git.
- Collaudare cattura finestra e permessi su Windows reale: avvio/arresto, chiusura della finestra osservata, fotogramma, annullamento, conferma singola e pulizia dei file temporanei. Gli invii visuali a Codex/Claude e le loro risposte non sono stati provati con account reali.
- Provare layout e scorrimento con anteprima attiva, diverse risoluzioni e DPI.

## Ambiente di lavoro

Il precedente errore Codex `helper_unknown_error: setup refresh had errors` era causato dal proprietario della cartella `.git`, impostato su `CodexSandboxOffline`. Ripristinato il proprietario dell'utente Windows tramite UAC, senza riscrivere le ACL. I comandi ordinari nella sandbox sono tornati a funzionare. Questo intervento riguarda il PC di sviluppo e non viene applicato dall'app.

## Ripresa del 27 ottobre 2026

### Correzioni trovate durante il collaudo

- **Cattura rifiutata:** sul runtime incluso, Electron 44.7.2, le richieste di cattura arrivano come `media` con `mediaTypes: []`. Il precedente controllo autorizzava soltanto `display-capture`, perciò la funzione falliva con `NotAllowedError: Permission denied`. Il comportamento precedente e la successiva distinzione sono descritti nelle [modifiche di Electron](https://www.electronjs.org/docs/latest/breaking-changes#behavior-changed-screen-capture-requests-are-reported-as-display-capture-in-setpermissionrequesthandler).
- La cattura usa ora `getDisplayMedia` e un handler nel processo principale, che concede soltanto la finestra scelta, al frame principale della chat, senza audio. La compatibilità con Electron 44 accetta esclusivamente il tipo `media` senza dispositivi richiesti; camera e microfono restano negati. Se l'osservazione viene annullata o la sorgente scompare durante l'elenco, la richiesta viene rifiutata.
- **Layout con anteprima attiva:** alla dimensione minima il pannello video spingeva i comandi sotto il bordo; la larghezza intrinseca del video poteva anche spostare Smetti fuori dal pannello. Il pannello ora si restringe e scorre in verticale; le colonne sono limitate alla larghezza disponibile. Verificati Invia e Smetti visibili, senza scorrimento orizzontale, a 440×680 e 400×600.

### Verifiche completate

1. Suite finale `npm.cmd test`: **38 test superati, zero errori, zero saltati**, circa 41 secondi nel contesto Windows reale. I tre nuovi test di cattura coprono permessi, scelta della sola finestra autorizzata, audio negato, finestra scomparsa ed annullamento durante una richiesta.
2. Nuova regressione dell'installer con runtime Electron e vero `app.asar`: sostituzione e backup riusciti; ZIP corrotto o con struttura errata respinto; altra istanza attiva respinta; blocchi temporanei ritentati; blocco persistente terminato entro il limite; destinazione non scrivibile, ripristino riuscito, ripristino fallito con backup recuperabile e pulizia fallita senza nascondere l'errore originale. Gli errori di filesystem sono iniettati nel processo di prova; estrazione ZIP, accesso ASAR e rinomine normali sono reali. Il controllo dei processi è isolato dalle altre app aperte sul desktop.
3. Build Windows rigenerata dopo le correzioni e copiata nella radice; ZIP in `windows/dist/Mascotte-Windows-0.6.0-x64.zip`. Nessuna strumentazione di collaudo è inclusa in questa build.
4. Ciclo completo dalla scheda Gestione su installazione separata: conferma, Git fast-forward reale da remoto locale, `npm ci`, compilazione, chiusura, sostituzione, backup, riavvio automatico e visualizzazione dell'esito **riusciti**. Verificato anche con Computer Use. Fixture: `work/management-e2e/run-1793090339225 prova è/`.
5. Annullamento dell'aggiornamento, rifiuto della repo con modifiche, anteprima hook annullata senza scritture, applicazione con backup e seconda applicazione senza duplicati: **riusciti**. Sono state usate configurazioni Codex/Claude sintetiche, senza modificare gli hook personali.
6. Aggiornamento partendo dalla radice di un clone isolato: **riuscito**, con migrazione alla cartella stabile di prova, riavvio, messaggio sul nuovo percorso e successiva applicazione degli hook che puntano al nuovo eseguibile. Fixture: `work/management-e2e/run-1793091210602 prova è/`.
7. Cattura Windows reale di una finestra con soli dati sintetici: avvio, arresto, riavvio dell'osservazione e arresto alla chiusura della finestra **riusciti**. L'osservazione era spenta all'avvio e i residui temporanei sintetici sono stati rimossi.
8. Annullamento del fotogramma senza invio, conferma singola, immagine JPEG ricevuta dalle CLI simulate Codex e Claude, invio successivo di solo testo, risposta decodificata, cronologia senza immagine/base64 e rimozione del file temporaneo Codex: **riusciti**. Nessuna chiamata ai servizi IA. Fixture finale del layout: `work/management-e2e/run-1793091210602 prova è/visual-1793091364443/`.
9. I driver evitano di catturare una pagina dopo aver avviato la chiusura per l'aggiornamento; il distacco del processo in uscita termina il monitoraggio senza essere classificato come errore dell'app.
10. Aggiornamento partendo da `windows/dist/win-unpacked`: **riuscito**, con output di build separato, migrazione alla cartella stabile, riavvio e successivo aggiornamento degli hook. Fixture: `work/management-e2e/run-1793091448905 prova è/`. Anche qui i dati e `LOCALAPPDATA` sono isolati nella fixture.
11. Build fallita: invocato `updateFromRepository` sul sorgente reale con clone e remoto locali; Node, fast-forward e `npm ci` sono reali, mentre lo script npm della sola fixture termina con codice 42 e `INJECTED_BUILD_FAILURE`. Il fallimento viene propagato e la cartella di installazione di prova resta intatta. Log in `work/management-e2e/build-failure-result.json`. Questo controllo non avvia una sostituzione o un riavvio.
12. Confrontati `main.cjs`, `lib/capture.cjs`, `renderer/chat.js` e `renderer/chat.css` con gli ASAR nella radice e in `dist/win-unpacked`: corrispondono ai sorgenti finali. La copia di collaudo è stata chiusa e la Mascotte della radice è stata riaperta con la build aggiornata.

### Prove ancora da completare

- Risposte visuali dei servizi Codex/Claude con account reali: non eseguite. Il collaudo usa CLI simulate locali.
- Più monitor con DPI differenti e ulteriori risoluzioni/scalature: non riprovati in questa sessione. I controlli di layout coprono le dimensioni indicate sopra sul display attuale.
- ACL realmente non scrivibili e file trattenuti da software terzo: i percorsi di errore sono coperti tramite iniezione controllata; non sono state cambiate ACL di sistema o protezioni del PC.

### Metodo e artefatti

I cicli completi usano clone, remoto locale, app e dati separati, con spazi e caratteri accentati nei percorsi. Il driver sostituisce i dialoghi nativi e il controllo dell'identità del remoto; stato Git, fast-forward, npm, build e installer sono reali. Solo i pacchetti di prova contengono un osservatore per leggere l'esito dopo il riavvio e controllare gli hook. Per le migrazioni anche `LOCALAPPDATA` punta a una cartella della fixture: non viene installata una copia di prova nella cartella personale reale. Log JSON ed immagini restano sotto `work/management-e2e/`, esclusi da Git.

## Installer e release Windows 0.7.0

- Creato un installer NSIS per utente e mantenuto lo ZIP portatile. La disinstallazione conserva i dati locali; la sostituzione tramite ZIP conserva anche il disinstallatore registrato. L'installer è privo di firma digitale.
- Aggiunti controllo delle CLI e collegamenti alle guide ufficiali. L'aggiornamento normale usa la release stabile più recente su GitHub, richiede conferma e verifica dimensione e SHA-256; quello dai sorgenti resta disponibile come opzione avanzata.
- Aggiunto il workflow per creare una release da un tag corrispondente alla versione di `windows/package.json`. **Non è stata pubblicata alcuna release** durante questo lavoro: il controllo online segnala correttamente l'assenza di release finché non ne viene creata una.
- Suite `npm.cmd test`: **41 test superati**, compresi digest errato, ZIP incompleto, conservazione del disinstallatore, percorsi di rollback e funzionamento dell'installer con un PATH senza strumenti di sviluppo.
- Prova completa su Windows: installer reale in una cartella temporanea; indicazione delle due CLI assenti; risposta controllata quando non esiste una release; conferma, download, verifica SHA-256, estrazione, sostituzione, backup e riavvio senza Git e Node nel PATH; successiva disinstallazione reale, con rimozione dell'eseguibile e della voce Windows e conservazione dei dati e del backup di prova. La risposta HTTP e i metadati della release erano simulati localmente; il pacchetto, l'installer, l'estrazione e l'aggiornamento erano reali. Il test ha anche individuato e corretto la dipendenza dal PATH per `powershell.exe`.
- Generati installer e ZIP finali in `windows/dist` e i pacchetti con guide e checksum in `esportabile/Windows`. La Mascotte del progetto è stata riaperta con la build 0.7.0. Il passaggio di pubblicazione effettiva e il download dalla release GitHub reale restano da verificare quando verrà rilasciata una versione.

## Chat e memoria locale Windows 0.8.0

- Aggiunte chat locale tramite Ollama, memoria locale esplicita con note modificabili prima del salvataggio e cancellabili, ricerca lessicale delle note pertinenti, scelta fra Qwen3 4B instruct e Qwen3 1.7B, conferma per ogni invio remoto e prime azioni sul PC con conferma. La memoria viene fornita solo alla chat locale; il passaggio a un servizio remoto mostra il testo e non invia automaticamente note o cronologia della chat locale.
- L'inferenza usa solo `127.0.0.1` e modelli GGUF selezionati. Quando avvia il proprio runtime autonomo, Mascotte imposta `OLLAMA_NO_CLOUD=1`. Una installazione Ollama esterna mantiene la propria configurazione. Il modello viene scaricato dalla RAM dopo ogni risposta.
- Su questo PC: circa 16 GB di RAM, Intel Core 7 150U e grafica Intel integrata; Ollama ha usato la CPU. Il pacchetto ufficiale Ollama standalone 0.40.11 è stato verificato con il digest SHA-256 della release ufficiale. Runtime e due modelli, circa 3,7 GB complessivi, sono stati predisposti nella cartella dati locale di Mascotte.
- Prove reali su Ollama con domande e note sintetiche: la memoria selezionata è stata recuperata; il modello da 1,7B con ragionamento disattivato ha dato anche risposte sbagliate a domande semplici. Con ragionamento attivo ha risposto correttamente a una somma ma ha prodotto una spiegazione imprecisa. Il modello 4B instruct ha risposto correttamente alla somma e ha dato una descrizione più plausibile del riavvio. Prove indicative, non una misura di accuratezza generale; con altri programmi aperti la RAM disponibile può limitare la velocità. Il runtime gestito 4B si è avviato, ha risposto alla domanda sintetica e si è fermato correttamente.
- Suite `npm.cmd test`: **44 test superati**. Driver dell'interfaccia con servizi simulati: conversazione locale, recupero delle note, annullamento e conferma della richiesta remota, conferma anche per invii remoti diretti, annullamento e conferma delle azioni e selezione del modello superati. Cattura di una finestra sintetica, conferma remota e invio di immagini con CLI simulate ancora funzionanti. Non sono state fatte chiamate a IA remota o azioni reali sul PC durante i test.
- Le prime azioni sono limitate ad aprire Calcolatrice e Download tramite richieste esplicite riconosciute; non viene eseguito testo arbitrario del modello. L'approfondimento remoto si avvia dal pulsante proposto nella risposta locale e richiede conferma; il riconoscimento automatico di tutti i casi in cui servirebbe un'IA remota non è garantito.
- Questa versione non riaddestra il modello: le note sono consultate come contesto. Il recupero lessicale può mancare sinonimi e le informazioni salvate possono essere inesatte. Le note non sono cifrate; restano nella cartella dati protetta dell'utente. La pubblicazione della release 0.8.0 non è stata eseguita.
- Completamento: verificati i sorgenti contenuti nel pacchetto, aggiornata la copia nella radice e riaperta Mascotte 0.8.0. Il runtime Ollama gestito è stato rilevato come processo figlio della mascotte, in ascolto su `127.0.0.1:11434`, con entrambi i modelli disponibili. Il precedente blocco del controllo automatico di approvazione è stato risolto nella sessione di completamento; nessuna azione era stata eseguita durante il blocco.
- Report finale: `REPORT-MODELLO-LOCALE.md` e `REPORT-MODELLO-LOCALE-MISURE.json`. Tre prove sintetiche con il modello predefinito: 7,9 s per una somma, 13,0 s per una spiegazione breve, 9,3 s per il recupero di una nota; working set campionato del runner tra 2.828 e 3.041 MiB. Nessun modello è rimasto caricato dopo le prove. Questi dati non rappresentano un benchmark generale.


## Download del modello e preparazione commit

- Aggiunto in Gestione il download/aggiornamento del tag ufficiale selezionato tramite Ollama locale, con avanzamento, annullamento e verifica GGUF + generazione testuale. Il catalogo resta esplicito: nessun passaggio automatico a famiglie non verificate. Nessuna chat viene inviata durante il download.
- Confermati 45 test automatici; coperti download a blocchi, tag non consentiti, revisione incompatibile, risposta incompleta e annullamento. Prova Electron con servizi simulati completata, incluso il pulsante di download, oltre a chat, memoria e conferme remote/azioni.
- Esclusi da Git pesi IA e runtime locali; le prossime build portatili vengono copiate in `distribuzione/Windows-portatile/`, senza riempire la radice. La vecchia copia in esecuzione nella radice non viene spostata. Guide per nuovo PC e commit aggiornate in `README.md` e `PUBBLICAZIONE.md`.
- Ollama esterno resta un prerequisito su un PC nuovo: il pulsante apre il download ufficiale; installazione e avvio precedono il download del modello dentro Mascotte. Non sono stati creati commit o pubblicate release.


## Opzione Qwen3 8B

- Aggiunto `qwen3:8b` al catalogo scaricabile, mantenendo il 4B come predefinito. L'8B usa il contesto di 4096 token e ragionamento disattivato per contenere la latenza.
- Avviso nella selezione: configurazione consigliata di 16 GB RAM, GPU supportata con 8 GB VRAM dedicata e almeno 8 GB disco libero. Indicazioni pratiche, non minimi assoluti; senza GPU le risposte possono essere lente. Nessuna verifica automatica dell'hardware.
- Prova Electron con server simulato: selezione 8B, visibilita dell'avviso e download del tag corretto superati. Test automatico aggiunto per download e chat 8B; non sono stati scaricati i pesi reali o misurate prestazioni dell'8B sul PC.
