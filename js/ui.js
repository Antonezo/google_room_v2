import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";
import { MenuManager } from "./ui-menu.js";
import { GameHudManager } from "./ui-hud.js";

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.isMenuLocked = false;
    this.currentLang = "RU";

    // Инициализируем помощников
    this.menuManager = new MenuManager(this);
    this.hudManager = new GameHudManager(this);

    // Централизованное хранилище таймеров
    this.animTimers = {
      enter1: null,
      enter2: null,
      exit: null,
      corner1: null,
      corner2: null,
    };

    // Оставшиеся глобальные элементы
    this.elements = {
      doors: document.getElementById("loader-doors"),
      centerHub: document.querySelector(".loader-center-hub"),
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

    const preparationElements = {
      status: document.getElementById("game-preparation-status"),
      stage: document.getElementById("preparation-stage"),
      percent: document.getElementById("preparation-percent"),
      fill: document.getElementById("preparation-progress-fill"),
      startText: document.querySelector("#btn-start-game .btn-text"),
    };

   let preparationAnimFrame = null;
let displayedPreparationPercent = 0;

const setPreparationVisualPercent = (percent) => {
  const safePercent = Math.max(
    0,
    Math.min(100, Math.round(percent)),
  );

  if (preparationElements.percent) {
    preparationElements.percent.textContent = `${safePercent}%`;
  }

  if (preparationElements.fill) {
    preparationElements.fill.style.width = `${safePercent}%`;
  }

  const coreSubtext = document.querySelector(".core-subtext");

  if (coreSubtext) {
    coreSubtext.textContent = `${safePercent}%`;
  }
};

const animatePreparationPercent = (targetPercent) => {
  const safeTarget = Math.max(
    0,
    Math.min(100, Math.round(targetPercent)),
  );

  if (preparationAnimFrame) {
    cancelAnimationFrame(preparationAnimFrame);
    preparationAnimFrame = null;
  }

  const startPercent = displayedPreparationPercent;
  const distance = safeTarget - startPercent;

  if (Math.abs(distance) < 1) {
    displayedPreparationPercent = safeTarget;
    setPreparationVisualPercent(safeTarget);
    return;
  }

  const startTime = performance.now();

  // Чем больше скачок, тем чуть дольше анимация.
  const duration = Math.max(350, Math.min(900, Math.abs(distance) * 25));

  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration);

    // Мягкое замедление к концу.
    const eased = 1 - Math.pow(1 - t, 3);

    displayedPreparationPercent = startPercent + distance * eased;

    setPreparationVisualPercent(displayedPreparationPercent);

    if (t < 1) {
      preparationAnimFrame = requestAnimationFrame(step);
    } else {
      displayedPreparationPercent = safeTarget;
      setPreparationVisualPercent(safeTarget);
      preparationAnimFrame = null;
    }
  };

  preparationAnimFrame = requestAnimationFrame(step);
};

const updatePreparationStatus = (stage, percent) => {
  if (preparationElements.status) {
    preparationElements.status.classList.add("visible");
  }

  if (preparationElements.stage) {
    preparationElements.stage.textContent = stage;
  }

  animatePreparationPercent(percent);
};

    const setPreparationMode = (enabled) => {
      if (el.doors) {
        el.doors.classList.toggle("is-preparing", enabled);
      }

      if (preparationElements.status) {
        preparationElements.status.classList.toggle("visible", enabled);
      }

      if (preparationElements.startText) {
        preparationElements.startText.textContent = enabled
          ? "ПОДГОТОВКА..."
          : translations[this.currentLang].start;
      }

   if (!enabled) {
  if (preparationAnimFrame) {
    cancelAnimationFrame(preparationAnimFrame);
    preparationAnimFrame = null;
  }

  displayedPreparationPercent = 0;

  setPreparationVisualPercent(0);

        if (preparationElements.stage) {
          preparationElements.stage.textContent = "Ожидание запуска…";
        }

        const coreSubtext = document.querySelector(".core-subtext");

        if (coreSubtext) {
          coreSubtext.textContent = "SYSTEMS";
        }
      }
    };

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

if (this.cb?.onStartGameplay) {
  this.cb.onStartGameplay();
}

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
            }
          }, 600);
        }, 500);
      }
    };

    const executeNewGame = async () => {
      // Защита от повторного клика.
      if (this.isMenuLocked) return;

      this.isMenuLocked = true;
      this.clearAnimTimers();

      if (audioManager?.resumeContext) {
        audioManager.resumeContext();
      }

      const htmlElem = document.documentElement;

      if (htmlElem.requestFullscreen && !document.fullscreenElement) {
        htmlElem.requestFullscreen();
      }

      // Показываем индикатор, но пока не скрываем меню.
      setPreparationMode(true);
      updatePreparationStatus("Запуск подготовки…", 0);

      try {
        if (this.cb?.onPrepareNewGame) {
          await this.cb.onPrepareNewGame((stage, percent) => {
            updatePreparationStatus(stage, percent);
          });
        } else {
          console.warn("[PREPARE] Callback onPrepareNewGame не найден.");
        }
      } catch (error) {
        console.error("[PREPARE] Ошибка подготовки игры:", error);

        updatePreparationStatus("Ошибка подготовки", 0);

        await new Promise((resolve) => setTimeout(resolve, 1200));

        setPreparationMode(false);
        this.isMenuLocked = false;
        return;
      }

if (this.cb?.onReset) {
  this.cb.onReset({ levelId: 1 });
}

      this.hudManager.resetWordInput();

      if (store?.update) {
        store.update({
          mode: "lab",
          playerName: "Dev",
        });
      }

      // Теперь меню можно скрыть.
      this.menuManager.hideMenu();

      if (el.centerHub) {
        el.centerHub.classList.remove(
          "fade-in-volumetric",
          "fade-out-fast",
          "hub-hidden",
        );

        void el.centerHub.offsetWidth;

        requestAnimationFrame(() => {
          el.centerHub.classList.add("fade-out-fast");

          this.animTimers.enter1 = setTimeout(() => {
            el.centerHub.classList.add("hub-hidden");
          }, 650);
        });
      }

      // Даём центральному кругу плавно исчезнуть.
      await new Promise((resolve) => setTimeout(resolve, 700));

     if (el.doors) {
  el.doors.classList.add("loaded");
}

if (this.cb?.onStartGameplay) {
  this.cb.onStartGameplay();
}

document.body.classList.remove("loading");

      if (audioManager?.fadeIn) {
        audioManager.fadeIn(1.0);
      }

      // Индикатор очищаем уже после скрытия меню.
      setPreparationMode(false);

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
    };

    // Биндим кнопки меню, которые вызывают запуск игры
    const btnStart = document.getElementById("btn-start-game");
    const btnResume = document.getElementById("btn-resume-game");
    const btnConfirmYes = document.getElementById("btn-confirm-yes");
    const btnConfirmNo = document.getElementById("btn-confirm-no");
    const confirmModal = document.getElementById("confirm-modal");
    const btnInGameMenu = document.getElementById("btn-in-game-menu");

 const updateSessionButtons = () => {
  const hasSession = this.cb?.hasActiveSession?.() === true;

  if (btnResume) {
    btnResume.style.display = hasSession ? "flex" : "none";
  }
};

// При первом открытии страницы активной сессии ещё нет.
updateSessionButtons();

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

let pendingMenuFrame = null;
    const returnToMainMenu = () => {
      if (pendingMenuFrame) {
  cancelAnimationFrame(pendingMenuFrame);
  pendingMenuFrame = null;
}
       if (this.cb?.canReturnToMenu && !this.cb.canReturnToMenu()) {
    return;
  }
      // Останавливаем длинные игровые звуки при выходе в меню.
      if (audioManager?.stopOpenDoor) audioManager.stopOpenDoor();
      if (audioManager?.stopBoxSlide) audioManager.stopBoxSlide();
      if (this.cb?.onBeginExitToMenu) {
  this.cb.onBeginExitToMenu();
}

      this.isMenuLocked = false;
      this.clearAnimTimers();

      document.body.classList.add("loading");

      if (this.hudManager.elements.hudControls) {
        this.hudManager.elements.hudControls.classList.add("hud-hidden");
      }

      const userBadge = document.getElementById("hud-user-status");
      if (userBadge) userBadge.classList.add("hidden");


      if (audioManager?.fadeOut) audioManager.fadeOut(1.4);
      if (el.doors) el.doors.classList.remove("loaded");

      if (el.centerHub) {
        el.centerHub.classList.remove("fade-out-fast", "fade-in-volumetric");

        el.centerHub.classList.add("hub-hidden");

 this.animTimers.exit = setTimeout(() => {
  if (this.cb?.onFinishExitToMenu) {
    this.cb.onFinishExitToMenu();
  }

  el.centerHub.classList.remove("hub-hidden", "fade-in-volumetric");

  // Фиксируем скрытое начальное состояние.
  void el.centerHub.offsetWidth;

  el.centerHub.classList.add("fade-in-volumetric");

  const removeFadeInClass = () => {
    el.centerHub.classList.remove("fade-in-volumetric");
    el.centerHub.removeEventListener("animationend", removeFadeInClass);
  };

  el.centerHub.addEventListener("animationend", removeFadeInClass);
}, 1400);
      }

      this.menuManager.showMenu();
      updateSessionButtons();
      if (btnStart) btnStart.classList.remove("pulse-glow-volumetric");
    };

const requestReturnToMainMenu = () => {
  const canReturnNow =
    !this.cb?.canReturnToMenu || this.cb.canReturnToMenu();

  if (canReturnNow) {
    returnToMainMenu();
    return;
  }

  if (pendingMenuFrame) return;

  const waitForElevator = () => {
    const canReturnLater =
      !this.cb?.canReturnToMenu || this.cb.canReturnToMenu();

    if (canReturnLater) {
      pendingMenuFrame = null;
      returnToMainMenu();
      return;
    }

    pendingMenuFrame = requestAnimationFrame(waitForElevator);
  };

  pendingMenuFrame = requestAnimationFrame(waitForElevator);
};

   if (btnInGameMenu) {
  btnInGameMenu.addEventListener("click", () => {
    requestReturnToMainMenu();

    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  });
}

  document.addEventListener("fullscreenchange", () => {
  if (
    !document.fullscreenElement &&
    el.doors?.classList.contains("loaded")
  ) {
    requestReturnToMainMenu();
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


    const regTitle = document.querySelector(
      ".registration-form .section-title",
    );
    if (regTitle) regTitle.textContent = t.regTerminalTitle;
  }

  // --- ГЛОБАЛЬНЫЕ ГОРЯЧИЕ КЛАВИШИ ---
  initGlobalBindings() {

    window.addEventListener("keydown", (e) => {
      if (document.activeElement.tagName === "INPUT") return;
      switch (e.code) {
     case "KeyR":
  if (this.cb?.onRestartCurrentRoom) {
    this.cb.onRestartCurrentRoom();
  }
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
