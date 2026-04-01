export const base64ReturnSound =
  "data:audio/mp3;base64,ТВОЙ_ОЧЕНЬ_ДЛИННЫЙ_КОД_СЮДА";

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sfxGainNode = null;
    this.uiGainNode = null;
    this.noiseBuffer = null;
    this.lastHitTime = 0;
    this.sfxVolume = 0.7;
    this.isMenuMuted = true;

    // Хранилище для звуков интерфейса
    this.uiBuffers = { mouse_menu: null, start: null, click: null, pop: null };
    this.initPromise = null;
  }

  // 1. Просыпаемся (теперь только один асинхронный метод)
  async resumeContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("Аудио-контекст заблокирован браузером");
      }
    }
  }

  // 2. Создаем узлы и запускаем загрузку
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.sfxGainNode = this.ctx.createGain();
    this.sfxGainNode.gain.value = 0;
    this.sfxGainNode.connect(this.ctx.destination);

    this.uiGainNode = this.ctx.createGain();
    this.uiGainNode.gain.value = this.sfxVolume * 0.15;
    this.uiGainNode.connect(this.ctx.destination);

    const bs = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;

    this.initPromise = this.loadUISounds();
  }

  setSfxVolume(volume) {
    this.sfxVolume = volume;
    if (this.sfxGainNode && !this.isMenuMuted) {
      this.sfxGainNode.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
    if (this.uiGainNode) {
      this.uiGainNode.gain.setTargetAtTime(
        volume * 0.5,
        this.ctx.currentTime,
        0.1,
      );
    }
  }

async loadUISounds() {
    console.log("🔊 Попытка загрузки звуков UI..."); 
    
    const load = async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(arrayBuffer);
        console.log(`✅ Успешно загружен: ${url}`);
        return buffer;
      } catch (e) {
        console.error(`❌ Ошибка загрузки ${url}:`, e.message);
        return null;
      }
    };

    // Загружаем всё параллельно для скорости
    const [m, s, c, p] = await Promise.all([
      load('audio/mouse_menu.mp3'),
      load('audio/start.mp3'),
      load('audio/click.mp3'),
      load('audio/gurgle.mp3') // <--- Вот тут важно не забыть запятую перед этой строкой!
    ]);

    this.uiBuffers.mouse_menu = m;
    this.uiBuffers.start = s; 
    this.uiBuffers.click = c; 
    this.uiBuffers.pop = p; 
    
    console.log("📂 Все буферы UI обновлены", this.uiBuffers);
  }

  async playUI(type) {
    // 1. Пытаемся разбудить контекст
    await this.resumeContext();
    
    // 2. Проверяем состояние
    if (!this.ctx || this.ctx.state === 'suspended') {
        console.warn("🔇 Звук заблокирован браузером. Нужен клик по странице.");
        return;
    }

    if (this.initPromise) await this.initPromise;

    if (!this.uiBuffers[type]) {
        console.error(`⚠️ Звук "${type}" не найден или не загружен!`);
        return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.uiBuffers[type];
    source.connect(this.uiGainNode);
    source.start();
  }

  // 4. Плавное появление и затухание
  fadeIn(duration = 1.0) {
    if (!this.ctx || !this.sfxGainNode) return;
    this.isMenuMuted = false;
    const t = this.ctx.currentTime;

    this.sfxGainNode.gain.cancelScheduledValues(t);
    this.sfxGainNode.gain.setValueAtTime(this.sfxGainNode.gain.value, t);
    this.sfxGainNode.gain.linearRampToValueAtTime(this.sfxVolume, t + duration);
  }

  fadeOut(duration = 1.4) {
    if (!this.ctx || !this.sfxGainNode) return;
    this.isMenuMuted = true;
    const t = this.ctx.currentTime;

    this.sfxGainNode.gain.cancelScheduledValues(t);
    this.sfxGainNode.gain.setValueAtTime(this.sfxGainNode.gain.value, t);
    this.sfxGainNode.gain.linearRampToValueAtTime(0, t + duration);
  }

  // 5. Остальные звуки игры
  async playBase64(base64Str) {
    if (!this.ctx) return;
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
    if (!this.ctx || this.sfxVolume === 0) return;
    const now = performance.now();
    if (now - this.lastHitTime < 30) return;
    this.lastHitTime = now;

    let intensity = Math.min(velocity / 15, 1);
    if (intensity < 0.1) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = "lowpass";
    filter.frequency.value = 950 + intensity * 1200;

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.sfxGainNode);

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
    if (!this.ctx || this.sfxVolume === 0) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";

    const t = this.ctx.currentTime;
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(50, t + duration);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.4, t);
    gainNode.gain.linearRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.sfxGainNode);

    noise.start();
    noise.stop(t + duration);
  }

  playFansWhoosh(isSlowMo) {
    if (!this.ctx || this.sfxVolume === 0) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 220;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 520;
    bp.Q.value = 0.9;
    const gain = this.ctx.createGain();

    src.connect(hp);
    hp.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxGainNode);

    const dur = isSlowMo ? 1.0 : 0.65;
    const t = this.ctx.currentTime;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.26, t + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.playbackRate.value = isSlowMo ? 0.8 : 1.0;
    src.start();
    src.stop(t + dur);
  }
  // Синтетический звук старого терминала (нулевая задержка, без файлов)
  playBiosBeep() {
    if (!this.ctx || this.ctx.state === 'suspended') return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    // 'square' (квадратная волна) — основа 8-битного звука
    osc.type = "square";
    const t = this.ctx.currentTime;
    
    // ВЫСОКАЯ ЧАСТОТА: 900-1100 Гц дает тот самый "писк" терминала
    osc.frequency.setValueAtTime(900 + Math.random() * 200, t);

    // ГРОМКОСТЬ: Делаем звук громким изначально. 
    // Даже если sfxVolume низкий, звук будет отчетливым.
    const boostedVolume = Math.max(this.sfxVolume, 0.5) * 0.3;
    gainNode.gain.setValueAtTime(boostedVolume, t);
    
    // Очень короткий "пип"
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.03);
  }
  
}




export const audioManager = new AudioManager();
