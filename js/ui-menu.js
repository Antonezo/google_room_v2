import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";

export class MenuManager {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher; // Связь с главным UIManager

    // Экраны
    this.startMenu = document.getElementById("futuristic-start-menu");
    this.mainView = document.getElementById("view-main");
    this.sectorsView = document.getElementById("view-sectors");
 this.settingsView = document.getElementById("view-settings");

this.settingsMainPanel = document.getElementById("settings-main-panel");
this.settingsControlsPanel = document.getElementById(
  "settings-controls-panel",
);

this.settingsHomeParent = this.settingsView?.parentElement ?? null;

    this.settingsHomeNextSibling =
      this.settingsView?.nextElementSibling ?? null;

    this.pauseSettingsHost = document.getElementById("pause-settings-host");

    // Кнопки (исправлены ID под твой HTML!)
    this.btnSectors = document.getElementById("btn-open-sectors");
    this.btnSettings = document.getElementById("btn-open-settings");

    this.btnBackSectors = document.getElementById("btn-back-sectors");
this.btnBackMain = document.getElementById("btn-back-main");
this.btnOpenControls = document.getElementById("btn-open-controls");
this.btnBackControls = document.getElementById("btn-back-controls");
this.btnExit = document.getElementById("btn-exit");
this.btnLang = document.getElementById("btn-toggle-lang");

    // Ползунки
    this.sliderSfx = document.getElementById("slider-sfx");
    this.valSfx = document.getElementById("val-sfx");
    this.sliderMusic = document.getElementById("slider-music");
    this.valMusic = document.getElementById("val-music");

    this.initBindings();
  }

  updateSectorsView() {
    const highestUnlocked = this.ui.cb?.getHighestUnlockedSector?.() ?? 1;

    const currentSector = this.ui.cb?.getCurrentSector?.() ?? 1;

    const t = translations[this.ui.currentLang];

    const sectorCards = document.querySelectorAll(".sector-card");

    sectorCards.forEach((card) => {
      const sectorId = Number(card.dataset.sectorId);

      const isUnlocked = sectorId <= highestUnlocked;

      const isCurrent = sectorId === currentSector;

      card.hidden = !isUnlocked;

      card.classList.toggle("current-sector", isCurrent);

      const title = card.querySelector(".sector-title");

      const status = card.querySelector(".sector-status");

      if (title && t) {
        title.textContent = `${t.sectorLabel} ${sectorId}`;
      }

      if (status && t) {
        status.textContent = isCurrent ? t.sectorCurrent : t.sectorAvailable;
      }
    });
  }

  showPauseSettings() {
    if (!this.settingsView || !this.pauseSettingsHost) {
      return false;
    }

    const pauseMenu = document.querySelector("#pause-overlay .pause-menu");

    const pauseFooter = document.querySelector("#pause-overlay .pause-footer");

    pauseMenu?.setAttribute("hidden", "");
    pauseFooter?.setAttribute("hidden", "");

    this.pauseSettingsHost.hidden = false;

    this.settingsView.classList.remove("active");
    this.pauseSettingsHost.appendChild(this.settingsView);

    // После переноса показываем экран без анимации дверного меню.
    this.settingsView.classList.add("active", "inside-pause");

    // Кнопка назад теперь возвращает в паузу.
    this.settingsView.dataset.context = "pause";
    const backText = this.btnBackMain?.querySelector(".btn-text");

    const t = translations[this.ui.currentLang];

    if (backText && t) {
      backText.textContent = t.backToPause;
    }

    return true;
  }

  hidePauseSettings() {
    if (!this.settingsView) {
      return false;
    }

    // Во время перестройки меню временно запрещаем hover-звуки.
    // Иначе элементы, появившиеся прямо под курсором,
    // вызывают дополнительные mouseenter.
    this.ui.blockHoverSound = true;

    clearTimeout(this.pauseHoverUnlockTimer);

    this.pauseHoverUnlockTimer = setTimeout(() => {
      this.ui.blockHoverSound = false;
    }, 400);

    const pauseMenu = document.querySelector("#pause-overlay .pause-menu");

    const pauseFooter = document.querySelector("#pause-overlay .pause-footer");

    this.settingsView.classList.remove("active", "inside-pause");

    delete this.settingsView.dataset.context;
    const backText = this.btnBackMain?.querySelector(".btn-text");

    const t = translations[this.ui.currentLang];

    if (backText && t) {
      backText.textContent = t.back;
    }

    if (this.settingsHomeParent) {
      if (
        this.settingsHomeNextSibling &&
        this.settingsHomeNextSibling.parentElement === this.settingsHomeParent
      ) {
        this.settingsHomeParent.insertBefore(
          this.settingsView,
          this.settingsHomeNextSibling,
        );
      } else {
        this.settingsHomeParent.appendChild(this.settingsView);
      }
    }

    if (this.pauseSettingsHost) {
      this.pauseSettingsHost.hidden = true;
    }

    pauseMenu?.removeAttribute("hidden");
    pauseFooter?.removeAttribute("hidden");

  this.btnLang?.classList.remove("open");

this.settingsControlsPanel?.classList.remove("active");
this.settingsMainPanel?.classList.add("active");

return true;
  }

  initBindings() {
    // === ЗВУКИ НАВЕДЕНИЯ И КЛИКОВ ДЛЯ ВСЕХ КНОПОК ===
    const menuButtons = [
      { id: "btn-start-game", clickSound: null },
      { id: "btn-resume-game", clickSound: "start" },
      { id: "btn-restart-sector", clickSound: "start" },
      { id: "btn-open-sectors", clickSound: "click" },
      { id: "btn-open-settings", clickSound: "click" },
      { id: "btn-return-title", clickSound: "click" },
      { id: "btn-exit", clickSound: "click" },
      { id: "btn-back-sectors", clickSound: "click" },
      { id: "btn-back-main", clickSound: "click" },
      { id: "btn-open-controls", clickSound: "click" },
{ id: "btn-back-controls", clickSound: "click" },
    ];

    menuButtons.forEach((item) => {
      const btn = document.getElementById(item.id);
      if (btn) {
        // Звук при наведении (играет ТОЛЬКО если браузер уже разблокировал звук после клика)
        btn.addEventListener("mouseenter", () => {
          if (
            audioManager?.ctx?.state === "running" &&
            !this.ui.isMenuLocked &&
            !this.ui.blockHoverSound
          ) {
            audioManager.playUI("mouse_menu");
          }
        });

        // Звук при клике (любой клик автоматически разблокирует звук для браузера)
        btn.addEventListener("click", () => {
          if (item.clickSound && audioManager?.playUI) {
            audioManager.playUI(item.clickSound);
          }
        });
      }
    });
    // ===================================================

    document.querySelectorAll(".sector-card").forEach((card) => {
      card.addEventListener("mouseenter", () => {
        if (
          audioManager?.ctx?.state === "running" &&
          !this.ui.isMenuLocked &&
          !this.ui.blockHoverSound
        ) {
          audioManager.playUI("mouse_menu");
        }
      });

      card.addEventListener("click", () => {
        if (this.ui.isMenuLocked) {
          return;
        }

        const sectorId = Number(card.dataset.sectorId);

        const highestUnlockedSector =
          this.ui.cb?.getHighestUnlockedSector?.() ?? 1;

        const isUnlocked =
          Number.isInteger(sectorId) &&
          sectorId >= 1 &&
          sectorId <= highestUnlockedSector;

        if (!isUnlocked) {
          console.warn(`[LOAD] Сектор ${sectorId} ещё не открыт.`);

          return;
        }

        if (audioManager?.playUI) {
          audioManager.playUI("start");
        }

        // Захватываем мышь первым действием клика.
        // После этого executePreparedGame включит fullscreen.
        this.ui.cb?.onResumeGameplayControls?.();

        this.ui.loadSectorFromMenu?.(sectorId);
      });
    });

    // === ЗВУКИ НАВЕДЕНИЯ ДЛЯ ПОЛЗУНКОВ (без кнопок внутри языков) ===
    const settingsElements = document.querySelectorAll(
      "#slider-sfx, #slider-music, #btn-toggle-lang",
    );

    settingsElements.forEach((el) => {
      el.addEventListener("mouseenter", () => {
        if (
          audioManager?.ctx?.state === "running" &&
          !this.ui.isMenuLocked &&
          !this.ui.blockHoverSound
        ) {
          audioManager.playUI("mouse_menu");
        }
      });
    });

    // --- Навигация по меню ---
    const toggleView = (hideView, showView) => {
      this.ui.blockHoverSound = true;
      setTimeout(() => (this.ui.blockHoverSound = false), 500);
      hideView.classList.remove("active");
      showView.classList.add("active");
    };

    if (this.btnSectors) {
      this.btnSectors.addEventListener("click", () => {
        this.updateSectorsView();
        toggleView(this.mainView, this.sectorsView);
      });
    }

    if (this.btnBackSectors) {
      this.btnBackSectors.addEventListener("click", () => {
        toggleView(this.sectorsView, this.mainView);
      });
    }

    if (this.btnSettings) {
      this.btnSettings.addEventListener("click", () =>
        toggleView(this.mainView, this.settingsView),
      );
    }

if (this.btnOpenControls) {
  this.btnOpenControls.addEventListener("click", () => {
    this.btnLang?.classList.remove("open");

    toggleView(
      this.settingsMainPanel,
      this.settingsControlsPanel,
    );
  });
}

if (this.btnBackControls) {
  this.btnBackControls.addEventListener("click", () => {
    toggleView(
      this.settingsControlsPanel,
      this.settingsMainPanel,
    );
  });
}

    if (this.btnBackMain) {
      this.btnBackMain.addEventListener("click", () => {
        const isPauseContext = this.settingsView?.dataset.context === "pause";

        if (isPauseContext) {
          this.hidePauseSettings();
          return;
        }

       toggleView(this.settingsView, this.mainView);

this.settingsControlsPanel?.classList.remove("active");
this.settingsMainPanel?.classList.add("active");

this.btnLang?.classList.remove("open");
      });
    }

    if (this.btnExit) {
      this.btnExit.addEventListener("click", async () => {
        await this.ui.exitImmersiveFullscreen();
      });
    }

    // --- Переключение языков ---
    if (this.btnLang) {
      this.btnLang.addEventListener("click", (e) => {
        const clickedLangBtn = e.target.closest(".lang-btn");

        if (clickedLangBtn && this.btnLang.classList.contains("open")) {
          const lang = clickedLangBtn.dataset.lang;
          this.ui.updateLanguage(lang); // Дергаем метод из главного UIManager

          this.btnLang.classList.remove("open");
          e.stopPropagation();

          if (audioManager?.playUI) audioManager.playUI("click");
        } else {
          this.btnLang.classList.toggle("open");
        }
      });
    }

    // --- Ползунки громкости ---
    const setupSlider = (
      slider,
      valDisplay,
      funcName,
      multiplier,
      playClick = false,
    ) => {
      if (!slider) return;

      // 1. При перетаскивании (input) только меняем цифры и реальную громкость в системе
      slider.addEventListener("input", (e) => {
        if (audioManager?.resumeContext) audioManager.resumeContext();
        const value = e.target.value;
        valDisplay.textContent = `${value}%`;

        const volumeFloat = Math.pow(value / 100, 2) * multiplier;

        if (audioManager && typeof audioManager[funcName] === "function") {
          audioManager[funcName](volumeFloat);
        }
      });

      // 2. При отпускании ползунка (change) проигрываем тестовый щелчок (если нужно)
      slider.addEventListener("change", () => {
        if (playClick && audioManager?.playUI) {
          audioManager.playUI("click");
        }
      });
    };

    // Вызываем настройки (true для звуков, false для музыки)
    setupSlider(this.sliderSfx, this.valSfx, "setSfxVolume", 2.0, true);
    setupSlider(this.sliderMusic, this.valMusic, "setMusicVolume", 1.5, false);
  }

  // Вызывается, когда мы нажимаем "Новая игра"
  hideMenu() {
    if (this.startMenu) {
      // Больше не делаем opacity: 0! CSS класс "game-started" сделает всё сам.
      this.startMenu.classList.add("game-started");
    }
  }

  // Вызывается, когда мы возвращаемся из игры в меню
  showMenu() {
    if (this.startMenu) {
      this.startMenu.classList.remove("game-started");

      // Сбрасываем вид на "Главный экран", если игрок вышел, находясь в настройках
      if (this.mainView) {
        this.settingsView?.classList.remove("active");
        this.sectorsView?.classList.remove("active");
        this.mainView.classList.add("active");
      }
    }
  }
}
