export const base64ReturnSound = "data:audio/mp3;base64,ТВОЙ_ОЧЕНЬ_ДЛИННЫЙ_КОД";

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.noiseBuffer = null;
    this.isMuted = true;
    this.lastHitTime = 0;
  }

  init() {
    if (this.ctx) return; 
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    const bs = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    if (!this.ctx) this.init();
    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      this.ctx.suspend();
    } else {
      this.ctx.resume();
    }
    return this.isMuted;
  }

  async playBase64(base64Str) {
    if (this.isMuted || !this.ctx) return;
    try {
      const response = await fetch(base64Str);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.ctx.destination);
      source.start();
    } catch (error) {
      console.warn("Audio error:", error);
    }
  }

  playHitSound(velocity, isSlowMo) {
    if (this.isMuted || !this.ctx) return;

    const now = performance.now();
    if (now - this.lastHitTime < 30) return;
    this.lastHitTime = now;

    let intensity = Math.min(velocity / 15, 1);
    if (intensity < 0.1) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.value = 950 + (intensity * 1200);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    const randomDetune = (Math.random() - 0.5) * 120;
    let freq = 320 + randomDetune; 
    if (isSlowMo) freq /= 2;

    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq / 3, t + 0.12);
    
    gainNode.gain.setValueAtTime(0, t);
    gainNode.gain.linearRampToValueAtTime(intensity * 0.55, t + 0.012);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.start();
    osc.stop(t + 0.22);
  }

  playPuffSound(duration = 1.0) {
    if (this.isMuted || !this.ctx) return; 
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    
    const t = this.ctx.currentTime;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(50, t + duration);
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.4, t);
    gainNode.gain.linearRampToValueAtTime(0.001, t + duration);
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    noise.start();
    noise.stop(t + duration);
  }

  playFansWhoosh(isSlowMo) {
    if (this.isMuted || !this.ctx) return;
    const src = this.ctx.createBufferSource(); 
    src.buffer = this.noiseBuffer;
    
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.9;
    const gain = this.ctx.createGain(); 
    
    src.connect(hp); hp.connect(bp); bp.connect(gain); gain.connect(this.ctx.destination);
    
    const dur = isSlowMo ? 1.0 : 0.65;
    const t = this.ctx.currentTime;
    
    gain.gain.setValueAtTime(0.0001, t); 
    gain.gain.exponentialRampToValueAtTime(0.26, t + 0.07); 
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    
    src.playbackRate.value = isSlowMo ? 0.8 : 1.0; 
    src.start(); 
    src.stop(t + dur);
  }
}

export const audioManager = new AudioManager();