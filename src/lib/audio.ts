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
  private anchorOvertoneOsc: OscillatorNode | null = null;
  private anchorOvertoneGain: GainNode | null = null;

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
   * Play dynamic Pulse activation SFX - rewritten for warm, acoustic physical feel
   */
  public playPulseSFX(type: 'attract' | 'repel') {
    if (!this.active || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;

      if (type === 'attract') {
        // --- COZY CRYSTAL BELL PLUCK ---
        // Instead of a sweep, we use dual high-resonance sine wave bell harmonics
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        const gain2 = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        // High-pass filter to keep it sparkling and clean
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(300, now);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now); // E5 (Pure harmonic note)
        gain1.gain.setValueAtTime(0.06, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.50, now); // E6 (Octave overtone)
        gain2.gain.setValueAtTime(0.02, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc1.connect(gain1);
        osc2.connect(gain2);
        
        gain1.connect(filter);
        gain2.connect(filter);
        
        filter.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.65);
        osc2.stop(now + 0.3);
      } else {
        // --- MUFFLED PHYSICAL AIR THUMP ---
        // Instead of descending sirens, a low-frequency wooden thump/mallet kick
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const lowpass = this.ctx.createBiquadFilter();

        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(130, now);
        lowpass.Q.setValueAtTime(1.0, now);

        osc.type = 'sine';
        // Gentle downward physical sweep mimicking acoustic air displacement
        osc.frequency.setValueAtTime(105, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.15);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(lowpass);
        lowpass.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      console.warn('Error playing pulse SFX:', e);
    }
  }

  /**
   * Play heavy wave Resonance sweep SFX - rewritten as a slow-blooming ambient pad chord
   */
  public playResonanceSFX() {
    if (!this.active || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      
      // Warm Minor 9th / Pentatonic cozy chime chord: 
      // F4 (349.23), A4 (440.00), C5 (523.25), E5 (659.25), G5 (783.99)
      const freqs = [349.23, 440.00, 523.25, 659.25, 783.99];
      
      const masterResonanceGain = this.ctx.createGain();
      const resonanceFilter = this.ctx.createBiquadFilter();

      // Sweeping lowpass filter to make it sound "foggy" and cinematic
      resonanceFilter.type = 'lowpass';
      resonanceFilter.Q.setValueAtTime(2.0, now);
      resonanceFilter.frequency.setValueAtTime(700, now);
      resonanceFilter.frequency.exponentialRampToValueAtTime(220, now + 2.0);

      masterResonanceGain.gain.setValueAtTime(0.12, now);
      masterResonanceGain.gain.linearRampToValueAtTime(0, now + 2.5);

      freqs.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        
        // Gentle individual pitch vibrato
        const vibrato = this.ctx!.createOscillator();
        const vibratoGain = this.ctx!.createGain();
        vibrato.frequency.value = 4.5; // slow lush vibrato
        vibratoGain.gain.value = 3;    // gentle width
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        
        gain.gain.setValueAtTime(0, now);
        // Staggered attack to make the chord "bloom" beautifully
        gain.gain.linearRampToValueAtTime(0.04, now + idx * 0.12 + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + idx * 0.15);
        
        osc.connect(gain);
        gain.connect(resonanceFilter);
        
        vibrato.start(now);
        vibrato.stop(now + 2.4);
        osc.start(now + idx * 0.12);
        osc.stop(now + 2.5);
      });

      resonanceFilter.connect(masterResonanceGain);
      masterResonanceGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Error playing resonance SFX:', e);
    }
  }

  /**
   * Starts or stops a continuous anchor hum (Deep organic rumble + singing bowl overtone)
   */
  public setAnchorActive(active: boolean) {
    if (!this.active || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      if (active) {
        if (this.anchorOsc) return; // already active

        // 1. Core sub-bass rumble
        this.anchorOsc = this.ctx.createOscillator();
        this.anchorGain = this.ctx.createGain();

        this.anchorOsc.type = 'sine';
        this.anchorOsc.frequency.setValueAtTime(85, now); // 85Hz base

        this.anchorGain.gain.setValueAtTime(0, now);
        this.anchorGain.gain.linearRampToValueAtTime(0.07, now + 0.25);

        this.anchorOsc.connect(this.anchorGain);
        this.anchorGain.connect(this.ctx.destination);
        this.anchorOsc.start(now);

        // 2. High crystal Singing Bowl overtone
        this.anchorOvertoneOsc = this.ctx.createOscillator();
        this.anchorOvertoneGain = this.ctx.createGain();

        this.anchorOvertoneOsc.type = 'sine';
        this.anchorOvertoneOsc.frequency.setValueAtTime(510, now); // 6th harmonic (pure perfect chime)

        // Shimmering LFO for the overtone tremolo
        const shimmerLfo = this.ctx.createOscillator();
        const shimmerGain = this.ctx.createGain();
        shimmerLfo.frequency.value = 3.5; // 3.5Hz pulse
        shimmerGain.gain.value = 0.006;   // gentle intensity

        this.anchorOvertoneGain.gain.setValueAtTime(0, now);
        this.anchorOvertoneGain.gain.linearRampToValueAtTime(0.012, now + 0.4);

        shimmerLfo.connect(shimmerGain);
        shimmerGain.connect(this.anchorOvertoneGain.gain);

        this.anchorOvertoneOsc.connect(this.anchorOvertoneGain);
        this.anchorOvertoneGain.connect(this.ctx.destination);

        shimmerLfo.start(now);
        this.anchorOvertoneOsc.start(now);
      } else {
        if (!this.anchorOsc || !this.anchorGain) return;

        const currentOsc = this.anchorOsc;
        const currentGain = this.anchorGain;
        const currentOvertoneOsc = this.anchorOvertoneOsc;
        const currentOvertoneGain = this.anchorOvertoneGain;

        currentGain.gain.cancelScheduledValues(now);
        currentGain.gain.setValueAtTime(currentGain.gain.value, now);
        currentGain.gain.linearRampToValueAtTime(0, now + 0.2);

        if (currentOvertoneGain) {
          currentOvertoneGain.gain.cancelScheduledValues(now);
          currentOvertoneGain.gain.setValueAtTime(currentOvertoneGain.gain.value, now);
          currentOvertoneGain.gain.linearRampToValueAtTime(0, now + 0.2);
        }

        setTimeout(() => {
          try {
            currentOsc.stop();
            currentOsc.disconnect();
            currentGain.disconnect();
            if (currentOvertoneOsc) {
              currentOvertoneOsc.stop();
              currentOvertoneOsc.disconnect();
            }
            if (currentOvertoneGain) {
              currentOvertoneGain.disconnect();
            }
          } catch (err) {}
        }, 220);

        this.anchorOsc = null;
        this.anchorGain = null;
        this.anchorOvertoneOsc = null;
        this.anchorOvertoneGain = null;
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
