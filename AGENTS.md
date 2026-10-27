# Istruzioni per lavorare su Mascotte

## Mantenere allineato il piano Mac

Prima di modificare il progetto, leggere `WORK-IN-PROGRESS.md`, in particolare la sezione «5. Aggiornamento Mac e allineamento con Windows».

Per ogni aggiunta, modifica o correzione della versione Windows che cambia funzioni, interfaccia, modelli, integrazioni, dati salvati o distribuzione:

- aggiornare nello stesso intervento la checklist Mac in `WORK-IN-PROGRESS.md`, aggiungendo o integrando il passo corrispondente e la verifica prevista;
- se il passo era completato ma la modifica richiede altro lavoro su Mac, riaprirlo e spiegare cosa manca;
- se la modifica è esclusiva di Windows o già coperta su Mac, annotare nella sezione Mac il motivo per cui non richiede un porting, senza creare attività inutili;
- distinguere sempre funzioni Windows disponibili, proposte future e funzioni effettivamente verificate su Mac. Non segnare un passo Mac come completato sulla sola base dei test Windows.

Questa regola vale anche quando vengono implementate le altre proposte della lista. Prima di concludere un intervento Windows, controllare che il piano Mac rifletta il nuovo comportamento.
