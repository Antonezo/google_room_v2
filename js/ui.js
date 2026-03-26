import { store } from "./state.js";
import { audioManager } from "./audio.js";

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.activePaletteTarget = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.isPainting = false;
    this.sprayLoop = null;
    this.blockHoverSound = false;

    // Кэшируем ВСЕ нужные элементы один раз
    this.elements = {
      btnLetters: document.getElementById("btn-letters"),
      btnBalls: document.getElementById("btn-balls"),
      btnFans: document.getElementById("btn-fans"),
      btnSlow: document.getElementById("btn-slow"),
      wordInput: document.getElementById("word-input"),
      beadCount: document.getElementById("bead-count"),
      loader: document.getElementById("loader"),
      btnMag: document.getElementById("btn-mag-main"),
      btnPaint: document.getElementById("btn-paint-main"),
      toolHint: document.getElementById("tool-hint"),

      // НОВЫЙ КОД:
      startMenu: document.getElementById('futuristic-start-menu'), // <-- Change ID reference
      doors: document.getElementById("loader-doors"),
      centerHub: document.querySelector(".loader-center-hub"),
      viewMain: document.getElementById("view-main"),
      viewSettings: document.getElementById("view-settings"),

      btnStart: document.getElementById("btn-start-game"),
      btnResume: document.getElementById("btn-resume-game"),
      btnOpenSettings: document.getElementById("btn-open-settings"),
      btnBackMain: document.getElementById("btn-back-main"),
      btnExit: document.getElementById("btn-exit"),
      btnInGameMenu: document.getElementById("btn-in-game-menu"),
      btnLang: document.getElementById("btn-toggle-lang"),

      sliderSfx: document.getElementById("slider-sfx"),
      valSfx: document.getElementById("val-sfx"),
      sliderMusic: document.getElementById("slider-music"),
      valMusic: document.getElementById("val-music"),
    };

    // Словари для перевода
    this.translations = {
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
        inGameMenu: "MENU",
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
        inGameMenu: "МЕНЮ",
      },
    };

    this.initBindings();
    this.initMenuSounds();
    this.initStoreSubscriptions();
    this.initStartMenu();
  }

  hideLoader() {
    if (this.elements.loader) this.elements.loader.style.display = "none";
  }

  updateLanguage(lang) {
    const t = this.translations[lang];
    const el = this.elements;

    if (el.btnResume)
      el.btnResume.querySelector(".btn-text").textContent = t.resume;
    if (el.btnStart)
      el.btnStart.querySelector(".btn-text").textContent = t.start;
    if (el.btnOpenSettings)
      el.btnOpenSettings.querySelector(".btn-text").textContent = t.settings;
    if (el.btnExit) {
      el.btnExit.querySelector(".btn-text-default").textContent = t.exit;
      el.btnExit.querySelector(".exit-joke").textContent = t.exitJoke;
    }
    if (el.btnBackMain)
      el.btnBackMain.querySelector(".btn-text").textContent = t.back;

    if (el.sliderSfx)
      el.sliderSfx.parentElement.querySelector(".btn-text").textContent = t.sfx;
    if (el.sliderMusic)
      el.sliderMusic.parentElement.querySelector(".btn-text").textContent =
        t.music;

    if (el.btnLang) {
      el.btnLang.querySelector(".btn-text").textContent = t.langTitle;
      el.btnLang.querySelector(".status").textContent = lang;
    }
    if (el.btnInGameMenu) {
      const textSpan = el.btnInGameMenu.querySelector(".btn-text");
      if (textSpan) textSpan.textContent = t.inGameMenu;
    }
  }

  initStartMenu() {
    document.body.addEventListener(
      "click",
      () => {
        if (audioManager && audioManager.resumeContext)
          audioManager.resumeContext();
      },
      { once: true },
    );

    let currentLang = "EN";
    const el = this.elements;
// ЩИТ ОТ ФАНТОМНЫХ КЛИКОВ: 
    // Двери перехватывают все взаимодействия и не пускают их в Three.js
    ['pointerdown', 'mousedown', 'wheel', 'touchstart', 'contextmenu'].forEach(evt => {
      el.doors.addEventListener(evt, (e) => {
        if (!el.doors.classList.contains('loaded')) {
          e.stopPropagation(); // Убиваем всплытие события!
        }
      });
    });

    // 1. Язык
    if (el.btnLang) {
      el.btnLang.addEventListener("click", (e) => {
        const clickedLangBtn = e.target.closest(".lang-btn");
        if (clickedLangBtn) {
          currentLang = clickedLangBtn.dataset.lang;
          this.updateLanguage(currentLang);

          document
            .querySelectorAll(".lang-btn")
            .forEach((b) => b.classList.remove("active-lang"));
          clickedLangBtn.classList.add("active-lang");

          el.btnLang.classList.remove("open");
          e.stopPropagation();
        } else {
          el.btnLang.classList.toggle("open");
        }
      });
    }
    this.updateLanguage(currentLang);

    // 2. Навигация
    const toggleView = (hideView, showView) => {
      this.blockHoverSound = true;
      setTimeout(() => (this.blockHoverSound = false), 500);
      hideView.classList.remove("active");
      showView.classList.add("active");
    };

    if (el.btnOpenSettings) {
      el.btnOpenSettings.addEventListener("click", () =>
        toggleView(el.viewMain, el.viewSettings),
      );
    }
    if (el.btnBackMain) {
      el.btnBackMain.addEventListener("click", () => {
        toggleView(el.viewSettings, el.viewMain);
        if (el.btnLang) el.btnLang.classList.remove("open");
      });
    }

    // 3. Ползунки (ИСПРАВЛЕНО: Безопасный вызов аудио)
    const setupSlider = (slider, valDisplay, funcName, multiplier) => {
      if (!slider) return;
      slider.addEventListener("input", (e) => {
        if (audioManager && audioManager.resumeContext)
          audioManager.resumeContext();
        const value = e.target.value;
        valDisplay.textContent = `${value}%`;
        const volumeFloat = Math.pow(value / 100, 2) * multiplier;
        // Проверяем, существует ли метод перед его вызовом
        if (audioManager && typeof audioManager[funcName] === "function") {
          audioManager[funcName](volumeFloat);
        }
      });
    };

    // Передаем имена методов строкой, чтобы не ловить ошибку undefined.bind
    setupSlider(el.sliderSfx, el.valSfx, "setSfxVolume", 2.0);
    setupSlider(el.sliderMusic, el.valMusic, "setMusicVolume", 1.5);

    // 4. Вход в игру
    const enterGame = () => {
      if (audioManager && audioManager.resumeContext)
        audioManager.resumeContext();
      const htmlElem = document.documentElement;
      if (htmlElem.requestFullscreen && !document.fullscreenElement)
        htmlElem.requestFullscreen();

      if (el.startMenu) el.startMenu.classList.add("game-started");

      if (el.centerHub && el.doors) {
        el.centerHub.classList.remove("fade-in-volumetric");
        setTimeout(() => {
          el.centerHub.classList.add("fade-out-fast");
          setTimeout(() => {
            if (audioManager && audioManager.fadeIn) audioManager.fadeIn(1.0);
            el.doors.classList.add("loaded");
            document.body.classList.remove("loading");
          }, 600);
        }, 500);
      }
    };

    if (el.btnStart) {
      el.btnStart.addEventListener("click", () => {
        // Добавил защиту this.cb
        if (
          el.btnResume &&
          el.btnResume.style.display === "flex" &&
          this.cb &&
          this.cb.onReset
        ) {
          this.cb.onReset();
        }
        enterGame();
      });
    }
    if (el.btnResume) el.btnResume.addEventListener("click", enterGame);

    // 5. Выход в меню
    if (el.btnInGameMenu) {
      el.btnInGameMenu.addEventListener("click", () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          if (el.doors) el.doors.classList.remove("loaded");
          if (el.startMenu) el.startMenu.classList.remove("game-started");
          if (el.btnResume) el.btnResume.style.display = "flex";
        }
      });
    }

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        if (audioManager && audioManager.fadeOut) audioManager.fadeOut(1.4);
        if (el.doors) el.doors.classList.remove("loaded");

        if (el.centerHub) {
          el.centerHub.classList.remove("fade-out-fast", "fade-in-volumetric");
          el.centerHub.classList.add("hub-hidden");
          setTimeout(() => {
            el.centerHub.classList.remove("hub-hidden");
            el.centerHub.classList.add("fade-in-volumetric");
          }, 1400);
        }

        if (el.startMenu) {
          el.startMenu.classList.remove("game-started");
          if (el.viewMain && el.viewSettings) {
            el.viewSettings.classList.remove("active");
            el.viewMain.classList.add("active");
          }
        }

        if (el.btnResume) el.btnResume.style.display = "flex";
        if (el.btnStart) el.btnStart.classList.remove("pulse-glow-volumetric");
      }
    });

    // 6. Кнопка Exit
    if (el.btnExit) {
      el.btnExit.addEventListener("click", () => {
        el.btnExit.classList.add("show-joke");
        setTimeout(() => el.btnExit.classList.remove("show-joke"), 3000);
      });
    }
  }

  initMenuSounds() {
    const menuButtons = document.querySelectorAll(
      "#start-menu .holo-glass-btn, #start-menu .holo-back-tab, #start-menu .exit-btn",
    );

    menuButtons.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        if (!this.blockHoverSound && audioManager && audioManager.playUI) {
          audioManager.playUI("mouse_menu");
        }
      });
    });

 window.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#start-menu, #btn-in-game-menu')) return; 

      const startBtn = e.target.closest('#btn-start-game, #btn-resume-game, #btn-in-game-menu');
      if (startBtn) {
        if(audioManager && audioManager.playUI) audioManager.playUI('start');
        return; 
      }
      
      const menuBtn = e.target.closest('.holo-glass-btn, .holo-back-tab, .exit-btn');
      if (menuBtn) {
        if(audioManager && audioManager.playUI) audioManager.playUI('click');
      }
    }, true); // <-- Главное отличие здесь! 'window' и 'true' в конце.
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
    if (this.isPainting && store.get().paintToolColor !== -1) {
      this.sprayLoop = requestAnimationFrame(emit);
    }
  }

  createSprayParticle(mouseX, mouseY, colorIndex) {
    // Интеграция с Three.js частицами
  }

  updateBeadCounter(current, max) {
    if (this.elements.beadCount)
      this.elements.beadCount.textContent = `${current}/${max}`;
  }

  updateFanProgress(level) {
    if (this.elements.btnFans)
      this.elements.btnFans.style.setProperty("--prog", level * 100 + "%");
  }

  resetUIState(lettersEnabled) {
    this.elements.btnLetters.classList.toggle("active-state", lettersEnabled);
    this.updateFanProgress(0);
  }

  lockLetters(isLocked) {
    const wrapper = this.elements.btnLetters.closest(".combo-wrapper");
    if (wrapper) wrapper.classList.toggle("locked", isLocked);
    if (isLocked) this.elements.btnLetters.classList.remove("active-state");

    if (this.elements.wordInput) {
      this.elements.wordInput.disabled = isLocked;
      this.elements.wordInput.style.opacity = isLocked ? "0.3" : "1";
      this.elements.wordInput.style.pointerEvents = isLocked ? "none" : "auto";
    }
  }

  setLettersActive(isActive) {
    this.elements.btnLetters.classList.toggle("active-state", isActive);
  }

  triggerApplyWord() {
    let newWord = this.elements.wordInput.value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (newWord.length === 0) newWord = "GOOGLE";
    if (newWord.length > 8) newWord = newWord.substring(0, 8);
    this.elements.wordInput.value = newWord;
    if (this.cb && this.cb.onApplyWord) this.cb.onApplyWord(newWord);
  }

  closePalette() {
    document
      .querySelectorAll(".palette-container")
      .forEach((p) => p.classList.remove("open"));
    this.elements.btnMag.classList.remove("is-selecting");
    this.elements.btnPaint.classList.remove("is-selecting");
    this.activePaletteTarget = null;
  }

  openPalette(target) {
    this.closePalette();
    this.activePaletteTarget = target;
    const palette = document.querySelector(`.${target}-palette`);
    if (palette) palette.classList.add("open");
    this.elements.btnMag.classList.toggle("is-selecting", target === "mag");
    this.elements.btnPaint.classList.toggle("is-selecting", target === "paint");
  }

  initBindings() {
    window.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener("mousedown", (e) => {
      if (
        e.target.closest("#holo-wrapper") ||
        e.target.closest("#hud-controls") ||
        e.target.closest("#loader-doors")
      )
        return;
      if (e.button === 0) {
        this.isPainting = true;
        this.startSprayEffect();
      }
    });

    window.addEventListener("mouseup", () => (this.isPainting = false));

    window.addEventListener("contextmenu", (e) => {
      if (store.get().currentTool !== -1 || store.get().paintToolColor !== -1) {
        e.preventDefault();
        store.update({ currentTool: -1, paintToolColor: -1 });
      }
    });

    document.addEventListener("click", (e) => {
      const btnOrLink = e.target.closest(
        "button, .hud-btn, .icon-btn, .holo-btn, .mode-btn, .mag-main-btn, .palette-color-btn",
      );
      if (btnOrLink) btnOrLink.blur();

      if (this.activePaletteTarget && !e.target.closest(".equipment-rack")) {
        this.closePalette();
      }

      const target = e.target.closest("[data-action]");
      if (!target) return;

      e.preventDefault();
      const action = target.dataset.action;

      switch (action) {
        case "applyWord":
          this.triggerApplyWord();
          break;
        case "setModeLab":
          store.update({ mode: "lab" });
          break;
        case "setModeDisco":
          store.update({ mode: "disco" });
          break;
        case "toggleLetters":
          const isEnabled =
            this.cb && this.cb.onToggleLetters
              ? this.cb.onToggleLetters()
              : false;
          this.elements.btnLetters.classList.toggle("active-state", isEnabled);
          break;
        case "returnLetters":
          if (this.cb && this.cb.onReturnLetters) this.cb.onReturnLetters();
          break;
        case "spawnBalls":
          if (this.cb && this.cb.onSpawnBalls) this.cb.onSpawnBalls();
          break;
        case "clearBalls":
          if (this.cb && this.cb.onShrinkBalls) this.cb.onShrinkBalls();
          break;
        case "toggleSlowMo":
          store.update({ isSlowMo: !store.get().isSlowMo });
          break;
        case "toggleFans":
          if (this.cb && this.cb.onToggleFans) this.cb.onToggleFans();
          break;
        case "togglePaletteMag":
          this.activePaletteTarget === "mag"
            ? this.closePalette()
            : this.openPalette("mag");
          break;
        case "togglePalettePaint":
          this.activePaletteTarget === "paint"
            ? this.closePalette()
            : this.openPalette("paint");
          break;
        case "selectPaletteColor":
          const colorVal = parseInt(target.dataset.color);
          if (this.activePaletteTarget === "mag") {
            store.update({ paintToolColor: -1, currentTool: colorVal });
          } else {
            store.update({ currentTool: -1, paintToolColor: colorVal });
          }
          this.closePalette();
          break;
      }
    });

    this.elements.wordInput.addEventListener("focus", (e) => {
      e.target.value = "";
    });
    this.elements.wordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.triggerApplyWord();
        this.elements.wordInput.blur();
      }
    });

    document.getElementById("terminal-handle").addEventListener("click", () => {
      const wrapper = document.getElementById("holo-wrapper");
      wrapper.classList.toggle("open");
      if (!wrapper.classList.contains("open")) this.closePalette();
    });

    document
      .getElementById("holo-wrapper")
      .addEventListener("mouseleave", () => this.closePalette());

    window.addEventListener("keydown", (e) => {
      if (document.activeElement === this.elements.wordInput) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (this.cb && this.cb.onTogglePause) this.cb.onTogglePause();
          break;
        case "KeyR":
          if (this.cb && this.cb.onReset) this.cb.onReset();
          break;
        case "KeyH":
          document.body.classList.toggle("ui-hidden");
          this.closePalette();
          break;
      }
    });
  }

  initStoreSubscriptions() {
    store.subscribe((state) => {
      document
        .getElementById("mode-lab")
        .classList.toggle("active", state.mode === "lab");
      document
        .getElementById("mode-disco")
        .classList.toggle("active", state.mode === "disco");
      this.elements.btnSlow.classList.toggle("active-state", state.isSlowMo);

      const magMainBtn = this.elements.btnMag;
      magMainBtn.className = "mag-main-btn";
      document.body.className = document.body.className
        .replace(/tool-mag-\d/g, "")
        .trim();

      if (state.currentTool !== -1) {
        document.body.classList.add(`tool-mag-${state.currentTool}`);
        magMainBtn.classList.add(`color-theme-${state.currentTool}`);
      }

      const paintBtn = this.elements.btnPaint;
      paintBtn.className = "mag-main-btn paint-btn";
      document.body.className = document.body.className
        .replace(/tool-paint-\d/g, "")
        .trim();

      if (state.paintToolColor !== -1) {
        document.body.classList.add(`tool-paint-${state.paintToolColor}`);
        paintBtn.classList.add(`color-theme-${state.paintToolColor}`);
      }

      if (this.elements.toolHint) {
        this.elements.toolHint.classList.toggle(
          "visible",
          state.currentTool !== -1 || state.paintToolColor !== -1,
        );
      }
    });
  }
}
