# Edizione pubblica

Questo repository contiene i sorgenti macOS e Windows (versione Windows in `windows/package.json`). Include soltanto il personaggio Rosso e i relativi sorgenti grafici.

Non copiare qui i vecchi ZIP, applicazioni compilate o cartelle personali: possono contenere asset esclusi dalla distribuzione pubblica. Ricompilare le release esclusivamente da questa cartella. La copia privata originale resta separata e non e collegata a questo repository.

Windows: dalla cartella windows eseguire npm ci, npm test e npm start. Per produrre una release usare npm run build:win. Le risorse vengono generate dalla libreria pubblica corrente.

macOS: consultare app/README.md; compilazione e verifica richiedono un Mac.

Non e stata ancora scelta una licenza di riutilizzo per il progetto. La visibilita pubblica non equivale a una licenza open source. Le dipendenze conservano le rispettive licenze.

## Cartelle e commit

- `windows/`, `app/`, `viewer/`, `spec/`, `characters/`, `characters-src/`, `tools/`: sorgenti, test e risorse pubbliche.
- `windows/dist/`: installer e ZIP generati, esclusi da Git. La build copia l'app portatile in `distribuzione/Windows-portatile/`, anch'essa esclusa.
- `esportabile/` e `work/`: esportazioni e prove locali, escluse.
- Eventuali file Electron rimasti nella radice da build precedenti sono esclusi da Git; non spostare l'app mentre e in esecuzione.
- Modelli e runtime IA non vengono inclusi nei sorgenti o nelle release. I file modello (`*.gguf`, `*.safetensors`, `*.onnx`) sono esclusi da Git.

Su un nuovo PC: installare Mascotte, aprire Gestione, installare/avviare Ollama dal collegamento ufficiale, scegliere il modello e premere **Scarica / aggiorna modello**. Non servono Git o Node.js per questi passaggi. Il download richiede Internet e spazio libero; i dati della chat non vengono inviati per scaricare il modello.

Il catalogo compatibile e esplicito in `windows/lib/local-ai.cjs`: ogni download aggiorna il tag ufficiale scelto, senza adottare automaticamente una nuova famiglia. La verifica controlla presenza locale, formato GGUF e supporto alla generazione testuale; non certifica accuratezza o velocita su ogni PC. Se la revisione non supera la verifica, Mascotte non la dichiara pronta. Per aggiungere un nuovo modello/famiglia occorre aggiornare e verificare il catalogo nell'app.

Prima del commit: `git status --short`, `git diff --check`, poi `npm.cmd test` nella cartella `windows`. Pubblicare installer e ZIP come asset di una release GitHub, senza aggiungerli al repository. `git add` deve comprendere soltanto sorgenti, test, guide e workflow.
