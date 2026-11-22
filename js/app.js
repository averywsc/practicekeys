(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});

  const MIN_MIDI = 21; // A0
  const MAX_MIDI = 108; // C8
  const LEAD_IN = 2.4;
  const LOOKAHEAD_SEC = 3.2;

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
  const BLACK_OFFSET = {
    1: 0.62,  // C#
    3: 0.72,  // D#
    6: 0.58,  // F#
    8: 0.66,  // G#
    10: 0.74  // A#
  };

  // Precompute white key indices and labels for all 88 keys
  const WHITE_KEYS = [];
  const MIDI_INFO = {};
  (function buildKeyTable() {
    let wIdx = 0;
    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      const pc = m % 12;
      const octave = Math.floor(m / 12) - 1;
      const noteName = NOTE_NAMES[pc];
      const fullName = noteName + octave;
      const black = IS_BLACK[pc];
      if (!black) {
        MIDI_INFO[m] = { midi: m, black: false, whiteIndex: wIdx, noteName, fullName, octave };
        WHITE_KEYS.push(m);
        wIdx++;
      } else {
        MIDI_INFO[m] = {
          midi: m,
          black: true,
          leftWhiteIndex: wIdx - 1,
          offset: BLACK_OFFSET[pc] || 0.65,
          noteName,
          fullName,
          octave
        };
      }
    }
  })();

  const TOTAL_WHITES = WHITE_KEYS.length; // 52

  // Ergonomic computer keyboard mapping (relative to baseOctave)
  const KEY_MAP = {
    KeyZ: -12, KeyS: -11, KeyX: -10, KeyD: -9, KeyC: -8, KeyV: -7,
    KeyG: -6, KeyB: -5, KeyH: -4, KeyN: -3, KeyJ: -2, KeyM: -1,
    KeyQ: 0, Digit2: 1, KeyW: 2, Digit3: 3, KeyE: 4, KeyR: 5,
    Digit5: 6, KeyT: 7, Digit6: 8, KeyY: 9, Digit7: 10, KeyU: 11,
    KeyI: 12, Digit9: 13, KeyO: 14, Digit0: 15, KeyP: 16
  };

  // DOM elements
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');

  const songPicker = document.getElementById('songPicker');
  const songBtn = document.getElementById('songBtn');
  const songTitle = document.getElementById('songTitle');
  const songMenu = document.getElementById('songMenu');
  const songListEl = document.getElementById('songList');

  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const recordBtn = document.getElementById('recordBtn');

  const restartBtn = document.getElementById('restartBtn');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const loopBtn = document.getElementById('loopBtn');
  const learnBtn = document.getElementById('learnBtn');
  const speedSlider = document.getElementById('speedSlider');

  const leftHandBtn = document.getElementById('leftHandBtn');
  const rightHandBtn = document.getElementById('rightHandBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const fullScaleBtn = document.getElementById('fullScaleBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const muteBtn = document.getElementById('muteBtn');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');
  const midiDot = document.getElementById('midiDot');

  const progressWrap = document.getElementById('progressWrap');
  const progressFill = document.getElementById('progressFill');
  const progressThumb = document.getElementById('progressThumb');
  const dropOverlay = document.getElementById('dropOverlay');

  // Application state
  const builtInSongs = PianoApp.songs.createBuiltInSongs();
  let customSongs = PianoApp.songs.loadCustomSongs();
  let allSongs = builtInSongs.concat(customSongs);
  let currentSong = allSongs[0];

  let playing = false;
  let loopMode = false;
  let learnMode = false;
  let speed = 1.0;
  let muted = false;
  let leftHandOn = true;
  let rightHandOn = true;
  let fullScaleMode = false;

  let currentTime = -LEAD_IN;
  let triggeredNotes = new Set();
  let satisfiedLearnNotes = new Set();
  let waitingLearnMidis = new Set();
  let waitingForInput = false;

  // Screen Wake Lock (keeps phone/tablet awake on a piano music stand)
  let wakeLockSentinel = null;
  async function syncWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      if (playing && document.visibilityState === 'visible') {
        if (!wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        }
      } else if (wakeLockSentinel) {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && playing) {
      syncWakeLock();
    }
  });

  // Piano viewport range in white-key coordinates [0..52]
  let viewStart = 0;
  let viewEnd = TOTAL_WHITES;
  let targetStart = 0;
  let targetEnd = TOTAL_WHITES;

  // Interaction state
  let baseOctave = 4; // C4 = MIDI 60
  const userActiveKeys = new Map(); // midi -> { count, hitGood, time }
  const pointerKeys = new Map(); // pointerId -> midi
  const keyboardKeys = new Map(); // code -> midi
  const particles = [];

  // Recording state
  let recording = false;
  let recStartPerf = 0;
  let recOpen = new Map();
  let recNotes = [];

  // Layout cache
  let canvasW = 1;
  let canvasH = 1;
  let keyHeight = 160;
  let waterfallH = 400;
  let keyRects = new Map();
  let whiteRects = [];
  let blackRects = [];

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function midiToWhitePos(midi) {
    const info = MIDI_INFO[clamp(midi, MIN_MIDI, MAX_MIDI)];
    return info.black ? info.leftWhiteIndex + info.offset : info.whiteIndex;
  }

  function getMinSpan() {
    return canvasW < 540 ? 8 : 14;
  }

  function computeSongRange(song) {
    if (!song || !song.notes.length) return { start: 0, end: TOTAL_WHITES };
    const minW = Math.floor(midiToWhitePos(song.minMidi));
    const maxW = Math.ceil(midiToWhitePos(song.maxMidi)) + 1;
    let start = Math.max(0, minW - 1);
    let end = Math.min(TOTAL_WHITES, maxW + 1);
    const minSpan = canvasW < 540 ? 10 : 15;
    if (end - start < minSpan) {
      const center = (start + end) / 2;
      start = Math.max(0, Math.round(center - minSpan / 2));
      end = Math.min(TOTAL_WHITES, start + minSpan);
      if (end - start < minSpan) start = Math.max(0, end - minSpan);
    }
    return { start, end };
  }

  function applyScaleTarget(instant) {
    if (fullScaleMode) {
      targetStart = 0;
      targetEnd = TOTAL_WHITES;
    } else {
      const range = computeSongRange(currentSong);
      targetStart = range.start;
      targetEnd = range.end;
    }
    if (instant) {
      viewStart = targetStart;
      viewEnd = targetEnd;
    }
    fullScaleBtn.classList.toggle('active', fullScaleMode);
  }

  function zoomBy(deltaWhites, anchorRatio) {
    const minSpan = getMinSpan();
    const span = targetEnd - targetStart;
    const nextSpan = clamp(span + deltaWhites, minSpan, TOTAL_WHITES);
    const ratio = anchorRatio != null ? clamp(anchorRatio, 0, 1) : 0.5;
    const anchorWhite = targetStart + span * ratio;
    let s = anchorWhite - nextSpan * ratio;
    let e = s + nextSpan;
    if (s < 0) {
      e -= s;
      s = 0;
    }
    if (e > TOTAL_WHITES) {
      s -= e - TOTAL_WHITES;
      e = TOTAL_WHITES;
    }
    targetStart = clamp(s, 0, TOTAL_WHITES - minSpan);
    targetEnd = clamp(e, targetStart + minSpan, TOTAL_WHITES);
    fullScaleMode = targetStart <= 0.1 && targetEnd >= TOTAL_WHITES - 0.1;
    fullScaleBtn.classList.toggle('active', fullScaleMode);
  }

  function panBy(deltaWhites) {
    const span = targetEnd - targetStart;
    if (span >= TOTAL_WHITES - 0.05) return;
    let s = targetStart + deltaWhites;
    let e = targetEnd + deltaWhites;
    if (s < 0) {
      e -= s;
      s = 0;
    }
    if (e > TOTAL_WHITES) {
      s -= e - TOTAL_WHITES;
      e = TOTAL_WHITES;
    }
    targetStart = s;
    targetEnd = e;
  }

  function computeKeyLayout() {
    const span = Math.max(1, viewEnd - viewStart);
    const whiteW = canvasW / span;
    const blackW = whiteW * 0.62;
    const blackH = keyHeight * 0.62;

    keyRects.clear();
    whiteRects = [];
    blackRects = [];

    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      const info = MIDI_INFO[m];
      if (!info.black) {
        const x = (info.whiteIndex - viewStart) * whiteW;
        const rect = { midi: m, black: false, x, y: waterfallH, w: whiteW, h: keyHeight };
        keyRects.set(m, rect);
        if (x + whiteW >= -2 && x <= canvasW + 2) whiteRects.push(rect);
      } else {
        const x = (info.leftWhiteIndex + info.offset - viewStart) * whiteW - blackW * 0.5;
        const rect = { midi: m, black: true, x, y: waterfallH, w: blackW, h: blackH };
        keyRects.set(m, rect);
        if (x + blackW >= -2 && x <= canvasW + 2) blackRects.push(rect);
      }
    }
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvasW = Math.max(1, rect.width);
    canvasH = Math.max(1, rect.height);
    canvas.width = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (canvasH < 480) {
      keyHeight = clamp(Math.round(canvasH * 0.34), 102, 150);
    } else if (canvasW < 640 && canvasH > canvasW) {
      keyHeight = clamp(Math.round(canvasH * 0.27), 140, 224);
    } else {
      keyHeight = clamp(Math.round(canvasH * 0.24), 124, 206);
    }
    waterfallH = Math.max(110, canvasH - keyHeight);
  }

  function setPlaying(next) {
    playing = !!next;
    playIcon.hidden = playing;
    pauseIcon.hidden = !playing;
    if (playing) {
      PianoApp.audio.ensureContext();
      if (currentSong && currentTime >= currentSong.duration + 0.3) {
        seekTo(-LEAD_IN);
      }
    } else {
      PianoApp.audio.stopAll('song:');
    }
    syncWakeLock();
  }

  function seekTo(t) {
    if (!currentSong) return;
    currentTime = clamp(t, -LEAD_IN, currentSong.duration + 0.4);
    triggeredNotes.clear();
    satisfiedLearnNotes.clear();
    waitingLearnMidis.clear();
    waitingForInput = false;
    PianoApp.audio.stopAll('song:');

    const notes = currentSong.notes;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].time < currentTime - 0.01) {
        triggeredNotes.add(i);
        satisfiedLearnNotes.add(i);
      }
    }
    updateProgressUI();
  }

  function selectSong(song, autoPlay) {
    currentSong = song;
    songTitle.textContent = song.name;
    setPlaying(false);
    seekTo(-LEAD_IN);
    applyScaleTarget(false);
    renderSongList();
    if (autoPlay) setPlaying(true);
  }

  function renderSongList() {
    songListEl.innerHTML = '';
    for (const song of allSongs) {
      const row = document.createElement('div');
      row.className = 'song-item' + (currentSong && currentSong.id === song.id ? ' active' : '');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      const label = document.createElement('span');
      label.className = 'song-item-name';
      label.textContent = song.name;
      row.appendChild(label);

      if (song.custom) {
        const del = document.createElement('button');
        del.className = 'song-del';
        del.setAttribute('aria-label', 'Remove');
        del.innerHTML =
          '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          removeCustomSong(song.id);
        });
        row.appendChild(del);
      }

      row.addEventListener('click', () => {
        closeSongMenu();
        selectSong(song, false);
      });
      songListEl.appendChild(row);
    }
  }

  function removeCustomSong(id) {
    customSongs = customSongs.filter((s) => s.id !== id);
    PianoApp.songs.saveCustomSongs(customSongs);
    allSongs = builtInSongs.concat(customSongs);
    if (currentSong && currentSong.id === id) {
      selectSong(allSongs[0], false);
    } else {
      renderSongList();
    }
  }

  function addCustomSong(song, autoSelect) {
    customSongs.unshift(song);
    PianoApp.songs.saveCustomSongs(customSongs);
    allSongs = builtInSongs.concat(customSongs);
    if (autoSelect) {
      selectSong(song, false);
    } else {
      renderSongList();
    }
  }

  function openSongMenu() {
    songMenu.hidden = false;
    songBtn.setAttribute('aria-expanded', 'true');
  }

  function closeSongMenu() {
    songMenu.hidden = true;
    songBtn.setAttribute('aria-expanded', 'false');
  }

  function isHandEnabled(hand) {
    return hand === 'left' ? leftHandOn : rightHandOn;
  }

  // User note input (mouse, touch, keyboard, MIDI)
  function userNoteOn(midi, velocity) {
    if (midi < MIN_MIDI || midi > MAX_MIDI) return;
    PianoApp.audio.noteOn(midi, velocity == null ? 0.82 : velocity, 'user');

    let hitGood = false;
    if (learnMode && waitingForInput && waitingLearnMidis.has(midi)) {
      hitGood = true;
      satisfyLearnMidi(midi);
    }

    const existing = userActiveKeys.get(midi);
    userActiveKeys.set(midi, {
      count: existing ? existing.count + 1 : 1,
      hitGood,
      time: performance.now()
    });

    spawnParticles(midi, hitGood ? '#34d399' : '#38bdf8', hitGood ? 9 : 5);

    if (recording) {
      const now = performance.now();
      if (!recStartPerf) recStartPerf = now;
      const t = (now - recStartPerf) / 1000;
      recOpen.set(midi, { midi, time: t, velocity: velocity == null ? 0.82 : velocity });
    }
  }

  function userNoteOff(midi) {
    if (midi < MIN_MIDI || midi > MAX_MIDI) return;
    const existing = userActiveKeys.get(midi);
    if (existing) {
      if (existing.count <= 1) {
        userActiveKeys.delete(midi);
        PianoApp.audio.noteOff(midi, 'user');
      } else {
        existing.count--;
      }
    } else {
      PianoApp.audio.noteOff(midi, 'user');
    }

    if (recording && recOpen.has(midi)) {
      const open = recOpen.get(midi);
      recOpen.delete(midi);
      const endSec = (performance.now() - recStartPerf) / 1000;
      recNotes.push({
        midi: open.midi,
        time: open.time,
        duration: Math.max(0.08, endSec - open.time),
        velocity: open.velocity,
        hand: open.midi < 60 ? 'left' : 'right'
      });
    }
  }

  function satisfyLearnMidi(midi) {
    if (!currentSong) return;
    const notes = currentSong.notes;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (satisfiedLearnNotes.has(i)) continue;
      if (n.time > currentTime + 0.08) break;
      if (n.midi === midi && isHandEnabled(n.hand)) {
        satisfiedLearnNotes.add(i);
        triggeredNotes.add(i);
      }
    }
    refreshLearnWaitState();
  }

  function refreshLearnWaitState() {
    waitingLearnMidis.clear();
    waitingForInput = false;
    if (!learnMode || !currentSong) return;
    const notes = currentSong.notes;
    let firstDueTime = null;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (satisfiedLearnNotes.has(i)) continue;
      if (!isHandEnabled(n.hand)) continue;
      if (n.time <= currentTime + 0.015) {
        if (firstDueTime === null) firstDueTime = n.time;
        if (n.time <= firstDueTime + 0.045) {
          waitingLearnMidis.add(n.midi);
        } else {
          break;
        }
      } else {
        break;
      }
    }

    if (waitingLearnMidis.size > 0) {
      waitingForInput = true;
      currentTime = firstDueTime;
    }
  }

  function spawnParticles(midi, color, count) {
    const rect = keyRects.get(midi);
    if (!rect) return;
    const cx = rect.x + rect.w * 0.5;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: cx + (Math.random() - 0.5) * rect.w * 0.7,
        y: waterfallH,
        vx: (Math.random() - 0.5) * 44,
        vy: -(28 + Math.random() * 68),
        r: 1.5 + Math.random() * 2.2,
        life: 1,
        color
      });
    }
    if (particles.length > 140) particles.splice(0, particles.length - 140);
  }

  // Recording toggle
  function toggleRecording() {
    if (!recording) {
      setPlaying(false);
      recording = true;
      recStartPerf = 0;
      recOpen.clear();
      recNotes = [];
      recordBtn.classList.add('recording');
    } else {
      recording = false;
      recordBtn.classList.remove('recording');
      const endSec = recStartPerf ? (performance.now() - recStartPerf) / 1000 : 0;
      recOpen.forEach((open) => {
        recNotes.push({
          midi: open.midi,
          time: open.time,
          duration: Math.max(0.12, endSec - open.time),
          velocity: open.velocity,
          hand: open.midi < 60 ? 'left' : 'right'
        });
      });
      recOpen.clear();
      if (recNotes.length > 0) {
        const nextNum = customSongs.filter((s) => /^Custom \d+$/.test(s.name)).length + 1;
        try {
          const song = PianoApp.parsers.finalizeSong('Custom ' + nextNum, recNotes, 'rec');
          addCustomSong(song, true);
        } catch (_) {}
      }
    }
  }

  // File import
  async function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    let lastAdded = null;
    for (const file of Array.from(fileList)) {
      try {
        const song = await PianoApp.parsers.parseFile(file);
        addCustomSong(song, false);
        lastAdded = song;
      } catch (err) {
        console.warn('Could not parse file:', file.name, err);
      }
    }
    if (lastAdded) {
      selectSong(lastAdded, false);
    }
  }

  // Hit-test piano key from canvas coordinates
  function keyAtPoint(x, y) {
    if (y < waterfallH) return null;
    for (let i = 0; i < blackRects.length; i++) {
      const r = blackRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return r.midi;
      }
    }
    for (let i = 0; i < whiteRects.length; i++) {
      const r = whiteRects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return r.midi;
      }
    }
    return null;
  }

  function updateProgressUI() {
    if (!currentSong || currentSong.duration <= 0) {
      progressFill.style.width = '0%';
      progressThumb.style.left = '0%';
      return;
    }
    const pct = clamp(currentTime / currentSong.duration, 0, 1) * 100;
    progressFill.style.width = pct.toFixed(2) + '%';
    progressThumb.style.left = pct.toFixed(2) + '%';
  }

  // Main update loop
  function update(dt) {
    // Smooth zoom/scale animation
    const ease = 1 - Math.exp(-dt * 11);
    viewStart += (targetStart - viewStart) * ease;
    viewEnd += (targetEnd - viewEnd) * ease;
    if (Math.abs(targetStart - viewStart) < 0.001) viewStart = targetStart;
    if (Math.abs(targetEnd - viewEnd) < 0.001) viewEnd = targetEnd;

    computeKeyLayout();

    if (playing && currentSong) {
      if (learnMode) {
        refreshLearnWaitState();
      }

      if (!waitingForInput) {
        const nextTime = currentTime + dt * speed;
        const notes = currentSong.notes;

        if (learnMode) {
          let stopTime = null;
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (n.time > nextTime) break;
            if (satisfiedLearnNotes.has(i)) continue;
            if (isHandEnabled(n.hand)) {
              stopTime = n.time;
              break;
            }
          }

          const advanceTo = stopTime !== null ? stopTime : nextTime;
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (n.time > advanceTo) break;
            if (triggeredNotes.has(i)) continue;
            if (!isHandEnabled(n.hand)) {
              triggeredNotes.add(i);
              PianoApp.audio.playTimedNote(n.midi, n.duration / speed, n.velocity * 0.72);
            }
          }

          currentTime = advanceTo;
          if (stopTime !== null) {
            refreshLearnWaitState();
          }
        } else {
          for (let i = 0; i < notes.length; i++) {
            const n = notes[i];
            if (n.time > nextTime) break;
            if (triggeredNotes.has(i)) continue;
            triggeredNotes.add(i);
            if (isHandEnabled(n.hand)) {
              PianoApp.audio.playTimedNote(n.midi, n.duration / speed, n.velocity);
              spawnParticles(n.midi, n.hand === 'left' ? '#a78bfa' : '#38bdf8', 4);
            }
          }
          currentTime = nextTime;
        }

        if (currentTime > currentSong.duration + 0.6) {
          if (loopMode) {
            seekTo(-LEAD_IN);
          } else {
            setPlaying(false);
          }
        }
        updateProgressUI();
      }
    }

    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      p.life -= dt * 2.1;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rad = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function render(nowMs) {
    ctx.clearRect(0, 0, canvasW, canvasH);

    // 1. Waterfall background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, waterfallH);
    bgGrad.addColorStop(0, '#090b10');
    bgGrad.addColorStop(1, '#10141f');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, waterfallH);

    // Subtle vertical black-key and octave lanes (with clearer Middle C4 anchor)
    for (let i = 0; i < blackRects.length; i++) {
      const r = blackRects[i];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
      ctx.fillRect(r.x, 0, r.w, waterfallH);
    }

    for (let i = 0; i < whiteRects.length; i++) {
      const r = whiteRects[i];
      if (r.midi === 60) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.045)';
        ctx.fillRect(r.x, 0, r.w, waterfallH);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.fillRect(Math.round(r.x), 0, 1, waterfallH);
      } else if (r.midi % 12 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fillRect(Math.round(r.x), 0, 1, waterfallH);
      } else if (r.midi % 12 === 5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(Math.round(r.x), 0, 1, waterfallH);
      }
    }

    // Subtle horizontal beat/second grid lines
    const pxPerSec = waterfallH / LOOKAHEAD_SEC;
    const gridStep = 1.0;
    const firstGrid = Math.ceil(currentTime / gridStep) * gridStep;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let gt = firstGrid; gt <= currentTime + LOOKAHEAD_SEC; gt += gridStep) {
      const gy = waterfallH - (gt - currentTime) * pxPerSec;
      if (gy >= 0 && gy <= waterfallH) {
        ctx.fillRect(0, Math.round(gy), canvasW, 1);
      }
    }

    // 2. Falling notes + active key tracking
    const songActiveKeys = new Map(); // midi -> hand
    if (currentSong) {
      const notes = currentSong.notes;
      const winStart = currentTime - 0.05;
      const winEnd = currentTime + LOOKAHEAD_SEC + 0.1;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvasW, waterfallH);
      ctx.clip();

      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > winEnd) break;
        const noteEnd = n.time + n.duration;
        if (noteEnd < winStart) continue;

        const rect = keyRects.get(n.midi);
        if (!rect) continue;

        const enabled = isHandEnabled(n.hand);
        const hitting = currentTime >= n.time && currentTime <= noteEnd;
        if (hitting && enabled) {
          songActiveKeys.set(n.midi, n.hand);
        }

        const yBottom = waterfallH - (n.time - currentTime) * pxPerSec;
        const yTop = waterfallH - (noteEnd - currentTime) * pxPerSec;
        const barH = Math.max(10, yBottom - yTop);
        const pad = rect.black ? Math.max(1, rect.w * 0.05) : Math.max(1.5, rect.w * 0.08);
        const bx = rect.x + pad;
        const bw = Math.max(3, rect.w - pad * 2);

        const isLeft = n.hand === 'left';
        let fillTop, fillBot, strokeCol;
        if (isLeft) {
          fillTop = rect.black ? '#8b5cf6' : '#c4b5fd';
          fillBot = rect.black ? '#6d28d9' : '#8b5cf6';
          strokeCol = rect.black ? 'rgba(221, 214, 254, 0.6)' : 'rgba(255, 255, 255, 0.28)';
        } else {
          fillTop = rect.black ? '#0ea5e9' : '#7dd3fc';
          fillBot = rect.black ? '#0369a1' : '#0ea5e9';
          strokeCol = rect.black ? 'rgba(186, 230, 253, 0.6)' : 'rgba(255, 255, 255, 0.28)';
        }

        ctx.globalAlpha = enabled ? 1 : 0.16;

        if (hitting && enabled) {
          ctx.shadowColor = isLeft ? 'rgba(167, 139, 250, 0.8)' : 'rgba(56, 189, 248, 0.8)';
          ctx.shadowBlur = 18;
        } else {
          ctx.shadowBlur = 0;
        }

        const grad = ctx.createLinearGradient(bx, yTop, bx, yBottom);
        grad.addColorStop(0, fillTop);
        grad.addColorStop(1, fillBot);
        ctx.fillStyle = grad;

        drawRoundedRect(bx, yTop, bw, barH, Math.min(6, bw * 0.35));
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Crisp note label on the falling bar (easy to read from a real piano music stand)
        if (enabled && bw >= 16 && barH >= 16) {
          const info = MIDI_INFO[n.midi];
          const label = bw >= 28 ? info.fullName : info.noteName;
          const fs = clamp(bw * (label.length > 2 ? 0.34 : 0.44), 8.5, 12.5);
          ctx.font = '700 ' + fs.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = rect.black ? 'rgba(255, 255, 255, 0.96)' : 'rgba(11, 13, 18, 0.86)';
          ctx.fillText(label, bx + bw * 0.5, Math.min(yBottom - 3, waterfallH - 3));
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 3. Particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 4. Hit line
    const lineGrad = ctx.createLinearGradient(0, waterfallH - 3, 0, waterfallH + 1);
    lineGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    lineGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.36)');
    lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0.25)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(0, waterfallH - 3, canvasW, 4);

    // 5. Piano keyboard (white keys)
    const pulse = 0.55 + 0.45 * Math.sin(nowMs * 0.008);
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, waterfallH, canvasW, keyHeight);

    for (let i = 0; i < whiteRects.length; i++) {
      const r = whiteRects[i];
      const userState = userActiveKeys.get(r.midi);
      const songHand = songActiveKeys.get(r.midi);
      const isWaiting = waitingForInput && waitingLearnMidis.has(r.midi);
      const pressed = !!userState || !!songHand;

      const x = r.x + 0.6;
      const w = Math.max(1, r.w - 1.2);
      const h = r.h - 2;

      const kg = ctx.createLinearGradient(0, r.y, 0, r.y + h);
      if (userState) {
        if (userState.hitGood) {
          kg.addColorStop(0, '#6ee7b7');
          kg.addColorStop(1, '#10b981');
        } else {
          kg.addColorStop(0, '#7dd3fc');
          kg.addColorStop(1, '#0284c7');
        }
      } else if (songHand === 'left') {
        kg.addColorStop(0, '#ddd6fe');
        kg.addColorStop(1, '#8b5cf6');
      } else if (songHand === 'right') {
        kg.addColorStop(0, '#bae6fd');
        kg.addColorStop(1, '#0ea5e9');
      } else if (isWaiting) {
        kg.addColorStop(0, '#fef08a');
        kg.addColorStop(1, 'rgba(250, 204, 21, ' + (0.65 + pulse * 0.35) + ')');
      } else if (r.midi === 60) {
        kg.addColorStop(0, '#eef6fc');
        kg.addColorStop(0.14, '#f8fbff');
        kg.addColorStop(1, '#d7e7f5');
      } else {
        kg.addColorStop(0, '#e5e9f0');
        kg.addColorStop(0.12, '#f8fafc');
        kg.addColorStop(1, '#dce2ec');
      }

      ctx.fillStyle = kg;
      drawRoundedRect(x, r.y + (pressed ? 2 : 0), w, h - (pressed ? 2 : 0), Math.min(5, w * 0.25));
      ctx.fill();

      // Key name label
      const info = MIDI_INFO[r.midi];
      const isC = r.midi % 12 === 0;
      const isMidC = r.midi === 60;
      let whiteLabel = '';
      if (w >= 28) {
        whiteLabel = info.fullName;
      } else if (w >= 14) {
        whiteLabel = isC ? info.fullName : info.noteName;
      } else if (isC && w >= 7) {
        whiteLabel = info.fullName;
      }

      if (whiteLabel) {
        const fontSize = clamp(w * (whiteLabel.length > 1 ? 0.36 : 0.45), 8.5, 13);
        ctx.font = (isC ? '700 ' : '600 ') + fontSize.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        if (pressed) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        } else if (isWaiting) {
          ctx.fillStyle = '#0f172a';
        } else if (isMidC) {
          ctx.fillStyle = '#0284c7';
        } else {
          ctx.fillStyle = isC ? '#0f172a' : '#475569';
        }
        ctx.fillText(whiteLabel, x + w * 0.5, r.y + h - (pressed ? 6 : 8));
      }
    }

    // 6. Piano keyboard (black keys)
    for (let i = 0; i < blackRects.length; i++) {
      const r = blackRects[i];
      const userState = userActiveKeys.get(r.midi);
      const songHand = songActiveKeys.get(r.midi);
      const isWaiting = waitingForInput && waitingLearnMidis.has(r.midi);
      const pressed = !!userState || !!songHand;

      const x = r.x;
      const w = r.w;
      const h = r.h;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      drawRoundedRect(x + 1, r.y + 3, w, h, Math.min(4, w * 0.28));
      ctx.fill();

      const bg = ctx.createLinearGradient(0, r.y, 0, r.y + h);
      if (userState) {
        if (userState.hitGood) {
          bg.addColorStop(0, '#34d399');
          bg.addColorStop(1, '#059669');
        } else {
          bg.addColorStop(0, '#38bdf8');
          bg.addColorStop(1, '#0369a1');
        }
      } else if (songHand === 'left') {
        bg.addColorStop(0, '#a78bfa');
        bg.addColorStop(1, '#5b21b6');
      } else if (songHand === 'right') {
        bg.addColorStop(0, '#38bdf8');
        bg.addColorStop(1, '#0369a1');
      } else if (isWaiting) {
        bg.addColorStop(0, '#fde047');
        bg.addColorStop(1, 'rgba(234, 179, 8, ' + (0.7 + pulse * 0.3) + ')');
      } else {
        bg.addColorStop(0, '#2a303f');
        bg.addColorStop(0.75, '#12151d');
        bg.addColorStop(1, '#1d2230');
      }

      ctx.fillStyle = bg;
      drawRoundedRect(x, r.y + (pressed ? 1.5 : 0), w, h - (pressed ? 1.5 : 0), Math.min(4, w * 0.28));
      ctx.fill();

      // Subtle bevel highlight
      if (!pressed && !isWaiting && w >= 6) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x + 1.5, r.y + 2, Math.max(1, w - 3), Math.max(4, h - 10));
      }

      // Black key name label
      if (w >= 13) {
        const info = MIDI_INFO[r.midi];
        const fontSize = clamp(w * 0.44, 7.5, 11);
        ctx.font = '600 ' + fontSize.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = isWaiting ? '#0f172a' : (pressed ? '#ffffff' : 'rgba(226, 232, 240, 0.82)');
        ctx.fillText(info.noteName, x + w * 0.5, r.y + h - (pressed ? 5 : 7));
      }
    }

    // Subtle keybed overhang shadow
    const overhang = ctx.createLinearGradient(0, waterfallH, 0, waterfallH + 10);
    overhang.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    overhang.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = overhang;
    ctx.fillRect(0, waterfallH, canvasW, 10);
  }

  // Animation loop
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    update(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  // Pointer interaction on canvas:
  // Piano region -> multi-touch playing + glissando
  // Waterfall region -> 1-finger pan, 2-finger pinch zoom
  const waterfallPointers = new Map(); // pointerId -> { x, y }
  let pinchState = null;

  function updatePinchState() {
    if (waterfallPointers.size === 2) {
      const pts = Array.from(waterfallPointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) * 0.5;
      pinchState = {
        dist: Math.max(10, dist),
        midX,
        startSpan: targetEnd - targetStart,
        startViewStart: targetStart
      };
    } else {
      pinchState = null;
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    closeSongMenu();
    PianoApp.audio.ensureContext();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midi = keyAtPoint(x, y);
    if (midi !== null) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      pointerKeys.set(e.pointerId, midi);
      userNoteOn(midi, 0.84);
    } else {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      waterfallPointers.set(e.pointerId, { x, y });
      updatePinchState();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (pointerKeys.has(e.pointerId)) {
      const nextMidi = keyAtPoint(x, y);
      const prevMidi = pointerKeys.get(e.pointerId);
      if (nextMidi !== prevMidi) {
        if (prevMidi !== null) userNoteOff(prevMidi);
        pointerKeys.set(e.pointerId, nextMidi);
        if (nextMidi !== null) userNoteOn(nextMidi, 0.8);
      }
      return;
    }

    if (waterfallPointers.has(e.pointerId)) {
      const prev = waterfallPointers.get(e.pointerId);
      waterfallPointers.set(e.pointerId, { x, y });

      if (waterfallPointers.size === 2 && pinchState) {
        const pts = Array.from(waterfallPointers.values());
        const dist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const scale = pinchState.dist / dist;
        const minSpan = getMinSpan();
        const nextSpan = clamp(pinchState.startSpan * scale, minSpan, TOTAL_WHITES);
        const anchorRatio = clamp(pinchState.midX / Math.max(1, canvasW), 0, 1);
        const anchorWhite = pinchState.startViewStart + pinchState.startSpan * anchorRatio;
        const curMidX = (pts[0].x + pts[1].x) * 0.5;
        const panShift = ((pinchState.midX - curMidX) / Math.max(1, canvasW)) * nextSpan;
        let s = anchorWhite - nextSpan * anchorRatio + panShift;
        let end = s + nextSpan;
        if (s < 0) {
          end -= s;
          s = 0;
        }
        if (end > TOTAL_WHITES) {
          s -= end - TOTAL_WHITES;
          end = TOTAL_WHITES;
        }
        targetStart = clamp(s, 0, TOTAL_WHITES - minSpan);
        targetEnd = clamp(end, targetStart + minSpan, TOTAL_WHITES);
        fullScaleMode = targetStart <= 0.1 && targetEnd >= TOTAL_WHITES - 0.1;
        fullScaleBtn.classList.toggle('active', fullScaleMode);
      } else if (waterfallPointers.size === 1) {
        const dx = x - prev.x;
        const span = targetEnd - targetStart;
        panBy((-dx / Math.max(1, canvasW)) * span);
      }
    }
  });

  function releasePointer(e) {
    if (pointerKeys.has(e.pointerId)) {
      const prevMidi = pointerKeys.get(e.pointerId);
      pointerKeys.delete(e.pointerId);
      if (prevMidi !== null) userNoteOff(prevMidi);
    }
    if (waterfallPointers.has(e.pointerId)) {
      waterfallPointers.delete(e.pointerId);
      updatePinchState();
    }
  }

  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  // One-time mobile audio unlock on first touch
  global.addEventListener(
    'touchstart',
    () => PianoApp.audio.ensureContext(),
    { once: true, passive: true }
  );

  // Wheel zoom / pan on canvas
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        panBy(dx * 0.02);
      } else {
        const rect = canvas.getBoundingClientRect();
        const anchor = (e.clientX - rect.left) / Math.max(1, rect.width);
        zoomBy(e.deltaY > 0 ? 4 : -4, anchor);
      }
    },
    { passive: false }
  );

  // Computer keyboard controls
  global.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.repeat) return;

    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!playing);
      return;
    }
    if (e.code === 'ArrowLeft') {
      baseOctave = Math.max(1, baseOctave - 1);
      return;
    }
    if (e.code === 'ArrowRight') {
      baseOctave = Math.min(6, baseOctave + 1);
      return;
    }
    if (e.code === 'Escape') {
      closeSongMenu();
      return;
    }

    if (KEY_MAP[e.code] !== undefined && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const midi = (baseOctave + 1) * 12 + KEY_MAP[e.code];
      if (midi >= MIN_MIDI && midi <= MAX_MIDI) {
        keyboardKeys.set(e.code, midi);
        userNoteOn(midi, 0.82);
      }
    }
  });

  global.addEventListener('keyup', (e) => {
    if (keyboardKeys.has(e.code)) {
      const midi = keyboardKeys.get(e.code);
      keyboardKeys.delete(e.code);
      userNoteOff(midi);
    }
  });

  global.addEventListener('blur', () => {
    keyboardKeys.forEach((midi) => userNoteOff(midi));
    keyboardKeys.clear();
  });

  // UI event wiring
  songBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (songMenu.hidden) openSongMenu();
    else closeSongMenu();
  });

  document.addEventListener('click', (e) => {
    if (!songPicker.contains(e.target)) closeSongMenu();
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  recordBtn.addEventListener('click', toggleRecording);

  restartBtn.addEventListener('click', () => {
    seekTo(-LEAD_IN);
    setPlaying(true);
  });

  playBtn.addEventListener('click', () => setPlaying(!playing));

  loopBtn.addEventListener('click', () => {
    loopMode = !loopMode;
    loopBtn.classList.toggle('active', loopMode);
  });

  learnBtn.addEventListener('click', () => {
    learnMode = !learnMode;
    learnBtn.classList.toggle('active', learnMode);
    if (!learnMode) {
      waitingForInput = false;
      waitingLearnMidis.clear();
    } else {
      satisfiedLearnNotes.clear();
      if (currentSong) {
        for (let i = 0; i < currentSong.notes.length; i++) {
          if (currentSong.notes[i].time < currentTime - 0.01) {
            satisfiedLearnNotes.add(i);
          }
        }
      }
    }
  });

  speedSlider.addEventListener('input', () => {
    speed = parseFloat(speedSlider.value) || 1.0;
  });

  leftHandBtn.addEventListener('click', () => {
    if (leftHandOn && !rightHandOn) return;
    leftHandOn = !leftHandOn;
    leftHandBtn.classList.toggle('active', leftHandOn);
    if (learnMode) refreshLearnWaitState();
  });

  rightHandBtn.addEventListener('click', () => {
    if (rightHandOn && !leftHandOn) return;
    rightHandOn = !rightHandOn;
    rightHandBtn.classList.toggle('active', rightHandOn);
    if (learnMode) refreshLearnWaitState();
  });

  zoomOutBtn.addEventListener('click', () => zoomBy(6));
  zoomInBtn.addEventListener('click', () => zoomBy(-6));
  fullScaleBtn.addEventListener('click', () => {
    fullScaleMode = !fullScaleMode;
    applyScaleTarget(false);
  });

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    PianoApp.audio.setMuted(muted);
    soundOnIcon.hidden = muted;
    soundOffIcon.hidden = !muted;
  });

  // Progress bar scrubbing
  let scrubbing = false;
  function scrubFromClientX(clientX) {
    if (!currentSong || currentSong.duration <= 0) return;
    const rect = progressWrap.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * currentSong.duration);
  }

  progressWrap.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    progressWrap.classList.add('dragging');
    progressWrap.setPointerCapture(e.pointerId);
    scrubFromClientX(e.clientX);
  });

  progressWrap.addEventListener('pointermove', (e) => {
    if (scrubbing) scrubFromClientX(e.clientX);
  });

  progressWrap.addEventListener('pointerup', () => {
    scrubbing = false;
    progressWrap.classList.remove('dragging');
  });

  progressWrap.addEventListener('pointercancel', () => {
    scrubbing = false;
    progressWrap.classList.remove('dragging');
  });

  // Drag-and-drop file upload anywhere on the window
  let dragDepth = 0;
  global.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
  });

  global.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  global.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });

  global.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Web MIDI setup
  PianoApp.midi.init({
    onNoteOn: (midi, vel) => userNoteOn(midi, vel),
    onNoteOff: (midi) => userNoteOff(midi),
    onSustain: (down) => PianoApp.audio.setSustain(down),
    onStatusChange: (connected) => {
      midiDot.hidden = !connected;
    }
  });

  // Initialize
  global.addEventListener('resize', resize);
  global.addEventListener('orientationchange', () => setTimeout(resize, 80));
  if (global.visualViewport) {
    global.visualViewport.addEventListener('resize', resize);
  }
  resize();
  selectSong(currentSong, false);
  applyScaleTarget(true);
  computeKeyLayout();
  requestAnimationFrame(frame);
})(window);
