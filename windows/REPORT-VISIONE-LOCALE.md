# Prima prova di visione locale

Data: 27 ottobre 2026.

## Integrazione

Catalogo: `qwen3-vl:2b-instruct` e `qwen3-vl:4b-instruct`. Il 4B testuale resta il modello predefinito per nuove installazioni. Su questo PC viene selezionato il 2B visivo per la prova.

Il modello visivo riceve soltanto l'immagine allegata e confermata dall'utente, tramite Ollama su localhost. Nessun invio a Codex o Claude e nessun salvataggio dell'immagine nella cronologia. Le domande successive non riutilizzano automaticamente il fotogramma. La finestra non viene trasmessa continuamente e non sono disponibili azioni automatiche su mouse o tastiera.

## Prova reale su questo PC

- Intel Core 7 150U, circa 16 GB RAM, inferenza CPU; GPU integrata non utilizzata da Ollama.
- Ollama 0.40.11, modello 2B Instruct Q4 scaricato: 1.930.568.531 byte.
- Digest: `afc393e3572c07db0bc84aa460d928a16c75f3fbb9ca9e0dccc4fbd2dafb573e`.
- Immagine sintetica JPEG 800 × 450: titolo, nome dello switch S1, VLAN 42 e rettangolo rosso. Nessun contenuto personale acquisito.
- Domanda: «Leggi il nome dello switch e il numero della VLAN nella schermata. Indica anche il colore del rettangolo. Rispondi brevemente.»
- Risposta: «Switch: S1, VLAN: 42, colore del rettangolo: rosso».
- Tempo: **47,5 secondi**, incluso caricamento ed elaborazione dell'immagine.
- Contesto 4096 token, massimo 512 token generati, ragionamento disattivato, modello scaricato dalla RAM dopo la risposta. Nessun modello rimasto caricato al termine della prova.

È una singola prova indicativa: non misura accuratezza generale né garantisce prestazioni su screenshot grandi, caratteri piccoli o interfacce complesse. Su questo PC la funzione è adatta a richieste occasionali; non è una prova di visione continua in tempo reale. Il 4B è stato verificato con servizi simulati, senza scaricarne i pesi o misurarne le prestazioni.

## Verifiche software

48 test automatici superati. Per entrambi i modelli visivi sono verificati download, capacità visiva, invio dell'immagine, successiva richiesta solo testuale e rifiuto degli allegati con modelli testuali.

Prova Electron con servizio IA simulato e cattura reale di una finestra sintetica: selezione del 2B, annullamento senza invio, conferma con immagine locale, nessuna finestra di invio remoto, assenza di immagine nella cronologia e arresto della cattura. Verificata anche l'interfaccia compatta con pannello richiudibile.
