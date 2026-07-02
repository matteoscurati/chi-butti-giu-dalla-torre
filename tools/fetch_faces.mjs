#!/usr/bin/env node
// Chi butti giù dalla torre? — face fetcher / dataset generator
//
// Zero npm dependencies (Node >= 18, global fetch).
// Pipeline per personaggio:
//   1) it.wikipedia pageimages  -> nome file immagine
//   2) Commons imageinfo        -> thumb 512px + licenza/autore (extmetadata)
//   3) fallback Wikidata P18     -> file su Commons -> (2)
// Scarica i volti in assets/faces/<id>.<ext> e genera:
//   - characters.json  (dataset canonico, deliverable)
//   - js/data.js       (window.CHARACTERS, caricato dal gioco anche da file://)
//   - CREDITS.md        (fonte + autore + licenza per ogni volto)
//
// Uso:
//   node tools/fetch_faces.mjs           scarica i mancanti e rigenera i file
//   node tools/fetch_faces.mjs --force   riscarica tutto
//   node tools/fetch_faces.mjs --check   valida (61 volti, licenze, allineamento)

import { writeFile, readFile, mkdir, readdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FACES_DIR = join(ROOT, "assets", "faces");
const UA = "ChiButtiGiuDallaTorre/1.0 (satirical browser game; contact: local dev)";
const THUMB_W = 512;

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const CHECK_ONLY = args.has("--check");

// --- Roster ----------------------------------------------------------------
// wiki: titolo it.wikipedia se diverso dal name. cat: categoria (usata dagli sprite).
// gender: "m"/"f" (abito maschile/femminile). outfit: {t: tipo, c: colore, a: accento, num?, tie?}.
// quote: frase biografica urlata durante la caduta. faceRect: override crop {x,y,w} (frazioni).
const ROSTER = [
  { id: "michela-murgia", name: "Michela Murgia", years: "1972–2023", role: "Scrittrice e attivista", cat: "cultura", gender: "f", outfit: { t: "dress", c: "#4a2b52", a: "#c0293f" }, quote: "Chiamate l'accabadora!", fixed: true },

  // Politica
  { id: "benito-mussolini", name: "Benito Mussolini", years: "1883–1945", role: "Capo del fascismo", cat: "politica", gender: "m", outfit: { t: "blackshirt", c: "#1a171e", a: "#3a3632" }, quote: "Me ne fregoooo!" },
  { id: "giacomo-matteotti", name: "Giacomo Matteotti", years: "1885–1924", role: "Deputato socialista", cat: "politica", gender: "m", outfit: { t: "suit", c: "#3a3f52", a: "#c0293f" }, quote: "Il mio discorso resta!" },
  { id: "antonio-gramsci", name: "Antonio Gramsci", years: "1891–1937", role: "Fondatore del PCI", cat: "politica", gender: "m", outfit: { t: "suit", c: "#37312a", a: "#c0293f" }, quote: "Odio gli indifferenti!" },
  { id: "alcide-de-gasperi", name: "Alcide De Gasperi", years: "1881–1954", role: "Padre della Repubblica", cat: "politica", gender: "m", outfit: { t: "suit", c: "#2c3145", a: "#6b7f9e" }, quote: "L'Europa si fa così?!", wiki: "Alcide De Gasperi" },
  { id: "sandro-pertini", name: "Sandro Pertini", years: "1896–1990", role: "Presidente partigiano", cat: "politica", gender: "m", outfit: { t: "suit", c: "#3d3a45", a: "#d8b02a" }, quote: "La pipa! Ho perso la pipa!" },
  { id: "aldo-moro", name: "Aldo Moro", years: "1916–1978", role: "Statista DC", cat: "politica", gender: "m", outfit: { t: "suit", c: "#2f2f38", a: "#6b7f9e" }, quote: "Convergenze... verticali!" },
  { id: "giulio-andreotti", name: "Giulio Andreotti", years: "1919–2013", role: "Sette volte premier", cat: "politica", gender: "m", outfit: { t: "suit", c: "#23283a", a: "#43507a" }, quote: "Il potere logora chi vola!" },
  { id: "enrico-berlinguer", name: "Enrico Berlinguer", years: "1922–1984", role: "Segretario del PCI", cat: "politica", gender: "m", outfit: { t: "suit", c: "#33384a", a: "#c0293f" }, quote: "Austerità pure in volo!" },
  { id: "giorgio-almirante", name: "Giorgio Almirante", years: "1914–1988", role: "Fondatore del MSI", cat: "politica", gender: "m", outfit: { t: "suit", c: "#262233", a: "#3a5a8c" }, quote: "A destra! Tutto a destra!" },
  { id: "nilde-iotti", name: "Nilde Iotti", years: "1920–1999", role: "Presidente della Camera", cat: "politica", gender: "f", outfit: { t: "skirtsuit", c: "#7a2438", a: "#d8b02a" }, quote: "La seduta è tolta!" },
  { id: "marco-pannella", name: "Marco Pannella", years: "1930–2016", role: "Leader radicale", cat: "politica", gender: "m", outfit: { t: "suit", c: "#4a4438", a: "#e0e4ee", tie: false }, quote: "Sciopero della gravità!" },
  { id: "emma-bonino", name: "Emma Bonino", years: "1948–", role: "Radicale, ministra", cat: "politica", gender: "f", outfit: { t: "skirtsuit", c: "#b3243b", a: "#f4e04d" }, quote: "Un referendum sulla torre!" },
  { id: "bettino-craxi", name: "Bettino Craxi", years: "1934–2000", role: "Segretario del PSI", cat: "politica", gender: "m", outfit: { t: "suit", c: "#3a3040", a: "#c0293f" }, quote: "Ad Hammamet si stava meglio!" },
  { id: "silvio-berlusconi", name: "Silvio Berlusconi", years: "1936–2023", role: "Imprenditore e premier", cat: "politica", gender: "m", outfit: { t: "suit", c: "#1e2436", a: "#43507a" }, quote: "Mi consenta di volare!" },
  { id: "umberto-bossi", name: "Umberto Bossi", years: "1941–", role: "Fondatore Lega Nord", cat: "politica", gender: "m", outfit: { t: "suit", c: "#2f4030", a: "#159a4a" }, quote: "La Padania è laggiù!" },
  { id: "romano-prodi", name: "Romano Prodi", years: "1939–", role: "Premier, presidente CE", cat: "politica", gender: "m", outfit: { t: "suit", c: "#38404a", a: "#7a9e6b" }, quote: "La mucca era in corridoio!" },
  { id: "matteo-renzi", name: "Matteo Renzi", years: "1975–", role: "Premier", cat: "politica", gender: "m", outfit: { t: "suit", c: "#2b3a55", a: "#eef0f6", tie: false }, quote: "Stai serenooooo!" },
  { id: "giuseppe-conte", name: "Giuseppe Conte", years: "1964–", role: "Premier", cat: "politica", gender: "m", outfit: { t: "suit", c: "#2c3350", a: "#6b7f9e" }, quote: "Lo dico col cuore: aiuto!" },
  { id: "matteo-salvini", name: "Matteo Salvini", years: "1973–", role: "Leader della Lega", cat: "politica", gender: "m", outfit: { t: "sweater", c: "#2b6f4a", a: "#eef0f6" }, quote: "Il ponte! Datemi il ponte!" },
  { id: "giorgia-meloni", name: "Giorgia Meloni", years: "1977–", role: "Premier", cat: "politica", gender: "f", outfit: { t: "skirtsuit", c: "#ececf2", a: "#1e2436" }, quote: "Sono Giorgia, precipito!" },

  // Magistratura
  { id: "giovanni-falcone", name: "Giovanni Falcone", years: "1939–1992", role: "Magistrato antimafia", cat: "politica", gender: "m", outfit: { t: "suit", c: "#3a4152", a: "#7a4b2a" }, quote: "Seguite i soldi, non me!" },
  { id: "paolo-borsellino", name: "Paolo Borsellino", years: "1940–1992", role: "Magistrato antimafia", cat: "politica", gender: "m", outfit: { t: "suit", c: "#4a4452", a: "#3a5a8c" }, quote: "Senza paura, anche ora!" },

  // Cultura / scienza
  { id: "pier-paolo-pasolini", name: "Pier Paolo Pasolini", years: "1922–1975", role: "Poeta e regista", cat: "cultura", gender: "m", outfit: { t: "suit", c: "#2a2d3a", a: "#eef0f6", tie: false }, quote: "Io so chi mi ha spinto!" },
  { id: "italo-calvino", name: "Italo Calvino", years: "1923–1985", role: "Scrittore", cat: "cultura", gender: "m", outfit: { t: "suit", c: "#4a4a55", a: "#8a6f3a" }, quote: "Il barone si arrampicava!" },
  { id: "umberto-eco", name: "Umberto Eco", years: "1932–2016", role: "Scrittore e semiologo", cat: "cultura", gender: "m", outfit: { t: "suit", c: "#4a3a2a", a: "#c8871f" }, quote: "Il nome della rooosa!" },
  { id: "primo-levi", name: "Primo Levi", years: "1919–1987", role: "Scrittore", cat: "cultura", gender: "m", outfit: { t: "suit", c: "#45505a", a: "#8a9aaa" }, quote: "La tregua è finita!" },
  { id: "elsa-morante", name: "Elsa Morante", years: "1912–1985", role: "Scrittrice", cat: "cultura", gender: "f", outfit: { t: "dress", c: "#5a2a3a", a: "#d8b02a" }, quote: "La Storia finisce così!" },
  { id: "oriana-fallaci", name: "Oriana Fallaci", years: "1929–2006", role: "Giornalista", cat: "cultura", gender: "f", outfit: { t: "dress", c: "#23202b", a: "#6b7f9e" }, quote: "La rabbia e l'orgoglio!" },
  { id: "indro-montanelli", name: "Indro Montanelli", years: "1909–2001", role: "Giornalista", cat: "cultura", gender: "m", outfit: { t: "coat", c: "#b9a074", a: "#4a3a2a" }, quote: "Controcorrente anche ora!" },
  { id: "dario-fo", name: "Dario Fo", years: "1926–2016", role: "Drammaturgo, Nobel", cat: "cultura", gender: "m", outfit: { t: "suit", c: "#6b4fb3", a: "#ffd23f", tie: false }, quote: "Che mistero buffo!" },
  { id: "alda-merini", name: "Alda Merini", years: "1931–2009", role: "Poetessa", cat: "cultura", gender: "f", outfit: { t: "dress", c: "#8a5a9e", a: "#d8b02a" }, quote: "Anche i poeti cadono!" },
  { id: "andrea-camilleri", name: "Andrea Camilleri", years: "1925–2019", role: "Scrittore", cat: "cultura", gender: "m", outfit: { t: "blackshirt", c: "#3a3632", a: "#5a5652" }, quote: "Montalbano sono... in volo!" },
  { id: "gianni-rodari", name: "Gianni Rodari", years: "1920–1980", role: "Scrittore per ragazzi", cat: "cultura", gender: "m", outfit: { t: "sweater", c: "#3f6f5a", a: "#ffd23f" }, quote: "Favola al precipizio!" },
  { id: "rita-levi-montalcini", name: "Rita Levi-Montalcini", years: "1909–2012", role: "Nobel per la medicina", cat: "cultura", gender: "f", outfit: { t: "gown", c: "#2b3050", a: "#d8d2e0" }, quote: "Il Nobel resta lassù!" },
  { id: "margherita-hack", name: "Margherita Hack", years: "1922–2013", role: "Astrofisica", cat: "cultura", gender: "f", outfit: { t: "sweater", c: "#556b7a", a: "#d0d8e0" }, quote: "Vengo giù come un meteorite!" },
  { id: "piero-angela", name: "Piero Angela", years: "1928–2022", role: "Divulgatore", cat: "cultura", gender: "m", outfit: { t: "suit", c: "#2c3a55", a: "#8a9aaa" }, quote: "La gravità funziona! Quark!" },
  { id: "samantha-cristoforetti", name: "Samantha Cristoforetti", years: "1977–", role: "Astronauta", cat: "cultura", gender: "f", outfit: { t: "astronaut", c: "#f4f4f8", a: "#e8863a" }, quote: "Rientro non programmato!" },

  // Spettacolo / musica / TV
  { id: "toto", name: "Totò", years: "1898–1967", role: "Attore comico", cat: "spettacolo", gender: "m", outfit: { t: "tux", c: "#16141c", a: "#eef0f6" }, quote: "Signori si nasce, si cade!", wiki: "Totò" },
  { id: "anna-magnani", name: "Anna Magnani", years: "1908–1973", role: "Attrice", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#201c26", a: "#6a6474" }, quote: "Aò, nun me spingeee!" },
  { id: "alberto-sordi", name: "Alberto Sordi", years: "1920–2003", role: "Attore", cat: "spettacolo", gender: "m", outfit: { t: "suit", c: "#3a3345", a: "#c0293f" }, quote: "Maccarone, m'hai spinto!" },
  { id: "sophia-loren", name: "Sophia Loren", years: "1934–", role: "Attrice", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#c0293f", a: "#ffd23f" }, quote: "Ieri, oggi... e giù!" },
  { id: "marcello-mastroianni", name: "Marcello Mastroianni", years: "1924–1996", role: "Attore", cat: "spettacolo", gender: "m", outfit: { t: "tux", c: "#1c1f2a", a: "#eef0f6" }, quote: "La dolce caduta!" },
  { id: "federico-fellini", name: "Federico Fellini", years: "1920–1993", role: "Regista", cat: "spettacolo", gender: "m", outfit: { t: "coat", c: "#23202b", a: "#c0293f" }, quote: "Amarcord il terreno!" },
  { id: "monica-vitti", name: "Monica Vitti", years: "1931–2022", role: "Attrice", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#d8cfc0", a: "#6a6474" }, quote: "L'avventura finisce qui!" },
  { id: "massimo-troisi", name: "Massimo Troisi", years: "1953–1994", role: "Attore e regista", cat: "spettacolo", gender: "m", outfit: { t: "suit", c: "#4a3a2f", a: "#d8cfc0", tie: false }, quote: "Ricomincio da zero metri!" },
  { id: "roberto-benigni", name: "Roberto Benigni", years: "1952–", role: "Attore e regista", cat: "spettacolo", gender: "m", outfit: { t: "suit", c: "#45505a", a: "#c0293f" }, quote: "La vita è bella lo stesso!" },
  { id: "raffaella-carra", name: "Raffaella Carrà", years: "1943–2021", role: "Showgirl", cat: "spettacolo", gender: "f", outfit: { t: "pantsuit", c: "#f2ecf4", a: "#ffd23f" }, quote: "Tuca tuca col terreno!" },
  { id: "mina", name: "Mina", years: "1940–", role: "Cantante", cat: "spettacolo", gender: "f", outfit: { t: "gown", c: "#d8b02a", a: "#201c26" }, quote: "Ancora, ancora, ancora!", wiki: "Mina (cantante)" },
  { id: "adriano-celentano", name: "Adriano Celentano", years: "1938–", role: "Cantante", cat: "spettacolo", gender: "m", outfit: { t: "suit", c: "#23283a", a: "#eef0f6", tie: false }, quote: "24mila baci al suolo!" },
  { id: "mike-bongiorno", name: "Mike Bongiorno", years: "1924–2009", role: "Presentatore", cat: "spettacolo", gender: "m", outfit: { t: "suit", c: "#33384a", a: "#d8b02a" }, quote: "Allegriaaaa!" },
  { id: "lucio-dalla", name: "Lucio Dalla", years: "1943–2012", role: "Cantautore", cat: "spettacolo", gender: "m", outfit: { t: "sweater", c: "#7a3fb3", a: "#ffd23f" }, quote: "Attenti al suolooo!", substituted: "Sostituisce Fabrizio De André (nessuna foto a licenza libera su Commons/Wikidata)." },
  { id: "luciano-pavarotti", name: "Luciano Pavarotti", years: "1935–2007", role: "Tenore", cat: "spettacolo", gender: "m", outfit: { t: "tux", c: "#16141c", a: "#f4f4f8" }, quote: "Vinceròoo... forse no!" },

  // Sport
  { id: "gino-bartali", name: "Gino Bartali", years: "1914–2000", role: "Ciclista", cat: "sport", gender: "m", outfit: { t: "cycling", c: "#6f7a30", a: "#d8b02a" }, quote: "L'è tutto da rifare!" },
  { id: "fausto-coppi", name: "Fausto Coppi", years: "1919–1960", role: "Ciclista", cat: "sport", gender: "m", outfit: { t: "cycling", c: "#9fd6d2", a: "#eef0f6" }, quote: "Un airone senza ali!" },
  { id: "pietro-mennea", name: "Pietro Mennea", years: "1952–2013", role: "Velocista", cat: "sport", gender: "m", outfit: { t: "running", c: "#2b6fd6", a: "#eef0f6" }, quote: "Più veloce del record!", substituted: "Sostituisce Marco Pantani (nessuna foto a licenza libera su Commons/Wikidata)." },
  { id: "dino-zoff", name: "Dino Zoff", years: "1942–", role: "Portiere campione del mondo", cat: "sport", gender: "m", outfit: { t: "keeper", c: "#3a3f45", a: "#d8b02a" }, quote: "Stavolta non la paro!", substituted: "Sostituisce Alberto Tomba (nessuna foto a licenza libera su Commons/Wikidata)." },
  { id: "roberto-baggio", name: "Roberto Baggio", years: "1967–", role: "Calciatore", cat: "sport", gender: "m", outfit: { t: "football", c: "#2b6fd6", a: "#eef0f6", num: "10" }, quote: "Alto! Come a Pasadena!" },
  { id: "valentino-rossi", name: "Valentino Rossi", years: "1979–", role: "Motociclista", cat: "sport", gender: "m", outfit: { t: "moto", c: "#ffd23f", a: "#2b8cff", num: "46" }, quote: "Questa non la piego!" },
  { id: "federica-pellegrini", name: "Federica Pellegrini", years: "1988–", role: "Nuotatrice", cat: "sport", gender: "f", outfit: { t: "swim", c: "#1e3a6b", a: "#eef0f6" }, quote: "Il tuffo c'è, l'acqua no!" },
  { id: "jannik-sinner", name: "Jannik Sinner", years: "2001–", role: "Tennista", cat: "sport", gender: "m", outfit: { t: "tennis", c: "#e8863a", a: "#eef0f6" }, quote: "Game, set... schianto!" },

  // Nuove figure femminili
  { id: "tina-anselmi", name: "Tina Anselmi", years: "1927–2016", role: "Prima donna ministra", cat: "politica", gender: "f", outfit: { t: "skirtsuit", c: "#3f6f5a", a: "#d8d2e0" }, quote: "Ho fondato il SSN, servirà!" },
  { id: "liliana-segre", name: "Liliana Segre", years: "1930–", role: "Senatrice a vita", cat: "politica", gender: "f", outfit: { t: "coat", c: "#2b3050", a: "#d8d2e0" }, quote: "Mai indifferenti!" },
  { id: "laura-boldrini", name: "Laura Boldrini", years: "1961–", role: "Presidente della Camera", cat: "politica", gender: "f", outfit: { t: "skirtsuit", c: "#b3243b", a: "#ececf2" }, quote: "Si dice presidentA!" },
  { id: "elly-schlein", name: "Elly Schlein", years: "1985–", role: "Segretaria del PD", cat: "politica", gender: "f", outfit: { t: "pantsuit", c: "#37414e", a: "#7a3fb3" }, quote: "Non mi avete vista cadere!" },
  { id: "grazia-deledda", name: "Grazia Deledda", years: "1871–1936", role: "Nobel per la letteratura", cat: "cultura", gender: "f", outfit: { t: "gown", c: "#2a2430", a: "#6a6474" }, quote: "Canne al vento, io pure!" },
  { id: "natalia-ginzburg", name: "Natalia Ginzburg", years: "1916–1991", role: "Scrittrice", cat: "cultura", gender: "f", outfit: { t: "dress", c: "#4a3a3f", a: "#8a6f3a" }, quote: "Lessico famigliare: AIUTO!" },
  { id: "dacia-maraini", name: "Dacia Maraini", years: "1936–", role: "Scrittrice", cat: "cultura", gender: "f", outfit: { t: "dress", c: "#3a5a8c", a: "#d8d2e0" }, quote: "Che lunga vita, che volo!" },
  { id: "franca-rame", name: "Franca Rame", years: "1929–2013", role: "Attrice e attivista", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#c0293f", a: "#ffd23f" }, quote: "Coppia aperta, vuoto sotto!" },
  { id: "franca-valeri", name: "Franca Valeri", years: "1920–2020", role: "Attrice comica", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#2a2430", a: "#d8d2e0" }, quote: "La sora Cecioni non vola!" },
  { id: "giulietta-masina", name: "Giulietta Masina", years: "1921–1994", role: "Attrice", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#7a9e6b", a: "#f4e04d" }, quote: "La strada finisce qui!" },
  { id: "gina-lollobrigida", name: "Gina Lollobrigida", years: "1927–2023", role: "Attrice", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#b3245a", a: "#ffd23f" }, quote: "La Bersagliera plana!" },
  { id: "claudia-cardinale", name: "Claudia Cardinale", years: "1938–2025", role: "Attrice", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#c8871f", a: "#201c26" }, quote: "C'era una volta il suolo!" },
  { id: "ornella-vanoni", name: "Ornella Vanoni", years: "1934–2025", role: "Cantante", cat: "spettacolo", gender: "f", outfit: { t: "gown", c: "#556b7a", a: "#d8d2e0" }, quote: "Senza fine... anzi no!" },
  { id: "patty-pravo", name: "Patty Pravo", years: "1948–", role: "Cantante", cat: "spettacolo", gender: "f", outfit: { t: "dress", c: "#ececf2", a: "#6b4fb3" }, quote: "La bambola si rompe!" },
  { id: "laura-pausini", name: "Laura Pausini", years: "1974–", role: "Cantante", cat: "spettacolo", gender: "f", outfit: { t: "pantsuit", c: "#2b3a55", a: "#ffd23f" }, quote: "La solitudine del volo!" },
  { id: "milena-gabanelli", name: "Milena Gabanelli", years: "1954–", role: "Giornalista", cat: "cultura", gender: "f", outfit: { t: "pantsuit", c: "#4a4a55", a: "#ececf2" }, quote: "Report: torre non a norma!" },
  { id: "lilli-gruber", name: "Lilli Gruber", years: "1957–", role: "Giornalista", cat: "cultura", gender: "f", outfit: { t: "skirtsuit", c: "#c0293f", a: "#201c26" }, quote: "Otto e mezzo di caduta!" },
  { id: "fabiola-gianotti", name: "Fabiola Gianotti", years: "1960–", role: "Direttrice del CERN", cat: "cultura", gender: "f", outfit: { t: "pantsuit", c: "#33384a", a: "#8fb3c9" }, quote: "Colpa del bosone di Higgs!" },
  { id: "bebe-vio", name: "Bebe Vio", years: "1997–", role: "Schermitrice paralimpica", cat: "sport", gender: "f", outfit: { t: "fencing", c: "#f4f4f8", a: "#c9ced8" }, quote: "Touché, stoccata finale!", wiki: "Bebe Vio" },
  { id: "valentina-vezzali", name: "Valentina Vezzali", years: "1974–", role: "Schermitrice", cat: "sport", gender: "f", outfit: { t: "fencing", c: "#f4f4f8", a: "#d8b02a" }, quote: "Sei ori e un tonfo!" },
];

// --- API helpers -----------------------------------------------------------
const IT_API = "https://it.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WD_API = "https://www.wikidata.org/w/api.php";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(base, params) {
  // niente origin=*: lato server attiva limiti anonimi più severi (429).
  const url = base + "?" + new URLSearchParams({ ...params, format: "json" });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
      if (res.status === 429) throw new Error("HTTP 429");
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      const is429 = /429/.test(err.message);
      await sleep(is429 ? 3000 * (attempt + 1) : 800 * (attempt + 1));
    }
  }
}

function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").replace(/&amp;/g, "&").trim();
}

async function pageImageFile(title) {
  const data = await apiGet(IT_API, {
    action: "query", titles: title, prop: "pageimages",
    piprop: "name", pilicense: "any", redirects: "1",
  });
  const pages = data?.query?.pages || {};
  for (const p of Object.values(pages)) {
    if (p.pageimage) return p.pageimage;
  }
  return null;
}

async function wikidataP18(title) {
  // it.wiki title -> wikidata entity -> P18 filename
  const ents = await apiGet(WD_API, {
    action: "wbgetentities", sites: "itwiki", titles: title, props: "claims",
  });
  const entities = ents?.entities || {};
  for (const ent of Object.values(entities)) {
    const p18 = ent?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (p18) return p18;
  }
  return null;
}

async function commonsInfo(fileName) {
  const title = "File:" + fileName;
  const data = await apiGet(COMMONS_API, {
    action: "query", titles: title, prop: "imageinfo",
    iiprop: "url|extmetadata|mime", iiurlwidth: String(THUMB_W), redirects: "1",
  });
  const pages = data?.query?.pages || {};
  for (const p of Object.values(pages)) {
    if (p.missing !== undefined) return null;
    const ii = p.imageinfo?.[0];
    if (!ii) return null;
    const em = ii.extmetadata || {};
    return {
      thumburl: ii.thumburl || ii.url,
      descriptionurl: ii.descriptionurl,
      mime: ii.mime || "",
      license: stripHtml(em.LicenseShortName?.value) || "Sconosciuta",
      licenseUrl: em.LicenseUrl?.value || "",
      artist: stripHtml(em.Artist?.value) || "Sconosciuto",
    };
  }
  return null;
}

async function resolveImage(char) {
  const title = char.wiki || char.name;
  let file = await pageImageFile(title);
  if (file) {
    const info = await commonsInfo(file);
    if (info) return info;
  }
  // fallback Wikidata P18
  const p18 = await wikidataP18(title);
  if (p18) {
    const info = await commonsInfo(p18);
    if (info) return info;
  }
  return null;
}

// --- Batch resolution (drastically riduce le chiamate → niente 429) --------
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// MediaWiki normalizza i titoli e poi applica i redirect: ricostruisco la catena.
function buildChain(query) {
  const norm = {}, redir = {};
  for (const n of query?.normalized || []) norm[n.from] = n.to;
  for (const r of query?.redirects || []) redir[r.from] = r.to;
  const pages = {};
  for (const p of Object.values(query?.pages || {})) pages[p.title] = p;
  return (title) => {
    const t1 = norm[title] || title;
    const t2 = redir[t1] || t1;
    return pages[t2] || pages[t1] || pages[title] || null;
  };
}

// title -> pageimage filename, per tutti i personaggi passati
async function pageImagesBatch(chars) {
  const result = {};
  for (const group of chunk(chars, 25)) {
    const titles = group.map((c) => c.wiki || c.name).join("|");
    const data = await apiGet(IT_API, {
      action: "query", titles, prop: "pageimages",
      piprop: "name", pilicense: "any", pilimit: "50", redirects: "1",
    });
    const lookup = buildChain(data?.query);
    for (const c of group) {
      const page = lookup(c.wiki || c.name);
      if (page?.pageimage) result[c.id] = page.pageimage;
    }
    await sleep(1500);
  }
  return result;
}

// pageimage filename -> info (url thumb + licenza), per un set di file
async function commonsInfoBatch(fileNames) {
  const result = {};
  const unique = [...new Set(fileNames)];
  for (const group of chunk(unique, 25)) {
    const titles = group.map((f) => "File:" + f).join("|");
    const data = await apiGet(COMMONS_API, {
      action: "query", titles, prop: "imageinfo",
      iiprop: "url|extmetadata|mime", iiurlwidth: String(THUMB_W), redirects: "1",
    });
    const lookup = buildChain(data?.query);
    for (const f of group) {
      const page = lookup("File:" + f);
      const ii = page?.imageinfo?.[0];
      if (!ii) continue;
      const em = ii.extmetadata || {};
      result[f] = {
        thumburl: ii.thumburl || ii.url,
        descriptionurl: ii.descriptionurl,
        mime: ii.mime || "",
        license: stripHtml(em.LicenseShortName?.value) || "Sconosciuta",
        licenseUrl: em.LicenseUrl?.value || "",
        artist: stripHtml(em.Artist?.value) || "Sconosciuto",
      };
    }
    await sleep(1500);
  }
  return result;
}

function extFromUrl(url, mime) {
  const m = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(url.split("/").pop() || "");
  let ext = (m ? m[1] : "").toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  if (!["jpg", "png", "gif", "webp"].includes(ext)) {
    if (mime.includes("png")) ext = "png";
    else if (mime.includes("gif")) ext = "gif";
    else ext = "jpg";
  }
  return ext;
}

async function download(url, dest) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429) throw new Error("download HTTP 429");
      if (!res.ok) throw new Error("download HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      return buf.length;
    } catch (err) {
      if (attempt === 2) throw err;
      const is429 = /429/.test(err.message);
      await sleep(is429 ? 3000 * (attempt + 1) : 800 * (attempt + 1));
    }
  }
}

async function findExistingFace(id) {
  for (const ext of ["jpg", "png", "gif", "webp"]) {
    const p = join(FACES_DIR, id + "." + ext);
    if (existsSync(p)) return "assets/faces/" + id + "." + ext;
  }
  return null;
}

// --- Generators ------------------------------------------------------------
async function writeOutputs(records) {
  // characters.json (schema da spec + author/cat + genere/abito/frase)
  const json = records.map((r) => ({
    id: r.id, name: r.name, years: r.years, role: r.role,
    faceImage: r.faceImage, sourceUrl: r.sourceUrl, license: r.license,
    author: r.author, category: r.cat, fixed: !!r.fixed,
    gender: r.gender || "m", outfit: r.outfit || null,
    fallQuote: r.quote || null, faceRect: r.faceRect || null,
  }));
  await writeFile(join(ROOT, "characters.json"), JSON.stringify(json, null, 2) + "\n");

  // js/data.js — caricato via <script> (funziona da file://)
  const dataJs =
    "// GENERATO da tools/fetch_faces.mjs — non modificare a mano.\n" +
    "window.CHARACTERS = " + JSON.stringify(json, null, 2) + ";\n";
  await writeFile(join(ROOT, "js", "data.js"), dataJs);

  // CREDITS.md
  let md = "# Crediti immagini\n\n";
  md += "Progetto satirico **Chi butti giù dalla torre?**. Le foto dei volti provengono ";
  md += "prevalentemente da Wikimedia Commons. Ogni immagine è stata **ritagliata, ridimensionata ";
  md += "e pixelizzata** per l'innesto sugli sprite: i derivati mantengono la licenza dell'originale.\n\n";
  md += "Per le licenze copyleft (CC BY / CC BY-SA) l'attribuzione va all'autore indicato; ";
  md += "per il pubblico dominio (PD) non è richiesta attribuzione ma la fonte è tracciata comunque.\n\n";
  md += "| Personaggio | File | Fonte | Autore | Licenza |\n";
  md += "|---|---|---|---|---|\n";
  for (const r of records) {
    const src = r.sourceUrl ? `[Commons](${r.sourceUrl})` : "—";
    md += `| ${r.name} | \`${r.faceImage || "—"}\` | ${src} | ${r.author || "—"} | ${r.license || "—"} |\n`;
  }
  const subs = records.filter((r) => r.substituted);
  if (subs.length) {
    md += "\n## Sostituzioni\n\n";
    for (const r of subs) md += `- ${r.name}: ${r.substituted}\n`;
  }
  md += "\n## Font\n\n";
  md += "- **Press Start 2P** — CodeMan38. SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).\n";
  md += "  Fonte: https://fonts.google.com/specimen/Press+Start+2P\n";
  await writeFile(join(ROOT, "CREDITS.md"), md);
}

// --- Check mode ------------------------------------------------------------
async function runCheck() {
  const problems = [];
  let json;
  try {
    json = JSON.parse(await readFile(join(ROOT, "characters.json"), "utf8"));
  } catch {
    console.error("✗ characters.json mancante o non valido. Esegui prima il fetch.");
    process.exit(1);
  }
  const EXPECTED = ROSTER.length;
  if (json.length !== EXPECTED) problems.push(`characters.json ha ${json.length} righe (attese ${EXPECTED}).`);
  const files = new Set(await readdir(FACES_DIR).catch(() => []));
  for (const c of json) {
    if (!c.faceImage) { problems.push(`${c.name}: faceImage mancante.`); continue; }
    const fname = c.faceImage.split("/").pop();
    if (!files.has(fname)) problems.push(`${c.name}: file ${c.faceImage} assente.`);
    if (!c.license) problems.push(`${c.name}: licenza mancante.`);
    if (!c.sourceUrl) problems.push(`${c.name}: sourceUrl mancante.`);
    if (!c.gender) problems.push(`${c.name}: gender mancante.`);
    if (!c.outfit) problems.push(`${c.name}: outfit mancante.`);
    if (!c.fallQuote) problems.push(`${c.name}: fallQuote mancante.`);
  }
  const credits = await readFile(join(ROOT, "CREDITS.md"), "utf8").catch(() => "");
  const rows = (credits.match(/\n\| /g) || []).length;
  if (rows < EXPECTED) problems.push(`CREDITS.md ha ${rows} righe tabella (attese >= ${EXPECTED}).`);
  const fixed = json.filter((c) => c.fixed);
  if (fixed.length !== 1 || fixed[0].id !== "michela-murgia")
    problems.push("Il personaggio fisso deve essere solo Michela Murgia.");
  const females = json.filter((c) => c.gender === "f").length;

  if (problems.length) {
    console.error("✗ CHECK FALLITO:\n" + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }
  console.log(`✓ CHECK OK: ${EXPECTED} personaggi (${females} donne), volti/licenze/abiti/frasi tracciati.`);
}

// --- Main ------------------------------------------------------------------
async function main() {
  if (CHECK_ONLY) return runCheck();
  await mkdir(FACES_DIR, { recursive: true });

  // metadati già noti dal characters.json precedente (per evitare API inutili)
  let prev = {};
  try {
    const prevJson = JSON.parse(await readFile(join(ROOT, "characters.json"), "utf8"));
    for (const c of prevJson) prev[c.id] = c;
  } catch { /* prima esecuzione */ }

  // records inizializzati con TUTTI e 61 (merge metadati in cache).
  const records = ROSTER.map((char) => {
    const pm = prev[char.id] || {};
    return {
      ...char,
      faceImage: pm.faceImage || null,
      sourceUrl: pm.sourceUrl || null,
      license: pm.license || null,
      author: pm.author || null,
    };
  });
  // completa faceImage dai file già su disco
  for (const rec of records) {
    if (!rec.faceImage || FORCE) {
      const existing = FORCE ? null : await findExistingFace(rec.id);
      if (existing) rec.faceImage = existing;
    }
  }

  // Chi ha bisogno di metadati (licenza/fonte) o del file.
  const needMeta = records.filter((r) => FORCE || !r.license || !r.sourceUrl || !r.faceImage);
  console.log(`Da risolvere: ${needMeta.length}/61 (batch).`);

  // 1) Batch: title -> pageimage filename
  const fileById = await pageImagesBatch(needMeta);
  // 2) Batch: filename -> info (licenza + thumburl)
  const infoByFile = await commonsInfoBatch(Object.values(fileById));

  // 3) Assegna metadati; fallback Wikidata P18 per gli irrisolti
  const toDownload = [];
  for (const rec of needMeta) {
    let info = null;
    const file = fileById[rec.id];
    if (file && infoByFile[file]) info = infoByFile[file];
    if (!info) {
      try {
        const p18 = await wikidataP18(rec.wiki || rec.name);
        if (p18) info = await commonsInfo(p18);
        await sleep(1200);
      } catch (e) { /* ignora, resta irrisolto */ }
    }
    if (!info) { console.warn(`  ⚠ ${rec.name}: nessuna immagine (candidato sostituzione).`); continue; }
    rec.sourceUrl = info.descriptionurl;
    rec.license = info.license;
    rec.author = info.artist;
    rec._thumburl = info.thumburl;
    rec._mime = info.mime;
    if (!rec.faceImage || FORCE) toDownload.push(rec);
  }
  await writeOutputs(records); // salva i metadati prima dei download

  // 4) Download dei soli file mancanti (throttle + backoff)
  let done = 0;
  for (const rec of toDownload) {
    try {
      const ext = extFromUrl(rec._thumburl, rec._mime);
      const dest = join(FACES_DIR, rec.id + "." + ext);
      const bytes = await download(rec._thumburl, dest);
      rec.faceImage = "assets/faces/" + rec.id + "." + ext;
      done++;
      console.log(`  ✓ ${rec.name}  (${(bytes / 1024).toFixed(0)} KB, ${rec.license})`);
      await writeOutputs(records);
    } catch (err) {
      console.warn(`  ⚠ ${rec.name}: download fallito (${err.message}).`);
    }
    await sleep(1500);
  }
  for (const rec of records) delete rec._thumburl, delete rec._mime;

  await writeOutputs(records);
  const failed = records.filter((r) => !r.faceImage || !r.license).map((r) => r.name);
  console.log(`\nScaricati ora: ${done}. Scritti: characters.json, js/data.js, CREDITS.md`);
  if (failed.length) {
    console.log(`\n⚠ ${failed.length} senza immagine (candidati a sostituzione dalla panchina):`);
    for (const f of failed) console.log("   - " + f);
  } else {
    console.log("\n✓ Tutti i 61 volti recuperati.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
