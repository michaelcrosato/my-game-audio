# Library: famous public-domain music, played from its sheet music

Well-known music that is free to use, fed to the engine as the sheet music it was written in: symphonies, piano
pieces, arias, marches, folk songs and carols. Nothing here is composed for the repository. The work is done ahead of
time: each score is chosen, imported, rendered and checked once, so a game or a person can play any of them now.

```sh
npm run library                          # every piece and its numbers; rewrites the table below
npm run library -- check [ID...]         # import and arrange: each piece's length, voices, warnings and critic notes
npm run library -- render [ID...]        # render to out/library/ID.once.wav, check it, keep its numbers in library.json
npm run library -- score                 # Audiobox scores for the rendered pieces that have none, in one batch
npm run library -- page                  # out/library/index.html: a page to listen to every rendered piece
npm run library -- page --audio m4a      # the same with small AAC files (needs ffmpeg), in out/library/web/
```

A whole render took about two and a half hours on four cores, in two jobs side by side: there are eight hours of
music. `render --missing` renders only what has no measurement on this engine version; `--no-score` skips Audiobox,
and `score` adds it later, six pieces at a time.

## What is kept

- **`library.json`**: each piece's title, composer, year, who plays it, its group on the page (orchestra, piano and
  organ, voices, chamber, folk and carols), its score file and that file's SHA-256, where the score came from and
  under which licence, how it is imported (`import`), and what the engine made of it (`measured`: length,
  loudness, PASS or FAIL, the import's warnings and the critic's notes, the Audiobox scores of the first minute).
- **`scores/`**: the score files, unchanged from their sources (`.mxl` MusicXML, `.mid` MIDI). Three pieces play the
  songs already in `songs/` (`beethoven_moonlight`, `mozart_alla_turca`, `joplin_entertainer`).
- **No audio** (CLAUDE.md, rule 1). Renders go to `out/library/`, which git ignores.

## Where the scores come from

Every score here is CC0 or in the public domain (CLAUDE.md, rule 4), and so is every composition: each named composer
died more than 70 years ago, the traditional tunes are older still, and each work was published before 1930.

- **OpenScore Orchestra** (CC0): the full scores of symphonic movements that OpenScore's volunteers transcribed from
  public-domain editions, as the Hauptstimme corpus keeps them (github.com/MarkGotham/Hauptstimme, commit
  `8f677853`; `source.path` names the file). The test scores and `songs/beethoven5.mjs` come from the same corpus.
- **PDMX** (CC0 entries only): the Public Domain MusicXML dataset (zenodo.org/records/15571083), scores that MuseScore
  users published as public domain. Only scores under CC0 with no licence conflict flagged are used, and only of works
  in the public domain: PDMX's own conflict check misses arrangements of copyrighted songs, so each work here was
  checked by its composer and date. `source` records the MuseScore page, the transcriber and the file's path in PDMX.
  Many are arrangements, often for piano; "Played by" says so.
- **The Mutopia Project** (public domain): engravings of public-domain editions, played from the MIDI file each piece
  comes with. `source` records the piece's page, its Mutopia version and the edition it was engraved from.

## How each one is imported

- OpenScore and Mutopia scores import as any score does (`npm run ears -- file`).
- PDMX scores import with `soundTempo`: they play at the tempo the transcriber set for MuseScore's own playback (the
  `<sound tempo>` beside each mark), not at the tempo its printed word suggests. A transcription's words can mislead:
  "Adagio" over an alla breve Ave verum, or a "Tempo di valse" the word table does not know.
- Every MusicXML import takes its D.C., D.S., To Coda and Fine jumps (since 0.16.0): a minuet returns after its trio.
- A Mutopia MIDI file plays its repeats once: LilyPond writes repeats out only when asked. Für Elise and the first
  Gymnopédie come from complete PDMX scores for that reason; Träumerei plays its repeats once.
- A part named after a character, or in a language the preset names do not cover, gets its instrument from
  `import.instruments` (Aida's high priest Ramfis is a bass, not a tuba; Lakmé and Mallika sing their duet;
  "Violonchelos" are cellos).
- A piece for one instrument (a piano, an organ, a cello; a duet at one piano) plays its score's range of dynamics
  unstretched since 0.21.0: the concert stretch, made to match recorded orchestras, pushed Clair de lune's pianissimo
  to the floor. A piece's `adjust` (song fields set after the import) remains for cases like it; none needs one now.

## The pieces

"Checks" is the ears' verdict on the whole piece (PASS or FAIL); "Enjoyment / quality" is Audiobox Aesthetics on its
first minute, from 1 to 10. The pieces for one instrument and Aida were measured again on 0.21.0 (their dynamics and
the click check changed), the pieces with choirs or soloists on 0.22.0 (their voices changed); the others on 0.16.0,
whose engine plays them the same.

<!-- library:index -->
| # | Piece | Composer | Year | Played by | Length | Checks | Enjoyment / quality | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Symphony No. 5 in C minor, I. Allegro con brio | Ludwig van Beethoven | 1808 | orchestra | 6:10 | PASS | 6.99 / 7.93 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 2 | Symphony No. 9 in D minor, IV. Ode to Joy | Ludwig van Beethoven | 1824 | orchestra and choir | 22:43 | PASS | 6.67 / 7.86 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 3 | Symphony No. 7 in A major, II. Allegretto | Ludwig van Beethoven | 1812 | orchestra | 7:23 | PASS | 6.87 / 7.60 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 4 | Symphony No. 6 "Pastoral", I. Allegro ma non troppo | Ludwig van Beethoven | 1808 | orchestra | 9:58 | PASS | 7.15 / 7.94 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 5 | Symphony No. 3 "Eroica", I. Allegro con brio | Ludwig van Beethoven | 1804 | orchestra | 14:06 | PASS | 7.02 / 7.98 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 6 | Symphony No. 9 in D minor, II. Molto vivace | Ludwig van Beethoven | 1824 | orchestra | 12:44 | PASS | 7.33 / 8.09 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 7 | Symphony No. 1 in C minor, IV | Johannes Brahms | 1876 | orchestra | 20:56 | PASS | 7.20 / 8.04 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 8 | Brandenburg Concerto No. 3, I | Johann Sebastian Bach | 1721 | orchestra | 4:56 | PASS | 7.40 / 7.85 | [OpenScore Orchestra](https://github.com/MarkGotham/Hauptstimme) |
| 9 | Eine kleine Nachtmusik, I. Allegro | Wolfgang Amadeus Mozart | 1787 | string quartet | 6:28 | PASS | 6.78 / 7.80 | [PDMX](https://zenodo.org/records/15571083) |
| 10 | Symphony No. 40 in G minor, I. Molto allegro | Wolfgang Amadeus Mozart | 1788 | orchestra | 8:30 | PASS | 7.06 / 7.90 | [PDMX](https://zenodo.org/records/15571083) |
| 11 | The Marriage of Figaro: Overture | Wolfgang Amadeus Mozart | 1786 | orchestra | 5:57 | PASS | 7.12 / 7.90 | [PDMX](https://zenodo.org/records/15571083) |
| 12 | Requiem: Dies irae | Wolfgang Amadeus Mozart | 1791 | orchestra and choir | 1:55 | PASS | 7.25 / 7.69 | [PDMX](https://zenodo.org/records/15571083) |
| 13 | Requiem: Lacrimosa | Wolfgang Amadeus Mozart | 1791 | choir and piano | 3:13 | PASS | 7.25 / 7.83 | [PDMX](https://zenodo.org/records/15571083) |
| 14 | Piano Concerto No. 21, II. Andante | Wolfgang Amadeus Mozart | 1785 | piano and orchestra | 6:40 | PASS | 7.35 / 7.98 | [PDMX](https://zenodo.org/records/15571083) |
| 15 | The Four Seasons: Winter | Antonio Vivaldi | 1725 | violins and strings | 11:00 | PASS | 5.57 / 7.45 | [PDMX](https://zenodo.org/records/15571083) |
| 16 | The Four Seasons: Summer, III. Presto | Antonio Vivaldi | 1725 | strings | 2:51 | PASS | 6.68 / 7.76 | [PDMX](https://zenodo.org/records/15571083) |
| 17 | Canon in D | Johann Pachelbel | c. 1690 | strings and harpsichord | 5:46 | PASS | 6.45 / 7.78 | [PDMX](https://zenodo.org/records/15571083) |
| 18 | Orchestral Suite No. 3: Air | Johann Sebastian Bach | c. 1730 | string quartet | 4:52 | PASS | 6.57 / 7.67 | [PDMX](https://zenodo.org/records/15571083) |
| 19 | Jesu, Joy of Man's Desiring | Johann Sebastian Bach | 1723 | string quartet | 6:43 | PASS | 6.68 / 7.64 | [PDMX](https://zenodo.org/records/15571083) |
| 20 | Messiah: Hallelujah | George Frideric Handel | 1741 | orchestra and choir | 4:01 | PASS | 7.59 / 8.04 | [PDMX](https://zenodo.org/records/15571083) |
| 21 | Serse: Ombra mai fù (Largo) | George Frideric Handel | 1738 | voice and strings | 2:29 | PASS | 6.60 / 7.62 | [PDMX](https://zenodo.org/records/15571083) |
| 22 | William Tell: Overture | Gioachino Rossini | 1829 | orchestra | 10:15 | PASS | 6.72 / 7.80 | [PDMX](https://zenodo.org/records/15571083) |
| 23 | Danse macabre | Camille Saint-Saëns | 1874 | orchestra | 7:21 | PASS | 6.80 / 8.02 | [PDMX](https://zenodo.org/records/15571083) |
| 24 | The Carnival of the Animals: The Swan | Camille Saint-Saëns | 1886 | cello and two pianos | 2:59 | PASS | 6.52 / 7.52 | [PDMX](https://zenodo.org/records/15571083) |
| 25 | The Sorcerer's Apprentice | Paul Dukas | 1897 | orchestra | 13:29 | PASS | 7.19 / 8.08 | [PDMX](https://zenodo.org/records/15571083) |
| 26 | The Stars and Stripes Forever | John Philip Sousa | 1896 | band | 2:24 | PASS | 7.43 / 8.07 | [PDMX](https://zenodo.org/records/15571083) |
| 27 | Entry of the Gladiators | Julius Fučík | 1897 | band | 0:54 | PASS | 6.83 / 7.62 | [PDMX](https://zenodo.org/records/15571083) |
| 28 | La Gioconda: Dance of the Hours | Amilcare Ponchielli | 1876 | orchestra | 3:38 | PASS | 6.97 / 8.02 | [PDMX](https://zenodo.org/records/15571083) |
| 29 | Aida: Triumphal March | Giuseppe Verdi | 1871 | orchestra and choir | 12:03 | PASS | 6.90 / 7.70 | [PDMX](https://zenodo.org/records/15571083) |
| 30 | Rigoletto: La donna è mobile | Giuseppe Verdi | 1851 | voice and strings | 2:27 | PASS | 5.64 / 6.61 | [PDMX](https://zenodo.org/records/15571083) |
| 31 | Turandot: Nessun dorma | Giacomo Puccini | 1926 | orchestra | 3:18 | PASS | 7.18 / 7.94 | [PDMX](https://zenodo.org/records/15571083) |
| 32 | Lakmé: Flower Duet | Léo Delibes | 1883 | orchestra | 4:49 | PASS | 6.76 / 7.30 | [PDMX](https://zenodo.org/records/15571083) |
| 33 | String Quintet in E major: Minuet | Luigi Boccherini | 1771 | string quintet | 4:04 | PASS | 6.84 / 7.70 | [PDMX](https://zenodo.org/records/15571083) |
| 34 | Radetzky March | Johann Strauss I | 1848 | winds and piano | 2:22 | PASS | 7.02 / 7.79 | [PDMX](https://zenodo.org/records/15571083) |
| 35 | Symphony No. 8 "Unfinished", I. Allegro moderato | Franz Schubert | 1822 | orchestra | 16:34 | PASS | 6.41 / 8.10 | [PDMX](https://zenodo.org/records/15571083) |
| 36 | Symphony No. 9 "From the New World", II. Largo | Antonín Dvořák | 1893 | orchestra | 12:43 | PASS | 6.17 / 7.57 | [PDMX](https://zenodo.org/records/15571083) |
| 37 | Ave Maria (after Bach) | Charles Gounod | 1853 | violin and piano | 2:25 | PASS | 6.46 / 7.65 | [PDMX](https://zenodo.org/records/15571083) |
| 38 | Ave Maria (Ellens dritter Gesang) | Franz Schubert | 1825 | clarinet and piano | 4:41 | PASS | 7.04 / 7.57 | [PDMX](https://zenodo.org/records/15571083) |
| 39 | Joy to the World | Lowell Mason, after Handel | 1839 | choir and orchestra | 3:25 | PASS | 6.98 / 7.81 | [PDMX](https://zenodo.org/records/15571083) |
| 40 | O Come, All Ye Faithful (Adeste Fideles) | John Francis Wade | c. 1743 | choir and orchestra | 1:31 | PASS | 7.09 / 7.79 | [PDMX](https://zenodo.org/records/15571083) |
| 41 | Deck the Halls | Traditional Welsh | 18th century | band | 2:00 | PASS | 6.42 / 7.30 | [PDMX](https://zenodo.org/records/15571083) |
| 42 | Jingle Bells | James Lord Pierpont | 1857 | string quartet and piano | 1:59 | PASS | 6.69 / 7.66 | [PDMX](https://zenodo.org/records/15571083) |
| 43 | Hungarian Dance No. 5 | Johannes Brahms | 1869 | piano four hands | 2:04 | PASS | 7.68 / 7.96 | [PDMX](https://zenodo.org/records/15571083) |
| 44 | Cello Suite No. 1: Prelude | Johann Sebastian Bach | c. 1720 | cello | 2:29 | PASS | 4.49 / 7.14 | [PDMX](https://zenodo.org/records/15571083) |
| 45 | Für Elise | Ludwig van Beethoven | 1810 | piano | 2:23 | PASS | 7.18 / 7.94 | [PDMX](https://zenodo.org/records/15571083) |
| 46 | Moonlight Sonata, I. Adagio sostenuto | Ludwig van Beethoven | 1801 | piano | 6:12 | PASS | 7.06 / 7.81 | [PDMX](https://zenodo.org/records/15571083) |
| 47 | Moonlight Sonata, III. Presto agitato | Ludwig van Beethoven | 1801 | piano | 6:25 | PASS | 7.04 / 7.90 | [PDMX](https://zenodo.org/records/15571083) |
| 48 | Rondo alla Turca | Wolfgang Amadeus Mozart | 1783 | piano | 2:06 | PASS | 7.56 / 8.19 | [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=108) |
| 49 | Piano Sonata No. 16 in C major, I. Allegro | Wolfgang Amadeus Mozart | 1788 | piano | 4:29 | PASS | 7.17 / 8.05 | [PDMX](https://zenodo.org/records/15571083) |
| 50 | Twelve Variations on "Ah vous dirai-je, Maman" | Wolfgang Amadeus Mozart | 1781 | piano | 11:43 | PASS | 7.13 / 8.15 | [PDMX](https://zenodo.org/records/15571083) |
| 51 | The Well-Tempered Clavier: Prelude and Fugue in C major | Johann Sebastian Bach | 1722 | piano | 2:53 | PASS | 7.04 / 8.04 | [PDMX](https://zenodo.org/records/15571083) |
| 52 | Toccata and Fugue in D minor | Johann Sebastian Bach | c. 1704 | organ | 9:36 | PASS | 6.79 / 8.02 | [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1780) |
| 53 | Minuet in G major | Christian Petzold | 1725 | piano | 2:04 | PASS | 7.07 / 7.97 | [PDMX](https://zenodo.org/records/15571083) |
| 54 | Nocturne in E-flat major, Op. 9 No. 2 | Frédéric Chopin | 1832 | piano | 3:50 | PASS | 7.15 / 7.69 | [PDMX](https://zenodo.org/records/15571083) |
| 55 | Minute Waltz | Frédéric Chopin | 1847 | piano | 1:47 | PASS | 7.31 / 7.63 | [PDMX](https://zenodo.org/records/15571083) |
| 56 | Fantaisie-Impromptu | Frédéric Chopin | 1834 | piano | 4:56 | PASS | 7.06 / 7.53 | [PDMX](https://zenodo.org/records/15571083) |
| 57 | Prelude in E minor, Op. 28 No. 4 | Frédéric Chopin | 1839 | piano | 2:12 | PASS | 6.68 / 7.25 | [PDMX](https://zenodo.org/records/15571083) |
| 58 | Polonaise in A-flat major "Heroic" | Frédéric Chopin | 1842 | piano | 6:16 | PASS | 7.52 / 7.71 | [PDMX](https://zenodo.org/records/15571083) |
| 59 | Ballade No. 1 in G minor | Frédéric Chopin | 1835 | piano | 8:59 | PASS | 7.40 / 8.03 | [PDMX](https://zenodo.org/records/15571083) |
| 60 | Revolutionary Étude | Frédéric Chopin | 1831 | piano | 2:11 | PASS | 6.40 / 7.75 | [PDMX](https://zenodo.org/records/15571083) |
| 61 | Piano Sonata No. 2: Funeral March | Frédéric Chopin | 1837 | piano | 4:08 | PASS | 7.39 / 7.57 | [PDMX](https://zenodo.org/records/15571083) |
| 62 | Suite bergamasque: Clair de lune | Claude Debussy | 1905 | piano | 4:03 | PASS | 7.42 / 7.80 | [PDMX](https://zenodo.org/records/15571083) |
| 63 | Arabesque No. 1 | Claude Debussy | 1891 | piano | 3:53 | PASS | 7.63 / 7.82 | [PDMX](https://zenodo.org/records/15571083) |
| 64 | The Girl with the Flaxen Hair | Claude Debussy | 1910 | piano | 2:09 | PASS | 7.19 / 7.75 | [PDMX](https://zenodo.org/records/15571083) |
| 65 | Gymnopédie No. 1 | Erik Satie | 1888 | piano | 3:00 | PASS | 7.20 / 7.78 | [PDMX](https://zenodo.org/records/15571083) |
| 66 | Gnossienne No. 1 | Erik Satie | 1890 | piano | 2:36 | PASS | 6.95 / 7.76 | [PDMX](https://zenodo.org/records/15571083) |
| 67 | The Entertainer | Scott Joplin | 1902 | piano | 4:17 | PASS | 7.67 / 8.17 | [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263) |
| 68 | Maple Leaf Rag | Scott Joplin | 1899 | piano | 2:33 | PASS | 7.57 / 7.96 | [PDMX](https://zenodo.org/records/15571083) |
| 69 | Kinderszenen: Träumerei | Robert Schumann | 1838 | piano | 2:06 | PASS | 7.06 / 7.88 | [Mutopia Project](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=504) |
| 70 | Liebestraum No. 3 | Franz Liszt | 1850 | piano | 4:07 | PASS | 7.55 / 8.08 | [PDMX](https://zenodo.org/records/15571083) |
| 71 | La campanella | Franz Liszt | 1851 | piano | 4:19 | PASS | 6.93 / 8.18 | [PDMX](https://zenodo.org/records/15571083) |
| 72 | Prelude in C-sharp minor | Sergei Rachmaninoff | 1892 | piano | 3:12 | PASS | 7.36 / 8.03 | [PDMX](https://zenodo.org/records/15571083) |
| 73 | Peer Gynt: In the Hall of the Mountain King | Edvard Grieg | 1875 | piano | 2:42 | PASS | 5.80 / 7.68 | [PDMX](https://zenodo.org/records/15571083) |
| 74 | The Nutcracker: Dance of the Sugar Plum Fairy | Pyotr Ilyich Tchaikovsky | 1892 | piano | 1:51 | PASS | 7.57 / 8.07 | [PDMX](https://zenodo.org/records/15571083) |
| 75 | The Nutcracker: Waltz of the Flowers | Pyotr Ilyich Tchaikovsky | 1892 | piano | 6:53 | PASS | 7.03 / 7.55 | [PDMX](https://zenodo.org/records/15571083) |
| 76 | Swan Lake: Theme | Pyotr Ilyich Tchaikovsky | 1876 | piano | 1:21 | PASS | 6.93 / 8.01 | [PDMX](https://zenodo.org/records/15571083) |
| 77 | Orpheus in the Underworld: Can-can | Jacques Offenbach | 1858 | piano | 1:45 | PASS | 7.46 / 8.27 | [PDMX](https://zenodo.org/records/15571083) |
| 78 | Die Walküre: Ride of the Valkyries | Richard Wagner | 1856 | piano | 5:29 | PASS | 6.94 / 7.55 | [PDMX](https://zenodo.org/records/15571083) |
| 79 | A Midsummer Night's Dream: Wedding March | Felix Mendelssohn | 1842 | piano | 4:46 | PASS | 7.50 / 7.98 | [PDMX](https://zenodo.org/records/15571083) |
| 80 | Pomp and Circumstance March No. 1 | Edward Elgar | 1901 | piano and choir | 6:49 | PASS | 7.26 / 7.85 | [PDMX](https://zenodo.org/records/15571083) |
| 81 | Enigma Variations: Nimrod | Edward Elgar | 1899 | piano | 2:41 | PASS | 7.49 / 7.82 | [PDMX](https://zenodo.org/records/15571083) |
| 82 | The Blue Danube | Johann Strauss II | 1866 | piano | 10:46 | PASS | 7.55 / 8.15 | [PDMX](https://zenodo.org/records/15571083) |
| 83 | Carmen: Overture | Georges Bizet | 1875 | piano | 2:25 | PASS | 7.47 / 8.20 | [PDMX](https://zenodo.org/records/15571083) |
| 84 | Flight of the Bumblebee | Nikolai Rimsky-Korsakov | 1900 | piano | 1:28 | PASS | 6.29 / 7.68 | [PDMX](https://zenodo.org/records/15571083) |
| 85 | Ständchen (Serenade), arranged by Liszt | Franz Schubert | 1828 | piano | 5:18 | PASS | 7.57 / 7.59 | [PDMX](https://zenodo.org/records/15571083) |
| 86 | Gianni Schicchi: O mio babbino caro | Giacomo Puccini | 1918 | piano | 2:37 | PASS | 7.42 / 7.76 | [PDMX](https://zenodo.org/records/15571083) |
| 87 | Má vlast: The Moldau | Bedřich Smetana | 1874 | piano | 4:46 | PASS | 7.68 / 8.04 | [PDMX](https://zenodo.org/records/15571083) |
| 88 | Greensleeves | Traditional English | 16th century | piano duet | 3:34 | PASS | 7.21 / 8.21 | [PDMX](https://zenodo.org/records/15571083) |
| 89 | Amazing Grace | Traditional American | 1835 | piano | 2:50 | PASS | 7.35 / 7.92 | [PDMX](https://zenodo.org/records/15571083) |
| 90 | Scarborough Fair | Traditional English | medieval | piano | 2:35 | PASS | 7.09 / 7.94 | [PDMX](https://zenodo.org/records/15571083) |
| 91 | Londonderry Air (Danny Boy) | Traditional Irish | 1855 | piano | 1:12 | PASS | 7.36 / 7.63 | [PDMX](https://zenodo.org/records/15571083) |
| 92 | Auld Lang Syne | Traditional Scottish | 1788 | piano | 0:36 | PASS | 6.87 / 7.77 | [PDMX](https://zenodo.org/records/15571083) |
| 93 | When the Saints Go Marching In | Traditional American | c. 1900 | piano | 0:42 | PASS | 6.99 / 8.05 | [PDMX](https://zenodo.org/records/15571083) |
| 94 | Silent Night | Franz Xaver Gruber | 1818 | piano | 1:25 | PASS | 7.42 / 7.76 | [PDMX](https://zenodo.org/records/15571083) |
| 95 | We Wish You a Merry Christmas | Traditional English | 16th century | piano | 1:10 | PASS | 7.63 / 8.16 | [PDMX](https://zenodo.org/records/15571083) |
| 96 | O Holy Night | Adolphe Adam | 1847 | piano | 4:10 | PASS | 6.84 / 7.84 | [PDMX](https://zenodo.org/records/15571083) |
| 97 | The First Noel | Traditional English | 1823 | violin and piano | 1:55 | PASS | 6.84 / 7.66 | [PDMX](https://zenodo.org/records/15571083) |
| 98 | 'O sole mio | Eduardo di Capua | 1898 | piano and voices | 2:17 | PASS | 7.36 / 7.70 | [PDMX](https://zenodo.org/records/15571083) |
| 99 | What Shall We Do with the Drunken Sailor | Traditional sea shanty | 19th century | piano | 1:02 | PASS | 6.27 / 6.74 | [PDMX](https://zenodo.org/records/15571083) |
| 100 | Korobeiniki | Traditional Russian | 1861 | accordion and clarinet | 1:07 | PASS | 6.80 / 7.96 | [PDMX](https://zenodo.org/records/15571083) |
<!-- /library:index -->
