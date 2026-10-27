# Mascotte — lavoro in corso e idee

Ultimo aggiornamento: 27 ottobre 2026.

Questo file è il promemoria condiviso per riprendere il progetto anche da un altro PC. Le idee sotto sono da progettare e implementare: non descrivono funzioni già disponibili. Aggiungere qui le nuove proposte, aggiornando stato, decisioni e prossimo passo.

## Punto di partenza

- Base: commit `d7ca112`, versione Windows 0.8.0.
- IA locale tramite Ollama: Qwen3 1.7B, 4B Instruct (predefinito) e 8B scaricabili da Gestione, con verifica tecnica e avviso hardware per l'8B.
- Memoria locale tramite note esplicite e recupero per parole in comune; non è addestramento del modello.
- Ogni invio a Codex o Claude richiede conferma dell'utente. Mantenere questa scelta nelle evoluzioni future.
- Le azioni attuali sul PC sono limitate ad aprire Calcolatrice e Download, con conferma ogni volta.
- L'osservazione delle finestre esiste, ma l'IA locale attuale accetta solo testo: non interpreta immagini e non controlla le finestre.
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
- Quando servono OCR o un modello con capacità visive. Gli attuali modelli locali testuali non possono leggere direttamente un fotogramma.
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

## Riprendere da un altro PC

1. Recuperare il repository aggiornato e leggere questo file, `windows/README.md` e `PUBBLICAZIONE.md`.
2. Per sviluppare su Windows, installare Git e Node.js secondo la guida, poi eseguire `npm.cmd ci` nella cartella `windows`.
3. Eseguire `npm.cmd test` e avviare il sorgente con `npm.cmd start`. Per creare i pacchetti usare `npm.cmd run build:win`.
4. Per provare l'IA locale, installare e avviare Ollama, quindi scaricare il modello da Gestione. Non aspettarsi di trovare modelli o memoria personale nel clone.
5. Scegliere una voce sopra, aggiornare lo stato prima di iniziare e annotare decisioni, verifiche e prossimo passo prima del commit.

## Nuove idee

Per ora sono previste soltanto le due proposte sopra. Aggiungere qui le prossime richieste senza perdere le decisioni già prese.
