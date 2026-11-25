# Mascotte 0.10.1 — Mac

Questa release aggiorna **Mac Apple Silicon**. Su Windows la versione disponibile resta la **0.9.9**. [Release Windows 0.9.9](https://github.com/Zekseron/Mascotte/releases/tag/v0.9.9)

## Novità

- **Diagnostica.** In **Impostazioni → Diagnostica** il pulsante **Controlla** verifica se notifiche, firma dell’app, permessi, hook e accessi a Claude e Codex sono a posto. Per ogni cosa che non va spiega cosa significa, con **Come si fa** (passi semplici nella nuova guida [PROBLEMI.md](https://github.com/Zekseron/Mascotte/blob/main/PROBLEMI.md)) e, dove serve, **Apri Impostazioni di Sistema**. **Copia resoconto** prepara un testo da mandare a chi ti aiuta, con soli esiti, versione e sistema. Durante il controllo compare una notifica di prova.
- **Nessun avviso perso in silenzio.** Se una notifica di sistema non può partire (per esempio perché il Mac non si fida della firma di Mascotte), il promemoria arriva nel fumetto oppure nella chat di Mascotte, e il problema viene annotato in `errori.log` senza il testo del promemoria.
- **Avvisi di Claude e Codex nel fumetto (facoltativi).** Con gli hook attivi puoi accenderli in **Impostazioni → Sveglie e promemoria**: «Claude ha concluso il turno» resta qualche secondo, «Codex è in attesa» resta finché non lo chiudi o finché quella sessione non riparte. Con più sessioni dello stesso agente, l’attività di una non chiude l’attesa di un’altra. Sono spenti di predefinito, compaiono solo con la mascotte visibile e mai come notifiche di sistema.

## Se non ti arrivano le notifiche

Apri **Impostazioni → Diagnostica → Controlla** e segui **Come si fa** accanto alle voci segnate. La spiegazione completa, anche su cosa comporta fidarsi del certificato di Mascotte, è in [PROBLEMI.md](https://github.com/Zekseron/Mascotte/blob/main/PROBLEMI.md#firma).

## Privacy

La Diagnostica controlla tutto sul computer e non invia nulla. Per gli accessi a Claude Code e Codex legge solo l’esito dei loro comandi di stato, non il testo. Gli avvisi degli agenti contengono solo frasi fisse, mai testo delle sessioni; per riconoscere le sessioni Mascotte riceve un’impronta anonima, tenuta solo in memoria. Dettagli in [PRIVACY.md](https://github.com/Zekseron/Mascotte/blob/main/PRIVACY.md).

## Verifiche

- Test automatici su macOS, Windows e Linux a ogni modifica (348).
- Prove sul Mac: Diagnostica dall’app impacchettata e dai sorgenti, ripiego di un promemoria quando la notifica di sistema non parte, avvisi di Claude e Codex con eventi reali e simulati (più sessioni, sveglia attiva, mascotte nascosta).

## Aggiornamento

- In Mascotte per Mac, apri **Impostazioni → Controlla aggiornamenti**.
- Per una nuova installazione, scarica `Mascotte-Mac-0.10.1-arm64.zip`, estrailo e sposta `Mascotte.app` in Applicazioni. Il pacchetto usa la firma locale di Mascotte. [Guida all’installazione](https://github.com/Zekseron/Mascotte/blob/main/LEGGIMI.md)
