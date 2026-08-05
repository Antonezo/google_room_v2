import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";
import { MenuManager } from "./ui-menu.js";

export class UIManager {
  constructor(callbacks) {
    this.cb = callbacks;
    this.isMenuLocked = false;
    const savedLanguage = localStorage.getItem("google-room-language");

    this.currentLang =
      savedLanguage === "RU" || savedLanguage === "EN" ? savedLanguage : "EN";

   // Инициализируем помощников
this.menuManager = new MenuManager(this);

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
      pauseOverlay: document.getElementById("pause-overlay"),
    };

    if (this.elements.pauseOverlay) {
  this.elements.pauseOverlay.inert = true;
}

    this.initGlobalBindings();
    this.initStartMenu();
    this.updateLanguage(this.currentLang);
    const releaseInitialMainView = () => {
      document.body.classList.remove("initial-main-view");
    };

    document
      .getElementById("btn-open-settings")
      ?.addEventListener("click", releaseInitialMainView, { once: true });

    document
      .getElementById("btn-open-sectors")
      ?.addEventListener("click", releaseInitialMainView, { once: true });
  }

  async enterImmersiveFullscreen() {
    const htmlElem = document.documentElement;

    try {
      if (!document.fullscreenElement && htmlElem.requestFullscreen) {
        await htmlElem.requestFullscreen({
          navigationUI: "hide",
        });
      }

      const supportsKeyboardLock =
        "keyboard" in navigator &&
        typeof navigator.keyboard?.lock === "function";

      if (document.fullscreenElement && supportsKeyboardLock) {
        await navigator.keyboard.lock(["Escape"]);

        console.log("[FULLSCREEN] Escape locked");
      }

      return document.fullscreenElement !== null;
    } catch (error) {
      console.warn("[FULLSCREEN] Не удалось включить immersive-режим:", error);

      return false;
    }
  }

  async exitImmersiveFullscreen() {
    const exitButton = document.getElementById("btn-exit");
    const exitHint = exitButton?.querySelector(".exit-joke");

    clearTimeout(this.exitHintTimer);
    clearTimeout(this.exitHintResetTimer);

    this.exitHintTimer = null;
    this.exitHintResetTimer = null;

    try {
      // Сначала освобождаем Escape, иначе Keyboard Lock
      // продолжит удерживать клавиатуру.
      if (typeof navigator.keyboard?.unlock === "function") {
        navigator.keyboard.unlock();
      }

      if (exitHint) {
        exitHint.textContent =
          this.currentLang === "EN"
            ? "EXITING FULLSCREEN..."
            : "ВЫХОД ИЗ ПОЛНОЭКРАННОГО РЕЖИМА...";
      }

      exitButton?.classList.add("show-joke");

      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }

      if (exitHint) {
        exitHint.textContent =
          this.currentLang === "EN"
            ? "YOU CAN NOW CLOSE THE TAB"
            : "ТЕПЕРЬ МОЖНО ЗАКРЫТЬ ВКЛАДКУ";
      }

      // Оставляем финальную подсказку немного дольше обычного.
      clearTimeout(this.exitHintTimer);
      clearTimeout(this.exitHintResetTimer);

      this.exitHintTimer = setTimeout(() => {
        // Сначала запускаем плавное исчезновение текущей фразы.
        exitButton?.classList.remove("show-joke");

        // Текст возвращаем только после завершения CSS-перехода.
        // Иначе стандартная фраза успевает мелькнуть во время затухания.
        this.exitHintResetTimer = setTimeout(() => {
          if (exitHint) {
            const t = translations[this.currentLang];
            exitHint.textContent = t.exitJoke;
          }

          this.exitHintResetTimer = null;
        }, 350);

        this.exitHintTimer = null;
      }, 5000);

      return true;
    } catch (error) {
      console.warn(
        "[FULLSCREEN] Не удалось выйти из полноэкранного режима:",
        error,
      );

      if (exitHint) {
        exitHint.textContent =
          this.currentLang === "EN"
            ? "HOLD ESC TO EXIT FULLSCREEN"
            : "УДЕРЖИВАЙТЕ ESC ДЛЯ ВЫХОДА";
      }

      return false;
    }
  }

  isPauseMenuOpen() {
    return this.elements.pauseOverlay?.classList.contains("is-open") === true;
  }

  openPauseMenu() {
    const pauseOverlay = this.elements.pauseOverlay;

    if (!pauseOverlay || this.isPauseMenuOpen()) {
      return false;
    }

    const hasActiveSession = this.cb?.hasActiveSession?.() === true;

    if (!hasActiveSession) {
      return false;
    }

    const canOpen = !this.cb?.canOpenPause || this.cb.canOpenPause() === true;

    if (!canOpen) {
      return false;
    }

    const pauseAccepted = this.cb?.onSetPaused?.(true);

    if (pauseAccepted === false) {
      return false;
    }

    // Разрешаем управление кнопками паузы.
    this.isMenuLocked = false;

  // Возвращаем overlay в дерево доступности
// до того, как покажем его пользователю.
pauseOverlay.inert = false;
pauseOverlay.setAttribute("aria-hidden", "false");
pauseOverlay.classList.add("is-open");

    // Сначала показываем overlay, затем освобождаем мышь.
    // Повторное событие unlock уже ничего не откроет,
    // потому что isPauseMenuOpen() вернёт true.
    this.cb?.onReleaseGameplayControls?.();

    return true;
  }

  closePauseMenu({ resumeGameplay = true } = {}) {
    const pauseOverlay = this.elements.pauseOverlay;

    if (!pauseOverlay || !this.isPauseMenuOpen()) {
      return false;
    }

  this.menuManager.hidePauseSettings();

// Нельзя ставить aria-hidden родителю, пока одна из его
// кнопок остаётся активным элементом документа.
const activeElement = document.activeElement;

if (
  activeElement instanceof HTMLElement &&
  pauseOverlay.contains(activeElement)
) {
  activeElement.blur();
}

// Сначала убираем фокус, затем исключаем overlay
// из управления и дерева доступности.
pauseOverlay.inert = true;
pauseOverlay.classList.remove("is-open");
pauseOverlay.setAttribute("aria-hidden", "true");
    if (!resumeGameplay) {
      this.isMenuLocked = false;
      return true;
    }

    this.cb?.onSetPaused?.(false);

    // Во время игры обычное меню заблокировано.
    this.isMenuLocked = true;

    // Сначала возвращаем Pointer Lock, пока клик игрока
    // остаётся активным пользовательским действием.
    this.cb?.onResumeGameplayControls?.();

    // Затем проверяем fullscreen и заново захватываем Escape.
    this.enterImmersiveFullscreen();

    return true;
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

    const translatePreparationStage = (stage) => {
      const t = translations[this.currentLang];

      if (!t || typeof stage !== "string") {
        return stage;
      }

      const directStages = {
        "Запуск подготовки…": t.preparationStarting,

        "Ошибка подготовки": t.preparationError,

        "Быстрая подготовка…": t.preparationQuick,

        "Проверка готовых шейдеров…": t.preparationShaderCheck,

        "Система готова": t.preparationReady,

        "Подготовка комнаты 1…": t.preparationRoom1,

        "Подготовка комнаты 2…": t.preparationRoom2,

        "Подготовка комнаты 3…": t.preparationRoom3,

        "Возврат в комнату 1…": t.preparationReturnRoom1,
      };

      if (directStages[stage]) {
        return directStages[stage];
      }

      const completedStages = [
        ["Подготовка комнаты 1… готово", t.preparationRoom1],
        ["Подготовка комнаты 2… готово", t.preparationRoom2],
        ["Подготовка комнаты 3… готово", t.preparationRoom3],
        ["Возврат в комнату 1… готово", t.preparationReturnRoom1],
      ];

      const completedStage = completedStages.find(
        ([source]) => source === stage,
      );

      if (completedStage) {
        const translatedBase = completedStage[1]
          .replace(/…$/, "")
          .replace(/\.\.\.$/, "");

        return `${translatedBase}${t.preparationCompleteSuffix}`;
      }

      // Неизвестную новую строку не ломаем:
      // показываем её как передал main.js.
      return stage;
    };

    const setPreparationVisualPercent = (percent) => {
      const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

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
      const safeTarget = Math.max(0, Math.min(100, Math.round(targetPercent)));

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
        preparationElements.stage.textContent =
          translatePreparationStage(stage);
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
        const t = translations[this.currentLang];

        preparationElements.startText.textContent = enabled
          ? t.preparationButton
          : t.start;
      }

      if (!enabled) {
        if (preparationAnimFrame) {
          cancelAnimationFrame(preparationAnimFrame);
          preparationAnimFrame = null;
        }

        displayedPreparationPercent = 0;

        setPreparationVisualPercent(0);

        if (preparationElements.stage) {
          preparationElements.stage.textContent =
            translations[this.currentLang].preparationIdle;
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

      if (audioManager?.resumeContext) {
        audioManager.resumeContext();
      }

      this.enterImmersiveFullscreen();

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
          }, 600);
        }, 500);
      }
    };

    const executePreparedGame = async ({
      levelId = 1,
      eraseSave = false,
    } = {}) => {
      // Защита от повторного клика.
      if (this.isMenuLocked) return;

      this.isMenuLocked = true;
      this.clearAnimTimers();

      if (audioManager?.resumeContext) {
        audioManager.resumeContext();
      }

      await this.enterImmersiveFullscreen();

      // Показываем индикатор, но пока не скрываем меню.
      updatePreparationStatus(
        translations[this.currentLang].preparationStarting,
        0,
      );

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

        updatePreparationStatus(
          translations[this.currentLang].preparationError,
          0,
        );

        await new Promise((resolve) => setTimeout(resolve, 1200));

        setPreparationMode(false);
        this.isMenuLocked = false;
        return;
      }

      if (eraseSave && this.cb?.onDeleteSavedProgress) {
        this.cb.onDeleteSavedProgress();
      }

      // Сначала возвращаем общее состояние атмосферы.
      // Оно может менять цвета общих материалов комнаты.
      if (store?.update) {
        store.update({
          mode: "lab",
          playerName: "Dev",
        });
      }

      // И только после этого строим выбранный сектор,
      // чтобы его собственные материалы и цвета применились последними.
      if (this.cb?.onReset) {
        this.cb.onReset({ levelId });
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
    };

    this.loadSectorFromMenu = (sectorId) => {
      const highestUnlockedSector = this.cb?.getHighestUnlockedSector?.() ?? 1;

      const safeSectorId = Number(sectorId);

      const isValidSector =
        Number.isInteger(safeSectorId) &&
        safeSectorId >= 1 &&
        safeSectorId <= highestUnlockedSector;

      if (!isValidSector) {
        console.warn(
          `[LOAD] Попытка загрузить недоступный сектор: ${sectorId}`,
        );

        return false;
      }

      this.cb?.onSectorLoadedFromMenu?.(safeSectorId);

      executePreparedGame({
        levelId: safeSectorId,
        eraseSave: false,
      });

      return true;
    };

    // Биндим кнопки меню, которые вызывают запуск игры
    const btnStart = document.getElementById("btn-start-game");
    const btnRestartSector = document.getElementById("btn-restart-sector");

    const btnSectors = document.getElementById("btn-open-sectors");
    const btnReturnTitle = document.getElementById("btn-return-title");

    const btnConfirmYes = document.getElementById("btn-confirm-yes");
    const btnConfirmNo = document.getElementById("btn-confirm-no");
    const confirmModal = document.getElementById("confirm-modal");
    const btnInGameMenu = document.getElementById("btn-in-game-menu");
    const btnPauseResume = document.getElementById("btn-pause-resume");

   const btnPauseRestart = document.getElementById("btn-pause-restart");

const btnPauseControls = document.getElementById("btn-pause-controls");

const btnPauseSettings = document.getElementById("btn-pause-settings");

    const btnPauseMainMenu = document.getElementById("btn-pause-main-menu");

    const updateSessionButtons = () => {
      const hasActiveSession = this.cb?.hasActiveSession?.() === true;

      const highestUnlockedSector = this.cb?.getHighestUnlockedSector?.() ?? 1;

      // Старые кнопки дверного меню пока оставляем скрытыми.
      // Настоящая пауза теперь находится в pause-overlay.
      if (btnRestartSector) {
        btnRestartSector.style.display = "none";
      }

      if (btnReturnTitle) {
        btnReturnTitle.style.display = "none";
      }

      if (btnStart) {
        btnStart.style.display = hasActiveSession ? "none" : "flex";
      }

      // "Загрузить" появляется только после открытия сектора 2.
      if (btnSectors) {
        const canLoadSector = !hasActiveSession && highestUnlockedSector >= 2;

        btnSectors.style.display = canLoadSector ? "flex" : "none";
      }
    };

    this.updateMainMenuButtons = updateSessionButtons;

    // При первом открытии страницы активной сессии ещё нет.
    updateSessionButtons();

    const startFreshGame = () => {
      if (audioManager?.playUI) {
        audioManager.playUI("start");
      }
      // Сразу сбрасываем старый прогресс,
      // включая highestUnlockedSector.
      if (this.cb?.onDeleteSavedProgress) {
        this.cb.onDeleteSavedProgress();
      }

      // Немедленно обновляем главное меню:
      // кнопка "Загрузить" должна исчезнуть.
      this.updateMainMenuButtons?.();

      executePreparedGame({
        levelId: 1,
        eraseSave: false,
      });
    };

    if (btnStart) {
      btnStart.addEventListener("click", () => {
        const highestUnlockedSector =
          this.cb?.getHighestUnlockedSector?.() ?? 1;

        const hasMeaningfulProgress = highestUnlockedSector >= 2;

        // Предупреждаем только при действительно
        // достигнутом втором секторе или выше.
        if (hasMeaningfulProgress && confirmModal) {
          confirmModal.classList.remove("hidden");
          return;
        }

        startFreshGame();
      });
    }

    if (btnRestartSector) {
      btnRestartSector.addEventListener("click", () => {
        if (this.isMenuLocked) return;

        if (this.cb?.onRestartCurrentRoom) {
          this.cb.onRestartCurrentRoom();
        }

        enterGame();
      });
    }

    if (btnReturnTitle) {
      btnReturnTitle.addEventListener("click", () => {
        if (this.cb?.onReturnToTitle) {
          this.cb.onReturnToTitle();
        }

        updateSessionButtons();
      });
    }

    if (btnConfirmYes) {
      btnConfirmYes.addEventListener("click", () => {
        confirmModal?.classList.add("hidden");
        startFreshGame();
      });
    }

    if (btnConfirmNo) {
      btnConfirmNo.addEventListener("click", () => {
        confirmModal?.classList.add("hidden");
      });
    }
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

    if (btnPauseResume) {
      btnPauseResume.addEventListener("click", () => {
        this.closePauseMenu();
      });
    }

   if (btnPauseRestart) {
  btnPauseRestart.addEventListener("click", () => {
    const canRestart =
      !this.cb?.canRestartCurrentRoom ||
      this.cb.canRestartCurrentRoom() === true;

    if (!canRestart || !this.cb?.onRestartCurrentRoom) {
      return;
    }

    const restarted = this.cb.onRestartCurrentRoom();

    // Закрываем паузу только после успешного рестарта.
    if (restarted !== false) {
      this.closePauseMenu();
    }
  });
}

if (btnPauseControls) {
  btnPauseControls.addEventListener("click", () => {
    this.menuManager.showPauseControls();
  });
}

    if (btnPauseSettings) {
      btnPauseSettings.addEventListener("click", () => {
        this.menuManager.showPauseSettings();
      });
    }

    if (btnPauseMainMenu) {
      btnPauseMainMenu.addEventListener("click", async () => {
        // Страховка для браузеров без Keyboard Lock:
        // если Esc уже вывел страницу из fullscreen,
        // возвращаем fullscreen по клику игрока.
        await this.enterImmersiveFullscreen();

        // Убираем overlay, но не возвращаем управление игроку.
        this.closePauseMenu({
          resumeGameplay: false,
        });

        if (this.cb?.onReturnToTitle) {
          this.cb.onReturnToTitle();
        }

        // Большие двери закрываются уже внутри fullscreen.
        requestReturnToMainMenu();
      });
    }

   const pauseButtons = [
  { button: btnPauseResume, sound: "start" },
  { button: btnPauseRestart, sound: "start" },
  { button: btnPauseControls, sound: "click" },
  { button: btnPauseSettings, sound: "click" },
  { button: btnPauseMainMenu, sound: "click" },
];

    pauseButtons.forEach(({ button, sound }) => {
      if (!button) return;

      button.addEventListener("mouseenter", () => {
        if (audioManager?.ctx?.state === "running" && !this.blockHoverSound) {
          audioManager.playUI("mouse_menu");
        }
      });

      button.addEventListener("click", () => {
        if (audioManager?.playUI) {
          audioManager.playUI(sound);
        }
      });
    });

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
        typeof navigator.keyboard?.unlock === "function"
      ) {
        navigator.keyboard.unlock();
      }

      const hasActiveSession = this.cb?.hasActiveSession?.() === true;

      if (
        !document.fullscreenElement &&
        hasActiveSession &&
        el.doors?.classList.contains("loaded")
      ) {
        // Если игрок удержал Esc и реально вышел из fullscreen,
        // оставляем игру на паузе.
        this.openPauseMenu();
      }
    });
  }

  // --- ОБНОВЛЕНИЕ ЯЗЫКА ---

  updateLanguage(lang) {
    const safeLang = translations[lang] ? lang : "EN";

    this.currentLang = safeLang;

    localStorage.setItem("google-room-language", safeLang);

    document.documentElement.lang = safeLang.toLowerCase();

    document.documentElement.dataset.uiLang = safeLang;

    const t = translations[safeLang];

    document.querySelectorAll(".lang-btn").forEach((button) => {
      const isCurrentLanguage = button.dataset.lang === safeLang;

      button.classList.toggle("active-lang", isCurrentLanguage);

      button.setAttribute("aria-pressed", String(isCurrentLanguage));
    });

    const updateText = (id, text) => {
      const el = document.getElementById(id);

      if (!el || el.querySelector("[data-lang-text]")) {
        return;
      }

      el.textContent = text;
    };

    const updateBtnText = (id, text) => {
      const el = document.getElementById(id)?.querySelector(".btn-text");

      if (!el || el.querySelector("[data-lang-text]")) {
        return;
      }

      el.textContent = text;
    };

    updateBtnText("btn-start-game", t.start);
    updateBtnText("btn-restart-sector", t.restartSector);
    updateBtnText("btn-open-sectors", t.load);
    updateBtnText("btn-open-settings", t.settings);
    updateBtnText("btn-exit", t.exit);
    const settingsOpenedFromPause =
      this.menuManager?.settingsView?.dataset.context === "pause";

    updateBtnText(
      "btn-back-main",
      settingsOpenedFromPause ? t.backToPause : t.back,
    );
    updateBtnText("btn-in-game-menu", t.inGameMenu);
    updateBtnText("btn-return-title", t.titleMenu);
    updateText("pause-system-label", t.pauseSystemLabel);

    updateText("pause-title", t.pauseTitle);

    updateBtnText("btn-pause-resume", t.pauseResume);

  updateBtnText("btn-pause-restart", t.pauseRestart);

updateBtnText("btn-pause-controls", t.controls);

updateBtnText("btn-pause-settings", t.pauseSettings);

    updateBtnText("btn-pause-main-menu", t.pauseMainMenu);

    updateText("pause-footer-text", t.pauseFooter);

    updateText("preparation-title", t.preparationTitle);

    const preparationStage = document.getElementById("preparation-stage");

    const isPreparing =
      this.elements.doors?.classList.contains("is-preparing") === true;

    if (preparationStage && !isPreparing) {
      preparationStage.textContent = t.preparationIdle;
    }

    const confirmText = document.getElementById("confirm-new-game-text");

    const confirmYesText = document.querySelector("#btn-confirm-yes .btn-text");

    const confirmNoText = document.querySelector("#btn-confirm-no .btn-text");

    if (confirmText && t.newGameWarning) {
      confirmText.innerHTML = t.newGameWarning;
    }

    if (confirmYesText && t.confirmYes) {
      confirmYesText.textContent = t.confirmYes;
    }

    if (confirmNoText && t.confirmNo) {
      confirmNoText.textContent = t.confirmNo;
    }

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

    updateBtnText("btn-open-controls", t.controls);
    updateBtnText("btn-back-controls", t.controlsBack);

    updateText("controls-title", t.controls);
    updateText("control-action-movement", t.controlMovement);
    updateText("control-action-jump", t.controlJump);
    updateText("control-action-pause", t.controlPause);
    updateText("control-action-restart", t.controlRestart);

    updateText("control-binding-mouse-text", t.controlMouse);

    const languageStatus = document.getElementById("current-language-status");

    if (languageStatus) {
      languageStatus.textContent = t.languageCode;
    }

    updateText("btn-what-now", t.btnWhatNow);
    updateText("btn-accept-friend", t.btnAcceptFriend);
    updateText("btn-reject-friend", t.btnRejectFriend);
    updateText("btn-final-confirm", t.btnFinalConfirm);
    updateText("bios-continue", t.biosContinue);

    const regTitle = document.querySelector(
      ".registration-form .section-title",
    );
    if (regTitle) regTitle.textContent = t.regTerminalTitle;
    this.menuManager?.updateSectorsView();
  }

  // --- ГЛОБАЛЬНЫЕ ГОРЯЧИЕ КЛАВИШИ ---
  initGlobalBindings() {
    window.addEventListener("keydown", (e) => {
      if (document.activeElement?.tagName === "INPUT") {
        return;
      }

      switch (e.code) {
        case "Escape": {
          const hasActiveSession = this.cb?.hasActiveSession?.() === true;

          if (!hasActiveSession) {
            return;
          }

          e.preventDefault();

          if (this.isPauseMenuOpen()) {
            this.closePauseMenu();
          } else {
            this.openPauseMenu();
          }

          break;
        }

case "KeyR":
  // Удержание клавиши не должно запускать серию рестартов.
  if (e.repeat) break;

  // Во время лифта, перехода, подготовки или другого рестарта
  // сбрасывать комнату небезопасно.
  const canRestart =
    !this.cb?.canRestartCurrentRoom ||
    this.cb.canRestartCurrentRoom() === true;

  if (
    canRestart &&
    this.cb?.hasActiveSession?.() === true &&
    !this.isPauseMenuOpen() &&
    this.cb?.onRestartCurrentRoom
  ) {
    this.cb.onRestartCurrentRoom();
  }

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
