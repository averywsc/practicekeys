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
      this.muted = false;
      this.sustain = false;
      this.activeVoices = new Map();
      this.sustainedVoices = new Set();
      this.noiseBuffer = null;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();

        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;

        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.72;

        this.dry = this.ctx.createGain();
        this.dry.gain.value = 0.84;

        this.wet = this.ctx.createGain();
        this.wet.gain.value = 0.22;

        const convolver = this.ctx.createConvolver();
        convolver.buffer = this._createReverbImpulse(1.5, 2.8);

        this.dry.connect(comp);
        this.wet.connect(convolver);
        convolver.connect(comp);
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
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < length; i++) {
          const env = Math.pow(1 - i / length, decay);
          const white = Math.random() * 2 - 1;
          lp = lp * 0.65 + white * 0.35;
          data[i] = lp * env * 0.55;
        }
      }
      return impulse;
    }

    _createHammerNoise() {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * 0.035);
      const buf = this.ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      return buf;
    }

    setMuted(muted) {
      this.muted = !!muted;
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, now, 0.015);
      }
    }

    setSustain(down) {
      this.sustain = !!down;
      if (!this.sustain) {
        this.sustainedVoices.forEach((voice) => this._fadeVoice(voice, 0.16));
        this.sustainedVoices.clear();
      }
    }

    noteOn(midi, velocity, sourceKey) {
      const ctx = this.ensureContext();
      if (!ctx) return null;

      const vel = Math.max(0.08, Math.min(1, velocity == null ? 0.78 : velocity));
      const key = (sourceKey || 'user') + ':' + midi;

      if (this.activeVoices.has(key)) {
        this._fadeVoice(this.activeVoices.get(key), 0.045);
        this.activeVoices.delete(key);
      }

      const now = ctx.currentTime;
      const freq = midiToFreq(midi);
      const pitchNorm = Math.max(0, Math.min(1, (midi - 21) / 87));
      const decayTime = 3.8 - pitchNorm * 2.5;

      const voiceGain = ctx.createGain();
      const peak = (0.14 + vel * 0.22) * (1.12 - pitchNorm * 0.3);
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(peak, now + 0.005);
      voiceGain.gain.exponentialRampToValueAtTime(peak * 0.42, now + 0.14);
      voiceGain.gain.exponentialRampToValueAtTime(0.0008, now + decayTime);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      const brightCutoff = Math.min(14000, freq * (4.5 + vel * 6.5));
      const warmCutoff = Math.min(4800, freq * (1.8 + vel * 1.4));
      filter.frequency.setValueAtTime(brightCutoff, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(220, warmCutoff), now + 0.42);
      filter.Q.value = 0.7;

      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, now);
      osc2.detune.setValueAtTime(1.2, now);

      const osc3 = ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(freq * 3, now);
      osc3.detune.setValueAtTime(-1.8, now);

      const g1 = ctx.createGain();
      g1.gain.value = 0.72;

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.24 * (1.1 - pitchNorm * 0.45), now);
      g2.gain.exponentialRampToValueAtTime(0.01, now + decayTime * 0.65);

      const g3 = ctx.createGain();
      g3.gain.setValueAtTime(0.1 * (1 - pitchNorm * 0.5), now);
      g3.gain.exponentialRampToValueAtTime(0.002, now + decayTime * 0.35);

      osc1.connect(g1);
      osc2.connect(g2);
      osc3.connect(g3);
      g1.connect(filter);
      g2.connect(filter);
      g3.connect(filter);

      let noiseSrc = null;
      if (this.noiseBuffer) {
        noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = this.noiseBuffer;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.value = Math.min(4200, Math.max(700, freq * 2.2));
        nFilter.Q.value = 1.2;
        const nGain = ctx.createGain();
        nGain.gain.value = 0.07 * vel;
        noiseSrc.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(voiceGain);
        noiseSrc.start(now);
      }

      filter.connect(voiceGain);
      voiceGain.connect(this.dry);
      voiceGain.connect(this.wet);

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);

      const stopAt = now + decayTime + 0.15;
      osc1.stop(stopAt);
      osc2.stop(stopAt);
      osc3.stop(stopAt);

      const voice = {
        midi,
        key,
        oscs: [osc1, osc2, osc3],
        gain: voiceGain,
        released: false
      };

      this.activeVoices.set(key, voice);
      osc1.onended = () => {
        if (this.activeVoices.get(key) === voice) {
          this.activeVoices.delete(key);
        }
        this.sustainedVoices.delete(voice);
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
        voice.gain.gain.setTargetAtTime(0.0001, releaseStart, 0.065);
        voice.oscs.forEach((o) => {
          try {
            o.stop(releaseStart + 0.35);
          } catch (_) {}
        });
      } catch (_) {}
    }

    stopAll(prefix) {
      for (const [key, voice] of Array.from(this.activeVoices.entries())) {
        if (!prefix || key.startsWith(prefix)) {
          this._fadeVoice(voice, 0.06);
          this.activeVoices.delete(key);
        }
      }
      if (!prefix) {
        this.sustainedVoices.forEach((v) => this._fadeVoice(v, 0.06));
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
        voice.oscs.forEach((o) => {
          try {
            o.stop(stopAt);
          } catch (_) {}
        });
      } catch (_) {}
    }
  }

  PianoApp.audio = new PianoAudio();
})(window);
