(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});
  const STORAGE_KEY = 'practicekeys_custom_songs_v1';

  const noteToMidi = PianoApp.parsers.noteNameToMidi;

  function buildFromTracks(id, name, bpm, tracks, beatsPerBar) {
    const beatSec = 60 / bpm;
    const notes = [];

    for (const tr of tracks) {
      const hand = tr.hand;
      const velocity = tr.velocity || 0.78;
      let cursor = tr.startBeat || 0;

      for (const step of tr.steps) {
        const pitchSpec = step[0];
        const beats = step[1];
        const holdRatio = step[2] != null ? step[2] : 0.92;
        if (pitchSpec) {
          const list = Array.isArray(pitchSpec) ? pitchSpec : [pitchSpec];
          for (const p of list) {
            const midi = noteToMidi(p);
            if (midi !== null) {
              notes.push({
                midi,
                time: cursor * beatSec,
                duration: Math.max(0.06, beats * beatSec * holdRatio),
                velocity,
                hand
              });
            }
          }
        }
        cursor += beats;
      }
    }

    notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
    let duration = 0;
    let minMidi = 108;
    let maxMidi = 21;
    for (const n of notes) {
      if (n.time + n.duration > duration) duration = n.time + n.duration;
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    }

    return {
      id,
      name,
      notes,
      duration,
      minMidi,
      maxMidi,
      bpm: bpm || 100,
      beatsPerBar: beatsPerBar || 4,
      custom: false
    };
  }

  const AMELIA_MIDI_B64 = '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';

  function createBuiltInSongs() {
    const amelia = PianoApp.parsers.parseMidi(
      PianoApp.parsers.base64ToArrayBuffer(AMELIA_MIDI_B64),
      '',
      { id: 'builtin_amelia', name: 'Amelia', custom: false }
    );
    // 1. Sweden
    const sweden = buildFromTracks('builtin_sweden', 'Sweden', 72, [
      {
        hand: 'right',
        velocity: 0.74,
        steps: [
          ['B3', 2, 1.05], ['C#4', 2, 1.05],
          ['F#4', 2, 1.05], ['E4', 1, 1.0], ['C#4', 1, 1.0],
          ['D4', 2, 1.05], ['C#4', 1, 1.0], ['A3', 1, 1.0],
          ['B3', 4, 1.02],

          ['C#4', 1.5, 1.0], ['E4', 1.5, 1.0], ['F#4', 1, 1.0],
          ['A4', 2, 1.05], ['F#4', 1, 1.0], ['E4', 1, 1.0],
          ['E4', 2, 1.05], ['C#4', 1, 1.0], ['B3', 1, 1.0],
          ['A3', 2, 1.05], ['B3', 2, 1.05],

          [['F#4', 'A4'], 1.5, 0.98], ['E4', 0.5, 0.95], [['D4', 'F#4'], 2, 1.0],
          [['D4', 'F#4'], 1.5, 0.98], ['C#4', 0.5, 0.95], [['B3', 'D4'], 2, 1.0],
          [['C#4', 'E4'], 1.5, 0.98], ['B3', 0.5, 0.95], [['A3', 'C#4'], 2, 1.0],
          [['G#3', 'B3'], 2, 1.0], ['E4', 1, 1.0], ['C#4', 1, 1.0],

          ['F#4', 1, 1.0], ['A4', 1, 1.0], ['B4', 1, 1.0], ['A4', 1, 1.0],
          ['C#5', 1.5, 1.0], ['B4', 0.5, 0.95], ['A4', 1, 1.0], ['E4', 1, 1.0],
          ['F#4', 1, 1.0], ['E4', 1, 1.0], ['C#4', 1, 1.0], ['B3', 1, 1.0],
          [['A3', 'C#4', 'E4'], 4, 1.02]
        ]
      },
      {
        hand: 'left',
        velocity: 0.6,
        steps: [
          [['A2', 'E3'], 4, 1.02],
          [['D2', 'A2'], 4, 1.02],
          [['B2', 'F#3'], 4, 1.02],
          [['E2', 'B2'], 4, 1.02],

          [['A2', 'E3'], 4, 1.02],
          [['D2', 'A2'], 4, 1.02],
          [['F#2', 'C#3'], 4, 1.02],
          [['E2', 'B2'], 4, 1.02],

          ['D2', 1, 1.1], ['A2', 1, 1.1], ['D3', 2, 1.0],
          ['B2', 1, 1.1], ['F#3', 1, 1.1], ['B3', 2, 1.0],
          ['A2', 1, 1.1], ['E3', 1, 1.1], ['A3', 2, 1.0],
          ['E2', 1, 1.1], ['B2', 1, 1.1], ['E3', 2, 1.0],

          ['D2', 1, 1.1], ['A2', 1, 1.1], ['D3', 2, 1.0],
          ['F#2', 1, 1.1], ['C#3', 1, 1.1], ['F#3', 2, 1.0],
          ['D2', 1, 1.1], ['A2', 1, 1.1], ['E2', 2, 1.0],
          [['A2', 'E3'], 4, 1.02]
        ]
      }
    ]);

    // 2. Wet Hands
    const wetHands = buildFromTracks('builtin_wet_hands', 'Wet Hands', 74, [
      {
        hand: 'right',
        velocity: 0.72,
        steps: [
          [null, 1], ['B3', 0.5, 1.3], ['C#4', 0.5, 1.3], ['E4', 0.5, 1.3], ['C#4', 0.5, 1.3], ['B3', 0.5, 1.3], ['E3', 0.5, 1.3],
          [null, 1], ['A3', 0.5, 1.3], ['B3', 0.5, 1.3], ['C#4', 0.5, 1.3], ['A3', 0.5, 1.3], ['F#3', 0.5, 1.3], ['C#3', 0.5, 1.3],
          [null, 1], ['F#3', 0.5, 1.3], ['A3', 0.5, 1.3], ['D4', 0.5, 1.3], ['C#4', 0.5, 1.3], ['A3', 0.5, 1.3], ['F#3', 0.5, 1.3],
          [null, 1], ['G#3', 0.5, 1.3], ['B3', 0.5, 1.3], ['E4', 0.5, 1.3], ['D4', 0.5, 1.3], ['B3', 0.5, 1.3], ['G#3', 0.5, 1.3],

          ['C#5', 0.5, 1.2], ['B4', 0.5, 1.2], ['A4', 1, 1.1], ['E4', 0.5, 1.2], ['C#4', 0.5, 1.2], ['B3', 1, 1.1],
          ['A4', 0.5, 1.2], ['B4', 0.5, 1.2], ['C#5', 1, 1.1], ['A4', 0.5, 1.2], ['F#4', 0.5, 1.2], ['C#4', 1, 1.1],
          ['D5', 0.5, 1.2], ['C#5', 0.5, 1.2], ['B4', 0.5, 1.2], ['A4', 0.5, 1.2], ['F#4', 1, 1.1], ['A4', 1, 1.1],
          ['B4', 1, 1.1], ['G#4', 1, 1.1], ['E4', 1, 1.1], ['B3', 1, 1.1],

          ['E5', 0.5, 1.2], ['C#5', 0.5, 1.2], ['B4', 0.5, 1.2], ['A4', 0.5, 1.2], ['E4', 0.5, 1.2], ['A4', 0.5, 1.2], ['B4', 0.5, 1.2], ['C#5', 0.5, 1.2],
          ['F#5', 1, 1.15], ['E5', 0.5, 1.2], ['C#5', 0.5, 1.2], ['A4', 1, 1.1], ['C#5', 1, 1.1],
          ['D5', 0.5, 1.2], ['C#5', 0.5, 1.2], ['A4', 1, 1.1], ['B4', 1, 1.1], ['G#4', 1, 1.1],
          [['A4', 'C#5', 'E5'], 4, 1.02]
        ]
      },
      {
        hand: 'left',
        velocity: 0.62,
        steps: [
          ['A2', 0.5, 1.6], ['E3', 3.5, 1.0],
          ['F#2', 0.5, 1.6], ['C#3', 3.5, 1.0],
          ['D2', 0.5, 1.6], ['A2', 3.5, 1.0],
          ['E2', 0.5, 1.6], ['B2', 3.5, 1.0],

          ['A2', 0.5, 1.4], ['E3', 0.5, 1.4], ['A3', 1, 1.1], ['E3', 1, 1.1], ['A2', 1, 1.1],
          ['F#2', 0.5, 1.4], ['C#3', 0.5, 1.4], ['F#3', 1, 1.1], ['C#3', 1, 1.1], ['F#2', 1, 1.1],
          ['D2', 0.5, 1.4], ['A2', 0.5, 1.4], ['D3', 1, 1.1], ['A2', 1, 1.1], ['D2', 1, 1.1],
          ['E2', 0.5, 1.4], ['B2', 0.5, 1.4], ['E3', 1, 1.1], ['B2', 1, 1.1], ['E2', 1, 1.1],

          ['A2', 0.5, 1.4], ['E3', 0.5, 1.4], ['B3', 1, 1.1], ['A3', 1, 1.1], ['E3', 1, 1.1],
          ['F#2', 0.5, 1.4], ['C#3', 0.5, 1.4], ['A3', 1, 1.1], ['F#3', 1, 1.1], ['C#3', 1, 1.1],
          ['D2', 1, 1.2], ['A2', 1, 1.2], ['E2', 1, 1.2], ['B2', 1, 1.2],
          [['A2', 'E3', 'A3'], 4, 1.02]
        ]
      }
    ]);

    // 3. Subwoofer Lullaby
    const subwoofer = buildFromTracks('builtin_subwoofer', 'Subwoofer Lullaby', 70, [
      {
        hand: 'right',
        velocity: 0.72,
        steps: [
          ['C#5', 1.5, 1.05], ['B4', 0.5, 1.0], ['A4', 1, 1.05], ['F#4', 1, 1.05],
          ['E4', 1, 1.05], ['F#4', 1, 1.05], ['A4', 2, 1.05],
          ['C#5', 1, 1.05], ['E5', 1, 1.05], ['D5', 1, 1.05], ['C#5', 1, 1.05],
          ['B4', 2, 1.05], ['A4', 2, 1.05],

          ['C#5', 1.5, 1.05], ['B4', 0.5, 1.0], ['A4', 1, 1.05], ['F#4', 1, 1.05],
          ['A4', 1, 1.05], ['B4', 1, 1.05], ['C#5', 2, 1.05],
          ['E5', 1.5, 1.05], ['D5', 0.5, 1.0], ['C#5', 1, 1.05], ['B4', 1, 1.05],
          ['A4', 4, 1.05],

          [['F#4', 'A4'], 2, 1.05], [['E4', 'G#4'], 2, 1.05],
          [['D4', 'F#4'], 2, 1.05], [['C#4', 'E4'], 2, 1.05],
          ['F#4', 1, 1.05], ['A4', 1, 1.05], ['B4', 1, 1.05], ['G#4', 1, 1.05],
          [['A4', 'C#5'], 4, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.58,
        steps: [
          ['F#2', 1, 1.3], ['C#3', 1, 1.3], ['A3', 2, 1.05],
          ['D2', 1, 1.3], ['A2', 1, 1.3], ['F#3', 2, 1.05],
          ['A2', 1, 1.3], ['E3', 1, 1.3], ['C#4', 2, 1.05],
          ['E2', 1, 1.3], ['B2', 1, 1.3], ['G#3', 2, 1.05],

          ['F#2', 1, 1.3], ['C#3', 1, 1.3], ['A3', 2, 1.05],
          ['D2', 1, 1.3], ['A2', 1, 1.3], ['F#3', 2, 1.05],
          ['E2', 1, 1.3], ['B2', 1, 1.3], ['G#3', 2, 1.05],
          [['A2', 'E3'], 4, 1.05],

          ['D2', 2, 1.05], ['E2', 2, 1.05],
          ['B2', 2, 1.05], ['A2', 2, 1.05],
          ['D2', 2, 1.05], ['E2', 2, 1.05],
          [['A2', 'E3'], 4, 1.05]
        ]
      }
    ]);

    // 4. Mice on Venus
    const miceOnVenus = buildFromTracks('builtin_mice_on_venus', 'Mice on Venus', 66, [
      {
        hand: 'right',
        velocity: 0.72,
        steps: [
          ['C#4', 1, 1.1], ['E4', 1, 1.1], ['A4', 1, 1.1], ['B4', 1, 1.1],
          ['A4', 1.5, 1.1], ['G#4', 0.5, 1.0], ['E4', 2, 1.1],
          ['F#4', 1, 1.1], ['A4', 1, 1.1], ['D5', 1, 1.1], ['C#5', 1, 1.1],
          ['B4', 2, 1.1], ['G#4', 2, 1.1],

          ['A4', 1, 1.1], ['C#5', 1, 1.1], ['E5', 1.5, 1.1], ['D5', 0.5, 1.0],
          ['C#5', 1, 1.1], ['B4', 1, 1.1], ['A4', 2, 1.1],
          ['F#4', 1, 1.1], ['A4', 1, 1.1], ['B4', 1, 1.1], ['A4', 1, 1.1],
          ['G#4', 2, 1.1], ['E4', 2, 1.1],

          ['C#4', 1, 1.1], ['E4', 1, 1.1], ['A4', 2, 1.1],
          ['F#4', 1, 1.1], ['A4', 1, 1.1], ['C#5', 2, 1.1],
          ['B4', 1, 1.1], ['A4', 1, 1.1], ['G#4', 1, 1.1], ['E4', 1, 1.1],
          [['A4', 'C#5'], 4, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.56,
        steps: [
          [['A2', 'E3'], 4, 1.05],
          [['E2', 'B2'], 4, 1.05],
          [['D2', 'A2'], 4, 1.05],
          [['E2', 'B2'], 4, 1.05],

          [['F#2', 'C#3'], 4, 1.05],
          [['A2', 'E3'], 4, 1.05],
          [['D2', 'A2'], 4, 1.05],
          [['E2', 'B2'], 4, 1.05],

          ['A2', 2, 1.1], ['E3', 2, 1.1],
          ['D2', 2, 1.1], ['A2', 2, 1.1],
          ['E2', 2, 1.1], ['B2', 2, 1.1],
          [['A2', 'E3'], 4, 1.05]
        ]
      }
    ]);

    // 5. Dry Hands
    const dryHands = buildFromTracks('builtin_dry_hands', 'Dry Hands', 72, [
      {
        hand: 'right',
        velocity: 0.7,
        steps: [
          ['E4', 1, 1.15], ['G4', 1, 1.15], ['A4', 1, 1.15], ['C5', 1, 1.15],
          ['B4', 1.5, 1.1], ['A4', 0.5, 1.0], ['G4', 2, 1.1],
          ['D4', 1, 1.15], ['E4', 1, 1.15], ['G4', 1, 1.15], ['A4', 1, 1.15],
          ['G4', 2, 1.1], ['E4', 2, 1.1],

          ['A4', 1, 1.15], ['C5', 1, 1.15], ['D5', 1, 1.15], ['E5', 1, 1.15],
          ['D5', 1.5, 1.1], ['C5', 0.5, 1.0], ['A4', 2, 1.1],
          ['G4', 1, 1.15], ['A4', 1, 1.15], ['G4', 1, 1.15], ['E4', 1, 1.15],
          ['D4', 2, 1.1], ['C4', 2, 1.1],

          ['E4', 1, 1.15], ['G4', 1, 1.15], ['C5', 2, 1.1],
          ['B4', 1, 1.15], ['A4', 1, 1.15], ['G4', 2, 1.1],
          ['F4', 1, 1.15], ['E4', 1, 1.15], ['D4', 2, 1.1],
          [['C4', 'E4', 'G4'], 4, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.55,
        steps: [
          [['A2', 'E3'], 4, 1.05],
          [['G2', 'D3'], 4, 1.05],
          [['F2', 'C3'], 4, 1.05],
          [['C2', 'G2'], 4, 1.05],

          [['F2', 'C3'], 4, 1.05],
          [['A2', 'E3'], 4, 1.05],
          [['G2', 'D3'], 4, 1.05],
          [['C2', 'G2'], 4, 1.05],

          ['A2', 2, 1.1], ['E3', 2, 1.1],
          ['G2', 2, 1.1], ['D3', 2, 1.1],
          ['F2', 2, 1.1], ['G2', 2, 1.1],
          [['C2', 'G2', 'C3'], 4, 1.05]
        ]
      }
    ]);

    // 6. Haggstrom
    const haggstrom = buildFromTracks('builtin_haggstrom', 'Haggstrom', 88, [
      {
        hand: 'right',
        velocity: 0.76,
        steps: [
          ['A4', 0.5], ['E4', 0.5], ['F#4', 0.5], ['E4', 0.5], ['A4', 0.5], ['E4', 0.5], ['C#4', 0.5], ['E4', 0.5],
          ['A4', 0.5], ['E4', 0.5], ['F#4', 0.5], ['E4', 0.5], ['B4', 0.5], ['A4', 0.5], ['F#4', 0.5], ['E4', 0.5],
          ['F#4', 0.5], ['C#4', 0.5], ['E4', 0.5], ['D4', 0.5], ['F#4', 0.5], ['C#4', 0.5], ['B3', 0.5], ['C#4', 0.5],
          ['D4', 0.5], ['A3', 0.5], ['B3', 0.5], ['C#4', 0.5], ['E4', 1.0], ['D4', 1.0],

          ['E5', 1.0], ['D5', 0.5], ['C#5', 0.5], ['B4', 1.0], ['A4', 1.0],
          ['A4', 0.5], ['B4', 0.5], ['C#5', 1.0], ['E5', 1.0], ['C#5', 1.0],
          ['D5', 1.0], ['C#5', 0.5], ['B4', 0.5], ['A4', 1.0], ['F#4', 1.0],
          ['E4', 1.0], ['F#4', 1.0], ['A4', 2.0],

          ['A4', 0.5], ['E4', 0.5], ['F#4', 0.5], ['E4', 0.5], ['C#5', 0.5], ['B4', 0.5], ['A4', 0.5], ['E4', 0.5],
          ['F#4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C#5', 0.5], ['B4', 1.0], ['A4', 1.0],
          ['D4', 0.5], ['F#4', 0.5], ['A4', 0.5], ['E4', 0.5], ['G#4', 1.0], ['B4', 1.0],
          [['A4', 'C#5', 'E5'], 4.0, 1.02]
        ]
      },
      {
        hand: 'left',
        velocity: 0.62,
        steps: [
          ['A2', 1], ['E3', 1], ['A2', 1], ['E3', 1],
          ['F#2', 1], ['C#3', 1], ['F#2', 1], ['C#3', 1],
          ['D2', 1], ['A2', 1], ['D2', 1], ['A2', 1],
          ['E2', 1], ['B2', 1], ['E2', 1], ['B2', 1],

          ['A2', 1], ['E3', 1], ['A3', 1], ['E3', 1],
          ['F#2', 1], ['C#3', 1], ['F#3', 1], ['C#3', 1],
          ['D2', 1], ['A2', 1], ['D3', 1], ['A2', 1],
          ['E2', 1], ['B2', 1], ['E3', 1], ['B2', 1],

          ['A2', 1], ['E3', 1], ['A3', 1], ['E3', 1],
          ['F#2', 1], ['C#3', 1], ['F#3', 1], ['C#3', 1],
          ['D2', 1], ['A2', 1], ['E2', 1], ['B2', 1],
          [['A2', 'E3', 'A3'], 4.0, 1.02]
        ]
      }
    ]);

    // 7. Living Mice
    const livingMice = buildFromTracks('builtin_living_mice', 'Living Mice', 76, [
      {
        hand: 'right',
        velocity: 0.74,
        steps: [
          ['A4', 1.5, 1.05], ['G4', 0.5, 1.0], ['F4', 1, 1.05], ['E4', 1, 1.05],
          ['D4', 2, 1.05], ['F4', 1, 1.05], ['G4', 1, 1.05],
          ['A4', 1.5, 1.05], ['C5', 0.5, 1.0], ['Bb4', 1, 1.05], ['A4', 1, 1.05],
          ['G4', 2, 1.05], ['E4', 2, 1.05],

          ['F4', 1, 1.05], ['G4', 1, 1.05], ['A4', 1, 1.05], ['D5', 1, 1.05],
          ['C5', 1.5, 1.05], ['Bb4', 0.5, 1.0], ['A4', 2, 1.05],
          ['G4', 1, 1.05], ['A4', 1, 1.05], ['G4', 1, 1.05], ['F4', 1, 1.05],
          ['E4', 2, 1.05], ['D4', 2, 1.05],

          [['F4', 'A4'], 2, 1.05], [['E4', 'G4'], 2, 1.05],
          [['D4', 'F4'], 2, 1.05], [['C4', 'E4'], 2, 1.05],
          ['F4', 1, 1.05], ['G4', 1, 1.05], ['A4', 1, 1.05], ['E4', 1, 1.05],
          [['D4', 'F4', 'A4'], 4, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.6,
        steps: [
          ['D2', 1, 1.2], ['A2', 1, 1.2], ['D3', 2, 1.05],
          ['C2', 1, 1.2], ['G2', 1, 1.2], ['C3', 2, 1.05],
          ['Bb1', 1, 1.2], ['F2', 1, 1.2], ['Bb2', 2, 1.05],
          ['A1', 1, 1.2], ['E2', 1, 1.2], ['A2', 2, 1.05],

          ['D2', 1, 1.2], ['A2', 1, 1.2], ['F3', 2, 1.05],
          ['F2', 1, 1.2], ['C3', 1, 1.2], ['F3', 2, 1.05],
          ['G2', 1, 1.2], ['D3', 1, 1.2], ['Bb2', 2, 1.05],
          ['A2', 2, 1.05], ['D2', 2, 1.05],

          ['D2', 2, 1.05], ['C2', 2, 1.05],
          ['Bb1', 2, 1.05], ['A1', 2, 1.05],
          ['Bb1', 2, 1.05], ['A1', 2, 1.05],
          [['D2', 'A2', 'D3'], 4, 1.05]
        ]
      }
    ]);

    // 8. Clark
    const clark = buildFromTracks('builtin_clark', 'Clark', 62, [
      {
        hand: 'right',
        velocity: 0.7,
        steps: [
          ['C#5', 2, 1.1], ['B4', 1, 1.1], ['A4', 1, 1.1],
          ['F#4', 2, 1.1], ['A4', 2, 1.1],
          ['E4', 2, 1.1], ['C#4', 1, 1.1], ['B3', 1, 1.1],
          ['A3', 4, 1.05],

          ['E4', 1.5, 1.1], ['F#4', 0.5, 1.0], ['A4', 2, 1.1],
          ['C#5', 1.5, 1.1], ['B4', 0.5, 1.0], ['A4', 2, 1.1],
          ['F#4', 1.5, 1.1], ['E4', 0.5, 1.0], ['C#4', 1, 1.1], ['B3', 1, 1.1],
          [['A3', 'C#4', 'E4'], 4, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.56,
        steps: [
          [['A2', 'E3', 'C#4'], 4, 1.05],
          [['D2', 'A2', 'F#3'], 4, 1.05],
          [['F#2', 'C#3', 'A3'], 4, 1.05],
          [['E2', 'B2', 'G#3'], 4, 1.05],

          [['D2', 'A2', 'F#3'], 4, 1.05],
          [['A2', 'E3', 'C#4'], 4, 1.05],
          [['B2', 'F#3', 'D4'], 2, 1.05], [['E2', 'B2', 'G#3'], 2, 1.05],
          [['A2', 'E3'], 4, 1.05]
        ]
      }
    ]);

    // 9. Aria Math
    const ariaMath = buildFromTracks('builtin_aria_math', 'Aria Math', 108, [
      {
        hand: 'right',
        velocity: 0.8,
        steps: [
          ['C5', 0.5], ['G4', 0.5], ['Eb5', 0.5], ['D5', 0.5], ['C5', 0.5], ['G4', 0.5], ['Bb4', 0.5], ['G4', 0.5],
          ['Ab4', 0.5], ['Eb4', 0.5], ['C5', 0.5], ['Bb4', 0.5], ['Ab4', 0.5], ['Eb4', 0.5], ['G4', 0.5], ['Eb4', 0.5],
          ['F4', 0.5], ['C4', 0.5], ['Ab4', 0.5], ['G4', 0.5], ['F4', 0.5], ['C4', 0.5], ['G4', 0.5], ['F4', 0.5],
          ['G4', 0.5], ['D4', 0.5], ['Bb4', 0.5], ['A4', 0.5], ['G4', 0.5], ['D4', 0.5], ['B4', 0.5], ['D5', 0.5],

          ['C5', 0.5], ['G4', 0.5], ['Eb5', 0.5], ['F5', 0.5], ['Eb5', 0.5], ['D5', 0.5], ['C5', 0.5], ['G4', 0.5],
          ['Ab4', 0.5], ['Eb4', 0.5], ['C5', 0.5], ['D5', 0.5], ['C5', 0.5], ['Bb4', 0.5], ['Ab4', 0.5], ['Eb4', 0.5],
          ['F4', 0.5], ['C4', 0.5], ['Ab4', 0.5], ['Bb4', 0.5], ['C5', 0.5], ['Bb4', 0.5], ['Ab4', 0.5], ['F4', 0.5],
          ['G4', 0.5], ['D4', 0.5], ['B4', 0.5], ['D5', 0.5], ['G5', 1.0], ['F5', 0.5], ['D5', 0.5],

          ['Eb5', 0.5], ['C5', 0.5], ['G4', 0.5], ['C5', 0.5], ['Eb5', 0.5], ['D5', 0.5], ['C5', 0.5], ['Bb4', 0.5],
          ['Ab4', 0.5], ['C5', 0.5], ['Eb5', 0.5], ['C5', 0.5], ['Bb4', 0.5], ['Ab4', 0.5], ['G4', 0.5], ['Eb4', 0.5],
          ['F4', 0.5], ['Ab4', 0.5], ['C5', 0.5], ['Ab4', 0.5], ['G4', 0.5], ['B4', 0.5], ['D5', 0.5], ['B4', 0.5],
          [['C5', 'Eb5', 'G5'], 4.0, 1.0]
        ]
      },
      {
        hand: 'left',
        velocity: 0.66,
        steps: [
          ['C2', 1], ['C3', 1], ['G2', 1], ['C3', 1],
          ['Ab1', 1], ['Ab2', 1], ['Eb2', 1], ['Ab2', 1],
          ['F1', 1], ['F2', 1], ['C2', 1], ['F2', 1],
          ['G1', 1], ['G2', 1], ['D2', 1], ['G2', 1],

          ['C2', 1], ['G2', 1], ['C3', 1], ['G2', 1],
          ['Ab1', 1], ['Eb2', 1], ['Ab2', 1], ['Eb2', 1],
          ['F1', 1], ['C2', 1], ['F2', 1], ['C2', 1],
          ['G1', 1], ['D2', 1], ['G2', 1], ['D2', 1],

          ['C2', 1], ['G2', 1], ['Eb3', 1], ['G2', 1],
          ['Ab1', 1], ['Eb2', 1], ['C3', 1], ['Eb2', 1],
          ['F1', 1], ['C2', 1], ['G1', 1], ['D2', 1],
          [['C2', 'G2', 'C3'], 4.0, 1.0]
        ]
      }
    ]);

    // 10. Danny (Minecraft)
    const danny = buildFromTracks('builtin_danny', 'Danny', 66, [
      {
        hand: 'right',
        velocity: 0.7,
        steps: [
          ['F#4', 2, 1.1], ['E4', 2, 1.1],
          ['D4', 2, 1.1], ['C#4', 2, 1.1],
          ['B3', 2, 1.1], ['C#4', 1, 1.1], ['D4', 1, 1.1],
          ['E4', 4, 1.05],

          ['A4', 2, 1.1], ['F#4', 1, 1.1], ['E4', 1, 1.1],
          ['D4', 2, 1.1], ['E4', 2, 1.1],
          ['F#4', 1.5, 1.1], ['E4', 0.5, 1.0], ['D4', 1, 1.1], ['C#4', 1, 1.1],
          [['B3', 'D4'], 4, 1.05],

          ['E4', 1, 1.1], ['F#4', 1, 1.1], ['A4', 2, 1.1],
          ['G4', 1, 1.1], ['F#4', 1, 1.1], ['E4', 2, 1.1],
          ['D4', 2, 1.1], ['C#4', 2, 1.1],
          [['D4', 'F#4', 'A4'], 4, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.56,
        steps: [
          [['D2', 'A2'], 4, 1.05],
          [['B1', 'F#2'], 4, 1.05],
          [['G2', 'D3'], 4, 1.05],
          [['A2', 'E3'], 4, 1.05],

          [['D2', 'A2', 'D3'], 4, 1.05],
          [['G2', 'D3'], 4, 1.05],
          [['B1', 'F#2', 'B2'], 4, 1.05],
          [['G2', 'D3'], 4, 1.05],

          ['D2', 2, 1.1], ['A2', 2, 1.1],
          ['G2', 2, 1.1], ['A2', 2, 1.1],
          ['B1', 2, 1.1], ['A1', 2, 1.1],
          [['D2', 'A2'], 4, 1.05]
        ]
      }
    ]);

    // 11. Key (Minecraft)
    const keyTrack = buildFromTracks('builtin_key', 'Key', 60, [
      {
        hand: 'right',
        velocity: 0.68,
        steps: [
          ['A4', 2, 1.15], ['E4', 2, 1.15],
          ['F#4', 2, 1.15], ['C#4', 2, 1.15],
          ['D4', 2, 1.15], ['E4', 2, 1.15],
          ['C#4', 4, 1.1],

          ['B4', 2, 1.15], ['A4', 1, 1.1], ['F#4', 1, 1.1],
          ['E4', 2, 1.15], ['D4', 2, 1.15],
          ['C#4', 2, 1.15], ['B3', 2, 1.15],
          [['A3', 'E4'], 4, 1.1]
        ]
      },
      {
        hand: 'left',
        velocity: 0.54,
        steps: [
          [['A2', 'E3'], 4, 1.1],
          [['F#2', 'C#3'], 4, 1.1],
          [['D2', 'A2'], 4, 1.1],
          [['A2', 'E3'], 4, 1.1],

          [['D2', 'A2'], 4, 1.1],
          [['E2', 'B2'], 4, 1.1],
          [['F#2', 'C#3'], 2, 1.1], [['E2', 'B2'], 2, 1.1],
          [['A2', 'E3'], 4, 1.1]
        ]
      }
    ]);

    // 12. Moog City (Minecraft)
    const moogCity = buildFromTracks('builtin_moog_city', 'Moog City', 110, [
      {
        hand: 'right',
        velocity: 0.8,
        steps: [
          ['E5', 1], ['D5', 1], ['C5', 1], ['G4', 1],
          ['A4', 1], ['C5', 1], ['D5', 1], ['E5', 1],
          ['F5', 1.5], ['E5', 0.5], ['D5', 1], ['C5', 1],
          ['B4', 1], ['C5', 1], ['D5', 2],

          ['E5', 1], ['G5', 1], ['F5', 1], ['E5', 1],
          ['D5', 1], ['C5', 1], ['A4', 2],
          ['G4', 0.5], ['A4', 0.5], ['C5', 1], ['D5', 1], ['E5', 1],
          ['D5', 2], ['C5', 2],

          ['C5', 0.5], ['E5', 0.5], ['G5', 1], ['E5', 0.5], ['D5', 0.5], ['C5', 1],
          ['A4', 0.5], ['C5', 0.5], ['E5', 1], ['D5', 0.5], ['C5', 0.5], ['A4', 1],
          ['F4', 0.5], ['A4', 0.5], ['C5', 1], ['G4', 0.5], ['B4', 0.5], ['D5', 1],
          [['C5', 'E5', 'G5'], 4, 1.0]
        ]
      },
      {
        hand: 'left',
        velocity: 0.66,
        steps: [
          ['C2', 1], ['G2', 1], ['C3', 1], ['G2', 1],
          ['A1', 1], ['E2', 1], ['A2', 1], ['E2', 1],
          ['F1', 1], ['C2', 1], ['F2', 1], ['C2', 1],
          ['G1', 1], ['D2', 1], ['G2', 1], ['D2', 1],

          ['C2', 1], ['G2', 1], ['C3', 1], ['G2', 1],
          ['A1', 1], ['E2', 1], ['A2', 1], ['E2', 1],
          ['F1', 1], ['C2', 1], ['G1', 1], ['D2', 1],
          ['C2', 1], ['G2', 1], ['C3', 2],

          ['C2', 1], ['G2', 1], ['C3', 1], ['G2', 1],
          ['A1', 1], ['E2', 1], ['A2', 1], ['E2', 1],
          ['F1', 1], ['C2', 1], ['G1', 1], ['D2', 1],
          [['C2', 'G2', 'C3'], 4, 1.0]
        ]
      }
    ]);

    // 13. River Flows in You
    const riverFlows = buildFromTracks('builtin_river_flows', 'River Flows in You', 78, [
      {
        hand: 'right',
        velocity: 0.78,
        steps: [
          ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['E5', 0.5], ['A5', 0.5], ['D5', 0.5],
          ['C#5', 2.0], [null, 0.5], ['A4', 0.5], ['C#5', 0.5], ['E5', 0.5],
          ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['E5', 0.5], ['A5', 0.5], ['D5', 0.5],
          ['C#5', 2.0], [null, 0.5], ['E5', 0.5], ['A5', 0.5], ['B5', 0.5],

          ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['B5', 0.5], ['C#6', 0.5], ['B5', 0.5], ['A5', 0.5], ['G#5', 0.5],
          ['A5', 1.0], ['E5', 0.5], ['C#5', 0.5], ['D5', 1.0], ['E5', 1.0],
          ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['E5', 0.5], ['D5', 0.5], ['C#5', 0.5],
          ['B4', 1.5], ['C#5', 0.5], ['A4', 2.0],

          ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['G#5', 0.5], ['A5', 0.5], ['E5', 0.5], ['A5', 0.5], ['D5', 0.5],
          ['C#5', 1.0], ['B4', 0.5], ['A4', 0.5], ['E4', 1.0], ['A4', 1.0],
          ['D5', 0.5], ['C#5', 0.5], ['B4', 0.5], ['A4', 0.5], ['B4', 1.0], ['G#4', 1.0],
          [['A4', 'C#5', 'E5'], 4.0, 1.02]
        ]
      },
      {
        hand: 'left',
        velocity: 0.62,
        steps: [
          ['F#2', 0.5, 1.3], ['C#3', 0.5, 1.3], ['F#3', 1, 1.1], ['D2', 0.5, 1.3], ['A2', 0.5, 1.3], ['D3', 1, 1.1],
          ['A2', 0.5, 1.3], ['E3', 0.5, 1.3], ['A3', 1, 1.1], ['E2', 0.5, 1.3], ['B2', 0.5, 1.3], ['E3', 1, 1.1],
          ['F#2', 0.5, 1.3], ['C#3', 0.5, 1.3], ['F#3', 1, 1.1], ['D2', 0.5, 1.3], ['A2', 0.5, 1.3], ['D3', 1, 1.1],
          ['A2', 0.5, 1.3], ['E3', 0.5, 1.3], ['A3', 1, 1.1], ['E2', 0.5, 1.3], ['B2', 0.5, 1.3], ['E3', 1, 1.1],

          ['F#2', 0.5, 1.3], ['C#3', 0.5, 1.3], ['A3', 1, 1.1], ['D2', 0.5, 1.3], ['A2', 0.5, 1.3], ['F#3', 1, 1.1],
          ['A2', 0.5, 1.3], ['E3', 0.5, 1.3], ['C#4', 1, 1.1], ['E2', 0.5, 1.3], ['B2', 0.5, 1.3], ['G#3', 1, 1.1],
          ['F#2', 0.5, 1.3], ['C#3', 0.5, 1.3], ['A3', 1, 1.1], ['D2', 0.5, 1.3], ['A2', 0.5, 1.3], ['F#3', 1, 1.1],
          ['E2', 1, 1.2], ['B2', 1, 1.2], ['A2', 2, 1.05],

          ['F#2', 0.5, 1.3], ['C#3', 0.5, 1.3], ['F#3', 1, 1.1], ['D2', 0.5, 1.3], ['A2', 0.5, 1.3], ['D3', 1, 1.1],
          ['A2', 0.5, 1.3], ['E3', 0.5, 1.3], ['A3', 2, 1.05],
          ['D2', 1, 1.2], ['A2', 1, 1.2], ['E2', 1, 1.2], ['B2', 1, 1.2],
          [['A2', 'E3', 'A3'], 4, 1.02]
        ]
      }
    ]);

    // 14. Interstellar (Cornfield Chase)
    const interstellar = buildFromTracks('builtin_interstellar', 'Interstellar', 108, [
      {
        hand: 'right',
        velocity: 0.78,
        steps: [
          ['A4', 0.5], ['E5', 0.5], ['A4', 0.5], ['E5', 0.5], ['A4', 0.5], ['E5', 0.5],
          ['B4', 0.5], ['E5', 0.5], ['B4', 0.5], ['E5', 0.5], ['B4', 0.5], ['E5', 0.5],
          ['C5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5],
          ['D5', 0.5], ['E5', 0.5], ['D5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5],

          ['A4', 0.5], ['E5', 0.5], ['A5', 0.5], ['E5', 0.5], ['A4', 0.5], ['E5', 0.5],
          ['B4', 0.5], ['E5', 0.5], ['G5', 0.5], ['E5', 0.5], ['B4', 0.5], ['E5', 0.5],
          ['C5', 0.5], ['E5', 0.5], ['A5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5],
          ['D5', 0.5], ['E5', 0.5], ['B5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5],

          [['A4', 'C5', 'E5'], 1.5], [['A4', 'C5', 'E5'], 1.5],
          [['G4', 'B4', 'E5'], 1.5], [['G4', 'B4', 'E5'], 1.5],
          [['A4', 'C5', 'F5'], 1.5], [['A4', 'C5', 'E5'], 1.5],
          [['G4', 'B4', 'D5'], 1.5], [['A4', 'C5', 'E5'], 3.0]
        ]
      },
      {
        hand: 'left',
        velocity: 0.68,
        steps: [
          ['F2', 3, 1.05],
          ['G2', 3, 1.05],
          ['A2', 3, 1.05],
          ['G2', 3, 1.05],

          [['F2', 'F3'], 3, 1.02],
          [['G2', 'G3'], 3, 1.02],
          [['A2', 'A3'], 3, 1.02],
          [['E2', 'E3'], 3, 1.02],

          [['F2', 'C3', 'F3'], 3, 1.02],
          [['E2', 'B2', 'E3'], 3, 1.02],
          [['D2', 'A2', 'D3'], 3, 1.02],
          [['E2', 'B2'], 1.5, 1.0], [['A1', 'E2', 'A2'], 3.0, 1.02]
        ]
      }
    ], 3);

    // 15. Gymnopedie No 1 (Satie)
    const gymnopedie = buildFromTracks('builtin_gymnopedie', 'Gymnopedie No 1', 72, [
      {
        hand: 'right',
        velocity: 0.72,
        steps: [
          [null, 3], [null, 3],
          [null, 3], [null, 3],
          [null, 1], ['F#5', 1, 1.1], ['A5', 1, 1.1],
          ['G5', 1, 1.1], ['F#5', 1, 1.1], ['C#5', 1, 1.1],
          ['B4', 1, 1.1], ['C#5', 1, 1.1], ['D5', 1, 1.1],
          ['A4', 3, 1.05],
          ['F#4', 3, 1.05],
          ['F#4', 3, 1.05],
          ['F#4', 3, 1.05],
          ['F#4', 3, 1.05],

          [null, 1], ['F#5', 1, 1.1], ['A5', 1, 1.1],
          ['G5', 1, 1.1], ['F#5', 1, 1.1], ['C#5', 1, 1.1],
          ['B4', 1, 1.1], ['C#5', 1, 1.1], ['D5', 1, 1.1],
          ['A4', 3, 1.05],
          ['C#5', 3, 1.05],
          ['F#5', 3, 1.05],
          ['E4', 3, 1.05],
          [['F#4', 'A4', 'D5'], 3, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.56,
        steps: [
          ['G2', 1, 1.2], [['B3', 'D4', 'F#4'], 2, 1.0],
          ['D2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['G2', 1, 1.2], [['B3', 'D4', 'F#4'], 2, 1.0],
          ['D2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],

          ['G2', 1, 1.2], [['B3', 'D4', 'F#4'], 2, 1.0],
          ['D2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['G2', 1, 1.2], [['B3', 'D4', 'F#4'], 2, 1.0],
          ['D2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['F#2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['B1', 1, 1.2], [['F#3', 'B3', 'D4'], 2, 1.0],
          ['E2', 1, 1.2], [['G3', 'B3', 'E4'], 2, 1.0],
          ['A2', 1, 1.2], [['E3', 'A3', 'C#4'], 2, 1.0],

          ['G2', 1, 1.2], [['B3', 'D4', 'F#4'], 2, 1.0],
          ['D2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['G2', 1, 1.2], [['B3', 'D4', 'F#4'], 2, 1.0],
          ['D2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['F#2', 1, 1.2], [['A3', 'C#4', 'F#4'], 2, 1.0],
          ['B1', 1, 1.2], [['F#3', 'B3', 'D4'], 2, 1.0],
          ['E2', 1, 1.2], [['G3', 'B3', 'D4'], 2, 1.0],
          [['D2', 'A2', 'D3'], 3, 1.05]
        ]
      }
    ], 3);

    // 16. Clair de Lune (opening)
    const clairDeLune = buildFromTracks('builtin_clair', 'Clair de Lune', 64, [
      {
        hand: 'right',
        velocity: 0.68,
        steps: [
          [null, 1], [['F5', 'Ab5'], 2, 1.05], [['Db5', 'F5'], 1.5, 1.05],
          [['C5', 'Eb5'], 0.5, 1.0], [['Db5', 'F5'], 0.5, 1.0], [['C5', 'Eb5'], 2.5, 1.05], [null, 1],
          [['Bb4', 'Db5'], 0.5, 1.0], [['C5', 'Eb5'], 0.5, 1.0], [['Bb4', 'Db5'], 2.0, 1.05], [['Ab4', 'C5'], 1.5, 1.05],
          [['Gb4', 'Bb4'], 0.5, 1.0], [['Ab4', 'C5'], 0.5, 1.0], [['Gb4', 'Bb4'], 2.5, 1.05], [null, 1],

          [['F4', 'Ab4'], 1.5, 1.05], [['Gb4', 'Bb4'], 1.5, 1.05], [['F4', 'Ab4'], 1.5, 1.05],
          [['Eb4', 'Gb4'], 1.5, 1.05], [['F4', 'Ab4'], 1.5, 1.05], [['Eb4', 'Gb4'], 1.5, 1.05],
          [['Db4', 'F4'], 3.0, 1.05], [['C4', 'Eb4'], 1.5, 1.05],
          [['Db4', 'F4', 'Ab4'], 4.5, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.54,
        steps: [
          [['Db3', 'F3'], 4.5, 1.05],
          [['C3', 'Eb3'], 4.5, 1.05],
          [['Bb2', 'Db3'], 4.5, 1.05],
          [['Gb2', 'Bb2'], 4.5, 1.05],

          [['F2', 'Ab2'], 4.5, 1.05],
          [['Eb2', 'Gb2'], 4.5, 1.05],
          [['Ab2', 'Eb3'], 4.5, 1.05],
          [['Db2', 'Ab2', 'Db3'], 4.5, 1.05]
        ]
      }
    ]);

    // 17. Comptine d'un autre ete (Amelie)
    const amelie = buildFromTracks('builtin_amelie', 'Comptine d un autre ete', 100, [
      {
        hand: 'right',
        velocity: 0.78,
        steps: [
          ['F#4', 0.5], ['G4', 0.5], ['F#4', 1.5], ['E4', 0.5], ['B4', 1.0],
          ['F#4', 0.5], ['G4', 0.5], ['F#4', 1.5], ['D4', 0.5], ['B4', 1.0],
          ['E4', 0.5], ['F#4', 0.5], ['E4', 1.5], ['D4', 0.5], ['G4', 1.0],
          ['F#4', 1.0], ['D4', 1.0], ['B3', 2.0],

          ['B4', 0.5], ['C5', 0.5], ['B4', 1.5], ['G4', 0.5], ['E5', 1.0],
          ['B4', 0.5], ['C5', 0.5], ['B4', 1.5], ['G4', 0.5], ['D5', 1.0],
          ['A4', 0.5], ['B4', 0.5], ['A4', 1.5], ['F#4', 0.5], ['D5', 1.0],
          ['B4', 2.0], ['E5', 2.0],

          ['F#5', 0.5], ['G5', 0.5], ['F#5', 1.0], ['E5', 1.0], ['B4', 1.0],
          ['D5', 0.5], ['E5', 0.5], ['D5', 1.0], ['B4', 1.0], ['G4', 1.0],
          ['A4', 0.5], ['B4', 0.5], ['A4', 1.0], ['F#4', 1.0], ['D4', 1.0],
          [['E4', 'G4', 'B4'], 4.0, 1.02]
        ]
      },
      {
        hand: 'left',
        velocity: 0.62,
        steps: [
          ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5], ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5],
          ['G2', 0.5], ['D3', 0.5], ['B3', 0.5], ['D3', 0.5], ['G2', 0.5], ['D3', 0.5], ['B3', 0.5], ['D3', 0.5],
          ['D2', 0.5], ['A2', 0.5], ['F#3', 0.5], ['A2', 0.5], ['D2', 0.5], ['A2', 0.5], ['F#3', 0.5], ['A2', 0.5],
          ['B1', 0.5], ['F#2', 0.5], ['D3', 0.5], ['F#2', 0.5], ['B1', 0.5], ['F#2', 0.5], ['D3', 0.5], ['F#2', 0.5],

          ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5], ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5],
          ['G2', 0.5], ['D3', 0.5], ['B3', 0.5], ['D3', 0.5], ['G2', 0.5], ['D3', 0.5], ['B3', 0.5], ['D3', 0.5],
          ['D2', 0.5], ['A2', 0.5], ['F#3', 0.5], ['A2', 0.5], ['D2', 0.5], ['A2', 0.5], ['F#3', 0.5], ['A2', 0.5],
          ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5], ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5],

          ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5], ['E2', 0.5], ['B2', 0.5], ['G3', 0.5], ['B2', 0.5],
          ['G2', 0.5], ['D3', 0.5], ['B3', 0.5], ['D3', 0.5], ['G2', 0.5], ['D3', 0.5], ['B3', 0.5], ['D3', 0.5],
          ['D2', 0.5], ['A2', 0.5], ['F#3', 0.5], ['A2', 0.5], ['B1', 0.5], ['F#2', 0.5], ['D3', 0.5], ['F#2', 0.5],
          [['E2', 'B2', 'E3'], 4.0, 1.02]
        ]
      }
    ]);

    // 18. Merry Go Round of Life (Howl's Moving Castle)
    const merryGoRound = buildFromTracks('builtin_merry_go_round', 'Merry Go Round of Life', 120, [
      {
        hand: 'right',
        velocity: 0.8,
        steps: [
          ['D4', 1], ['G4', 1], ['Bb4', 1],
          ['D5', 2], ['C5', 1],
          ['Bb4', 1], ['A4', 1], ['G4', 1],
          ['A4', 3],

          ['D4', 1], ['A4', 1], ['C5', 1],
          ['F#5', 2], ['E5', 1],
          ['D5', 1], ['C5', 1], ['A4', 1],
          ['Bb4', 3],

          ['G4', 1], ['Bb4', 1], ['D5', 1],
          ['G5', 2], ['F5', 1],
          ['Eb5', 1], ['D5', 1], ['C5', 1],
          ['D5', 2], ['C5', 1],
          ['Bb4', 1], ['A4', 1], ['G4', 1],
          ['A4', 2], ['F#4', 1],
          [['G4', 'Bb4', 'D5'], 3, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.64,
        steps: [
          ['G2', 1], [['Bb3', 'D4'], 1], [['Bb3', 'D4'], 1],
          ['G2', 1], [['Bb3', 'D4'], 1], [['Bb3', 'D4'], 1],
          ['C3', 1], [['Eb3', 'G3'], 1], [['Eb3', 'G3'], 1],
          ['D2', 1], [['A3', 'C4'], 1], [['A3', 'C4'], 1],

          ['D2', 1], [['A3', 'C4'], 1], [['A3', 'C4'], 1],
          ['D2', 1], [['F#3', 'C4'], 1], [['F#3', 'C4'], 1],
          ['D2', 1], [['F#3', 'A3'], 1], [['F#3', 'A3'], 1],
          ['G2', 1], [['Bb3', 'D4'], 1], [['Bb3', 'D4'], 1],

          ['G2', 1], [['Bb3', 'D4'], 1], [['Bb3', 'D4'], 1],
          ['C3', 1], [['Eb3', 'G3'], 1], [['Eb3', 'G3'], 1],
          ['C3', 1], [['Eb3', 'G3'], 1], [['Eb3', 'G3'], 1],
          ['G2', 1], [['Bb3', 'D4'], 1], [['Bb3', 'D4'], 1],
          ['Eb2', 1], [['G3', 'Bb3'], 1], [['G3', 'Bb3'], 1],
          ['D2', 1], [['F#3', 'C4'], 1], [['F#3', 'C4'], 1],
          [['G2', 'D3', 'G3'], 3, 1.05]
        ]
      }
    ], 3);

    // 19. Zelda's Lullaby
    const zelda = buildFromTracks('builtin_zelda', 'Zeldas Lullaby', 92, [
      {
        hand: 'right',
        velocity: 0.78,
        steps: [
          ['B4', 2], ['D5', 1],
          ['A4', 2], ['G4', 0.5], ['A4', 0.5],
          ['B4', 2], ['D5', 1],
          ['A4', 3],

          ['B4', 2], ['D5', 1],
          ['A5', 2], ['G5', 1],
          ['D5', 2], ['C5', 0.5], ['B4', 0.5],
          ['A4', 3],

          ['B4', 2], ['D5', 1],
          ['A4', 2], ['G4', 0.5], ['A4', 0.5],
          ['B4', 2], ['D5', 1],
          ['A4', 3],

          ['B4', 2], ['D5', 1],
          ['A5', 2], ['G5', 1],
          ['D5', 3],
          [['G4', 'B4', 'D5'], 3, 1.05]
        ]
      },
      {
        hand: 'left',
        velocity: 0.6,
        steps: [
          ['C3', 1], ['G3', 1], ['E4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],
          ['C3', 1], ['G3', 1], ['E4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],

          ['C3', 1], ['G3', 1], ['E4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],
          ['E3', 1], ['B3', 1], ['G4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],

          ['C3', 1], ['G3', 1], ['E4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],
          ['C3', 1], ['G3', 1], ['E4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],

          ['C3', 1], ['G3', 1], ['E4', 1],
          ['D3', 1], ['A3', 1], ['F#4', 1],
          ['G2', 1], ['D3', 1], ['B3', 1],
          [['G2', 'D3', 'G3'], 3, 1.05]
        ]
      }
    ], 3);

    // 20. Still D.R.E.
    const stillDre = buildFromTracks('builtin_still_dre', 'Still D.R.E.', 94, [
      {
        hand: 'right',
        velocity: 0.84,
        steps: [
          ...Array(8).fill([['C5', 'E5', 'A5'], 0.5, 0.45]),
          ...Array(3).fill([['B4', 'E5', 'A5'], 0.5, 0.45]),
          ...Array(5).fill([['B4', 'E5', 'G5'], 0.5, 0.45]),
          ...Array(8).fill([['C5', 'E5', 'A5'], 0.5, 0.45]),
          ...Array(3).fill([['B4', 'E5', 'A5'], 0.5, 0.45]),
          ...Array(5).fill([['B4', 'E5', 'G5'], 0.5, 0.45]),
          ...Array(8).fill([['C5', 'E5', 'A5'], 0.5, 0.45]),
          ...Array(3).fill([['B4', 'E5', 'A5'], 0.5, 0.45]),
          ...Array(5).fill([['B4', 'E5', 'G5'], 0.5, 0.45]),
          [['C5', 'E5', 'A5'], 2.0, 0.9]
        ]
      },
      {
        hand: 'left',
        velocity: 0.72,
        steps: [
          ['A1', 1], [null, 1], ['A1', 0.5], ['A1', 1.5],
          ['E2', 1], [null, 1], ['E2', 0.5], ['G2', 1.5],
          ['A1', 1], [null, 1], ['A1', 0.5], ['A1', 1.5],
          ['E2', 1], [null, 1], ['E2', 0.5], ['G2', 1.5],
          ['A1', 1], [null, 1], ['A1', 0.5], ['A1', 1.5],
          ['E2', 1], [null, 1], ['E2', 0.5], ['G2', 1.5],
          [['A1', 'A2'], 2.0, 0.95]
        ]
      }
    ]);

    // 21. Fur Elise
    const furElise = buildFromTracks('builtin_fur_elise', 'Fur Elise', 132, [
      {
        hand: 'right',
        velocity: 0.82,
        steps: [
          ['E5', 0.5], ['D#5', 0.5],
          ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5],
          ['A4', 1.0], [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5],
          ['B4', 1.0], [null, 0.5], ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5],
          ['C5', 1.0], [null, 0.5], ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5],
          ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5],
          ['A4', 1.0], [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5],
          ['B4', 1.0], [null, 0.5], ['E4', 0.5], ['C5', 0.5], ['B4', 0.5],
          ['A4', 1.0], [null, 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 0.5],

          ['E5', 1.5], ['G4', 0.5], ['F5', 0.5], ['E5', 0.5],
          ['D5', 1.5], ['F4', 0.5], ['E5', 0.5], ['D5', 0.5],
          ['C5', 1.5], ['E4', 0.5], ['D5', 0.5], ['C5', 0.5],
          ['B4', 1.0], [null, 0.5], ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5],

          ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5],
          ['A4', 1.0], [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5],
          ['B4', 1.0], [null, 0.5], ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5],
          ['C5', 1.0], [null, 0.5], ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5],
          ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5],
          ['A4', 1.0], [null, 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5],
          ['B4', 1.0], [null, 0.5], ['E4', 0.5], ['C5', 0.5], ['B4', 0.5],
          ['A4', 2.0]
        ]
      },
      {
        hand: 'left',
        velocity: 0.64,
        steps: [
          [null, 1.0],
          [null, 3.0],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          ['E2', 0.5], ['E3', 0.5], ['G#3', 0.5], [null, 1.5],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          [null, 3.0],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          ['E2', 0.5], ['E3', 0.5], ['G#3', 0.5], [null, 1.5],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],

          ['C3', 0.5], ['G3', 0.5], ['C4', 0.5], [null, 1.5],
          ['G2', 0.5], ['G3', 0.5], ['B3', 0.5], [null, 1.5],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          ['E2', 0.5], ['E3', 0.5], ['E3', 0.5], [null, 1.5],

          [null, 3.0],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          ['E2', 0.5], ['E3', 0.5], ['G#3', 0.5], [null, 1.5],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          [null, 3.0],
          ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], [null, 1.5],
          ['E2', 0.5], ['E3', 0.5], ['G#3', 0.5], [null, 1.5],
          [['A2', 'E3', 'A3'], 2.0]
        ]
      }
    ], 3);

    // 22. Moonlight Sonata
    const t = 1 / 3;
    const trip = (a, b, c, count) => {
      const out = [];
      for (let i = 0; i < count; i++) out.push([a, t, 1.25], [b, t, 1.25], [c, t, 1.25]);
      return out;
    };
    const moonlight = buildFromTracks('builtin_moonlight', 'Moonlight Sonata', 58, [
      {
        hand: 'right',
        velocity: 0.68,
        steps: [
          ...trip('G#3', 'C#4', 'E4', 4),
          ...trip('G#3', 'C#4', 'E4', 4),
          ...trip('A3', 'C#4', 'E4', 2), ...trip('A3', 'D4', 'F#4', 2),
          ...trip('G#3', 'C4', 'F#4', 1), ...trip('G#3', 'C#4', 'E4', 1), ...trip('G#3', 'C#4', 'D#4', 1), ...trip('F#3', 'C4', 'D#4', 1),
          ...trip('G#3', 'C#4', 'E4', 3), ['G#3', t, 1.2], ['C#4', t, 1.2], [['E4', 'G#4'], t, 1.0],
          [['G#3', 'G#4'], t, 1.2], ['D#4', t, 1.2], ['F#4', t, 1.2],
          ...trip('G#3', 'D#4', 'F#4', 2), ['G#3', t, 1.2], ['D#4', t, 1.2], [['F#4', 'G#4'], t, 1.0],
          [['G#3', 'G#4'], t, 1.2], ['C#4', t, 1.2], ['E4', t, 1.2],
          ...trip('G#3', 'C#4', 'E4', 1),
          [['A3', 'A4'], t, 1.2], ['C#4', t, 1.2], ['E4', t, 1.2],
          ...trip('A3', 'C#4', 'E4', 1),
          [['G#3', 'G#4'], t, 1.2], ['C#4', t, 1.2], ['E4', t, 1.2],
          [['G#3', 'F#4'], t, 1.2], ['C4', t, 1.2], ['D#4', t, 1.2],
          [['G#3', 'E4'], 2.5, 1.0]
        ]
      },
      {
        hand: 'left',
        velocity: 0.62,
        steps: [
          [['C#2', 'C#3'], 4, 0.98],
          [['B1', 'B2'], 4, 0.98],
          [['A1', 'A2'], 2, 0.98], [['F#1', 'F#2'], 2, 0.98],
          [['G#1', 'G#2'], 2, 0.98], [['G#1', 'G#2'], 2, 0.98],
          [['C#2', 'C#3'], 4, 0.98],
          [['C2', 'C3'], 4, 0.98],
          [['C#2', 'C#3'], 2, 0.98], [['A1', 'A2'], 2, 0.98],
          [['G#1', 'G#2'], 2, 0.98],
          [['C#2', 'C#3'], 2.5, 1.0]
        ]
      }
    ]);

    // 23. Canon in D
    const canon = buildFromTracks('builtin_canon', 'Canon in D', 92, [
      {
        hand: 'right',
        velocity: 0.8,
        steps: [
          ['F#5', 2], ['E5', 2],
          ['D5', 2], ['C#5', 2],
          ['B4', 2], ['A4', 2],
          ['B4', 2], ['C#5', 2],

          ['D5', 1], ['F#5', 1], ['A5', 1], ['G5', 1],
          ['F#5', 1], ['D5', 1], ['F#5', 1], ['E5', 1],
          ['D5', 1], ['B4', 1], ['D5', 1], ['A5', 1],
          ['G5', 1], ['B5', 1], ['A5', 1], ['G5', 1],

          ['F#5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['F#4', 0.5], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 0.5],
          ['D4', 0.5], ['E4', 0.5], ['F#4', 0.5], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5],
          ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 0.5], ['E4', 0.5], ['F#4', 0.5], ['D4', 0.5], ['E4', 0.5],
          ['G4', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 0.5], ['E4', 0.5],
          [['D4', 'F#4', 'A4', 'D5'], 3.0]
        ]
      },
      {
        hand: 'left',
        velocity: 0.65,
        steps: [
          ['D3', 1], ['A3', 1], ['A2', 1], ['E3', 1],
          ['B2', 1], ['F#3', 1], ['F#2', 1], ['C#3', 1],
          ['G2', 1], ['D3', 1], ['D2', 1], ['A2', 1],
          ['G2', 1], ['D3', 1], ['A2', 1], ['E3', 1],

          ['D3', 1], ['A3', 1], ['A2', 1], ['E3', 1],
          ['B2', 1], ['F#3', 1], ['F#2', 1], ['C#3', 1],
          ['G2', 1], ['D3', 1], ['D2', 1], ['A2', 1],
          ['G2', 1], ['D3', 1], ['A2', 1], ['E3', 1],

          ['D3', 1], ['A3', 1], ['A2', 1], ['E3', 1],
          ['B2', 1], ['F#3', 1], ['F#2', 1], ['C#3', 1],
          ['G2', 1], ['D3', 1], ['D2', 1], ['A2', 1],
          ['G2', 1], ['D3', 1], ['A2', 1], ['E3', 1],
          [['D2', 'A2', 'D3'], 3.0]
        ]
      }
    ]);

    // 24. Ode to Joy
    const odeToJoy = buildFromTracks('builtin_ode', 'Ode to Joy', 112, [
      {
        hand: 'right',
        velocity: 0.82,
        steps: [
          ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
          ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
          ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1],
          ['E4', 1.5], ['D4', 0.5], ['D4', 2],

          ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
          ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
          ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1],
          ['D4', 1.5], ['C4', 0.5], ['C4', 2],

          ['D4', 1], ['D4', 1], ['E4', 1], ['C4', 1],
          ['D4', 1], ['E4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1],
          ['D4', 1], ['E4', 0.5], ['F4', 0.5], ['E4', 1], ['D4', 1],
          ['C4', 1], ['D4', 1], ['G3', 2],

          ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1],
          ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1],
          ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1],
          ['D4', 1.5], ['C4', 0.5], ['C4', 2]
        ]
      },
      {
        hand: 'left',
        velocity: 0.64,
        steps: [
          ['C3', 2], ['G3', 2],
          ['G3', 2], ['B2', 2],
          ['C3', 2], ['E3', 2],
          ['G3', 2], ['G2', 2],

          ['C3', 2], ['G3', 2],
          ['G3', 2], ['B2', 2],
          ['C3', 2], ['G2', 2],
          ['C3', 4],

          ['G2', 2], ['C3', 2],
          ['G2', 2], ['C3', 2],
          ['G2', 2], ['B2', 2],
          ['A2', 1], ['D3', 1], ['G2', 2],

          ['C3', 2], ['G3', 2],
          ['G3', 2], ['B2', 2],
          ['C3', 2], ['G2', 2],
          [['C3', 'G3'], 4]
        ]
      }
    ]);

    // 25. Twinkle Twinkle
    const twinkle = buildFromTracks('builtin_twinkle', 'Twinkle Twinkle', 104, [
      {
        hand: 'right',
        velocity: 0.82,
        steps: [
          ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1],
          ['A4', 1], ['A4', 1], ['G4', 2],
          ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1],
          ['D4', 1], ['D4', 1], ['C4', 2],

          ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1],
          ['E4', 1], ['E4', 1], ['D4', 2],
          ['G4', 1], ['G4', 1], ['F4', 1], ['F4', 1],
          ['E4', 1], ['E4', 1], ['D4', 2],

          ['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1],
          ['A4', 1], ['A4', 1], ['G4', 2],
          ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1],
          ['D4', 1], ['D4', 1], ['C4', 2]
        ]
      },
      {
        hand: 'left',
        velocity: 0.62,
        steps: [
          ['C3', 2], ['E3', 2],
          ['F3', 2], ['E3', 2],
          ['D3', 2], ['C3', 2],
          ['G2', 2], ['C3', 2],

          ['E3', 2], ['D3', 2],
          ['C3', 2], ['G2', 2],
          ['E3', 2], ['D3', 2],
          ['C3', 2], ['G2', 2],

          ['C3', 2], ['E3', 2],
          ['F3', 2], ['E3', 2],
          ['D3', 2], ['C3', 2],
          ['G2', 2], ['C3', 2]
        ]
      }
    ]);

    // 26. C Major Scale
    const cScale = buildFromTracks('builtin_c_scale', 'C Major Scale', 100, [
      {
        hand: 'right',
        velocity: 0.8,
        steps: [
          ['C4', 0.75], ['D4', 0.75], ['E4', 0.75], ['F4', 0.75],
          ['G4', 0.75], ['A4', 0.75], ['B4', 0.75], ['C5', 0.75],
          ['D5', 0.75], ['E5', 0.75], ['F5', 0.75], ['G5', 0.75],
          ['A5', 0.75], ['B5', 0.75], ['C6', 1.2],
          ['B5', 0.75], ['A5', 0.75], ['G5', 0.75], ['F5', 0.75],
          ['E5', 0.75], ['D5', 0.75], ['C5', 0.75], ['B4', 0.75],
          ['A4', 0.75], ['G4', 0.75], ['F4', 0.75], ['E4', 0.75],
          ['D4', 0.75], ['C4', 1.5]
        ]
      },
      {
        hand: 'left',
        velocity: 0.72,
        steps: [
          ['C3', 0.75], ['D3', 0.75], ['E3', 0.75], ['F3', 0.75],
          ['G3', 0.75], ['A3', 0.75], ['B3', 0.75], ['C4', 0.75],
          ['D4', 0.75], ['E4', 0.75], ['F4', 0.75], ['G4', 0.75],
          ['A4', 0.75], ['B4', 0.75], ['C5', 1.2],
          ['B4', 0.75], ['A4', 0.75], ['G4', 0.75], ['F4', 0.75],
          ['E4', 0.75], ['D4', 0.75], ['C4', 0.75], ['B3', 0.75],
          ['A3', 0.75], ['G3', 0.75], ['F3', 0.75], ['E3', 0.75],
          ['D3', 0.75], ['C3', 1.5]
        ]
      }
    ]);

    return [
      amelia,
      sweden,
      wetHands,
      subwoofer,
      miceOnVenus,
      dryHands,
      haggstrom,
      livingMice,
      clark,
      ariaMath,
      danny,
      keyTrack,
      moogCity,
      riverFlows,
      interstellar,
      gymnopedie,
      clairDeLune,
      amelie,
      merryGoRound,
      zelda,
      stillDre,
      furElise,
      moonlight,
      canon,
      odeToJoy,
      twinkle,
      cScale
    ];
  }

  function loadCustomSongs() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveCustomSongs(customSongs) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(customSongs));
    } catch (_) {}
  }

  PianoApp.songs = {
    createBuiltInSongs,
    loadCustomSongs,
    saveCustomSongs
  };
})(window);
