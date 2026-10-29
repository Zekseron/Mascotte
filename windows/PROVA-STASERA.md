# Prima prova Windows

Pacchetto **anteprima 0.8.0 x64**. Prima verifica offline, poi account, poi hook. Non serve avviare come amministratore.

1. Avvia l'installer oppure estrai lo ZIP e apri Mascotte.exe. Se non parte, riportami il testo della finestra di errore o cosa succede; non disattivare le protezioni di Windows.
2. Controlla che Rosso sia visibile senza rettangolo attorno. Trascinalo, cambia grandezza, prova waiting/celebrate dal menu. Clicca una zona trasparente: deve arrivare alla finestra sottostante. Prova anche un secondo monitor o scala display 125%/150% se disponibili.
3. Clicca Rosso: la chat deve aprirsi e il campo deve poter ricevere testo. Chiudi/riapri la chat. Esci e riapri l'app: Rosso deve ricordare posizione e grandezza.
4. Installa/accedi alle CLI native con i tuoi account. Nel terminale verifica `codex login status` e che `claude` apra la sua sessione; poi riapri Mascotte. Una CLI è sufficiente per iniziare.
5. Invia «Rispondi solo: ciao» a Codex e/o Claude. Questa è la prima chiamata reale e usa il tuo piano. Continua con «Cosa ti ho chiesto prima?» e verifica il contesto; cambia IA e verifica che non abbia la chat dell'altra. Prova Nuova e Interrompi su una risposta sufficientemente lunga.
6. Apri le Impostazioni (ingranaggio) e premi Crea / aggiorna hook. Leggi l'anteprima; Applica con backup solo se vuoi attivarli. Riapri una sessione CLI e chiedi di leggere un README di prova: osserva listening/reading/done sul gattino. Non occorre condividere le configurazioni personali.
7. In Gestione attività osserva CPU e memoria dei processi Mascotte in riposo, durante le animazioni e durante una chat. Electron usa più processi: considera la somma. Esci dal menu e controlla che tutti i processi Mascotte e la richiesta CLI siano chiusi.

### Prova aggancio 0.5.0

- Clic destro → Aggancio → barra: controlla altezza sopra la barra, cambio grandezza e ripristino al riavvio.
- Porta in primo piano una finestra non massimizzata; clic destro sulla mascotte → Aggancio → finestra attiva. Sposta e ridimensiona la finestra: la mascotte deve seguire il bordo superiore.
- Minimizza/ripristina: deve sparire e tornare. Chiudi la finestra: deve restare libera. Trascina la mascotte: deve sganciarsi.
- Prova Nascondi/Mostra, finestre massimizzate, due monitor con DPI diversi e desktop virtuali. Con finestra massimizzata resta all'interno dello schermo.
- Seleziona Libera / sgancia ed Esci: in Gestione attività controlla che il processo PowerShell usato dall'aggancio si chiuda. Se l'aggancio fallisce, riporta l'errore: non abilitare permessi di amministratore o modificare ExecutionPolicy.

Per controllare l'ascolto locale in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8766 -State Listen | Select-Object LocalAddress, LocalPort
```

Deve risultare **127.0.0.1**, non 0.0.0.0 o un indirizzo della LAN.

Per verificare i permessi sui dati:

```powershell
icacls "$env:LOCALAPPDATA\Mascotte"
icacls "$env:LOCALAPPDATA\Mascotte\chat\history.json"
```

Non pubblicare token, history.json, configurazioni o credenziali. Per riferire l'esito bastano: versione Windows e architettura, quali passaggi funzionano, errore esatto (rimuovendo dati personali) e CPU/RAM osservate. Rimangono da validare anche startup degli hook e stop degli eventuali processi figli.

