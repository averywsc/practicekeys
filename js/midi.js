(function (global) {
  'use strict';

  const PianoApp = (global.PianoApp = global.PianoApp || {});

  class MidiController {
    constructor() {
      this.access = null;
      this.connectedCount = 0;
      this.onNoteOn = null;
      this.onNoteOff = null;
      this.onSustain = null;
      this.onStatusChange = null;
    }

    init(handlers) {
      this.onNoteOn = handlers.onNoteOn || null;
      this.onNoteOff = handlers.onNoteOff || null;
      this.onSustain = handlers.onSustain || null;
      this.onStatusChange = handlers.onStatusChange || null;

      if (!navigator.requestMIDIAccess) return;
      navigator.requestMIDIAccess().then(
        (access) => {
          this.access = access;
          this._bindInputs();
          access.onstatechange = () => this._bindInputs();
        },
        () => {}
      );
    }

    _bindInputs() {
      if (!this.access) return;
      let count = 0;
      this.access.inputs.forEach((input) => {
        if (input.state === 'connected') {
          count++;
          input.onmidimessage = (e) => this._handleMessage(e);
        } else {
          input.onmidimessage = null;
        }
      });
      this.connectedCount = count;
      if (this.onStatusChange) this.onStatusChange(count > 0);
    }

    _handleMessage(event) {
      const data = event.data;
      if (!data || data.length < 2) return;
      const status = data[0] & 0xf0;
      const d1 = data[1];
      const d2 = data.length > 2 ? data[2] : 0;

      if (status === 0x90 && d2 > 0) {
        if (d1 >= 21 && d1 <= 108 && this.onNoteOn) {
          this.onNoteOn(d1, d2 / 127);
        }
      } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
        if (d1 >= 21 && d1 <= 108 && this.onNoteOff) {
          this.onNoteOff(d1);
        }
      } else if (status === 0xb0 && d1 === 64) {
        if (this.onSustain) this.onSustain(d2 >= 64);
      }
    }
  }

  PianoApp.midi = new MidiController();
})(window);
