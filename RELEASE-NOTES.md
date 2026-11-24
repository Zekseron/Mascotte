# Mascotte 0.10.0 — Mac

Questa release aggiorna **Mac Apple Silicon**. Su Windows la versione disponibile resta la **0.9.9**. [Release Windows 0.9.9](https://github.com/Zekseron/Mascotte/releases/tag/v0.9.9)

## Novità

- **Il fumetto della mascotte.** Promemoria, sveglie e conferme compaiono in un fumetto accanto alla mascotte, invece che come notifiche di sistema. Gli avvisi informativi spariscono da soli dopo qualche secondo. Promemoria e sveglie restano finché non li chiudi con «×». Un clic sul testo apre la micro chat.
- **Sveglia dal fumetto.** Quando suona una sveglia, il fumetto mostra «Ferma» e «Rimanda 5 minuti» e suona da lì (bip o audio scelto), senza aprire la finestra di Mascotte. Se la sveglia si spegne da sola dopo 3 minuti, nel fumetto resta un avviso da chiudere.
- **Sempre visibile, mai invadente.** Il fumetto segue la mascotte, resta dentro lo schermo e compare anche sopra le app a tutto schermo e sulle altre scrivanie. Se nascondi la mascotte, gli avvisi arrivano come notifiche di sistema e una sveglia che sta suonando passa alla finestra di Mascotte.
- **A tua scelta.** In **Impostazioni → Sveglie e promemoria → Avvisi di Mascotte** scegli fra il fumetto e le notifiche di sistema, e con «Prova avviso» vedi subito il risultato.

## Privacy

Gli avvisi del fumetto restano solo in memoria: non vengono salvati e spariscono chiudendo l’app. Per ora il fumetto mostra solo gli avvisi di Mascotte, non le notifiche delle altre app. Dettagli in [PRIVACY.md](https://github.com/Zekseron/Mascotte/blob/main/PRIVACY.md).

## Verifiche

- Test automatici su macOS, Windows e Linux a ogni modifica (oltre 320).
- Prove d’uso sul Mac: avviso di prova, promemoria vero, sveglie con «Ferma» e «Rimanda» dal fumetto, sveglia lasciata spegnere da sola, audio personalizzato scelto dal selettore, mascotte agganciata al Dock, libera vicino ai bordi e sul secondo schermo, «Nascondi» e «Mostra», app a tutto schermo e un’altra scrivania.

## Aggiornamento

- In Mascotte per Mac, apri **Impostazioni → Controlla aggiornamenti**.
- Per una nuova installazione, scarica `Mascotte-Mac-0.10.0-arm64.zip`, estrailo e sposta `Mascotte.app` in Applicazioni. Il pacchetto usa la firma locale di Mascotte. [Guida all’installazione](https://github.com/Zekseron/Mascotte/blob/main/LEGGIMI.md)
