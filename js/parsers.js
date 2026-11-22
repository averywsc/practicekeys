(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});

  const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteNameToMidi(str) {
    if (typeof str === 'number' && Number.isFinite(str)) {
      return Math.max(21, Math.min(108, Math.round(str)));
    }
    if (typeof str !== 'string') return null;
    const m = str.trim().match(/^([A-Ga-g])([#b♯♭]?)(-?\d)$/);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const acc = m[2];
    const oct = parseInt(m[3], 10);
    let semi = NOTE_BASE[letter];
    if (acc === '#' || acc === '♯') semi += 1;
    if (acc === 'b' || acc === '♭') semi -= 1;
    const midi = (oct + 1) * 12 + semi;
    return midi >= 21 && midi <= 108 ? midi : null;
  }

  function cleanSongName(filename, fallback) {
    const base = (filename || fallback || 'Untitled')
      .replace(/\.[^/.]+$/, '')
      .replace(/[_]+/g, ' ')
      .replace(/[\u2013\u2014]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return base || 'Untitled';
  }

  function finalizeSong(name, rawNotes, idPrefix) {
    const notes = rawNotes
      .filter((n) => Number.isFinite(n.midi) && n.midi >= 21 && n.midi <= 108 && Number.isFinite(n.time))
      .map((n) => ({
        midi: Math.round(n.midi),
        time: Math.max(0, n.time),
        duration: Math.max(0.05, Number.isFinite(n.duration) ? n.duration : 0.35),
        velocity: Number.isFinite(n.velocity) ? Math.max(0.1, Math.min(1, n.velocity)) : 0.78,
        hand: n.hand === 'left' || n.hand === 'right' ? n.hand : (n.midi < 60 ? 'left' : 'right')
      }))
      .sort((a, b) => a.time - b.time || a.midi - b.midi);

    if (!notes.length) {
      throw new Error('No playable notes found');
    }

    const offset = notes[0].time;
    let duration = 0;
    let minMidi = 108;
    let maxMidi = 21;

    for (let i = 0; i < notes.length; i++) {
      notes[i].time = Math.max(0, notes[i].time - offset);
      const end = notes[i].time + notes[i].duration;
      if (end > duration) duration = end;
      if (notes[i].midi < minMidi) minMidi = notes[i].midi;
      if (notes[i].midi > maxMidi) maxMidi = notes[i].midi;
    }

    return {
      id: (idPrefix || 'song') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      name: cleanSongName(name),
      notes,
      duration,
      minMidi,
      maxMidi,
      custom: true
    };
  }

  // Standard MIDI File (SMF) parser
  function parseMidi(arrayBuffer, filename) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);
    let pos = 0;

    function readStr(len) {
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[pos++]);
      return s;
    }
    function readU16() {
      const v = view.getUint16(pos, false);
      pos += 2;
      return v;
    }
    function readU32() {
      const v = view.getUint32(pos, false);
      pos += 4;
      return v;
    }
    function readVLQ() {
      let val = 0;
      let b;
      do {
        b = bytes[pos++];
        val = (val << 7) | (b & 0x7f);
      } while (b & 0x80);
      return val;
    }

    if (bytes.length < 14 || readStr(4) !== 'MThd') {
      throw new Error('Invalid MIDI file');
    }
    const headerLen = readU32();
    readU16(); // format
    const trackCount = readU16();
    const division = readU16();
    pos = 8 + headerLen;

    const tpq = (division & 0x8000) ? 480 : (division || 480);
    const tempoChanges = [{ tick: 0, usPerBeat: 500000 }];
    const trackNotes = [];
    let metaTitle = '';

    for (let t = 0; t < trackCount && pos + 8 <= bytes.length; t++) {
      const chunkId = readStr(4);
      const chunkLen = readU32();
      const chunkEnd = Math.min(bytes.length, pos + chunkLen);
      if (chunkId !== 'MTrk') {
        pos = chunkEnd;
        continue;
      }

      let tick = 0;
      let runningStatus = 0;
      const openNotes = new Map();
      const notesInTrack = [];
      let trackName = '';

      while (pos < chunkEnd) {
        tick += readVLQ();
        if (pos >= chunkEnd) break;
        let status = bytes[pos];
        if (status < 0x80) {
          status = runningStatus;
        } else {
          pos++;
          if (status < 0xf0) runningStatus = status;
        }

        if (status === 0xff) {
          const metaType = bytes[pos++];
          const len = readVLQ();
          const dataStart = pos;
          if (metaType === 0x51 && len === 3) {
            const us = (bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2];
            if (us > 0) tempoChanges.push({ tick, usPerBeat: us });
          } else if (metaType === 0x03 && len > 0) {
            let txt = '';
            for (let i = 0; i < len; i++) {
              const c = bytes[pos + i];
              if (c >= 32 && c < 127) txt += String.fromCharCode(c);
            }
            if (txt.trim()) {
              trackName = txt.trim();
              if (!metaTitle && t === 0) metaTitle = trackName;
            }
          }
          pos = dataStart + len;
        } else if (status === 0xf0 || status === 0xf7) {
          const len = readVLQ();
          pos += len;
        } else {
          const cmd = status & 0xf0;
          const ch = status & 0x0f;
          if (cmd === 0x90 || cmd === 0x80) {
            const pitch = bytes[pos++];
            const vel = bytes[pos++];
            if (ch !== 9) {
              const key = ch + ':' + pitch;
              if (cmd === 0x90 && vel > 0) {
                if (!openNotes.has(key)) openNotes.set(key, []);
                openNotes.get(key).push({ tick, vel: vel / 127 });
              } else {
                const stack = openNotes.get(key);
                if (stack && stack.length) {
                  const start = stack.shift();
                  notesInTrack.push({
                    midi: pitch,
                    startTick: start.tick,
                    endTick: Math.max(start.tick + 1, tick),
                    velocity: start.vel
                  });
                }
              }
            }
          } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
            pos += 2;
          } else if (cmd === 0xc0 || cmd === 0xd0) {
            pos += 1;
          } else {
            break;
          }
        }
      }

      openNotes.forEach((stack, key) => {
        const pitch = parseInt(key.split(':')[1], 10);
        stack.forEach((start) => {
          notesInTrack.push({
            midi: pitch,
            startTick: start.tick,
            endTick: start.tick + tpq,
            velocity: start.vel
          });
        });
      });

      if (notesInTrack.length) {
        const avg = notesInTrack.reduce((s, n) => s + n.midi, 0) / notesInTrack.length;
        trackNotes.push({ name: trackName.toLowerCase(), avg, notes: notesInTrack });
      }
      pos = chunkEnd;
    }

    tempoChanges.sort((a, b) => a.tick - b.tick);
    const dedupTempo = [];
    for (const tc of tempoChanges) {
      if (dedupTempo.length && dedupTempo[dedupTempo.length - 1].tick === tc.tick) {
        dedupTempo[dedupTempo.length - 1] = tc;
      } else {
        dedupTempo.push(tc);
      }
    }

    const segments = [];
    let accSec = 0;
    for (let i = 0; i < dedupTempo.length; i++) {
      const cur = dedupTempo[i];
      if (i > 0) {
        const prev = dedupTempo[i - 1];
        accSec += ((cur.tick - prev.tick) / tpq) * (prev.usPerBeat / 1e6);
      }
      segments.push({ tick: cur.tick, sec: accSec, usPerBeat: cur.usPerBeat });
    }

    function tickToSec(targetTick) {
      let lo = 0;
      let hi = segments.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (segments[mid].tick <= targetTick) lo = mid;
        else hi = mid - 1;
      }
      const seg = segments[lo];
      return seg.sec + ((targetTick - seg.tick) / tpq) * (seg.usPerBeat / 1e6);
    }

    const combined = [];
    if (trackNotes.length >= 2) {
      const sortedByAvg = trackNotes.slice().sort((a, b) => b.avg - a.avg);
      const midPoint = Math.ceil(sortedByAvg.length / 2);
      sortedByAvg.forEach((tr, idx) => {
        let hand = idx < midPoint ? 'right' : 'left';
        if (tr.name.includes('left') || tr.name.includes('bass') || tr.name.includes('lh')) hand = 'left';
        if (tr.name.includes('right') || tr.name.includes('treble') || tr.name.includes('rh')) hand = 'right';
        for (const n of tr.notes) {
          const t0 = tickToSec(n.startTick);
          const t1 = tickToSec(n.endTick);
          combined.push({
            midi: n.midi,
            time: t0,
            duration: Math.max(0.06, t1 - t0),
            velocity: n.velocity,
            hand
          });
        }
      });
    } else if (trackNotes.length === 1) {
      for (const n of trackNotes[0].notes) {
        const t0 = tickToSec(n.startTick);
        const t1 = tickToSec(n.endTick);
        combined.push({
          midi: n.midi,
          time: t0,
          duration: Math.max(0.06, t1 - t0),
          velocity: n.velocity,
          hand: n.midi < 60 ? 'left' : 'right'
        });
      }
    }

    const displayName = filename ? cleanSongName(filename) : (metaTitle || 'MIDI Song');
    return finalizeSong(displayName, combined, 'midi');
  }

  // Minimal ZIP extractor for .mxl (compressed MusicXML)
  async function extractMxlXml(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Invalid MXL archive');

    const cdOffset = view.getUint32(eocd + 16, true);
    const cdCount = view.getUint16(eocd + 10, true);
    const decoder = new TextDecoder('utf-8');
    const entries = new Map();

    let pos = cdOffset;
    for (let i = 0; i < cdCount && pos + 46 <= bytes.length; i++) {
      if (view.getUint32(pos, true) !== 0x02014b50) break;
      const method = view.getUint16(pos + 10, true);
      const compSize = view.getUint32(pos + 20, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localOffset = view.getUint32(pos + 42, true);
      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      entries.set(name, { method, compSize, localOffset });
      pos += 46 + nameLen + extraLen + commentLen;
    }

    async function readEntry(info) {
      const lo = info.localOffset;
      const nLen = view.getUint16(lo + 26, true);
      const eLen = view.getUint16(lo + 28, true);
      const start = lo + 30 + nLen + eLen;
      const slice = bytes.subarray(start, start + info.compSize);
      if (info.method === 0) {
        return decoder.decode(slice);
      }
      if (info.method === 8 && typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([slice]).stream().pipeThrough(ds);
        const buf = await new Response(stream).arrayBuffer();
        return decoder.decode(buf);
      }
      throw new Error('Unsupported MXL compression');
    }

    let rootFile = null;
    if (entries.has('META-INF/container.xml')) {
      const containerXml = await readEntry(entries.get('META-INF/container.xml'));
      const m = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
      if (m && entries.has(m[1])) rootFile = m[1];
    }

    if (!rootFile) {
      for (const name of entries.keys()) {
        if (!name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(name)) {
          rootFile = name;
          break;
        }
      }
    }

    if (!rootFile) throw new Error('No XML score inside MXL');
    return readEntry(entries.get(rootFile));
  }

  // MusicXML parser (.xml, .musicxml, .mxl)
  function parseMusicXml(xmlText, filename) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid MusicXML');
    }

    const titleEl = doc.querySelector('work > work-title') || doc.querySelector('movement-title');
    const title = (titleEl && titleEl.textContent && titleEl.textContent.trim()) || cleanSongName(filename);

    const parts = Array.from(doc.querySelectorAll('part'));
    const allNotes = [];

    parts.forEach((part, partIdx) => {
      let divisions = 1;
      let tempoBpm = 100;
      let cursorSec = 0;
      let lastNoteStartSec = 0;
      const tiedOpen = new Map();

      const measures = Array.from(part.children).filter((el) => el.tagName === 'measure');
      for (const measure of measures) {
        const measureStartSec = cursorSec;
        let maxMeasureSec = cursorSec;

        for (const el of Array.from(measure.children)) {
          const tag = el.tagName;
          if (tag === 'attributes') {
            const divEl = el.querySelector('divisions');
            if (divEl) {
              const d = parseFloat(divEl.textContent);
              if (d > 0) divisions = d;
            }
          } else if (tag === 'direction') {
            const sound = el.querySelector('sound[tempo]');
            if (sound) {
              const bpm = parseFloat(sound.getAttribute('tempo'));
              if (bpm > 15 && bpm < 400) tempoBpm = bpm;
            } else {
              const perMin = el.querySelector('metronome > per-minute');
              if (perMin) {
                const bpm = parseFloat(perMin.textContent);
                if (bpm > 15 && bpm < 400) tempoBpm = bpm;
              }
            }
          } else if (tag === 'sound') {
            const bpm = parseFloat(el.getAttribute('tempo'));
            if (bpm > 15 && bpm < 400) tempoBpm = bpm;
          } else if (tag === 'backup') {
            const durEl = el.querySelector('duration');
            const dur = durEl ? parseFloat(durEl.textContent) : 0;
            const sec = (dur / divisions) * (60 / tempoBpm);
            cursorSec = Math.max(measureStartSec, cursorSec - sec);
          } else if (tag === 'forward') {
            const durEl = el.querySelector('duration');
            const dur = durEl ? parseFloat(durEl.textContent) : 0;
            cursorSec += (dur / divisions) * (60 / tempoBpm);
            if (cursorSec > maxMeasureSec) maxMeasureSec = cursorSec;
          } else if (tag === 'note') {
            if (el.querySelector('grace')) continue;
            const durEl = el.querySelector('duration');
            const durVal = durEl ? parseFloat(durEl.textContent) : 0;
            const durSec = (durVal / divisions) * (60 / tempoBpm);
            const isChord = !!el.querySelector('chord');
            const isRest = !!el.querySelector('rest');
            const startSec = isChord ? lastNoteStartSec : cursorSec;

            if (!isRest) {
              const pitchEl = el.querySelector('pitch');
              if (pitchEl) {
                const step = (pitchEl.querySelector('step')?.textContent || '').trim().toUpperCase();
                const alter = parseFloat(pitchEl.querySelector('alter')?.textContent || '0') || 0;
                const octave = parseInt(pitchEl.querySelector('octave')?.textContent || '4', 10);
                if (NOTE_BASE[step] !== undefined) {
                  const midi = (octave + 1) * 12 + NOTE_BASE[step] + Math.round(alter);
                  const staffEl = el.querySelector('staff');
                  const staffNum = staffEl ? parseInt(staffEl.textContent, 10) : (parts.length > 1 ? partIdx + 1 : 0);
                  let hand = 'right';
                  if (staffNum === 2) hand = 'left';
                  else if (staffNum === 1) hand = 'right';
                  else hand = midi < 60 ? 'left' : 'right';

                  const ties = Array.from(el.querySelectorAll('tie')).map((t) => t.getAttribute('type'));
                  const tieKey = staffNum + ':' + midi;

                  if (ties.includes('stop') && tiedOpen.has(tieKey)) {
                    const prev = tiedOpen.get(tieKey);
                    prev.duration += durSec;
                    if (!ties.includes('start')) {
                      tiedOpen.delete(tieKey);
                    }
                  } else {
                    const noteObj = {
                      midi,
                      time: startSec,
                      duration: Math.max(0.06, durSec * 0.96),
                      velocity: 0.78,
                      hand
                    };
                    allNotes.push(noteObj);
                    if (ties.includes('start')) {
                      tiedOpen.set(tieKey, noteObj);
                    }
                  }
                }
              }
            }

            if (!isChord) {
              lastNoteStartSec = cursorSec;
              cursorSec += durSec;
              if (cursorSec > maxMeasureSec) maxMeasureSec = cursorSec;
            }
          }
        }
        cursorSec = maxMeasureSec;
      }
    });

    return finalizeSong(title, allNotes, 'mxml');
  }

  // ABC notation parser (.abc)
  const KEY_SIGS = {
    C: {}, Am: {},
    G: { F: 1 }, Em: { F: 1 },
    D: { F: 1, C: 1 }, Bm: { F: 1, C: 1 },
    A: { F: 1, C: 1, G: 1 }, 'F#m': { F: 1, C: 1, G: 1 },
    E: { F: 1, C: 1, G: 1, D: 1 }, 'C#m': { F: 1, C: 1, G: 1, D: 1 },
    B: { F: 1, C: 1, G: 1, D: 1, A: 1 },
    F: { B: -1 }, Dm: { B: -1 },
    Bb: { B: -1, E: -1 }, Gm: { B: -1, E: -1 },
    Eb: { B: -1, E: -1, A: -1 }, Cm: { B: -1, E: -1, A: -1 },
    Ab: { B: -1, E: -1, A: -1, D: -1 }, Fm: { B: -1, E: -1, A: -1, D: -1 },
    Db: { B: -1, E: -1, A: -1, D: -1, G: -1 }
  };

  function parseAbc(text, filename) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let title = cleanSongName(filename);
    let unitBeats = 0.5;
    let bpm = 110;
    let keyAlter = {};
    let currentVoice = '1';
    const voiceTime = new Map([['1', 0]]);
    const notes = [];

    function parseDurationMod(str, idx) {
      let i = idx;
      let numStr = '';
      while (i < str.length && str[i] >= '0' && str[i] <= '9') numStr += str[i++];
      let num = numStr ? parseInt(numStr, 10) : 1;
      let den = 1;
      while (i < str.length && str[i] === '/') {
        i++;
        let dStr = '';
        while (i < str.length && str[i] >= '0' && str[i] <= '9') dStr += str[i++];
        den *= dStr ? parseInt(dStr, 10) : 2;
      }
      return { mult: num / den, next: i };
    }

    for (const rawLine of lines) {
      const line = rawLine.split('%')[0].trim();
      if (!line) continue;
      if (/^[A-Za-z]:/.test(line)) {
        const key = line[0];
        const val = line.slice(2).trim();
        if (key === 'T' && val) title = val;
        else if (key === 'L') {
          const m = val.match(/^(\d+)\s*\/\s*(\d+)$/);
          if (m) unitBeats = (parseInt(m[1], 10) / parseInt(m[2], 10)) * 4;
        } else if (key === 'Q') {
          const eq = val.match(/=\s*(\d+)/);
          const plain = val.match(/^(\d+)/);
          const q = eq ? parseInt(eq[1], 10) : (plain ? parseInt(plain[1], 10) : 110);
          if (q > 20 && q < 360) bpm = q;
        } else if (key === 'K') {
          const k = val.split(/\s+/)[0];
          keyAlter = KEY_SIGS[k] || {};
        } else if (key === 'V') {
          currentVoice = val.split(/\s+/)[0] || '1';
          if (!voiceTime.has(currentVoice)) voiceTime.set(currentVoice, 0);
        }
        continue;
      }

      let t = voiceTime.get(currentVoice) || 0;
      const barAcc = {};
      let i = 0;

      while (i < line.length) {
        const ch = line[i];
        if (ch === '|') {
          Object.keys(barAcc).forEach((k) => delete barAcc[k]);
          i++;
          continue;
        }
        if (ch === ' ' || ch === '\t' || ch === ':' || ch === ']' || ch === '(' || ch === ')') {
          i++;
          continue;
        }
        if (ch === '"') {
          i++;
          while (i < line.length && line[i] !== '"') i++;
          i++;
          continue;
        }

        if (ch === 'z' || ch === 'x' || ch === 'Z') {
          const d = parseDurationMod(line, i + 1);
          t += unitBeats * d.mult * (60 / bpm);
          i = d.next;
          continue;
        }

        if (ch === '[') {
          i++;
          const chordNotes = [];
          let chordDur = null;
          while (i < line.length && line[i] !== ']') {
            const parsed = readAbcPitch(line, i, keyAlter, barAcc);
            if (!parsed) {
              i++;
              continue;
            }
            const d = parseDurationMod(line, parsed.next);
            chordNotes.push(parsed.midi);
            if (chordDur === null) chordDur = d.mult;
            i = d.next;
          }
          if (line[i] === ']') i++;
          const post = parseDurationMod(line, i);
          const mult = (chordDur !== null ? chordDur : 1) * post.mult;
          const durSec = unitBeats * mult * (60 / bpm);
          const hand = currentVoice === '2' || currentVoice.toLowerCase().includes('l') ? 'left' : null;
          for (const m of chordNotes) {
            notes.push({
              midi: m,
              time: t,
              duration: Math.max(0.06, durSec * 0.94),
              velocity: 0.78,
              hand: hand || (m < 60 ? 'left' : 'right')
            });
          }
          t += durSec;
          i = post.next;
          continue;
        }

        const parsed = readAbcPitch(line, i, keyAlter, barAcc);
        if (parsed) {
          const d = parseDurationMod(line, parsed.next);
          const durSec = unitBeats * d.mult * (60 / bpm);
          const hand = currentVoice === '2' || currentVoice.toLowerCase().includes('l') ? 'left' : (parsed.midi < 60 ? 'left' : 'right');
          notes.push({
            midi: parsed.midi,
            time: t,
            duration: Math.max(0.06, durSec * 0.94),
            velocity: 0.78,
            hand
          });
          t += durSec;
          i = d.next;
          continue;
        }
        i++;
      }

      voiceTime.set(currentVoice, t);
    }

    return finalizeSong(title, notes, 'abc');
  }

  function readAbcPitch(line, startIdx, keyAlter, barAcc) {
    let i = startIdx;
    let explicitAcc = null;
    if (line[i] === '^') {
      explicitAcc = 1;
      i++;
      if (line[i] === '^') {
        explicitAcc = 2;
        i++;
      }
    } else if (line[i] === '_') {
      explicitAcc = -1;
      i++;
      if (line[i] === '_') {
        explicitAcc = -2;
        i++;
      }
    } else if (line[i] === '=') {
      explicitAcc = 0;
      i++;
    }

    const ch = line[i];
    if (!ch || !/[A-Ga-g]/.test(ch)) return null;
    i++;

    const upper = ch.toUpperCase();
    let octave = ch === upper ? 4 : 5;
    while (i < line.length && (line[i] === "'" || line[i] === ',')) {
      if (line[i] === "'") octave++;
      else octave--;
      i++;
    }

    const barKey = upper + octave;
    let alter = 0;
    if (explicitAcc !== null) {
      alter = explicitAcc;
      barAcc[barKey] = explicitAcc;
    } else if (barAcc[barKey] !== undefined) {
      alter = barAcc[barKey];
    } else if (keyAlter[upper] !== undefined) {
      alter = keyAlter[upper];
    }

    const midi = (octave + 1) * 12 + NOTE_BASE[upper] + alter;
    return { midi, next: i };
  }

  // Custom JSON or plain text note sequence parser
  function parseJsonSong(text, filename) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : (Array.isArray(data.notes) ? data.notes : []);
    let cursor = 0;
    const notes = [];

    for (const item of list) {
      if (typeof item === 'string') {
        const midi = noteNameToMidi(item);
        if (midi !== null) {
          notes.push({ midi, time: cursor, duration: 0.45, velocity: 0.8 });
          cursor += 0.5;
        }
      } else if (item && typeof item === 'object') {
        const midi = item.midi != null ? Number(item.midi) : noteNameToMidi(item.note || item.pitch);
        if (midi !== null) {
          const duration = Number(item.duration ?? item.dur ?? 0.45);
          const time = item.time != null ? Number(item.time) : cursor;
          notes.push({
            midi,
            time,
            duration,
            velocity: item.velocity != null ? Number(item.velocity) : 0.8,
            hand: item.hand
          });
          cursor = Math.max(cursor, time + duration);
        }
      }
    }

    const name = (data && !Array.isArray(data) && (data.name || data.title)) || cleanSongName(filename);
    return finalizeSong(name, notes, 'json');
  }

  function parseTextSong(text, filename) {
    if (/^\s*X:\s*\d+/m.test(text) && /^\s*K:/m.test(text)) {
      return parseAbc(text, filename);
    }

    const tokens = text.match(/\[[^\]]+\](?::[\d.]+)?(?:@[\d.]+)?|[^\s,]+/g) || [];
    let cursor = 0;
    const notes = [];

    for (const tok of tokens) {
      if (/^r(?:est)?(?::[\d.]+)?$/i.test(tok)) {
        const dm = tok.split(':')[1];
        cursor += dm ? parseFloat(dm) || 0.5 : 0.5;
        continue;
      }

      if (tok.startsWith('[')) {
        const m = tok.match(/^\[([^\]]+)\](?:@([\d.]+))?(?::([\d.]+))?$/);
        if (!m) continue;
        const t = m[2] != null ? parseFloat(m[2]) : cursor;
        const dur = m[3] != null ? parseFloat(m[3]) : 0.5;
        const parts = m[1].trim().split(/[\s,]+/);
        for (const p of parts) {
          const midi = noteNameToMidi(p);
          if (midi !== null) notes.push({ midi, time: t, duration: dur * 0.94, velocity: 0.8 });
        }
        if (m[2] == null) cursor += dur;
        continue;
      }

      const m = tok.match(/^([A-Ga-g][#b]?-?\d)(?:@([\d.]+))?(?::([\d.]+))?$/);
      if (m) {
        const midi = noteNameToMidi(m[1]);
        if (midi !== null) {
          const t = m[2] != null ? parseFloat(m[2]) : cursor;
          const dur = m[3] != null ? parseFloat(m[3]) : 0.48;
          notes.push({ midi, time: t, duration: dur * 0.94, velocity: 0.8 });
          if (m[2] == null) cursor += dur;
        }
      }
    }

    return finalizeSong(cleanSongName(filename), notes, 'txt');
  }

  async function parseFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'mid' || ext === 'midi') {
      const buf = await file.arrayBuffer();
      return parseMidi(buf, file.name);
    }
    if (ext === 'mxl') {
      const buf = await file.arrayBuffer();
      const xml = await extractMxlXml(buf);
      return parseMusicXml(xml, file.name);
    }
    if (ext === 'xml' || ext === 'musicxml') {
      const text = await file.text();
      return parseMusicXml(text, file.name);
    }
    if (ext === 'abc') {
      const text = await file.text();
      return parseAbc(text, file.name);
    }
    if (ext === 'json') {
      const text = await file.text();
      return parseJsonSong(text, file.name);
    }
    const text = await file.text();
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return parseJsonSong(text, file.name);
      } catch (_) {}
    }
    if (text.includes('<score-partwise')) {
      return parseMusicXml(text, file.name);
    }
    return parseTextSong(text, file.name);
  }

  PianoApp.parsers = {
    parseFile,
    parseMidi,
    parseMusicXml,
    parseAbc,
    parseJsonSong,
    parseTextSong,
    noteNameToMidi,
    finalizeSong
  };
})(window);
