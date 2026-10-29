# Collaudo di parità su Mac (passo 11)

Mac di prova: Apple M3, 16 GB, macOS 27.0.1. App: `/Applications/Mascotte.app` 0.8.0, firmata con «Mascotte Firma Locale».

Verifiche automatiche del 28 ottobre 2026: `npm test` in `windows/` 138 superati, 3 saltati (solo Windows), 0 falliti; `viewer/test` 56 su 56; `codesign --verify --deep --strict` superato.

Segna ogni riga con ✅ oppure ❌ e una nota. In caso di ❌ copia il messaggio che vedi.

## A. Avvio, chiusura e riavvio
1. Apri Mascotte da Spotlight: compare la mascotte, l'icona nella barra dei menu e nessuna icona nel Dock.
2. Esci dal menu della mascotte: la mascotte sparisce e non resta nulla in Monitoraggio Attività.
3. Riapri: posizione, scala, aggancio, cronologie delle chat, note e cartelle aggiunte sono quelli di prima.

## B. Mascotte e integrazione desktop
4. Trascina la mascotte; un clic sulle parti trasparenti passa all'app sotto; un clic sul personaggio apre la chat.
5. Aggancia al Dock e alla finestra attiva (clic destro): segue la finestra, si nasconde con Cmd+H o con la finestra ridotta.
6. Cambia scrivania e apri un'app a tutto schermo: la mascotte resta visibile.

## C. Chat Codex e Claude
7. Codex e Claude: invio con conferma, risposta, «Nuova», «Interrompi» a metà risposta.
8. **Errore:** in Claude esegui `/logout` nel terminale, manda un messaggio da Mascotte: compare l'errore vero (accesso scaduto), non «La CLI non ha risposto». Poi rifai il login.

## D. IA locale
9. Domanda a Gemma 4: risposta in italiano; «Locale · Ollama» nell'etichetta.
10. **Servizio spento:** chiudi Ollama dalla barra dei menu, fai una domanda: messaggio chiaro, nessun blocco. Riapri Ollama e riprova.
11. Download di Qwen3.5 2B dalle Impostazioni e **annullamento** a metà: nessun file a metà rimasto in `ollama list`.
12. **Motore spento:** scegli LM Studio con il server spento (`~/.lmstudio/bin/lms server stop`): torna a Ollama con un avviso.

## E. Memoria e azioni locali
13. «ricorda: …», poi «che note ho?»; modifica ed elimina una nota nelle Impostazioni; restano dopo il riavvio (punto 3).
14. «puoi aprirmi la calcolatrice», «apri chrome», «apri download»: chiede conferma e apre.
15. «quante immagini ho in download?», «che cartelle ci sono in siti?».
16. **Cartella sparita:** aggiungi una cartella di prova nelle Impostazioni, rinominala dal Finder, chiedine il contenuto: messaggio «non più disponibile».

## F. Osservazione e fotogrammi
17. «Scegli finestra», Osserva, «Allega fotogramma…» con Claude e con Gemma 4; «Smetti».
18. **Permesso negato:** disattiva Mascotte in Registrazione schermo, «Scegli finestra»: messaggio e pulsante «Apri Impostazioni di Sistema». Riattiva e riapri Mascotte.

## G. Hook
19. Una sessione Claude Code e una Codex: la mascotte cambia stato (ascolto, lettura, scrittura, attesa, finito).
20. «Crea / aggiorna hook» una seconda volta: l'anteprima non aggiunge doppioni.

## H. Aggiornamento
21. **Aggiornamento rifiutato:** crea un file qualsiasi nella repo (per esempio `prova.txt`), premi «Compila e aggiorna»: rifiuta per modifiche locali e l'app resta quella di prima. Poi cancella il file.
22. **Interruzione:** avvia «Compila e aggiorna» e chiudi Mascotte durante la compilazione, poi riaprila: l'app è ancora quella di prima e funziona.

## Esito (29 ottobre 2026)

- **A–E:** superati dall'utente sul Mac.
- **F17, G19:** superati ai passi 7 e 8 (stesse prove, stessa app). **F18** (permesso negato: messaggio e pulsante, poi riattivazione): superato.
- **G20:** verificato da terminale sui file reali: riapplicando gli hook non si aggiunge nulla. Corretto l'ordine dei campi (`matcher` prima di `hooks`): ora il file di Claude resta identico byte per byte.
- **H21:** verificato da terminale: con un file non tracciato nella repo l'aggiornamento rifiuta («La repo contiene modifiche locali…»). **H22** (chiusura durante la compilazione): superato; nessun processo di compilazione rimasto, app installata intatta (stesso requisito designato), cartella di compilazione parziale rimossa (la toglie comunque il prossimo aggiornamento).
- **Limiti rimasti:** aggiornamento da release GitHub e installazione su un altro Mac (rimandati al passo 12); Windows da ricollaudare per il codice comune cambiato (vedi piano, sezione 5).
