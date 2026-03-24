import { store } from './state.js';
import { audioManager } from './audio.js';

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.activePaletteTarget = null; 
    this.mouseX = 0;
    this.mouseY = 0;
    this.isPainting = false;
    this.sprayLoop = null;
    
    // Удалили старые кнопки (btnMute, btnPause и т.д.), оставили только нужные
    this.elements = {
      btnLetters: document.getElementById('btn-letters'),
      btnBalls: document.getElementById('btn-balls'),
      btnFans: document.getElementById('btn-fans'),
      btnSlow: document.getElementById('btn-slow'),
      wordInput: document.getElementById('word-input'),
      beadCount: document.getElementById('bead-count'),
      loader: document.getElementById('loader'),
      btnMag: document.getElementById('btn-mag-main'),
      btnPaint: document.getElementById('btn-paint-main'),
      toolHint: document.getElementById('tool-hint')
    };
    
    this.initBindings();
    this.initStoreSubscriptions();
    this.initStartMenu();
  }

  hideLoader() {
    if (this.elements.loader) {
      this.elements.loader.style.display = 'none';
    }
  }

  initStartMenu() {
    // Будим аудиоконтекст при первом клике в любой точке экрана
    document.body.addEventListener('click', () => audioManager.resumeContext(), { once: true });

    // 1. Ищем все нужные элементы интерфейса
    const btnStart = document.getElementById('btn-start-game');
    const btnResume = document.getElementById('btn-resume-game');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnBackMain = document.getElementById('btn-back-main');
    const sliderSfx = document.getElementById('slider-sfx');
    const valSfx = document.getElementById('val-sfx');
    const sliderMusic = document.getElementById('slider-music');
    const valMusic = document.getElementById('val-music');
    const viewMain = document.getElementById('view-main');
    const viewSettings = document.getElementById('view-settings');
    const btnInGameMenu = document.getElementById('btn-in-game-menu');
    const btnExit = document.getElementById('btn-exit');
    const startMenu = document.getElementById('start-menu');
    const doors = document.getElementById('loader-doors');
    const centerHub = document.querySelector('.loader-center-hub');
    const btnLang = document.getElementById('btn-toggle-lang');

    // === 2. ЛОГИКА ПЕРЕВОДА МЕНЮ ===
    const translations = {
      EN: {
        resume: "RESUME",
        start: "NEW GAME",
        settings: "SETTINGS",
        exit: "EXIT",
        exitJoke: "CLOSE THE BROWSER TAB :)",
        back: "MAIN MENU",
        sfx: "SFX VOLUME",
        music: "MUSIC VOLUME",
        langTitle: "LANGUAGE:",
        inGameMenu: "MENU"
      },
      RU: {
        resume: "ПРОДОЛЖИТЬ",
        start: "НОВАЯ ИГРА",
        settings: "НАСТРОЙКИ",
        exit: "ВЫХОД",
        exitJoke: "ПРОСТО ЗАКРОЙ ВКЛАДКУ :)",
        back: "ГЛАВНОЕ МЕНЮ",
        sfx: "ГРОМКОСТЬ ЭФФЕКТОВ",
        music: "ГРОМКОСТЬ МУЗЫКИ",
        langTitle: "ЯЗЫК:",
        inGameMenu: "МЕНЮ"
      }
    };

    let currentLang = 'EN';

    const updateLanguage = (lang) => {
      const t = translations[lang];
      
      if (btnResume) btnResume.querySelector('.btn-text').textContent = t.resume;
      if (btnStart) btnStart.querySelector('.btn-text').textContent = t.start;
      if (btnOpenSettings) btnOpenSettings.querySelector('.btn-text').textContent = t.settings;
      if (btnExit) {
        btnExit.querySelector('.btn-text-default').textContent = t.exit;
        btnExit.querySelector('.exit-joke').textContent = t.exitJoke;
      }
      if (btnBackMain) btnBackMain.querySelector('.btn-text').textContent = t.back;
      
      // Обновляем текст заголовков ползунков
      if (sliderSfx && sliderSfx.parentElement) sliderSfx.parentElement.querySelector('.btn-text').textContent = t.sfx;
      if (sliderMusic && sliderMusic.parentElement) sliderMusic.parentElement.querySelector('.btn-text').textContent = t.music;
      
      // Обновляем саму кнопку языка
      if (btnLang) {
        btnLang.querySelector('.btn-text').textContent = t.langTitle;
        btnLang.querySelector('.status').textContent = lang;
      }
      if (btnInGameMenu) {
        const textSpan = btnInGameMenu.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = t.inGameMenu;
      }
    }; 

    // === ИСПРАВЛЕННЫЙ СЛУШАТЕЛЬ ПЕРЕКЛЮЧЕНИЯ ЯЗЫКА (Выпадающее меню) ===
    if (btnLang) {
      btnLang.addEventListener('click', (e) => {
        // Проверяем, кликнули ли мы по одной из внутренних кнопок (ENGLISH / РУССКИЙ)
        const clickedLangBtn = e.target.closest('.lang-btn');
        
        if (clickedLangBtn) {
          // Игрок выбрал конкретный язык
          currentLang = clickedLangBtn.dataset.lang; // Берем 'EN' или 'RU'
          updateLanguage(currentLang); // Переводим текст
          
          // Обновляем подсветку кнопок (убираем у всех, даем нажатой)
          document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active-lang'));
          clickedLangBtn.classList.add('active-lang');
          
          // Сворачиваем выпадающее меню
          btnLang.classList.remove('open');
          e.stopPropagation(); // Блокируем лишние срабатывания
        } else {
          // Игрок кликнул по самой шапке "LANGUAGE" — просто открываем/закрываем меню
          btnLang.classList.toggle('open');
        }
      });
    }

    // Применяем язык сразу при запуске
    updateLanguage(currentLang);


    // === 3. НАВИГАЦИЯ МЕЖДУ ОКНАМИ МЕНЮ (С предохранителем звука) ===
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => {
        // Включаем глушитель на полсекунды
        this.blockHoverSound = true;
        setTimeout(() => this.blockHoverSound = false, 500);

        viewMain.classList.remove('active');
        viewSettings.classList.add('active');
      });
    }

    if (btnBackMain) {
      btnBackMain.addEventListener('click', () => {
        // Включаем глушитель на полсекунды
        this.blockHoverSound = true;
        setTimeout(() => this.blockHoverSound = false, 500);

        viewSettings.classList.remove('active');
        viewMain.classList.add('active');
        if (btnLang) btnLang.classList.remove('open');
      });
    }


    // === 4. ЛОГИКА ПОЛЗУНКОВ (Плавная логарифмическая шкала) ===
    if (sliderSfx) {
      sliderSfx.addEventListener('input', (e) => {
        audioManager.resumeContext();
        const value = e.target.value;
        valSfx.textContent = `${value}%`;
        
        // Магия: возводим в квадрат для идеального звучания
        const volumeFloat = Math.pow(value / 100, 2) * 2.0;
        if (audioManager.setSfxVolume) {
          audioManager.setSfxVolume(volumeFloat);
        }
      });
    }

    if (sliderMusic) {
      sliderMusic.addEventListener('input', (e) => {
        const value = e.target.value;
        valMusic.textContent = `${value}%`;
        
        const volumeFloat = Math.pow(value / 100, 2) * 1.5;
        if (audioManager.setMusicVolume) {
          audioManager.setMusicVolume(volumeFloat);
        }
      });
    }


    // === 5. ВХОД В ИГРУ (Открытие дверей и звук) ===
    const enterGame = () => {
      audioManager.resumeContext(); 

      const elem = document.documentElement;
      if (elem.requestFullscreen && !document.fullscreenElement) elem.requestFullscreen();
      
      if (startMenu) startMenu.classList.add('game-started'); 

      if (centerHub && doors) {
        centerHub.classList.remove('fade-in-volumetric');
        
        // 1. Ждем 0.5с (переход в фуллскрин)
        setTimeout(() => {
          // 2. Растворяем ромб
          centerHub.classList.add('fade-out-fast');

          // 3. Ждем еще 0.6с, пока ромб исчезнет, и открываем
          setTimeout(() => {
            audioManager.fadeIn(1.0); 
            doors.classList.add('loaded');
            document.body.classList.remove('loading');
          }, 600); 
          
        }, 500); 
      }
    };

    if (btnStart) {
      btnStart.addEventListener('click', () => {
        if (btnResume && btnResume.style.display === 'flex') {
          if (this.cb && this.cb.onReset) this.cb.onReset();
        }
        enterGame();
      });
    }

    if (btnResume) {
      btnResume.addEventListener('click', () => enterGame());
    }


    // === 6. ВЫХОД ИЗ ИГРЫ (Закрытие дверей) ===
    if (btnInGameMenu) {
      btnInGameMenu.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          // Запасной план, если игра не в фуллскрине
          if (doors) doors.classList.remove('loaded');
          if (startMenu) startMenu.classList.remove('game-started');
          if (btnResume) btnResume.style.display = 'flex';
        }
      });
    }

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        
        audioManager.fadeOut(1.4); // Плавно гасим звук
        
        if (doors) doors.classList.remove('loaded'); 
        
        if (centerHub) {
          centerHub.classList.remove('fade-out-fast');
          centerHub.classList.remove('fade-in-volumetric');
          centerHub.classList.add('hub-hidden'); 

          setTimeout(() => {
            centerHub.classList.remove('hub-hidden');
            centerHub.classList.add('fade-in-volumetric');
          }, 1400); 
        }

        if (startMenu) {
          startMenu.classList.remove('game-started'); 
          if (viewMain && viewSettings) {
            viewSettings.classList.remove('active');
            viewMain.classList.add('active');
          }
        }

        if (btnResume) btnResume.style.display = 'flex';
        if (btnStart) btnStart.classList.remove('pulse-glow-volumetric');
      }
    });


    // === 7. КНОПКА ВЫХОДА ИЗ ВКЛАДКИ ===
    if (btnExit) {
      btnExit.addEventListener('click', () => {
        btnExit.classList.add('show-joke');
        setTimeout(() => btnExit.classList.remove('show-joke'), 3000);
      });
    }
  }

  startSprayEffect() {
    if (this.sprayLoop) return;

    const emit = () => {
      const colorIdx = store.get().paintToolColor;
      if (this.isPainting && colorIdx !== -1) {
        this.createSprayParticle(this.mouseX, this.mouseY, colorIdx);
        this.sprayLoop = requestAnimationFrame(emit);
      } else {
        this.sprayLoop = null;
      }
    };

    this.sprayLoop = requestAnimationFrame(emit);
  }

  createSprayParticle(mouseX, mouseY, colorIndex) {
    return;
  }

  updateBeadCounter(current, max) {
    if (this.elements.beadCount) this.elements.beadCount.textContent = `${current}/${max}`;
  }

  updateFanProgress(level) {
    if (this.elements.btnFans) this.elements.btnFans.style.setProperty('--prog', (level * 100) + '%');
  }

  resetUIState(lettersEnabled) {
    this.elements.btnLetters.classList.toggle('active-state', lettersEnabled);
    this.updateFanProgress(0);
  }

  lockLetters(isLocked) {
    const wrapper = this.elements.btnLetters.closest('.combo-wrapper');
    if (wrapper) wrapper.classList.toggle('locked', isLocked);
    if (isLocked) this.elements.btnLetters.classList.remove('active-state'); 
    
    if (this.elements.wordInput) {
      this.elements.wordInput.disabled = isLocked;
      this.elements.wordInput.style.opacity = isLocked ? '0.3' : '1';
      this.elements.wordInput.style.pointerEvents = isLocked ? 'none' : 'auto';
    }
  }

  setLettersActive(isActive) {
    this.elements.btnLetters.classList.toggle('active-state', isActive);
  }

  triggerApplyWord() {
    let newWord = this.elements.wordInput.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (newWord.length === 0) newWord = "GOOGLE"; 
    if (newWord.length > 8) newWord = newWord.substring(0, 8); 
    this.elements.wordInput.value = newWord;
    this.cb.onApplyWord(newWord);
  }

  closePalette() {
    document.querySelectorAll('.palette-container').forEach(p => p.classList.remove('open'));
    this.elements.btnMag.classList.remove('is-selecting');
    this.elements.btnPaint.classList.remove('is-selecting');
    this.activePaletteTarget = null;
  }

  openPalette(target) {
    this.closePalette();
    this.activePaletteTarget = target;
    const palette = document.querySelector(`.${target}-palette`);
    if (palette) palette.classList.add('open');
    this.elements.btnMag.classList.toggle('is-selecting', target === 'mag');
    this.elements.btnPaint.classList.toggle('is-selecting', target === 'paint');
  }

  initBindings() {
// --- ИСПРАВЛЕННЫЙ ЗВУК НАВЕДЕНИЯ (ТОЛЬКО ДЛЯ МЕНЮ) ---
    this.lastHoveredBtn = null; 

  document.addEventListener('mouseover', (e) => {
      // --- ФИКС 1: Блокируем звук наведения на время анимации ---
      if (this.blockHoverSound) return; 

      const btn = e.target.closest('#start-menu .holo-glass-btn, #start-menu .holo-back-tab, #start-menu .exit-btn');
      
      if (!btn) {
        this.lastHoveredBtn = null; 
        return;
      }
      
      if (btn !== this.lastHoveredBtn) {
        this.lastHoveredBtn = btn;
        audioManager.playUI('mouse_menu');
      }
    });

    // --- ИСПРАВЛЕННЫЙ ЗВУК КЛИКА (ТОЛЬКО ДЛЯ МЕНЮ) ---
  document.addEventListener('mousedown', (e) => {
      // НОВОЕ: Разрешаем звуки клика для меню И для игровой кнопки MENU
      if (!e.target.closest('#start-menu, #btn-in-game-menu')) {
        return; 
      }

      // Добавили #btn-in-game-menu к кнопкам, которые издают звук 'start'
      const startBtn = e.target.closest('#btn-start-game, #btn-resume-game, #btn-in-game-menu');
      if (startBtn) {
        audioManager.playUI('start');
        return; 
      }
      
      const menuBtn = e.target.closest('.holo-glass-btn, .holo-back-tab, .exit-btn');
      if (menuBtn) {
        audioManager.playUI('click');
      }
    });

    // --- СОБЫТИЯ ДЛЯ ИНСТРУМЕНТОВ И СЦЕНЫ ---
    window.addEventListener('mousedown', (e) => {
      // Чтобы мы не рисовали краской, пока кликаем по меню
      if (e.target.closest('#holo-wrapper') || e.target.closest('#hud-controls') || e.target.closest('#loader-doors')) return;

      if (e.button === 0) {
        this.isPainting = true;
        this.startSprayEffect();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPainting = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (store.get().currentTool !== -1 || store.get().paintToolColor !== -1) {
        e.preventDefault();
        store.update({ currentTool: -1, paintToolColor: -1 });
      }
    });

    // --- КЛИКИ ПО ОСНОВНОМУ ИНТЕРФЕЙСУ (ПАНЕЛЬ ИНСТРУМЕНТОВ) ---
    document.addEventListener('click', (e) => {
      const btnOrLink = e.target.closest('button, .hud-btn, .icon-btn, .holo-btn, .mode-btn, .mag-main-btn, .palette-color-btn');
      if (btnOrLink) btnOrLink.blur();

      if (this.activePaletteTarget && !e.target.closest('.equipment-rack')) {
        this.closePalette();
      }

      const target = e.target.closest('[data-action]');
      if (!target) return;

      e.preventDefault();
      const action = target.dataset.action;

      switch (action) {
        case 'applyWord': this.triggerApplyWord(); break;
        case 'setModeLab': store.update({ mode: 'lab' }); break;
        case 'setModeDisco': store.update({ mode: 'disco' }); break;
        case 'toggleLetters':
          const isEnabled = this.cb.onToggleLetters();
          this.elements.btnLetters.classList.toggle('active-state', isEnabled);
          break;
        case 'returnLetters': this.cb.onReturnLetters(); break;
        case 'spawnBalls': this.cb.onSpawnBalls(); break;
        case 'clearBalls': this.cb.onShrinkBalls(); break;
        case 'toggleSlowMo': store.update({ isSlowMo: !store.get().isSlowMo }); break;
        case 'toggleFans': this.cb.onToggleFans(); break;
        case 'togglePaletteMag':
          this.activePaletteTarget === 'mag' ? this.closePalette() : this.openPalette('mag');
          break;
        case 'togglePalettePaint':
          this.activePaletteTarget === 'paint' ? this.closePalette() : this.openPalette('paint');
          break;
        case 'selectPaletteColor':
          const colorVal = parseInt(target.dataset.color);
          if (this.activePaletteTarget === 'mag') {
            store.update({ paintToolColor: -1, currentTool: colorVal });
          } else {
            store.update({ currentTool: -1, paintToolColor: colorVal });
          }
          this.closePalette();
          break;
      }
    });

    // --- СОБЫТИЯ ПОЛЯ ВВОДА СЛОВА ---
    this.elements.wordInput.addEventListener('focus', (e) => { e.target.value = ''; });
    this.elements.wordInput.addEventListener('keypress', (e) => { 
      if (e.key === 'Enter') { this.triggerApplyWord(); this.elements.wordInput.blur(); } 
    });

    // --- ОТКРЫТИЕ/ЗАКРЫТИЕ ПРАВОЙ ПАНЕЛИ ---
    document.getElementById('terminal-handle').addEventListener('click', () => { 
      const wrapper = document.getElementById('holo-wrapper');
      wrapper.classList.toggle('open');
      if (!wrapper.classList.contains('open')) this.closePalette();
    });

    document.getElementById('holo-wrapper').addEventListener('mouseleave', () => this.closePalette());

    // --- ГОРЯЧИЕ КЛАВИШИ ---
    window.addEventListener('keydown', (e) => {
      if (document.activeElement === this.elements.wordInput) return;
      
      switch(e.code) {
        case 'Space': 
          e.preventDefault(); 
          if(this.cb.onTogglePause) this.cb.onTogglePause(); 
          break;
        case 'KeyR': 
          if(this.cb.onReset) this.cb.onReset(); 
          break; 
        case 'KeyM': 
          // Старая функция Mute удалена (теперь у нас ползунки), 
          // так что просто ничего не делаем, чтобы избежать ошибок.
          break;
        case 'KeyH': 
          document.body.classList.toggle('ui-hidden'); 
          this.closePalette(); 
          break;
      }
    });
  }

  initStoreSubscriptions() {
    store.subscribe((state) => {
      document.getElementById('mode-lab').classList.toggle('active', state.mode === 'lab'); 
      document.getElementById('mode-disco').classList.toggle('active', state.mode === 'disco'); 
      this.elements.btnSlow.classList.toggle('active-state', state.isSlowMo);

      const magMainBtn = document.getElementById('btn-mag-main');
      magMainBtn.classList.remove('mag-color-0', 'mag-color-1', 'mag-color-2', 'mag-color-3');
      document.body.classList.remove('tool-mag-0', 'tool-mag-1', 'tool-mag-2', 'tool-mag-3');
      if (state.currentTool !== -1) {
        document.body.classList.add(`tool-mag-${state.currentTool}`);
        magMainBtn.classList.add(`mag-color-${state.currentTool}`);
      }
      
      const paintBtn = document.getElementById('btn-paint-main');
      paintBtn.classList.remove('paint-color-0', 'paint-color-1', 'paint-color-2', 'paint-color-3');
      document.body.classList.remove('tool-paint-0', 'tool-paint-1', 'tool-paint-2', 'tool-paint-3');
      if (state.paintToolColor !== -1) {
        document.body.classList.add(`tool-paint-${state.paintToolColor}`);
        paintBtn.classList.add(`paint-color-${state.paintToolColor}`);
      }
      if (this.elements.toolHint) {
        this.elements.toolHint.classList.toggle('visible', state.currentTool !== -1 || state.paintToolColor !== -1);
      }
    });
  }
}