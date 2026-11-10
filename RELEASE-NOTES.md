# Mascotte 0.9.1 — Windows e Mac

Questa release aggiorna **Windows x64** e **Mac Apple Silicon**. Il pacchetto Windows è uscito il 9 novembre 2026; il pacchetto Mac 0.9.1 è stato aggiunto il 10 novembre 2026, dopo la compilazione e le prove sul Mac.

## Novità

- **Feedback e suggerimenti** nelle Impostazioni: modulo in italiano o inglese, con contatto facoltativo. L’app apre il browser senza allegare chat, note o file.
- **Versione e revisione della build** in Impostazioni → Aggiornamenti, per identificare la copia installata.
- Il nuovo controllo aggiornamenti cerca un pacchetto per il sistema in uso anche quando l’ultima release riguarda solo l’altra piattaforma.

## Installare o aggiornare Windows

- Per installare usa `Mascotte-Setup-0.9.1-x64.exe`.
- Per la versione portatile estrai tutto `Mascotte-Windows-0.9.1-x64.zip` in una cartella stabile.
- Dalla 0.9.0 puoi usare **Impostazioni → Aggiornamenti → Controlla aggiornamenti**. Impostazioni e conversazioni restano nella cartella dati del tuo utente.

I pacchetti Windows non sono ancora firmati digitalmente, quindi Windows li tratta come app di provenienza sconosciuta. Scaricali solo da questa pagina.

- **SmartScreen** mostra «PC protetto da Windows»: premi **Ulteriori informazioni** e poi **Esegui comunque**. Anche il browser può segnalare il download come poco comune.
- Con **Controllo intelligente delle app** (Smart App Control, Windows 11) attivo, Mascotte viene bloccata e non si può autorizzare la singola app. Per usarla bisogna disattivare la funzione in **Sicurezza di Windows → Controllo app e browser**: è una tua scelta, perché la protezione si toglie per tutte le app. Sugli aggiornamenti recenti di Windows 11 si può riattivare dalla stessa schermata; sulle versioni precedenti solo reimpostando Windows.

## Installare o aggiornare Mac

- Scarica `Mascotte-Mac-0.9.1-arm64.zip`, estrailo con doppio clic e sposta `Mascotte.app` in Applicazioni. Al primo avvio segui le istruzioni del [LEGGIMI](https://github.com/Zekseron/Mascotte/blob/main/LEGGIMI.md) («Apri comunque»).
- Dalla 0.9.0 puoi usare **Impostazioni → Aggiornamenti → Controlla aggiornamenti**: il pacchetto è firmato con lo stesso certificato personale della 0.9.0 e l’app ne verifica impronta SHA-256 e firma prima di sostituirsi.

Il pacchetto Mac è già firmato: chi lo scarica non deve creare certificati né firmare nulla. Non essendo notarizzato da Apple, macOS lo blocca al primo avvio; «Apri comunque» va fatto una sola volta e gli aggiornamenti dall’app non lo richiedono di nuovo.
