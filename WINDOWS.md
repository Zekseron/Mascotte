# Mascotte su Windows

Guida per chi riceve l'app Windows, anteprima 0.9.9 (sorgenti in `windows/`). La base Electron è condivisa con il Mac; la nuova modalità Agente non è ancora collaudata sul Mac. Per il Mac vedi [LEGGIMI.md](LEGGIMI.md).

Con Codex e Claude puoi scegliere **Chat** oppure **Agente · file e comandi**. In Agente scegli prima una cartella e assegna un compito; attività, modifiche e richieste di permesso compaiono nella finestra. Cronologie e sessioni sono separate dalla chat normale. Guida e limiti dell'anteprima: [AGENTI.md](AGENTI.md). Codex provato realmente su Windows; Claude richiede ancora un collaudo con account reale.

## Requisiti

- Windows 10 o 11 a 64 bit (x64). **Windows ARM64 non è supportato**: non è stato compilato né provato.
- Nessun Python, Node.js o Git per eseguire il pacchetto pronto. Node.js e Git servono solo a chi aggiorna dai sorgenti.
- Per la micro chat con Codex o Claude, le rispettive CLI e un account (vedi sotto). Senza account il gattino si anima e si può trascinare.

## Installare

Dalla pagina **Releases** di `github.com/Zekseron/Mascotte` (solo dopo che una release è stata pubblicata) scegli una delle due forme:

1. **Installer** `Mascotte-Setup-<versione>-x64.exe`: installa Mascotte nel tuo profilo Windows (`%LOCALAPPDATA%\Programs\Mascotte`, oppure la cartella scelta nella procedura) e crea i collegamenti nel menu Start e sul Desktop. Include il runtime Electron, Rosso e Luma; non servono installazioni separate di Node.js, Python o Git. Non richiede diritti di amministratore. Per rimuoverla: **Impostazioni → App → Mascotte → Disinstalla**.
2. **Versione portatile** `Mascotte-Windows-<versione>-x64.zip`: estrai tutta la cartella in una posizione stabile e apri `Mascotte.exe`. Mantieni insieme tutti i suoi file. Per rimuoverla elimina la cartella.

L'app e l'installer **non sono ancora firmati digitalmente**, quindi Windows li tratta come app di provenienza sconosciuta. Procedi solo se hai scaricato i file dalla release ufficiale.

- **SmartScreen** mostra «PC protetto da Windows»: premi **Ulteriori informazioni** e poi **Esegui comunque**. Anche il browser può segnalare il download come poco comune.
- Con **Controllo intelligente delle app** (Smart App Control, Windows 11) attivo, Mascotte viene bloccata e non si può autorizzare la singola app. Per usarla bisogna disattivare la funzione in **Sicurezza di Windows → Controllo app e browser**: è una tua scelta, perché la protezione si toglie per tutte le app. Sugli aggiornamenti recenti di Windows 11 si può riattivare dalla stessa schermata; sulle versioni precedenti solo reimpostando Windows.

Lo ZIP è circa 150 MB perché include il runtime Electron.

Le impostazioni, la chat e le note restano in `%LOCALAPPDATA%\Mascotte` anche dopo la disinstallazione: cancellale solo se vuoi eliminare la cronologia. All'avvio si apre la chat con il pulsante nella barra principale di Windows. **X riduce la chat a icona**, mantenendo il pulsante e la mascotte attivi; riaprila dalla barra o cliccando sulla mascotte. Per tenere il collegamento anche quando l'app è chiusa, clic destro sul pulsante → **Aggiungi alla barra delle applicazioni**. Rimane anche l'icona nell'area di notifica. **Esci**, dal menu della mascotte o dell'icona, chiude l'app.

Questo è l'installer leggero: motori e modelli IA non sono inclusi. Da **Impostazioni → IA locale** scarichi llama.cpp e il modello con un pulsante (vedi «IA locale»), oppure usi Ollama. I componenti Codex/Claude restano facoltativi e si configurano con il proprio account.

## Collegare i propri account

- **Codex:** segui la [guida Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox) e la [guida CLI](https://learn.chatgpt.com/docs/cli). Nel terminale `codex login` apre il login con ChatGPT; `codex login status` verifica l'accesso.
- **Claude Code:** segui [installazione e requisiti Windows](https://code.claude.com/docs/en/setup), poi avvia `claude` e completa l'accesso. Se richiede Git Bash, installalo secondo la guida ufficiale.

Mascotte riusa le credenziali locali delle CLI: non le copia e non chiede password. Usa CLI aggiornate: una versione troppo vecchia può rifiutare le opzioni di sicurezza che Mascotte passa. I login non vengono importati da altri computer. Se le CLI sono in percorsi particolari, il creatore o uno sviluppatore può impostare `MASCOTTE_CHAT_CODEX` o `MASCOTTE_CHAT_CLAUDE` (dettagli in `windows/README.md`, nella repo).

**Il primo invio a Codex o a Claude dopo l'avvio chiede conferma**; i successivi allo stesso servizio no, finché Mascotte resta aperta (fotogrammi e secondo parere chiedono sempre). Invio invia, Maiusc+Invio va a capo.

Codex e Claude possono fare ricerche web aggiornate quando servono e riportare i link delle fonti. Mascotte non concede loro accesso a file, comandi, altre integrazioni o agenti. Se la ricerca web non è disponibile per la CLI o per l'account, lo indicano nella risposta.

## IA locale (facoltativa)

Alla prima installazione il motore locale è **llama.cpp (Mascotte)**: in **Impostazioni → IA locale** premi **Scarica llama.cpp e modello** e conferma (circa 5,2 GB: runtime llama.cpp e Gemma 4 E4B, che legge anche le immagini). Mascotte verifica i file, avvia il motore solo sul computer quando scrivi in Locale e lo chiude dopo 2 minuti di inattività. Con una scheda video usa Vulkan; la prima risposta richiede qualche secondo in più.

In alternativa installa [Ollama per Windows](https://ollama.com/download/windows), avvialo, scegli Ollama come motore locale e premi **Scarica / aggiorna modello** (il modello proposto richiede circa 2,5 GB). Sono utilizzabili anche modelli già presenti in Ollama e altri motori locali già avviati (LM Studio, llama.cpp, Jan). Su Windows Mascotte può avviare un runtime Ollama autonomo, se lo hai messo in `%LOCALAPPDATA%\Mascotte\local-ai\runtime`.

## Altre funzioni

- **Aggancio** alla barra delle applicazioni o alla finestra attiva, dal menu **Aggancio** (clic destro).
- **Note:** «ricorda: …» salva una nota dopo conferma.
- **Apri app, cartelle e file:** «apri la calcolatrice», «apri download», «apri fattura.pdf». Mascotte apre subito una corrispondenza unica, anche con Codex o Claude scelti, senza inviare loro la richiesta. Cerca le app nei collegamenti del menu Start e i file per nome nelle cartelle note e aggiunte; programmi, installer e script trovati tra i file restano esclusi.
- **Colori delle mascotte:** Impostazioni → Mascotte → Colori permette di scegliere le parti di Luma e Rosso, ripristinarle e conservare scelte distinte per personaggio.
- **Osservazione di una finestra:** apri **+ → Condividi schermata**, scegli la finestra per vedere l'anteprima e premi «Osserva» per avviare l'osservazione locale; «Allega fotogramma…» invia un solo fotogramma, solo dopo la tua conferma. Su Windows non serve un permesso di sistema. Con la chat locale e un modello che legge le immagini, mentre osservi ogni messaggio include da solo il fotogramma attuale (resta sul computer).
- **Promemoria e sveglie** (chat locale): «ricordami alle 15:30 di chiamare Marco», «sveglia tra 20 minuti», «che promemoria ho?», «cancella promemoria 2». Conferma prima di impostarli, notifica di sistema alla scadenza. Le **sveglie** («sveglia…», «timer…», «svegliami…») alla scadenza aprono anche la finestra di Mascotte con «Ferma» e «Rimanda 5 minuti» e suonano a ripetizione finché non le fermi (al massimo 3 minuti); i promemoria normali sono solo una notifica. Nelle Impostazioni, sezione «Sveglie e promemoria», trovi l'elenco con «Elimina», il volume della sveglia e la scelta di un audio personalizzato (MP3, WAV, M4A, OGG o FLAC, fino a 10 MB) al posto del bip.
- **Hook** per le reazioni a Claude Code e Codex: **Impostazioni → Crea / aggiorna hook**, anteprima e **Applica con backup** (usa PowerShell 5.1 incluso in Windows). Facoltativo. Se sposti l'app, ripremi il pulsante.
- **Aggiornamenti:** **Impostazioni → Controlla aggiornamenti** scarica la versione più recente dalla release GitHub, ne verifica dimensione e impronta SHA-256 e riavvia l'app. L'esito dell'aggiornamento sta in `%LOCALAPPDATA%\Mascotte\update.log`.

## Differenze rispetto al Mac

- Aggancio alla barra delle applicazioni invece che al Dock.
- Installer disponibile oltre allo ZIP, non firmato digitalmente.
- Motore locale predefinito llama.cpp (Mascotte) invece di Ollama, modelli Ollama proposti diversi e Ollama avviabile dall'app (vedi sopra).
- Le azioni locali cercano le app installate nei collegamenti del menu Start e aprono cartelle e file riconosciuti nelle cartelle visibili.
- Nessun permesso di sistema per l'osservazione.

## Stato delle prove

Su Windows x64 sono stati collaudati i comandi locali, i promemoria e le sveglie, l’aggiunta di cartelle e mascotte, la cattura di un fotogramma con un modello locale, l’anteprima degli hook, l’invio di testo a Codex e l’installazione di llama.cpp. Il percorso con un account Claude reale resta da verificare.

## Rimuovere

Esci dal menu della mascotte. Disinstalla (o elimina la cartella portatile). Per togliere gli hook elimina dalle configurazioni di Claude e Codex le voci che richiamano `Mascotte.exe`, ripristinando l'eventuale notify precedente dal backup. Le credenziali delle CLI restano gestite da Codex e Claude.

Dati e limiti: [PRIVACY.md](PRIVACY.md).
