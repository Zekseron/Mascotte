# Mascotte

Una mascotte desktop per macOS che reagisce con animazioni a Claude Code e
Codex, e che all'occorrenza fa domande al volo o controlli visivi dello
schermo. Il personaggio è intercambiabile: quello predefinito è un gattino in
pixel art.

Progetto e decisioni: [DESIGN.md](DESIGN.md).

Idee e prossimi lavori, anche per riprendere da un altro PC: [WORK-IN-PROGRESS.md](WORK-IN-PROGRESS.md).

Il [piano di aggiornamento Mac](WORK-IN-PROGRESS.md#5-aggiornamento-mac-e-allineamento-con-windows) va rivisto a ogni modifica Windows; la regola per le sessioni di sviluppo è in [AGENTS.md](AGENTS.md).

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `app/` | App macOS nativa; compilazione e uso in [app/README.md](app/README.md) |
| `windows/` | Sorgente e build dell'app Windows Electron; `Mascotte.exe` e i file necessari vengono generati in `distribuzione/Windows-portatile/`; [istruzioni e limiti](windows/README.md) |
| `spec/` | Elenco degli stati e dei ripieghi (`states.json`), fonte unica per app e visore |
| `tools/` | `pixelkit.py`: disegno di pixel art come testo e generazione dei pacchetti |
| `characters/` | Pacchetti personaggio pronti (`character.json` + `sprites.png`) |
| `characters-src/` | Sorgenti dei personaggi disegnati con `pixelkit` |
| `viewer/` | Pagina per provare e validare un pacchetto |
| `work/` | Prove e bozze, non versionate |
| `distribuzione/` | Guide e configuratore per il pacchetto da condividere |
| `esportabile/` | Pacchetto generato e ZIP, esclusi da Git |

## Provare un personaggio

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Poi apri <http://127.0.0.1:8765/viewer/>. In alternativa apri
`viewer/index.html` con un doppio clic e trascina sulla pagina la cartella di
un pacchetto.

## Collegare Claude Code e Codex

Vedi [tools/README.md](tools/README.md). Il server e il ponte sono pronti;
gli hook diventano attivi dopo aver approvato e applicato le patch personali.

## Micro chat dal gattino

Un clic apre una finestrella: scegli **Claude** o **Codex**, scrivi e premi Invio.
Puoi interrompere la risposta e iniziare una nuova conversazione. La chat usa
le CLI già autenticate e il normale utilizzo del tuo account. Dettagli in
[app/README.md](app/README.md#micro-chat).

## Esportare per un altro computer

```sh
bash app/scripts/bundle.sh
python3 tools/export_package.py
```

Produce `esportabile/Mascotte-0.5/` e lo ZIP omonimo usando una lista esplicita
di sorgenti, risorse e app; esclude account, chat, configurazioni e backup personali.
Per rigenerare, sposta prima l'esportazione precedente: non viene sovrascritta.
Istruzioni in [distribuzione/LEGGIMI.md](distribuzione/LEGGIMI.md).
L'app Mac pronta è per l'architettura del Mac di compilazione. Per la prima
app Windows x64 vedi [windows/README.md](windows/README.md): è un'anteprima
da verificare su Windows reale. Lo ZIP con guide e l'installer si raccolgono con
`python3 tools/export_windows.py` dopo `npm run build:win` nella cartella windows.
Per compilare il sorgente e collegare gli hook, segui la
[procedura dal repository](windows/README.md#preparare-una-build-dal-repository-e-collegare-gli-hook).
Nella build Windows, apri la finestra del gattino e passa a **Gestione**:
**Crea / aggiorna hook** mostra l'anteprima delle configurazioni e salva i backup;
**Controlla aggiornamenti** usa i pacchetti precompilati delle release pubbliche;
per chi sviluppa, **Aggiornamento da sorgenti** compila la repo scelta con Git e Node/npm.
Vedi [aggiornamento dalla finestra](windows/README.md#aggiornare-dalla-scheda-gestione).

## Personaggi disponibili

- **Cat → Rosso**, pacchetto `characters/Cat/rosso/`.

App Mac 0.5 e Windows 0.8.0: menu Personaggio con categorie e grandezza ricordata
per personaggio. I sorgenti grafici sono nelle stesse categorie sotto characters-src.

La distribuzione pubblica include soltanto Rosso. I pacchetti personali restano fuori dal repository.
