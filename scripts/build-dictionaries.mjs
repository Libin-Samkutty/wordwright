#!/usr/bin/env node
/**
 * Dictionary generator (T-06).
 *
 * Produces `src/dictionary/data/lists-<n>.ts` for each supported word length.
 *
 *   node scripts/build-dictionaries.mjs
 *
 * This is a DEVELOPMENT tool, run by hand and committed as output. It is the
 * only thing in this repository that touches the network, and it never runs
 * during `npm run build`, in tests, or in the browser — the app itself makes
 * zero requests (NFR-5, ADR-001). Sources are cached in `scripts/.cache/`
 * (gitignored) so re-runs are offline and deterministic.
 *
 * Strategy (ADR-004): two lists per length.
 *   - guesses: everything in ENABLE1 of that length. Permissive, so real words
 *     are rarely rejected.
 *   - answers: the most frequent words, filtered for fairness and taste, so
 *     every solution is deducible.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(HERE, '.cache');
const OUT_DIR = join(ROOT, 'src', 'dictionary', 'data');

const WORD_LENGTHS = [4, 5, 6];

/** Target answer-pool size per length. SPEC FR-30 requires >= 300. */
const ANSWER_TARGET = 700;

const SOURCES = {
  /** ENABLE1 — public domain word list (Alan Beale). Excludes proper nouns. */
  enable: 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  /** ENABLE1 subset judged "popular"; used as a familiarity signal. */
  popular: 'https://raw.githubusercontent.com/dolph/dictionary/master/popular.txt',
  /** Norvig's count_1w — word frequencies from the Google Web Trillion Word Corpus. */
  frequency: 'https://norvig.com/ngrams/count_1w.txt',
};

/**
 * Words barred from the ANSWER list only (FR-31).
 *
 * Answers are shown in celebratory UI and announced by screen readers, so the
 * bar is "would this be unpleasant to be shown". Slurs, vulgarities, and
 * distressing subject matter are excluded. These words remain *guessable*:
 * silently rejecting a word a player typed is a worse experience than
 * accepting it, and the guess list is never displayed back to them.
 */
const ANSWER_BLOCKLIST = new Set(
  `anal anus arse assball balls bang bastard bitch bitches bloody boner boob boobs
   butt clit cock cocks coon crap cum cunt damn dago dick dicks dildo dyke fag fags
   faggot fart feck felch fisting flaps fuck fucked fucker fucks gash gimp goy gyp
   hell heroin homo honky hooker horny incest injun jap jerk jism jizz junkie kike
   kkk knob kraut labia lesbo lust masturbate meth milf mick minge molest naked
   nazi negro nigga nonce nutsack orgasm orgy paki pedo penis penises perv phallus
   piss pissed poon poop porn porno prick prig pube pubes puke pussy queer racist
   randy rape raped rapes rapist rectal rectum retard rimjob scat schlong screw
   scrotum semen sex sexy shag shat shit shits skank slag slave slut smegma sodom
   sperm spic spunk suicide swine testes titties titty tits toilet tramp tranny
   trashy turd twat urine uterus vagina viagra vulva wank wanker whore willy
   womb wop yid peeing thong chick nasty belly sexual suck sucks sucking bikini
   abort abused addict agony ashes assault bleed blood bloods bomb bombs bury
   cancer casket coffin corpse dead death deaths died dies drown dying famine
   fatal fetus funeral gore grave graves grief hanged hangs harmed hearse hostage
   killed killer kills lynch morgue mortal murder noose overdose plague poison
   rabies satan slain slays stroke suffer terror tomb toxic trauma tumor tumour
   victim virus`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase()),
);

/**
 * Words barred from the ANSWER list because they read as proper nouns (FR-31).
 *
 * Every one of these is a legitimate lowercase English word — that is why they
 * survive ENABLE1, which already excludes capitalised proper nouns. An `amazon`
 * is a tall warrior woman, a `yahoo` is a boor, a `warren` is a rabbit burrow,
 * a `wright` is a maker. But a player staring at five green tiles reads them as
 * a river, a website, a surname and a surname, and an answer that feels like a
 * proper noun feels unfair even when the dictionary vindicates it.
 *
 * This is a deliberately CONSERVATIVE list: it removes words whose dominant
 * modern reading is a name, brand or place, and keeps ordinary words that merely
 * happen to also be surnames (BROWN, GREEN, STONE, SMITH, BAKER, MASON, KING,
 * HOPE, ROBIN, CAROL). Those make good puzzles and excluding them would gut the
 * pool. All of these remain valid GUESSES; only the solution pool is filtered.
 */
const READS_AS_NAME = new Set(
  `alan alaska amazon apache yahoo adobe texas boston paris louis roman sierra
   costa hong kent lang carl chad dell jane john ruth tony shaw cole hart meta
   bobby billy donna laura maria nancy jerry kelly kerry perry terry tommy henry
   jones lewis morris murphy nelson parker potter turner warner warren wright
   carter cooper graham jordan martin morgan joseph french german
   dixon fisher hunter walker foster bishop
   beth jill jean dale glen duke pope reed rand newton welsh soviet
   booth villa mason baker miller holder farmer
   johnny oxford danish polish spanish scottish irish arab arabic asian
   euro nato aids xmas`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase()),
);

/**
 * Clipped forms and abbreviations barred from the ANSWER list.
 *
 * ENABLE1 admits these as words, but they are fragments of longer words rather
 * than words a player thinks in ("comp", "para", "temp"). They stay guessable.
 */
const CLIPPED_FORMS = new Set(
  `comp para stat temp spec prev pref calc elec mech admin misc intl repo`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase()),
);

/** Fetch with an on-disk cache so re-runs need no network. */
async function fetchCached(name, url) {
  await mkdir(CACHE, { recursive: true });
  const file = join(CACHE, `${name}.txt`);

  if (existsSync(file)) {
    process.stdout.write(`  ${name}: cached\n`);
    return readFile(file, 'utf8');
  }

  process.stdout.write(`  ${name}: downloading ${url}\n`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${name}: HTTP ${response.status}`);
  }
  const text = await response.text();
  await writeFile(file, text, 'utf8');
  return text;
}

/** Parse a newline-delimited word list into an uppercase Set of pure A-Z words. */
function parseWords(text) {
  const words = new Set();
  for (const line of text.split('\n')) {
    const word = line.trim().toLowerCase();
    if (/^[a-z]+$/.test(word)) words.add(word.toUpperCase());
  }
  return words;
}

/** Parse `word<TAB>count` into a Map of uppercase word -> rank (0 = most common). */
function parseFrequency(text) {
  const ranks = new Map();
  let rank = 0;
  for (const line of text.split('\n')) {
    const [raw] = line.split('\t');
    const word = raw?.trim().toLowerCase();
    if (word && /^[a-z]+$/.test(word)) {
      const upper = word.toUpperCase();
      if (!ranks.has(upper)) ranks.set(upper, rank++);
    }
  }
  return ranks;
}

/**
 * Rejects answers that make for an unfair or tedious puzzle.
 *
 * The big one is the trailing-S rule: if removing a final S leaves another
 * real word, it is almost always a plural or a third-person verb. Those are
 * miserable answers because the S is nearly free information, and the player
 * is left brute-forcing the stem. The original game applies the same rule.
 */
function isFairAnswer(word, allWords) {
  if (ANSWER_BLOCKLIST.has(word)) return false;
  if (READS_AS_NAME.has(word)) return false;
  if (CLIPPED_FORMS.has(word)) return false;

  if (word.endsWith('S') && allWords.has(word.slice(0, -1))) return false;
  // "-ES" plurals such as BOXES (BOX) and DISHES (DISH).
  if (word.endsWith('ES') && allWords.has(word.slice(0, -2))) return false;

  // A word made of one or two distinct letters (e.g. MAMA, EERIE-like extremes)
  // is a guessing game rather than a deduction.
  if (new Set(word).size <= 2) return false;

  return true;
}

async function main() {
  process.stdout.write('Fetching sources…\n');
  const [enableText, popularText, frequencyText] = await Promise.all([
    fetchCached('enable', SOURCES.enable),
    fetchCached('popular', SOURCES.popular),
    fetchCached('frequency', SOURCES.frequency),
  ]);

  const enable = parseWords(enableText);
  const popular = parseWords(popularText);
  const ranks = parseFrequency(frequencyText);

  process.stdout.write(
    `\nSources: enable=${enable.size} popular=${popular.size} frequency=${ranks.size}\n\n`,
  );

  await mkdir(OUT_DIR, { recursive: true });
  const summary = [];

  for (const length of WORD_LENGTHS) {
    // Guess list: every ENABLE1 word of this length (FR-25).
    const guesses = [...enable].filter((w) => w.length === length).sort();

    // Answer candidates: familiar words, ranked by corpus frequency.
    // `popular` keeps out technical/archaic entries that are frequent in web
    // text but unknown to most players; the rank sort then puts the most
    // everyday words first.
    const candidates = guesses
      .filter((word) => popular.has(word) && ranks.has(word))
      .filter((word) => isFairAnswer(word, enable))
      .sort((a, b) => ranks.get(a) - ranks.get(b));

    const answers = candidates.slice(0, ANSWER_TARGET).sort();

    // Invariants asserted here as well as in the test suite (FR-26, FR-27),
    // so a bad generation never reaches the repository.
    const guessSet = new Set(guesses);
    for (const word of answers) {
      if (!guessSet.has(word)) throw new Error(`Answer ${word} missing from guesses`);
    }
    for (const word of [...answers, ...guesses]) {
      if (!/^[A-Z]+$/.test(word) || word.length !== length) {
        throw new Error(`Invalid entry: ${word}`);
      }
    }
    if (answers.length < 300)
      throw new Error(`Only ${answers.length} answers for length ${length}`);
    if (guesses.length < 1500)
      throw new Error(`Only ${guesses.length} guesses for length ${length}`);

    const checksum = createHash('sha256')
      .update(`${answers.join(',')}|${guesses.join(',')}`)
      .digest('hex')
      .slice(0, 12);

    const file = join(OUT_DIR, `lists-${length}.ts`);
    await writeFile(file, renderModule({ length, answers, guesses, checksum }), 'utf8');

    summary.push({ length, answers: answers.length, guesses: guesses.length, checksum });
    process.stdout.write(
      `lists-${length}.ts  answers=${answers.length}  guesses=${guesses.length}  sha=${checksum}\n`,
    );
  }

  process.stdout.write('\nDone. Run `npm run format` to apply Prettier to the output.\n');
  return summary;
}

function renderModule({ length, answers, guesses, checksum }) {
  const format = (words) =>
    words
      .map((w) => `  '${w}',`)
      .reduce((acc, line) => `${acc}\n${line}`, '')
      .trimStart();

  return `// @generated by scripts/build-dictionaries.mjs — do not edit by hand.
// Word length: ${length} · answers: ${answers.length} · guesses: ${guesses.length} · sha256: ${checksum}
//
// Sources (see src/dictionary/data/README.md for provenance and licensing):
//   ENABLE1 public-domain word list, and Google Web Trillion Word Corpus
//   frequencies via Peter Norvig's count_1w.
//
// \`answers\` is a curated, common, fair subset. \`guesses\` is the permissive
// superset accepted as input (ADR-004). Both are uppercase, unique and sorted;
// the invariants are enforced by src/dictionary/__tests__/data.test.ts.

/** Words that may be chosen as the solution (FR-25, FR-30, FR-31). */
export const answers: readonly string[] = [
  ${format(answers)}
];

/** Words accepted as a valid guess. Superset of \`answers\` (FR-26). */
export const guesses: readonly string[] = [
  ${format(guesses)}
];
`;
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  process.exit(1);
});
