(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});

  // Real-time YIN pitch detector for practicing on any acoustic or digital keyboard without cables
  class MicPitchListener {
    constructor() {
      this.active = false;
      this.ctx = null;
      this.stream = null;
      this.source = null;
      this.analyser = null;
      this.buf = null;
      this.rafId = 0;

      this.onNoteOn = null;
      this.onNoteOff = null;
      this.onStatusChange = null;

      this.currentMidi = null;
      this.candidateMidi = null;
      this.candidateFrames = 0;
      this.silenceFrames = 0;
      this.lastRms = 0;
    }

    init(handlers) {
      this.onNoteOn = handlers.onNoteOn || null;
      this.onNoteOff = handlers.onNoteOff || null;
      this.onStatusChange = handlers.onStatusChange || null;
    }

    isSupported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async toggle() {
      if (this.active) {
        this.stop();
        return false;
      }
      return this.start();
    }

    async start() {
      if (this.active || !this.isSupported()) return false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        const AudioCtx = global.AudioContext || global.webkitAudioContext;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        source.connect(analyser);

        this.stream = stream;
        this.ctx = ctx;
        this.source = source;
        this.analyser = analyser;
        this.buf = new Float32Array(analyser.fftSize);
        this.active = true;
        this.currentMidi = null;
        this.candidateMidi = null;
        this.candidateFrames = 0;
        this.silenceFrames = 0;

        if (this.onStatusChange) this.onStatusChange(true);
        this._loop();
        return true;
      } catch (_) {
        this.stop();
        return false;
      }
    }

    stop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      if (this.currentMidi !== null) {
        if (this.onNoteOff) this.onNoteOff(this.currentMidi);
        this.currentMidi = null;
      }
      if (this.source) {
        try { this.source.disconnect(); } catch (_) {}
        this.source = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((t) => {
          try { t.stop(); } catch (_) {}
        });
        this.stream = null;
      }
      if (this.ctx) {
        try { this.ctx.close(); } catch (_) {}
        this.ctx = null;
      }
      this.analyser = null;
      this.active = false;
      if (this.onStatusChange) this.onStatusChange(false);
    }

    _loop() {
      if (!this.active || !this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const detected = this._detectMidi(this.buf, this.ctx.sampleRate);

      if (detected !== null) {
        this.silenceFrames = 0;
        if (detected === this.candidateMidi) {
          this.candidateFrames++;
        } else {
          this.candidateMidi = detected;
          this.candidateFrames = 1;
        }

        // Confirm after 2 stable frames (~32ms) to prevent room noise false triggers
        if (this.candidateFrames >= 2 && detected !== this.currentMidi) {
          if (this.currentMidi !== null && this.onNoteOff) {
            this.onNoteOff(this.currentMidi);
          }
          this.currentMidi = detected;
          if (this.onNoteOn) {
            this.onNoteOn(detected, Math.min(1, Math.max(0.45, this.lastRms * 5.5)));
          }
        }
      } else {
        this.candidateMidi = null;
        this.candidateFrames = 0;
        this.silenceFrames++;
        if (this.currentMidi !== null && this.silenceFrames >= 5) {
          const old = this.currentMidi;
          this.currentMidi = null;
          if (this.onNoteOff) this.onNoteOff(old);
        }
      }

      this.rafId = requestAnimationFrame(() => this._loop());
    }

    // Compact YIN pitch estimator tuned for piano range (A1..C7, ~55Hz..2100Hz)
    _detectMidi(buf, sampleRate) {
      const len = buf.length;
      let rms = 0;
      for (let i = 0; i < len; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / len);
      this.lastRms = rms;
      if (rms < 0.018) return null;

      const half = len >> 1;
      const minLag = Math.max(16, Math.floor(sampleRate / 2200));
      const maxLag = Math.min(half - 2, Math.floor(sampleRate / 52));
      if (maxLag <= minLag) return null;

      const diff = new Float32Array(maxLag + 1);
      for (let tau = minLag; tau <= maxLag; tau++) {
        let sum = 0;
        for (let i = 0; i < half; i++) {
          const d = buf[i] - buf[i + tau];
          sum += d * d;
        }
        diff[tau] = sum;
      }

      // Cumulative mean normalized difference
      const cmnd = new Float32Array(maxLag + 1);
      let running = 0;
      for (let tau = 1; tau <= maxLag; tau++) {
        running += diff[tau];
        cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
      }

      const threshold = 0.14;
      let bestTau = -1;
      for (let tau = minLag; tau < maxLag; tau++) {
        if (cmnd[tau] < threshold) {
          while (tau + 1 < maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
          bestTau = tau;
          break;
        }
      }

      if (bestTau < 0) return null;

      // Parabolic interpolation around bestTau
      let refinedTau = bestTau;
      if (bestTau > minLag && bestTau < maxLag - 1) {
        const s0 = cmnd[bestTau - 1];
        const s1 = cmnd[bestTau];
        const s2 = cmnd[bestTau + 1];
        const denom = 2 * (2 * s1 - s2 - s0);
        if (Math.abs(denom) > 1e-6) {
          refinedTau = bestTau + (s2 - s0) / denom;
        }
      }

      const freq = sampleRate / refinedTau;
      if (freq < 52 || freq > 2200) return null;
      const exactMidi = 69 + 12 * Math.log2(freq / 440);
      const rounded = Math.round(exactMidi);
      // Reject unstable pitch bends > 38 cents off a real piano semitone
      if (Math.abs(exactMidi - rounded) > 0.38) return null;
      if (rounded < 21 || rounded > 108) return null;
      return rounded;
    }
  }

  PianoApp.mic = new MicPitchListener();
})(window);
