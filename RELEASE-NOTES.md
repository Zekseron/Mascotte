# Mascotte 0.10.2 — Mac

Questa release aggiorna **Mac Apple Silicon**. Su Windows la versione disponibile resta la **0.9.9**. [Release Windows 0.9.9](https://github.com/Zekseron/Mascotte/releases/tag/v0.9.9)

## Correzione

- **Porta degli eventi occupata da un altro programma.** Per ricevere gli avvisi degli hook di Claude Code e Codex, Mascotte apre una porta solo sul computer, di solito la 8766. Se un altro programma la sta già usando, prima Mascotte non riceveva più gli eventi e la mascotte smetteva di reagire. Ora sceglie da sola un'altra porta: 8767 o 8768, altrimenti una porta libera indicata dal sistema (sempre nell'intervallo 49152–65535, mai porte di servizi come SSH o HTTPS). Gli hook la trovano da soli: non devi fare nulla.
- **Diagnostica più chiara.** In **Impostazioni → Diagnostica**, la voce «Ricezione degli eventi» dice quale porta usa Mascotte e, se la 8766 era occupata, da quale programma. Spiegazione in [PROBLEMI.md](https://github.com/Zekseron/Mascotte/blob/main/PROBLEMI.md#eventi).

## Verifiche

- Test automatici su macOS, Windows e Linux a ogni modifica (355).
- Prove sul Mac: 8766 occupata da un'altra copia di Mascotte (riserva 8767), 8766–8768 tutte occupate (porta scelta dal sistema), avvisi di un hook reale arrivati in entrambi i casi, Diagnostica con il nome del programma che occupa la porta.

## Aggiornamento

- In Mascotte per Mac, apri **Impostazioni → Controlla aggiornamenti**.
- Per una nuova installazione, scarica `Mascotte-Mac-0.10.2-arm64.zip`, estrailo e sposta `Mascotte.app` in Applicazioni. Il pacchetto usa la firma locale di Mascotte. [Guida all'installazione](https://github.com/Zekseron/Mascotte/blob/main/LEGGIMI.md)
