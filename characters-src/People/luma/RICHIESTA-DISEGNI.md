# Richiesta a Codex: disegni nuovi per animare Luma

Scheda di lavoro per Codex, con lo strumento di generazione immagini integrato (lo stesso usato per `source.png`). Scritta il 2 novembre 2026 su richiesta dell'utente.

## Obiettivo

Oggi Luma ha due soli disegni (occhi aperti e chiusi). Le animazioni attuali deformano quei pixel e aggiungono effetti. L'utente vuole **movimento vero e cambi di posa**: braccia che salutano, mano al mento, salto con le braccia in alto, libro tra le mani, sonnellino accovacciata.

Servono due famiglie di disegni:

- **A. Pezzi per il burattino:** corpo senza braccia, braccia e mani in varie pose, teste girate, bocche. Claude li monta con uno scheletro in `build.py` e li muove a 20 fps. È la priorità, perché rende fluidi gli stati che restano in piedi nella posa base.
- **B. Pose chiave complete:** per gli stati in cui la figura cambia del tutto, da 3 a 6 disegni per stato, come nell'animazione a disegni.

## Regole per tutti i disegni

- **Riferimento:** `characters-src/People/luma/source.png`, metà sinistra (occhi aperti). Mantenere esattamente:
  - capelli ricci arancio rame con la stessa sagoma;
  - occhi ambra, lentiggini e guance rosate;
  - camicia color crema con colletto, giacca corta senape con maniche a sbuffo;
  - salopette corta verde petrolio con tasca e bottoni;
  - cintura marrone con borsello con la luna, chiave inglese e cacciavite;
  - stivaletti marroni;
  - contorno scuro bordeaux e stile "chibi" illustrato.
- **Inquadratura:** figura intera, frontale come il riferimento, **stessa scala** (altezza dalla cima dei capelli alla suola circa 890 px in una cella alta 937), piedi sulla stessa linea di base e centrati come nel riferimento. Margine bianco ampio su tutti i lati, niente di tagliato.
- **Fogli piccoli:** generare **al massimo 2–4 celle per foglio**, uguali e affiancate, perché con due celle (1678 × 937) la coerenza è stata buona. Sfondo bianco puro, niente linee, testo, ombre a terra o scacchiera.
- **Scontorno:** poi rimuovere solo il fondo, con lo stesso procedimento del README di questa cartella (prompt «background-extraction»), senza ridisegnare.
- **Scarto:** confrontare ogni disegno con il riferimento a metà trasparenza e scartare se cambiano:
  - proporzioni di testa e corpo o sagoma dei capelli;
  - colori;
  - borsello, luna o attrezzi;
  - numero delle dita (cinque).

  Meglio rigenerare che tenere un disegno "quasi uguale".

## Dove salvare

- Grezzi e scontornati in `characters-src/People/luma/disegni/<gruppo>/`, per esempio `disegni/A2-braccia/`, con nomi parlanti (`braccio-sx-saluto-1.png`).
- Un file `characters-src/People/luma/disegni/ELENCO.md` con: file, gruppo, prompt usato, eventuale scarto e motivo.
- **Non modificare** `build.py`, `characters/People/luma/` né altri file del progetto: il montaggio lo fa Claude. Non fare commit di questi disegni senza chiedere all'utente.

## A. Pezzi per il burattino (priorità)

Ogni pezzo va disegnato **alla stessa scala e posizione del riferimento**: deve combaciare se sovrapposto a `source.png`.

**A1. Corpo senza braccia** (1 disegno, il più importante). Stessa Luma, stessa posa, ma senza le braccia. La giacca va dipinta completa ai fianchi, dove ora la coprono le maniche, e il borsello va disegnato intero. Restano solo le spalline della giacca, arrotondate, come attacco delle braccia.

> Use case: identity-preserve. Using the attached Luma reference (left character), draw the IDENTICAL character, same pose, scale, position and style, but with BOTH ARMS REMOVED for a cut-out animation rig. Paint the torso completely where the arms used to cover it: jacket sides, overalls and the full tool pouch must be visible and finished. Keep only small rounded shoulder caps of the jacket where the arms attach. Face, hair, clothes, colors and outlines unchanged. Pure white background, full body, generous margins, no text, no shadows.

**A2. Braccia staccate** (per ciascun braccio, sinistro e destro di Luma), ognuna con la spalla nello stesso punto del riferimento e la manica a sbuffo intera:

1. lungo il fianco, come ora;
2. alzato per salutare, avambraccio verticale e palmo aperto, in 3 disegni con la mano inclinata a sinistra, dritta e a destra;
3. piegato con la mano al mento (solo il braccio destro di Luma, a sinistra per chi guarda);
4. alzato in alto per esultare;
5. avanti a gomito piegato, mani all'altezza della pancia, come per tenere qualcosa o scrivere su una tastiera.

> Use case: cut-out animation part. Draw ONLY Luma's [left/right] arm from the attached reference, same puffy mustard sleeve, cuff, hand, outline and painting style, at the exact scale it has on the reference body. Pose: [pose]. The shoulder end is a clean rounded sleeve cap that will be layered under the body's shoulder. Nothing else in the image: no body, no head. Pure white background.

**A3. Mani da sole** (per entrambe), alla stessa scala: aperta di fronte, pugno, indice puntato, pollice in su, mano che tiene una matita, mano che tiene un libro aperto (il libro marrone a parte, intero).

**A4. Teste** (tagliate al colletto, stessa scala): tre quarti verso sinistra, tre quarti verso destra, sguardo in alto, sguardo in basso. Ognuna con occhi aperti e una seconda versione con occhi chiusi.

> Use case: cut-out animation part. Draw ONLY Luma's head and hair from the attached reference, cut cleanly at the collar line, same scale, colors and style. The head is turned three-quarters to the [left/right] / looking [up/down]; hair volume and curls consistent with the reference. Eyes [open/closed]. Pure white background.

**A5. Bocche ed espressioni sul viso frontale.** Servono teste frontali identiche al riferimento, cambiando solo bocca e occhi:
- bocche: chiusa sorridente, piccola «o», aperta «a», larga felice, «e» fra i denti, preoccupata ondulata, sorpresa;
- occhi: sguardo a sinistra, a destra, in alto, spalancati per la sorpresa, preoccupati con le sopracciglia alzate, mezzi chiusi assonnati.

Generare due varianti per foglio, come per gli occhi chiusi, perché l'allineamento resta buono.

## B. Pose chiave complete

Figura intera, stesse regole d'inquadratura. Fra parentesi il numero di disegni.

| Stato | Disegni |
| --- | --- |
| `sleep` | Seduta a terra con le ginocchia raccolte, testa reclinata sulle braccia, occhi chiusi (2: respiro dentro e fuori, cambia solo la spalla). |
| `celebrate` | Accovacciata pronta al salto (1); in aria con braccia e gambe aperte, bocca aperta felice (1); atterraggio con ginocchia piegate (1); posa finale con pugno alzato e occhiolino (1). |
| `reading` | Tiene un libro aperto con due mani all'altezza del petto, sguardo in basso (2: occhi a sinistra e a destra della pagina); gira la pagina (1). |
| `writing` | Taccuino in una mano, matita nell'altra, sguardo sul foglio (3, la matita in tre punti). |
| `working` | Stringe un bullone su un piccolo congegno di ottone tenuto davanti a sé con la chiave inglese del borsello (4, la chiave in quattro angoli). |
| `waiting` | Saluta con il braccio alzato, bocca aperta come se chiamasse (3, la mano che oscilla). |
| `error` | Spaventata, mani davanti alla bocca, spalle alzate (2). |
| `thinking` | Mano al mento, sguardo in alto a destra (2: occhi in alto e di lato). |
| `look` | Tiene una lente d'ingrandimento davanti a un occhio, l'altro chiuso (2, la lente in due posizioni). |
| `drag` | Sollevata come presa per il colletto, braccia in giù, gambe che penzolano, faccia sorpresa (3, le gambe in tre posizioni). |

> Use case: identity-preserve, animation key pose. Create a sprite sheet with exactly [N] equal cells side by side of the attached Luma character, preserving her exact design, clothes, hairstyle, colors and illustration style. Each cell: full body, same scale as the reference (about 890 px tall in a 937 px cell), feet on the same baseline, generous margin. Poses: [cell 1 …], [cell 2 …]. Only the described differences between cells; everything else identical so the cells work as consecutive animation frames. Pure white background, no lines, no text, no shadows.

## Ordine consigliato

1. A1 corpo senza braccia e A2 braccio sinistro di Luma che saluta: bastano per la prima animazione vera (`waiting`).
2. A2 restanti e A5 bocche e occhi: danno `talk`, `thinking`, `listening`, `idle` più vivo.
3. B `celebrate` e `sleep`, quelli che cambiano di più.
4. Il resto di B e A3/A4.

Alla fine di ogni gruppo, una riga in `ELENCO.md` con cosa è stato accettato. Claude parte da lì per il montaggio.
