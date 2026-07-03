# Changelog

Tutte le modifiche rilevanti al progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il
progetto adotta il [Semantic Versioning](https://semver.org/lang/it/): MAJOR
per cambi incompatibili al dataset/formato, MINOR per nuove funzionalità,
PATCH per correzioni. Ogni release pubblicata corrisponde a un tag git `vX.Y.Z`.

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

[1.0.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/matteoscurati/chi-butti-giu-dalla-torre/releases/tag/v0.1.0
