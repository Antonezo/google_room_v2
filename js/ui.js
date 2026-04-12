import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";
import { MenuManager } from "./ui-menu.js";
import { GameHudManager } from "./ui-hud.js";
import { DialogueSystem } from "./ui-dialogue.js"; // Наш новый модуль!

export class UIManager {
  constructor(callbacks) {
    this.preloadImages([
      "../Image/tablet-2.png",
      "../Image/blinks-eyes-tablet-2.png",
      "../Image/light-tablet-2.png",
    ]);
    this.cb = callbacks;
    this.isMenuLocked = false;
    this.currentLang = "RU";

    // Инициализируем помощников
    this.menuManager = new MenuManager(this);
    this.hudManager = new GameHudManager(this);
    this.dialogueSystem = new DialogueSystem(this); // Подключаем систему диалогов!

    // Централизованное хранилище таймеров только для глобальных анимаций входа/выхода
    this.animTimers = {
      enter1: null,
      enter2: null,
      exit: null,
      scratch: null,
      corner1: null,
      corner2: null,
    };

    // Оставшиеся глобальные элементы
    this.elements = {
      doors: document.getElementById("loader-doors"),
      centerHub: document.querySelector(".loader-center-hub"),
      aicePortrait: document.querySelector(".aice-portrait-wrap"),
    };

    this.initGlobalBindings();
    this.initStartMenu();
  }

  // --- МЕТОДЫ-ПРОКСИ (Пробрасывают вызовы из движка в модули) ---
  updateBeadCounter(current, max) {
    this.hudManager.updateBeadCounter(current, max);
  }
  updateFanProgress(level) {
    this.hudManager.updateFanProgress(level);
  }
  setLettersActive(isActive) {
    this.hudManager.setLettersActive(isActive);
  }
  lockLetters(isLocked) {
    this.hudManager.lockLetters(isLocked);
  }
  resetUIState(lettersEnabled) {
    this.hudManager.setLettersActive(lettersEnabled);
    this.hudManager.updateFanProgress(0);
  }

  // Утилита разблокировки кнопок (используется после регистрации)
  unlockFeature(featureId) {
    const el = document.getElementById(featureId);
    if (el && el.classList.contains("locked-feature")) {
      el.classList.remove("locked-feature");
      el.classList.add("feature-reveal");
    }
  }

  // --- ЛОГИКА СТАРТА И ВЫХОДА ИЗ ИГРЫ ---
  initStartMenu() {
    document.body.addEventListener(
      "click",
      () => {
        if (audioManager?.resumeContext) audioManager.resumeContext();
      },
      { once: true },
    );

    const el = this.elements;

    ["pointerdown", "mousedown", "wheel", "touchstart", "contextmenu"].forEach(
      (evt) => {
        el.doors.addEventListener(evt, (e) => {
          if (!el.doors.classList.contains("loaded")) e.stopPropagation();
        });
      },
    );

    // Функция входа в игру
    const enterGame = () => {
      this.isMenuLocked = true;
      this.clearAnimTimers();

      if (audioManager?.resumeContext) audioManager.resumeContext();

      const htmlElem = document.documentElement;
      if (htmlElem.requestFullscreen && !document.fullscreenElement) {
        htmlElem.requestFullscreen();
      }

      this.menuManager.hideMenu();

      if (el.centerHub && el.doors) {
        el.centerHub.classList.remove("fade-in-volumetric", "hub-hidden");

        this.animTimers.enter1 = setTimeout(() => {
          el.centerHub.classList.add("fade-out-fast");

          this.animTimers.enter2 = setTimeout(() => {
            if (audioManager?.fadeIn) audioManager.fadeIn(1.0);

            el.doors.classList.add("loaded");
            document.body.classList.remove("loading");

            if (document.body.classList.contains("lights-on")) {
              // Игрок вернулся через "Продолжить"
              if (this.hudManager.elements.hudControls) {
                this.hudManager.elements.hudControls.classList.remove(
                  "hud-hidden",
                );
              }
              const userBadge = document.getElementById("hud-user-status");
              if (userBadge) userBadge.classList.remove("hidden");

              this.animTimers.aice = setTimeout(() => {
                const t = translations[this.currentLang];
                this.dialogueSystem.showAiceDialogue(t.welcomeBack);
              }, 1500);
          } else {
              // === НАЧАЛО: НОВАЯ ИГРА И ЗНАКОМСТВО ===
              this.dialogueSystem.isRegistrationComplete = false;

              // Выключаем пропуск, чтобы увидеть BIOS
              const SKIP_BIOS = true;

              const startRobotSequence = () => {
                if (audioManager?.playUI) audioManager.playUI("lamps");

                const cornerAice = document.getElementById("corner-aice-container");
                const cornerEyes = document.getElementById("corner-eyes");
                const cornerLight = document.getElementById("corner-light");

                if (cornerEyes) {
                  cornerEyes.style.opacity = "0";
                  cornerEyes.classList.remove("corner-blink-anim");
                  cornerEyes.src = "../Image/eyes-corner-sit-1.png";
                }
                if (cornerLight) {
                  cornerLight.style.opacity = "0";
                  cornerLight.classList.remove("corner-light-pulse");
                }

                if (cornerAice) {
                  cornerAice.style.transition = "none";
                  cornerAice.classList.remove("sync-light-flicker");
                  void cornerAice.offsetWidth; // Рефлоу для перезапуска анимации

                  cornerAice.style.opacity = "1";
                  cornerAice.classList.add("sync-light-flicker");

                  this.animTimers.corner1 = setTimeout(() => {
                    if (audioManager?.playUI) audioManager.playUI("wake");

                    if (cornerEyes) {
                      cornerEyes.style.opacity = "1";
                      cornerEyes.classList.add("corner-blink-anim");
                    }
                    if (cornerLight) {
                      cornerLight.style.opacity = "1";
                      cornerLight.classList.add("corner-light-pulse");
                    }

                    this.animTimers.corner2 = setTimeout(() => {
                      if (cornerEyes) {
                        cornerEyes.src = "../Image/eyes-corner-sit-2.png";
                      }

                      // --- АКТИВИРОВАНО: Сюжет и полет ---
                      /*
                      const t = translations[this.currentLang];
                      if (!this.dialogueSystem.isRegistrationComplete) {
                        this.dialogueSystem.runDialogueSequence(t.introDialog, () => {
                          this.dialogueSystem.executeTransferToCenter();
                        });
                      }
                      */
                      // ----------------------------------
                    }, 3000);
                  }, 4000);
                }
              };

              if (SKIP_BIOS) {
                setTimeout(() => {
                  if (this.hudManager.elements.hudControls) {
                    this.hudManager.elements.hudControls.classList.remove("hud-hidden");
                  }
                  if (this.cb?.onFlickerLights) this.cb.onFlickerLights();
                  startRobotSequence();
                }, 1400);
              } else {
                this.dialogueSystem.runBiosSequence(() => {
                  startRobotSequence();
                });
              }
            } // <--- Закрывает внешний else (от проверки lights-on)
          }, 600);
        }, 500);
      }
    };

    const executeNewGame = () => {
      document.body.classList.remove("lights-on");
      if (this.cb?.onForceLightsOff) this.cb.onForceLightsOff();
      if (this.cb?.onReset) this.cb.onReset();

      this.hudManager.resetWordInput();
      if (store?.update) store.update({ mode: "lab" });
      enterGame();
    };

    // Биндим кнопки меню, которые вызывают запуск игры
    const btnStart = document.getElementById("btn-start-game");
    const btnResume = document.getElementById("btn-resume-game");
    const btnConfirmYes = document.getElementById("btn-confirm-yes");
    const btnConfirmNo = document.getElementById("btn-confirm-no");
    const confirmModal = document.getElementById("confirm-modal");
    const btnInGameMenu = document.getElementById("btn-in-game-menu");

    if (btnStart) btnStart.addEventListener("click", executeNewGame);
    if (btnResume) btnResume.addEventListener("click", enterGame);
    if (btnConfirmYes)
      btnConfirmYes.addEventListener("click", () => {
        confirmModal.classList.add("hidden");
        executeNewGame();
      });
    if (btnConfirmNo)
      btnConfirmNo.addEventListener("click", () => {
        confirmModal.classList.add("hidden");
        if (audioManager?.playUI) audioManager.playUI("click");
      });

    const returnToMainMenu = () => {
      this.isMenuLocked = false;
      this.clearAnimTimers();
      this.dialogueSystem.clear(); // Очищаем таймеры диалогов

      document.body.classList.add("loading");

      if (this.hudManager.elements.hudControls) {
        this.hudManager.elements.hudControls.classList.add("hud-hidden");
      }

      const aicePanel = document.getElementById("aice-dialogue-container");
      if (aicePanel) {
        aicePanel.classList.add("hidden");
        const portrait = aicePanel.querySelector(".aice-portrait-wrap");
        const content = aicePanel.querySelector(".aice-dialogue-content");

        if (portrait) portrait.style.opacity = "1";
        if (content) content.style.opacity = "1";

        const cornerAice = document.getElementById("corner-aice-container");
        if (cornerAice) cornerAice.style.opacity = "0";
        cornerAice.classList.remove("sync-light-flicker");
      }

      const userBadge = document.getElementById("hud-user-status");
      if (userBadge) userBadge.classList.add("hidden");

      const regModal = document.getElementById("registration-modal");
      if (regModal) {
        regModal.style.opacity = "0";
        regModal.classList.add("hidden");
      }

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

      this.menuManager.showMenu();

      if (btnResume) {
        if (this.dialogueSystem.isRegistrationComplete) {
          btnResume.style.display = "flex";
        } else {
          btnResume.style.display = "none";
        }
      }
      if (btnStart) btnStart.classList.remove("pulse-glow-volumetric");
    };

    if (btnInGameMenu) {
      btnInGameMenu.addEventListener("click", () => {
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

    // Озвучка кнопок
    const buttons = document.querySelectorAll(
      "#btn-start-game, #btn-resume-game, #btn-in-game-menu",
    );
    buttons.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        if (!this.isMenuLocked && audioManager?.playUI)
          audioManager.playUI("mouse_menu");
      });
      btn.addEventListener("click", () => {
        if (audioManager?.playUI) audioManager.playUI("start");
      });
    });
  }

  // --- ОБНОВЛЕНИЕ ЯЗЫКА (Проксируем в i18n/DOM) ---
  updateLanguage(lang) {
    this.currentLang = lang;
    const t = translations[lang];

    // Обновляем тексты напрямую (то, что не привязано к конкретному модулю)
    const updateText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const updateBtnText = (id, text) => {
      const el = document.getElementById(id)?.querySelector(".btn-text");
      if (el) el.textContent = text;
    };

    updateBtnText("btn-resume-game", t.resume);
    updateBtnText("btn-start-game", t.start);
    updateBtnText("btn-in-game-menu", t.inGameMenu);

    updateText("btn-what-now", t.btnWhatNow);
    updateText("btn-accept-friend", t.btnAcceptFriend);
    updateText("btn-reject-friend", t.btnRejectFriend);
    updateText("btn-final-confirm", t.btnFinalConfirm);
    updateText("bios-continue", t.biosContinue);

    const nameplate = document.querySelector(".aice-nameplate .name-text");
    if (nameplate) nameplate.textContent = lang === "RU" ? "АЙС" : "AICE";

    const regTitle = document.querySelector(
      ".registration-form .section-title",
    );
    if (regTitle) regTitle.textContent = t.regTerminalTitle;

    const nameInput = document.getElementById("player-name-input");
    if (nameInput) {
      nameInput.placeholder = t.regPlaceholder;
      if (
        nameInput.disabled &&
        (nameInput.value === translations.EN.regSuccess ||
          nameInput.value === translations.RU.regSuccess)
      ) {
        nameInput.value = t.regSuccess;
      }
    }
  }

  // --- ГЛОБАЛЬНЫЕ ГОРЯЧИЕ КЛАВИШИ ---
  initGlobalBindings() {
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
      ice.addEventListener("click", (e) => e.stopPropagation());
    }

    window.addEventListener("keydown", (e) => {
      if (document.activeElement.tagName === "INPUT") return;
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
          this.hudManager.closePalette();
          break;
      }
    });
  }

  preloadImages(urls) {
    urls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }

  clearAnimTimers() {
    if (!this.animTimers) return;
    Object.values(this.animTimers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
  }
}
