# Log di implementazione e verifica — 26 ottobre 2026

## Stato al commit

Implementazione salvata; collaudo esteso interrotto su richiesta dell'utente. La build nella radice e lo ZIP locale sono stati generati prima delle ultime correzioni: **rigenerarli dal sorgente prima di considerare conclusa la verifica della versione finale**. I binari e le copie di prova non sono versionati.

## Funzioni aggiunte

- Schede Chat e Gestione nella micro chat Windows.
- Scelta persistente del clone Git Mascotte; controllo dell'origine, del ramo seguito e delle modifiche locali; aggiornamento fast-forward, controllo Node 22+, `npm ci` e compilazione del pacchetto.
- Output di build separato per ogni aggiornamento, per supportare anche l'app avviata da una precedente cartella `dist/win-unpacked`.
- Installer esterno al runtime da sostituire: prepara lo ZIP, segnala di essere pronto, attende la chiusura dell'app, conserva un backup e riavvia. Errori ed esito sono locali.
- Crea / aggiorna hook dalla scheda Gestione, mantenendo anteprima, conferma, backup e controllo delle modifiche concorrenti già esistenti.
- Osservazione facoltativa di una finestra Windows con anteprima locale e invio di un singolo fotogramma alla chat solo dopo anteprima e conferma. Nessun invio IA reale è stato effettuato durante queste verifiche.
- Guide Windows e README aggiornati.

## Verifiche eseguite

1. Controlli statici JavaScript e `git diff --check` riusciti.
2. Suite esistente `npm.cmd test`: **23 test superati, nessun errore, nessun test saltato**. Eseguita prima delle ultime correzioni dell'installer e del layout. Il test stop/timeout richiede circa 90 secondi nella sandbox; ripetuto da solo fuori dalla sandbox passa in circa 1,3 secondi.
3. Build Windows completa riuscita e copiata nella radice. Questa build precede le ultime correzioni descritte sotto.
4. Apertura della build impacchettata e della scheda Gestione tramite Computer Use su Windows.
5. Collaudo con app, dati, configurazioni Codex/Claude, clone e remoto Git separati in `work/management-e2e/`. Il percorso contiene spazi e una lettera accentata. Per rendere il test isolato, il driver sostituisce le risposte dei dialoghi nativi e il solo controllo dell'identità del remoto; status Git, fast-forward dal remoto locale, npm e build sono reali. Non sono stati modificati gli hook personali.
6. Driver integrato: selezione repo, annullamento dell'anteprima hook senza scritture, applicazione con backup, conservazione delle voci estranee, seconda applicazione senza duplicati, annullamento dell'aggiornamento e rifiuto della repo con modifiche locali: **superati**.
7. Layout corretto provato a 440×680 e 400×600: pulsante Invia visibile e altezza del contenuto entro la finestra.
8. Aggiornamento completo iniziale: fast-forward e build riusciti, app chiusa; sostituzione fallita e versione precedente riavviata. Il collaudo ha quindi individuato un difetto reale dell'installer.
9. Dopo la correzione `original-fs`, ripetuta la sola installazione con lo ZIP già compilato e il runtime Electron incluso: **riuscita in circa 7,7 secondi**, backup della versione precedente conservato, nessun errore su stderr. Questo tentativo non comprendeva il riavvio automatico finale.

## Difetti trovati e correzioni nel sorgente

- **Blocco ASAR nell'installer:** `fs` di Electron tratta `app.asar` come archivio virtuale; controllarlo con queste API può mantenerne aperto un handle e impedire la rinomina della cartella su Windows. L'installer ora usa `original-fs` quando gira sotto Electron. È il modulo previsto dalla [documentazione Electron](https://www.electronjs.org/docs/latest/tutorial/asar-archives#treating-an-asar-archive-as-a-normal-file) per trattare l'archivio come file normale. La ripetizione dell'installazione ha verificato la correzione.
- **Errore originale nascosto:** la pulizia dello staging poteva fallire e sostituire l'errore di installazione. La pulizia ora è asincrona, ritenta e scrive il proprio errore nel log senza nascondere quello originale. Le rinomine ritentano per un tempo limitato in caso di blocchi temporanei Windows; un errore di ripristino indica dove è conservato il backup.
- **Pulsante Invia fuori dalla finestra iniziale:** aumentate dimensioni iniziali e minime e limitata l'altezza dell'anteprima, mantenendo lo scorrimento nel pannello appropriato.
- **Log tecnici nella scheda Gestione:** lo stato mostra la fase dell'operazione; l'output dei comandi viene conservato per la diagnosi degli errori.

## Da sistemare o controllare alla ripresa

- Rigenerare la build finale con `npm.cmd run build:win` e ripetere la suite dopo queste ultime correzioni.
- Ripetere dall'interfaccia il ciclo completo con l'installer corretto: conferma, download, build, chiusura, sostituzione, backup, riavvio e visualizzazione dell'esito. Il test dell'installazione corretta è stato completato separatamente, non l'intero ciclo finale.
- Provare l'aggiornamento partendo dalla radice della repo e da `dist/win-unpacked`, compreso lo spostamento nella cartella stabile e il successivo aggiornamento degli hook.
- Aggiungere una regressione automatica che esegua l'installer con il runtime Electron e un vero `app.asar`, verificando sostituzione e backup; la suite esistente non copre questo caso.
- Provare ZIP non valido, destinazione non scrivibile, runtime/file ancora occupati, errore della build e fallimento del ripristino. Confermare che l'app precedente rimanga utilizzabile e i backup siano recuperabili.
- Stabilizzare il driver di collaudo: una cattura della pagina durante la chiusura ha restituito `UnknownVizError`; trattare il distacco previsto dal processo in uscita senza confonderlo con un errore applicativo. I driver e gli artefatti temporanei sono in `work/management-e2e/`, esclusi da Git.
- Collaudare cattura finestra e permessi su Windows reale: avvio/arresto, chiusura della finestra osservata, fotogramma, annullamento, conferma singola e pulizia dei file temporanei. Gli invii visuali a Codex/Claude e le loro risposte non sono stati provati con account reali.
- Provare layout e scorrimento con anteprima attiva, diverse risoluzioni e DPI.

## Ambiente di lavoro

Il precedente errore Codex `helper_unknown_error: setup refresh had errors` era causato dal proprietario della cartella `.git`, impostato su `CodexSandboxOffline`. Ripristinato il proprietario dell'utente Windows tramite UAC, senza riscrivere le ACL. I comandi ordinari nella sandbox sono tornati a funzionare. Questo intervento riguarda il PC di sviluppo e non viene applicato dall'app.
