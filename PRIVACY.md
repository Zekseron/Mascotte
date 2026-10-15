# Dati e limiti della versione 0.2

- Le animazioni e gli eventi funzionano localmente. Il server ascolta solo su 127.0.0.1 e richiede un token generato sul computer del destinatario.
- Il ponte legge gli eventi degli strumenti per determinare lo stato, ma invia alla mascotte solo stato e origine. Il notify Codex precedente, se presente, continua a ricevere il proprio payload come prima dell'installazione.
- Non ci sono screenshot automatici, microfono, registrazione generale della tastiera o telemetria aggiunta dalla mascotte.
- Inviare nella micro chat chiama la CLI scelta e trasmette al suo servizio il messaggio e il contesto della sessione. Le conversazioni delle due IA sono separate.
- Le politiche di conservazione, telemetria e trattamento del servizio/CLI sono quelle del fornitore e dell'account utilizzato; la mascotte non le cambia.
- La cronologia locale è un JSON non cifrato con permessi 0600, limitato a 1 MiB e 60 messaggi per IA. Le CLI conservano separatamente le proprie sessioni. Nuova resetta la conversazione della mascotte per l'IA selezionata, non cancella le cronologie del fornitore.
- Claude nella micro chat ha strumenti e MCP disabilitati. Codex usa un sandbox read-only e istruzioni per non eseguire comandi: la lettura di file non è tecnicamente esclusa e le integrazioni della configurazione Codex possono essere caricate. Questa versione non garantisce una chat Codex isolata dai dati locali. È un requisito da risolvere prima di una distribuzione pubblica presentata come “solo chat”.
- L'app pronta è un binario di sviluppo: può contenere percorsi di compilazione e simboli diagnostici. Non contiene copie delle credenziali o delle conversazioni del creatore.

Il pacchetto esclude `.codex`, `.claude`, `.git`, `work/`, backup delle configurazioni, file di endpoint, cronologie e schede di passaggio. Condividi lo ZIP esportato; non aggiungere cartelle personali al pacchetto.
