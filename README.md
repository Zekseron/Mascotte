# Mascotte

Una mascotte desktop per **Windows (x64)** e **Mac (Apple Silicon)** che reagisce con animazioni a Claude Code e Codex, e che all'occorrenza fa domande al volo, risponde con un'IA locale o guarda una finestra che scegli tu. Il personaggio è intercambiabile: quello della distribuzione pubblica è un gattino in pixel art, Rosso.

Versione attuale: **0.8.0**. È un'unica app Electron, in `windows/`, usata sia su Windows sia su Mac (la cartella ha ancora il vecchio nome: rinominarla è rimandato). La vecchia app nativa Swift per Mac, in `app/`, non è più sviluppata e resta come riferimento.

Progetto e decisioni: [DESIGN.md](DESIGN.md).

Idee e prossimi lavori, anche per riprendere da un altro PC: [WORK-IN-PROGRESS.md](WORK-IN-PROGRESS.md).

Il [piano di aggiornamento Mac](WORK-IN-PROGRESS.md#5-aggiornamento-mac-e-allineamento-con-windows) va rivisto a ogni modifica Windows; la regola per le sessioni di sviluppo è in [AGENTS.md](AGENTS.md).

## Cosa fa

- **Mascotte:** gattino trasparente e trascinabile, sempre in primo piano, con stati animati. Si può agganciare alla barra delle applicazioni (Windows) o al Dock (Mac) oppure al bordo di una finestra. Su Mac vive nella barra dei menu, senza icona nel Dock.
- **Micro chat con Codex e Claude:** un clic sul gattino apre una finestrella. Usa le CLI ufficiali già autenticate sul tuo computer, con il tuo account. **Ogni invio chiede conferma** e mostra messaggio e cronologia che partirebbero.
- **Chat locale:** risponde con modelli che girano sul computer, tramite Ollama (anche modelli già installati) o altri motori locali già avviati da te (LM Studio, server di llama.cpp, Jan). Nessun modello cloud viene usato.
- **Note:** si salvano a mano o con «ricorda: …» e vengono ritrovate per le domande locali. Restano sul computer.
- **Azioni locali con conferma:** aprire la Calcolatrice e le cartelle Download, Documenti, Scrivania e Immagini, anche con frasi naturali; su Mac anche le app installate. Ogni azione parte solo dopo la tua conferma.
- **Cartelle visibili:** la chat locale può elencare (solo nomi, tipo, dimensione e data, mai il contenuto) quelle cartelle e le altre che aggiungi tu da Gestione.
- **Osservazione di una finestra:** scegli una finestra, la vedi in anteprima locale e puoi allegare **un solo fotogramma**, solo dopo conferma, a Codex, Claude o a un modello locale che legge le immagini. Su Mac serve il permesso «Registrazione schermo».
- **Hook:** da **Gestione** si collegano le sessioni di Claude Code e Codex, così la mascotte reagisce a ciò che fanno. Anteprima prima di applicare, con backup.
- **Aggiornamenti:** da **Gestione** si controllano le release pubbliche; per chi sviluppa c'è anche l'aggiornamento da sorgenti con Git e Node.js.

Il dettaglio di ogni funzione, con limiti e prove, è in [windows/README.md](windows/README.md). Cosa esce dal computer e cosa no: [PRIVACY.md](PRIVACY.md).

## Guide

| Per chi | Dove |
| --- | --- |
| Chi riceve l'app (Mac e Windows) | [LEGGIMI.md](LEGGIMI.md) e [WINDOWS.md](WINDOWS.md) |
| Chi usa o sviluppa l'app (comandi, build, dati, limiti) | [windows/README.md](windows/README.md) |
| Dati e privacy | [PRIVACY.md](PRIVACY.md) |
| Chi pubblica una release | [PUBBLICAZIONE.md](PUBBLICAZIONE.md) |
| Esito del collaudo su Mac | [windows/COLLAUDO-MAC.md](windows/COLLAUDO-MAC.md) |
| Hook e ponte eventi | [tools/README.md](tools/README.md) |
| La vecchia app Swift (riferimento) | [app/README.md](app/README.md) |

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `windows/` | **App Electron comune a Windows x64 e Mac Apple Silicon**: sorgenti, test e script di build; `build:win`, `build:mac`, `install:mac`; [istruzioni e limiti](windows/README.md). Le build vanno in `windows/dist/` (esclusa da Git) |
| `app/` | Vecchia app macOS nativa in Swift, non più sviluppata: resta come riferimento; [app/README.md](app/README.md) |
| `spec/` | Elenco degli stati e dei ripieghi (`states.json`), fonte unica per app e visore |
| `tools/` | `pixelkit.py`: disegno di pixel art come testo e generazione dei pacchetti; ponte eventi (`mascotte-notify`) della vecchia app; strumenti di esportazione della vecchia distribuzione (vedi [PUBBLICAZIONE.md](PUBBLICAZIONE.md)) |
| `characters/` | Pacchetti personaggio pronti (`character.json` + `sprites.png`) |
| `characters-src/` | Sorgenti dei personaggi disegnati con `pixelkit` |
| `viewer/` | Pagina per provare e validare un pacchetto |
| `work/` | Prove e bozze, non versionate |
| `distribuzione/` | Copie delle guide per chi riceve l'app (identiche a quelle in radice) e script della vecchia distribuzione |
| `esportabile/` | Esportazioni della vecchia distribuzione, escluse da Git |

## Provare un personaggio

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Poi apri <http://127.0.0.1:8765/viewer/>. In alternativa apri
`viewer/index.html` con un doppio clic e trascina sulla pagina la cartella di
un pacchetto.

## Usare l'app

Dalla cartella `windows/` (serve Node.js 22 o più recente):

| Cosa fare | Comando |
| --- | --- |
| Installare le dipendenze | `npm ci` |
| Provare il sorgente | `npm start` |
| Eseguire i test | `npm test` |
| Creare lo ZIP Windows x64 (da Windows) | `npm run build:win:package` |
| Creare l'app Mac e lo ZIP (da Mac Apple Silicon) | `npm run build:mac` |
| Installare l'app Mac in Applicazioni | `npm run install:mac` |

Su Windows i comandi si scrivono con `npm.cmd`. Dettagli, firma dell'app Mac e aggiornamenti in [windows/README.md](windows/README.md). Per ricevere l'app già pronta basta seguire [LEGGIMI.md](LEGGIMI.md).

Nell'app, apri la finestra del gattino e passa a **Gestione**: **Crea / aggiorna hook** mostra l'anteprima delle configurazioni e salva i backup; **Controlla aggiornamenti** usa i pacchetti precompilati delle release pubbliche; **Aggiornamento da sorgenti** compila la repo scelta con Git e Node.js. Vedi [aggiornamento dalla finestra](windows/README.md#aggiornare-dalla-scheda-gestione) e la [procedura dal repository](windows/README.md#preparare-una-build-dal-repository-e-collegare-gli-hook).

## Collegare Claude Code e Codex

Dall'app: **Gestione → Crea / aggiorna hook** (Windows e Mac). Il passo è facoltativo e non serve per chattare dal gattino. Gli strumenti `tools/` e `configura-eventi.py` appartengono alla vecchia app Swift: vedi [tools/README.md](tools/README.md).

## Pubblicare e condividere

Le release si pubblicano su GitHub con due ZIP, `Mascotte-Windows-<versione>-x64.zip` e `Mascotte-Mac-<versione>-arm64.zip`, che l'app stessa sa scaricare e verificare. La procedura completa è in [PUBBLICAZIONE.md](PUBBLICAZIONE.md). Gli ZIP non vanno mai aggiunti a Git.

Il Mac Intel non è supportato dall'app attuale (solo Apple Silicon).

## Personaggi disponibili

- **Cat → Rosso**, pacchetto `characters/Cat/rosso/`.

Menu Personaggio con categorie e grandezza ricordata per personaggio. I sorgenti grafici sono nelle stesse categorie sotto characters-src.

La distribuzione pubblica include soltanto Rosso. I pacchetti personali restano fuori dal repository.

## Copyright

Copyright © 2026 Zekseron. Tutti i diritti riservati. Il repository è pubblico per essere consultato, ma non è open source: copiare, modificare, ridistribuire o presentare come proprio questo lavoro richiede il permesso scritto dell'autore. Dettagli in [LICENSE](LICENSE).
