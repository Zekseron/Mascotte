# Modalità Agente 0.9.0 — collaudo Windows

2 novembre 2026. Anteprima sul branch `windows/riallineamento-2026-10-30`, non pubblicata e non installata automaticamente.

- Suite completa: **245 test, 205 passati, 40 saltati, zero fallimenti**. Gli skip non convalidano i percorsi Mac o i requisiti assenti.
- Codex CLI 0.163.0 reale, con account e cartella sintetica isolata: lettura di `input.txt`, creazione di `risultato.txt` con contenuto verificato, secondo turno con ripresa dello stesso identificativo di sessione e recupero del codice dal contesto.
- Protocolli simulati Codex: avvio/ripresa, diff, rifiuto del comando, chiarimento, ID scaduti e input non valido, interruzione e pulizia delle richieste.
- Claude: test dell'adattatore e test del SDK ufficiale 0.3.316 collegato a una CLI simulata; richiesta Write presentata al callback e rifiuto restituito. Nessun collaudo Claude con account reale su questo PC.
- App Electron completa con CLI Codex simulata: scelta cartella, modalità, IPC, approvazione/rifiuto, chiarimento, risultato persistito e ritorno alla chat normale senza mescolare cronologie.
- Interfaccia Electron a 400×600, 440×680 e 720×820 CSS px: nessun overflow orizzontale; campo di invio accessibile; richieste conservate durante gli aggiornamenti del testo. Anteprime sintetiche in `work/agent-ui/`, escluse da Git.
- Installer NSIS e ZIP x64 0.9.0 compilati. Installer: 114.565.963 byte. Sorgenti inclusi nell'ASAR confrontati con quelli correnti; import del SDK Claude dall'app compilata verificato. Binari opzionali Claude esclusi: si usa la CLI esterna scelta dall'utente.
- Guide e privacy aggiornate; copie di distribuzione allineate. Piano Mac privato aggiornato mantenendo aperte le verifiche dei percorsi comuni.

## Chiusura dei collaudi Windows prima del passaggio al Mac

- Copia installata dell'utente identificata come **0.9.0**. `main.cjs`, `lib/agents.cjs`, `lib/agent-codex.cjs` e `lib/cli.cjs` coincidono con quelli del branch. Nessuna reinstallazione o disinstallazione della copia personale è stata eseguita durante questo controllo.
- L'utente ha confermato che una normale richiesta Codex dall'app non apre più la console vuota.
- Con il runtime e i moduli dell'app installata, su dati sintetici isolati: lettura del testo e creazione del file di output verificate; ricreazione del gestore e ripresa dello stesso identificativo di sessione con recupero del testo precedente; ritorno predefinito in Chat verificato sul nuovo gestore. Il primo tentativo chiedeva di ricordare un testo che il modello aveva copiato come byte senza mostrarlo: corretto il caso di prova, senza modifiche al codice dell'app.
- Chat Codex reale: ricerca della documentazione ufficiale Node.js, evento `web_search` presente e collegamento `nodejs.org` nella risposta.
- Agente Codex reale: Interrompi durante un processo Node sintetico in attesa; richiesta annullata, stato libero, richieste pendenti eliminate, PID del processo figlio non più esistente e file finale non creato.
- Codice `main.cjs` dell'app installata caricato dalla fixture Electron in un profilo isolato con CLI simulata: X interrompe il compito e riduce a icona, ripristino possibile, uscita con richiesta di permesso attiva riuscita. Nessun processo della fixture residuo. È una prova del codice impacchettato nel runtime di test, distinta dall'automazione della finestra personale dell'utente.
- Parser/visore: **56 test passati**. Il codice di produzione è invariato rispetto alla suite finale di 245 test; questi controlli aggiuntivi non richiedono una nuova build.

Per scelta dell'utente il collaudo **Claude con account reale è rinviato al Mac**, insieme alla build e alle verifiche Mac già presenti nella checklist privata. Non viene considerato superato su Windows. Browser, plugin e flussi MCP completi restano fuori da questa prima anteprima. L'installazione pulita su un altro PC e le prove del primo rilascio restano verifiche di distribuzione distinte dal riallineamento della copia attuale. I test simulati non dimostrano l'isolamento effettivo di tutte le versioni delle CLI o di tutti gli strumenti. Interrompere un agente non ripristina i file già modificati.

Fixture esplicite (non eseguite dalla suite ordinaria): `test/fixtures/agent-live.cjs` usa il vero account Codex soltanto su dati sintetici; `agent-installed.cjs` verifica i moduli e il runtime installati con account Codex, sempre su dati sintetici; `agent-main.cjs`, `agent-ui.cjs` e `agent-package.cjs` verificano integrazione, layout e contenuti del pacchetto. `agent-main.cjs` accetta `MASCOTTE_TEST_MAIN` e `MASCOTTE_TEST_ROOT` per selezionare codice installato e profilo isolato.
