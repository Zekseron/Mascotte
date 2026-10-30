# Mascotte 0.8.2 — app comune per Windows e Mac (anteprima da provare)

Questa cartella contiene l'app Electron usata su **Windows x64** e su **Mac Apple Silicon** (il nome `windows/` è rimasto da quando era solo Windows; rinominarla è rimandato). Le istruzioni per Windows sono in questa prima parte; quelle per il Mac nella sezione [Mac (Apple Silicon)](#mac-apple-silicon) più in basso. La vecchia app Swift per Mac è in `../app/` e non è più sviluppata. Guide per chi riceve l'app: [LEGGIMI.md](../LEGGIMI.md) e [WINDOWS.md](../WINDOWS.md); dati e privacy: [PRIVACY.md](../PRIVACY.md); release: [PUBBLICAZIONE.md](../PUBBLICAZIONE.md); esito del collaudo Mac: [COLLAUDO-MAC.md](COLLAUDO-MAC.md).

Prima app Windows: gattino Rosso trasparente e trascinabile, menu nell'area di notifica, stati animati, micro chat Claude/Codex e server locale degli eventi. Il trascinamento e stato corretto e provato su Windows con monitor al 100% e 125%; le altre integrazioni richiedono verifica sul proprio PC. Non richiede Python, Node o Electron installati per eseguire il pacchetto pronto.

## Installare su Windows

Apri `Mascotte-Setup-0.8.0-x64.exe` per installare Mascotte nel profilo Windows e creare il collegamento. L'installer non richiede Git o Node.js. L'app e l'installer sono ancora privi di firma digitale: Windows potrebbe chiedere una verifica della provenienza. Per rimuoverla usa **Impostazioni → App → Mascotte → Disinstalla**; le impostazioni e la chat in `%LOCALAPPDATA%\Mascotte` restano sul PC.

In alternativa puoi usare la versione portatile ZIP descritta qui sotto. Entrambi i pacchetti sono creati dalla build Windows; saranno disponibili nella pagina delle release solo dopo la pubblicazione della prima release.

### Personaggi e Impostazioni

Dal menu della mascotte scegli **Personaggio → Cat → Rosso**; la grandezza viene ricordata per ogni personaggio.

**Impostazioni.** L'ingranaggio in alto a destra della micro chat sostituisce la vecchia scheda Gestione. Il pannello ha sezioni a fisarmonica (Mascotte, IA locale, Codex e Claude, Note, Cartelle visibili, Hook, Aggiornamenti), ognuna con un riepilogo a destra; le sezioni aperte vengono ricordate. «← Chat» o di nuovo l'ingranaggio tornano alla conversazione; se l'osservazione di una finestra è attiva, accanto al titolo compare «● osserva».

**Mascotte personali.** In **Impostazioni → Mascotte** si sceglie il personaggio e la grandezza di base (1×–6×, stessi limiti del menu della mascotte, sempre allineati con esso). Con **Aggiungi mascotte…** si carica una cartella con `character.json` e `sprites.png`: Mascotte la convalida per intero con le stesse regole dei personaggi inclusi, ne copia solo i due file in `characters/<id>/` nella cartella dati (Windows `%LOCALAPPDATA%\Mascotte`, Mac `~/Library/Application Support/Mascotte Electron`) e la aggiunge al menu Personaggio (categoria «Personali»). Un pacchetto personale non valido all'avvio viene saltato con un avviso; un id uguale a quello di un personaggio incluso è rifiutato. **Rimuovi** elimina la mascotte (se era in uso torna Rosso; Rosso non si rimuove). Formato, creazione e prova nel visore: [PERSONAGGI.md](../PERSONAGGI.md); il pulsante «Come creare una mascotte» apre la stessa guida su GitHub.

### Aggancio (0.5.0)

Nel menu **Aggancio** scegli **barra delle applicazioni**, **finestra attiva** oppure **Libera / sgancia**. Per scegliere una finestra, portala in primo piano e usa il clic destro sulla mascotte. Segue il bordo superiore; trascinarla la sgancia. Riduzione a icona o cambio desktop nascondono la mascotte finché la finestra ritorna; chiusura della finestra la sgancia. L'aggancio alla barra viene ricordato al riavvio, quello a una finestra vale solo per la sessione.

Se manca spazio sopra una finestra massimizzata, la mascotte resta dentro l'area visibile. Con barra laterale o nascosta usa il bordo inferiore dell'area di lavoro: non segue le singole icone della barra. Gli stati IA continuano a funzionare.

Il seguito della finestra usa un processo PowerShell locale con API User32/DWM e legge solo coordinate, PID e visibilità: l'aggancio non acquisisce immagini o testo. La chat offre separatamente l'osservazione locale di una finestra, che resta spenta finché non la attivi. Cattura, arresto e conferma del fotogramma sono stati verificati su Windows con una finestra sintetica e CLI simulate locali; le risposte visive dei servizi IA con account reali restano da provare.

1. Per la versione portatile, estrai **tutto** `Mascotte-Windows-0.8.0-x64.zip` in una cartella stabile del tuo utente, per esempio `Mascotte` dentro la tua cartella utente. Non eseguire l'exe dentro lo ZIP. Mantieni accanto all'exe DLL, `resources/` e gli altri file.
2. Apri `Mascotte.exe`. Non serve avviarlo come amministratore. È un'anteprima non firmata: Windows può mostrare SmartScreen. Verifica provenienza e pacchetto prima di decidere se autorizzarlo; non disattivare la protezione del sistema.
3. Il gattino compare in basso a destra. Trascinalo per spostarlo. Clic sinistro apre la micro chat; clic destro e icona nell'area di notifica aprono il menu con grandezza, stati, mostra/nascondi ed Esci.
4. Per la chat scegli Ollama locale oppure installa **Codex CLI e/o Claude Code nativi Windows** e accedi con il tuo account. Per i servizi remoti non basta il solo accesso nel browser; questa anteprima non collega automaticamente le CLI dentro WSL.

### Chat locale, memoria e azioni

Installa [Ollama per Windows](https://ollama.com/download/windows), avvialo e scegli uno dei modelli in **Impostazioni > IA locale**. Premi **Scarica / aggiorna modello**: il predefinito Qwen3 4B instruct richiede circa 2,5 GB; il modello 1.7B circa 1,4 GB, ma e meno affidabile. Al termine della verifica scegli **Locale ? Ollama** nella chat. Le conversazioni locali sono separate da Codex e Claude. Se il modello e gia disponibile all'avvio, viene scelto automaticamente.

La chat locale usa `127.0.0.1:11434` e richiede un modello GGUF presente sul PC; non passa automaticamente a un servizio remoto. Nessun modello cloud di Ollama viene usato dalla chat locale: i modelli già presenti nel tuo Ollama (**Impostazioni > IA locale > Cerca motori locali**) sono selezionabili solo se girano sul computer, generano testo e hanno un formato accettato; i modelli cloud o dubbi compaiono tra gli esclusi con il motivo. Mascotte non scarica né aggiorna modelli fuori catalogo. Per disabilitare anche le funzioni cloud di Ollama, segui la [configurazione local-only](https://docs.ollama.com/faq#how-can-i-disable-ollamas-cloud-features). Il download iniziale di Ollama e del modello richiede Internet. Il modello viene scaricato dalla RAM dopo ogni risposta, per liberare risorse; ricaricarlo può rendere più lenta la risposta successiva. Modelli piccoli possono dare risposte inesatte: verifica le informazioni importanti. I modelli Qwen3 testuali accettano solo testo; Qwen3-VL 2B e 4B Instruct accettano anche il fotogramma allegato e confermato.

**Altri motori locali.** Chi usa già LM Studio, il server di llama.cpp o Jan può sceglierli in **Impostazioni > IA locale > Motore locale**, senza scaricare modelli in Ollama. Avvia prima il loro server locale (LM Studio: scheda Developer, porta 1234; Jan: server API, porta 1337; llama.cpp: `llama-server`, porta 9931 o 8080), poi premi **Cerca motori locali**. Mascotte non li avvia, non li chiude e non scarica modelli: i modelli si gestiscono dal programma scelto. Si collega solo a `127.0.0.1` sulle porte predefinite (nessun indirizzo libero, nessun redirect, nessuna chiave API: un server che richiede autenticazione non è utilizzabile). Il modello si sceglie solo dall'elenco restituito dal server; i modelli che sembrano remoti o proxy verso servizi online (nomi come `gpt-4`, `claude`, `gemini`, `openai/`, `-cloud`) sono esclusi per prudenza con il motivo (controllo euristico). Gli allegati con immagini si attivano solo se il server dichiara che il modello le legge. Se il motore si ferma o il modello sparisce, Mascotte torna a Ollama e al modello predefinito con un messaggio. Su Windows le porte e il comportamento sono gli stessi (da riprovare).

**llama.cpp (Mascotte).** Voce **llama.cpp (Mascotte)** del menu Motore locale (prima versione, nata su Mac con codice comune a Mac e Windows; **su Windows non ancora provata**): Mascotte scarica da sé il runtime e il modello, poi avvia e chiude il server. Premi **Scarica llama.cpp e modello**: la finestra di conferma mostra i file (build `b11982` di llama.cpp da github.com, licenza MIT; Gemma 4 E4B con proiettore delle immagini da huggingface.co, licenza Apache 2.0), il totale (circa 5,2 GB sul Mac) e lo spazio richiesto. Ogni file è verificato per dimensione e SHA-256 fissati nel codice prima dell'uso; l'annullamento cancella i file parziali. I file stanno in `<cartella dati>/llama/runtime/<build>/` e `<cartella dati>/llama/models/`; **Elimina file** li rimuove. Il server parte alla prima risposta (il primo caricamento può richiedere decine di secondi), ascolta solo su `127.0.0.1` su una porta libera, si chiude dopo 2 minuti di inattività e quando esci da Mascotte. Su Mac usa la build Apple Silicon; su Windows x64 la build Vulkan (CPU come ripiego presente nel catalogo ma non ancora selezionabile dall'interfaccia; CUDA da valutare dopo le prove con la RTX 5050). Per aggiornare la build o il modello si modifica il catalogo in `lib/llama-runtime.cjs` (scelta esplicita, mai automatica). Il preset **llama.cpp** qui sopra resta invariato: si collega a un server avviato da te.

Se un runtime autonomo è presente in `%LOCALAPPDATA%\Mascotte\local-ai\runtime` e i modelli sono nella sottocartella `local-ai\models`, Mascotte può avviarlo in locale quando non trova un servizio già in esecuzione. Questo runtime viene avviato con le funzioni cloud disabilitate e viene fermato all'uscita di Mascotte. Un server Ollama esterno già attivo rimane gestito dalla sua installazione.

Il primo invio a Codex o a Claude dopo l'avvio chiede conferma e mostra il messaggio e l'eventuale cronologia; i messaggi successivi allo stesso servizio partono senza chiedere finché Mascotte resta aperta (fotogrammi e secondo parere chiedono sempre). Dopo una risposta locale, **Chiedi a Codex o Claude…** prepara un testo modificabile, senza includere automaticamente le note locali o la cronologia remota. Solo la conferma invia il testo e usa il piano del servizio scelto. Se la risposta locale riguardava un fotogramma, oppure se stai osservando una finestra, compare anche **Secondo parere con schermata…**: la conferma mostra l'anteprima dell'immagine e permette di toglierla. Il fotogramma analizzato dal modello locale resta solo in memoria per 10 minuti (si cancella prima con «Nuova» o chiudendo Mascotte).

Le risposte possono essere salvate con **Ricorda…**, dopo averle controllate o modificate; in **Impostazioni → Note** si possono aggiungere e cancellare note. Sono salvate in `%LOCALAPPDATA%\Mascotte\chat\memory.json`, con le stesse protezioni della cartella chat, senza cifratura. Prima di ogni domanda locale vengono cercate fino a cinque note con parole in comune: la ricerca non riconosce sempre sinonimi o concetti equivalenti. Le note sono contesto recuperabile, non addestramento del modello, e non sono condivise automaticamente con Codex o Claude.

Le azioni sul PC nella chat locale sono volutamente limitate: aprire la Calcolatrice e le cartelle Download, Documenti, Scrivania e Immagini, anche con frasi naturali («puoi aprirmi la calcolatrice?», «mi apri i download per favore»). Su Mac si possono aprire anche le app installate («lancia Terminale»); su Windows l'apertura di app qualsiasi non è ancora disponibile. La mascotte mostra ogni azione e la esegue soltanto dopo conferma; non esegue comandi arbitrari generati dal modello.

La chat locale può anche «vedere» le cartelle Download, Documenti, Scrivania e Immagini, ma solo con il motore **Locale** e senza chiedere conferma: legge un solo livello (nessuna sottocartella), solo nome, tipo, dimensione e data, mai il contenuto dei file, ignora i file nascosti e non segue i link simbolici. In chat compare sempre l'avviso «Ho letto l'elenco di Download: N elementi.». Domande semplici come «quanti pdf ho in download?», «che file ho nella scrivania?» o «ci sono file doppi nei documenti?» sono risolte da Mascotte stessa, senza il modello, con conteggi esatti; i doppi sono solo probabili (stesso nome a meno di « (1)» o « copia», oppure stessa dimensione ed estensione). Le altre domande («qual è il pdf più recente?», «quali file posso cancellare?») arrivano al modello locale con l'elenco compatto e i conteggi già calcolati. L'elenco resta sul computer, va solo a Ollama su `127.0.0.1`, non entra nella cronologia (restano domanda e risposta) e non è scritto nel log. Con Codex e Claude la funzione è disattivata e nessun elenco viene inviato. Le altre cartelle non sono leggibili, a meno che tu non le aggiunga: in **Impostazioni → Cartelle visibili alla mascotte** i pulsanti **Aggiungi cartella…** e **Rimuovi** gestiscono un elenco personale (al massimo 20 cartelle, salvato in `extraFolders` di `settings.json`). La cartella si sceglie solo con il selettore di sistema, mai scrivendo un percorso in chat; poi si usa il suo nome: «che file ho in siti?», «quanti pdf ci sono in siti?», «apri siti» (con conferma). Valgono le stesse regole di sola lettura (un livello, nessun contenuto). Il nome deve essere diverso da quello delle cartelle predefinite e delle altre aggiunte (altrimenti compare «Esiste già una cartella chiamata X»; rinomina la cartella o scegline un'altra). Sono rifiutate la radice del disco, le cartelle di sistema (su Windows `C:\Windows` e `C:\Program Files*`), `AppData`, la cartella dati di Mascotte, le cartelle nascoste e di configurazione (`.claude`, `.codex`, `.ssh`, `.gnupg`); la tua cartella utente è ammessa. A ogni lettura o apertura Mascotte ricontrolla che la cartella esista ancora e sia la stessa; altrimenti risponde che non è più disponibile e va rimossa o aggiunta di nuovo. Se citi una cartella che non è nell'elenco con parole chiave chiare («che file ho in progetti?»), Mascotte risponde che non la vede e come aggiungerla. Codice in `lib/folder-view.cjs` e `lib/extra-folders.cjs`.

### Accesso alle IA remote

- Codex: segui la [guida Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox) e la [guida CLI](https://learn.chatgpt.com/docs/cli). Nel terminale `codex login` apre il login con ChatGPT; `codex login status` verifica l'accesso.
- Claude: segui [installazione e requisiti Windows](https://code.claude.com/docs/en/setup), poi avvia `claude` e completa l'accesso. Se richiede Git Bash, installalo secondo la guida ufficiale.
- Usa CLI aggiornate. La policy Codex usa opzioni verificate con 0.162.0-alpha.17.2; una versione che non le supporta può rifiutare il comando. La mascotte mostra l'errore e non ripiega su permessi più ampi.
- Il wrapper npm standard `codex.cmd` viene risolto al suo `codex.js` senza passare il messaggio a cmd.exe. Wrapper personalizzati `.bat`/`.ps1` non sono supportati; preferisci le installazioni ufficiali.
- Se le CLI sono in percorsi particolari, avvia dal terminale con `MASCOTTE_CHAT_CODEX` o `MASCOTTE_CHAT_CLAUDE` impostata sul loro eseguibile. Queste variabili non sono salvate nel pacchetto.

Nella chat scegli l'IA, scrivi e premi Invio (Maiusc+Invio va a capo). Interrompi ferma la richiesta, Nuova svuota solo la conversazione dell'IA scelta. Le cronologie sono separate. Per Codex e Claude ogni invio è una nuova sessione CLI con al massimo gli ultimi 20 messaggi della conversazione come contesto; la richiesta di approfondimento dalla chat locale parte invece senza cronologia precedente. Codex e Claude possono usare la ricerca web live quando serve e citare le fonti; non ricevono strumenti per leggere o modificare file, eseguire comandi, usare altre integrazioni o avviare agenti. La cronologia locale conserva al massimo 60 messaggi per IA. Le configurazioni personali del modello remoto non vengono caricate: questa anteprima usa i modelli standard delle CLI, per tenere fuori le integrazioni personali.

### Osservare una finestra e condividere un fotogramma

1. Apri la micro chat, premi la sezione **Finestra da condividere** (l'elenco si aggiorna da solo; **Aggiorna elenco** lo ricarica), seleziona una finestra e premi **Osserva**. La mascotte acquisisce solo la finestra selezionata e mostra un'anteprima locale. L'osservazione è spenta all'avvio e non viene ricordata al riavvio dell'app.
2. Finché osservi, la finestra e il flusso video restano sul PC. L'app non li scrive nella cronologia. Premi **Smetti** nella chat oppure **Osservazione → Interrompi osservazione** nel menu della mascotte per fermare e azzerare il flusso.
3. Per passare un'immagine all'IA, scrivi una domanda, premi **Allega fotogramma…**, controlla l'anteprima e poi **Conferma e invia**. Senza questa conferma, l'immagine non viene inviata. La conferma vale per un solo fotogramma e un solo messaggio. Una volta confermato, l'immagine viene inviata al servizio scelto usando il tuo account Codex o Claude; l'uso e il trattamento successivi dipendono dal servizio. L'immagine non viene aggiunta alla cronologia Mascotte. Il file temporaneo usato per Codex viene eliminato a fine chiamata e ripulito al successivo avvio se l'app era stata interrotta.

Il controllo della finestra e l'anteprima non inviano dati in rete. La normale micro chat invia il testo delle domande al servizio selezionato; il contenuto visivo viene condiviso solo con la conferma sopra. L'osservazione termina quando esci dall'app.

### Eventi delle sessioni esterne

Nella micro chat apri le **Impostazioni** (ingranaggio in alto a destra), premi **Crea / aggiorna hook**, leggi l'anteprima e scegli **Applica con backup**. Questo passo è facoltativo: non serve per chattare dal gattino.

- Aggiorna solo i file del destinatario (`%USERPROFILE%\.claude\settings.json` e `%USERPROFILE%\.codex\config.toml`, o i percorsi `CLAUDE_CONFIG_DIR`/`CODEX_HOME`). Non legge i file di login.
- Conserva gli hook e le notifiche delle altre integrazioni e salva backup `*.before-mascotte-*`. Rimuove i vecchi wrapper notify Mascotte, anche quando sono annidati nei wrapper del desktop Codex, e conserva il wrapper desktop più esterno. La riscrittura può cambiare spazi/commenti TOML; l'originale completo è nel backup.
- Se la configurazione cambia tra anteprima e applicazione, l'app rifiuta la scrittura. Gli hook Mascotte già presenti vengono aggiornati senza duplicarli. Una catena notify illeggibile viene segnalata senza applicare modifiche.
- Codex: controlla e approva i nuovi hook quando Codex lo richiede; dalla CLI puoi usare `/hooks` per esaminarli e concedere fiducia. La CLI e l'estensione IDE usano la stessa configurazione Codex: dopo l'approvazione apri una nuova sessione nell'IDE. Riavvia anche le sessioni Claude. Non disabilitare le verifiche dei permessi.
- Claude e Codex usano PowerShell 5.1 incluso in Windows per avviare `lib/notify-entry.cjs` dentro `resources/app.asar`, tramite il runtime Node incluso in `Mascotte.exe`. Il launcher imposta `ELECTRON_RUN_AS_NODE=1` solo per il processo figlio e scrive il JSON UTF-8 direttamente sulla sua pipe stdin. L'app grafica non viene avviata dal ponte; non occorrono Node o Python installati. Il contenuto degli eventi non entra nella riga di comando. `Stop` segnala la fine della risposta, quindi Mascotte non aggiunge più un proprio `notify`.
- Lascia la cartella nello stesso percorso dopo la configurazione. Gli hook hanno un limite di 5 secondi (3 per `Interrupt`, come richiesto da Codex); il launcher termina il ponte se supera 2 secondi. Il ponte non apre finestre e non chiama le IA: trasmette solo stato e origine. I nuovi comandi richiedono una nuova approvazione tramite il normale controllo degli hook Codex.

### Aggiornare dalle Impostazioni

Apri **Impostazioni → Controlla aggiornamenti**. Mascotte controlla le release pubbliche ufficiali; se trova una versione più recente mostra la versione e chiede conferma. Dopo la conferma scarica lo ZIP, ne controlla la dimensione e l'impronta SHA-256 fornita da GitHub, prepara il pacchetto e riavvia l'app. Non servono Git, Node.js o una repo locale. Il controllo di integrità verifica che il file corrisponda ai metadati della release GitHub; non sostituisce una firma digitale dell'editore.

Quando non è ancora stata pubblicata alcuna release, viene mostrato un messaggio e l'app continua a funzionare. Una nuova release richiede un tag `v` seguito dalla versione stabile presente in `windows/package.json`; il workflow `.github/workflows/windows-release.yml` esegue i test e pubblica installer e ZIP. Creare o inviare un tag non avviene automaticamente dal PC dell'utente.

### Aggiornamento da sorgenti (sviluppatori)

1. Apri **Impostazioni → Aggiornamento da sorgenti**, premi **Scegli repo…** e seleziona il clone Git di `github.com/Zekseron/Mascotte`. La cartella viene ricordata. I pulsanti nella stessa sezione aprono le pagine ufficiali di Git e Node.js.
2. Salva o committa le modifiche locali. Premi **Compila e aggiorna** e controlla repo e destinazione nella finestra di conferma. Il pulsante richiede Git e Node.js 22+ con npm nel PATH del PC: scarica il ramo seguito da `origin` con `git pull --ff-only`, esegue `npm ci` e crea il pacchetto Windows. Lo stato di avanzamento compare nella scheda. Non esegue reset o merge delle modifiche locali.
3. Quando il pacchetto è pronto, l'installer lo estrae e controlla prima di chiudere la mascotte. Sostituisce la cartella dell'app, conserva quella precedente come `Mascotte.backup-<data>` e riavvia la nuova versione. Se la sostituzione fallisce, prova a ripristinare la cartella precedente. Un errore prima dell'installazione lascia l'app attuale al suo posto; la repo potrebbe essere già aggiornata.

Se avvii l'app dalla repo, l'aggiornamento la installa in `%LOCALAPPDATA%\Programs\Mascotte`, separando app e sorgenti. In questo caso, dopo il riavvio premi **Crea / aggiorna hook** e applica l'anteprima per registrare il nuovo percorso. Se la cartella dell'app rimane la stessa, gli hook mantengono il loro percorso; puoi comunque aggiornarli dallo stesso pulsante.

L'esito dell'installazione appare nelle **Impostazioni** al successivo avvio; i dettagli sono in `%LOCALAPPDATA%\Mascotte\update.log`. Non chiudere la mascotte durante l'aggiornamento: uscire interrompe download o build ancora in corso. L'aggiornamento dalle release usa GitHub; quello dai sorgenti usa Git e npm. Nessuno dei due invia la vista locale o le conversazioni della chat.

## Dati e privacy

- Dati locali in `%LOCALAPPDATA%\Mascotte`: `settings.json`, `chat\history.json`, `events.json` e record dei backup `hook-installation.json`; cache Electron in `electron\`.
- Chat JSON non cifrata: cartelle protette con ACL dell'utente tramite icacls. La corretta applicazione e il comportamento su sistemi aziendali vanno verificati su Windows.
- Nessun account o conversazione del creatore è incluso. La mascotte usa il login delle CLI del destinatario; non aggiunge API key. Le politiche del fornitore/organizzazione continuano ad applicarsi.
- L'app non cattura microfono o tastiera delle altre applicazioni. La cattura visiva è una funzione Windows facoltativa e locale, spenta per impostazione predefinita; un fotogramma raggiunge il servizio IA solo dopo l'anteprima e la conferma dell'utente. Gli invii della chat trasmettono messaggio e contesto al servizio scelto; le animazioni non consumano utilizzo IA.
- Claude: strumenti/MCP disabilitati, caricamento CLAUDE.md e auto-memory disabilitato per questa invocazione. Codex: config utente/rules ignorati, niente sessione persistente, comando/immagini locali/browser/app/plugin/subagent disabilitati, read-only. Su CLI Codex reale con backend finto la lista offerta contiene solo `request_user_input`, nessuno strumento che legge file o esegue comandi. Ripetere la verifica al cambio di versione; non è una garanzia universale per tutte le CLI future.
- Il server riceve POST /event su **127.0.0.1:8766**, token casuale per avvio. Richiesta max 4 KiB, body max 512 byte, timeout 1 s, 16 connessioni, 50 richieste/s. Origin, duplicati, campi extra e token errati sono respinti. Nessun ascolto sulla rete LAN.
- Due sessioni esterne concorrenti seguono l'ultimo evento; durante una risposta micro chat gli eventi esterni non la interrompono.

## Uscire o rimuovere

Esci dal menu della mascotte. Per rimuovere gli hook, elimina dalle configurazioni le voci che chiamano questo exe e ripristina l'eventuale notify precedente dal backup. Ripristina i file completi soltanto se nel frattempo non hai fatto altre modifiche. Poi disinstalla Mascotte da Windows oppure elimina la cartella estratta della versione portatile. I dati locali restano in `%LOCALAPPDATA%\Mascotte`; cancellali solo se vuoi rimuovere anche la tua cronologia. Le credenziali delle CLI restano gestite da Codex/Claude.

## Limiti di questa anteprima

- Solo Windows x64; ARM64 non compilato né verificato. Nessun avvio automatico all'accesso Windows. L'exe, l'installer e il pulsante nella barra usano l'icona di Rosso; il pacchetto non è firmato digitalmente. La chat si apre all'avvio: X la riduce a icona mantenendo il pulsante nella barra. Esci dal menu della mascotte termina l'app. Il collegamento può essere fissato alla barra dalle opzioni di Windows.
- Incluso Rosso, selezionabile per categoria; import di altri pacchetti non ancora esposto nell’interfaccia Windows.
- Electron include Chromium: lo ZIP è circa 150 MB ed è più pesante dell'app nativa Mac. CPU/RAM/energia e costo dei processi hook si misurano sul PC nella prova.
- Trasparenza/click-through, DPI, ACL, chiusura dell'albero dei processi con taskkill, hook e login reali richiedono la prova Windows.
- UI, aggiornamento con riavvio e cattura di una finestra sintetica verificati su Windows; gli invii remoti di testo e immagini sono stati collaudati con CLI simulate. I due modelli locali sono stati provati su questo PC con domande sintetiche; possono commettere errori. Dettagli in [VERIFICA-GESTIONE.md](VERIFICA-GESTIONE.md).

## Sviluppo

Richiede Node 22+ e npm. In PowerShell usa `npm.cmd`: così eviti il blocco di `npm.ps1` dovuto alla Execution Policy e non devi cambiarla. Se il terminale parte dalla radice del repository, entra prima in `windows`:

### Preparare una build dal repository e collegare gli hook

Questa è la procedura per chi ha scaricato il sorgente da GitHub o come archivio. Aggiornamenti e configurazione degli hook nelle **Impostazioni** sono disponibili nella build Windows impacchettata; in `npm.cmd start` i pulsanti sono disabilitati.

1. Su Windows x64 installa Node.js 22 o successivo. Non servono Python, Git Bash o Node sul computer che userà in seguito il pacchetto; Node serve qui solo per creare la build. Estrai o clona il repository in una cartella stabile, poi apri PowerShell in `windows`:

   ```powershell
   Set-Location C:\percorso\Mascotte-main\windows
   npm.cmd ci
   npm.cmd run build:win
   ```

   La build crea `dist\Mascotte-Windows-0.8.0-x64.zip` e `dist\Mascotte-Setup-0.8.0-x64.exe`. Se `npm.cmd ci` fallisce, controlla `node --version` (almeno `v22`) e riprova senza cambiare l'ExecutionPolicy.

2. Estrai **tutto** lo ZIP in una cartella che non sposterai, ad esempio `%LOCALAPPDATA%\Programs\Mascotte`. In PowerShell, dalla cartella `windows`:

   ```powershell
   $installDir = Join-Path $env:LOCALAPPDATA 'Programs\Mascotte'
   New-Item -ItemType Directory -Force -Path $installDir | Out-Null
   Expand-Archive -LiteralPath '.\dist\Mascotte-Windows-0.8.0-x64.zip' -DestinationPath $installDir -Force
   ```

   Avvia `Mascotte.exe` da quella cartella, non dallo ZIP. Mantieni lì anche DLL e `resources`. Scegli un percorso stabile; non deve contenere `%`, virgolette o ritorni a capo. Spostare o cancellare la cartella dopo aver collegato gli hook ne interrompe l'avvio: in quel caso estrai di nuovo in un percorso stabile e ripeti il collegamento.

3. Installa e accedi alla CLI nativa Windows di Codex e/o Claude Code che vuoi usare. Apri Mascotte dal percorso stabile e fai clic sul gattino per aprire la micro chat. Nelle **Impostazioni** (ingranaggio in alto a destra) premi **Crea / aggiorna hook** e leggi l'anteprima dei due file di configurazione. Premi **Applica con backup** solo quando vuoi scrivere le modifiche.

   L'app salva copie `*.before-mascotte-*` dei file esistenti e aggiorna le configurazioni dell'account Windows corrente: `%USERPROFILE%\.claude\settings.json` e `%USERPROFILE%\.codex\config.toml`, salvo percorsi personalizzati tramite `CLAUDE_CONFIG_DIR` o `CODEX_HOME`. Non condivide né importa le credenziali. Gli hook e i notify di altre integrazioni vengono conservati; l'app segnala una catena notify che non riesce a leggere e non la applica.

4. In Codex controlla gli hook proposti con `/hooks` e approvali tramite il normale flusso di fiducia di Codex. Poi chiudi e riapri le sessioni Codex e Claude già aperte. Per una verifica, avvia una nuova sessione e invia un prompt o usa uno strumento: la mascotte dovrebbe mostrare gli stati della sessione. La prova della micro chat e la prova degli hook sono separate; per ricevere eventi non è necessario inviare messaggi dalla micro chat.

Se non arrivano eventi, verifica che Mascotte sia ancora nella cartella registrata, che le CLI usino i percorsi di configurazione indicati sopra e che Codex abbia approvato gli hook. Apri una nuova sessione dopo le modifiche. Puoi riaprire **Impostazioni → Crea / aggiorna hook** per aggiornare la configurazione al percorso dell'app attuale.

### Avvio e build di sviluppo

```powershell
Set-Location .\windows
npm.cmd ci
npm.cmd start
npm.cmd run build:win
```

`npm.cmd ci` installa le dipendenze di sviluppo; `npm.cmd start` avvia il sorgente. `npm.cmd run build:win` crea ZIP e installer in `windows/dist/` e copia l'app completa in `distribuzione/Windows-portatile/`. Apri `Mascotte.exe` da quella cartella e mantieni insieme tutti i suoi file. Le build sono escluse da Git; la radice contiene i sorgenti. Una vecchia copia avviata dalla radice resta indipendente dalla nuova build.

Per sostituire una copia estratta con lo ZIP appena creato, prima esci da Mascotte e poi esegui dalla cartella `windows`:

```powershell
Set-Location .\windows
npm.cmd run update:win -- --archive ".\dist\Mascotte-Windows-0.8.0-x64.zip" --install-dir "$env:LOCALAPPDATA\Programs\Mascotte"
```

`--install-dir` deve indicare la cartella che contiene la vecchia `Mascotte.exe`; usa il percorso effettivo se l'hai estratta altrove. Il comando rifiuta di procedere se Mascotte è ancora aperta, prepara l'aggiornamento in una cartella temporanea e conserva la cartella precedente come `Mascotte.backup-<data>`. Non cancella i dati in `%LOCALAPPDATA%\Mascotte`.

Comandi rapidi PowerShell, sempre dalla cartella `windows`:

| Cosa fare | Comando |
| --- | --- |
| Installare/ricreare dipendenze | `npm.cmd ci` |
| Avviare il sorgente | `npm.cmd start` |
| Eseguire i test automatici | `npm.cmd test` |
| Creare lo ZIP Windows x64 | `npm.cmd run build:win` |
| Aggiornare una cartella estratta | `npm.cmd run update:win -- --archive ".\dist\Mascotte-Windows-0.8.0-x64.zip" --install-dir "<cartella-installazione>"` |

`resources` copia gli asset dalla radice della repo; non modificarli qui. Su Mac l'anteprima usa una cartella separata e `MASCOTTE_PREVIEW=1` sceglie una porta libera, preservando la mascotte nativa attiva. I test principali sono offline; `npm.cmd test` li esegue. `npm.cmd run test:codex-policy` usa opzionalmente la CLI Codex reale contro un mock locale con CODEX_HOME vuoto, senza login.

### Mac (Apple Silicon)

Il porting Mac ha completato i passi 1–11 del piano (note private dell'autore, sezione 5): mascotte, menu nella barra dei menu, aggancio al Dock e alla finestra attiva, server eventi, chat Claude/Codex, IA locale, note e azioni locali, osservazione, hook, importazione dei dati della vecchia app, pacchetto firmato e aggiornamenti. Verificato sul Mac di prova (Apple M3, 16 GB, macOS 27.0.1): esito in [COLLAUDO-MAC.md](COLLAUDO-MAC.md). Non supportato il Mac Intel (scelta del passo 1: solo arm64). Le capacità attive per piattaforma sono in `lib/platform.cjs`; su Mac non c'è l'Ollama gestito dall'app (`managedOllama`, solo Windows), che si installa e si apre a parte. Restano da provare, al primo rilascio, l'aggiornamento da una release GitHub e l'installazione su un altro Mac (vedi [PUBBLICAZIONE.md](../PUBBLICAZIONE.md)).

- `npm ci`, poi `MASCOTTE_PREVIEW=1 npm start` (porta libera, se la vecchia app nativa è attiva) e `npm test`.
- L'aggancio alla finestra usa un helper Swift (`lib/mac/window-helper.swift`) compilato da `npm start`/`npm run resources` in `resources/mac/` (serve `swiftc`, anche dai soli Command Line Tools; senza, l'aggancio alla finestra resta disattivato). Non richiede il permesso «Registrazione schermo». Il Dock può stare in basso, a lato o nascosto: la mascotte si posa sul bordo inferiore dell'area utile.
- I dati stanno in `~/Library/Application Support/Mascotte Electron`, mai nella cartella della vecchia app Swift. `MASCOTTE_DATA_DIR` (o `MASCOTTE_WINDOWS_DATA_DIR`) la sostituisce.
- Chat Codex/Claude su Mac (passo 4, provata con richieste reali): `findCLI` cerca nel PATH, in `~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, nelle cartelle nvm e in `/Applications/{Codex,ChatGPT}.app`. Una CLI npm con shebang `env node` viene eseguita con il runtime di Electron (`ELECTRON_RUN_AS_NODE=1`) e la sua cartella è aggiunta in coda al PATH del figlio, perché un'app lanciata da Finder ha un PATH minimo. Il figlio parte in un proprio gruppo di processi e Interrompi, timeout (3 minuti), chiusura della chat e uscita dall'app (anche SIGTERM) chiudono l'intero gruppo, nipoti compresi. Sul Mac c'è un menu applicazione minimale (`appMenu`, `editMenu`) per Cmd+C/V/X/A/Z, la chat prende il focus con `app.focus({steal: true})` e compare sulla scrivania corrente.
- IA locale su Mac (passo 5, provata con Ollama 0.40.12 su M3 16 GB): Mascotte non avvia Ollama, guida l'installazione (**Installa Ollama** apre https://ollama.com/download/mac; serve una versione recente, almeno 0.30.9 per Gemma 4). Il catalogo è diverso da Windows (scelta per la memoria condivisa da 16 GB), definito in `lib/local-ai.cjs`: `gemma4:e4b` predefinito (circa 6,6 GB, testo e immagini), `qwen3.5:2b` leggero (circa 2,7 GB) e `qwen3.5:9b` pesante (circa 6,6 GB, con avviso su memoria e swap), tutti multimodali, quindi la chat locale può ricevere un fotogramma senza un modello «VL» separato (l'osservazione delle finestre su Mac è il passo 7). Un modello salvato che non è nel catalogo della piattaforma torna al predefinito. Il modello resta in memoria 2 minuti dopo l'ultima risposta (`keep_alive: '2m'`; su Windows 0): valore provvisorio da misurare. Il controllo accetta `details.format` `gguf` (tag standard) e `safetensors` (varianti MLX di Ollama); da confermare con l'installazione reale.
- `npm run build:mac`: vedi la sezione «Pacchetto, firma, installazione e aggiornamenti su Mac» qui sotto.

#### Pacchetto, firma, installazione e aggiornamenti su Mac (passo 10)

- **Firma con certificato personale.** In *Accesso Portachiavi* crea con *Assistente Certificati → Crea un certificato…* un certificato di tipo **Firma codice**, autofirmato, con nome esatto **«Mascotte Firma Locale»** (sul Mac di prova è stato reso attendibile per la firma del codice; `security find-identity` lo trova comunque anche non attendibile, ma la verifica con un certificato non attendibile non è stata provata a parte). `npm run build:mac` esegue electron-builder (firma ad hoc), poi `scripts/mac-sign.cjs`: se `security find-identity -p codesigning` trova il certificato, firma l'helper Swift e l'intera app (`codesign --force --deep`, **senza** hardened runtime, che senza notarizzazione romperebbe `ELECTRON_RUN_AS_NODE` e gli helper), verifica con `codesign --verify --deep --strict` e rigenera lo ZIP con `ditto -c -k --sequesterRsrc --keepParent`. Senza certificato stampa un avviso e l'app resta ad hoc. `MASCOTTE_MAC_IDENTITY` indica un nome diverso. La prima volta macOS può chiedere il permesso di usare la chiave: scegli *Consenti sempre*. Con la stessa firma i permessi (Registrazione schermo) restano validi da una build alla successiva.
- **Risultato.** `dist/mac-arm64/Mascotte.app` e `dist/Mascotte-Mac-<versione>-arm64.zip`. Gli argomenti dopo `--` vanno a electron-builder e alla firma (`npm run build:mac -- --config.directories.output=dist/prova`).
- **Prima installazione da terminale.** Chiudi Mascotte e la vecchia app Swift, poi `npm run install:mac`: installa lo ZIP appena compilato in `/Applications/Mascotte.app` e riapre l'app. Se in Applicazioni c'è un'app con altro identificativo (la vecchia `local.mascotte.app`), prima ne salva uno ZIP in `~/Library/Application Support/Mascotte Electron/backup/Mascotte-swift-<data>.zip`; solo a backup riuscito la sostituisce. Se c'è già la nuova, la sostituisce con una copia temporanea per il ripristino in caso di errore. Rimuove la quarantena (`com.apple.quarantine`) solo se presente.
- **Aggiornamenti dall'app.** **Impostazioni → Controlla aggiornamenti** (solo nell'app installata dal pacchetto, non con `npm start`) scarica `Mascotte-Mac-<versione>-arm64.zip` dalla release ufficiale, verifica SHA-256, dimensione, URL e host, lo estrae con `ditto`, controlla identificativo `local.mascotte.desktop` e `codesign --verify --deep --strict`; se l'app in esecuzione è firmata con un certificato, il nuovo pacchetto deve avere lo stesso requisito designato, altrimenti viene rifiutato. L'installatore (`mascotte-updater.cjs`) attende la chiusura dell'app, sostituisce `/Applications/Mascotte.app`, riavvia con `open -n` e scrive l'esito in `update-result.json`. **Aggiornamento da sorgenti**: stessa schermata, con Git e Node.js 22+ (cercati anche in `/opt/homebrew/bin`, `/usr/local/bin`, nvm); esegue `git pull --ff-only`, `npm ci` e `npm run build:mac` in una cartella dedicata, poi installa. Dopo l'aggiornamento, se gli hook puntano a un'altra posizione dell'app compare la nota «Premi Crea / aggiorna hook nelle Impostazioni» (mai applicati senza conferma).
- **Distribuzione ad altri Mac.** Nessuna notarizzazione (decisione del passo 1): al primo avvio macOS blocca l'app. Apri **Impostazioni di Sistema → Privacy e sicurezza**, in fondo premi **Apri comunque** per Mascotte e conferma. Se lo ZIP è stato scaricato da browser, in alternativa `xattr -dr com.apple.quarantine /Applications/Mascotte.app`. Gli altri Mac non si fidano del certificato personale, quindi l'avviso vale a ogni nuovo autore di firma, non a ogni aggiornamento; gli aggiornamenti scaricati dall'app non hanno quarantena.

Riferimenti: [Electron sicurezza](https://www.electronjs.org/docs/latest/tutorial/security), [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [Codex config](https://learn.chatgpt.com/docs/config-file/config-reference), [variabili Claude](https://code.claude.com/docs/en/env-vars).


### Scaricare o aggiornare il modello locale

Su un nuovo PC apri **Impostazioni > IA locale**, usa **Installa Ollama** per scaricare il programma ufficiale e avvialo. Seleziona Qwen3 4B instruct (circa 2,5 GB) oppure 1.7B (circa 1,4 GB), poi premi **Scarica / aggiorna modello**. Vedi l'avanzamento e puoi annullare; ripetendo il download Ollama riutilizza le parti disponibili. Non servono terminale, Git o Node.js per scaricare il modello dall'app.

Il pulsante aggiorna alla revisione disponibile dello stesso tag supportato, senza passare a una famiglia nuova automaticamente. Prima di rendere disponibile la chat, Mascotte verifica modello locale, formato GGUF e supporto al testo. La compatibilita tecnica non garantisce la qualita delle risposte o la velocita: il modello va scelto anche in base all'hardware. Il download non invia chat o note.

Con Ollama installato separatamente, i modelli sono gestiti nella sua cartella utente (normalmente `%USERPROFILE%\.ollama\models`, salvo configurazione personalizzata). Se esiste il runtime gestito di Mascotte, usa `%LOCALAPPDATA%\Mascotte\local-ai\models`. Nessun modello e incluso in GitHub o nei pacchetti Mascotte. Internet serve per il download; la chat locale usa il modello gia scaricato.


Qwen3 8B Q4 e disponibile come terza opzione da scaricare (circa 5,2 GB di pesi). Per Mascotte consigliamo almeno 16 GB di RAM, una GPU supportata da Ollama con 8 GB di VRAM dedicata e almeno 8 GB liberi su disco per il download. Sono indicazioni pratiche, non minimi assoluti: su CPU o con meno VRAM puo funzionare piu lentamente; contesto e programmi aperti possono richiedere ulteriore memoria. L'avviso compare selezionando l'8B; il 4B resta predefinito. Non viene effettuato un rilevamento automatico dell'hardware e l'8B non e stato misurato su questo PC.

Dimensioni del modello: https://ollama.com/library/qwen3:8b


La sezione **Finestra da condividere** nella micro chat parte chiusa e si apre dal titolo. Chiuderla nasconde i controlli e l'anteprima; per fermare la cattura usare **Smetti**. Il campo messaggio parte da una riga ed e ridimensionabile in altezza. Con i modelli Qwen3 testuali l'anteprima non viene inviata al modello. Per analizzare un fotogramma sul PC scegli Qwen3-VL 2B o 4B Instruct nelle Impostazioni, scaricalo e seleziona Locale nella chat. Scrivi una domanda, apri il pannello, scegli la finestra e premi Allega fotogramma: dopo la conferma il singolo fotogramma viene analizzato in locale. Non viene conservato nella cronologia; per una nuova domanda visiva allegane uno nuovo. Con Codex o Claude occorre allegare un fotogramma e confermare l'invio; non ricevono la finestra in diretta.


### Modelli visivi locali

Disponibili `qwen3-vl:2b-instruct` (circa 1,9 GB) e `qwen3-vl:4b-instruct` (circa 3,3 GB). Consigliati 16 GB RAM; per il 4B una GPU supportata con almeno 8 GB VRAM. Spazio e RAM effettivi dipendono anche da immagini e contesto. Il modello puo sbagliare testo e dettagli: verificare le configurazioni tecniche. Non esegue azioni tramite mouse/tastiera. La cattura non equivale a un video inviato continuamente all'IA.

Prova CPU del 2B e limiti: [REPORT-VISIONE-LOCALE.md](REPORT-VISIONE-LOCALE.md).
