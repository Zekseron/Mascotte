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

Restano: prova di utilizzo dell'installer da parte dell'utente, Claude con CLI/account reali, build e collaudo agente su Mac. Browser, plugin e flussi MCP completi non fanno parte di questa prima anteprima. I test simulati non dimostrano l'isolamento effettivo di tutte le versioni delle CLI o di tutti gli strumenti. Interrompere un agente non ripristina i file già modificati.

Fixture esplicite (non eseguite dalla suite ordinaria): `test/fixtures/agent-live.cjs` usa il vero account Codex soltanto su dati sintetici; `agent-main.cjs`, `agent-ui.cjs` e `agent-package.cjs` verificano integrazione, layout e contenuti del pacchetto.
