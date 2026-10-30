# Collaudo Windows — 30 ottobre 2026

Prove sul pacchetto Electron con Luma e rifinitura chat A1–A3, con dati sintetici isolati. Nessun invio a Codex/Claude e nessuna sostituzione dei dati personali.

## IA locale reale

| Voce | Configurazione |
| --- | --- |
| RAM | Circa 16 GB |
| GPU | NVIDIA GeForce RTX 5050 Laptop, 8 GB VRAM |
| Runtime | Ollama 0.40.13 portabile, API su 127.0.0.1:11434, cloud disabilitato |
| Modello | Qwen3 4B Instruct, `qwen3:4b-instruct` |
| Parametri dell'app | Contesto 4096, massimo 512 token, `keep_alive: 0` |
| Accelerazione osservata | CUDA, 37/37 layer sulla GPU; buffer pesi circa 2376 MiB |

Runtime dalla [release ufficiale Ollama](https://github.com/ollama/ollama/releases/tag/v0.40.13), archivio verificato prima dell'esecuzione con SHA-256 `7afa38624fa62ee5d8293422d0ab084c1bb4603134c7f4dafce11a033b57cc19`. Modello dalla [scheda ufficiale Ollama](https://ollama.com/library/qwen3:4b-instruct), scaricato e verificato tramite il flusso `pullModel` di Mascotte. Runtime, pesi, profilo e log restano fuori da Git.

| Prova nell'app reale | Esito |
| --- | --- |
| Domanda «Quanto fa 3 + 4?» | Risposta `7`, senza metadato operativo |
| Recupero del codice da una nota sintetica pertinente | Risposta `LANTERNA-42`, coerente con la nota |
| Elenco promemoria | Risposta deterministica marcata `kind: app` |
| Cambio a Codex | Cronologia separata, nessun invio remoto |
| Interruzione di una risposta lunga | Richiesta annullata, stato libero e avviso «Risposta interrotta.» |
| Persistenza | Sette messaggi locali, conversazioni remote vuote, metadato operativo conservato |

Tempi osservati per le due richieste: circa 73 secondi alla prima inizializzazione del modello/CUDA e 3,9 secondi per la seconda. Sono due campioni, non un benchmark o una garanzia di latenza. Il completamento dell'interruzione è stato osservato in circa 36 ms.

Il 4B scelto è testuale: questo collaudo non dimostra la comprensione di immagini. Non provati qui Gemma/llama.cpp o altri modelli.

## Ordine delle finestre: problema riprodotto e corretto

Nella copia precedente la mascotte risultava visibile ma senza il flag nativo `WS_EX_TOPMOST`, nonostante `alwaysOnTop: true` nel costruttore. Una normale finestra di prova la precedeva nello z-order e poteva coprirla.

La visualizzazione ora passa da `showMascot`: su Windows riapplica esplicitamente il livello sopra le finestre dopo `showInactive`, mantenendo la finestra non attivabile. Coperti avvio, Mostra, seconda istanza e ripristino dall'aggancio. La gestione Mac delle scrivanie e del livello è invariata.

Nel pacchetto aggiornato: flag nativo presente e mascotte sopra la finestra normale. Il test automatico `topmost.test.cjs` verifica i flag e l'ordine nativo prima e dopo Nascondi/Mostra e il cambio della zona cliccabile. Non è una verifica del desktop protetto di Windows o di tutte le applicazioni a schermo intero.

## Altri percorsi verificati

- Sveglia sintetica scaduta all'avvio; WAV silenzioso decodificato e riprodotto in ciclo, volume 0,1; Rimanda salva una scadenza a cinque minuti e rilascia audio, URL e timer. Non misurata l'udibilità degli altoparlanti o la consegna delle notifiche native.
- Tab dal campo di scrittura raggiunge Invia; Shift+Invio inserisce una nuova riga. Non è un audit completo di accessibilità.
- Cattura reale di una sola finestra sintetica: JPEG valido, indicatore locale coerente, cambio a Codex senza invio automatico e Smetti che rilascia lo stream.
- Interfaccia controllata a 400×600, 440×680 e 720×820 CSS px senza overflow orizzontale introdotto.

Suite finale Windows: **232 test, 192 passati, 40 saltati, zero fallimenti**. Gli skip comprendono casi Mac e requisiti non disponibili su questa sessione Windows; non costituiscono una prova di quei percorsi. Parser/visore già verificato con 56 test passati.

Il collaudo Mac precedente resta valido per la sua base. Le sole modifiche comuni successive richiedono una prova mirata sul Mac; la correzione dello z-order è specifica Windows. Restano separati B-OBS (precedenza dei comandi con immagine), A4 scroll e fase tecnica 4.

## Installer Windows 0.8.1 e barra delle applicazioni

Creato `Mascotte-Setup-0.8.1-x64.exe`, 113.580.612 byte (circa 108 MiB): installazione per utente con scelta della cartella, collegamenti Desktop e Start e icona Rosso. Include Electron, app e personaggi; motori IA e modelli restano esterni, configurabili dalle Impostazioni.

Installazione e disinstallazione silenziose provate in una cartella di collaudo isolata: versione e collegamenti corretti; disinstallazione rimuove app, registrazione e collegamenti, conservando i dati del profilo. Nessuna installazione permanente lasciata sul PC.

Nell'app installata verificati avvio automatico della chat, finestra nativa idonea alla barra delle applicazioni, X di Windows che riduce a icona conservando il pulsante e successivo ripristino. Per uscire si usa Esci dal menu della mascotte. L'aggiunta alla barra come collegamento permanente resta una scelta manuale dell'utente; non viene attivato l'avvio all'accesso di Windows.

Suite dopo questa modifica: **235 test, 195 passati, 40 saltati, zero fallimenti**, inclusi tre casi di regressione per X su Windows, comportamento Mac invariato ed Esci. La simulazione del ramo Mac non sostituisce un collaudo su Mac. Installer, icona Windows e integrazione nella barra sono specifici Windows e non richiedono porting; resta valida la checklist Mac già aperta per le precedenti modifiche comuni.

## Ricerca web per Codex e Claude — sorgente 0.8.2

La configurazione precedente escludeva la ricerca live di Codex e passava a Claude `--tools ""`, senza strumenti disponibili. In 0.8.2 Codex riceve `web_search="live"` mantenendo sandbox in sola lettura e disattivando le altre integrazioni elencate; Claude riceve esclusivamente `WebSearch,WebFetch`, con server MCP vuoti e senza persistenza di sessione. Le istruzioni chiedono di consultare fonti per fatti recenti, riportare i link e dichiarare quando la ricerca è indisponibile. I due account remoti elaborano le richieste e le ricerche secondo le rispettive politiche e disponibilità dell'account. Prova live non eseguita, né autenticazione Codex/Claude verificata in questa sessione: funzionalità attesa dai parametri CLI, non ancora collaudata end-to-end. La chat locale rimane separata e non riceve accesso web. Da verificare con gli account dell'utente entrambe le ricerche live e i link citati. Su Mac il codice comune richiede la stessa prova mirata; non è una verifica completata per la piattaforma Mac.
