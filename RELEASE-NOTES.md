# Mascotte 0.9.9 — Windows e Mac

Questa release aggiorna **Windows x64** e **Mac Apple Silicon**.

## Novità

- **Registro locale degli errori.** Gli errori interni che prima passavano in silenzio (per esempio una notifica di promemoria che non si mostra o una cartella temporanea di immagini che non si riesce a cancellare) vengono annotati in `errori.log`, nella cartella dati. Contiene solo data, tipo e messaggio dell’errore, con la tua cartella personale scritta `~`: mai testi di chat, note, prompt o contenuti di file. Resta sul computer, non viene inviato e non supera 256 KB (più la copia precedente). Dettagli in [PRIVACY.md](https://github.com/Zekseron/Mascotte/blob/main/PRIVACY.md).
- **Conferma di aggiornamento più precisa.** Su Windows la versione precedente viene conservata in una cartella di backup. Su Mac viene sostituita e ripristinata se l’installazione non riesce.
- **Estrazione ZIP più affidabile su Windows.** Gli aggiornamenti e l’installazione di llama.cpp funzionano anche se Mascotte è avviata da PowerShell 7.
- **Chiusura più pulita.** Uscire da Mascotte mentre la chat o la mascotte stanno comunicando con l’app non lascia più errori nel registro.

## Sotto il cofano

- Il codice principale dell’app è stato riorganizzato in parti più piccole (promemoria e sveglie, osservazione delle finestre, aggiornamenti, azioni delle finestre, chat), senza cambiare il comportamento.
- Verifiche: test automatici su macOS, Windows e Linux a ogni modifica (oltre 300); prove d’uso sul Mac di chat locale, note, «apri», colori delle mascotte, mascotte personali, cartelle visibili, sveglia e promemoria, osservazione di una finestra, invio a Codex e aggiornamento dall’app.
- Su Windows x64 sono stati verificati anche l’invio di testo a Codex e Claude dalla micro chat, i selettori nativi di cartelle e mascotte, i promemoria e l’installazione di llama.cpp.

## Aggiornamento

- Apri **Impostazioni → Aggiornamenti → Controlla aggiornamenti**.
- Per una nuova installazione su Windows, usa `Mascotte-Setup-0.9.9-x64.exe` oppure estrai tutto `Mascotte-Windows-0.9.9-x64.zip` per la versione portatile.
- Per una nuova installazione, scarica `Mascotte-Mac-0.9.9-arm64.zip`, estrailo e sposta `Mascotte.app` in Applicazioni. Il pacchetto usa la firma locale di Mascotte. [Guida all’installazione](https://github.com/Zekseron/Mascotte/blob/main/LEGGIMI.md)
