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
