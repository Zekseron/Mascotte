# Mascotte 0.8.0 — guida per chi riceve l'app

Una mascotte animata con micro chat Claude/Codex, chat con IA locale, osservazione facoltativa di una finestra e reazioni agli eventi locali. Questa guida serve a chi riceve l'app già pronta. Gli account e le conversazioni del creatore non sono inclusi.

## Cosa funziona oggi

| Sistema | Disponibile |
| --- | --- |
| **Mac Apple Silicon** (M1 o successivi) | App `Mascotte-Mac-<versione>-arm64.zip`. Provata su macOS 27.0.1; non sono state provate versioni precedenti |
| **Mac Intel** | **Non supportato** dall'app attuale (scelta fatta: solo Apple Silicon). La vecchia app Swift in `app/` può essere compilata a mano, ma non è più sviluppata |
| **Windows x64** | App `Mascotte-Windows-<versione>-x64.zip` (portatile) e, quando presente nella release, l'installer `Mascotte-Setup-<versione>-x64.exe`. Guida in [WINDOWS.md](WINDOWS.md) |
| Windows ARM64, Linux | Non supportati |

I pacchetti si scaricano dalla pagina **Releases** di `github.com/Zekseron/Mascotte`, solo quando una release è stata pubblicata. Sono la stessa app per i due sistemi: stesse funzioni, con le differenze elencate in fondo.

## Installare su un Mac (Apple Silicon)

1. Scarica `Mascotte-Mac-<versione>-arm64.zip` dalla pagina Releases ed estrailo (doppio clic): ottieni `Mascotte.app`.
2. Trascina `Mascotte.app` nella cartella **Applicazioni**. Se vuoi che l'aggiornamento dall'app funzioni, tienila proprio in `/Applications/Mascotte.app`.
3. **Primo avvio.** L'app non è notarizzata da Apple, quindi macOS la blocca. Aprila una volta (si chiude con un avviso), poi vai in **Impostazioni di Sistema → Privacy e sicurezza**, scorri in fondo e premi **Apri comunque** accanto a Mascotte, poi conferma. Fallo solo se ti fidi di chi ti ha mandato il pacchetto e hai scaricato lo ZIP dalla release ufficiale. Non disattivare Gatekeeper.
4. Compare il gattino e un'icona nella barra dei menu in alto; l'app non ha icona nel Dock. Clic sul gattino (o sull'icona nella barra dei menu) apre la chat; clic destro apre il menu. **Esci** dal menu.
5. **Permesso «Registrazione schermo»: serve solo se usi l'osservazione di una finestra.** La prima volta che apri la sezione «Finestra da condividere» macOS lo chiede; se lo concedi, esci da Mascotte e riaprila perché valga. Se lo neghi tutto il resto continua a funzionare. Si cambia da **Impostazioni di Sistema → Privacy e sicurezza → Registrazione schermo**.

Gli ZIP creati dal creatore sono firmati con un certificato personale, non da Apple. Gli aggiornamenti scaricati dall'app (**Impostazioni → Controlla aggiornamenti**) non hanno la quarantena di macOS, quindi di norma non richiedono un altro «Apri comunque». Se un giorno il creatore cambiasse certificato, gli aggiornamenti dall'app verrebbero rifiutati e andrebbe reinstallata l'app a mano.

Senza account IA il gattino si anima, si trascina e consente di provare gli stati dal menu.

## Installare su Windows

Vedi [WINDOWS.md](WINDOWS.md): estrai lo ZIP (oppure apri l'installer), apri `Mascotte.exe`. L'app non è firmata digitalmente: Windows può chiedere una verifica della provenienza.

## Collegare i propri account

Installa le CLI ufficiali che vuoi usare; una sola è sufficiente per la micro chat.

- **Codex:** installazione dalla [guida ufficiale](https://learn.chatgpt.com/docs/cli); esegui `codex login` e accedi nel browser con il tuo account ChatGPT. Conferma con `codex login status`. Su Mac, Mascotte trova anche la CLI contenuta nell'app ChatGPT, se installata.
- **Claude Code:** installazione e accesso dalla [guida ufficiale](https://code.claude.com/docs/en/setup); avvia `claude` e completa il suo accesso con il tuo account.

La mascotte riusa le credenziali locali delle CLI. Non richiede password nella propria finestra e non copia le credenziali. Serve un account abilitato all'uso della CLI scelta. Gli invii usano i suoi limiti; questa versione non aggiunge API key. Modelli e politiche dati seguono la CLI/account configurati. Se l'accesso scade, Mascotte mostra l'errore della CLI: rifai il login dal terminale.

Clicca il gattino, scegli l'IA e scrivi. Invio invia; Maiusc+Invio va a capo. Il **primo invio** a Codex o a Claude dopo l'avvio di Mascotte chiede conferma e mostra cosa partirebbe; i messaggi successivi allo stesso servizio partono senza chiedere finché non chiudi Mascotte (immagini e secondo parere chiedono sempre). Nuova e Interrompi gestiscono la conversazione.

## IA locale (facoltativa)

Per una chat che non esce dal computer, installa [Ollama](https://ollama.com/download) (su Mac: <https://ollama.com/download/mac>; serve una versione recente, almeno 0.30.9 per il modello predefinito), aprilo, poi in **Impostazioni → IA locale** scegli un modello e premi **Scarica / aggiorna modello**. Il download richiede Internet e spazio libero (qualche GB). Su Mac Mascotte non avvia Ollama: lo apri tu. Su Windows può avviarlo da sola se è stato messo in `%LOCALAPPDATA%\Mascotte\local-ai\runtime`.

Puoi anche usare modelli già presenti in Ollama o altri motori locali già avviati da te (LM Studio, llama.cpp, Jan). Dei motori diversi da Ollama è stato provato dal vivo solo LM Studio. I modelli piccoli possono sbagliare: verifica le informazioni importanti.

## Altre funzioni

- **Note e azioni:** «ricorda: …» salva una nota; «apri la calcolatrice» o «apri download» chiedono conferma e poi aprono. Su Mac si possono aprire anche altre app («apri Safari»).
- **Osservazione di una finestra:** apri la sezione «Finestra da condividere», scegli la finestra → «Osserva» mostra un'anteprima locale; «Allega fotogramma…» invia **un solo fotogramma, dopo la tua conferma**.
- **Aggiornamenti:** **Impostazioni → Controlla aggiornamenti** cerca una release più recente su GitHub e, dopo la tua conferma, la scarica e riavvia l'app.

## Attivare le reazioni alle sessioni esterne (facoltativo)

Dalla chat apri le **Impostazioni** (ingranaggio in alto a destra), premi **Crea / aggiorna hook**, leggi l'anteprima e scegli **Applica con backup**. L'app modifica solo `~/.claude/settings.json` e `~/.codex/config.toml` (su Windows nella tua cartella utente), conserva gli altri hook e salva copie `*.before-mascotte-*`. Poi riapri le sessioni Claude/Codex; Codex chiede di approvare i nuovi hook (nella CLI: `/hooks`). L'anteprima può contenere impostazioni personali: non condividerla.

Se sposti l'app (per esempio nella cartella Applicazioni dopo aver fatto gli hook), premi di nuovo **Crea / aggiorna hook**: puntano alla posizione dell'app. Questa funzione è disponibile solo nell'app installata dal pacchetto, non quando la avvii dai sorgenti con `npm start`.

## Differenze tra Mac e Windows

- **Aggancio:** al Dock su Mac, alla barra delle applicazioni su Windows. L'aggancio alla finestra attiva c'è su entrambi.
- **IA locale:** i modelli proposti sono diversi (su Mac Gemma 4 e Qwen3.5, tutti in grado di leggere le immagini; su Windows Qwen3 e Qwen3-VL). Ollama gestito dall'app solo su Windows.
- **Azioni:** su Mac si aprono anche le app installate; su Windows solo Calcolatrice e cartelle.
- **Distribuzione:** su Mac solo ZIP, firmato con un certificato personale e non notarizzato (serve «Apri comunque»); su Windows ZIP e installer, non firmati.
- **Permessi:** solo su Mac serve «Registrazione schermo» per l'osservazione.

## Rimuovere

Esci dal menu della mascotte.

- **Mac:** sposta `Mascotte.app` nel Cestino. I dati (chat, note, impostazioni) restano in `~/Library/Application Support/Mascotte Electron`: eliminali solo se vuoi cancellare anche la tua cronologia.
- **Windows:** disinstalla da Impostazioni → App oppure elimina la cartella estratta. I dati restano in `%LOCALAPPDATA%\Mascotte`.
- **Hook:** elimina dalle configurazioni di Claude e Codex le voci che richiamano l'app, ripristinando l'eventuale notify precedente dal backup. Ripristina i backup completi soltanto se non hai fatto altre modifiche alle configurazioni nel frattempo.
- Le CLI gestiscono separatamente le proprie cronologie e credenziali.

## Anteprima nel browser, senza installare

Apri `viewer/index.html` (nella repo) con il browser e trascina la cartella `characters/Cat/rosso` nella pagina. Mostra le animazioni, senza account. In alternativa, con Python 3, dalla cartella della repo avvia `python3 -m http.server 8765 --bind 127.0.0.1` e visita `http://127.0.0.1:8765/viewer/`.

## Altre guide

- [PRIVACY.md](PRIVACY.md): quali dati escono dal computer e quali no.
- [WINDOWS.md](WINDOWS.md): guida Windows.
- Nella repo: `README.md` (panoramica), `windows/README.md` (comandi, limiti e prove), `PUBBLICAZIONE.md` (release).
