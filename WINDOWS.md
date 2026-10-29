# Mascotte su Windows

Guida per chi riceve l'app Windows. È la stessa app Electron usata anche sul Mac (versione 0.8.0, sorgenti nella cartella `windows/` della repo). Per il Mac vedi [LEGGIMI.md](LEGGIMI.md). Il vecchio piano di porting di questa pagina è stato completato e sostituito da questa guida.

## Requisiti

- Windows 10 o 11 a 64 bit (x64). **Windows ARM64 non è supportato**: non è stato compilato né provato.
- Nessun Python, Node.js o Git per eseguire il pacchetto pronto. Node.js e Git servono solo a chi aggiorna dai sorgenti.
- Per la micro chat con Codex o Claude, le rispettive CLI e un account (vedi sotto). Senza account il gattino si anima e si può trascinare.

## Installare

Dalla pagina **Releases** di `github.com/Zekseron/Mascotte` (solo dopo che una release è stata pubblicata) scegli una delle due forme:

1. **Installer** `Mascotte-Setup-<versione>-x64.exe`: installa Mascotte nel tuo profilo Windows (`%LOCALAPPDATA%\Programs\Mascotte`) e crea il collegamento. Non richiede diritti di amministratore. Per rimuoverla: **Impostazioni → App → Mascotte → Disinstalla**.
2. **Versione portatile** `Mascotte-Windows-<versione>-x64.zip`: estrai tutta la cartella in una posizione stabile e apri `Mascotte.exe`. Mantieni insieme tutti i suoi file. Per rimuoverla elimina la cartella.

L'app e l'installer **non sono firmati digitalmente**: Windows (SmartScreen) può chiedere una verifica della provenienza. Procedi solo se hai scaricato i file dalla release ufficiale. Lo ZIP è circa 150 MB perché include il runtime Electron.

Le impostazioni, la chat e le note restano in `%LOCALAPPDATA%\Mascotte` anche dopo la disinstallazione: cancellale solo se vuoi eliminare la cronologia. Il gattino appare con un'icona nell'area di notifica; clic destro sul gattino per il menu, **Esci** per chiudere.

## Collegare i propri account

- **Codex:** segui la [guida Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox) e la [guida CLI](https://learn.chatgpt.com/docs/cli). Nel terminale `codex login` apre il login con ChatGPT; `codex login status` verifica l'accesso.
- **Claude Code:** segui [installazione e requisiti Windows](https://code.claude.com/docs/en/setup), poi avvia `claude` e completa l'accesso. Se richiede Git Bash, installalo secondo la guida ufficiale.

Mascotte riusa le credenziali locali delle CLI: non le copia e non chiede password. Usa CLI aggiornate: una versione troppo vecchia può rifiutare le opzioni di sicurezza che Mascotte passa. I login non vengono importati da altri computer. Se le CLI sono in percorsi particolari, il creatore o uno sviluppatore può impostare `MASCOTTE_CHAT_CODEX` o `MASCOTTE_CHAT_CLAUDE` (dettagli in `windows/README.md`, nella repo).

**Il primo invio a Codex o a Claude dopo l'avvio chiede conferma**; i successivi allo stesso servizio no, finché Mascotte resta aperta (fotogrammi e secondo parere chiedono sempre). Invio invia, Maiusc+Invio va a capo.

## IA locale (facoltativa)

Installa [Ollama per Windows](https://ollama.com/download/windows), avvialo e in **Gestione → IA locale** scegli un modello e premi **Scarica / aggiorna modello** (il predefinito richiede circa 2,5 GB). Sono utilizzabili anche modelli già presenti in Ollama e altri motori locali già avviati (LM Studio, llama.cpp, Jan). Su Windows Mascotte può avviare un runtime Ollama autonomo, se lo hai messo in `%LOCALAPPDATA%\Mascotte\local-ai\runtime`.

## Altre funzioni

- **Aggancio** alla barra delle applicazioni o alla finestra attiva, dal menu **Aggancio** (clic destro).
- **Note e azioni locali** con conferma: «ricorda: …», «apri la calcolatrice», «apri download» (anche Documenti, Scrivania e Immagini).
- **Osservazione di una finestra:** apri la sezione «Finestra da condividere», scegli la finestra → «Osserva» mostra un'anteprima locale; «Allega fotogramma…» invia un solo fotogramma, solo dopo la tua conferma. Su Windows non serve un permesso di sistema.
- **Hook** per le reazioni a Claude Code e Codex: **Gestione → Crea / aggiorna hook**, anteprima e **Applica con backup** (usa PowerShell 5.1 incluso in Windows). Facoltativo. Se sposti l'app, ripremi il pulsante.
- **Aggiornamenti:** **Gestione → Controlla aggiornamenti** scarica la versione più recente dalla release GitHub, ne verifica dimensione e impronta SHA-256 e riavvia l'app. L'esito dell'aggiornamento sta in `%LOCALAPPDATA%\Mascotte\update.log`.

## Differenze rispetto al Mac

- Aggancio alla barra delle applicazioni invece che al Dock.
- Installer disponibile oltre allo ZIP, non firmato digitalmente.
- Modelli locali proposti diversi e Ollama avviabile dall'app (vedi sopra).
- Le azioni locali aprono solo Calcolatrice e cartelle (su Mac anche le app installate).
- Nessun permesso di sistema per l'osservazione.

## Stato delle prove

Il trascinamento, l'interfaccia, l'aggiornamento con riavvio e la cattura di una finestra sintetica sono stati verificati su Windows. Gli invii remoti di testo e immagini sono stati collaudati con CLI simulate. Il codice comune modificato durante il porting su Mac (comandi locali, cartelle, motori locali, errore di Claude, ordine degli hook) richiede ancora un nuovo collaudo su un PC Windows reale prima del prossimo rilascio. Dettagli in `windows/README.md` e `windows/VERIFICA-GESTIONE.md` nella repo.

## Rimuovere

Esci dal menu della mascotte. Disinstalla (o elimina la cartella portatile). Per togliere gli hook elimina dalle configurazioni di Claude e Codex le voci che richiamano `Mascotte.exe`, ripristinando l'eventuale notify precedente dal backup. Le credenziali delle CLI restano gestite da Codex e Claude.

Dati e limiti: [PRIVACY.md](PRIVACY.md).
