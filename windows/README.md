# Mascotte Windows 0.6.0 — anteprima da provare

Prima app Windows: gattino Rosso trasparente e trascinabile, menu nell'area di notifica, stati animati, micro chat Claude/Codex e server locale degli eventi. Il trascinamento e stato corretto e provato su Windows con monitor al 100% e 125%; le altre integrazioni richiedono verifica sul proprio PC. Non richiede Python, Node o Electron installati per eseguire il pacchetto pronto.

## Usare lo ZIP su Windows

### Personaggi (0.5.0)

Dal menu scegli **Personaggio → Cat → Rosso**. La grandezza viene ricordata.

### Aggancio (0.5.0)

Nel menu **Aggancio** scegli **barra delle applicazioni**, **finestra attiva** oppure **Libera / sgancia**. Per scegliere una finestra, portala in primo piano e usa il clic destro sulla mascotte. Segue il bordo superiore; trascinarla la sgancia. Riduzione a icona o cambio desktop nascondono la mascotte finché la finestra ritorna; chiusura della finestra la sgancia. L'aggancio alla barra viene ricordato al riavvio, quello a una finestra vale solo per la sessione.

Se manca spazio sopra una finestra massimizzata, la mascotte resta dentro l'area visibile. Con barra laterale o nascosta usa il bordo inferiore dell'area di lavoro: non segue le singole icone della barra. Gli stati IA continuano a funzionare.

Il seguito della finestra usa un solo processo PowerShell locale con API User32/DWM: legge coordinate, PID e visibilità della finestra scelta, senza screenshot, testo, titoli o invii alle IA. Controllo circa 30 volte al secondo durante l'aggancio, sospeso quando scegli Nascondi; processo chiuso allo sgancio. **Questa funzione nativa richiede ancora la prova su Windows reale.**

1. Estrai **tutto** `Mascotte-Windows-0.6.0-x64.zip` in una cartella stabile del tuo utente, per esempio `Mascotte` dentro la tua cartella utente. Non eseguire l'exe dentro lo ZIP. Mantieni accanto all'exe DLL, `resources/` e gli altri file.
2. Apri `Mascotte.exe`. Non serve avviarlo come amministratore. È un'anteprima non firmata: Windows può mostrare SmartScreen. Verifica provenienza e pacchetto prima di decidere se autorizzarlo; non disattivare la protezione del sistema.
3. Il gattino compare in basso a destra. Trascinalo per spostarlo. Clic sinistro apre la micro chat; clic destro e icona nell'area di notifica aprono il menu con grandezza, stati, mostra/nascondi ed Esci.
4. Per usare la chat installa **Codex CLI e/o Claude Code nativi Windows**, accedi con il tuo account e riapri la mascotte. Non basta il solo accesso nel browser e questa anteprima non collega automaticamente le CLI dentro WSL.

### Accesso alle IA

- Codex: segui la [guida Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox) e la [guida CLI](https://learn.chatgpt.com/docs/cli). Nel terminale `codex login` apre il login con ChatGPT; `codex login status` verifica l'accesso.
- Claude: segui [installazione e requisiti Windows](https://code.claude.com/docs/en/setup), poi avvia `claude` e completa l'accesso. Se richiede Git Bash, installalo secondo la guida ufficiale.
- Usa CLI aggiornate. La policy Codex usa opzioni verificate con 0.162.0-alpha.17.2; una versione che non le supporta può rifiutare il comando. La mascotte mostra l'errore e non ripiega su permessi più ampi.
- Il wrapper npm standard `codex.cmd` viene risolto al suo `codex.js` senza passare il messaggio a cmd.exe. Wrapper personalizzati `.bat`/`.ps1` non sono supportati; preferisci le installazioni ufficiali.
- Se le CLI sono in percorsi particolari, avvia dal terminale con `MASCOTTE_CHAT_CODEX` o `MASCOTTE_CHAT_CLAUDE` impostata sul loro eseguibile. Queste variabili non sono salvate nel pacchetto.

Nella chat scegli l'IA, scrivi e premi Invio (Maiusc+Invio va a capo). Interrompi ferma il processo, Nuova svuota solo la conversazione dell'IA scelta. Le cronologie sono separate. Ogni invio è una nuova sessione CLI con gli ultimi 20 messaggi della conversazione come contesto; la cronologia locale conserva al massimo 60 messaggi per IA. Le configurazioni personali del modello non vengono caricate: questa anteprima usa i modelli standard delle CLI, per tenere fuori le integrazioni personali.

### Eventi delle sessioni esterne

Nella micro chat premi **Collega eventi**, leggi l'anteprima e scegli **Applica con backup**. Questo passo è facoltativo: non serve per chattare dal gattino.

- Aggiorna solo i file del destinatario (`%USERPROFILE%\.claude\settings.json` e `%USERPROFILE%\.codex\config.toml`, o i percorsi `CLAUDE_CONFIG_DIR`/`CODEX_HOME`). Non legge i file di login.
- Conserva hook e notify esistenti e salva backup `*.before-mascotte-*`. La riscrittura può cambiare spazi/commenti TOML, ma mantiene i valori; l'originale completo è nel backup.
- Se la configurazione cambia tra anteprima e applicazione, l'app rifiuta la scrittura. Se gli hook Mascotte esistono già, non li duplica. Notify precedenti che sono wrapper shell richiedono configurazione manuale per preservarli.
- Codex: controlla e approva i nuovi hook quando Codex lo richiede; dalla CLI puoi usare `/hooks` per esaminarli e concedere fiducia. La CLI e l'estensione IDE usano la stessa configurazione Codex: dopo l'approvazione apri una nuova sessione nell'IDE. Riavvia anche le sessioni Claude. Non disabilitare le verifiche dei permessi.
- Claude usa la forma exec con argomenti separati per chiamare `Mascotte.exe --mascotte-notify …`; richiede una CLI che supporti `args` negli hook. Codex usa PowerShell 5.1 incluso in Windows con comando codificato per gestire percorsi con spazi senza interpolare i dati degli eventi. Lascia la cartella nello stesso percorso dopo la configurazione. Il ponte non apre finestre e non chiama le IA; trasmette solo stato e origine. L'avvio dei processi aggiunge un costo per evento, da misurare su Windows.

## Dati e privacy

- Dati locali in `%LOCALAPPDATA%\Mascotte`: `settings.json`, `chat\history.json`, `events.json` e record dei backup `hook-installation.json`; cache Electron in `electron\`.
- Chat JSON non cifrata: cartelle protette con ACL dell'utente tramite icacls. La corretta applicazione e il comportamento su sistemi aziendali vanno verificati su Windows.
- Nessun account o conversazione del creatore è incluso. La mascotte usa il login delle CLI del destinatario; non aggiunge API key. Le politiche del fornitore/organizzazione continuano ad applicarsi.
- L'app non cattura schermo, microfono o tastiera delle altre applicazioni. Gli invii della chat trasmettono messaggio e contesto al servizio scelto; le animazioni non consumano utilizzo IA.
- Claude: strumenti/MCP disabilitati, caricamento CLAUDE.md e auto-memory disabilitato per questa invocazione. Codex: config utente/rules ignorati, niente sessione persistente, comando/immagini locali/browser/app/plugin/subagent disabilitati, read-only. Su CLI Codex reale con backend finto la lista offerta contiene solo `request_user_input`, nessuno strumento che legge file o esegue comandi. Ripetere la verifica al cambio di versione; non è una garanzia universale per tutte le CLI future.
- Il server riceve POST /event su **127.0.0.1:8766**, token casuale per avvio. Richiesta max 4 KiB, body max 512 byte, timeout 1 s, 16 connessioni, 50 richieste/s. Origin, duplicati, campi extra e token errati sono respinti. Nessun ascolto sulla rete LAN.
- Due sessioni esterne concorrenti seguono l'ultimo evento; durante una risposta micro chat gli eventi esterni non la interrompono.

## Uscire o rimuovere

Esci dal menu della mascotte. Per rimuovere gli hook, elimina dalle configurazioni le voci che chiamano questo exe e ripristina l'eventuale notify precedente dal backup. Ripristina i file completi soltanto se nel frattempo non hai fatto altre modifiche. Poi elimina la cartella estratta. I dati locali restano in `%LOCALAPPDATA%\Mascotte`; cancellali solo se vuoi rimuovere anche la tua cronologia. Le credenziali delle CLI restano gestite da Codex/Claude.

## Limiti di questa anteprima

- Solo Windows x64; ARM64 non compilato né verificato. Nessun installer, avvio automatico o updater integrato; l'aggiornamento manuale da ZIP è descritto sotto Sviluppo. L'exe ha ancora l'icona/metadata del runtime Electron; tray e finestra mostrano Rosso.
- Incluso Rosso, selezionabile per categoria; import di altri pacchetti non ancora esposto nell’interfaccia Windows.
- Electron include Chromium: lo ZIP è circa 150 MB ed è più pesante dell'app nativa Mac. CPU/RAM/energia e costo dei processi hook si misurano sul PC nella prova.
- Trasparenza/click-through, DPI, ACL, chiusura dell'albero dei processi con taskkill, hook e login reali richiedono la prova Windows.
- UI verificata sul Mac con CLI simulate; nessuna chiamata a IA remota è stata fatta per collaudare il pacchetto.

## Sviluppo

Richiede Node 22+ e npm. In PowerShell usa `npm.cmd`: così eviti il blocco di `npm.ps1` dovuto alla Execution Policy e non devi cambiarla. Se il terminale parte dalla radice del repository, entra prima in `windows`:

```powershell
Set-Location .\windows
npm.cmd ci
npm.cmd start
npm.cmd run build:win
```

`npm.cmd ci` serve la prima volta o per ricreare `node_modules`; `npm.cmd start` avvia il sorgente; `npm.cmd run build:win` crea `dist\Mascotte-Windows-0.6.0-x64.zip` e copia l'app portatile completa nella radice del repository, così puoi aprire `Mascotte.exe` direttamente da lì. Lascia nella radice anche `resources/`, `locales/` e gli altri file copiati: sono necessari all'eseguibile. La build non aggiorna da sola una copia già estratta altrove.

Per sostituire una copia estratta con lo ZIP appena creato, prima esci da Mascotte e poi esegui dalla cartella `windows`:

```powershell
Set-Location .\windows
npm.cmd run update:win -- --archive ".\dist\Mascotte-Windows-0.6.0-x64.zip" --install-dir "$env:LOCALAPPDATA\Programs\Mascotte"
```

`--install-dir` deve indicare la cartella che contiene la vecchia `Mascotte.exe`; usa il percorso effettivo se l'hai estratta altrove. Il comando rifiuta di procedere se Mascotte è ancora aperta, prepara l'aggiornamento in una cartella temporanea e conserva la cartella precedente come `Mascotte.backup-<data>`. Non cancella i dati in `%LOCALAPPDATA%\Mascotte`.

Comandi rapidi PowerShell, sempre dalla cartella `windows`:

| Cosa fare | Comando |
| --- | --- |
| Installare/ricreare dipendenze | `npm.cmd ci` |
| Avviare il sorgente | `npm.cmd start` |
| Eseguire i test automatici | `npm.cmd test` |
| Creare lo ZIP Windows x64 | `npm.cmd run build:win` |
| Aggiornare una cartella estratta | `npm.cmd run update:win -- --archive ".\dist\Mascotte-Windows-0.6.0-x64.zip" --install-dir "<cartella-installazione>"` |

`resources` copia gli asset dalla radice della repo; non modificarli qui. Su Mac l'anteprima usa una cartella separata e `MASCOTTE_PREVIEW=1` sceglie una porta libera, preservando la mascotte nativa attiva. I test principali sono offline; `npm.cmd test` li esegue. `npm.cmd run test:codex-policy` usa opzionalmente la CLI Codex reale contro un mock locale con CODEX_HOME vuoto, senza login.

Riferimenti: [Electron sicurezza](https://www.electronjs.org/docs/latest/tutorial/security), [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [Codex config](https://learn.chatgpt.com/docs/config-file/config-reference), [variabili Claude](https://code.claude.com/docs/en/env-vars).
