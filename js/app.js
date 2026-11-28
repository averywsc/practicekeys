(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});

  const MIN_MIDI = 21; // A0
  const MAX_MIDI = 108; // C8
  const LEAD_IN = 2.4;
  const LOOKAHEAD_SEC = 3.2;
  const COUNTDOWN_SEC = 5.0;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
  const EARLY_LEARN_WINDOW = 0.15;

  const PREFS_KEY = 'practicekeys_prefs_v1';
  const FAVS_KEY = 'practicekeys_favs_v1';

  const THEMES = [
    {
      rh: '#38bdf8', rhTop: '#7dd3fc', rhBot: '#0284c7', rhBlackTop: '#0ea5e9', rhBlackBot: '#0369a1', rhRgb: '56, 189, 248', rhKeyTop: '#bae6fd',
      lh: '#a78bfa', lhTop: '#c4b5fd', lhBot: '#7c3aed', lhBlackTop: '#8b5cf6', lhBlackBot: '#5b21b6', lhRgb: '167, 139, 250', lhKeyTop: '#ddd6fe'
    },
    {
      rh: '#fbbf24', rhTop: '#fde68a', rhBot: '#d97706', rhBlackTop: '#f59e0b', rhBlackBot: '#b45309', rhRgb: '251, 191, 36', rhKeyTop: '#fef3c7',
      lh: '#fb7185', lhTop: '#fda4af', lhBot: '#e11d48', lhBlackTop: '#f43f5e', lhBlackBot: '#be123c', lhRgb: '251, 113, 133', lhKeyTop: '#ffe4e6'
    },
    {
      rh: '#34d399', rhTop: '#6ee7b7', rhBot: '#059669', rhBlackTop: '#10b981', rhBlackBot: '#047857', rhRgb: '52, 211, 153', rhKeyTop: '#d1fae5',
      lh: '#38bdf8', lhTop: '#7dd3fc', lhBot: '#0284c7', lhBlackTop: '#0ea5e9', lhBlackBot: '#0369a1', lhRgb: '56, 189, 248', lhKeyTop: '#bae6fd'
    },
    {
      rh: '#f5d08a', rhTop: '#fef0c7', rhBot: '#b58432', rhBlackTop: '#d9a44b', rhBlackBot: '#8f631f', rhRgb: '245, 208, 138', rhKeyTop: '#fef3c7',
      lh: '#94a3b8', lhTop: '#cbd5e1', lhBot: '#475569', lhBlackTop: '#64748b', lhBlackBot: '#334155', lhRgb: '148, 163, 184', lhKeyTop: '#e2e8f0'
    }
  ];

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
  const songSearch = document.getElementById('songSearch');
  const songListEl = document.getElementById('songList');

  const uploadBtn = document.getElementById('uploadBtn');
  const fileInput = document.getElementById('fileInput');
  const recordBtn = document.getElementById('recordBtn');
  const tuneBtn = document.getElementById('tuneBtn');
  const tunePanel = document.getElementById('tunePanel');

  const restartBtn = document.getElementById('restartBtn');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const nextBtn = document.getElementById('nextBtn');
  const loopBtn = document.getElementById('loopBtn');
  const loopAbDot = document.getElementById('loopAbDot');
  const learnBtn = document.getElementById('learnBtn');
  const speedSlider = document.getElementById('speedSlider');
  const speedPop = document.getElementById('speedPop');
  const metroBtn = document.getElementById('metroBtn');
  const micBtn = document.getElementById('micBtn');
  const themeBtn = document.getElementById('themeBtn');

  const leftHandBtn = document.getElementById('leftHandBtn');
  const rightHandBtn = document.getElementById('rightHandBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const fullScaleBtn = document.getElementById('fullScaleBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const muteBtn = document.getElementById('muteBtn');
  const soundOnIcon = document.getElementById('soundOnIcon');
  const soundOffIcon = document.getElementById('soundOffIcon');
  const fsBtn = document.getElementById('fsBtn');
  const fsEnterIcon = document.getElementById('fsEnterIcon');
  const fsExitIcon = document.getElementById('fsExitIcon');
  const midiDot = document.getElementById('midiDot');

  const progressWrap = document.getElementById('progressWrap');
  const progressTrack = document.getElementById('progressTrack');
  const loopRegion = document.getElementById('loopRegion');
  const progressFill = document.getElementById('progressFill');
  const progressThumb = document.getElementById('progressThumb');
  const loopHandleA = document.getElementById('loopHandleA');
  const loopHandleB = document.getElementById('loopHandleB');
  const dropOverlay = document.getElementById('dropOverlay');

  const countdownOverlay = document.getElementById('countdownOverlay');
  const countdownCard = document.getElementById('countdownCard');
  const countdownRing = document.getElementById('countdownRing');
  const countdownNum = document.getElementById('countdownNum');
  const countdownSong = document.getElementById('countdownSong');

  // Persistence helpers
  function loadPrefs() {
    try {
      return JSON.parse(global.localStorage.getItem(PREFS_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function loadFavs() {
    try {
      const arr = JSON.parse(global.localStorage.getItem(FAVS_KEY) || '[]');
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveFavs() {
    try {
      global.localStorage.setItem(FAVS_KEY, JSON.stringify(Array.from(favIds)));
    } catch (_) {}
  }

  const savedPrefs = loadPrefs();
  const favIds = loadFavs();

  // Application state
  const builtInSongs = PianoApp.songs.createBuiltInSongs();
  let customSongs = PianoApp.songs.loadCustomSongs();
  let allSongs = [];

  function rebuildSongOrder() {
    const combined = customSongs.concat(builtInSongs);
    const starred = combined.filter((s) => favIds.has(s.id));
    const rest = combined.filter((s) => !favIds.has(s.id));
    allSongs = starred.concat(rest);
  }
  rebuildSongOrder();

  let currentSong = allSongs.find((s) => s.id === savedPrefs.songId) || builtInSongs[0];
  let themeIdx = Number.isFinite(savedPrefs.themeIdx) ? savedPrefs.themeIdx % THEMES.length : 0;
  let theme = THEMES[themeIdx];

  let playing = false;
  let loopState = savedPrefs.loopState === 1 ? 1 : 0; // 0 = off, 1 = song loop, 2 = A-B section loop
  let loopA = 0;
  let loopB = 0;
  let learnMode = !!savedPrefs.learnMode;
  let metroOn = !!savedPrefs.metroOn;
  let lastBeatIndex = -999;
  let speed = Number.isFinite(savedPrefs.speed) ? clampVal(savedPrefs.speed, 0.2, 1.5) : 1.0;
  let muted = false;
  let leftHandOn = savedPrefs.leftHandOn !== false;
  let rightHandOn = savedPrefs.rightHandOn !== false;
  if (!leftHandOn && !rightHandOn) rightHandOn = true;
  let scalePreset = Number.isFinite(savedPrefs.scalePreset) ? savedPrefs.scalePreset % 3 : 0;
  let manualZoomed = scalePreset > 0;
  let customKeyRatio = Number.isFinite(savedPrefs.keyRatio) ? clampVal(savedPrefs.keyRatio, 0.11, 0.44) : null;

  let currentTime = -LEAD_IN;
  let triggeredNotes = new Set();
  let satisfiedLearnNotes = new Set();
  let waitingLearnMidis = new Set();
  let waitingForInput = false;
  let learnStreak = 0;

  // 5-second countdown between songs
  let countdownActive = false;
  let countdownRemaining = 0;
  let lastCountdownTick = 0;

  function clampVal(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function savePrefs() {
    try {
      global.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          songId: currentSong ? currentSong.id : null,
          themeIdx,
          speed,
          metroOn,
          learnMode,
          leftHandOn,
          rightHandOn,
          scalePreset,
          loopState: loopState === 1 ? 1 : 0,
          keyRatio: customKeyRatio
        })
      );
    } catch (_) {}
  }

  function applyTheme(idx) {
    themeIdx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
    theme = THEMES[themeIdx];
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--rh', theme.rh);
    rootStyle.setProperty('--lh', theme.lh);
    rootStyle.setProperty('--accent', theme.rh);
    savePrefs();
  }

  // Screen Wake Lock (keeps phone/tablet awake on a piano music stand)
  let wakeLockSentinel = null;
  async function syncWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      if ((playing || countdownActive) && document.visibilityState === 'visible') {
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
    if (document.visibilityState === 'visible' && (playing || countdownActive)) {
      syncWakeLock();
    }
  });

  // Piano viewport range in white-key coordinates [0..52]
  let viewStart = 0;
  let viewEnd = TOTAL_WHITES;
  let targetStart = 0;
  let targetEnd = TOTAL_WHITES;
  let panVelocity = 0;

  // Interaction & visual animation state
  let baseOctave = 4; // C4 = MIDI 60
  const userActiveKeys = new Map(); // midi -> { count, hitGood, hitWrong, time }
  const wrongKeyFlash = new Map(); // midi -> remaining sec
  const keyDepth = new Float32Array(128);
  const pointerKeys = new Map(); // pointerId -> midi
  const keyboardKeys = new Map(); // code -> midi
  const particles = [];
  const impactRings = [];

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
  let songNoteWhites = [];

  const clamp = clampVal;

  function haptic(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms || 6); } catch (_) {}
    }
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
    panVelocity = 0;
    if (scalePreset === 2) {
      targetStart = 0;
      targetEnd = TOTAL_WHITES;
    } else if (scalePreset === 1) {
      targetStart = 9;
      targetEnd = 45;
    } else {
      const range = computeSongRange(currentSong);
      targetStart = range.start;
      targetEnd = range.end;
    }
    if (instant) {
      viewStart = targetStart;
      viewEnd = targetEnd;
    }
    fullScaleBtn.classList.toggle('active', scalePreset > 0);
  }

  function zoomBy(deltaWhites, anchorRatio) {
    panVelocity = 0;
    manualZoomed = true;
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
    scalePreset = (targetStart <= 0.1 && targetEnd >= TOTAL_WHITES - 0.1) ? 2 : 0;
    fullScaleBtn.classList.toggle('active', scalePreset > 0);
  }

  function panBy(deltaWhites) {
    const span = targetEnd - targetStart;
    if (span >= TOTAL_WHITES - 0.05) return;
    let s = targetStart + deltaWhites;
    let e = targetEnd + deltaWhites;
    if (s < 0) {
      e -= s;
      s = 0;
      panVelocity = 0;
    }
    if (e > TOTAL_WHITES) {
      s -= e - TOTAL_WHITES;
      e = TOTAL_WHITES;
      panVelocity = 0;
    }
    targetStart = s;
    targetEnd = e;
  }

  function panCenterToWhite(whitePos) {
    const span = targetEnd - targetStart;
    if (span >= TOTAL_WHITES - 0.05) return;
    let s = whitePos - span * 0.5;
    let e = s + span;
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
    panVelocity = 0;
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

  function updateHeights() {
    if (customKeyRatio !== null) {
      keyHeight = clamp(Math.round(canvasH * customKeyRatio), 68, Math.round(canvasH * 0.45));
    } else if (canvasH < 480) {
      keyHeight = clamp(Math.round(canvasH * 0.34), 102, 150);
    } else if (canvasW < 640 && canvasH > canvasW) {
      keyHeight = clamp(Math.round(canvasH * 0.27), 144, 232);
    } else {
      keyHeight = clamp(Math.round(canvasH * 0.24), 126, 208);
    }
    waterfallH = Math.max(100, canvasH - keyHeight);
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 3);
    canvasW = Math.max(1, rect.width);
    canvasH = Math.max(1, rect.height);
    canvas.width = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    updateHeights();

    if (!manualZoomed && scalePreset === 0) {
      applyScaleTarget(false);
    }
  }

  function syncPlayIcons() {
    const active = playing || countdownActive;
    playIcon.hidden = active;
    pauseIcon.hidden = !active;
  }

  function syncLoopUI() {
    loopBtn.classList.toggle('active', loopState === 1);
    loopBtn.classList.toggle('ab-active', loopState === 2);
    loopAbDot.hidden = loopState !== 2;

    const showAB = loopState === 2 && currentSong && currentSong.duration > 0;
    progressWrap.classList.toggle('has-ab', !!showAB);
    loopRegion.hidden = !showAB;
    loopHandleA.hidden = !showAB;
    loopHandleB.hidden = !showAB;

    if (showAB) {
      const aPct = clamp(loopA / currentSong.duration, 0, 1) * 100;
      const bPct = clamp(loopB / currentSong.duration, 0, 1) * 100;
      loopRegion.style.left = aPct.toFixed(2) + '%';
      loopRegion.style.width = Math.max(0.5, bPct - aPct).toFixed(2) + '%';
      loopHandleA.style.left = aPct.toFixed(2) + '%';
      loopHandleB.style.left = bPct.toFixed(2) + '%';
    }
  }

  function rebuildSongMinimap() {
    const seen = new Set();
    songNoteWhites = [];
    if (!currentSong) return;
    for (let i = 0; i < currentSong.notes.length; i++) {
      const m = currentSong.notes[i].midi;
      if (!seen.has(m)) {
        seen.add(m);
        songNoteWhites.push({ pos: midiToWhitePos(m), hand: currentSong.notes[i].hand });
      }
    }
  }

  function cancelCountdown() {
    countdownActive = false;
    countdownRemaining = 0;
    lastCountdownTick = 0;
    countdownOverlay.hidden = true;
    syncPlayIcons();
    syncWakeLock();
  }

  function startBetweenSongCountdown(nextSong) {
    if (!nextSong) return;
    currentSong = nextSong;
    songTitle.textContent = nextSong.name;
    playing = false;
    PianoApp.audio.stopAll('song:');
    rebuildSongMinimap();
    if (loopState === 2) {
      loopState = 1;
      syncLoopUI();
    }
    seekTo(-LEAD_IN);
    manualZoomed = scalePreset > 0;
    if (scalePreset === 0) applyScaleTarget(false);
    renderSongList();
    savePrefs();

    countdownActive = true;
    countdownRemaining = COUNTDOWN_SEC;
    lastCountdownTick = Math.ceil(COUNTDOWN_SEC);
    countdownSong.textContent = nextSong.name;
    updateCountdownVisual();
    countdownOverlay.hidden = false;
    syncPlayIcons();
    syncWakeLock();
  }

  function updateCountdownVisual() {
    const secs = Math.max(1, Math.ceil(countdownRemaining));
    if (secs !== lastCountdownTick) {
      lastCountdownTick = secs;
      if (metroOn && secs <= 3) {
        PianoApp.audio.playClick(secs === 1);
      }
    }
    countdownNum.textContent = String(secs);
    const frac = clamp(1 - countdownRemaining / COUNTDOWN_SEC, 0, 1);
    countdownRing.style.strokeDashoffset = (frac * RING_CIRCUMFERENCE).toFixed(2);
  }

  function finishCountdownAndPlay() {
    countdownActive = false;
    countdownRemaining = 0;
    countdownOverlay.hidden = true;
    setPlaying(true);
  }

  function setPlaying(next) {
    if (next && countdownActive) {
      finishCountdownAndPlay();
      return;
    }
    if (!next && countdownActive) {
      cancelCountdown();
      return;
    }
    playing = !!next;
    syncPlayIcons();
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
    lastBeatIndex = Math.floor(currentTime / (60 / (currentSong.bpm || 100)));
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

  function getNextSong() {
    if (!allSongs.length) return currentSong;
    const idx = allSongs.findIndex((s) => currentSong && s.id === currentSong.id);
    return allSongs[(idx + 1 + allSongs.length) % allSongs.length];
  }

  function selectSong(song, autoPlay) {
    cancelCountdown();
    currentSong = song;
    songTitle.textContent = song.name;
    learnStreak = 0;
    rebuildSongMinimap();
    if (loopState === 2) {
      loopState = 0;
    }
    setPlaying(false);
    seekTo(-LEAD_IN);
    syncLoopUI();
    manualZoomed = scalePreset > 0;
    if (scalePreset === 0) applyScaleTarget(false);
    renderSongList();
    savePrefs();
    if (autoPlay) setPlaying(true);
  }

  function downloadSongMidi(song) {
    try {
      const blob = PianoApp.parsers.exportMidi(song);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = song.name.replace(/[^a-z0-9 _-]+/gi, '').trim() + '.mid';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (_) {}
  }

  function toggleFavorite(songId) {
    if (favIds.has(songId)) favIds.delete(songId);
    else favIds.add(songId);
    saveFavs();
    rebuildSongOrder();
    renderSongList();
  }

  function renderSongList() {
    const query = (songSearch.value || '').trim().toLowerCase();
    songListEl.innerHTML = '';

    const filtered = allSongs.filter((s) => !query || s.name.toLowerCase().includes(query));
    const starred = filtered.filter((s) => favIds.has(s.id));
    const unstarredCustom = filtered.filter((s) => !favIds.has(s.id) && s.custom);
    const unstarredBuiltIn = filtered.filter((s) => !favIds.has(s.id) && !s.custom);

    function addRow(song) {
      const isFav = favIds.has(song.id);
      const row = document.createElement('div');
      row.className = 'song-item' + (currentSong && currentSong.id === song.id ? ' active' : '');
      row.setAttribute('role', 'button');
      row.tabIndex = 0;

      const label = document.createElement('span');
      label.className = 'song-item-name';
      label.textContent = song.name;
      row.appendChild(label);

      const actions = document.createElement('span');
      actions.className = 'song-actions';

      const star = document.createElement('button');
      star.className = 'song-act song-star' + (isFav ? ' starred' : '');
      star.setAttribute('aria-label', 'Favorite');
      star.innerHTML = isFav
        ? '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
        : '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(song.id);
      });
      actions.appendChild(star);

      if (song.custom) {
        const dl = document.createElement('button');
        dl.className = 'song-act';
        dl.setAttribute('aria-label', 'Download');
        dl.innerHTML =
          '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        dl.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadSongMidi(song);
        });
        actions.appendChild(dl);

        const del = document.createElement('button');
        del.className = 'song-act song-del';
        del.setAttribute('aria-label', 'Remove');
        del.innerHTML =
          '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          removeCustomSong(song.id);
        });
        actions.appendChild(del);
      }

      row.appendChild(actions);
      row.addEventListener('click', () => {
        closeSongMenu();
        selectSong(song, false);
      });
      songListEl.appendChild(row);
    }

    function addDivider() {
      const div = document.createElement('div');
      div.className = 'song-divider';
      songListEl.appendChild(div);
    }

    for (const s of starred) addRow(s);
    if (starred.length && (unstarredCustom.length || unstarredBuiltIn.length)) addDivider();
    for (const s of unstarredCustom) addRow(s);
    if (unstarredCustom.length && unstarredBuiltIn.length) addDivider();
    for (const s of unstarredBuiltIn) addRow(s);
  }

  function removeCustomSong(id) {
    customSongs = customSongs.filter((s) => s.id !== id);
    favIds.delete(id);
    saveFavs();
    PianoApp.songs.saveCustomSongs(customSongs);
    rebuildSongOrder();
    if (currentSong && currentSong.id === id) {
      selectSong(allSongs[0], false);
    } else {
      renderSongList();
    }
  }

  function addCustomSong(song, autoSelect) {
    customSongs.unshift(song);
    PianoApp.songs.saveCustomSongs(customSongs);
    rebuildSongOrder();
    if (autoSelect) {
      selectSong(song, false);
    } else {
      renderSongList();
    }
  }

  function openSongMenu() {
    closeTunePanel();
    songMenu.hidden = false;
    songBtn.setAttribute('aria-expanded', 'true');
    const activeEl = songListEl.querySelector('.song-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeSongMenu() {
    songMenu.hidden = true;
    songBtn.setAttribute('aria-expanded', 'false');
    if (songSearch.value) {
      songSearch.value = '';
      renderSongList();
    }
  }

  function toggleTunePanel() {
    const next = !tunePanel.classList.contains('open');
    closeSongMenu();
    tunePanel.classList.toggle('open', next);
    tuneBtn.classList.toggle('active', next);
    tuneBtn.setAttribute('aria-expanded', String(next));
  }

  function closeTunePanel() {
    tunePanel.classList.remove('open');
    tuneBtn.classList.remove('active');
    tuneBtn.setAttribute('aria-expanded', 'false');
  }

  function isHandEnabled(hand) {
    return hand === 'left' ? leftHandOn : rightHandOn;
  }

  // User note input (mouse, touch, keyboard, MIDI, or acoustic mic)
  function userNoteOn(midi, velocity, silentAudio) {
    if (midi < MIN_MIDI || midi > MAX_MIDI) return;
    if (!silentAudio) {
      PianoApp.audio.noteOn(midi, velocity == null ? 0.82 : velocity, 'user');
      haptic(6);
    }

    let hitGood = false;
    let hitWrong = false;

    if (learnMode && currentSong && (playing || waitingForInput)) {
      if (trySatisfyLearnMidi(midi)) {
        hitGood = true;
        learnStreak++;
      } else if (waitingForInput) {
        hitWrong = true;
        learnStreak = 0;
        wrongKeyFlash.set(midi, 0.28);
      }
    }

    const existing = userActiveKeys.get(midi);
    userActiveKeys.set(midi, {
      count: existing ? existing.count + 1 : 1,
      hitGood,
      hitWrong,
      time: performance.now()
    });

    const color = hitGood ? '#34d399' : (hitWrong ? '#f43f5e' : theme.rh);
    spawnParticles(midi, color, hitGood ? 11 : 6);
    if (hitGood || !hitWrong) spawnImpactRing(midi, color);

    if (recording) {
      const now = performance.now();
      if (!recStartPerf) recStartPerf = now;
      const t = (now - recStartPerf) / 1000;
      recOpen.set(midi, { midi, time: t, velocity: velocity == null ? 0.82 : velocity });
    }
  }

  function userNoteOff(midi, silentAudio) {
    if (midi < MIN_MIDI || midi > MAX_MIDI) return;
    const existing = userActiveKeys.get(midi);
    if (existing) {
      if (existing.count <= 1) {
        userActiveKeys.delete(midi);
        if (!silentAudio) PianoApp.audio.noteOff(midi, 'user');
      } else {
        existing.count--;
      }
    } else if (!silentAudio) {
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

  // Accepts both waiting notes AND natural early hits (within EARLY_LEARN_WINDOW)
  function trySatisfyLearnMidi(midi) {
    if (!currentSong) return false;
    const notes = currentSong.notes;
    const maxLook = currentTime + EARLY_LEARN_WINDOW * speed;
    let matched = false;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > maxLook) break;
      if (satisfiedLearnNotes.has(i)) continue;
      if (n.midi === midi && isHandEnabled(n.hand)) {
        satisfiedLearnNotes.add(i);
        triggeredNotes.add(i);
        matched = true;
        break;
      }
    }

    if (matched) {
      refreshLearnWaitState();
    }
    return matched;
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
        x: cx + (Math.random() - 0.5) * rect.w * 0.72,
        y: waterfallH,
        vx: (Math.random() - 0.5) * 52,
        vy: -(34 + Math.random() * 76),
        r: 1.4 + Math.random() * 2.3,
        life: 1,
        color
      });
    }
    if (particles.length > 180) particles.splice(0, particles.length - 180);
  }

  function spawnImpactRing(midi, color) {
    const rect = keyRects.get(midi);
    if (!rect) return;
    impactRings.push({
      x: rect.x + rect.w * 0.5,
      y: waterfallH,
      r: Math.max(4, rect.w * 0.25),
      maxR: Math.max(18, rect.w * 1.15),
      life: 1,
      color
    });
    if (impactRings.length > 40) impactRings.shift();
  }

  // Recording toggle
  function toggleRecording() {
    if (!recording) {
      cancelCountdown();
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
    if (y < waterfallH + 3) return null;
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

  let speedPopTimer = null;
  function showSpeedPop() {
    speedPop.textContent = speed.toFixed(2).replace(/0$/, '') + 'x';
    speedPop.hidden = false;
    clearTimeout(speedPopTimer);
    speedPopTimer = setTimeout(() => {
      speedPop.hidden = true;
    }, 900);
  }

  // Main update loop
  function update(dt) {
    // Apply smooth pan inertia when not dragging
    if (Math.abs(panVelocity) > 0.05 && waterfallPointers.size === 0 && !minimapDragging) {
      panBy(panVelocity * dt);
      panVelocity *= Math.exp(-dt * 7.5);
    } else if (waterfallPointers.size === 0 && !minimapDragging) {
      panVelocity = 0;
    }

    // Smooth zoom/scale animation
    const ease = 1 - Math.exp(-dt * 11);
    viewStart += (targetStart - viewStart) * ease;
    viewEnd += (targetEnd - viewEnd) * ease;
    if (Math.abs(targetStart - viewStart) < 0.001) viewStart = targetStart;
    if (Math.abs(targetEnd - viewEnd) < 0.001) viewEnd = targetEnd;

    computeKeyLayout();

    // Decay wrong-key flash timers
    wrongKeyFlash.forEach((rem, midi) => {
      const next = rem - dt;
      if (next <= 0) wrongKeyFlash.delete(midi);
      else wrongKeyFlash.set(midi, next);
    });

    // Between-songs 5-second countdown
    if (countdownActive) {
      countdownRemaining -= dt;
      if (countdownRemaining <= 0) {
        finishCountdownAndPlay();
      } else {
        updateCountdownVisual();
      }
    } else if (playing && currentSong) {
      if (learnMode) {
        refreshLearnWaitState();
      }

      if (!waitingForInput) {
        const nextTime = currentTime + dt * speed;
        const notes = currentSong.notes;
        const beatSec = 60 / (currentSong.bpm || 100);
        const beatsPerBar = currentSong.beatsPerBar || 4;

        // Metronome click synced to musical beat grid
        if (metroOn) {
          const curBeat = Math.floor(nextTime / beatSec);
          if (curBeat > lastBeatIndex) {
            lastBeatIndex = curBeat;
            const mod = ((curBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
            PianoApp.audio.playClick(mod === 0);
          }
        }

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
              const playDur = (n.audioDuration || n.duration) / speed;
              PianoApp.audio.playTimedNote(n.midi, playDur, n.velocity * 0.72);
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
              const playDur = (n.audioDuration || n.duration) / speed;
              PianoApp.audio.playTimedNote(n.midi, playDur, n.velocity);
              const col = n.hand === 'left' ? theme.lh : theme.rh;
              spawnParticles(n.midi, col, 4);
              spawnImpactRing(n.midi, col);
            }
          }
          currentTime = nextTime;
        }

        // A-B section loop wrap
        if (loopState === 2 && loopB > loopA + 0.3 && currentTime >= loopB) {
          seekTo(Math.max(0, loopA - 0.6));
        } else if (currentTime > currentSong.duration + 0.65) {
          const targetSong = loopState === 1 ? currentSong : getNextSong();
          startBetweenSongCountdown(targetSong);
        }
        updateProgressUI();
      }
    }

    // Update particles & impact rings
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 96 * dt;
      p.life -= dt * 2.15;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = impactRings.length - 1; i >= 0; i--) {
      const ring = impactRings[i];
      ring.life -= dt * 3.2;
      if (ring.life <= 0) impactRings.splice(i, 1);
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

  function render(nowMs, dt) {
    ctx.clearRect(0, 0, canvasW, canvasH);

    // 1. Waterfall background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, waterfallH);
    bgGrad.addColorStop(0, '#080a0f');
    bgGrad.addColorStop(0.65, '#0d111a');
    bgGrad.addColorStop(1, '#121724');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvasW, waterfallH);

    // Subtle vertical black-key lanes and octave dividers (with clear Middle C4 anchor)
    for (let i = 0; i < blackRects.length; i++) {
      const r = blackRects[i];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(r.x, 0, r.w, waterfallH);
    }

    for (let i = 0; i < whiteRects.length; i++) {
      const r = whiteRects[i];
      if (r.midi === 60) {
        ctx.fillStyle = 'rgba(' + theme.rhRgb + ', 0.05)';
        ctx.fillRect(r.x, 0, r.w, waterfallH);
        ctx.fillStyle = 'rgba(' + theme.rhRgb + ', 0.24)';
        ctx.fillRect(Math.round(r.x), 0, 1, waterfallH);
      } else if (r.midi % 12 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(Math.round(r.x), 0, 1, waterfallH);
      } else if (r.midi % 12 === 5) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.032)';
        ctx.fillRect(Math.round(r.x), 0, 1, waterfallH);
      }
    }

    // Real musical measure & beat lines synced to song BPM and time signature
    const pxPerSec = waterfallH / LOOKAHEAD_SEC;
    const beatSec = 60 / ((currentSong && currentSong.bpm) || 100);
    const beatsPerBar = (currentSong && currentSong.beatsPerBar) || 4;
    const firstBeat = Math.ceil(currentTime / beatSec);
    const lastBeat = Math.floor((currentTime + LOOKAHEAD_SEC) / beatSec);
    for (let b = firstBeat; b <= lastBeat; b++) {
      const bt = b * beatSec;
      const gy = waterfallH - (bt - currentTime) * pxPerSec;
      if (gy >= 0 && gy <= waterfallH) {
        const isBar = ((b % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
        ctx.fillStyle = isBar ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(0, Math.round(gy), canvasW, 1);
      }
    }

    // 2. Falling notes + active, sustain shimmer, upcoming anticipation, and off-screen edge indicators
    const songActiveKeys = new Map(); // midi -> hand
    const sustainShimmer = new Map(); // midi -> hand
    const upcomingGlow = new Map(); // midi -> { amount, hand }
    let offLeftHand = null;
    let offRightHand = null;

    if (currentSong) {
      const notes = currentSong.notes;
      const winStart = currentTime - 3.5;
      const winEnd = currentTime + LOOKAHEAD_SEC + 0.1;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, canvasW, waterfallH);
      ctx.clip();

      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > winEnd) break;
        const noteEnd = n.time + n.duration;
        const audioEnd = n.time + (n.audioDuration || n.duration);
        if (audioEnd < currentTime && noteEnd < winStart) continue;

        const enabled = isHandEnabled(n.hand);
        if (enabled && currentTime > noteEnd && currentTime <= audioEnd) {
          sustainShimmer.set(n.midi, n.hand);
        }
        if (noteEnd < currentTime - 0.05) continue;

        const rect = keyRects.get(n.midi);
        if (!rect) continue;

        // Track off-screen upcoming notes (within 1.8s) so user gets edge beacons when zoomed in
        if (enabled && n.time >= currentTime - 0.05 && n.time <= currentTime + 1.8) {
          if (rect.x + rect.w < 2) offLeftHand = n.hand;
          else if (rect.x > canvasW - 2) offRightHand = n.hand;
        }

        const hitting = currentTime >= n.time && currentTime <= noteEnd;
        if (hitting && enabled) {
          songActiveKeys.set(n.midi, n.hand);
        } else if (enabled && n.time > currentTime && n.time - currentTime < 0.45) {
          const amt = 1 - (n.time - currentTime) / 0.45;
          const prev = upcomingGlow.get(n.midi);
          if (!prev || amt > prev.amount) {
            upcomingGlow.set(n.midi, { amount: amt, hand: n.hand });
          }
        }

        if (rect.x + rect.w < -4 || rect.x > canvasW + 4) continue;

        const yBottom = waterfallH - (n.time - currentTime) * pxPerSec;
        const yTop = waterfallH - (noteEnd - currentTime) * pxPerSec + 2;
        const barH = Math.max(10, yBottom - yTop);
        const pad = rect.black ? Math.max(1, rect.w * 0.05) : Math.max(1.5, rect.w * 0.08);
        const bx = rect.x + pad;
        const bw = Math.max(3, rect.w - pad * 2);

        const isLeft = n.hand === 'left';
        const fillTop = isLeft
          ? (rect.black ? theme.lhBlackTop : theme.lhTop)
          : (rect.black ? theme.rhBlackTop : theme.rhTop);
        const fillBot = isLeft
          ? (rect.black ? theme.lhBlackBot : theme.lhBot)
          : (rect.black ? theme.rhBlackBot : theme.rhBot);
        const strokeCol = rect.black ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.34)';

        ctx.globalAlpha = enabled ? 1 : 0.14;

        if (hitting && enabled) {
          ctx.shadowColor = 'rgba(' + (isLeft ? theme.lhRgb : theme.rhRgb) + ', 0.9)';
          ctx.shadowBlur = 20;
        } else {
          ctx.shadowBlur = 0;
        }

        const grad = ctx.createLinearGradient(bx, yTop, bx, yBottom);
        grad.addColorStop(0, fillTop);
        grad.addColorStop(1, fillBot);
        ctx.fillStyle = grad;

        const rad = Math.min(6, bw * 0.36);
        drawRoundedRect(bx, yTop, bw, barH, rad);
        ctx.fill();

        ctx.shadowBlur = 0;
        if (bw >= 7 && barH >= 12) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.fillRect(bx + 2, yTop + 1.5, Math.max(1, bw - 4), 2);
        }

        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Crisp note label on the falling bar (readable from a real piano music stand)
        if (enabled && bw >= 16 && barH >= 16) {
          const info = MIDI_INFO[n.midi];
          const label = bw >= 28 ? info.fullName : info.noteName;
          const fs = clamp(bw * (label.length > 2 ? 0.34 : 0.44), 8.5, 12.5);
          ctx.font = '700 ' + fs.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = rect.black ? 'rgba(255, 255, 255, 0.96)' : 'rgba(9, 12, 20, 0.88)';
          ctx.fillText(label, bx + bw * 0.5, Math.min(yBottom - 3, waterfallH - 3));
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 2.5. Rising aurora light beams for active keys and gold target beacons for Learn Mode
    const pulse = 0.55 + 0.45 * Math.sin(nowMs * 0.0085);

    if (waitingForInput) {
      waitingLearnMidis.forEach((midi) => {
        const rect = keyRects.get(midi);
        if (!rect) return;
        const beamH = Math.min(140, waterfallH * 0.42);
        const bg = ctx.createLinearGradient(0, waterfallH, 0, waterfallH - beamH);
        bg.addColorStop(0, 'rgba(250, 204, 21, ' + (0.28 + pulse * 0.16).toFixed(3) + ')');
        bg.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(rect.x, waterfallH - beamH, rect.w, beamH);
      });
    }

    sustainShimmer.forEach((hand, midi) => {
      if (songActiveKeys.has(midi)) return;
      const rect = keyRects.get(midi);
      if (!rect) return;
      const beamH = Math.min(44, waterfallH * 0.14);
      const rgb = hand === 'left' ? theme.lhRgb : theme.rhRgb;
      const bg = ctx.createLinearGradient(0, waterfallH, 0, waterfallH - beamH);
      bg.addColorStop(0, 'rgba(' + rgb + ', 0.14)');
      bg.addColorStop(1, 'rgba(' + rgb + ', 0)');
      ctx.fillStyle = bg;
      ctx.fillRect(rect.x, waterfallH - beamH, rect.w, beamH);
    });

    songActiveKeys.forEach((hand, midi) => {
      const rect = keyRects.get(midi);
      if (!rect) return;
      const beamH = Math.min(120, waterfallH * 0.36);
      const rgb = hand === 'left' ? theme.lhRgb : theme.rhRgb;
      const beamGrad = ctx.createLinearGradient(0, waterfallH, 0, waterfallH - beamH);
      beamGrad.addColorStop(0, 'rgba(' + rgb + ', 0.28)');
      beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(rect.x, waterfallH - beamH, rect.w, beamH);
    });

    userActiveKeys.forEach((st, midi) => {
      const rect = keyRects.get(midi);
      if (!rect) return;
      const beamH = Math.min(125, waterfallH * 0.38);
      const col = st.hitGood ? '52, 211, 153' : (st.hitWrong ? '244, 63, 94' : theme.rhRgb);
      const beamGrad = ctx.createLinearGradient(0, waterfallH, 0, waterfallH - beamH);
      beamGrad.addColorStop(0, 'rgba(' + col + ', 0.32)');
      beamGrad.addColorStop(1, 'rgba(' + col + ', 0)');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(rect.x, waterfallH - beamH, rect.w, beamH);
    });

    // Subtle edge glow cues when upcoming notes are off-screen to the left or right
    if (offLeftHand) {
      const rgb = offLeftHand === 'left' ? theme.lhRgb : theme.rhRgb;
      const eg = ctx.createLinearGradient(0, 0, 18, 0);
      eg.addColorStop(0, 'rgba(' + rgb + ', ' + (0.32 + pulse * 0.25).toFixed(3) + ')');
      eg.addColorStop(1, 'rgba(' + rgb + ', 0)');
      ctx.fillStyle = eg;
      ctx.fillRect(0, waterfallH * 0.25, 18, waterfallH * 0.75);
    }
    if (offRightHand) {
      const rgb = offRightHand === 'left' ? theme.lhRgb : theme.rhRgb;
      const eg = ctx.createLinearGradient(canvasW, 0, canvasW - 18, 0);
      eg.addColorStop(0, 'rgba(' + rgb + ', ' + (0.32 + pulse * 0.25).toFixed(3) + ')');
      eg.addColorStop(1, 'rgba(' + rgb + ', 0)');
      ctx.fillStyle = eg;
      ctx.fillRect(canvasW - 18, waterfallH * 0.25, 18, waterfallH * 0.75);
    }

    // 3. Impact rings & spark particles
    for (let i = 0; i < impactRings.length; i++) {
      const ring = impactRings[i];
      const prog = 1 - ring.life;
      const curR = ring.r + (ring.maxR - ring.r) * prog;
      ctx.save();
      ctx.globalAlpha = clamp(ring.life * 0.65, 0, 1);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, curR, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 4. Interactive 88-key overview minimap strip at top of waterfall when zoomed in
    const span = viewEnd - viewStart;
    if (span < TOTAL_WHITES - 0.5) {
      const mapPad = 14;
      const mapW = Math.max(40, canvasW - mapPad * 2);
      const mapY = 7;
      const mapH = 6;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      drawRoundedRect(mapPad, mapY, mapW, mapH, 3);
      ctx.fill();

      for (let i = 0; i < songNoteWhites.length; i++) {
        const sn = songNoteWhites[i];
        const nx = mapPad + (sn.pos / TOTAL_WHITES) * mapW;
        ctx.fillStyle = 'rgba(' + (sn.hand === 'left' ? theme.lhRgb : theme.rhRgb) + ', 0.45)';
        ctx.fillRect(nx, mapY + 1, 2, mapH - 2);
      }

      const vx = mapPad + (viewStart / TOTAL_WHITES) * mapW;
      const vw = Math.max(18, (span / TOTAL_WHITES) * mapW);
      ctx.fillStyle = 'rgba(' + theme.rhRgb + ', 0.25)';
      ctx.strokeStyle = 'rgba(' + theme.rhRgb + ', 0.8)';
      ctx.lineWidth = 1.2;
      drawRoundedRect(vx, mapY - 0.5, vw, mapH + 1, 3.5);
      ctx.fill();
      ctx.stroke();
    }

    // 5. Hit line + draggable classic grand-piano crimson felt strip
    const streakGlow = learnMode ? clamp(learnStreak / 12, 0, 1) : 0;
    const lineGrad = ctx.createLinearGradient(0, waterfallH - 4, 0, waterfallH + 1);
    lineGrad.addColorStop(0, 'rgba(' + theme.rhRgb + ', 0)');
    if (streakGlow > 0.05) {
      lineGrad.addColorStop(0.6, 'rgba(52, 211, 153, ' + (0.35 + streakGlow * 0.45).toFixed(2) + ')');
    } else {
      lineGrad.addColorStop(0.6, 'rgba(' + theme.rhRgb + ', 0.4)');
    }
    lineGrad.addColorStop(1, 'rgba(255, 255, 255, 0.24)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(0, waterfallH - 4, canvasW, 4);

    ctx.fillStyle = feltDragging ? '#9f1239' : '#4c1120';
    ctx.fillRect(0, waterfallH, canvasW, 3);

    // Subtle center resize pill mark on the felt strip
    ctx.fillStyle = feltDragging ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.16)';
    drawRoundedRect(canvasW * 0.5 - 16, waterfallH + 0.5, 32, 2, 1);
    ctx.fill();

    // 6. Smooth key press depth interpolation
    const depthEase = 1 - Math.exp(-(dt || 0.016) * 28);
    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      const target = (userActiveKeys.has(m) || songActiveKeys.has(m)) ? 1 : 0;
      keyDepth[m] += (target - keyDepth[m]) * depthEase;
    }

    // 7. Piano keyboard (white keys)
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, waterfallH + 3, canvasW, keyHeight - 3);

    for (let i = 0; i < whiteRects.length; i++) {
      const r = whiteRects[i];
      const userState = userActiveKeys.get(r.midi);
      const songHand = songActiveKeys.get(r.midi);
      const isWaiting = waitingForInput && waitingLearnMidis.has(r.midi);
      const wrongRem = wrongKeyFlash.get(r.midi) || 0;
      const upcoming = upcomingGlow.get(r.midi);
      const pressed = !!userState || !!songHand;
      const dep = keyDepth[r.midi];

      const x = r.x + 0.6;
      const w = Math.max(1, r.w - 1.2);
      const ky = r.y + 3 + dep * 2.5;
      const h = r.h - 5 - dep * 2.5;

      const kg = ctx.createLinearGradient(0, ky, 0, ky + h);
      if (wrongRem > 0) {
        kg.addColorStop(0, '#fda4af');
        kg.addColorStop(1, '#e11d48');
      } else if (userState) {
        if (userState.hitGood) {
          kg.addColorStop(0, '#6ee7b7');
          kg.addColorStop(1, '#10b981');
        } else {
          kg.addColorStop(0, theme.rhTop);
          kg.addColorStop(1, theme.rhBot);
        }
      } else if (songHand === 'left') {
        kg.addColorStop(0, theme.lhKeyTop);
        kg.addColorStop(1, theme.lhBot);
      } else if (songHand === 'right') {
        kg.addColorStop(0, theme.rhKeyTop);
        kg.addColorStop(1, theme.rhBot);
      } else if (isWaiting) {
        kg.addColorStop(0, '#fef08a');
        kg.addColorStop(1, 'rgba(250, 204, 21, ' + (0.65 + pulse * 0.35) + ')');
      } else if (r.midi === 60) {
        kg.addColorStop(0, '#eef6fc');
        kg.addColorStop(0.14, '#f8fbff');
        kg.addColorStop(0.92, '#d9eaf8');
        kg.addColorStop(1, '#bdd6ec');
      } else {
        kg.addColorStop(0, '#e6eaf1');
        kg.addColorStop(0.1, '#f8fafc');
        kg.addColorStop(0.92, '#e2e8f0');
        kg.addColorStop(1, '#cbd5e1');
      }

      ctx.fillStyle = kg;
      drawRoundedRect(x, ky, w, h, Math.min(5, w * 0.25));
      ctx.fill();

      if (!pressed && h > 20) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
        ctx.fillRect(x + 1, ky + h - 3.5, Math.max(1, w - 2), 3);
      }

      // Pre-impact anticipation glow on top edge of key
      if (!pressed && !isWaiting && wrongRem <= 0 && upcoming) {
        const ug = ctx.createLinearGradient(0, ky, 0, ky + h * 0.48);
        const col = upcoming.hand === 'left' ? theme.lhRgb : theme.rhRgb;
        ug.addColorStop(0, 'rgba(' + col + ', ' + (upcoming.amount * 0.62).toFixed(3) + ')');
        ug.addColorStop(1, 'rgba(' + col + ', 0)');
        ctx.fillStyle = ug;
        ctx.fillRect(x, ky, w, h * 0.48);
      }

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

      if (whiteLabel && h >= 44) {
        const fontSize = clamp(w * (whiteLabel.length > 1 ? 0.36 : 0.45), 8.5, 13);
        ctx.font = (isC ? '700 ' : '600 ') + fontSize.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        if (pressed || wrongRem > 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        } else if (isWaiting) {
          ctx.fillStyle = '#0f172a';
        } else if (isMidC) {
          ctx.fillStyle = theme.rhBot;
        } else {
          ctx.fillStyle = isC ? '#0f172a' : '#475569';
        }
        ctx.fillText(whiteLabel, x + w * 0.5, ky + h - (pressed ? 5 : 8));
      }
    }

    // 8. Piano keyboard (black keys)
    for (let i = 0; i < blackRects.length; i++) {
      const r = blackRects[i];
      const userState = userActiveKeys.get(r.midi);
      const songHand = songActiveKeys.get(r.midi);
      const isWaiting = waitingForInput && waitingLearnMidis.has(r.midi);
      const wrongRem = wrongKeyFlash.get(r.midi) || 0;
      const upcoming = upcomingGlow.get(r.midi);
      const pressed = !!userState || !!songHand;
      const dep = keyDepth[r.midi];

      const x = r.x;
      const w = r.w;
      const ky = r.y + 3 + dep * 1.8;
      const h = r.h - 3 - dep * 1.8;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      drawRoundedRect(x + 1.2, ky + 3, w, h, Math.min(4, w * 0.28));
      ctx.fill();

      const bg = ctx.createLinearGradient(0, ky, 0, ky + h);
      if (wrongRem > 0) {
        bg.addColorStop(0, '#fb7185');
        bg.addColorStop(1, '#be123c');
      } else if (userState) {
        if (userState.hitGood) {
          bg.addColorStop(0, '#34d399');
          bg.addColorStop(1, '#059669');
        } else {
          bg.addColorStop(0, theme.rh);
          bg.addColorStop(1, theme.rhBlackBot);
        }
      } else if (songHand === 'left') {
        bg.addColorStop(0, theme.lh);
        bg.addColorStop(1, theme.lhBlackBot);
      } else if (songHand === 'right') {
        bg.addColorStop(0, theme.rh);
        bg.addColorStop(1, theme.rhBlackBot);
      } else if (isWaiting) {
        bg.addColorStop(0, '#fde047');
        bg.addColorStop(1, 'rgba(234, 179, 8, ' + (0.7 + pulse * 0.3) + ')');
      } else {
        bg.addColorStop(0, '#2e3546');
        bg.addColorStop(0.76, '#11141c');
        bg.addColorStop(1, '#1f2535');
      }

      ctx.fillStyle = bg;
      drawRoundedRect(x, ky, w, h, Math.min(4, w * 0.28));
      ctx.fill();

      if (!pressed && !isWaiting && wrongRem <= 0 && upcoming) {
        const ug = ctx.createLinearGradient(0, ky, 0, ky + h * 0.58);
        const col = upcoming.hand === 'left' ? theme.lhRgb : theme.rhRgb;
        ug.addColorStop(0, 'rgba(' + col + ', ' + (upcoming.amount * 0.78).toFixed(3) + ')');
        ug.addColorStop(1, 'rgba(' + col + ', 0)');
        ctx.fillStyle = ug;
        drawRoundedRect(x, ky, w, h * 0.58, Math.min(4, w * 0.28));
        ctx.fill();
      }

      if (!pressed && !isWaiting && wrongRem <= 0 && w >= 6) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
        ctx.fillRect(x + 1.5, ky + 2, Math.max(1, w - 3), Math.max(4, h - 10));
      }

      if (w >= 13 && h >= 32) {
        const info = MIDI_INFO[r.midi];
        const fontSize = clamp(w * 0.44, 7.5, 11);
        ctx.font = '600 ' + fontSize.toFixed(1) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = isWaiting ? '#0f172a' : (pressed || wrongRem > 0 ? '#ffffff' : 'rgba(226, 232, 240, 0.85)');
        ctx.fillText(info.noteName, x + w * 0.5, ky + h - (pressed ? 5 : 7));
      }
    }

    // Subtle keybed overhang shadow
    const overhang = ctx.createLinearGradient(0, waterfallH + 3, 0, waterfallH + 13);
    overhang.addColorStop(0, 'rgba(0, 0, 0, 0.48)');
    overhang.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = overhang;
    ctx.fillRect(0, waterfallH + 3, canvasW, 10);
  }

  // Animation loop
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    update(dt);
    render(now, dt);
    requestAnimationFrame(frame);
  }

  // Pointer interaction on canvas:
  // Top 24px minimap -> drag viewport across 88 keys
  // Crimson felt divider -> vertical drag to resize piano/waterfall split (double-tap resets)
  // Piano region -> multi-touch playing + glissando
  // Waterfall region -> 1-finger pan with momentum, 2-finger pinch zoom
  const waterfallPointers = new Map(); // pointerId -> { x, y, t }
  let pinchState = null;
  let minimapDragging = false;
  let minimapPointerId = null;
  let feltDragging = false;
  let feltPointerId = null;
  let lastFeltTap = 0;

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
      panVelocity = 0;
    } else {
      pinchState = null;
    }
  }

  function handleMinimapX(x) {
    const mapPad = 14;
    const mapW = Math.max(40, canvasW - mapPad * 2);
    const ratio = clamp((x - mapPad) / mapW, 0, 1);
    panCenterToWhite(ratio * TOTAL_WHITES);
  }

  canvas.addEventListener('pointerdown', (e) => {
    closeSongMenu();
    closeTunePanel();
    PianoApp.audio.ensureContext();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 1. Draggable 88-key minimap at top of waterfall when zoomed in
    if (y <= 24 && viewEnd - viewStart < TOTAL_WHITES - 0.5) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      minimapDragging = true;
      minimapPointerId = e.pointerId;
      handleMinimapX(x);
      return;
    }

    // 2. Draggable crimson felt rail to resize keyboard height for music-stand vs touch play
    if (Math.abs(y - waterfallH) <= 10) {
      const now = performance.now();
      if (now - lastFeltTap < 320) {
        customKeyRatio = null;
        updateHeights();
        savePrefs();
        lastFeltTap = 0;
        return;
      }
      lastFeltTap = now;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      feltDragging = true;
      feltPointerId = e.pointerId;
      return;
    }

    // 3. Piano keys
    const midi = keyAtPoint(x, y);
    if (midi !== null) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      pointerKeys.set(e.pointerId, midi);
      userNoteOn(midi, 0.84);
    } else {
      // 4. Waterfall pan/pinch
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      panVelocity = 0;
      waterfallPointers.set(e.pointerId, { x, y, t: performance.now() });
      updatePinchState();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (feltDragging && e.pointerId === feltPointerId) {
      const nextKeyH = clamp(canvasH - y, 68, Math.round(canvasH * 0.45));
      customKeyRatio = clamp(nextKeyH / Math.max(1, canvasH), 0.11, 0.45);
      updateHeights();
      return;
    }

    if (minimapDragging && e.pointerId === minimapPointerId) {
      handleMinimapX(x);
      return;
    }

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
      const now = performance.now();
      const prev = waterfallPointers.get(e.pointerId);
      waterfallPointers.set(e.pointerId, { x, y, t: now });

      if (waterfallPointers.size === 2 && pinchState) {
        manualZoomed = true;
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
        scalePreset = (targetStart <= 0.1 && targetEnd >= TOTAL_WHITES - 0.1) ? 2 : 0;
        fullScaleBtn.classList.toggle('active', scalePreset > 0);
      } else if (waterfallPointers.size === 1) {
        const dx = x - prev.x;
        const dtMs = Math.max(8, now - prev.t);
        const span = targetEnd - targetStart;
        const deltaWhites = (-dx / Math.max(1, canvasW)) * span;
        panBy(deltaWhites);
        panVelocity = clamp((deltaWhites / dtMs) * 1000, -45, 45);
      }
      return;
    }

    // Hover cursor feedback on desktop
    if (e.pointerType === 'mouse') {
      if (Math.abs(y - waterfallH) <= 9) {
        canvas.style.cursor = 'ns-resize';
      } else if (y <= 22 && viewEnd - viewStart < TOTAL_WHITES - 0.5) {
        canvas.style.cursor = 'ew-resize';
      } else if (y > waterfallH + 3) {
        canvas.style.cursor = 'pointer';
      } else {
        canvas.style.cursor = 'default';
      }
    }
  });

  function releasePointer(e) {
    if (feltDragging && e.pointerId === feltPointerId) {
      feltDragging = false;
      feltPointerId = null;
      savePrefs();
    }
    if (minimapDragging && e.pointerId === minimapPointerId) {
      minimapDragging = false;
      minimapPointerId = null;
    }
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
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
      if (countdownActive) finishCountdownAndPlay();
      else setPlaying(!playing);
      return;
    }
    if (e.code === 'ArrowLeft') {
      if (e.shiftKey) {
        seekTo(currentTime - 5);
      } else {
        baseOctave = Math.max(1, baseOctave - 1);
      }
      return;
    }
    if (e.code === 'ArrowRight') {
      if (e.shiftKey) {
        seekTo(currentTime + 5);
      } else {
        baseOctave = Math.min(6, baseOctave + 1);
      }
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      speed = clamp(Math.round((speed + (e.code === 'ArrowUp' ? 0.05 : -0.05)) * 20) / 20, 0.2, 1.5);
      speedSlider.value = String(speed);
      showSpeedPop();
      savePrefs();
      return;
    }
    if (e.code === 'Escape') {
      closeSongMenu();
      closeTunePanel();
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

  songSearch.addEventListener('input', renderSongList);
  songMenu.addEventListener('click', (e) => e.stopPropagation());

  tuneBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTunePanel();
  });

  tunePanel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', (e) => {
    if (!songPicker.contains(e.target)) closeSongMenu();
    if (!tunePanel.contains(e.target) && !tuneBtn.contains(e.target)) closeTunePanel();
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  recordBtn.addEventListener('click', toggleRecording);

  restartBtn.addEventListener('click', () => {
    cancelCountdown();
    if (loopState === 2 && loopB > loopA + 0.3) {
      seekTo(Math.max(0, loopA - 0.6));
    } else {
      seekTo(-LEAD_IN);
    }
    setPlaying(true);
  });

  playBtn.addEventListener('click', () => {
    if (countdownActive) cancelCountdown();
    else setPlaying(!playing);
  });

  nextBtn.addEventListener('click', () => {
    const next = getNextSong();
    if (playing || countdownActive) {
      startBetweenSongCountdown(next);
    } else {
      selectSong(next, false);
    }
  });

  countdownCard.addEventListener('click', () => {
    PianoApp.audio.ensureContext();
    finishCountdownAndPlay();
  });

  // Loop cycles: Off (0) -> Song Loop (1) -> A-B Section Loop (2)
  loopBtn.addEventListener('click', () => {
    loopState = (loopState + 1) % 3;
    if (loopState === 2 && currentSong && currentSong.duration > 0) {
      const dur = currentSong.duration;
      const cur = clamp(currentTime, 0, Math.max(0, dur - 2));
      const win = Math.min(Math.max(6, dur * 0.2), dur);
      loopA = clamp(cur, 0, Math.max(0, dur - 1.5));
      loopB = clamp(loopA + win, Math.min(dur, loopA + 1.5), dur);
    }
    syncLoopUI();
    savePrefs();
  });

  learnBtn.addEventListener('click', () => {
    learnMode = !learnMode;
    learnStreak = 0;
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
    savePrefs();
  });

  metroBtn.addEventListener('click', () => {
    metroOn = !metroOn;
    metroBtn.classList.toggle('active', metroOn);
    if (metroOn) {
      PianoApp.audio.ensureContext();
      PianoApp.audio.playClick(true);
    }
    savePrefs();
  });

  if (PianoApp.mic && PianoApp.mic.isSupported()) {
    PianoApp.mic.init({
      onNoteOn: (midi, vel) => userNoteOn(midi, vel, true),
      onNoteOff: (midi) => userNoteOff(midi, true),
      onStatusChange: (on) => micBtn.classList.toggle('active', on)
    });
    micBtn.addEventListener('click', () => {
      PianoApp.mic.toggle();
    });
  } else {
    micBtn.hidden = true;
  }

  themeBtn.addEventListener('click', () => {
    applyTheme(themeIdx + 1);
  });

  speedSlider.addEventListener('input', () => {
    speed = parseFloat(speedSlider.value) || 1.0;
    showSpeedPop();
    savePrefs();
  });

  leftHandBtn.addEventListener('click', () => {
    if (leftHandOn && !rightHandOn) return;
    leftHandOn = !leftHandOn;
    leftHandBtn.classList.toggle('active', leftHandOn);
    if (learnMode) refreshLearnWaitState();
    savePrefs();
  });

  rightHandBtn.addEventListener('click', () => {
    if (rightHandOn && !leftHandOn) return;
    rightHandOn = !rightHandOn;
    rightHandBtn.classList.toggle('active', rightHandOn);
    if (learnMode) refreshLearnWaitState();
    savePrefs();
  });

  zoomOutBtn.addEventListener('click', () => zoomBy(6));
  zoomInBtn.addEventListener('click', () => zoomBy(-6));

  // Scale cycles smoothly: Auto-Fit (0) -> 61 Keys (1) -> 88 Keys (2)
  fullScaleBtn.addEventListener('click', () => {
    scalePreset = (scalePreset + 1) % 3;
    manualZoomed = scalePreset > 0;
    applyScaleTarget(false);
    savePrefs();
  });

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    PianoApp.audio.setMuted(muted);
    soundOnIcon.hidden = muted;
    soundOffIcon.hidden = !muted;
  });

  // Fullscreen toggle (great for tablet/laptop on a real piano music stand)
  if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) {
    fsBtn.hidden = true;
  } else {
    function syncFsIcons() {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      fsEnterIcon.hidden = isFs;
      fsExitIcon.hidden = !isFs;
      fsBtn.classList.toggle('active', isFs);
    }
    fsBtn.addEventListener('click', () => {
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFs) {
        const el = document.documentElement;
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });
    document.addEventListener('fullscreenchange', syncFsIcons);
    document.addEventListener('webkitfullscreenchange', syncFsIcons);
  }

  // Progress bar scrubbing & draggable A-B loop pins
  let scrubMode = null; // 'seek' | 'loopA' | 'loopB'
  function timeFromClientX(clientX) {
    const rect = progressTrack.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * (currentSong ? currentSong.duration : 0);
  }

  function applyScrub(clientX) {
    if (!currentSong || currentSong.duration <= 0) return;
    const t = timeFromClientX(clientX);
    if (scrubMode === 'loopA') {
      loopA = clamp(t, 0, Math.max(0, loopB - 1.0));
      syncLoopUI();
    } else if (scrubMode === 'loopB') {
      loopB = clamp(t, Math.min(currentSong.duration, loopA + 1.0), currentSong.duration);
      syncLoopUI();
    } else if (scrubMode === 'seek') {
      if (countdownActive) cancelCountdown();
      seekTo(t);
    }
  }

  loopHandleA.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    scrubMode = 'loopA';
    progressWrap.classList.add('dragging');
    loopHandleA.setPointerCapture(e.pointerId);
  });

  loopHandleB.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    scrubMode = 'loopB';
    progressWrap.classList.add('dragging');
    loopHandleB.setPointerCapture(e.pointerId);
  });

  progressWrap.addEventListener('pointerdown', (e) => {
    if (e.target === loopHandleA || e.target === loopHandleB) return;
    scrubMode = 'seek';
    progressWrap.classList.add('dragging');
    progressWrap.setPointerCapture(e.pointerId);
    applyScrub(e.clientX);
  });

  global.addEventListener('pointermove', (e) => {
    if (scrubMode) applyScrub(e.clientX);
  });

  global.addEventListener('pointerup', () => {
    if (scrubMode) {
      scrubMode = null;
      progressWrap.classList.remove('dragging');
    }
  });

  global.addEventListener('pointercancel', () => {
    if (scrubMode) {
      scrubMode = null;
      progressWrap.classList.remove('dragging');
    }
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

  // Restore saved UI toggles & initialize
  applyTheme(themeIdx);
  speedSlider.value = String(speed);
  learnBtn.classList.toggle('active', learnMode);
  metroBtn.classList.toggle('active', metroOn);
  leftHandBtn.classList.toggle('active', leftHandOn);
  rightHandBtn.classList.toggle('active', rightHandOn);

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
