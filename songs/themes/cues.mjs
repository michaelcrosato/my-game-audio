// The ten cues of a game's soundtrack, as themes: key, tempo, meter, chords and melody, with no instruments. The
// cue sets in songs/ (set_chiptune, set_synthwave, set_orchestral) arrange the same themes in their own styles, as a
// game's soundtrack re-scores its themes for each place. Original music, written for this library (MIT, like the code).
//
// Every theme: { name, mood, key, bpm, meter, grid, intro?: { chords, melody }, chords, melody }. Lines are in the
// score format; `chords` has one symbol per bar or several separated by spaces; melodies sit around C5.

export const THEMES = {
  title: {
    name: 'Crown of Dawn', mood: 'heroic, bright', key: 'C major', bpm: 132, meter: [4, 4], grid: 16,
    intro: { chords: '| C | G |', melody: '| G4:4 C5:4 E5:4 G5:4 | B5:8 D5:4 G5:4 |' },
    chords: '| C | Am | F | G | C | Em | F G | C |',
    melody: `| E5:4 G5:4 C6:6 B5:2 | A5:4 E5:4 C5:8 | F5:4 A5:4 C6:4 A5:4 | G5:12 D5:4
             | E5:4 G5:4 C6:4 E6:4 | D6:4 B5:4 G5:4 E5:4 | F5:4 A5:4 G5:4 B5:4 | C6:12 .:4 |`,
  },
  menu: {
    name: 'Hearth Light', mood: 'calm, warm, unhurried', key: 'F major', bpm: 96, meter: [4, 4], grid: 16,
    chords: '| F | Dm | Bb | C |',
    melody: '| A5:8 C6:4 A5:4 | F5:8 D5:8 | D5:4 F5:4 Bb5:8 | G5:8 E5:4 C5:4 |',
  },
  exploration: {
    name: 'Open Road', mood: 'curious, moving on', key: 'D major', bpm: 124, meter: [4, 4], grid: 16,
    chords: '| D | G | D | A | Bm | G | Em | A |',
    melody: `| F#5:2 A5:2 D6:4 C#6:2 B5:2 A5:4 | B5:4 G5:4 D5:4 G5:4 | A5:6 F#5:2 D5:4 F#5:4 | E5:8 C#5:4 E5:4
             | F#5:2 B5:2 D6:4 C#6:2 B5:2 F#5:4 | G5:4 B5:4 D6:4 B5:4 | E6:6 D6:2 B5:4 G5:4 | A5:8 C#6:4 E6:4 |`,
  },
  town: {
    name: 'Market Square', mood: 'cheerful, busy, a waltz', key: 'G major', bpm: 150, meter: [3, 4], grid: 12,
    chords: '| G | C | D | G | Em | C | D | G |',
    melody: '| B4:4 D5:4 G5:4 | E5:6 D5:2 C5:4 | A4:4 D5:4 F#5:4 | G5:8 D5:4 | E5:4 G5:4 B5:4 | C6:6 B5:2 A5:4 | A5:4 F#5:4 D5:4 | G5:12 |',
  },
  dungeon: {
    name: 'Under the Keep', mood: 'dark, cautious, sparse', key: 'D minor', bpm: 92, meter: [4, 4], grid: 16,
    chords: '| Dm | Dm | Bb | A | Dm | Gm | Bb | A |',
    melody: `| D5:6 E5:2 F5:8 | E5:4 D5:4 A4:8 | Bb4:6 C5:2 D5:8 | C#5:12 .:4
             | D5:4 F5:4 A5:8 | G5:6 F5:2 D5:8 | F5:4 E5:4 D5:8 | E5:8 C#5:8 |`,
  },
  battle: {
    name: 'Clash', mood: 'urgent, driving', key: 'E minor', bpm: 160, meter: [4, 4], grid: 16,
    chords: '| Em | C | D | B | Em | C | Am | B |',
    melody: `| E5:2 E5:2 G5:2 B5:2 E6:4 D6:2 B5:2 | C6:4 G5:2 E5:2 G5:4 C6:4 | D6:2 C6:2 A5:2 F#5:2 D5:4 A5:4 | B5:8 D#6:4 F#6:4
             | E6:2 D6:2 B5:2 G5:2 E5:4 G5:4 | C6:2 B5:2 G5:2 E5:2 C5:4 E5:4 | A5:4 C6:4 E6:4 C6:4 | B5:6 A5:2 F#5:4 D#5:4 |`,
  },
  boss: {
    name: 'Iron Tyrant', mood: 'menacing, relentless', key: 'C minor', bpm: 172, meter: [4, 4], grid: 16,
    chords: '| Cm | Cm | Ab | Bb | Cm | Db | Ab | G |',
    melody: `| C5:2 Eb5:2 G5:2 C6:2 B5:2 C6:2 G5:4 | Ab5:2 G5:2 Eb5:2 C5:2 D5:4 Eb5:4 | C6:4 Ab5:4 Eb5:4 C5:4 | D5:4 F5:4 Bb5:4 D6:4
             | Eb6:6 D6:2 C6:4 G5:4 | F5:4 Ab5:4 Db6:8 | C6:4 Eb6:4 Ab5:4 C6:4 | B5:8 D6:4 G5:4 |`,
  },
  victory: {
    name: 'Laurels', mood: 'triumphant, then a happy vamp', key: 'C major', bpm: 144, meter: [4, 4], grid: 16,
    intro: { chords: '| C | G7 |', melody: '| C5:2 C5:2 C5:2 C5:4 G4:2 A4:2 B4:2 | C5:8 G5:8 |' },
    chords: '| F | G | Em Am | Dm G |',
    melody: '| A5:4 C6:4 F5:4 C6:4 | B5:4 D6:4 G5:4 D6:4 | G5:4 E5:4 A5:4 E5:4 | F5:4 A5:4 G5:8 |',
  },
  defeat: {
    name: 'Fallen', mood: 'sorrowful, slow', key: 'A minor', bpm: 66, meter: [4, 4], grid: 16,
    chords: '| Am | F | Dm | E |',
    melody: '| E5:8 C5:4 A4:4 | F5:8 C5:8 | D5:6 C5:2 A4:8 | G#4:12 .:4 |',
  },
  ambience: {
    name: 'Still Air', mood: 'open, empty, a held breath', key: 'D dorian', bpm: 60, meter: [4, 4], grid: 16,
    chords: '| Dm | Dm | C | C | Bb | Bb | C | C |',
    melody: '| A5:16 | .:16 | G5:8 E5:8 | .:16 | F5:16 | .:8 D5:8 | E5:16 | .:16 |',
  },
};

/** The cue names, in the order a game usually needs them. */
export const CUES = Object.keys(THEMES);
