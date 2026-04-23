import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";
import { MenuManager } from "./ui-menu.js";
import { GameHudManager } from "./ui-hud.js";
import { DialogueSystem } from "./ui-dialogue.js";
import { CutsceneManager } from "./cutscene.js";

export class UIManager {
  constructor(callbacks) {
    this.preloadImages([
      "/Image/tablet-2.png",
      "/Image/blinks-eyes-tablet-2.png",
      "/Image/light-tablet-2.png",
    ]);
    this.cb = callbacks;
    this.isMenuLocked = false;
    this.currentLang = "RU";

    // Инициализируем помощников
    this.menuManager = new MenuManager(this);
    this.hudManager = new GameHudManager(this);
    this.dialogueSystem = new DialogueSystem(this);
    this.cutsceneManager = new CutsceneManager(this);

    // Централизованное хранилище таймеров
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

  // --- МЕТОДЫ-ПРОКСИ ---
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

    // Функция входа в игру (Используется для кнопки ПРОДОЛЖИТЬ)
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
            }
          }, 600);
        }, 500);
      }
    };

    const executeNewGame = async () => {
      // 1. Подготовка сцены (БЕЗ отключения света)
      if (this.cb?.onReset) this.cb.onReset();

      if (this.cb?.onRegistrationStart) this.cb.onRegistrationStart();

      // СРАЗУ ПЕРЕДАЕМ СИГНАЛ: Камера, лети в центр для геймплея!
      if (this.cb?.onRegistrationEnd) this.cb.onRegistrationEnd();

      this.hudManager.resetWordInput();

      // Сразу задаем дефолтное имя, чтобы HUD не сломался
      if (store?.update) store.update({ mode: "lab", playerName: "Dev" });

      // 2. Блокируем меню и начинаем вход
      this.isMenuLocked = true;
      this.clearAnimTimers();
      if (audioManager?.resumeContext) audioManager.resumeContext();

      const htmlElem = document.documentElement;
      if (htmlElem.requestFullscreen && !document.fullscreenElement) {
        htmlElem.requestFullscreen();
      }

      this.menuManager.hideMenu();

      if (el.centerHub) {
        el.centerHub.classList.remove("fade-in-volumetric", "hub-hidden");
        el.centerHub.classList.add("fade-out-fast");
        setTimeout(() => el.centerHub.classList.add("hub-hidden"), 500);
      }

      // Ждем и открываем двери
      await new Promise((res) => setTimeout(res, 600));
      if (el.doors) el.doors.classList.add("loaded");
      document.body.classList.remove("loading");

      // ==========================================
      // 3. БЫСТРЫЙ СТАРТ (Пропуск сюжета)
      // ==========================================

      // Включаем свет
      document.body.classList.add("lights-on");

      // Показываем боковые панели HUD
      if (this.hudManager.elements.hudControls) {
        this.hudManager.elements.hudControls.classList.remove("hud-hidden");
      }

      // Выводим бейджик игрока (опционально, если хочешь видеть имя)
      const userBadge = document.getElementById("hud-user-status");
      const userNameText = document.getElementById("hud-user-name");
      if (userBadge && userNameText) {
        userNameText.innerText = `USER: DEV`;
        userBadge.classList.remove("hidden");
      }

      // Разблокируем интерфейс (Кнопки слева и справа)
      this.unlockFeature("feature-equipment");
      this.unlockFeature("feature-word");
      this.unlockFeature("feature-physics");

      // Говорим инпутам и паузе, что регистрация пройдена
      this.dialogueSystem.isRegistrationComplete = true;

      // ЗАКОММЕНТИРОВАН СТАРЫЙ СЮЖЕТ:
      /*
      this.dialogueSystem.isRegistrationComplete = false;
      this.dialogueSystem.runBiosSequence(() => {
        setTimeout(() => {
          this.dialogueSystem.startIntroDialogue();
        }, 2500);
      });
      */
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
      this.dialogueSystem.clear();

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
  }

  // --- ОБНОВЛЕНИЕ ЯЗЫКА ---

  updateLanguage(lang) {
    this.currentLang = lang;
    const t = translations[lang];

    const updateText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const updateBtnText = (id, text) => {
      const el = document.getElementById(id)?.querySelector(".btn-text");
      if (el) el.textContent = text;
    };

    updateBtnText("btn-start-game", t.start);
    updateBtnText("btn-resume-game", t.resume);
    updateBtnText("btn-open-settings", t.settings);
    updateBtnText("btn-exit", t.exit);
    updateBtnText("btn-back-main", t.back);
    updateBtnText("btn-in-game-menu", t.inGameMenu);

    const exitJokeEl = document.querySelector("#btn-exit .exit-joke");
    if (exitJokeEl) exitJokeEl.textContent = t.exitJoke;

    const sfxTitle = document.getElementById("val-sfx")?.previousElementSibling;
    if (sfxTitle) sfxTitle.textContent = t.sfx;

    const musicTitle =
      document.getElementById("val-music")?.previousElementSibling;
    if (musicTitle) musicTitle.textContent = t.music;

    const langTitle = document.querySelector(
      "#btn-toggle-lang .slider-header .btn-text",
    );
    if (langTitle) langTitle.textContent = t.langTitle;

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
