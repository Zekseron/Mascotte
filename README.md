# Mascotte

**Anteprima 0.9.0:** nuova [modalità Agente](AGENTI.md) per Codex e Claude, con cartella di lavoro, sessioni separate, attività e approvazioni. È ancora in anteprima: alcune parti potrebbero cambiare.

Una mascotte desktop per **Windows (x64)** e **Mac (Apple Silicon)** che reagisce con animazioni a Claude Code e Codex, e che all'occorrenza fa domande al volo, risponde con un'IA locale o guarda una finestra che scegli tu. Il personaggio è intercambiabile: sono inclusi il gattino in pixel art Rosso e Luma, illustrata.

Versioni distribuite: [Mac Apple Silicon 0.10.2](https://github.com/Zekseron/Mascotte/releases/tag/v0.10.2) e [Windows 0.9.9](https://github.com/Zekseron/Mascotte/releases/tag/v0.9.9). I due pacchetti possono essere aggiornati in momenti diversi.

Progetto e decisioni: [DESIGN.md](DESIGN.md).

## Cosa fa

- **Mascotte:** gattino trasparente e trascinabile, sempre in primo piano, con stati animati. Si può agganciare alla barra delle applicazioni (Windows) o al Dock (Mac) oppure al bordo di una finestra. Su Mac vive nella barra dei menu, senza icona nel Dock.
- **Micro chat con Codex e Claude:** un clic sul gattino apre una finestrella. Usa le CLI ufficiali già autenticate sul tuo computer, con il tuo account. Il **primo invio** a ciascun servizio dopo l'avvio chiede conferma e mostra messaggio e cronologia che partirebbero.
- **Chat locale:** risponde con modelli che girano sul computer, tramite Ollama (anche modelli già installati) o altri motori locali già avviati da te (LM Studio, server di llama.cpp, Jan), oppure con **llama.cpp (Mascotte)**: Mascotte scarica (solo dopo la tua conferma, con impronte SHA-256 verificate) una build fissata di llama.cpp e il modello Gemma 4 E4B, e avvia e chiude da sé il server su `127.0.0.1`. Nessun modello cloud viene usato.
- **Note:** si salvano a mano o con «ricorda: …» e vengono ritrovate per le domande locali. Restano sul computer.
- **Promemoria e sveglie:** nella chat locale «ricordami alle 15:30 di chiamare Marco», «sveglia tra 20 minuti», «che promemoria ho?», «cancella promemoria 2». Mascotte calcola l'orario, chiede conferma e alla scadenza te lo dice nel **fumetto** accanto alla mascotte (resta finché non lo chiudi; clic sul testo per aprire la chat). Se la mascotte è nascosta, o se nelle Impostazioni scegli «Notifiche di sistema», arriva invece una notifica di sistema. La chat locale conosce anche data e ora attuali. Le **sveglie** («sveglia…», «timer…», «svegliami…») alla scadenza suonano a ripetizione finché non le fermi (al massimo 3 minuti), con «Ferma» e «Rimanda 5 minuti» direttamente nel fumetto; se la mascotte è nascosta, o con le notifiche di sistema, compaiono invece nella finestra di Mascotte; i promemoria normali sono solo un avviso. Nelle Impostazioni, sezione «Sveglie e promemoria», trovi l'elenco con «Elimina», il volume della sveglia, la scelta di un audio personalizzato (MP3, WAV, M4A, OGG o FLAC, fino a 10 MB) al posto del bip e «Avvisi di Mascotte» (fumetto o notifiche di sistema, con «Prova avviso»).
- **Aprire app, cartelle e file:** con frasi naturali («apri Safari», «apri download», «apri fattura.pdf»). Su Mac dalla 0.9.3 e su Windows dalla 0.9.8 apre subito, anche con Codex o Claude scelti e senza inviare loro la richiesta; programmi, installer e script trovati nelle cartelle non si aprono mai.
- **Cartelle visibili:** la chat locale può elencare (solo nomi, tipo, dimensione e data, mai il contenuto) quelle cartelle e le altre che aggiungi tu dalle Impostazioni.
- **Osservazione di una finestra:** scegli una finestra, la vedi in anteprima locale e puoi allegare **un solo fotogramma**, solo dopo conferma, a Codex, Claude o a un modello locale che legge le immagini. Su Mac serve il permesso «Registrazione schermo». Con la chat locale e un modello che legge le immagini, mentre osservi ogni messaggio include da solo il fotogramma attuale (resta sul computer).
- **Impostazioni:** l'ingranaggio in alto a destra nella micro chat apre un pannello a sezioni: mascotte (personaggio, grandezza di base, mascotte personali), IA locale, Codex e Claude, note, cartelle visibili, hook, aggiornamenti.
- **Colori delle mascotte** (Mac dalla 0.9.5): scegli il colore di ogni parte di Luma e Rosso da **Impostazioni → Mascotte → Colori**; luci e ombre del disegno restano.
- **Mascotte personali:** da **Impostazioni → Mascotte → Aggiungi mascotte…** puoi caricare altri personaggi (una cartella con `character.json` e `sprites.png`). Come crearli e collegarli: [PERSONAGGI.md](PERSONAGGI.md).
- **Secondo parere:** sotto una risposta locale, «Chiedi a Codex o Claude…» manda domanda e risposta per una verifica; «Secondo parere con schermata…» aggiunge il fotogramma che ha visto il modello locale (conservato in memoria 10 minuti) o quello della finestra osservata. Sempre con anteprima e conferma.
- **Diagnostica:** Impostazioni → Diagnostica → **Controlla** verifica in locale notifiche, firma (Mac), permessi, hook, accessi a Claude e Codex e IA locale, e per ogni problema spiega cosa fare; la guida completa è [PROBLEMI.md](PROBLEMI.md). «Copia resoconto» prepara un testo con soli esiti, versione e sistema.
- **Hook:** dalle **Impostazioni** si collegano le sessioni di Claude Code e Codex, così la mascotte reagisce a ciò che fanno. Anteprima prima di applicare, con backup. Facoltativo: **avvisi di Claude e Codex nel fumetto** («Claude ha concluso il turno» per qualche secondo, «Codex è in attesa» finché non lo chiudi o finché quella sessione non riparte; con più sessioni dello stesso agente l'attività di una non chiude l'attesa di un'altra).
- **Aggiornamenti:** dalle **Impostazioni** si controllano e si installano le nuove versioni pubblicate. Dalla 0.9.1 la ricerca tiene conto del sistema operativo.
- **Feedback (dalla 0.9.1):** dalle Impostazioni puoi segnalare un problema o proporre un’idea con un modulo in italiano e inglese. Contatto facoltativo; nessun dato viene allegato automaticamente.

Il dettaglio di ogni funzione, con limiti e prove, è in [windows/README.md](windows/README.md). Cosa esce dal computer e cosa no: [PRIVACY.md](PRIVACY.md).

Per installare l'app già pronta: [LEGGIMI.md](LEGGIMI.md) (Mac e Windows) e [WINDOWS.md](WINDOWS.md). Il Mac Intel non è supportato (solo Apple Silicon).

## Personaggi disponibili

- **Cat → Rosso**: gattino in pixel art.
- **People → Luma**: personaggio illustrato, con le gambe che seguono la direzione quando la trascini.

I disegni dei personaggi inclusi sono stati generati con l'intelligenza artificiale. Si sta lavorando a un modo per aggiungere a Mascotte anche personaggi creati da altre persone, compresi quelli disegnati a mano.

Il personaggio si sceglie dalle Impostazioni, diviso per categorie; la grandezza viene ricordata per ciascun personaggio. Le mascotte personali si aggiungono dall'app (**Impostazioni → Mascotte → Aggiungi mascotte…**) e restano nella cartella dati sul tuo computer, fuori dal repository: formato, creazione e prova nel visore sono spiegati in [PERSONAGGI.md](PERSONAGGI.md).

## Copyright

Copyright © 2026 Zekseron. Tutti i diritti riservati. Il repository è pubblico per essere consultato, ma non è open source: copiare, modificare, ridistribuire o presentare come proprio questo lavoro richiede il permesso scritto dell'autore. Dettagli in [LICENSE](LICENSE).
