# Luma: anteprima idle

Aprire `anteprima.html` nel browser. Il file incorpora i fotogrammi e funziona offline. Respiro locale sul busto di 4 secondi (inspirazione 1,6 s, espirazione 2,4 s), con testa, bacino e piedi fermi; deformazione verticale morbida di massimo 4 pixel sorgente, senza ingrandire la figura, occhi chiusi per 140 ms, pausa e visualizzazione a 180 px. Supporta la preferenza di movimento ridotto. Studio preliminare, non ancora un pacchetto personaggio.

Fotogrammi creati con lo strumento integrato imagegen dalla seconda immagine fornita dall'utente. La generazione reinterpreta leggermente il riferimento. Foglio originale conservato in `luma-frames.png`. Allineamento delle due celle a distanza di 699 px (corretto lo scarto orizzontale di circa 1 px del fotogramma a occhi chiusi, misurato sui contorni di testa, busto e stivali); riproduzione canvas con ritaglio 480 × 937 px.

Prompt usato:

> Use case: identity-preserve. Create a precise animation sprite sheet for the attached Luma character, preserving her exact design, clothes, hairstyle, colors and illustration style. Landscape image with exactly TWO equal sized cells side by side, pure white background, no lines or text. Each cell shows the identical full-body character in exactly the same neutral pose and identical scale and coordinates relative to its cell, with generous margin. Left cell: original friendly expression, eyes open. Right cell: same image but both eyes gently closed in a natural blink, mouth and eyebrows unchanged. Feet and entire silhouette must align perfectly across cells. No other pose differences. This will be used as two animation frames, so consistency is essential.

Verifica: foglio generato ispezionato visivamente, dimensioni 1678 × 937 confermate. Verifica in browser non eseguita: il browser connesso blocca gli URL file locali.
