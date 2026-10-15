# Windows — piano e prima anteprima

Aggiornamento 14 ottobre 2026: l’utente ha autorizzato lo sviluppo. La prima
app Electron è in `windows/`, con build ZIP Windows x64 0.3.0. Istruzioni e
limiti in `windows/README.md`, procedura di prova in `windows/PROVA-STASERA.md`.
UI e backend simulati verificati sul Mac; prova su Windows reale ancora da fare.
Il vecchio pacchetto Mac 0.2 rimane una fotografia precedente senza app Windows.

La versione Swift usa AppKit, Network, Darwin e percorsi macOS. Non può diventare un `.exe` copiando o ricompilando soltanto il bundle. Gli asset e il visore sono già utilizzabili su Windows.

## Parti riutilizzabili

| Componente | Azione |
| --- | --- |
| `characters/`, `spec/states.json` | Usare gli stessi file e il formato mascotte-pack/1 |
| `viewer/pack.js` e test | Riutilizzare parser/validazione; sincronizzare fallback con la spec |
| Sorgenti Rosso/Pillow | Già indipendenti dall'interfaccia desktop |
| Protocollo eventi | Mantenere POST /event, token, stati, limite richieste, timeout e binding loopback |
| Logica Swift di stati/timing | Portare e confrontare risultati con i test esistenti |
| UI, pipe/processi, endpoint privato | Riscrivere per Windows |
| `mascotte-notify` | Adattare: oggi usa getuid, O_NOFOLLOW e permessi POSIX; non dichiararlo compatibile così com'è |

## Percorso proposto

Per un primo prototipo valutare Electron: permette di riutilizzare JavaScript del visore e offre finestre trasparenti, always-on-top e gestione dei clic. È una proposta, non una dipendenza già introdotta. Rispetto all'app nativa può richiedere più RAM: misurare il prototipo prima di scegliere definitivamente. Per un'app solo Windows più piccola valutare .NET/WPF, con riscrittura dell'interfaccia. [BrowserWindow ufficiale](https://www.electronjs.org/docs/latest/api/browser-window)

## Fasi e criteri di completamento

1. **Mascotte offline:** finestra senza cornice, trasparenza, trascinamento, tray, scala/DPI, monitor multipli, temporizzazione, click sul solo gattino e ripiego degli stati. Usare i pacchetti esportati senza modificarli.
2. **Micro chat e account:** CLI native del destinatario, login ufficiale, input su stdin, processi asincroni, sessioni separate, stop/timeout e albero dei processi chiuso. Gestire eseguibili, wrapper `.cmd` e percorsi con spazi senza costruire comandi da testo della chat. Prima di collegare Codex risolvere l'isolamento della modalità solo chat; read-only non vieta la lettura.
3. **Dati locali:** `%LOCALAPPDATA%/Mascotte` per dati/log, ACL dell'utente per chat e token, blocco di reparse point e link nei pacchetti. Non tradurre 0600 in un chmod senza verificare gli accessi Windows.
4. **Eventi:** bridge nativo/Python adattato, token casuale per avvio, sole connessioni loopback, formato ridotto, rifiuto Origin e campi extra; non allentare i limiti del server macOS. Configuratore che rispetti hook e notify già presenti.
5. **Distribuzione:** build Windows x64, installer/disinstallazione con backup e ripristino degli hook, aggiornamenti e firma del binario. Gestire ARM64 solo dopo una prova dedicata; non promettere una build universale.
6. **Verifica su Windows reale:** macchina pulita, account del destinatario, entrambi backend con fixture e poi un invio reale, configurazioni vuote/esistenti, percorsi con spazi/Unicode, rete assente, limiti account, cancellazione, app chiusa, DPI/monitor/trasparenza. Misurare CPU/RAM/energia in riposo e chat. Il Mac attuale non consente di attestare queste prove.

## CLI native e WSL

Preferire un percorso coerente con CLI e app nello stesso ambiente Windows per la prima versione. Se si aggiunge WSL, trattarlo come un'integrazione separata: credenziali, percorsi, endpoint e localhost non vanno assunti condivisi. I login non devono essere importati dal creatore.

Documentazione verificata il 14 ottobre 2026:

- [Codex Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)
- [Claude Code setup e requisiti Windows](https://code.claude.com/docs/en/setup)
- [Codex login](https://learn.chatgpt.com/docs/auth)

**Prima azione successiva:** provare l’anteprima Windows sul PC dell’utente,
inclusi ACL, trasparenza/DPI, processi figli, login/hook reali e consumo risorse.
Firma, installer, import personaggi, ARM64 e aggiornamenti restano futuri.
