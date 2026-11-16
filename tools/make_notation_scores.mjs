// Writes the small MusicXML scores in test/scores/notation/, one per notation the importer handles beyond the Python
// importer (test/notation.test.mjs reads them). They are made for the tests (CC0): run this to remake them.
import { writeFileSync, mkdirSync } from 'node:fs';

const dir = new URL('../test/scores/notation/', import.meta.url);
mkdirSync(dir, { recursive: true });
const head = (title, parts) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${title}: written for test/notation.test.mjs by tools/make_notation_scores.mjs (CC0). -->
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list>
${parts.map((p) => `    <score-part id="${p.id}"><part-name>${p.name}</part-name>${(p.instruments ?? [{ id: p.id + '-I1', name: p.name }]).map((i) => `<score-instrument id="${i.id}"><instrument-name>${i.name}</instrument-name>${i.sound ? `<instrument-sound>${i.sound}</instrument-sound>` : ''}</score-instrument>`).join('')}${(p.instruments ?? []).filter((i) => i.unpitched).map((i) => `<midi-instrument id="${i.id}"><midi-channel>10</midi-channel><midi-unpitched>${i.unpitched}</midi-unpitched></midi-instrument>`).join('')}</score-part>`).join('\n')}
  </part-list>
`;
const attrs = (fifths = 0) => `<attributes><divisions>4</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;
const note = (step, oct, dur, extra = '', { alter = 0, chord = false, before = '', notations = '' } = {}) =>
  `<note>${chord ? '<chord/>' : ''}${before}<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${oct}</octave></pitch><duration>${dur}</duration><voice>1</voice>${extra}${notations ? `<notations>${notations}</notations>` : ''}</note>`;
const words = (t) => `<direction><direction-type><words>${t}</words></direction-type></direction>`;
const tempo = '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type></direction>';
const file = (name, title, parts, bodies) => writeFileSync(new URL(name, dir), head(title, parts) + parts.map((p, i) => `  <part id="${p.id}">\n${bodies[i].map((m, k) => `    <measure number="${k + 1}">${k === 0 ? attrs(p.fifths) : ''}${m}</measure>`).join('\n')}\n  </part>\n`).join('') + '</score-partwise>\n');

// several instruments on one percussion staff, told apart by each note's <instrument>
const unp = (step, oct, dur, inst) => `<note><unpitched><display-step>${step}</display-step><display-octave>${oct}</display-octave></unpitched><duration>${dur}</duration><instrument id="${inst}"/><voice>1</voice></note>`;
file('percussion.musicxml', 'Shared percussion staff', [{ id: 'P1', name: 'Percussion', instruments: [
  { id: 'P1-I1', name: 'Snare Drum', unpitched: 39 }, { id: 'P1-I2', name: 'Bass Drum', unpitched: 36 }, { id: 'P1-I3', name: 'Crash Cymbal', unpitched: 50 }, { id: 'P1-I4', name: 'Instrument 12', unpitched: 82 },
] }], [[tempo + unp('F', 4, 4, 'P1-I2') + unp('C', 5, 4, 'P1-I1') + unp('G', 5, 4, 'P1-I3') + unp('E', 5, 4, 'P1-I4')]]);

// a natural harmonic, and an artificial one (a stopped A4 touched a fourth above, sounding A6)
const harm = (k) => `<technical><harmonic><${k}/></harmonic></technical>`;
file('harmonics.musicxml', 'Harmonics', [{ id: 'P1', name: 'Violin' }], [[tempo + note('E', 5, 8, '', { notations: `<technical><harmonic><natural/></harmonic></technical>` })
  + note('A', 4, 8, '', { notations: `<technical><harmonic><artificial/><base-pitch/></harmonic></technical>` }) + note('D', 5, 8, '<notehead>diamond</notehead>', { chord: true, notations: `<technical><harmonic><artificial/><touching-pitch/></harmonic></technical>` })]]);

// glissandi: a harp over the white keys, a violin's chromatic slide
file('glissando.musicxml', 'Glissandi', [{ id: 'P1', name: 'Harp' }, { id: 'P2', name: 'Violin' }], [
  [tempo + note('C', 4, 8, '', { notations: '<glissando type="start" number="1"/>' }) + note('C', 5, 8, '', { notations: '<glissando type="stop" number="1"/>' })],
  [note('A', 4, 4, '', { notations: '<slide type="start" number="1"/>' }) + note('E', 5, 4, '', { notations: '<slide type="stop" number="1"/>' }) + note('E', 5, 8)],
]);

// ornaments in G major: a mordent, an inverted mordent, a turn, and an arpeggiated chord
const orn = (k) => `<ornaments><${k}/></ornaments>`;
file('ornaments.musicxml', 'Ornaments and arpeggio marks', [{ id: 'P1', name: 'Flute', fifths: 1 }, { id: 'P2', name: 'Harp' }], [
  [tempo + note('B', 4, 4, '', { notations: orn('mordent') }) + note('G', 4, 4, '', { notations: orn('inverted-mordent') }) + note('E', 5, 8, '', { notations: orn('turn') })],
  [note('C', 4, 16, '', { notations: '<arpeggiate/>' }) + note('E', 4, 16, '', { chord: true, notations: '<arpeggiate/>' }) + note('G', 4, 16, '', { chord: true, notations: '<arpeggiate/>' }) + note('C', 5, 16, '', { chord: true, notations: '<arpeggiate/>' })],
]);

// two flutes on one staff: a chord (split), "a 2" (both), "1." (the first), "2." (the second)
file('a2.musicxml', 'Two players on one staff', [{ id: 'P1', name: 'Flutes 1.2', instruments: [{ id: 'P1-I1', name: 'Flute', sound: 'wind.flutes.flute' }] }], [[
  tempo + note('E', 5, 4) + note('G', 5, 4, '', { chord: true }) + words('a 2') + note('D', 5, 4) + words('1.') + note('C', 5, 4) + words('2.') + note('B', 4, 4),
]]);

// a breath mark and a caesura
file('breath.musicxml', 'Breath marks and caesuras', [{ id: 'P1', name: 'Oboe' }], [[
  tempo + note('C', 5, 8, '', { notations: '<articulations><breath-mark/></articulations>' }) + note('D', 5, 4, '', { notations: '<articulations><caesura/></articulations>' }) + note('E', 5, 4),
]]);

// cue notes (another part's line, not played) against small print (played, like a cadenza)
file('cue.musicxml', 'Cue notes and small print', [{ id: 'P1', name: 'Clarinet' }], [[
  tempo + note('C', 5, 16),
  '<note><cue/><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice></note><note><cue/><pitch><step>A</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice></note>',
  '<note><pitch><step>D</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type size="cue">half</type></note>' + note('E', 5, 8),
]]);

// a fermata over the last note of the bar: only that note is held
file('fermata.musicxml', 'Fermata', [{ id: 'P1', name: 'Violin' }, { id: 'P2', name: 'Violoncello' }], [
  [tempo + note('C', 5, 4) + note('D', 5, 4) + note('E', 5, 4) + note('F', 5, 4, '', { notations: '<fermata/>' }), note('G', 5, 16)],
  [note('C', 3, 16), note('C', 3, 16)],
]);

// sustain pedal marks: down at the start, a change on beat 3, up on beat 3 of the next bar
const ped = (type) => `<direction><direction-type><pedal type="${type}" line="yes"/></direction-type></direction>`;
file('pedal.musicxml', 'Sustain pedal', [{ id: 'P1', name: 'Piano' }], [[
  tempo + ped('start') + note('C', 4, 4) + note('E', 4, 4) + ped('change') + note('G', 4, 4) + note('C', 5, 4),
  note('G', 3, 8) + ped('stop') + note('C', 4, 8),
]]);

// playing techniques from words and marks: sul pont., spiccato, col legno, ord.; a flute's flz.
file('techniques.musicxml', 'Playing techniques', [{ id: 'P1', name: 'Violin' }, { id: 'P2', name: 'Flute' }], [
  [tempo + words('sul pont.') + note('A', 4, 4) + words('ord.') + note('B', 4, 4, '', { notations: '<articulations><spiccato/></articulations>' }) + words('col legno') + note('C', 5, 4) + words('ord.') + note('D', 5, 4)],
  [words('flz.') + note('A', 5, 8) + words('ord.') + note('G', 5, 8)],
]);
console.log('wrote', new URL('.', dir).pathname);
