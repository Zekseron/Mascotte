# Correzioni agenti e Chat — collaudo Mac del 2 novembre 2026

Branch `windows/riallineamento-2026-10-30`, base `1a5d592`, versione 0.9.0.
Le correzioni sono nel codice comune; nessuna nuova release o installazione sulla copia personale.

## Correzioni

- Interrompi raggiunge anche i processi discendenti in gruppi separati dalla CLI. Su macOS l'albero viene raccolto prima di terminare il padre, poi vengono terminati i discendenti e il gruppo della CLI. Il gestore avvia l'arresto subito, anche durante Esci, senza rimandarlo a una microtask. Claude chiude il trasporto dopo la pulizia dei processi. Windows conserva `taskkill /T /F`.
- Chat Claude autorizza esplicitamente soltanto WebSearch e WebFetch, già presenti nell'elenco degli strumenti consentiti. Restano disabilitati strumenti file/comandi e configurazioni MCP esterne in Chat.
- Il controllo opzionale `test:codex-policy` verifica il catalogo annidato di code mode e l'assenza di `process`, `require` e `fetch`, oltre all'elenco esterno degli strumenti. Non ammette indiscriminatamente gli strumenti annidati.

## Evidenze Mac

Ambiente: Apple Silicon, Node 22.23.0, Electron 44.7.2; CLI Codex 0.166.0-alpha.5.1 e Claude Code 2.1.312.

- Regressione con processo figlio realmente avviato in un gruppo separato: nessun processo residuo e nessun file finale. Test dell'arresto immediato del gestore da Esci, anche con chiamate ripetute.
- Suite finale della copia isolata: **237 test, 231 passati, 6 saltati, zero fallimenti**. Gli skip non convalidano i rami Windows.
- Codex reale su dati sintetici: lettura/creazione file, ripresa della sessione dopo ricreazione del gestore, riavvio in Chat, ricerca web con evento e fonte; Interrompi termina il processo figlio.
- Claude reale su dati sintetici: consenso alla scrittura e comando Node delimitato; Interrompi termina il processo figlio. Chat: evento WebSearch con query, tool_result con risultati e fonti, nessun rifiuto di permesso.
- Con il runtime del nuovo bundle: dopo Interrompi, sia Codex sia Claude riprendono lo stesso identificativo di sessione e completano un turno successivo senza strumenti.
- Codice main del nuovo pacchetto eseguito nel runtime Electron con profilo isolato e CLI simulata che avvia un vero processo separato: Interrompi, X (nasconde su Mac), riapertura ed Esci terminano il processo di prova.
- Build arm64 riuscita, firma locale verificata; moduli corretti confrontati con ASAR e SDK Claude importabile dal bundle.
- Policy Codex con CLI reale e backend locale senza credenziali: passata; strumenti esterni exec/wait/request_user_input/web_search, catalogo annidato verificato senza strumenti generici o accesso diretto a Node/rete.

## Perimetro e verifiche residue

### Ricontrollo del 3 novembre 2026 prima del merge

Verifiche ripetute sul branch aggiornato a `8766fa4`, con le correzioni sotto riportate ancora nel working tree: suite app **239 test, 233 passati, 6 saltati, zero fallimenti**; visore **56/56**; policy Codex reale con backend locale superata; `git diff --check` senza errori. La suite app è stata eseguita fuori dal sandbox del runner, necessario per server loopback e gestione dei processi sintetici: la prima esecuzione limitata non è una prova valida di regressione dell'app.

Dopo fetch, branch locale e remoto coincidevano; `origin/main` era un antenato del branch (30 commit aggiuntivi). Questi controlli non costituiscono una nuova revisione completa dei 30 commit.

Il piano privato aggiornato riporta build e installazione Mac delle animazioni fino a `8766fa4`, comprese queste correzioni non ancora committate. Tale annotazione aggiorna il perimetro della vecchia build descritta sotto, senza sostituire le prove visive ancora aperte: trascinamento direzionale, maschera dei clic, aggancio e caricamento del nuovo foglio; inoltre focus/tastiera, allegati e cronologie, cartelle e permessi fuori ambito. Windows richiede ancora il ricollaudo delle correzioni comuni prima del rilascio.

Difetto di distribuzione rilevato anche nel codice corrente: `scripts/mac-sign.cjs` rigenera tutti gli ZIP `Mascotte-Mac-*-arm64.zip` nella cartella di output con l'app appena compilata, inclusi quelli con numero di versione precedente. Da correggere prima di produrre pacchetti destinati alla distribuzione; non corretto in questo intervento sugli agenti.

La build usa gli asset della base già verificata. Le nuove animazioni Luma sono sviluppate contemporaneamente in un altro intervento e richiedono una build e un collaudo propri dopo l'integrazione.

Le modifiche comuni vanno ricollaudate su Windows: questo intervento non dimostra i rami Windows. Restano le prove Mac complete di sandbox/permessi fuori ambito, tastiera e focus, allegati e cronologie legacy, scenari di cambio/scomparsa cartella, autenticazione per distribuzione, installazione e aggiornamento su profilo pulito. I due difetti riprodotti sono corretti e verificati nei casi sopra; il documento non dichiara conclusa l'intera checklist di merge.

Limite dell'arresto su Mac: la raccolta dell'albero richiede `/bin/ps`; se non disponibile resta il ripiego sul gruppo della CLI. Non garantisce il controllo di processi che si siano già resi indipendenti e siano stati adottati da init prima della richiesta di arresto. Le operazioni sui file già compiute non vengono annullate.
