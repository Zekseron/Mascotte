# Se qualcosa non funziona

Questa guida spiega, passo per passo, come sistemare i problemi più comuni di Mascotte. Non servono conoscenze tecniche: per ogni problema trovi cosa significa, cosa fare e cosa comporta.

## Come capire cosa non va: la Diagnostica

1. Apri la micro chat di Mascotte (clic sulla mascotte, oppure sull'icona di Mascotte nella barra dei menu del Mac o nell'area di notifica di Windows).
2. Premi l'**ingranaggio** in alto a destra per aprire le Impostazioni.
3. Apri la sezione **Diagnostica** e premi **Controlla**.

Mascotte controlla alcune cose sul computer e mostra un elenco:

- ✅ tutto a posto;
- ⚠️ da controllare: qualcosa funziona solo in parte;
- ❌ da sistemare: una funzione non può andare;
- ℹ️ informazione: di solito una funzione facoltativa che non stai usando.

Accanto a ogni voce che non è ✅ trovi **Come si fa**, che apre il punto giusto di questa guida, e a volte **Apri Impostazioni di Sistema**, che porta direttamente alla pagina da cambiare.

Durante il controllo compare anche una **notifica di prova** («Mascotte · diagnostica»): serve a vedere se il sistema accetta le notifiche di Mascotte.

Tutto il controllo avviene sul computer: niente viene inviato da nessuna parte.

<a id="resoconto"></a>
### Mandare il resoconto a chi ti aiuta

Premi **Copia resoconto** e incolla il testo in un messaggio o in una mail. Contiene solo la versione di Mascotte, il sistema e gli esiti dei controlli: nessun nome di file o cartella, nessun account, nessun testo della chat.

---

<a id="firma"></a>
## Firma dell'app (solo Mac)

**Cosa significa.** Ogni app per Mac porta una «firma», che dice chi l'ha preparata e che nessuno l'ha modificata. Mascotte è firmata con un certificato personale dell'autore («Mascotte Firma Locale»), non con uno rilasciato da Apple. Il Mac che lo considera attendibile la tratta come un'app normale. Se non lo considera attendibile, Mascotte si apre (dopo «Apri comunque»), ma **macOS può impedirle di mostrare notifiche**: in quel caso Mascotte non compare nemmeno in Impostazioni di Sistema → Notifiche, e la Diagnostica segna ❌ anche alla voce «Notifiche di sistema».

**Cosa puoi fare.** Hai due strade.

### Strada 1: usare il fumetto (non devi cambiare niente)

Promemoria, sveglie e conferme compaiono nel **fumetto accanto alla mascotte**, che non dipende dalla firma. Controlla solo che:

- in Impostazioni → Sveglie e promemoria → **Avvisi di Mascotte** sia scelto «Nel fumetto accanto alla mascotte»;
- la mascotte resti visibile. Se la nascondi, gli avvisi passano alla chat di Mascotte, che si apre da sola per i promemoria.

### Strada 2: fidarsi del certificato di Mascotte

Così funzionano anche le notifiche di sistema.

**Cosa comporta, prima di farlo:** il tuo Mac considererà attendibili **tutte** le app firmate con questo certificato, non solo Mascotte. Fallo solo se ti fidi di chi ti ha dato Mascotte e il file del certificato. Si può annullare in qualsiasi momento (vedi sotto).

1. Chiedi a chi ti ha dato Mascotte il file **`Mascotte-Firma-Locale.cer`**. È la parte pubblica del certificato e non contiene niente di segreto.
2. Fai doppio clic sul file: si apre **Accesso Portachiavi** e il certificato finisce nel portachiavi **login**. Se ti chiede dove metterlo, scegli «login».
3. In Accesso Portachiavi cerca «Mascotte Firma Locale» e fai **doppio clic** sul certificato.
4. Apri la parte **Fidati** (triangolino).
5. Alla voce **Firma codice** scegli **Fidati sempre**. Lascia tutte le altre voci come sono.
6. Chiudi la finestra: il Mac chiede la password del tuo utente per confermare.
7. Esci da Mascotte (clic destro sulla mascotte → Esci) e riaprila.
8. In Mascotte apri Impostazioni → Diagnostica → **Controlla**: «Firma dell'app» deve diventare ✅. La prima notifica può far comparire la richiesta di permesso di macOS: scegli **Consenti**.

**Per annullare:** Accesso Portachiavi → cerca «Mascotte Firma Locale» → clic destro → **Elimina**. Le notifiche di sistema di Mascotte smettono di funzionare e torna valida la Strada 1.

> In futuro Mascotte potrebbe essere firmata con un certificato Apple: in quel caso questo passaggio non servirà più.

<a id="notifiche"></a>
## Notifiche di sistema

**Cosa significa.** La notifica di prova non è partita, oppure il sistema non l'ha confermata.

**Su Mac:**

1. Se la Diagnostica segna ❌ anche **Firma dell'app**, la causa è quella: vedi [Firma dell'app](#firma).
2. Altrimenti premi **Apri Impostazioni di Sistema** (oppure: menu Apple → Impostazioni di Sistema → **Notifiche**), cerca **Mascotte** nell'elenco e attiva **Consenti notifiche**.
3. Controlla che **Non disturbare** o una **Full immersion** non siano attivi (Centro di Controllo, in alto a destra).

**Su Windows:**

1. Start → **Impostazioni** → **Sistema** → **Notifiche**.
2. In alto, **Notifiche** deve essere attivo.
3. Nell'elenco delle app trova **Mascotte** e attivala.
4. Controlla che **Non disturbare** sia spento.

Se le notifiche di sistema non funzionano, gli avvisi non vanno persi: compaiono nel fumetto oppure, con la mascotte nascosta, nella chat di Mascotte.

<a id="fumetto"></a>
## Fumetto degli avvisi

**Cosa significa.** Il fumetto accanto alla mascotte compare solo quando la mascotte è **visibile**. Se è nascosta, gli avvisi vanno alle notifiche di sistema.

- **Per mostrare la mascotte:** clic sull'icona di Mascotte nella barra dei menu del Mac (in alto a destra) o nell'area di notifica di Windows (in basso a destra), oppure clic destro sull'icona → **Mostra**.
- **Per scegliere dove arrivano gli avvisi:** Impostazioni → Sveglie e promemoria → **Avvisi di Mascotte** → «Nel fumetto accanto alla mascotte» oppure «Notifiche di sistema». **Prova avviso** mostra subito il risultato.

<a id="registrazione-schermo"></a>
## Registrazione schermo (solo Mac)

**Cosa significa.** Serve **solo** per la funzione che osserva una finestra dalla chat (per esempio per chiedere un parere su quello che vedi). Se non la usi, puoi ignorarla.

1. Premi **Apri Impostazioni di Sistema** (oppure: Impostazioni di Sistema → **Privacy e sicurezza** → **Registrazione schermo e audio di sistema**).
2. Attiva **Mascotte**. Se non c'è, premi **+** e scegli Mascotte nella cartella Applicazioni.
3. Il Mac può chiedere di riaprire Mascotte: accetta.

**Cosa comporta:** Mascotte potrà leggere l'immagine della finestra che scegli tu, solo quando la osservi. L'immagine resta sul computer e va a Codex o Claude solo dopo una tua conferma.

<a id="hook"></a>
## Collegamento a Claude e Codex (hook)

**Cosa significa.** Gli «hook» sono piccole regole aggiunte alle impostazioni di Claude Code e Codex: quando lavorano, avvisano Mascotte, che si anima e (se l'hai acceso) mostra avvisi come «Claude ha concluso il turno». Sono **facoltativi**.

- **Per installarli o ricollegarli** (anche se hai spostato l'app): Impostazioni → **Hook** → **Crea / aggiorna hook** → leggi l'anteprima → **Applica con backup**.
- Poi **riapri** le sessioni di Claude Code e Codex che erano già aperte.
- **Codex chiede di approvare gli hook nuovi:** nella finestra di Codex scrivi `/hooks` e approvali. Finché non li approvi, Codex non li usa.

**Cosa comporta:** Mascotte modifica solo le impostazioni di Claude (`settings.json`) e di Codex (`config.toml`) e salva una copia di backup accanto ai file. A Mascotte arriva solo lo stato («sta leggendo», «ha finito», «aspetta») e un codice anonimo della sessione: mai il testo dei messaggi.

<a id="login"></a>
## Claude Code e Codex: installazione e accesso

**Cosa significa.** Per mandare domande a Claude o Codex dalla chat di Mascotte servono i loro programmi a riga di comando, con un accesso attivo. Sono **facoltativi**: senza, Mascotte funziona con l'IA locale.

- **Non installato:** in Impostazioni → Codex e Claude trovi i collegamenti alle guide di installazione ufficiali.
- **Nessun accesso o accesso scaduto:** apri il **Terminale** (Mac) o **PowerShell** (Windows) e scrivi:
  - per Claude: `claude`, poi nella finestra che si apre scrivi `/login` e segui le istruzioni nel browser;
  - per Codex: `codex login` e segui le istruzioni nel browser.

> La Diagnostica può dire che l'accesso «risulta» anche quando è scaduto: se le risposte non arrivano, rifai comunque l'accesso.

<a id="ia-locale"></a>
## IA locale

**Cosa significa.** Il motore che fa funzionare la chat **locale** (che non manda nulla in rete) non risponde. Serve per la chat locale, i promemoria e i comandi come «apri».

- **Su Windows:** Impostazioni → IA locale → **Scarica llama.cpp e modello**. Il download è grande (alcuni GB) e richiede Internet una sola volta.
- **Su Mac:** installa **Ollama** da <https://ollama.com/download/mac>, aprilo, poi in Mascotte Impostazioni → IA locale scegli un modello e premi **Scarica / aggiorna modello**.

<a id="eventi"></a>
## Ricezione degli eventi

**Cosa significa.** Per ricevere gli avvisi degli hook Mascotte apre una «porta» solo sul computer (non verso Internet). Di solito è la **8766**.

- **ℹ️ «La porta abituale 8766 è già usata da …»:** un altro programma usa già quella porta, quindi Mascotte ne ha scelta un'altra da sola: prima 8767 o 8768, altrimenti una libera indicata dal sistema. **Non devi fare nulla**: gli hook trovano la porta giusta da soli. Mascotte non usa mai porte riservate a servizi come SSH (22) o HTTPS (443), e non può prendere una porta già usata da un altro programma.
- **❌ «Mascotte non riesce a ricevere gli eventi»:** il canale non si è aperto affatto.
  1. Chiudi tutte le copie di Mascotte (clic destro sull'icona → **Esci**).
  2. Riapri Mascotte una volta sola.
  3. Ripeti il controllo. Se resta ❌, riavvia il computer.

<a id="posizione"></a>
## Posizione dell'app (solo Mac)

**Cosa significa.** Mascotte non è nella cartella **Applicazioni**. Funziona lo stesso, ma «Controlla aggiornamenti» potrebbe non riuscire a sostituirla.

1. Esci da Mascotte.
2. Apri il Finder, trova `Mascotte.app` (spesso è in Download) e trascinala nella cartella **Applicazioni**.
3. Riaprila da Applicazioni. Se hai gli hook, premi di nuovo **Crea / aggiorna hook**: puntano alla nuova posizione.
