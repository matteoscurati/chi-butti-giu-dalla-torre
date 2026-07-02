# Chi butti giù dalla torre?

Picchiaduro satirico **king of the hill** in pixel art, stile arcade anni '90
(Street Fighter II). 81 figure della storia pubblica italiana (36 donne) — dal
fascismo a oggi, Michela Murgia inclusa — si sfidano in cima a una torre
medievale: clicca chi buttare giù, il superstite affronta lo sfidante successivo
finché resta un solo vincitore. Ogni personaggio ha un **abito coerente** con la
sua storia (camicia nera, tuta spaziale, maglia da ciclista, tailleur…) e urla
una **frase biografica** mentre precipita.

> Satira. Nessuna persona è stata davvero buttata giù dalla torre.

## Avvio

**Opzione 1 — apri e gioca.** Fai doppio clic su `index.html` (funziona da
`file://`, nessuna build necessaria).

**Opzione 2 — server statico** (consigliato, evita eventuali restrizioni del
browser sui file locali):

```bash
# dalla cartella del progetto
python3 -m http.server 8000
# poi apri http://localhost:8000
```

Qualsiasi server statico va bene (`npx serve`, ecc.).

## Come si gioca

- Nel duello in cima alla torre, **clicca il personaggio da buttare giù** (sullo
  sprite oppure sul suo nameplate in alto).
- Chi stai per buttare giù **trema di paura e suda freddo**; il perdente cade
  urlando la sua frase biografica, con onomatopea; il superstite resta in cima e
  affronta il prossimo sfidante che sbuca dalla botola.
- La **classifica** a destra si riempie in ordine inverso di eliminazione: il
  primo buttato giù finisce 81°, il vincitore finale è 1° (ed esulta saltellando).
- Un clic durante le animazioni le **salta**. In basso: pulsante **AUDIO** e link
  ai **CREDITI**.

## Flag di debug (query string)

- `?auto=1` — partita automatica (sceglie a caso), utile per il collaudo.
- `?fast=1` — animazioni accelerate (x4).
- `?gallery=1` — griglia con tutti gli 81 personaggi (QA volti/abiti).

Esempio: `index.html?auto=1&fast=1`.

## Struttura

```
index.html            markup + overlay DOM
css/style.css         estetica arcade (nameplate, classifica, CRT)
js/
  data.js             GENERATO: window.CHARACTERS (dataset per il runtime)
  util.js             config + utilità (rng, easing, hash, ...)
  audio.js            SFX chiptune sintetizzati (WebAudio)
  camera.js           camera verticale (pan/follow/shake)
  sprites.js          volto foto (testone) + abito coerente + animazioni
  tower.js            cielo, torre di mattoni, suolo, pila di corpi
  fx.js               particelle, sudore, testo fluttuante, coriandoli
  ui.js               nameplate, banner, classifica, risultati
  states.js           macchina a stati (flusso del duello + fisica caduta)
  main.js             boot, game loop, input, scaling
assets/faces/         81 volti (thumb da Wikimedia Commons)
assets/fonts/         Press Start 2P (+ licenza OFL)
characters.json       dataset canonico (deliverable)
CREDITS.md            fonte + autore + licenza di ogni volto
tools/fetch_faces.mjs script di download volti / generazione dataset
```

## Dettagli tecnici

- **HTML/CSS/JS vanilla**, Canvas 2D. Niente framework, niente build.
- Script classici (no ES module) e dataset in `js/data.js`: così tutto funziona
  anche aprendo il file da `file://` (dove `fetch` di JSON locali è bloccato).
- I volti sono foto ritagliate strette sul viso (**testone** riconoscibile),
  **pixelizzate** (downscale del canvas) e incorniciate, poi innestate su corpi
  pixel art disegnati a codice con **abito parametrico** (tipo/colore/accento,
  numero di maglia) coerente con il personaggio e adeguato al genere. Non si legge
  mai la memoria del canvas (`getImageData`/`toDataURL`), quindi il "taint" da
  `file://` non è un problema.
- **Animazioni**: la testa ha un moto indipendente (oscillazione + inclinazione)
  rispetto al corpo; respiro da fermo, tremolio e sudore quando il personaggio è
  puntato, braccia/gambe spalancate in caduta, posa d'esultanza per il vincitore.
  Ogni personaggio è pre-renderizzato (baking) in testa + 5 frame di corpo.
- **Caduta con fisica reale**: gravità, spinta iniziale verso l'esterno,
  rotazione del corpo, camera che segue, impatto con polvere, screenshake e
  onomatopea; i corpi si accumulano alla base.
- Risoluzione interna 480×600 scalata con `image-rendering: pixelated`
  (nessun antialiasing). Rendering leggero (torre e sprite in cache): ~60fps.
- Audio interamente sintetizzato con WebAudio (nessun file audio da licenziare).

## Rigenerare i volti / il dataset

Richiede **Node ≥ 18** (usa `fetch` globale, zero dipendenze npm):

```bash
node tools/fetch_faces.mjs          # scarica i mancanti, rigenera i file
node tools/fetch_faces.mjs --force  # riscarica tutto
node tools/fetch_faces.mjs --check  # valida (81 volti, licenze, abiti, frasi)
```

Lo script interroga it.wikipedia (`pageimages`) → Wikimedia Commons
(`imageinfo`, con fallback su Wikidata `P18`), scarica i volti in
`assets/faces/` e rigenera `characters.json`, `js/data.js` e `CREDITS.md`.

Il roster (con genere, abito e frase di caduta di ogni personaggio) è definito
in `tools/fetch_faces.mjs`; ogni record del dataset include `gender`, `outfit`
(`{t,c,a,num?,tie?}`), `fallQuote` e un eventuale `faceRect` per correggere il
ritaglio del volto (frazioni `{x,y,w}`).

### Sostituzioni

Per 3 figure non esisteva una foto a licenza libera utilizzabile su
Commons/Wikidata (immagini caricate solo localmente su it.wiki, in fair use).
Come da specifica sono state sostituite con figure equivalenti e segnalate in
`CREDITS.md`:

- **Fabrizio De André** → **Lucio Dalla** (cantautore)
- **Marco Pantani** → **Pietro Mennea** (atleta)
- **Alberto Tomba** → **Dino Zoff** (atleta)

## Crediti e licenze

- Volti: Wikimedia Commons — fonte, autore e licenza di ciascuno in
  [`CREDITS.md`](CREDITS.md). Le licenze (PD, CC BY, CC BY-SA) sono mantenute dai
  derivati pixelizzati.
- Font: **Press Start 2P** di CodeMan38 — SIL Open Font License 1.1
  (`assets/fonts/OFL.txt`).

Progetto satirico, senza fini di lucro. Nessuno stato persistente, nessuna
autenticazione, nessun tracciamento.
