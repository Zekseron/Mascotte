# Modalità Agente — anteprima 0.9.0

La chat normale resta disponibile con Locale, Codex e Claude. Con Codex o Claude puoi scegliere **Agente · file e comandi**, per lavorare su una cartella del computer invece di fare soltanto conversazione.

## Primo utilizzo

1. Scegli Codex o Claude. Occorre la relativa CLI installata e autenticata; Mascotte non gestisce il login e non inserisce chiavi API.
2. Passa da **Chat** ad **Agente · file e comandi**.
3. Premi **Scegli cartella…** e seleziona il progetto. Cambiare cartella avvia una nuova conversazione agente per quel servizio.
4. Scrivi un compito concreto, per esempio «Leggi questo progetto, correggi il problema e lancia i test». Il primo invio remoto richiede conferma anche se avevi già confermato la chat normale.
5. Consulta **Attività e modifiche**. Quando il motore chiede un permesso puoi consentire quella singola operazione o rifiutarla. I chiarimenti si compilano nella stessa finestra; non vengono approvati automaticamente.

**Interrompi** ferma il processo e i suoi figli. Non ripristina i file già modificati: usa Git o una copia di lavoro per poterli confrontare e recuperare. Se chiudi la finestra della chat durante il lavoro, il compito viene interrotto come nella chat normale.

## Sessioni e dati

- La conversazione agente è distinta dalla chat normale e separata tra Codex e Claude. Viene conservata una sessione corrente per servizio e relativa cartella; non c'è ancora un elenco di più progetti.
- I turni successivi riprendono la sessione del servizio, compresi i suoi risultati degli strumenti. La cronologia mostrata da Mascotte conserva gli ultimi 60 messaggi, con i limiti di testo della chat; la sessione del motore può contenere più contesto.
- **Nuova** avvia una nuova sessione per il servizio selezionato. Non cancella i file del progetto o le sessioni conservate dalle CLI.
- Al riavvio Mascotte riparte in Chat; la cartella e l'identificativo della sessione agente restano disponibili quando riattivi Agente.
- I dati aggiuntivi sono `agents/state.json` (cartelle e identificativi delle sessioni) e `agents/history.json` (cronologie), nella cartella dati di Mascotte. Le attività dettagliate mostrate nell'interfaccia restano in memoria per il compito corrente; le CLI possono conservarle nelle proprie sessioni.

## Capacità e limiti di questa prima versione

Codex usa il protocollo App Server della CLI installata, con sandbox `workspace-write` e approvazioni instradate all'utente. Carica le impostazioni della CLI e le istruzioni del progetto; Mascotte forza la policy di approvazione del turno. Le capacità effettive dipendono anche dalla versione della CLI, dall'account e dalle impostazioni gestite.

Claude usa il SDK ufficiale con la CLI installata, permessi `default` e richieste interattive gestite da Mascotte. Le impostazioni utente/progetto del SDK non vengono caricate automaticamente. Il suo controllo dei permessi non equivale alla sandbox di Codex; la cartella scelta è una cartella di lavoro, non una garanzia di isolamento completo. Autenticazione, limiti e condizioni del fornitore restano applicabili. La distribuzione di un prodotto basato sul SDK e l'uso personale della CLI richiedono verifiche distinte; questa anteprima non offre un nuovo metodo di login.

File letti, comandi e output possono essere inviati al servizio remoto. I comandi possono modificare file ed eseguire programmi con i permessi effettivamente concessi al motore. Non scegliere cartelle contenenti dati che non vuoi rendere disponibili all'agente.

Sono implementati sessioni, testo/immagini, attività, modifiche, approvazioni di comandi/file, richieste di permessi Codex e chiarimenti. Non sono ancora implementati tutti i flussi di plugin, browser, MCP o le interfacce specifiche di VS Code e delle app desktop. Le richieste di protocollo non supportate vengono rifiutate esplicitamente. Le funzioni della chat locale restano invariate.

## Verifiche

Su Windows sono stati provati i protocolli con processi simulati e Codex reale con dati sintetici: lettura, creazione di un file e ripresa della sessione. Il percorso Claude ha test simulati; non è ancora stato collaudato con una CLI e un account Claude reali su questo PC. La modalità Agente su Mac richiede build e collaudo dedicati: il codice comune non costituisce una verifica Mac.

Riferimenti tecnici: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).
