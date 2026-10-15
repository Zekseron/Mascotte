# Mascotte 0.2 — pacchetto da condividere

Una mascotte animata con micro chat Claude/Codex e reazioni agli eventi locali.
Questo pacchetto contiene soltanto app, sorgenti, personaggio e strumenti generici.
Gli account e le conversazioni del creatore non sono inclusi.

## Cosa funziona oggi

| Sistema | Disponibile |
| --- | --- |
| Mac Apple Silicon, macOS 13+ | App pronta in `macOS-arm64/Mascotte.app` |
| Mac Intel, macOS 13+ | Sorgenti; compilare sul Mac Intel con Command Line Tools |
| Windows | Rosso e visore nel browser; app desktop ancora da sviluppare, piano in `WINDOWS.md` |

## Installare su un altro Mac

1. Estrai lo ZIP e conserva la cartella in una posizione stabile, per esempio nella tua cartella utente. Gli hook useranno i suoi percorsi.
2. Su Apple Silicon copia `macOS-arm64/Mascotte.app` in Applicazioni e aprila. La firma è ad hoc, non notarizzata: macOS può bloccarla. Usa la procedura prevista dal sistema per aprire un'app di cui hai verificato provenienza e sorgenti; non disattivare Gatekeeper.
3. Su Intel installa i Command Line Tools, apri il Terminale nella cartella estratta ed esegui `bash app/scripts/bundle.sh`. Copia l'app risultante da `app/build.noindex/` in Applicazioni. Non usare il binario arm64.
4. Senza account IA il gattino si anima, si trascina e consente di provare gli stati dal menu.

## Collegare i propri account

Installa le CLI ufficiali che vuoi usare; una sola è sufficiente per la micro chat.

- **Codex:** installazione dalla [guida ufficiale](https://learn.chatgpt.com/docs/cli); esegui `codex login` e accedi nel browser con il tuo account ChatGPT. Conferma con `codex login status`.
- **Claude Code:** installazione e accesso dalla [guida ufficiale](https://code.claude.com/docs/en/setup); avvia `claude` e completa il suo accesso con il tuo account.

La mascotte riusa le credenziali locali delle CLI. Non richiede password nella propria finestra e non copia le credenziali. Serve un account abilitato all'uso della CLI scelta. Gli invii usano i suoi limiti; questa versione non aggiunge API key. Modelli e politiche dati seguono la CLI/account configurati.

Clicca il gattino, scegli l'IA e scrivi. Invio invia; Maiusc+Invio va a capo. Nuova e Interrompi gestiscono la conversazione.

## Attivare le reazioni alle sessioni esterne (facoltativo)

Serve Python 3 nel percorso `/usr/bin/python3`; installa i Command Line Tools se manca.
Dalla cartella estratta:

```sh
python3 configura-eventi.py
```

Mostra le modifiche alle configurazioni locali senza applicarle. L'anteprima può contenere impostazioni personali del destinatario: non condividerla. Conserva hook e notify precedenti; supporta anche configurazioni inizialmente assenti. Se un notify è scritto su più righe o l'integrazione esiste già, si ferma e richiede configurazione manuale.

Dopo aver letto l'anteprima, per installare gli hook:

```sh
python3 configura-eventi.py --apply
```

Il comando salva backup accanto ai file esistenti e modifica solo `~/.claude/settings.json` e `~/.codex/config.toml`. Non avvia login né richieste IA. Riapri le sessioni Claude/Codex e fai una richiesta per vedere le reazioni. Le versioni delle CLI devono supportare gli hook descritti in `tools/README.md`.

## Rimuovere

Esci dal menu della mascotte. Per rimuovere gli hook, elimina dalle configurazioni le voci riferite a `tools/mascotte-notify`, ripristinando l'eventuale notify precedente dal backup. Puoi ripristinare i backup completi soltanto se non hai fatto altre modifiche alle configurazioni nel frattempo. Poi rimuovi l'app e il pacchetto.

Chat e personaggi personali restano in `~/Library/Application Support/Mascotte/`; log in `~/Library/Logs/Mascotte/`. Eliminali solo se vuoi cancellare anche i tuoi dati. Le CLI gestiscono separatamente le proprie cronologie e credenziali.

## Anteprima anche su Windows

Apri `viewer/index.html` nel browser e trascina la cartella `characters/Cat/rosso` nella pagina. Questo mostra le animazioni, senza collegare account. In alternativa, con Python 3, dalla cartella estratta avvia `python -m http.server 8765 --bind 127.0.0.1` e visita `http://127.0.0.1:8765/viewer/`.

## Verifiche e sorgenti

- `manifest.json` elenca dimensioni e SHA-256 dei file esportati; `python3 verifica-pacchetto.py` ne controlla l'integrità.
- `app/` contiene i sorgenti Swift; `characters-src/` e `tools/pixelkit.py` permettono di rigenerare Rosso (serve Pillow).
- `README.md`, `app/README.md`, `tools/README.md` documentano il progetto e i test.
- Leggi `PRIVACY.md` per le capacità e i limiti attuali della micro chat.
