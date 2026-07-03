# Changelog

Tutte le modifiche rilevanti al progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il
progetto adotta il [Semantic Versioning](https://semver.org/lang/it/): MAJOR
per cambi incompatibili al dataset/formato, MINOR per nuove funzionalità,
PATCH per correzioni. Ogni release pubblicata corrisponde a un tag git `vX.Y.Z`.

## [1.2.0] — 2026-07-03

### Aggiunto
- **Turbo ×4**: tasto `F` o pulsante ⏩ nel footer accelerano il gioco in
  partita (stesso effetto del flag `?fast=1`, ma attivabile al volo, anche da
  mobile).

### Corretto
- Il suono di selezione ora suona anche scegliendo il bersaglio **da tastiera**
  (e da nameplate/touch): prima era legato al solo hover del mouse sul canvas.

## [1.1.2] — 2026-07-03

### Corretto
- **Il PNG scaricato ora ha sempre nome ed estensione corretti**: su desktop lo
  share sheet nativo (es. Chromium/macOS) materializza il file condiviso con un
  nome temporaneo senza `.png` — ora CONDIVIDI usa lo share sheet solo su
  dispositivi touch/mobile e su desktop scarica direttamente.
- Il blob URL del download viene revocato dopo 60s invece di 2s: con "chiedi
  dove salvare" attivo il download parte alla conferma e un revoke precoce lo
  avrebbe rotto.

## [1.1.1] — 2026-07-03

### Corretto
- **Clic/Invio ora salta davvero le animazioni**: la caduta non consumava il
  flag di skip (e il cambio fase lo azzerava), quindi cliccare durante la
  caduta — l'animazione più lunga — non faceva nulla. Ora lo skip risolve
  all'istante la fisica della caduta (il corpo atterra dove sarebbe atterrato)
  e porta la camera al suolo; saltabile anche l'attesa prima dei risultati.

## [1.1.0] — 2026-07-03

### Aggiunto
- **Pulsante "▼ SCARICA PNG"** dedicato ed evidente nella schermata risultati:
  scarica sempre direttamente l'immagine della classifica (niente share sheet);
  CONDIVIDI resta per la condivisione nativa.
- **Supporto mobile**: layout a colonna con classifica sotto il gioco (≤820px),
  canvas che scala fino a 0.5× (blocchi 2px, sempre pixel-perfect), HUD e
  overlay compatti, `touch-action: manipulation`.
- **Controlli touch**: il primo tap seleziona il bersaglio (stessa
  evidenziazione dell'hover), il secondo tap conferma la spinta; un tap sul
  vuoto deseleziona. Mouse e tastiera invariati.

## [1.0.0] — 2026-07-03

Prima release pubblica.

### Aggiunto
- **Condivisione della classifica**: pulsante CONDIVIDI nella schermata
  risultati genera una card PNG in stile arcade (vincitore con sprite,
  16 posizioni con foto) condivisa via Web Share API o scaricata; da `file://`
  ripiega sulla copia negli appunti di un testo formattato. Nessun dato salvato.
- Pagina **crediti stilata** (`credits.html`, generata da `tools/fetch_faces.mjs`)
  con i volti in ordine alfabetico, badge licenza color-codificati e link alle
  fonti su Wikimedia Commons.
- `LICENSE` (MIT per il codice; le foto mantengono le licenze Commons originali).
- Credit dell'autore e link al repository nella schermata del titolo.

## [0.4.0] — 2026-07-03

### Aggiunto
- **Controlli da tastiera**: `←`/`→` (o `A`/`D`) selezionano il bersaglio,
  `Invio`/`Spazio` confermano, avviano, saltano le animazioni e rigiocano;
  `Esc` annulla; `M` audio on/off.

### Modificato
- **Foto più definite**: quantizzazione da 36×36 a 48×48 (pixel foto 3×3
  uniformi su volto 144px).
- **Merli della torre ridisegnati**: blocchi di mattoni con giunti di malta,
  coprimerlo in pietra con sporto, tinte variate, più visibili sopra la
  piattaforma.

## [0.3.0] — 2026-07-03

### Modificato
- **Proporzioni Street Fighter 2**: canvas interno 640×600, sprite raddoppiati
  a 144×224 (blocchi d'arte 4px), torre/fisica/effetti in scala; i personaggi
  occupano ~40% dell'altezza dello schermo.
- **Gioco "assolutamente 2D"**: eliminate tutte le rotazioni non multiple di
  90° e le scale non intere — caduta con tumbling a scatti di 90° pixel-perfect,
  cadaveri sdraiati esatti, idle a due pose pre-renderizzate, niente roll/zoom
  di camera, coriandoli e testi a step discreti.
- **Hover ridisegnato**: cornice rossa lampeggiante + freccia oro a scatti al
  posto del glow sfumato.
- **Layout**: scala del canvas a passi di 0.25, classifica a 16 righe che
  riempiono l'intera altezza del pannello.

### Corretto
- Le scritte durante la caduta non escono più dai bordi dello schermo (clamp
  con misurazione del testo).
- `U.hash` degenerava in costante con argomenti numerici: mattoni, edera e
  ciuffi d'erba non avevano mai avuto la varietà prevista.

## [0.2.0] — 2026-07-03

### Modificato
- **Partite a 15 turni**: ogni partita estrae 15 sfidanti casuali + Michela
  Murgia (16 partecipanti); ogni rivincita ripesca dal roster di 81.
- **Grafica interamente pixel-art**: sprite +30% su griglia a blocchi 2×,
  pixel foto uniformi, torre senza gradienti (ombreggiatura per-mattone a fasce
  discrete), cielo a bande con dither, sole/nuvole pixel, shockwave a fasi.

## [0.1.0] — 2026-07-02

### Aggiunto
- Versione iniziale: picchiaduro satirico king-of-the-hill con 81 figure della
  storia pubblica italiana, volti da Wikimedia Commons pixelizzati su corpi
  pixel-art con abiti parametrici, torre medievale, fisica di caduta, classifica
  a eliminazione, SFX chiptune WebAudio, funzionante anche da `file://`.

[1.2.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/releases/tag/v0.1.0
