(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  class PianoAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.dry = null;
      this.wet = null;
      this.bodyEq = null;
      this.muted = false;
      this.sustain = false;
      this.activeVoices = new Map();
      this.voiceOrder = [];
      this.sustainedVoices = new Set();
      this.noiseBuffer = null;
      this._unlocked = false;
      this.maxVoices = 38;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();

        // Warm acoustic wooden soundboard resonance
        this.bodyEq = this.ctx.createBiquadFilter();
        this.bodyEq.type = 'peaking';
        this.bodyEq.frequency.value = 260;
        this.bodyEq.Q.value = 0.9;
        this.bodyEq.gain.value = 2.4;

        // Gentle high-shelf air
        const airEq = this.ctx.createBiquadFilter();
        airEq.type = 'highshelf';
        airEq.frequency.value = 3400;
        airEq.gain.value = -1.6;

        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 22;
        comp.ratio.value = 3.6;
        comp.attack.value = 0.005;
        comp.release.value = 0.22;

        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.78;

        this.dry = this.ctx.createGain();
        this.dry.gain.value = 0.8;

        this.wet = this.ctx.createGain();
        this.wet.gain.value = 0.28;

        const convolver = this.ctx.createConvolver();
        convolver.buffer = this._createReverbImpulse(2.0, 2.5);

        this.dry.connect(this.bodyEq);
        this.wet.connect(convolver);
        convolver.connect(this.bodyEq);
        this.bodyEq.connect(airEq);
        airEq.connect(comp);
        comp.connect(this.master);
        this.master.connect(this.ctx.destination);

        this.noiseBuffer = this._createHammerNoise();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      if (!this._unlocked) {
        this._unlocked = true;
        try {
          const silent = this.ctx.createBuffer(1, 1, 22050);
          const src = this.ctx.createBufferSource();
          src.buffer = silent;
          src.connect(this.ctx.destination);
          src.start(0);
        } catch (_) {}
      }
      return this.ctx;
    }

    _createReverbImpulse(duration, decay) {
      const rate = this.ctx.sampleRate;
      const length = Math.floor(rate * duration);
      const impulse = this.ctx.createBuffer(2, length, rate);
      const earlyTaps = [0.011, 0.019, 0.029, 0.043, 0.061];
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < length; i++) {
          const t = i / rate;
          const env = Math.pow(1 - i / length, decay);
          const white = Math.random() * 2 - 1;
          lp = lp * 0.72 + white * 0.28;
          // Smooth pre-delay into warm diffuse hall tail
          const fade = t < 0.015 ? t / 0.015 : 1;
          data[i] = lp * env * fade * 0.52;
        }
        // Subtle stereo early reflections
        for (let e = 0; e < earlyTaps.length; e++) {
          const idx = Math.floor((earlyTaps[e] + (ch ? 0.003 : 0)) * rate);
          if (idx < length) {
            data[idx] += (0.22 - e * 0.032) * (e % 2 === 0 ? 1 : -1);
          }
        }
      }
      return impulse;
    }

    _createHammerNoise() {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * 0.028);
      const buf = this.ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.6);
      }
      return buf;
    }

    setMuted(muted) {
      this.muted = !!muted;
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.78, now, 0.015);
      }
    }

    setSustain(down) {
      this.sustain = !!down;
      if (!this.sustain) {
        this.sustainedVoices.forEach((voice) => this._fadeVoice(voice, 0.16));
        this.sustainedVoices.clear();
      }
    }

    playClick(accent) {
      if (this.muted) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const baseFreq = accent ? 1180 : 820;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.62, now + 0.028);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(accent ? 0.22 : 0.12, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.045);
    }

    _trimPolyphony() {
      while (this.voiceOrder.length >= this.maxVoices) {
        const oldest = this.voiceOrder.shift();
        if (oldest && !oldest.released) {
          this.activeVoices.delete(oldest.key);
          this.sustainedVoices.delete(oldest);
          this._fadeVoice(oldest, 0.05);
        }
      }
    }

    noteOn(midi, velocity, sourceKey) {
      const ctx = this.ensureContext();
      if (!ctx) return null;

      const vel = Math.max(0.08, Math.min(1, velocity == null ? 0.78 : velocity));
      const key = (sourceKey || 'user') + ':' + midi;

      if (this.activeVoices.has(key)) {
        this._fadeVoice(this.activeVoices.get(key), 0.04);
        this.activeVoices.delete(key);
      }
      this._trimPolyphony();

      const now = ctx.currentTime;
      const freq = midiToFreq(midi);
      const pitchNorm = Math.max(0, Math.min(1, (midi - 21) / 87));
      const decayTime = 4.8 - pitchNorm * 3.1;

      // Authentic piano string inharmonicity coefficient
      const B = 0.00014 * Math.pow(2, (midi - 60) / 16);
      const partialFreq = (n) => freq * n * Math.sqrt(1 + B * n * n);

      const voiceGain = ctx.createGain();
      const peak = (0.12 + vel * 0.21) * (1.16 - pitchNorm * 0.3);
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peak, now + 0.004);
      voiceGain.gain.exponentialRampToValueAtTime(peak * 0.48, now + 0.14);
      voiceGain.gain.exponentialRampToValueAtTime(0.0007, now + decayTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const brightCutoff = Math.min(15000, freq * (4.2 + vel * 7.2));
      const warmCutoff = Math.min(4600, freq * (1.7 + vel * 1.4));
      filter.frequency.setValueAtTime(brightCutoff, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(190, warmCutoff), now + 0.5);
      filter.Q.value = 0.6;

      // Dual slightly detuned unison fundamental strings + inharmonic overtones
      const osc1a = ctx.createOscillator();
      osc1a.type = 'triangle';
      osc1a.frequency.setValueAtTime(freq, now);
      osc1a.detune.setValueAtTime(-0.65, now);

      const osc1b = ctx.createOscillator();
      osc1b.type = 'sine';
      osc1b.frequency.setValueAtTime(freq, now);
      osc1b.detune.setValueAtTime(0.65, now);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(partialFreq(2), now);

      const osc3 = ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(partialFreq(3), now);

      const osc4 = ctx.createOscillator();
      osc4.type = 'sine';
      osc4.frequency.setValueAtTime(Math.min(18000, partialFreq(4)), now);

      const g1a = ctx.createGain();
      g1a.gain.value = 0.44;
      const g1b = ctx.createGain();
      g1b.gain.value = 0.34;

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.24 * (1.12 - pitchNorm * 0.42), now);
      g2.gain.exponentialRampToValueAtTime(0.008, now + decayTime * 0.72);

      const g3 = ctx.createGain();
      g3.gain.setValueAtTime(0.11 * (1.06 - pitchNorm * 0.48), now);
      g3.gain.exponentialRampToValueAtTime(0.002, now + decayTime * 0.42);

      const g4 = ctx.createGain();
      g4.gain.setValueAtTime(0.055 * vel * (1.0 - pitchNorm * 0.55), now);
      g4.gain.exponentialRampToValueAtTime(0.0008, now + decayTime * 0.22);

      osc1a.connect(g1a);
      osc1b.connect(g1b);
      osc2.connect(g2);
      osc3.connect(g3);
      osc4.connect(g4);

      g1a.connect(filter);
      g1b.connect(filter);
      g2.connect(filter);
      g3.connect(filter);
      g4.connect(filter);

      if (this.noiseBuffer) {
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.value = Math.min(4600, Math.max(620, freq * 2.0));
        nFilter.Q.value = 1.3;
        const nGain = ctx.createGain();
        nGain.gain.value = 0.058 * vel * vel;
        noiseSrc.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(voiceGain);
        noiseSrc.start(now);
      }

      filter.connect(voiceGain);

      // Stereo grand-piano field (bass left, treble right)
      let outNode = voiceGain;
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = (pitchNorm - 0.5) * 0.58;
        voiceGain.connect(panner);
        outNode = panner;
      }

      outNode.connect(this.dry);
      outNode.connect(this.wet);

      const oscs = [osc1a, osc1b, osc2, osc3, osc4];
      const stopAt = now + decayTime + 0.16;
      for (let i = 0; i < oscs.length; i++) {
        oscs[i].start(now);
        oscs[i].stop(stopAt);
      }

      const voice = {
        midi,
        key,
        oscs,
        gain: voiceGain,
        released: false
      };

      this.activeVoices.set(key, voice);
      this.voiceOrder.push(voice);

      osc1a.onended = () => {
        if (this.activeVoices.get(key) === voice) {
          this.activeVoices.delete(key);
        }
        this.sustainedVoices.delete(voice);
        const idx = this.voiceOrder.indexOf(voice);
        if (idx >= 0) this.voiceOrder.splice(idx, 1);
      };

      return voice;
    }

    noteOff(midi, sourceKey) {
      const key = (sourceKey || 'user') + ':' + midi;
      const voice = this.activeVoices.get(key);
      if (!voice) return;
      this.activeVoices.delete(key);
      if (this.sustain && sourceKey !== 'song') {
        this.sustainedVoices.add(voice);
      } else {
        this._fadeVoice(voice, 0.18);
      }
    }

    playTimedNote(midi, durationSec, velocity) {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const sourceKey = 'song:' + Math.random().toString(36).slice(2, 7);
      const voice = this.noteOn(midi, velocity, sourceKey);
      if (!voice) return;
      const dur = Math.max(0.06, durationSec);
      const now = ctx.currentTime;
      const releaseStart = now + dur;
      try {
        voice.gain.gain.setTargetAtTime(0.0001, releaseStart, 0.085);
        for (let i = 0; i < voice.oscs.length; i++) {
          try {
            voice.oscs[i].stop(releaseStart + 0.42);
          } catch (_) {}
        }
      } catch (_) {}
    }

    stopAll(prefix) {
      for (const [key, voice] of Array.from(this.activeVoices.entries())) {
        if (!prefix || key.startsWith(prefix)) {
          this._fadeVoice(voice, 0.055);
          this.activeVoices.delete(key);
        }
      }
      if (!prefix) {
        this.sustainedVoices.forEach((v) => this._fadeVoice(v, 0.055));
        this.sustainedVoices.clear();
      }
    }

    _fadeVoice(voice, timeConstant) {
      if (!voice || voice.released || !this.ctx) return;
      voice.released = true;
      const now = this.ctx.currentTime;
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
        voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + timeConstant);
        const stopAt = now + timeConstant + 0.04;
        for (let i = 0; i < voice.oscs.length; i++) {
          try {
            voice.oscs[i].stop(stopAt);
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  PianoApp.audio = new PianoAudio();
})(window);
