export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sfxGainNode = null;
    this.uiGainNode = null;
    this.musicGainNode = null; // <-- ДОБАВИЛИ КАНАЛ ДЛЯ МУЗЫКИ
    this.noiseBuffer = null;
    this.lastHitTime = 0;
    this.sfxVolume = 0.7;
    this.isMenuMuted = true;

    // Хранилище для звуков интерфейса
this.uiBuffers = {
  mouse_menu: null,
  start: null,
  click: null,
  pop: null,
  wake: null,
  connection: null,
  error: null,
  lamps: null,
  biosClick: null,
  openDoor: null,
  boxSlide: null,
};

this.currentOpenDoorSound = null;
this.currentBoxSlideSound = null;
this.boxSlideGain = null;
this.boxSlideStopTimer = null;
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

    // Канал звуковых эффектов игры (мячики, вентиляторы)
    this.sfxGainNode = this.ctx.createGain();
    this.sfxGainNode.gain.value = 0;
    this.sfxGainNode.connect(this.ctx.destination);

    // Канал звуков интерфейса (клики, сканирование)
    this.uiGainNode = this.ctx.createGain();
    this.uiGainNode.gain.value = this.sfxVolume * 0.15;
    this.uiGainNode.connect(this.ctx.destination);

    // Канал для фоновой музыки
    this.musicGainNode = this.ctx.createGain();
    this.musicGainNode.gain.value = 0.5; // Громкость по умолчанию
    this.musicGainNode.connect(this.ctx.destination);

    const bs = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, bs, this.ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bs; i++) d[i] = Math.random() * 2 - 1;

    this.initPromise = this.loadUISounds();
  }

  // 3. Управление громкостью (теперь здесь всё правильно)
  setSfxVolume(volume) {
    this.sfxVolume = volume;
    // Громкость игры
    if (this.sfxGainNode && !this.isMenuMuted) {
      this.sfxGainNode.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
    }
    // Громкость интерфейса
    if (this.uiGainNode) {
      this.uiGainNode.gain.setTargetAtTime(
        volume * 0.5,
        this.ctx.currentTime,
        0.1,
      );
    }
  }

  setMusicVolume(volume) {
    if (this.musicGainNode) {
      // Плавно меняем громкость музыки
      this.musicGainNode.gain.setTargetAtTime(
        volume,
        this.ctx.currentTime,
        0.1,
      );
    }
  }

  playScanSound() {
    if (!this.uiBuffers.connection || !this.ctx) return;

    // На всякий случай останавливаем предыдущий, если он вдруг играет
    this.stopScanSound();

    const source = this.ctx.createBufferSource();
    source.buffer = this.uiBuffers.connection;
    source.connect(this.uiGainNode);
    source.start(0);

    // Сохраняем ссылку на этот звук, чтобы потом его убить
    this.currentScanSound = source;
  }

  stopScanSound() {
    if (this.currentScanSound) {
      try {
        this.currentScanSound.stop();
        this.currentScanSound.disconnect();
      } catch (e) {
        // Игнорируем ошибку
      }
      this.currentScanSound = null;
    }
  }

    async playOpenDoor() {
    await this.resumeContext();

    if (!this.ctx || this.ctx.state === "suspended") {
      console.warn("🔇 Звук двери заблокирован браузером. Нужен клик по странице.");
      return;
    }

    if (this.initPromise) await this.initPromise;

    if (!this.uiBuffers.openDoor) {
      console.warn('⚠️ Звук "openDoor" не найден или не загружен!');
      return;
    }

    // Если игровой канал ещё приглушён меню — быстро включаем его.
    if (this.isMenuMuted && this.fadeIn) {
      this.fadeIn(0.08);
    }

    this.stopOpenDoor();

    const source = this.ctx.createBufferSource();
    source.buffer = this.uiBuffers.openDoor;

    source.connect(this.sfxGainNode || this.ctx.destination);
    source.start(0);

    this.currentOpenDoorSound = source;

    source.onended = () => {
      if (this.currentOpenDoorSound === source) {
        this.currentOpenDoorSound = null;
      }
    };
  }

  stopOpenDoor() {
    if (!this.currentOpenDoorSound) return;

    try {
      this.currentOpenDoorSound.stop();
      this.currentOpenDoorSound.disconnect();
    } catch (e) {
      // Игнорируем: звук мог уже закончиться.
    }

    this.currentOpenDoorSound = null;
  }

  async startBoxSlideLoop() {
  await this.resumeContext();

  if (!this.ctx || this.ctx.state === "suspended") return;
  if (this.initPromise) await this.initPromise;
  if (!this.uiBuffers.boxSlide) return;

  // Если игровой SFX-канал ещё приглушён меню — быстро включаем.
  if (this.isMenuMuted && this.fadeIn) {
    this.fadeIn(0.08);
  }

  if (this.currentBoxSlideSound) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.uiBuffers.boxSlide;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    source.connect(gain);
    gain.connect(this.sfxGainNode || this.ctx.destination);

    source.start(0);

    this.currentBoxSlideSound = source;
    this.boxSlideGain = gain;
  }

  async updateBoxSlide(intensity = 0) {
    if (!this.ctx) {
      if (intensity > 0.005) {
        await this.resumeContext();
      } else {
        return;
      }
    }

    if (!this.ctx) return;

    const safeIntensity = Math.max(0, Math.min(1, intensity));

    if (safeIntensity > 0.005) {
      if (this.boxSlideStopTimer) {
        clearTimeout(this.boxSlideStopTimer);
        this.boxSlideStopTimer = null;
      }

      await this.startBoxSlideLoop();

      if (this.boxSlideGain) {
        const targetVolume = 0.45 * safeIntensity;
        this.boxSlideGain.gain.setTargetAtTime(
          targetVolume,
          this.ctx.currentTime,
          0.08,
        );
      }

      return;
    }

    if (this.boxSlideGain) {
      this.boxSlideGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    }

    if (!this.boxSlideStopTimer) {
      this.boxSlideStopTimer = setTimeout(() => {
        this.stopBoxSlide();
      }, 350);
    }
  }

  stopBoxSlide() {
    if (this.boxSlideStopTimer) {
      clearTimeout(this.boxSlideStopTimer);
      this.boxSlideStopTimer = null;
    }

    if (this.currentBoxSlideSound) {
      try {
        this.currentBoxSlideSound.stop();
        this.currentBoxSlideSound.disconnect();
      } catch (e) {
        // Звук мог уже остановиться.
      }
    }

    if (this.boxSlideGain) {
      try {
        this.boxSlideGain.disconnect();
      } catch (e) {
        // Уже отключён.
      }
    }

    this.currentBoxSlideSound = null;
    this.boxSlideGain = null;
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

const [
  m,
  s,
  c,
  p,
  conn,
  err,
  wake,
  lamps,
  bios_click,
  openDoor,
  boxSlide,
] = await Promise.all([
  load("audio/mouse_menu.mp3"),
  load("audio/start.mp3"),
  load("audio/click.mp3"),
  load("audio/gurgle.mp3"),
  load("audio/sound-connection.mp3"),
  load("audio/error.mp3"),
  load("audio/robot-wake-up.mp3"),
  load("audio/fluorescent_lamps.mp3"),
  load("audio/bios-click.mp3"),
  load("audio/open-door.mp3"),
  load("audio/box-slide.mp3"),
]);

    this.uiBuffers.mouse_menu = m;
    this.uiBuffers.start = s;
    this.uiBuffers.click = c;
    this.uiBuffers.pop = p;
    this.uiBuffers.connection = conn;
    this.uiBuffers.error = err;
    this.uiBuffers.wake = wake;
    this.uiBuffers.lamps = lamps;
    this.uiBuffers.biosClick = bios_click; 
    this.uiBuffers.openDoor = openDoor;
    this.uiBuffers.boxSlide = boxSlide;

    console.log("📂 Все буферы UI обновлены", this.uiBuffers);
  }
  async playUI(type) {
    // 1. Пытаемся разбудить контекст
    await this.resumeContext();

    // 2. Проверяем состояние
    if (!this.ctx || this.ctx.state === "suspended") {
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

async playVolumePreview(type, volume) {
  await this.resumeContext();

  if (
    !this.ctx ||
    this.ctx.state === "suspended"
  ) {
    return;
  }

  if (this.initPromise) {
    await this.initPromise;
  }

  const buffer =
    this.uiBuffers[type];

  if (!buffer) {
    return;
  }

  const safeVolume =
    Math.max(
      0,
      Number(volume) || 0,
    );

  const source =
    this.ctx.createBufferSource();

  const gain =
    this.ctx.createGain();

  source.buffer = buffer;

  gain.gain.value =
    safeVolume;

  source.connect(gain);
  gain.connect(this.ctx.destination);

  source.start();

  source.onended = () => {
    try {
      source.disconnect();
      gain.disconnect();
    } catch (e) {
      // Уже отключено.
    }
  };
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
  // Воспроизведение звука печати из файла
  playBiosClick() {
    if (
      !this.ctx ||
      this.ctx.state === "suspended" ||
      !this.uiBuffers.biosClick
    )
      return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.uiBuffers.biosClick;

    // ФИШКА: Чуть-чуть меняем тональность каждого щелчка (Pitch),
    // чтобы звук казался живой клавиатурой, а не пулеметом
    source.playbackRate.value = 0.9 + Math.random() * 0.2;

    // Подключаем к каналу интерфейса
    source.connect(this.uiGainNode);
    source.start(0);
  }
}

export const audioManager = new AudioManager();
