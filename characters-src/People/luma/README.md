# Sorgenti Luma

`source.png`: i due disegni approvati (occhi aperti e chiusi), con fondo rimosso tramite imagegen integrato. `preview.png`: primo fotogramma esportato. L'anteprima in `previews/luma-idle/` resta il riferimento del respiro.

Rigenerazione, su Mac o Windows, dalla radice del progetto (serve solo Pillow):

```bash
python3 characters-src/People/luma/build.py
```

Scrive `characters/People/luma/` e, in `work/previews/luma/`, `contact.png` con tutte le pose e una GIF per stato. Anche `python3 tools/build_all.py luma` lo esegue. Sostituisce il vecchio `build.ps1`, di cui conserva il respiro.

## Come nascono le pose

Ci sono solo due disegni, quindi ogni posa deforma quei pixel e aggiunge bocca ed effetti nello stesso stile, con il contorno scuro dell'illustrazione:

- **Occhi chiusi:** solo la zona degli occhi chiusi viene innestata, sfumata, sul disegno aperto. I due disegni differiscono di poco anche nei contorni, e lo scambio intero faceva tremolare la sagoma a ogni battito.
- **Respiro:** è quello approvato, cioè un inviluppo sinusoidale fra le righe 380 e 650, massimo 4 px, con inspirazione al 40% del ciclo. In più testa e spalle salgono di 1,5 px.
- **Corpo:** la testa ruota attorno al collo, il corpo si inclina con i piedi fermi, c'è lo schiacciamento ancorato ai piedi, il salto, il tremolio e il pendolo quando la trascini. È una griglia di deformazione con colori premoltiplicati, senza aloni.
- **Bocche e sguardi:** vengono dalle teste disegnate da Codex in `disegni/A5-espressioni/`. Di ogni testa si innesta solo la bocca o solo la zona degli occhi, con bordi sfumati e il tono della pelle pareggiato sul bordo. Scala e spostamento di ogni cella sono scritti in `EXPRESSIONS` dentro `build.py`; sono stati trovati confrontando pelle, naso e contorno attorno alla zona. L'innesto avviene prima della deformazione, così segue la testa. Il mezzo battito usa gli occhi socchiusi. Senza la cartella `disegni/` il generatore non parte.
- **Braccio che saluta (`waiting`):** il braccio sinistro di Luma viene staccato lungo un taglio sul fianco (`ARM_CUT`). Per i primi passaggi si piega dalla spalla (`arm="lift"`). Poi lo sostituiscono braccio e spalla delle pose di saluto disegnate da Codex (`disegni/B-waiting/`, `WAVE_CELLS`), registrati su colletto, bretella e fianco originali. Le figure intere di Codex non si usano, perché sono ridisegnate più grandi. Sopra il polsino si tiene solo la mano, riempita dal centro del palmo, così i capelli di Codex restano fuori. Spalla e fianco scoperti vengono dal corpo senza braccia (`disegni/A1-corpo/`).
- **Effetti:** z, puntini, onde, ingranaggi, libro, foglio e matita, fulmine, punto esclamativo, stelline, cuore, goccia e lente che ingrandisce davvero l'occhio. Sono disegnati a 3x con contorno arrotondato, perlopiù nell'area in alto a destra.

Le pose uguali diventano una sola cella. Lo spazio di lavoro di 600 × 1080 px sorgente viene ridotto a 8/17 nel fotogramma di 288 × 512, il massimo ammesso. Con `pixelRatio` 7 e `scale` 3 Luma è alta circa 189 punti come prima, con margine per salti ed effetti.

Prompt di estrazione dello sfondo (imagegen integrato):

> Use case: background-extraction. Edit target: attached two-frame sprite sheet. Remove ONLY the white background, make it truly transparent. Preserve the exact existing pixels of both Luma characters, original two-frame layout, original canvas dimensions 1678 x 937 if possible, position, scale, colors, outlines, all facial details, clothing and tools. Left character eyes open, right character eyes closed. Do not redraw or redesign or reposition anything. Do not add shadows or checkerboard. This is a background removal for an already-approved animation.
