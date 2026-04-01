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

    // Централизованное хранилище всех таймеров для чистой отмены
    this.animTimers = {
      enter1: null,
      enter2: null,
      exit: null,
      scratch: null,
      biosSequence: null,
      biosType: null,
      typewriter: null,
    };

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
      hudControls: document.getElementById("hud-controls"),
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
      aicePortrait: document.querySelector(".aice-portrait-wrap"),
      biosContinueBtn: document.getElementById("bios-continue"),
      btnConfirmYes: document.getElementById("btn-confirm-yes"),
      btnConfirmNo: document.getElementById("btn-confirm-no"),
    };

    this.currentLang = "RU";
    this.isTyping = false;
    this.currentFullText = "";

    this.initBindings();
    this.initMenuSounds();
    this.initStoreSubscriptions();
    this.initStartMenu();
  }

  clearAnimTimers() {
    Object.values(this.animTimers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    if (this.animTimers.typewriter) clearInterval(this.animTimers.typewriter);
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
        if (audioManager?.resumeContext) audioManager.resumeContext();
      },
      { once: true },
    );

    let currentLang = "RU";
    const el = this.elements;

    ["pointerdown", "mousedown", "wheel", "touchstart", "contextmenu"].forEach(
      (evt) => {
        el.doors.addEventListener(evt, (e) => {
          if (!el.doors.classList.contains("loaded")) {
            e.stopPropagation();
          }
        });
      },
    );

   // 1. Язык
    if (el.btnLang) {
      el.btnLang.addEventListener("click", (e) => {
        const clickedLangBtn = e.target.closest(".lang-btn");
        
        // ФИКС: Выбираем язык ТОЛЬКО если кликнули по кнопке И меню уже открыто
        if (clickedLangBtn && el.btnLang.classList.contains("open")) {
          currentLang = clickedLangBtn.dataset.lang;
          this.updateLanguage(currentLang);

          document.querySelectorAll(".lang-btn").forEach((b) => b.classList.remove("active-lang"));
          clickedLangBtn.classList.add("active-lang");

          el.btnLang.classList.remove("open");
          e.stopPropagation();
        } else {
          // Если меню закрыто (даже если случайно попали по невидимой кнопке) — открываем!
          el.btnLang.classList.toggle("open");
        }
      });
    }
    this.updateLanguage(currentLang);

    const toggleView = (hideView, showView) => {
      this.blockHoverSound = true;
      setTimeout(() => (this.blockHoverSound = false), 500);
      hideView.classList.remove("active");
      showView.classList.add("active");
    };

    if (el.btnOpenSettings)
      el.btnOpenSettings.addEventListener("click", () =>
        toggleView(el.viewMain, el.viewSettings),
      );
    if (el.btnBackMain) {
      el.btnBackMain.addEventListener("click", () => {
        toggleView(el.viewSettings, el.viewMain);
        if (el.btnLang) el.btnLang.classList.remove("open");
      });
    }

    const setupSlider = (slider, valDisplay, funcName, multiplier) => {
      if (!slider) return;
      slider.addEventListener("input", (e) => {
        if (audioManager?.resumeContext) audioManager.resumeContext();
        const value = e.target.value;
        valDisplay.textContent = `${value}%`;
        const volumeFloat = Math.pow(value / 100, 2) * multiplier;
        if (audioManager && typeof audioManager[funcName] === "function") {
          audioManager[funcName](volumeFloat);
        }
      });
    };

    setupSlider(el.sliderSfx, el.valSfx, "setSfxVolume", 2.0);
    setupSlider(el.sliderMusic, el.valMusic, "setMusicVolume", 1.5);

    // --- НОВАЯ ФИЧА: Тестовый звук при отпускании ползунка SFX ---
    if (el.sliderSfx) {
      el.sliderSfx.addEventListener("change", () => {
        // Как только игрок отпустил ползунок, проигрываем стандартный клик,
        // он уже проиграется с новой установленной громкостью!
        if (typeof audioManager !== "undefined" && audioManager.playUI) {
          audioManager.playUI("click");
        }
      });
    }
    // -------------------------------------------------------------

    const enterGame = () => {
      this.isMenuLocked = true;
      this.clearAnimTimers();

      if (audioManager?.resumeContext) audioManager.resumeContext();

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
            if (audioManager?.fadeIn) audioManager.fadeIn(1.0);

            el.doors.classList.add("loaded");
            document.body.classList.remove("loading");

// ПРОВЕРКА: Если мы нажали Resume
            if (document.body.classList.contains("lights-on")) {
              el.hudControls.classList.remove("hud-hidden");
              this.animTimers.aice = setTimeout(() => {
                // Эту фразу мы ОСТАВЛЯЕМ! Она звучит, если игрок вернулся из меню
                this.showAiceDialogue("С возвращением. Системы в режиме ожидания.");
              }, 1500);
            } else {
              
              // === НАЧАЛО: ВРЕМЕННЫЙ СКИП БИОСА ДЛЯ ТЕСТОВ ===
              
              /* ОРИГИНАЛЬНЫЙ КОД БИОСА (ЗАКОММЕНТИРОВАН, ЧТОБЫ НЕ ПОТЕРЯТЬ)
              this.runBiosSequence(() => {
                this.animTimers.aice = setTimeout(() => {
                  this.showAiceDialogue("Привет! Связь установлена. Системы лаборатории функционируют в штатном режиме.");
                }, 3000);
              });
              */

              // БЫСТРЫЙ ЗАПУСК: Мгновенно моргаем светом, показываем HUD
              if (this.cb && this.cb.onFlickerLights) this.cb.onFlickerLights();
              el.hudControls.classList.remove("hud-hidden");
              
              this.animTimers.aice = setTimeout(() => { 
                
                // === НАША НОВАЯ КАТСЦЕНА ЗНАКОМСТВА ===
                const phrases = translations[this.currentLang].introDialog;
                
                this.runDialogueSequence(phrases, () => {
                  // Этот блок сработает ТОЛЬКО после того, как игрок прокликает все 4 фразы!
                  console.log("Диалог закончен! Айс готов лететь в центр.");
                  // Позже мы добавим сюда анимацию и форму регистрации
                });
                // ======================================

              }, 800); // 800мс ожидания вместо долгих таймеров BIOS
              
              // === КОНЕЦ: ВРЕМЕННЫЙ СКИП ===

            }
          }, 600);
        }, 500);
      }
    };

    const executeNewGame = () => {
      document.body.classList.remove("lights-on");
      if (this.cb?.onForceLightsOff) this.cb.onForceLightsOff();
      if (this.cb?.onReset) this.cb.onReset();

      if (this.elements.wordInput) this.elements.wordInput.value = "GOOGLE";
      if (this.cb?.onApplyWord) this.cb.onApplyWord("GOOGLE");

      if (store?.update) store.update({ mode: "lab" });
      enterGame();
    };

    if (el.btnStart) {
      el.btnStart.addEventListener("click", () => executeNewGame());
    }

    if (el.btnConfirmYes) {
      el.btnConfirmYes.addEventListener("click", () => {
        el.confirmModal.classList.add("hidden");
        executeNewGame();
      });
    }

    if (el.btnConfirmNo) {
      el.btnConfirmNo.addEventListener("click", () => {
        el.confirmModal.classList.add("hidden");
        if (audioManager?.playUI) audioManager.playUI("click");
      });
    }

    if (el.btnResume) el.btnResume.addEventListener("click", enterGame);

    const returnToMainMenu = () => {
      this.isMenuLocked = false;
      this.clearAnimTimers();
      document.body.classList.add("loading");
      if (el.hudControls) el.hudControls.classList.add("hud-hidden");

      const aicePanel = document.getElementById("aice-dialogue-container");
      if (aicePanel) aicePanel.classList.add("hidden");

      if (audioManager?.fadeOut) audioManager.fadeOut(1.4);
      if (el.doors) el.doors.classList.remove("loaded");

      if (el.centerHub) {
        el.centerHub.classList.remove("fade-out-fast", "fade-in-volumetric");
        el.centerHub.classList.add("hub-hidden");
        this.animTimers.exit = setTimeout(() => {
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
    };

    if (el.btnInGameMenu) {
      el.btnInGameMenu.addEventListener("click", () => {
        returnToMainMenu();
        if (document.fullscreenElement) document.exitFullscreen();
      });
    }

    document.addEventListener("fullscreenchange", () => {
      if (
        !document.fullscreenElement &&
        el.doors?.classList.contains("loaded")
      ) {
        returnToMainMenu();
      }
    });

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
        if (this.isMenuLocked) return;
        if (!this.blockHoverSound && audioManager?.playUI) {
          audioManager.playUI("mouse_menu");
        }
      });
    });

    window.addEventListener(
      "mousedown",
      (e) => {
        if (this.isMenuLocked && e.target.closest("#futuristic-start-menu"))
          return;
        if (
          !e.target.closest(
            "#futuristic-start-menu, #btn-in-game-menu, .lang-options",
          )
        )
          return;

        if (
          e.target.closest(
            "#btn-start-game, #btn-resume-game, #btn-in-game-menu",
          )
        ) {
          if (audioManager?.playUI) audioManager.playUI("start");
          return;
        }

        if (e.target.closest(".sk-btn, .holo-back-tab, .exit-btn, .lang-btn")) {
          if (audioManager?.playUI) audioManager.playUI("click");
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
    if (this.cb?.onApplyWord) this.cb.onApplyWord(newWord);
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

  showAiceDialogue(
    textToShow = "Привет! Связь установлена. Готов к выполнению задач.",
  ) {
    // ЩИТ ОТ БАГА: Если игрок уже нажал "Меню" и вышел из игры,
    // отменяем появление Айса и блокируем звук!
    if (!this.isMenuLocked) return;

    const aicePanel = document.getElementById("aice-dialogue-container");
    const textElement = document.getElementById("aice-dialogue-text");

    if (aicePanel && textElement) {
      aicePanel.classList.remove("hidden");
      if (audioManager?.playUI) audioManager.playUI("pop");
      textElement.innerHTML = "";
      setTimeout(() => {
        this.typeText(textElement, textToShow, 50);
      }, 600);
    }
  }

  unlockFeature(featureId) {
    const el = document.getElementById(featureId);
    if (el && el.classList.contains("locked-feature")) {
      el.classList.remove("locked-feature");
      el.classList.add("feature-reveal");
      if (audioManager?.playUI) audioManager.playUI("click");
    }
  }

// --- УМНАЯ ПЕЧАТНАЯ МАШИНКА ДЛЯ ДИАЛОГОВ АЙСА ---
  typeText(element, text, speed = 30) {
    this.currentAiceFullText = text;
    this.isAiceTyping = true;
    
    return new Promise((resolve) => {
      this._currentAiceResolve = resolve;
      element.innerHTML = "";
      let i = 0;
      
      if (this.animTimers.typewriter) clearInterval(this.animTimers.typewriter);

      this.animTimers.typewriter = setInterval(() => {
        if (i < text.length) {
          element.innerHTML += text.charAt(i);
          i++;
        } else {
          this.isAiceTyping = false;
          clearInterval(this.animTimers.typewriter);
          if (this._currentAiceResolve) {
            this._currentAiceResolve();
            this._currentAiceResolve = null;
          }
        }
      }, speed);
    });
  }

  finishAiceTyping(element) {
    if (this.animTimers.typewriter) clearInterval(this.animTimers.typewriter);
    this.isAiceTyping = false;
    element.innerHTML = this.currentAiceFullText;
    if (this._currentAiceResolve) {
      this._currentAiceResolve();
      this._currentAiceResolve = null;
    }
  }

 // --- МЕНЕДЖЕР ДИАЛОГОВЫХ СЕКВЕНЦИЙ ---
 // --- МЕНЕДЖЕР ДИАЛОГОВЫХ СЕКВЕНЦИЙ ---
  async runDialogueSequence(phrasesArray, onCompleteCallback) {
    const aicePanel = document.getElementById("aice-dialogue-container");
    const textElement = aicePanel ? aicePanel.querySelector(".aice-dialogue-text") : null;

    if (!aicePanel || !textElement) return;

    // 1. ОТКРЫВАЕМ ОКНО ОДИН РАЗ
    aicePanel.classList.remove("hidden");
    for (let i = 0; i < phrasesArray.length; i++) {
      if (!this.isMenuLocked) {
        aicePanel.classList.add("hidden");
        return; 
      }

      // ВНИМАНИЕ: Отсюда мы строку audioManager.playUI("pop"); УДАЛИЛИ!

      // 2. Печатаем текст
      this.typeText(textElement, phrasesArray[i], 35);

      // 3. Ждем клика от игрока
      await new Promise(resolve => {
        const handleInteraction = (e) => {
          if (e) e.stopPropagation();
          if (e.type === "mousedown" && e.button !== 0) return;

          if (this.isAiceTyping) {
            this.finishAiceTyping(textElement); 
          } else {
            cleanup();
            resolve();
          }
        };

        const cleanup = () => {
          aicePanel.removeEventListener("mousedown", handleInteraction);
        };

        aicePanel.addEventListener("mousedown", handleInteraction);
      });
    }

    if (onCompleteCallback) onCompleteCallback();
  }

  async runBiosSequence(onCompleteCallback) {
    const container = document.getElementById("aice-dialogue-container");
    const textEl = document.getElementById("aice-dialogue-text");
    const btn = this.elements.biosContinueBtn;

    container.classList.add("bios-mode");
    container.style.display = "none";
    textEl.innerHTML = "";
    if (btn) btn.classList.add("hidden");

    await new Promise((res) => setTimeout(res, 1900));

    container.style.display = "flex";
    container.classList.remove("hidden");

  // --- АРХИТЕКТУРНЫЙ ФИКС: Динамическая подгрузка языка из i18n ---
    const currentDict = translations[this.currentLang];
    
    // Берем фразы нужного языка и перемешиваем
    let shuffled = [...currentDict.biosPhrases].sort(() => 0.5 - Math.random());
    let selectedPhrases = shuffled.slice(0, 3);
    
    // Добавляем финальную фразу нужного языка
    selectedPhrases.push(currentDict.biosFinal);

    for (let i = 0; i < selectedPhrases.length; i++) {
      if (!this.isMenuLocked) {
        container.classList.add("hidden");
        return;
      }

      const isLast = i === selectedPhrases.length - 1;
      if (btn) btn.classList.add("hidden");

      // --- ДОБАВЛЯЕМ ПРЕФИКС ---
      const hackerPrefix = "SYSTEM //:"; // Можешь написать тут "SYSTEM //: " или "C:\AICE> "
      const fullText = hackerPrefix + selectedPhrases[i];

      const typingPromise = this.typeBiosText(textEl, fullText);

      await new Promise((resolve) => {
        const handleInteraction = (e) => {
          if (e) e.stopPropagation();

          if (isLast) return;

          if (this.isTyping) {
            this.finishTyping(textEl, isLast);
          } else {
            // УДАЛИ ИЛИ ЗАКОММЕНТИРУЙ ЭТУ СТРОЧКУ НИЖЕ:
            // if (audioManager?.playUI) audioManager.playUI("click");

            cleanup();
            resolve();
          }
        };

        const cleanup = () => {
          container.removeEventListener("mousedown", handleInteraction);
        };

        container.addEventListener("mousedown", handleInteraction);

        typingPromise.then(() => {
          if (isLast) {
            // Для последней фразы кнопка остается спрятанной, просто ждем 1.5 сек
            if (btn) btn.classList.add("hidden");
            cleanup();
            setTimeout(resolve, 1500);
          } else {
            // А вот для обычных фраз, когда текст напечатался — показываем [Продолжить]
            if (btn) btn.classList.remove("hidden");
          }
        });
      });
    }

    if (this.isMenuLocked) {
      container.classList.add("hidden");

      setTimeout(() => {
        container.style.display = "";
        container.classList.remove("bios-mode");
        this.elements.hudControls.classList.remove("hud-hidden");
        if (this.cb?.onFlickerLights) this.cb.onFlickerLights();
        if (onCompleteCallback) onCompleteCallback();
      }, 500);
    }
  }

  typeBiosText(element, text) {
    this.currentFullText = text;
    this.isTyping = true;
    const cursor = '<span class="bios-cursor"></span>';

    return new Promise((resolve) => {
      this._currentBiosResolve = resolve;

      if (this.animTimers.biosType) clearTimeout(this.animTimers.biosType);
      element.innerHTML = cursor;
      let i = 0;

      const typeChar = () => {
        if (i < text.length) {
          // --- НОВЫЙ БЛОК: ОЗВУЧКА СИНТЕЗАТОРОМ ---
          // Проверяем, что текущий символ — не пробел.
          // Это избавляет от монотонного гула и делает звук механическим.
          if (
            text.charAt(i) !== " " &&
            typeof audioManager !== "undefined" &&
            audioManager.playBiosBeep
          ) {
            audioManager.playBiosBeep();
          }
          // ----------------------------------------

          element.innerHTML = text.substring(0, i + 1) + cursor;
          i++;

          // ЗАМЕДЛЕНИЕ СКОРОСТИ
          let delay = Math.random() * 40 + 30;
          // Пауза на точках стала дольше для реализма
          if (text.charAt(i - 1) === ".") delay += 250;

          this.animTimers.biosType = setTimeout(typeChar, delay);
        } else {
          this.isTyping = false;
          if (this._currentBiosResolve) {
            this._currentBiosResolve();
            this._currentBiosResolve = null;
          }
        }
      };
      typeChar();
    });
  }

  finishTyping(element, isLast) {
    if (this.animTimers.biosType) clearTimeout(this.animTimers.biosType);
    this.isTyping = false;
    element.innerHTML =
      this.currentFullText + '<span class="bios-cursor"></span>';

    if (this.elements.biosContinueBtn) {
      if (isLast) {
        this.elements.biosContinueBtn.classList.add("hidden");
      } else {
        this.elements.biosContinueBtn.classList.remove("hidden");
      }
    }

    if (this._currentBiosResolve) {
      this._currentBiosResolve();
      this._currentBiosResolve = null;
    }
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
    });

    const bindAction = (selector, handler) => {
      const el = document.querySelector(selector);
      if (el) {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          handler();
        });
      }
    };

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

    if (this.elements.btnRestart) {
      this.elements.btnRestart.addEventListener("click", () => {
        if (this.cb?.onReset) this.cb.onReset();
        if (audioManager?.playUI) audioManager.playUI("click");
      });
    }

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

    this.elements.wordInput.addEventListener(
      "focus",
      (e) => (e.target.value = ""),
    );
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

    const ice = this.elements.aicePortrait;
    if (ice) {
      ice.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        ice.classList.add("is-smiling");
        if (this.animTimers.scratch) clearTimeout(this.animTimers.scratch);

        this.animTimers.scratch = setTimeout(() => {
          ice.classList.remove("is-smiling");
          this.animTimers.scratch = null;
        }, 1000);
      });
    }

    document
      .getElementById("holo-wrapper")
      .addEventListener("mouseleave", () => this.closePalette());

    window.addEventListener("keydown", (e) => {
      if (document.activeElement === this.elements.wordInput) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (this.cb?.onTogglePause) this.cb.onTogglePause();
          break;
        case "KeyR":
          if (this.cb?.onReset) this.cb.onReset();
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
        magMainBtn.classList.add(`mag-color-${state.currentTool}`);
      }

      const paintBtn = this.elements.btnPaint;
      paintBtn.className = "mag-main-btn paint-btn";
      document.body.className = document.body.className
        .replace(/tool-paint-\d/g, "")
        .trim();

      if (state.paintToolColor !== -1) {
        document.body.classList.add(`tool-paint-${state.paintToolColor}`);
        paintBtn.classList.add(`paint-color-${state.paintToolColor}`);
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
