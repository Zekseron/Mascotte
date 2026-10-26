# Mascotte Windows 0.6.0 — anteprima da provare

Prima app Windows: gattino Rosso trasparente e trascinabile, menu nell'area di notifica, stati animati, micro chat Claude/Codex e server locale degli eventi. Il trascinamento e stato corretto e provato su Windows con monitor al 100% e 125%; le altre integrazioni richiedono verifica sul proprio PC. Non richiede Python, Node o Electron installati per eseguire il pacchetto pronto.

## Usare lo ZIP su Windows

### Personaggi (0.5.0)

Dal menu scegli **Personaggio → Cat → Rosso**. La grandezza viene ricordata.

### Aggancio (0.5.0)

Nel menu **Aggancio** scegli **barra delle applicazioni**, **finestra attiva** oppure **Libera / sgancia**. Per scegliere una finestra, portala in primo piano e usa il clic destro sulla mascotte. Segue il bordo superiore; trascinarla la sgancia. Riduzione a icona o cambio desktop nascondono la mascotte finché la finestra ritorna; chiusura della finestra la sgancia. L'aggancio alla barra viene ricordato al riavvio, quello a una finestra vale solo per la sessione.

Se manca spazio sopra una finestra massimizzata, la mascotte resta dentro l'area visibile. Con barra laterale o nascosta usa il bordo inferiore dell'area di lavoro: non segue le singole icone della barra. Gli stati IA continuano a funzionare.

Il seguito della finestra usa un processo PowerShell locale con API User32/DWM e legge solo coordinate, PID e visibilità: l'aggancio non acquisisce immagini o testo. La chat offre separatamente l'osservazione locale di una finestra, che resta spenta finché non la attivi. **Cattura e permessi vanno ancora provati su Windows reale.**

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

### Osservare una finestra e condividere un fotogramma

1. Apri la micro chat, premi **Scegli finestra**, seleziona una finestra e premi **Osserva**. La mascotte acquisisce solo la finestra selezionata e mostra un'anteprima locale. L'osservazione è spenta all'avvio e non viene ricordata al riavvio dell'app.
2. Finché osservi, la finestra e il flusso video restano sul PC. L'app non li scrive nella cronologia. Premi **Smetti** nella chat oppure **Osservazione → Interrompi osservazione** nel menu della mascotte per fermare e azzerare il flusso.
3. Per passare un'immagine all'IA, scrivi una domanda, premi **Allega fotogramma…**, controlla l'anteprima e poi **Conferma e invia**. Senza questa conferma, l'immagine non viene inviata. La conferma vale per un solo fotogramma e un solo messaggio. Una volta confermato, l'immagine viene inviata al servizio scelto usando il tuo account Codex o Claude; l'uso e il trattamento successivi dipendono dal servizio. L'immagine non viene aggiunta alla cronologia Mascotte. Il file temporaneo usato per Codex viene eliminato a fine chiamata e ripulito al successivo avvio se l'app era stata interrotta.

Il controllo della finestra e l'anteprima non inviano dati in rete. La normale micro chat invia il testo delle domande al servizio selezionato; il contenuto visivo viene condiviso solo con la conferma sopra. L'osservazione termina quando esci dall'app.

### Eventi delle sessioni esterne

Nella micro chat apri la scheda **Gestione**, premi **Crea / aggiorna hook**, leggi l'anteprima e scegli **Applica con backup**. Questo passo è facoltativo: non serve per chattare dal gattino.

- Aggiorna solo i file del destinatario (`%USERPROFILE%\.claude\settings.json` e `%USERPROFILE%\.codex\config.toml`, o i percorsi `CLAUDE_CONFIG_DIR`/`CODEX_HOME`). Non legge i file di login.
- Conserva gli hook e le notifiche delle altre integrazioni e salva backup `*.before-mascotte-*`. Rimuove i vecchi wrapper notify Mascotte, anche quando sono annidati nei wrapper del desktop Codex, e conserva il wrapper desktop più esterno. La riscrittura può cambiare spazi/commenti TOML; l'originale completo è nel backup.
- Se la configurazione cambia tra anteprima e applicazione, l'app rifiuta la scrittura. Gli hook Mascotte già presenti vengono aggiornati senza duplicarli. Una catena notify illeggibile viene segnalata senza applicare modifiche.
- Codex: controlla e approva i nuovi hook quando Codex lo richiede; dalla CLI puoi usare `/hooks` per esaminarli e concedere fiducia. La CLI e l'estensione IDE usano la stessa configurazione Codex: dopo l'approvazione apri una nuova sessione nell'IDE. Riavvia anche le sessioni Claude. Non disabilitare le verifiche dei permessi.
- Claude e Codex usano PowerShell 5.1 incluso in Windows per avviare `lib/notify-entry.cjs` dentro `resources/app.asar`, tramite il runtime Node incluso in `Mascotte.exe`. Il launcher imposta `ELECTRON_RUN_AS_NODE=1` solo per il processo figlio e scrive il JSON UTF-8 direttamente sulla sua pipe stdin. L'app grafica non viene avviata dal ponte; non occorrono Node o Python installati. Il contenuto degli eventi non entra nella riga di comando. `Stop` segnala la fine della risposta, quindi Mascotte non aggiunge più un proprio `notify`.
- Lascia la cartella nello stesso percorso dopo la configurazione. Gli hook hanno un limite di 5 secondi (3 per `Interrupt`, come richiesto da Codex); il launcher termina il ponte se supera 2 secondi. Il ponte non apre finestre e non chiama le IA: trasmette solo stato e origine. I nuovi comandi richiedono una nuova approvazione tramite il normale controllo degli hook Codex.

### Aggiornare dalla scheda Gestione

1. Apri la mascotte e passa a **Gestione**. Premi **Scegli repo…** e seleziona il clone Git di `github.com/Zekseron/Mascotte`. La cartella viene ricordata. Se hai scaricato solo lo ZIP del sorgente, serve prima un clone Git per usare questo aggiornamento automatico.
2. Salva o committa le modifiche locali. Premi **Aggiorna e riavvia** e controlla repo e destinazione nella finestra di conferma. Il pulsante richiede Git e Node.js 22+ con npm nel PATH del PC: scarica il ramo seguito da `origin` con `git pull --ff-only`, esegue `npm ci` e crea il pacchetto Windows. Lo stato di avanzamento compare nella scheda. Non esegue reset o merge delle modifiche locali.
3. Quando il pacchetto è pronto, l'installer lo estrae e controlla prima di chiudere la mascotte. Sostituisce la cartella dell'app, conserva quella precedente come `Mascotte.backup-<data>` e riavvia la nuova versione. Se la sostituzione fallisce, prova a ripristinare la cartella precedente. Un errore prima dell'installazione lascia l'app attuale al suo posto; la repo potrebbe essere già aggiornata.

Se avvii l'app dalla repo, l'aggiornamento la installa in `%LOCALAPPDATA%\Programs\Mascotte`, separando app e sorgenti. In questo caso, dopo il riavvio premi **Crea / aggiorna hook** e applica l'anteprima per registrare il nuovo percorso. Se la cartella dell'app rimane la stessa, gli hook mantengono il loro percorso; puoi comunque aggiornarli dallo stesso pulsante.

L'esito dell'installazione appare in **Gestione** al successivo avvio; i dettagli sono in `%LOCALAPPDATA%\Mascotte\update.log`. Non chiudere la mascotte durante l'aggiornamento: uscire interrompe download o build ancora in corso. L'aggiornamento usa la rete per Git e npm; non invia la vista locale o le conversazioni della chat.

## Dati e privacy

- Dati locali in `%LOCALAPPDATA%\Mascotte`: `settings.json`, `chat\history.json`, `events.json` e record dei backup `hook-installation.json`; cache Electron in `electron\`.
- Chat JSON non cifrata: cartelle protette con ACL dell'utente tramite icacls. La corretta applicazione e il comportamento su sistemi aziendali vanno verificati su Windows.
- Nessun account o conversazione del creatore è incluso. La mascotte usa il login delle CLI del destinatario; non aggiunge API key. Le politiche del fornitore/organizzazione continuano ad applicarsi.
- L'app non cattura microfono o tastiera delle altre applicazioni. La cattura visiva è una funzione Windows facoltativa e locale, spenta per impostazione predefinita; un fotogramma raggiunge il servizio IA solo dopo l'anteprima e la conferma dell'utente. Gli invii della chat trasmettono messaggio e contesto al servizio scelto; le animazioni non consumano utilizzo IA.
- Claude: strumenti/MCP disabilitati, caricamento CLAUDE.md e auto-memory disabilitato per questa invocazione. Codex: config utente/rules ignorati, niente sessione persistente, comando/immagini locali/browser/app/plugin/subagent disabilitati, read-only. Su CLI Codex reale con backend finto la lista offerta contiene solo `request_user_input`, nessuno strumento che legge file o esegue comandi. Ripetere la verifica al cambio di versione; non è una garanzia universale per tutte le CLI future.
- Il server riceve POST /event su **127.0.0.1:8766**, token casuale per avvio. Richiesta max 4 KiB, body max 512 byte, timeout 1 s, 16 connessioni, 50 richieste/s. Origin, duplicati, campi extra e token errati sono respinti. Nessun ascolto sulla rete LAN.
- Due sessioni esterne concorrenti seguono l'ultimo evento; durante una risposta micro chat gli eventi esterni non la interrompono.

## Uscire o rimuovere

Esci dal menu della mascotte. Per rimuovere gli hook, elimina dalle configurazioni le voci che chiamano questo exe e ripristina l'eventuale notify precedente dal backup. Ripristina i file completi soltanto se nel frattempo non hai fatto altre modifiche. Poi elimina la cartella estratta. I dati locali restano in `%LOCALAPPDATA%\Mascotte`; cancellali solo se vuoi rimuovere anche la tua cronologia. Le credenziali delle CLI restano gestite da Codex/Claude.

## Limiti di questa anteprima

- Solo Windows x64; ARM64 non compilato né verificato. Aggiornamento integrato dalla repo nella scheda Gestione; richiede Git e Node/npm sul PC che compila. Nessun installer iniziale o avvio automatico. L'exe ha ancora l'icona/metadata del runtime Electron; tray e finestra mostrano Rosso.
- Incluso Rosso, selezionabile per categoria; import di altri pacchetti non ancora esposto nell’interfaccia Windows.
- Electron include Chromium: lo ZIP è circa 150 MB ed è più pesante dell'app nativa Mac. CPU/RAM/energia e costo dei processi hook si misurano sul PC nella prova.
- Trasparenza/click-through, DPI, ACL, chiusura dell'albero dei processi con taskkill, hook e login reali richiedono la prova Windows.
- UI verificata sul Mac con CLI simulate; nessuna chiamata a IA remota è stata fatta per collaudare il pacchetto.

## Sviluppo

Richiede Node 22+ e npm. In PowerShell usa `npm.cmd`: così eviti il blocco di `npm.ps1` dovuto alla Execution Policy e non devi cambiarla. Se il terminale parte dalla radice del repository, entra prima in `windows`:

### Preparare una build dal repository e collegare gli hook

Questa è la procedura per chi ha scaricato il sorgente da GitHub o come archivio. Aggiornamenti e configurazione degli hook nella scheda **Gestione** sono disponibili nella build Windows impacchettata; in `npm.cmd start` i pulsanti sono disabilitati.

1. Su Windows x64 installa Node.js 22 o successivo. Non servono Python, Git Bash o Node sul computer che userà in seguito il pacchetto; Node serve qui solo per creare la build. Estrai o clona il repository in una cartella stabile, poi apri PowerShell in `windows`:

   ```powershell
   Set-Location C:\percorso\Mascotte-main\windows
   npm.cmd ci
   npm.cmd run build:win
   ```

   La build crea `dist\Mascotte-Windows-0.6.0-x64.zip`. Se `npm.cmd ci` fallisce, controlla `node --version` (almeno `v22`) e riprova senza cambiare l'ExecutionPolicy.

2. Estrai **tutto** lo ZIP in una cartella che non sposterai, ad esempio `%LOCALAPPDATA%\Programs\Mascotte`. In PowerShell, dalla cartella `windows`:

   ```powershell
   $installDir = Join-Path $env:LOCALAPPDATA 'Programs\Mascotte'
   New-Item -ItemType Directory -Force -Path $installDir | Out-Null
   Expand-Archive -LiteralPath '.\dist\Mascotte-Windows-0.6.0-x64.zip' -DestinationPath $installDir -Force
   ```

   Avvia `Mascotte.exe` da quella cartella, non dallo ZIP. Mantieni lì anche DLL e `resources`. Scegli un percorso stabile; non deve contenere `%`, virgolette o ritorni a capo. Spostare o cancellare la cartella dopo aver collegato gli hook ne interrompe l'avvio: in quel caso estrai di nuovo in un percorso stabile e ripeti il collegamento.

3. Installa e accedi alla CLI nativa Windows di Codex e/o Claude Code che vuoi usare. Apri Mascotte dal percorso stabile e fai clic sul gattino per aprire la micro chat. Nella scheda **Gestione** premi **Crea / aggiorna hook** e leggi l'anteprima dei due file di configurazione. Premi **Applica con backup** solo quando vuoi scrivere le modifiche.

   L'app salva copie `*.before-mascotte-*` dei file esistenti e aggiorna le configurazioni dell'account Windows corrente: `%USERPROFILE%\.claude\settings.json` e `%USERPROFILE%\.codex\config.toml`, salvo percorsi personalizzati tramite `CLAUDE_CONFIG_DIR` o `CODEX_HOME`. Non condivide né importa le credenziali. Gli hook e i notify di altre integrazioni vengono conservati; l'app segnala una catena notify che non riesce a leggere e non la applica.

4. In Codex controlla gli hook proposti con `/hooks` e approvali tramite il normale flusso di fiducia di Codex. Poi chiudi e riapri le sessioni Codex e Claude già aperte. Per una verifica, avvia una nuova sessione e invia un prompt o usa uno strumento: la mascotte dovrebbe mostrare gli stati della sessione. La prova della micro chat e la prova degli hook sono separate; per ricevere eventi non è necessario inviare messaggi dalla micro chat.

Se non arrivano eventi, verifica che Mascotte sia ancora nella cartella registrata, che le CLI usino i percorsi di configurazione indicati sopra e che Codex abbia approvato gli hook. Apri una nuova sessione dopo le modifiche. Puoi riaprire **Gestione → Crea / aggiorna hook** per aggiornare la configurazione al percorso dell'app attuale.

### Avvio e build di sviluppo

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
