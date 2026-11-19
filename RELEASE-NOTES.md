# Mascotte 0.9.9 — Mac

Questa release aggiorna **Mac Apple Silicon**. Su Windows la versione disponibile resta la **0.9.8**. [Release Windows 0.9.8](https://github.com/Zekseron/Mascotte/releases/tag/v0.9.8)

## Novità

- **Registro locale degli errori.** Gli errori interni che prima passavano in silenzio (per esempio una notifica di promemoria che non si mostra o una cartella temporanea di immagini che non si riesce a cancellare) vengono annotati in `errori.log`, nella cartella dati. Contiene solo data, tipo e messaggio dell’errore, con la tua cartella personale scritta `~`: mai testi di chat, note, prompt o contenuti di file. Resta sul Mac, non viene inviato e non supera 256 KB (più la copia precedente). Dettagli in [PRIVACY.md](https://github.com/Zekseron/Mascotte/blob/main/PRIVACY.md).
- **Conferma di aggiornamento più precisa.** Su Mac la finestra dice ora cosa succede davvero: la versione installata viene sostituita e, se l’installazione non riesce, rimessa al suo posto. Prima prometteva un backup che su Mac non viene conservato.
- **Chiusura più pulita.** Uscire da Mascotte mentre la chat o la mascotte stanno comunicando con l’app non lascia più errori nel registro.

## Sotto il cofano

- Il codice principale dell’app è stato riorganizzato in parti più piccole (promemoria e sveglie, osservazione delle finestre, aggiornamenti, azioni delle finestre, chat), senza cambiare il comportamento.
- Verifiche: test automatici su macOS, Windows e Linux a ogni modifica (oltre 300); prove d’uso sul Mac di chat locale, note, «apri», colori delle mascotte, mascotte personali, cartelle visibili, sveglia e promemoria, osservazione di una finestra, invio a Codex e aggiornamento dall’app.

## Aggiornamento

- In Mascotte per Mac, apri **Impostazioni → Controlla aggiornamenti**.
- Per una nuova installazione, scarica `Mascotte-Mac-0.9.9-arm64.zip`, estrailo e sposta `Mascotte.app` in Applicazioni. Il pacchetto usa la firma locale di Mascotte. [Guida all’installazione](https://github.com/Zekseron/Mascotte/blob/main/LEGGIMI.md)
