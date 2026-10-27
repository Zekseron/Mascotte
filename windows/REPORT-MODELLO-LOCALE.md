# Report del modello locale di Mascotte 0.8.0

Data: 27 ottobre 2026. Stato: modello installato su questo PC, integrazione attiva e prove iniziali completate.

## Scelta

Il modello predefinito è **Qwen3 4B Instruct**, distribuito da Ollama con il nome `qwen3:4b-instruct`. È stato scelto come compromesso fra dimensioni e qualità: nelle prove iniziali ha dato risposte più solide rispetto a Qwen3 1.7B. Quest'ultimo rimane selezionabile per sperimentare un modello più piccolo, ma ha prodotto anche errori su domande elementari.

Questa scelta riguarda i due modelli provati su questo computer: non è una classifica di tutti i modelli locali disponibili.

| Voce | Configurazione utilizzata |
| --- | --- |
| Famiglia | Qwen3, variante Instruct |
| Dimensioni | Circa 4 miliardi di parametri |
| Formato | GGUF, quantizzazione Q4_K_M |
| File del modello | 2.497.293.803 byte, circa 2,50 GB |
| Runtime | Ollama 0.40.11 |
| Contesto impostato da Mascotte | 4.096 token |
| Limite di generazione | 512 token per risposta |
| Ragionamento separato | Disattivato per la variante 4B Instruct |
| Rilascio della RAM | Dopo ogni risposta, con `keep_alive: 0` |
| Input nell'integrazione attuale | Solo testo |
| Licenza dei pesi | Apache 2.0 |

Dimensioni, quantizzazione e licenza sono documentate nella [scheda Ollama](https://ollama.com/library/qwen3:4b-instruct). La [scheda ufficiale Qwen](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) descrive la variante Instruct e il supporto al solo funzionamento senza blocchi di ragionamento. Il modello supporta un contesto massimo molto più ampio, ma Mascotte lo limita a 4.096 token per contenere il consumo di risorse.

## Prove reali sul tuo PC

Computer usato: Intel Core 7 150U, circa 16 GB di RAM, grafica Intel integrata. Ollama ha eseguito le prove sulla **CPU**. Erano aperti anche altri programmi.

L'ultima sessione di misura ha usato domande sintetiche, senza dati personali. I tempi includono il caricamento del modello e la generazione: il modello viene rilasciato dopo ogni risposta.

| Prova | Risultato osservato | Tempo | RAM del processo di inferenza, campione durante la risposta |
| --- | --- | --- | --- |
| Quanto fa 2 + 3? | Risposta: `5` | 7,9 s | 2.828 MiB |
| Spiegare il riavvio in una frase | Risposta comprensibile, con formulazione migliorabile | 13,0 s | 3.011 MiB |
| Recuperare il nome della mascotte da una nota sintetica | Nome `Lilla` recuperato correttamente | 9,3 s | 3.041 MiB |

Al termine delle tre prove Ollama non manteneva alcun modello caricato in RAM. Le misure sono salvate in [REPORT-MODELLO-LOCALE-MISURE.json](REPORT-MODELLO-LOCALE-MISURE.json), insieme alle domande e alle risposte integrali.

Questi sono **tre controlli funzionali, non un benchmark generale di accuratezza**. La RAM indicata è un campione del working set del processo `llama-server`, non il picco né la memoria totale di Mascotte e Windows. Con più applicazioni aperte o domande più lunghe i tempi possono aumentare.

## Cosa fa nella mascotte

- Risponde localmente a richieste testuali semplici e consulta le note salvate sul PC.
- Consente di selezionare una risposta locale, Codex o Claude e conservarla con **Ricorda…**, controllando il testo prima del salvataggio.
- Per approfondire con Codex o Claude prepara un messaggio modificabile. Ogni invio remoto richiede conferma; la memoria locale non viene aggiunta automaticamente.
- Gestisce due azioni predefinite, **apri calcolatrice** e **apri download**, ciascuna con conferma. Le azioni sono riconosciute dal programma: il modello non può far eseguire comandi arbitrari.

La memoria **non riaddestra i pesi del modello**. È un archivio di note: Mascotte cerca fino a cinque note pertinenti e le aggiunge al contesto della richiesta locale. La ricerca attuale usa parole in comune e può perdere sinonimi o formulazioni diverse. Sono conservabili fino a 200 note da 2.000 caratteri; la conversazione visualizzata è separata per ciascuna IA.

## Risorse, dati e costi

Il modello 4B richiede circa 3 GB di RAM nelle brevi prove svolte. Rilasciarlo dopo ogni risposta libera memoria per le altre applicazioni, a costo di ricaricarlo alla richiesta successiva.

Su questo PC sono stati predisposti il runtime e due modelli, per circa **3,7 GiB complessivi su disco**. Sono nella cartella dati dell'utente, sotto `%LOCALAPPDATA%\Mascotte\local-ai`. Quando non trova un servizio Ollama già attivo, Mascotte avvia il proprio runtime su `127.0.0.1:11434`, con `OLLAMA_NO_CLOUD=1`, e lo ferma quando esci dall'app. La [documentazione Ollama](https://docs.ollama.com/faq#how-can-i-disable-ollamas-cloud-features) descrive questa modalità senza funzioni cloud.

Le richieste locali non usano il piano Codex o Claude. Consumano risorse del PC ed energia; i token restano un'unità di elaborazione locale. Codex o Claude consumano il relativo utilizzo quando confermi un invio remoto.

Le note e la cronologia sono salvate nella cartella dati protetta dell'utente, ma **non sono cifrate**. Una nota sbagliata può portare a una risposta sbagliata: salvataggio e recupero non certificano la correttezza delle informazioni.

## Verifica e stato della consegna

- Suite automatica: **44 test superati**.
- Interfaccia provata con servizi simulati: chat locale, recupero delle note, annullamento e conferma degli invii remoti, conferma delle azioni e scelta del modello.
- Runtime e modelli reali provati sul PC; pacchetto Ollama verificato rispetto al digest della release ufficiale.
- Mascotte 0.8.0 riaperta: il processo Ollama gestito risulta figlio dell'app e ascolta solo su `127.0.0.1`.
- Installer e ZIP 0.8.0 generati. Il pacchetto distribuibile di Mascotte non include i pesi dei modelli: su un altro PC occorre predisporre Ollama e scaricare il modello scelto.
- Nessuna release pubblica è stata pubblicata e nessuna domanda di prova è stata inviata a un servizio IA remoto reale.

La soluzione è adatta come primo livello per conversazione e memoria personale. Per risposte complesse o dubbie resta disponibile il passaggio esplicito a Codex o Claude: il modello locale può sbagliare e non riconosce sempre quando avrebbe bisogno di aiuto.
