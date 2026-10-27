# Mascotte — lavoro in corso e idee

Ultimo aggiornamento: 27 ottobre 2026.

Questo file è il promemoria condiviso per riprendere il progetto anche da un altro PC. Le idee sotto sono da progettare e implementare: non descrivono funzioni già disponibili. Aggiungere qui le nuove proposte, aggiornando stato, decisioni e prossimo passo.

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

## Riprendere da un altro PC

1. Recuperare il repository aggiornato e leggere questo file, `windows/README.md` e `PUBBLICAZIONE.md`.
2. Per sviluppare su Windows, installare Git e Node.js secondo la guida, poi eseguire `npm.cmd ci` nella cartella `windows`.
3. Eseguire `npm.cmd test` e avviare il sorgente con `npm.cmd start`. Per creare i pacchetti usare `npm.cmd run build:win`.
4. Per provare l'IA locale, installare e avviare Ollama, quindi scaricare il modello da Gestione. Non aspettarsi di trovare modelli o memoria personale nel clone.
5. Scegliere una voce sopra, aggiornare lo stato prima di iniziare e annotare decisioni, verifiche e prossimo passo prima del commit.

## Nuove idee

Aggiungere qui le prossime richieste senza perdere le decisioni già prese nelle quattro voci sopra.
