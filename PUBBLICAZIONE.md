# Edizione pubblica e procedura di release

Questo repository contiene i sorgenti dell'app comune a Windows e Mac (cartella `windows/`, versione in `windows/package.json`, oggi 0.8.0) e quelli della vecchia app Swift per Mac (`app/`, non più sviluppata). Include soltanto il personaggio Rosso e i relativi sorgenti grafici.

Non copiare qui i vecchi ZIP, applicazioni compilate o cartelle personali: possono contenere asset esclusi dalla distribuzione pubblica. Ricompilare le release esclusivamente da questa cartella. La copia privata originale resta separata e non è collegata a questo repository.

Copyright © 2026 Zekseron, tutti i diritti riservati: vedi [LICENSE](LICENSE). La visibilità pubblica non equivale a una licenza open source. Le dipendenze conservano le rispettive licenze.

## Cartelle e commit

- `windows/` (app comune Windows e Mac), `app/` (vecchia app Swift), `viewer/`, `spec/`, `characters/`, `characters-src/`, `tools/`: sorgenti, test e risorse pubbliche.
- `windows/dist/`: ZIP, installer e app Mac generati, esclusi da Git. La build Windows copia anche l'app portatile in `distribuzione/Windows-portatile/`, anch'essa esclusa. `windows/resources/` (compresa la copia dell'helper Mac compilato) è generata ed esclusa.
- `esportabile/` e `work/`: esportazioni e prove locali, escluse.
- Gli ZIP (`*.zip`), gli `.exe`, i `.app` e le cartelle `node_modules/` sono esclusi da `.gitignore`: non aggiungerli mai al repository. Si pubblicano come asset di una release GitHub.
- Eventuali file Electron rimasti nella radice da build precedenti sono esclusi da Git; non spostare l'app mentre è in esecuzione.
- Modelli e runtime IA non vengono inclusi nei sorgenti o nelle release. I file modello (`*.gguf`, `*.safetensors`, `*.onnx`) sono esclusi da Git.

Su un nuovo PC: installare Mascotte, aprire Gestione, installare/avviare Ollama dal collegamento ufficiale, scegliere il modello e premere **Scarica / aggiorna modello**. Non servono Git o Node.js per questi passaggi. Il download richiede Internet e spazio libero; i dati della chat non vengono inviati per scaricare il modello.

Il catalogo compatibile e esplicito in `windows/lib/local-ai.cjs`: ogni download aggiorna il tag ufficiale scelto, senza adottare automaticamente una nuova famiglia. La verifica controlla presenza locale, formato GGUF e supporto alla generazione testuale; non certifica accuratezza o velocita su ogni PC. Se la revisione non supera la verifica, Mascotte non la dichiara pronta. Per aggiungere un nuovo modello/famiglia occorre aggiornare e verificare il catalogo nell'app.

Su Mac non c'è l'installazione guidata dall'app: Mascotte non avvia Ollama e il suo link porta a <https://ollama.com/download/mac>. Il catalogo dei modelli è diverso (decisione del passo 5 del piano Mac): vedi `windows/lib/local-ai.cjs`.

## Procedura di release

Una release contiene due ZIP con **questi nomi esatti**, perché l'app li cerca per nome:

| Sistema | Pacchetto |
| --- | --- |
| Windows x64 | `Mascotte-Windows-<versione>-x64.zip` (più, se si vuole, `Mascotte-Setup-<versione>-x64.exe`) |
| Mac Apple Silicon | `Mascotte-Mac-<versione>-arm64.zip` |

Dal codice di `windows/lib/releases.cjs`, l'app accetta una release solo se: è l'ultima release pubblicata di `Zekseron/Mascotte` (quindi **né draft né prerelease**); il tag è `v` seguito dalla versione stabile `X.Y.Z`; esiste **un solo** asset con il nome atteso per quel sistema, in stato «uploaded»; GitHub ne riporta dimensione (fino a 1 GiB) e impronta SHA-256 (campo `digest`); il link di scaricamento è `https://github.com/Zekseron/Mascotte/releases/download/<tag>/<nome>`. Dopo il download controlla dimensione e SHA-256.

### 1. Preparare la versione

1. Decidi la versione `X.Y.Z` e aggiornala in `windows/package.json` e in `windows/package-lock.json`. Il comando `npm version X.Y.Z --no-git-tag-version` dalla cartella `windows` li aggiorna entrambi.
2. Cerca la versione precedente nei documenti (`grep -rn "0\.8\.0" --include="*.md" .`, escludendo `node_modules`) e aggiorna titoli e nomi dei pacchetti: `README.md`, `windows/README.md`, `LEGGIMI.md` e `distribuzione/LEGGIMI.md`, `WINDOWS.md` e `distribuzione/WINDOWS.md`, `PRIVACY.md` e `distribuzione/PRIVACY.md`. Le copie in `distribuzione/` devono restare **identiche** a quelle in radice (`cmp LEGGIMI.md distribuzione/LEGGIMI.md`, e così per le altre due).
3. Controlla il piano di lavoro privato (`WORK-IN-PROGRESS.md`, non pubblicato) sezione 5: se la release cambia funzioni, il piano Mac deve riflettere il nuovo comportamento (regola in `AGENTS.md`).

### 2. Provare

Dalla cartella `windows`:

```sh
npm ci
npm test
```

- **Su Mac:** `npm test` deve chiudersi senza errori (i test solo Windows risultano saltati: all'ultimo collaudo 138 superati, 3 saltati). Dalla radice, i test del visore: `node viewer/test/pack.test.cjs`.
- **Su Windows:** il codice comune modificato per il Mac va ricollaudato su un PC Windows reale (`npm.cmd ci` e `npm.cmd test`, poi una prova a mano con le funzioni toccate). Il workflow GitHub esegue comunque `npm.cmd ci` e `npm.cmd test` su `windows-latest` prima di costruire.

### 3. Costruire i pacchetti

- **Windows**, da un PC Windows: `npm.cmd run build:win:package` crea `windows/dist/Mascotte-Windows-<versione>-x64.zip`. Per avere anche l'installer si usa `npm.cmd run build:win`, che crea ZIP e `Mascotte-Setup-<versione>-x64.exe` e copia l'app portatile in `distribuzione/Windows-portatile/` (è il comando del workflow). Non è stato verificato che la build Windows riesca da un Mac.
- **Mac**, da un Mac Apple Silicon con il certificato nel portachiavi:

  ```sh
  npm run build:mac
  ```

  Alla fine il terminale **deve stampare** «App firmata con «Mascotte Firma Locale» e verificata (codesign --verify --deep --strict)». Se compare invece «ATTENZIONE: certificato … non trovato», l'app è firmata ad hoc: **non pubblicare quello ZIP**. Il risultato è `windows/dist/Mascotte-Mac-<versione>-arm64.zip` (e `dist/mac-arm64/Mascotte.app`). Lo ZIP è rigenerato con `ditto`: non ricomprimerlo con Finder o altri strumenti, perché si perderebbero firma e attributi.

**Il certificato.** Le app Mac già installate firmate con «Mascotte Firma Locale» accettano un aggiornamento solo se il nuovo pacchetto ha lo stesso «requisito designato» (stesso identificativo `local.mascotte.desktop` e stesso certificato). Quindi lo ZIP Mac va firmato **con lo stesso certificato** di quello installato. Il certificato (con la sua chiave privata) vive solo nel portachiavi di questo Mac: fanne una copia di sicurezza (Accesso Portachiavi → esporta in `.p12` con password, custodito fuori dal repository). **Se il certificato si perde, o ne crei uno nuovo, le app già installate rifiuteranno gli aggiornamenti dall'app** e andranno reinstallate a mano (scaricando lo ZIP e ripetendo «Apri comunque»). Il certificato personale non è né notarizzato né riconosciuto da Apple.

### 4. Controllare i file prima di pubblicare

Dalla cartella `windows`:

```sh
ls -l dist/Mascotte-Mac-<versione>-arm64.zip
shasum -a 256 dist/Mascotte-Mac-<versione>-arm64.zip
codesign --verify --deep --strict dist/mac-arm64/Mascotte.app
git -C .. status --short
git -C .. diff --check
```

Controlla che il nome sia esatto, che la verifica della firma non dia errori e che `git status` non mostri ZIP, `.app`, modelli o file personali.

### 5. Creare la release

Il tag è `v<versione>` e **non** deve essere una bozza né una prerelease.

Il repository ha un workflow, `.github/workflows/windows-release.yml`: al push di un tag `v*` verifica che il tag coincida con la versione di `windows/package.json`, esegue `npm.cmd ci`, `npm.cmd test` e `npm.cmd run build:win` su Windows e **crea la release** (non bozza, con note generate) caricando `Mascotte-Windows-<versione>-x64.zip` e `Mascotte-Setup-<versione>-x64.exe`. Il workflow non costruisce il pacchetto Mac. La sequenza consigliata è quindi:

1. Dopo la revisione e il commit (a cura dell'utente), pubblica il commit e il tag:

   ```sh
   git tag v<versione>
   git push origin main v<versione>
   ```

2. Aspetta che il workflow finisca e controlla la release (vedi sotto).
3. Aggiungi lo ZIP Mac alla stessa release, con il nome esatto:

   ```sh
   gh release upload v<versione> windows/dist/Mascotte-Mac-<versione>-arm64.zip
   ```

Se invece crei la release a mano (senza workflow) con `gh release create v<versione> <file…> --generate-notes`, **non** usare `--draft` né `--prerelease` e carica entrambi gli ZIP con quei nomi. Non creare a mano una release per un tag per cui il workflow potrebbe partire: il suo `gh release create` fallirebbe perché la release esiste già.

Finché lo ZIP Mac non è caricato, le app Mac che controllano gli aggiornamenti vedono la release senza il loro pacchetto e mostrano un messaggio, senza danni: caricalo subito.

### 6. Controllare la release pubblicata

```sh
gh release view v<versione> --json tagName,isDraft,isPrerelease,assets \
  --jq '{tagName,isDraft,isPrerelease,assets:[.assets[]|{name,size,state,digest}]}'
```

Devono risultare `isDraft` e `isPrerelease` falsi e, per ogni ZIP, `state` «uploaded», dimensione maggiore di zero e un `digest` che inizia con `sha256:`. Il digest dello ZIP Mac deve coincidere con `shasum -a 256` del file locale.

### 7. Prove dopo il rilascio

Sono le prove rimandate dai passi 10 e 11 del piano Mac, ancora **da eseguire al primo rilascio vero** e da riportare in `WORK-IN-PROGRESS.md`:

1. **Aggiornamento dall'app (Mac):** da un'app installata con versione precedente e firmata con lo stesso certificato, **Gestione → Controlla aggiornamenti**: deve proporre la nuova versione, scaricare, verificare SHA-256 e firma, sostituire `/Applications/Mascotte.app` e riavviare, conservando dati e permesso Registrazione schermo.
2. **Installazione su un altro Mac o profilo pulito:** scarica lo ZIP dalla release, estrai, sposta in Applicazioni, primo avvio con «Apri comunque», poi prova chat e permesso Registrazione schermo. Senza dati precedenti l'importazione dalla vecchia app Swift non deve apparire (o apparire una sola volta, se la vecchia app c'è).
3. **Rifiuto di un pacchetto con firma diversa:** se possibile, verifica che un pacchetto firmato con un altro certificato sia rifiutato (già coperto dai test, non provato dal vivo).
4. **Windows:** da un'app con versione precedente, **Controlla aggiornamenti**; installazione pulita con installer e con ZIP portatile; riprova le funzioni del codice comune modificato per il Mac.
5. Scarica gli ZIP dalla pagina della release e confronta SHA-256 e dimensione con quelli mostrati da `gh release view`.

## Esportazione per la condivisione diretta (strumenti della vecchia distribuzione)

Oggi la distribuzione ufficiale sono gli ZIP di una release GitHub, creati dai comandi sopra. Gli strumenti in `tools/` sono stati scritti prima e non fanno parte della procedura di release:

- **`tools/export_package.py` è superato.** Esporta l'app Swift (`bash app/scripts/bundle.sh`, poi lo script) in `esportabile/Mascotte-<versione>/` con lo ZIP, la versione presa dal bundle Swift (0.5) e un `manifest.json`. Copia anche la cartella `distribuzione/` (guide, `configura-eventi.py`, `verifica-pacchetto.py`). **Non produce l'app Electron** né il pacchetto Mac attuale e riguarda un'app non più sviluppata: non va usato per pubblicare. Resta nel repository solo come riferimento e perché `distribuzione/` e le sue guide fanno ancora parte del suo elenco di file; la sua verifica (`tools/test/test_distribution.py`) non è stata rieseguita per questo aggiornamento.
- **`tools/export_windows.py` è ancora funzionante ma facoltativo.** Dopo `npm.cmd run build:win` raccoglie in `esportabile/Windows/` lo ZIP e l'installer Windows (controlla che l'exe sia un PE x64), i file `.sha256`, `LEGGIMI-WINDOWS.md` (copia di `windows/README.md`), `PROVA-STASERA.md` e uno ZIP di sorgenti. Serve a chi vuole condividere i file senza GitHub. Non è usato dal workflow e non ha un equivalente per il Mac; le guide `LEGGIMI.md`, `WINDOWS.md` e `PRIVACY.md` non sono incluse nel suo ZIP (si leggono nella repo o si allegano a parte). Non l'ho modificato.
- `configura-eventi.py` e `verifica-pacchetto.py` (in radice e in `distribuzione/`) appartengono alla vecchia distribuzione: gli hook si applicano ora da Gestione.

Per la condivisione diretta di un pacchetto Mac, senza GitHub, basta consegnare lo ZIP firmato di `windows/dist/` insieme a `LEGGIMI.md` e `PRIVACY.md`: non c'è uno strumento di esportazione dedicato.

## Prima del commit

Dalla radice: `git status --short`, `git diff --check`, poi `npm test` nella cartella `windows` (`npm.cmd test` su Windows). `git add` deve comprendere soltanto sorgenti, test, guide e workflow; mai ZIP, applicazioni, installer, modelli o dati personali. Commit, push e creazione di tag e release sono passi esplicitamente decisi dall'utente.
