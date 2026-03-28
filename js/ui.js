import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.isMenuLocked = false;
    this.activePaletteTarget = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.isPainting = false;
    this.sprayLoop = null;
    this.blockHoverSound = false;
    this.animTimers = {
      enter1: null,
      enter2: null,
      exit: null,
    };

    // Кэшируем ВСЕ нужные элементы один раз
    this.elements = {
      btnLetters: document.getElementById("btn-letters"),
      btnBalls: document.getElementById("btn-balls"),
      btnFans: document.getElementById("btn-fans"),
      btnSlow: document.getElementById("btn-slow"),
      wordInput: document.getElementById("word-input"),
      beadCount: document.getElementById("bead-count"),
      btnMag: document.getElementById("btn-mag-main"),
      btnPaint: document.getElementById("btn-paint-main"),
      toolHint: document.getElementById("tool-hint"),
      btnRestart: document.getElementById("btn-restart-level"),

      startMenu: document.getElementById("futuristic-start-menu"),
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

      confirmModal: document.getElementById("confirm-modal"),
      btnConfirmYes: document.getElementById("btn-confirm-yes"),
      btnConfirmNo: document.getElementById("btn-confirm-no"),
    };

    this.initBindings();
    this.initMenuSounds();
    this.initStoreSubscriptions();
    this.initStartMenu();
  }

  clearAnimTimers() {
    if (this.animTimers.enter1) clearTimeout(this.animTimers.enter1);
    if (this.animTimers.enter2) clearTimeout(this.animTimers.enter2);
    if (this.animTimers.exit) clearTimeout(this.animTimers.exit);
    if (this.animTimers.light) clearTimeout(this.animTimers.light);
  }

  updateLanguage(lang) {
    const t = translations[lang];
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
    ["pointerdown", "mousedown", "wheel", "touchstart", "contextmenu"].forEach(
      (evt) => {
        el.doors.addEventListener(evt, (e) => {
          if (!el.doors.classList.contains("loaded")) {
            e.stopPropagation(); // Убиваем всплытие события!
          }
        });
      },
    );

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

    setupSlider(el.sliderSfx, el.valSfx, "setSfxVolume", 2.0);
    setupSlider(el.sliderMusic, el.valMusic, "setMusicVolume", 1.5);

    // 4. Безопасный вход в игру
    const enterGame = () => {
      this.isMenuLocked = true;
      this.clearAnimTimers();

      if (audioManager && audioManager.resumeContext) {
        audioManager.resumeContext();
      }

      const htmlElem = document.documentElement;
      if (htmlElem.requestFullscreen && !document.fullscreenElement) {
        htmlElem.requestFullscreen();
      }

      if (el.startMenu) el.startMenu.classList.add("game-started");

      if (el.centerHub && el.doors) {
        el.centerHub.classList.remove("fade-in-volumetric", "hub-hidden");

        this.animTimers.enter1 = setTimeout(() => {
          el.centerHub.classList.add("fade-out-fast");

          this.animTimers.enter2 = setTimeout(() => {
            if (audioManager && audioManager.fadeIn) audioManager.fadeIn(1.0);

            el.doors.classList.add("loaded"); // Двери начали разъезжаться
            document.body.classList.remove("loading");

            // Свет плавно загорается
            this.animTimers.light = setTimeout(() => {
              document.body.classList.add("lights-on");
            }, 400);

            // ==========================================
            // МАГИЯ АЙСА: Таймер выезда робота на экран
            // ==========================================
            this.animTimers.aice = setTimeout(() => {
              this.showAiceDialogue();
            }, 2800);
          }, 600);
        }, 500);
      }
    };

    const executeNewGame = () => {
      if (this.cb && this.cb.onReset) this.cb.onReset();
      if (store && typeof store.update === "function") {
        store.update({ mode: "lab" });
      }
      enterGame();
    }; // Слушатель главной кнопки NEW GAME

    if (el.btnStart) {
      el.btnStart.addEventListener("click", () => {
        // Проверяем: если кнопка RESUME отображается, значит прогресс уже есть
        if (el.btnResume && el.btnResume.style.display === "flex") {
          // Показываем окно подтверждения
          el.confirmModal.classList.remove("hidden");
          if (audioManager && audioManager.playUI) audioManager.playUI("click");
        } else {
          // Это первый запуск, модалка не нужна
          executeNewGame();
        }
      });
    } // Обработчик кнопки "YES" в модалке

    if (el.btnConfirmYes) {
      el.btnConfirmYes.addEventListener("click", () => {
        el.confirmModal.classList.add("hidden");
        executeNewGame();
      });
    } // Обработчик кнопки "CANCEL" в модалке

    if (el.btnConfirmNo) {
      el.btnConfirmNo.addEventListener("click", () => {
        el.confirmModal.classList.add("hidden");
        if (audioManager && audioManager.playUI) audioManager.playUI("click");
      });
    }

    if (el.btnResume) el.btnResume.addEventListener("click", enterGame);

    // 5. Безопасный выход в меню
    const returnToMainMenu = () => {
      this.isMenuLocked = false;
      this.clearAnimTimers();
      document.body.classList.add("loading");
      document.body.classList.remove("lights-on");

      // === ПРЯЧЕМ И ГЛУШИМ АЙСА ===
      const aicePanel = document.getElementById("aice-dialogue-container");
      if (aicePanel) {
        aicePanel.classList.add("hidden"); // Снова прячем Айса!
      }

      // Отменяем таймер появления (чтобы не выскочил за закрытой дверью)
      if (this.animTimers && this.animTimers.aice) {
        clearTimeout(this.animTimers.aice);
      }

      // Останавливаем набор текста, если игрок вышел прямо посреди диалога
      if (this.typewriterTimer) {
        clearInterval(this.typewriterTimer);
      }
      // ============================

      if (audioManager && audioManager.fadeOut) audioManager.fadeOut(1.4);
      if (audioManager && audioManager.fadeOut) audioManager.fadeOut(1.4);
      if (el.doors) el.doors.classList.remove("loaded"); // Двери поехали закрываться
      // Сброс центрального хаба
      if (el.centerHub) {
        el.centerHub.classList.remove("fade-out-fast", "fade-in-volumetric");
        el.centerHub.classList.add("hub-hidden");

        // 1400мс — это время закрытия дверей из твоего CSS (transition: 1.4s)
        this.animTimers.exit = setTimeout(() => {
          el.centerHub.classList.remove("hub-hidden");
          el.centerHub.classList.add("fade-in-volumetric");
        }, 1400);
      }

      // Возврат интерфейса
      if (el.startMenu) {
        el.startMenu.classList.remove("game-started");
        if (el.viewMain && el.viewSettings) {
          el.viewSettings.classList.remove("active");
          el.viewMain.classList.add("active");
        }
      }

      if (el.btnResume) el.btnResume.style.display = "flex";
      if (el.btnStart) el.btnStart.classList.remove("pulse-glow-volumetric");
    };

    // Слушатель клика по кнопке "MENU" в игре
    if (el.btnInGameMenu) {
      el.btnInGameMenu.addEventListener("click", () => {
        returnToMainMenu(); // Отрабатываем логику интерфейса

        // Если мы в полном экране — выходим из него
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      });
    }

    // Слушатель браузерного события (если игрок нажал ESC на клавиатуре)
    document.addEventListener("fullscreenchange", () => {
      // Проверяем: если фуллскрин закрылся, А двери всё еще открыты (игра идет)
      if (
        !document.fullscreenElement &&
        el.doors &&
        el.doors.classList.contains("loaded")
      ) {
        returnToMainMenu();
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
      "#futuristic-start-menu .sk-btn, #futuristic-start-menu .holo-back-tab, #futuristic-start-menu .exit-btn",
    );

    menuButtons.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        if (this.isMenuLocked) return; // Защита от звуков при открывающихся дверях
        if (!this.blockHoverSound && audioManager && audioManager.playUI) {
          audioManager.playUI("mouse_menu");
        }
      });
    });

    window.addEventListener(
      "mousedown",
      (e) => {
        // Исправленная архитектура: Блокируем звуки ТОЛЬКО для стартового меню во время анимации
        if (this.isMenuLocked && e.target.closest("#futuristic-start-menu"))
          return;

        if (
          !e.target.closest(
            "#futuristic-start-menu, #btn-in-game-menu, .lang-options",
          )
        )
          return;

        // Звук старта (Новая игра, Продолжить, Выход в меню)
        const startBtn = e.target.closest(
          "#btn-start-game, #btn-resume-game, #btn-in-game-menu",
        );
        if (startBtn) {
          if (audioManager && audioManager.playUI) audioManager.playUI("start");
          return;
        }

        // Звук обычного клика (Настройки, Назад, Языки, Выход)
        const menuBtn = e.target.closest(
          ".sk-btn, .holo-back-tab, .exit-btn, .lang-btn",
        );
        if (menuBtn) {
          if (audioManager && audioManager.playUI) audioManager.playUI("click");
        }
      },
      true,
    );
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
    // Чистая архитектура: UI не лезет в движок, а только передает данные.
    // Если в main.js передали функцию onSpray, мы отправляем ей координаты.
    if (this.cb && typeof this.cb.onSpray === "function") {
      this.cb.onSpray(mouseX, mouseY, colorIndex);
    }
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

  // ==========================================
  // 1. ОБНОВЛЕННЫЙ ВЫЗОВ АЙСА
  // ==========================================
  showAiceDialogue(
    textToShow = "Привет! Связь установлена. Готов к выполнению задач.",
  ) {
    // <--- МЕНЯЕМ ТЕКСТ
    const aicePanel = document.getElementById("aice-dialogue-container");
    const textElement = document.getElementById("aice-dialogue-text");

    if (aicePanel && textElement) {
      aicePanel.classList.remove("hidden");

      if (typeof audioManager !== "undefined" && audioManager.playUI) {
        audioManager.playUI("pop");
      }

      textElement.innerHTML = "";

      setTimeout(() => {
        // Ставим экстремальную скорость 500!
        this.typeText(textElement, textToShow, 50);
      }, 600);
    }
  }

  // ==========================================
  // 2. ДВИЖОК "ПЕЧАТНОЙ МАШИНКИ"
  // ==========================================
  typeText(element, text, speed = 30) {
    return new Promise((resolve) => {
      element.innerHTML = "";
      let i = 0;

      // Если текст уже печатался (игрок кликнул дважды), останавливаем старый таймер
      if (this.typewriterTimer) clearInterval(this.typewriterTimer);

      this.typewriterTimer = setInterval(() => {
        if (i < text.length) {
          // Добавляем по одной букве
          element.innerHTML += text.charAt(i);

          // Опционально: можно добавить тихий звук клика на каждую 3-ю букву
          // if (i % 3 === 0 && text.charAt(i) !== ' ' && audioManager && audioManager.playUI) {
          //   audioManager.playUI("click");
          // }

          i++;
        } else {
          // Текст закончился!
          clearInterval(this.typewriterTimer);
          resolve(); // Сообщаем игре, что печать завершена
        }
      }, speed);
    });
  }

  initBindings() {
    // Отслеживание мыши
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

    // 1. Оставляем глобальное закрытие палитры и снятие фокуса (blur)
    document.addEventListener("click", (e) => {
      const btnOrLink = e.target.closest(
        "button, .hud-btn, .icon-btn, .holo-btn, .mode-btn, .mag-main-btn, .palette-color-btn",
      );
      if (btnOrLink) btnOrLink.blur();

      if (this.activePaletteTarget && !e.target.closest(".equipment-rack")) {
        this.closePalette();
      }
    });

    // 2. Функция-помощник для чистой привязки действий
    const bindAction = (selector, handler) => {
      const el = document.querySelector(selector);
      if (el) {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          handler();
        });
      }
    };

    // 3. Явные привязки (теперь код читается легко и работает быстрее)
    bindAction('[data-action="applyWord"]', () => this.triggerApplyWord());
    bindAction('[data-action="setModeLab"]', () =>
      store.update({ mode: "lab" }),
    );
    bindAction('[data-action="setModeDisco"]', () =>
      store.update({ mode: "disco" }),
    );
    bindAction('[data-action="toggleSlowMo"]', () =>
      store.update({ isSlowMo: !store.get().isSlowMo }),
    );

    bindAction('[data-action="toggleLetters"]', () => {
      const isEnabled = this.cb?.onToggleLetters
        ? this.cb.onToggleLetters()
        : false;
      this.elements.btnLetters.classList.toggle("active-state", isEnabled);
    });

    bindAction('[data-action="returnLetters"]', () =>
      this.cb?.onReturnLetters?.(),
    );
    bindAction('[data-action="spawnBalls"]', () => this.cb?.onSpawnBalls?.());
    bindAction('[data-action="clearBalls"]', () => this.cb?.onShrinkBalls?.());
    bindAction('[data-action="toggleFans"]', () => this.cb?.onToggleFans?.());

    bindAction('[data-action="togglePaletteMag"]', () =>
      this.activePaletteTarget === "mag"
        ? this.closePalette()
        : this.openPalette("mag"),
    );
    bindAction('[data-action="togglePalettePaint"]', () =>
      this.activePaletteTarget === "paint"
        ? this.closePalette()
        : this.openPalette("paint"),
    );

    // Логика кнопки RESTART (Сброс сцены уровня)
    if (this.elements.btnRestart) {
      this.elements.btnRestart.addEventListener("click", () => {
        if (this.cb && this.cb.onReset) {
          this.cb.onReset(); // Дергаем функцию сброса физики и краски
        }
        if (audioManager && audioManager.playUI) {
          audioManager.playUI("click");
        }
      });
    }

    // Палитры (оставляем делегирование, но только внутри палитры, а не на весь document)
    document.querySelectorAll(".palette-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        const target = e.target.closest(".palette-item");
        if (!target || !target.dataset.color) return;

        const colorVal = parseInt(target.dataset.color);
        if (this.activePaletteTarget === "mag") {
          store.update({ paintToolColor: -1, currentTool: colorVal });
        } else {
          store.update({ currentTool: -1, paintToolColor: colorVal });
        }
        this.closePalette();
      });
    });

    // Логика поля ввода
    this.elements.wordInput.addEventListener("focus", (e) => {
      e.target.value = "";
    });
    this.elements.wordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.triggerApplyWord();
        this.elements.wordInput.blur();
      }
    });

    // Логика открытия боковой панели
    document.getElementById("terminal-handle").addEventListener("click", () => {
      const wrapper = document.getElementById("holo-wrapper");
      wrapper.classList.toggle("open");
      if (!wrapper.classList.contains("open")) this.closePalette();
    });

    document
      .getElementById("holo-wrapper")
      .addEventListener("mouseleave", () => this.closePalette());

    // Горячие клавиши
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
