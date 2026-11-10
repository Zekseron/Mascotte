# Mascotte

**Anteprima 0.9.0:** nuova [modalità Agente](AGENTI.md) per Codex e Claude, con cartella di lavoro, sessioni separate, attività e approvazioni. È ancora in anteprima: alcune parti potrebbero cambiare.

Una mascotte desktop per **Windows (x64)** e **Mac (Apple Silicon)** che reagisce con animazioni a Claude Code e Codex, e che all'occorrenza fa domande al volo, risponde con un'IA locale o guarda una finestra che scegli tu. Il personaggio è intercambiabile: sono inclusi il gattino in pixel art Rosso e Luma, illustrata.

Versione: **0.9.1** per **Windows** e **Mac Apple Silicon**. I pacchetti Mac e Windows possono essere aggiornati in momenti diversi. [Scarica la versione 0.9.1](https://github.com/Zekseron/Mascotte/releases/tag/v0.9.1) per Windows o Mac.

Progetto e decisioni: [DESIGN.md](DESIGN.md).

## Cosa fa

- **Mascotte:** gattino trasparente e trascinabile, sempre in primo piano, con stati animati. Si può agganciare alla barra delle applicazioni (Windows) o al Dock (Mac) oppure al bordo di una finestra. Su Mac vive nella barra dei menu, senza icona nel Dock.
- **Micro chat con Codex e Claude:** un clic sul gattino apre una finestrella. Usa le CLI ufficiali già autenticate sul tuo computer, con il tuo account. Il **primo invio** a ciascun servizio dopo l'avvio chiede conferma e mostra messaggio e cronologia che partirebbero.
- **Chat locale:** risponde con modelli che girano sul computer, tramite Ollama (anche modelli già installati) o altri motori locali già avviati da te (LM Studio, server di llama.cpp, Jan), oppure con **llama.cpp (Mascotte)**: Mascotte scarica (solo dopo la tua conferma, con impronte SHA-256 verificate) una build fissata di llama.cpp e il modello Gemma 4 E4B, e avvia e chiude da sé il server su `127.0.0.1`. Nessun modello cloud viene usato.
- **Note:** si salvano a mano o con «ricorda: …» e vengono ritrovate per le domande locali. Restano sul computer.
- **Promemoria e sveglie:** nella chat locale «ricordami alle 15:30 di chiamare Marco», «sveglia tra 20 minuti», «che promemoria ho?», «cancella promemoria 2». Mascotte calcola l'orario, chiede conferma e alla scadenza mostra una notifica di sistema. La chat locale conosce anche data e ora attuali. Le **sveglie** («sveglia…», «timer…», «svegliami…») alla scadenza aprono anche la finestra di Mascotte con «Ferma» e «Rimanda 5 minuti» e suonano a ripetizione finché non le fermi (al massimo 3 minuti); i promemoria normali sono solo una notifica. Nelle Impostazioni, sezione «Sveglie e promemoria», trovi l'elenco con «Elimina», il volume della sveglia e la scelta di un audio personalizzato (MP3, WAV, M4A, OGG o FLAC, fino a 10 MB) al posto del bip.
- **Azioni locali con conferma:** aprire la Calcolatrice e le cartelle Download, Documenti, Scrivania e Immagini, anche con frasi naturali; su Mac anche le app installate. Ogni azione parte solo dopo la tua conferma.
- **Cartelle visibili:** la chat locale può elencare (solo nomi, tipo, dimensione e data, mai il contenuto) quelle cartelle e le altre che aggiungi tu dalle Impostazioni.
- **Osservazione di una finestra:** scegli una finestra, la vedi in anteprima locale e puoi allegare **un solo fotogramma**, solo dopo conferma, a Codex, Claude o a un modello locale che legge le immagini. Su Mac serve il permesso «Registrazione schermo». Con la chat locale e un modello che legge le immagini, mentre osservi ogni messaggio include da solo il fotogramma attuale (resta sul computer).
- **Impostazioni:** l'ingranaggio in alto a destra nella micro chat apre un pannello a sezioni: mascotte (personaggio, grandezza di base, mascotte personali), IA locale, Codex e Claude, note, cartelle visibili, hook, aggiornamenti.
- **Mascotte personali:** da **Impostazioni → Mascotte → Aggiungi mascotte…** puoi caricare altri personaggi (una cartella con `character.json` e `sprites.png`). Come crearli e collegarli: [PERSONAGGI.md](PERSONAGGI.md).
- **Secondo parere:** sotto una risposta locale, «Chiedi a Codex o Claude…» manda domanda e risposta per una verifica; «Secondo parere con schermata…» aggiunge il fotogramma che ha visto il modello locale (conservato in memoria 10 minuti) o quello della finestra osservata. Sempre con anteprima e conferma.
- **Hook:** dalle **Impostazioni** si collegano le sessioni di Claude Code e Codex, così la mascotte reagisce a ciò che fanno. Anteprima prima di applicare, con backup.
- **Aggiornamenti:** dalle **Impostazioni** si controllano e si installano le nuove versioni pubblicate. Dalla 0.9.1 la ricerca tiene conto del sistema operativo.
- **Feedback (Windows 0.9.1):** dalle Impostazioni puoi segnalare un problema o proporre un’idea con un modulo in italiano e inglese. Contatto facoltativo; nessun dato viene allegato automaticamente.

Il dettaglio di ogni funzione, con limiti e prove, è in [windows/README.md](windows/README.md). Cosa esce dal computer e cosa no: [PRIVACY.md](PRIVACY.md).

Per installare l'app già pronta: [LEGGIMI.md](LEGGIMI.md) (Mac e Windows) e [WINDOWS.md](WINDOWS.md). Il Mac Intel non è supportato (solo Apple Silicon).

## Personaggi disponibili

- **Cat → Rosso**: gattino in pixel art.
- **People → Luma**: personaggio illustrato, con le gambe che seguono la direzione quando la trascini.

I disegni dei personaggi inclusi sono stati generati con l'intelligenza artificiale. Si sta lavorando a un modo per aggiungere a Mascotte anche personaggi creati da altre persone, compresi quelli disegnati a mano.

Il personaggio si sceglie dalle Impostazioni, diviso per categorie; la grandezza viene ricordata per ciascun personaggio. Le mascotte personali si aggiungono dall'app (**Impostazioni → Mascotte → Aggiungi mascotte…**) e restano nella cartella dati sul tuo computer, fuori dal repository: formato, creazione e prova nel visore sono spiegati in [PERSONAGGI.md](PERSONAGGI.md).

## Copyright

Copyright © 2026 Zekseron. Tutti i diritti riservati. Il repository è pubblico per essere consultato, ma non è open source: copiare, modificare, ridistribuire o presentare come proprio questo lavoro richiede il permesso scritto dell'autore. Dettagli in [LICENSE](LICENSE).
