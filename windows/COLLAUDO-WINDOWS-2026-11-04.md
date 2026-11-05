# Collaudo Windows — correzioni del 4 novembre 2026

Branch `windows/riallineamento-2026-10-30`, commit da `1f4e934` a `3a8aec7`. Queste correzioni nascono da una revisione indipendente del codice e sono già verificate su Mac: Electron 44.9.3, secondo parere, comandi durante l'osservazione, promemoria, testo lungo, PATH degli agenti, firma degli ZIP Mac. La correzione del primo avvio con llama.cpp riguarda solo Windows e non è ancora stata provata.

Segna ogni riga con ✅ oppure ❌ e una nota. In caso di ❌ copia il messaggio che vedi.

## 0. Preparazione

Nella cartella della repo:

```powershell
git fetch origin
git checkout windows/riallineamento-2026-10-30
git pull --ff-only
cd windows
npm ci
```

| # | Prova | Atteso | Esito |
| --- | --- | --- | --- |
| 0.1 | `npm test` | Nessun test fallito. Su Windows alcuni test vengono saltati: è normale. | |
| 0.2 | `npm run build:win`, poi installa o apri il pacchetto come al solito (oppure usa **Aggiorna** dalle Impostazioni, con la repo senza modifiche locali) | In Impostazioni la versione è 0.9.0 e l'app parte senza errori. | |

## 1. Primo avvio con llama.cpp da scaricare (solo Windows)

Per non toccare i tuoi dati, avvia Mascotte con una cartella dati vuota. Prima chiudi Mascotte, poi in PowerShell:

```powershell
$env:MASCOTTE_DATA_DIR = "$env:TEMP\mascotte-prova-primo-avvio"
& "$env:LOCALAPPDATA\Programs\Mascotte\Mascotte.exe"
```

Con la versione portatile usa il percorso del tuo `Mascotte.exe`.

| # | Prova | Atteso | Esito |
| --- | --- | --- | --- |
| 1.1 | Apri Impostazioni › IA locale, senza scaricare niente | Il motore scelto è **llama.cpp gestito da Mascotte**, con runtime e modello da scaricare. **Non** è passato a Ollama. | |
| 1.2 | Chiudi e riapri Mascotte con la stessa variabile | La scelta è ancora llama.cpp. | |
| 1.3 | (facoltativo) Scarica runtime e modello, poi fai una domanda in Locale | Risposta dal modello locale. | |

Alla fine chiudi Mascotte, chiudi PowerShell (la variabile vale solo lì) ed elimina la cartella `%TEMP%\mascotte-prova-primo-avvio`.

## 2. Secondo parere con la modalità Agente

| # | Prova | Atteso | Esito |
| --- | --- | --- | --- |
| 2.1 | Codex in modalità **Agente**: scegli una cartella e manda un messaggio | L'agente risponde e la sessione resta salvata. | |
| 2.2 | Passa a **Locale**, fai una domanda, poi premi **Secondo parere…** e scegli Codex | La conferma dice «Secondo parere in Chat, senza cronologia… non accede a file o comandi». | |
| 2.3 | Conferma, poi torna su Codex | Dopo la conversazione dell'agente compaiono la domanda segnata «Secondo parere (Chat, fuori dalla sessione agente)» e la risposta. Nessuna richiesta di permesso per file o comandi. | |
| 2.4 | Manda un nuovo messaggio all'agente | L'agente riprende la sessione di 2.1, che non è stata azzerata. | |

## 3. Comandi durante l'osservazione

Serve un modello locale che legge le immagini, con l'osservazione di una finestra attiva.

| # | Prova | Atteso | Esito |
| --- | --- | --- | --- |
| 3.1 | «ricordami tra 2 minuti di bere» | Mascotte propone il promemoria da confermare, non risponde il modello. Dopo la conferma arriva la notifica. | |
| 3.2 | «che promemoria ho?» | L'elenco viene da Mascotte, non dal modello. | |
| 3.3 | «cosa vedi nella finestra?» | Risponde il modello, che usa il fotogramma. | |

## 4. Controllo generale

| # | Prova | Atteso | Esito |
| --- | --- | --- | --- |
| 4.1 | Cattura della finestra osservata | Funziona come prima. | |
| 4.2 | Hook di Codex e Claude | La mascotte reagisce agli eventi delle sessioni Codex e Claude come prima. | |
| 4.3 | Agente con un comando che chiede il permesso (es. `npm test` nella cartella di lavoro) | Compare la richiesta di permesso e, se approvi, il comando viene eseguito. | |
| 4.4 | **Interrompi** durante una risposta lunga dell'agente | Si ferma e non restano processi `codex`/`node` attivi in Gestione attività. | |
| 4.5 | Una risposta molto lunga (oltre 8.000 caratteri) | Resta completa dopo la riapertura. Se supera 32.000 caratteri finisce con «[… testo tagliato qui: …]». | |

## Note

Scrivi qui eventuali problemi, con il messaggio esatto e cosa stavi facendo.

## Esito della ripresa Windows — 4 novembre 2026

Clone aggiornato con fast-forward da `1a5d592` a `385ea35`, coincidente con `origin/main` e con il ramo remoto di riallineamento al momento del fetch. Nessun reset, commit, push o pubblicazione. Dipendenze installate dal lockfile; Electron 44.9.3. Installer NSIS e ZIP Windows 0.9.0 ricostruiti, copia portatile in `distribuzione/Windows-portatile/`. Non eseguita l'installazione sulla copia personale.

### Prove eseguite

| Prove | Esito ed evidenza |
| --- | --- |
| 0.1 — suite app | ✅ 259 test: 215 passati, 44 saltati, zero fallimenti e zero annullamenti. Esecuzione seriale con i moduli Windows PowerShell nel `PSModulePath` del solo processo di test. Gli skip non convalidano i rami Mac né le prove llama.cpp non eseguibili su Windows. |
| Visore e policy Chat | ✅ Visore 57/57. Policy con CLI Codex reale e backend HTTP locale: catalogo degli strumenti annidati verificato, assenza di `process`, `require` e `fetch`. |
| 0.2 — build | ✅ Installer e ZIP prodotti. Moduli del pacchetto confrontati con i sorgenti; SDK Claude importato dal runtime distribuito. I collaudi Electron sotto descritti caricano il vero `main.cjs` dell'ASAR con il runtime Electron 44.9.3 e un profilo sintetico separato; non equivalgono a un'installazione su PC pulito. |
| 1.1–1.2 — primo avvio | ✅ Profilo vuoto: `llamacpp-mascotte`, runtime/modello assenti. Un invio Locale mostra l'invito a scaricare senza passare a Ollama. Secondo avvio sullo stesso profilo: scelta preservata. |
| 2.1, 2.4 — Codex reale | ✅ Runtime e moduli del pacchetto: lettura e creazione di un file sintetico con contenuto verificato; nuovo gestore riprende lo stesso identificativo di sessione e ricorda il codice senza rileggere il file. |
| 2.2–2.3 — secondo parere | ✅ Ramo reale testato dalla suite e flusso IPC nel main ASAR con CLI simulata: domanda e risposta del parere visibili nella vista agente, cronologia Chat separata e file dello stato agente invariato. Non provato l'intero percorso dal pulsante dopo una risposta di un modello locale reale. |
| 3.1–3.2 — comandi con fotogramma | ✅ Cattura reale della sola finestra sintetica; JPEG passato al comando promemoria. Mascotte propone la conferma, salva il promemoria e risponde all'elenco con `kind: app`. Dopo due minuti viene invocato `Notification.show()` per la scadenza. Il server di inferenza non è richiesto da questi comandi. Non confermata visivamente la comparsa del toast nel centro notifiche Windows. |
| 4.1 — osservazione | ✅ Finestra Electron sintetica con testo e sfondo noti: presente nell'elenco, flusso video avviato, JPEG acquisito; Smetti azzera lo stato di osservazione. Nessuna cattura inviata a servizi remoti. |
| 4.2 — hook | ✅ `notify-entry.cjs` dal pacchetto, eseguito con il runtime distribuito: eventi Codex PreToolUse/Stop e Claude PermissionRequest producono le animazioni attese. Test di anteprima, backup e conservazione delle configurazioni inclusi nella suite. Non reinstallati hook personali; Claude reale assente. |
| 4.3 — permessi | ✅ Main ASAR con CLI simulata: richiesta di comando, rifiuto e chiarimento attraverso IPC. Codex reale ha eseguito il lavoro sintetico nei permessi della sua sandbox; non si è forzata una richiesta di elevazione. Il clic nativo su Consenti per un comando reale resta da provare. |
| 4.4 — interruzione | ✅ Codex reale: processo Node sintetico in attesa terminato, nessun file finale, gestore libero e nessuna richiesta residua. Main ASAR con CLI simulata: X interrompe e riduce a icona; riapertura e uscita con richiesta pendente passate. |
| 4.5 — testo lungo | ✅ Cronologia sintetica letta dopo riavvio: risposta di 12.000 caratteri intatta; risposta oltre 32.000 con nota esplicita di taglio. Non generata una risposta cloud lunga solo per questa prova. |
| Tastiera e layout | ✅ Input Electron sul renderer effettivo: Shift+Invio inserisce una nuova riga, Tab raggiunge Invia. Fixture agente a 400×600, 440×680 e 720×820 senza overflow orizzontale e con campo di invio nel viewport. Ispezionata l'immagine a 400×600. Non è un audit completo con tastiera e mouse fisici. |
| Luma seduta | ✅ Nel renderer del main ASAR: waiting, thinking, working, celebrate, done, error, sleep e ripieghi reading/writing/running/listening/look/idle/talk corrispondono alle animazioni attese e disegnano pixel visibili. Canto prioritario e sgancio verificati. Catturate sei pose sedute; thinking e working ispezionate visivamente. Restano trascinamento fisico, click-through e aggancio al bordo di una finestra reale. |
| Updater | ✅ Suite con Electron e ASAR reali: sostituzione, validazione, lock temporanei/persistenti e rollback. Nessun aggiornamento/installazione dell'app personale. |

Log, fixture e immagini di questa ripresa sono in `work/windows-check-20261104/`, esclusa da Git; layout in `work/agent-ui/`.

### Correzione e limiti dell'ambiente

- Il nuovo test `second-opinion-flow.test.cjs` cercava un blocco di sorgente usando solo LF: su checkout CRLF falliva prima di eseguire le verifiche. Il testo letto viene ora normalizzato a LF. Cambia soltanto la fixture, non l'app o il suo comportamento; nessun porting Mac necessario.
- Il primo giro parallelo ha incontrato l'inizializzazione del runtime Electron e un `PSModulePath` ereditato da PowerShell Core: Windows PowerShell selezionava un modulo Archive non caricabile. Dopo la preparazione del runtime, il giro seriale con percorsi moduli Windows passa, incluso topmost nativo e updater. Nessuna impostazione di sistema modificata.
- Controllo aggiuntivo degli strumenti Python legacy della vecchia app Swift: 13 test, 6 passati, 5 saltati, 2 falliti. I due fallimenti sono in `test_prepare_integration.py`, che usa percorsi e attese POSIX; il test di inoltro passa fuori dal sandbox. Questi strumenti non appartengono al percorso Electron Windows corrente; nessuna correzione effettuata su di essi.

### Prove ancora aperte

- **Claude reale Windows:** CLI non installata su questo PC, come confermato dall'utente. Restano login/SDK, Chat/web, Agente, permessi e interruzione con servizio reale; i test simulati non li sostituiscono.
- **Gemma/llama.cpp reale (1.3, 3.3):** modello gestito assente, nessun download effettuato. PC con circa 16 GB di RAM, circa 3 GB liberi al controllo e Intel Graphics integrata. Su scelta condivisa si rinvia il download di circa 5,2 GB e la prova di inferenza/visione; restano anche download/annullamento dall'interfaccia e consumo di memoria.
- **Uso nativo:** trascinamento Luma sinistra/destra, rilascio senza posa seduta prematura, aggancio a barra e bordo finestra, maschera clic e Rosso; selettore cartella e conferma di un comando agente reale con mouse/tastiera; toast e udibilità delle sveglie. Il tentativo di controllo nativo della chat sintetica ha trovato la finestra coperta da Codex anche dopo l'attivazione, quindi non viene contato come prova riuscita.
- **Distribuzione:** installazione/aggiornamento sulla copia personale o su un altro PC e aggiornamento da release GitHub; nessuna release pubblicata da questo intervento. Le prove isolate dell'installer non chiudono questi casi.

Nessun nuovo collaudo Mac effettuato su questo PC; i suoi risultati documentati rimangono distinti.

## Correzioni dopo la prova dell'utente — Luma seduta

Segnalati piedi coperti dalla taskbar dopo l'attivazione di un'altra finestra e riempimento bianco fra le gambe.

- **Sovrapposizione Windows:** durante l'aggancio alla barra, `keepAboveTaskbar` ripristina il flag topmost e chiama `moveTop()` senza attivare la mascotte. Il controllo della posizione e dell'ordine avviene ogni 250 ms solo su Windows, al posto del secondo precedente; Mac conserva il proprio intervallo e non esegue il ripristino Windows. Non vengono cambiati ancoraggio, scala o posizione delle gambe per nascondere il problema. La regressione nativa solleva dopo la mascotte una seconda finestra topmost, verifica che la copra, ripristina la mascotte sopra di essa e controlla che il focus resti alla seconda finestra. È una prova dello z-order, distinta dalla conferma finale dell'utente sulla propria taskbar.
- **Trasparenza:** residui bianchi confermati nel foglio sorgente B-sitting, nei vuoti fra gambe e stivali. Il generatore pulisce soltanto i pixel quasi bianchi nelle quattro zone interessate prima del ridimensionamento. Rigenerati i 184 fotogrammi con Pillow 12.0.0. Stivali, pelle e vestiti restano opachi; disegni sorgente invariati. Controllo visivo su sfondo blu e regressione che decodifica il PNG reale e verifica vuoto trasparente e stivali opachi per seduta, canto e ciascuno stato seduto. Confronto con il foglio precedente: animazioni in piedi invariate, eccetto 26 pixel in due fotogrammi sleep con differenze di arrotondamento fino a 4 livelli; nessuna nuova posa. Anteprima con pixel identici conservata senza una riscrittura del file.
- **Verifiche:** suite finale 260 test, 216 passati, 44 saltati, zero fallimenti/annullamenti; visore 57/57. Confrontati main, helper z-order e sprites Luma nell'ASAR con i sorgenti: identici.
- **Pacchetto e prova:** installer e ZIP corretti in `windows/dist/luma-fix-20261104/`. La prima build nella destinazione abituale è stata bloccata da `dxcompiler.dll` in uso, quindi si è compilato nella cartella separata. Verificata la chat personale in stato Pronto, terminati soltanto i processi del preciso eseguibile locale e copiata la nuova build in `windows/dist/win-unpacked/` e `distribuzione/Windows-portatile/`; app riavviata. La cartella dati personale non è stata sostituita. Verificata la nuova istanza e ispezionata Luma seduta; la verifica dell'utente dopo il cambio di finestra resta utile per chiudere la segnalazione specifica.
- **Piano Mac:** fix dello z-order esclusivo Windows, nessun porting. PNG comune aggiornato: riaperta la verifica Mac di seduta, canto e stati su sfondo chiaro/scuro con nuova build, senza dichiararla superata sulla base delle prove Windows.

Log, confronto dei fogli e anteprime in `work/luma-fix-20261104/`, fuori Git. Nessun commit, push o release.

**Conferma dell'utente (4 novembre 2026):** dopo il riavvio con la build corretta, entrambi i difetti segnalati risultano risolti nella prova Windows («sembra tutto ok»). Chiusa la verifica visiva Windows di questa segnalazione; la verifica Mac del PNG comune resta aperta.
