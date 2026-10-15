# Eventi da Claude Code e Codex

L'app riceve `POST /event` solo su `127.0.0.1:8766`. All'avvio scrive
`~/Library/Application Support/Mascotte/events.json`, con porta e token casuale,
permessi `0600`; alla chiusura rimuove il proprio file. Richiesta massima 4 KiB,
corpo massimo 512 byte, una richiesta per connessione, timeout 1 s. Nessun CORS;
richieste con `Origin`, token errato, campi extra o stato sconosciuto sono rifiutate.

`mascotte-notify` usa Python 3 senza dipendenze. Trasmette esclusivamente
`{"state":"…","source":"claude|codex|manual"}`; prompt, nomi di file e risultati
restano fuori dal server e dal log. Non stampa nulla e termina sempre con codice 0,
anche con app chiusa, input invalido o connessione fallita. Il tentativo di invio
ha un limite complessivo di circa 0,2 secondi. Non avvia l'app e non chiama IA.

## Prova manuale

Avvia `app/build.noindex/Mascotte.app`, poi dalla radice:

```sh
python3 tools/mascotte-notify --state working
python3 tools/mascotte-notify --state done
```

Per test isolati, `MASCOTTE_EVENT_FILE` può indicare un file di endpoint temporaneo.
Il ponte rifiuta file simbolici, file appartenenti ad altri utenti o con permessi
accessibili al gruppo/altri. L'indirizzo di destinazione resta sempre 127.0.0.1.

## Corrispondenza degli eventi

| Evento | Stato |
| --- | --- |
| UserPromptSubmit | listening |
| PreToolUse: Read/Grep/Glob/WebFetch/WebSearch e MCP read/get/list/search/fetch | reading |
| PreToolUse: Edit/Write/apply_patch e MCP write/edit/update/create/delete/remove | writing |
| PreToolUse: Bash/exec_command | running |
| Altri PreToolUse | working |
| PostToolUse riuscito | thinking |
| PostToolUse con isError o exit_code non zero | error |
| Claude PostToolUseFailure, eccetto interruzione | error |
| PermissionRequest, Claude Notification permission_prompt/idle_prompt/elicitation_dialog | waiting |
| Claude Stop, Codex notify agent-turn-complete | done |
| Codex Interrupt | idle |

Gli stati seguono i tempi automatici di StateController. Non si interrompono
operazioni e non si modificano le decisioni dei permessi. Più sessioni concorrenti
usano per ora l'ultimo evento ricevuto; la gestione delle sessioni è prevista nel pezzo 9.

## Preparare le configurazioni

```sh
python3 tools/prepare_integration.py
```

Il comando prepara `work/integration/claude-settings.patch`,
`codex-config.patch` e `plan.json`; **non applica modifiche**. I percorsi del progetto
sono risolti dalla posizione dello script, anche se la repo viene spostata.

La patch Claude aggiunge gli eventi al campo `hooks`, conservando gli hook già
presenti (in particolare SessionStart di guide-hub). La patch Codex aggiunge gli
hook e sostituisce `notify` con il ponte; il comando precedente è passato come
array JSON a `--forward-command`, viene eseguito senza shell e riceve l'argomento
originale, anche quando Mascotte è chiusa. Il suo stdout/stderr è scartato.
Il ponte limita a 1 s il processo di inoltro per evitare che resti bloccato.

Le patch riguardano solo le configurazioni personali indicate; richiedono la
revisione e l'approvazione dell'utente prima di essere applicate. Le sessioni già
aperte possono richiedere una riapertura per caricare i nuovi hook.

Fonti verificate il 14 ottobre 2026:
[Claude hooks](https://code.claude.com/docs/en/hooks),
[Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Codex notify](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications).
La CLI verificata è `0.162.0-alpha.17.2`, con `hooks` stabile e abilitato.

## Test

```sh
node --test viewer/test/
python3 -m unittest discover -s tools/test -v
MASCOTTE_TEST_BINARY="$PWD/app/build.noindex/Mascotte.app/Contents/MacOS/Mascotte" \
  python3 -m unittest discover -s tools/test -v
```

La terza variante avvia il server Swift su una porta casuale e un file temporaneo,
verifica autenticazione, permessi, messaggi ridotti, richieste spezzate e timeout,
poi chiude il server e controlla che il file sia rimosso. Il comando diagnostico
`Mascotte --event-server-test /percorso/temporaneo/events.json` serve a questi test,
non avvia la GUI e non usa le credenziali dell'app.
