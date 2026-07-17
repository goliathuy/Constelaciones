/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class AmbientSynth {
  private ctx: AudioContext | null = null;
  private oscRoot: OscillatorNode | null = null;
  private oscFifth: OscillatorNode | null = null;
  private oscThird: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private active: boolean = false;

  // Active Gravity Anchor Hum State
  private anchorOsc: OscillatorNode | null = null;
  private anchorGain: GainNode | null = null;

  public start() {
    if (this.active) return;
    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();

      // Master Gain for smooth volume control
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      // Fade in master volume to prevent clicks
      this.masterGain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 2.0);

      // Low pass filter to keep it dark and warm
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.setValueAtTime(1.5, this.ctx.currentTime);
      this.filter.frequency.setValueAtTime(350, this.ctx.currentTime);

      // Create Oscillators (Sine / Triangle for soft texture)
      // Root note C3 (130.81 Hz)
      this.oscRoot = this.ctx.createOscillator();
      this.oscRoot.type = 'sine';
      this.oscRoot.frequency.setValueAtTime(130.81, this.ctx.currentTime);

      // Perfect Fifth G3 (196.00 Hz)
      this.oscFifth = this.ctx.createOscillator();
      this.oscFifth.type = 'triangle';
      this.oscFifth.frequency.setValueAtTime(196.00, this.ctx.currentTime);

      // Third E3 (164.81 Hz) or Eb3 (155.56 Hz) - we'll dynamically shift it
      this.oscThird = this.ctx.createOscillator();
      this.oscThird.type = 'sine';
      this.oscThird.frequency.setValueAtTime(164.81, this.ctx.currentTime);

      // Create separate gains for oscillators to blend them nicely
      const gainRoot = this.ctx.createGain();
      gainRoot.gain.setValueAtTime(0.08, this.ctx.currentTime);

      const gainFifth = this.ctx.createGain();
      gainFifth.gain.setValueAtTime(0.04, this.ctx.currentTime);

      const gainThird = this.ctx.createGain();
      gainThird.gain.setValueAtTime(0.05, this.ctx.currentTime);

      // LFO for slow breathing filter cutoff sweep
      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'sine';
      this.lfo.frequency.setValueAtTime(0.08, this.ctx.currentTime); // very slow (0.08Hz)

      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.setValueAtTime(100, this.ctx.currentTime); // Sweep range (100Hz)

      // Connect LFO
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.filter.frequency);

      // Connect oscillators to filter
      this.oscRoot.connect(gainRoot);
      this.oscFifth.connect(gainFifth);
      this.oscThird.connect(gainThird);

      gainRoot.connect(this.filter);
      gainFifth.connect(this.filter);
      gainThird.connect(this.filter);

      // Connect filter to master and output
      this.filter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Start everything
      this.oscRoot.start(0);
      this.oscFifth.start(0);
      this.oscThird.start(0);
      this.lfo.start(0);

      this.active = true;
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  public updateHealth(health: number) {
    if (!this.active || !this.ctx || !this.filter || !this.oscThird || !this.oscRoot || !this.oscFifth) return;

    // Smooth transition times
    const t = this.ctx.currentTime;

    // 1. Filter cutoff frequency shifts with health.
    // In healthy zone (around 50), the sound is warm and cozy (cutoff ~300Hz-400Hz).
    // In Saturation (100), the sound opens up, becomes buzzier and denser (cutoff ~700Hz).
    // In Isolation (0), it becomes very dark and sparse (cutoff ~150Hz).
    const targetCutoff = 180 + (health * 5.2); // Range ~180Hz to 700Hz
    this.filter.frequency.exponentialRampToValueAtTime(Math.max(100, targetCutoff), t + 0.8);

    // 2. Chord quality shift based on health:
    // If healthy (35-65), keep standard major/neutral (third is major E3: 164.81 Hz or standard fifth).
    // If isolating (0-35), shift the third down to Eb3 (155.56 Hz) to create a melancholic minor feel, and slow down rates.
    // If saturated (65-100), shift the root or third to create minor/dissonant clusters (e.g. Eb3 or F3) to sound chaotic.
    let targetThirdFreq = 164.81; // Major E3
    let targetRootFreq = 130.81; // C3
    let targetFifthFreq = 196.00; // G3

    if (health < 35) {
      // Melancholic, cold minor chord (C-Eb-G)
      targetThirdFreq = 155.56; // Eb3
    } else if (health > 65) {
      // Dissonant, tense cluster chord (C-F#-G) to sound chaotic/overcrowded
      targetThirdFreq = 185.00; // F#3 (dissonant tritone)
      targetFifthFreq = 196.00; // G3
    }

    this.oscThird.frequency.exponentialRampToValueAtTime(targetThirdFreq, t + 1.2);
    this.oscRoot.frequency.exponentialRampToValueAtTime(targetRootFreq, t + 1.2);
    this.oscFifth.frequency.exponentialRampToValueAtTime(targetFifthFreq, t + 1.2);
  }

  /**
   * Play dynamic Pulse activation SFX
   */
  public playPulseSFX(type: 'attract' | 'repel') {
    if (!this.active || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type === 'attract' ? 'sine' : 'triangle';
      
      if (type === 'attract') {
        // High, cozy rising sound
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.35);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.35);
      } else {
        // Warning, descending laser/impact sound
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.4);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.4);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      console.warn('Error playing pulse SFX:', e);
    }
  }

  /**
   * Play heavy wave Resonance sweep SFX
   */
  public playResonanceSFX() {
    if (!this.active || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      
      // Celestial chord arpeggio sweep: C4 (261.63), E4 (329.63), G4 (392.00), C5 (523.25)
      const freqs = [261.63, 329.63, 392.00, 523.25];
      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        
        // Gentle vibrato on resonance
        const vibrato = this.ctx!.createOscillator();
        const vibratoGain = this.ctx!.createGain();
        vibrato.frequency.value = 6; // 6Hz frequency
        vibratoGain.gain.value = 5;  // 5Hz swing
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        vibrato.start(now);
        vibrato.stop(now + 1.6);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.08 + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2 + idx * 0.1);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.start(now + idx * 0.08);
        osc.stop(now + 1.6);
      });
    } catch (e) {
      console.warn('Error playing resonance SFX:', e);
    }
  }

  /**
   * Starts or stops a continuous sub-bass hum while holding the Gravity Anchor
   */
  public setAnchorActive(active: boolean) {
    if (!this.active || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      if (active) {
        if (this.anchorOsc) return; // already active

        this.anchorOsc = this.ctx.createOscillator();
        this.anchorGain = this.ctx.createGain();

        // A deep physical sub-bass rumble (85Hz)
        this.anchorOsc.type = 'sine';
        this.anchorOsc.frequency.setValueAtTime(85, now);

        this.anchorGain.gain.setValueAtTime(0, now);
        this.anchorGain.gain.linearRampToValueAtTime(0.06, now + 0.12);

        this.anchorOsc.connect(this.anchorGain);
        this.anchorGain.connect(this.ctx.destination);

        this.anchorOsc.start(now);
      } else {
        if (!this.anchorOsc || !this.anchorGain) return;

        const currentOsc = this.anchorOsc;
        const currentGain = this.anchorGain;

        currentGain.gain.cancelScheduledValues(now);
        currentGain.gain.setValueAtTime(currentGain.gain.value, now);
        currentGain.gain.linearRampToValueAtTime(0, now + 0.15);

        setTimeout(() => {
          try {
            currentOsc.stop();
            currentOsc.disconnect();
            currentGain.disconnect();
          } catch (err) {}
        }, 180);

        this.anchorOsc = null;
        this.anchorGain = null;
      }
    } catch (e) {
      console.warn('Error updating anchor hum:', e);
    }
  }

  public stop() {
    // Release active hums
    this.setAnchorActive(false);

    if (!this.active || !this.ctx || !this.masterGain) return;

    try {
      const t = this.ctx.currentTime;
      // Fade out slowly to avoid clicks
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
      this.masterGain.gain.linearRampToValueAtTime(0, t + 0.5);

      setTimeout(() => {
        if (this.oscRoot) { this.oscRoot.stop(); this.oscRoot.disconnect(); }
        if (this.oscFifth) { this.oscFifth.stop(); this.oscFifth.disconnect(); }
        if (this.oscThird) { this.oscThird.stop(); this.oscThird.disconnect(); }
        if (this.lfo) { this.lfo.stop(); this.lfo.disconnect(); }
        if (this.filter) this.filter.disconnect();
        if (this.masterGain) this.masterGain.disconnect();
        if (this.ctx) this.ctx.close();

        this.oscRoot = null;
        this.oscFifth = null;
        this.oscThird = null;
        this.lfo = null;
        this.filter = null;
        this.masterGain = null;
        this.ctx = null;
        this.active = false;
      }, 600);
    } catch (e) {
      console.warn('Error during synth cleanup:', e);
      this.active = false;
    }
  }

  public isActive(): boolean {
    return this.active;
  }
}

export const ambientSynth = new AmbientSynth();
