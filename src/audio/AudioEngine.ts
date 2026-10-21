export class AudioEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private muted = false;

  public initOnUserGesture(): void {
    if (this.ctx || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // Boat engine synthesizer loop
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 48;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.04;

    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();

    // Distant harbour police siren oscillator
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 520;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(muted ? 0 : 0.04, this.ctx.currentTime, 0.05);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public update(speedMps: number, throttle: number, heatActive: boolean, time: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.sirenOsc || !this.sirenGain) return;
    if (this.muted) {
      this.engineGain.gain.value = 0;
      this.sirenGain.gain.value = 0;
      return;
    }

    const targetFreq = 44 + speedMps * 2.6 + Math.abs(throttle) * 28;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.06);
    this.engineGain.gain.setTargetAtTime(0.03 + Math.abs(throttle) * 0.045, this.ctx.currentTime, 0.08);

    if (heatActive) {
      this.sirenOsc.frequency.setValueAtTime(580 + Math.sin(time * 6.5) * 160, this.ctx.currentTime);
      this.sirenGain.gain.setTargetAtTime(0.025, this.ctx.currentTime, 0.1);
    } else {
      this.sirenGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.1);
    }
  }

  public playChime(freq = 660): void {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}
