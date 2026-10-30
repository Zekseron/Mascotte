# Sorgenti Luma

`source.png`: i due fotogrammi approvati, con fondo rimosso tramite imagegen integrato. `preview.png`: primo fotogramma esportato. La precedente anteprima in `previews/luma-idle/` resta il riferimento del movimento.

Rigenerazione su Windows, dalla radice del progetto:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File characters-src/People/luma/build.ps1
```

Il comando usa System.Drawing incluso in Windows, senza dipendenze scaricate, e scrive `characters/People/luma/`. La scelta di esecuzione vale solo per quel processo. Questo generatore è separato dai generatori Python dei gattini; `tools/build_all.py` conserva il pacchetto presente e lo include nell'indice.

La deformazione replica l'anteprima: inviluppo sinusoidale solo fra le righe 380 e 650, massimo 4 px, inspirazione 1,6 s ed espirazione 2,4 s. Il secondo fotogramma è ritagliato a x=949 per conservare la correzione di allineamento approvata. Interpolazione dei colori premoltiplicati per l'alpha; nessuna variazione di scala globale. Il movimento viene campionato a 20 Hz e quantizzato in 17 livelli; i confini dei battiti vengono inseriti esattamente nella sequenza. Il foglio resta entro i limiti del caricatore Windows.

Prompt di estrazione dello sfondo (imagegen integrato):

> Use case: background-extraction. Edit target: attached two-frame sprite sheet. Remove ONLY the white background, make it truly transparent. Preserve the exact existing pixels of both Luma characters, original two-frame layout, original canvas dimensions 1678 x 937 if possible, position, scale, colors, outlines, all facial details, clothing and tools. Left character eyes open, right character eyes closed. Do not redraw or redesign or reposition anything. Do not add shadows or checkerboard. This is a background removal for an already-approved animation.
