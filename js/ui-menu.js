import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";
import { SectorWheel3D } from "./ui-sector-wheel.js";
import { SettingsWheel3D } from "./ui-settings-wheel.js";

export class MenuManager {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher; // Связь с главным UIManager

    // Экраны
    this.startMenu = document.getElementById("futuristic-start-menu");
    this.startScreen =
  document.getElementById("loader-doors");
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
    this.sectorWheelHost =
  document.getElementById("sector-wheel-canvas-host");
  this.startMenuUI =
  document.querySelector(".start-menu-ui");

this.sectorWheel3D = null;

this.settingsWheelHost =
  document.getElementById(
    "settings-wheel-three-host",
  );

this.settingsWheel3D = null;

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
    if (this.sectorWheelHost) {
 this.sectorWheel3D =
  new SectorWheel3D(
    this.sectorWheelHost,
    {
      onSelect: (sectorId) => {
        this.handleSectorSelect(
          sectorId,
        );
      },
    },
  );
}
if (this.settingsWheelHost) {
  this.settingsWheel3D =
    new SettingsWheel3D(
      this.settingsWheelHost,
    );
}
  }

  updateSectorsView() {
    const highestUnlocked =
      this.ui.cb?.getHighestUnlockedSector?.() ?? 1;

    const currentSector =
      this.ui.cb?.getCurrentSector?.() ?? 1;

    const maxRealSector = 3;
    const teaserSector = highestUnlocked >= 3 ? 4 : 3;

    const items = [];

    // Добавляем все реально открытые уровни.
    for (
      let sectorId = 1;
      sectorId <= Math.min(highestUnlocked, maxRealSector);
      sectorId += 1
    ) {
      items.push({
        sectorId,
        locked: false,
        current: sectorId === currentSector,
      });
    }

    // После последнего открытого уровня всегда показываем
    // один закрытый teaser.
    if (teaserSector > highestUnlocked) {
      items.push({
        sectorId: teaserSector,
        locked: true,
        current: false,
      });
    }

 this.sectorWheelItems = items;

this.sectorWheel3D?.setItems(items);
  }

handleSectorSelect(sectorId) {
  const item =
    this.sectorWheelItems?.find(
      (entry) =>
        entry.sectorId === sectorId,
    );

  if (!item || item.locked) {
    return;
  }

  if (this.ui.isMenuLocked) {
    return;
  }

  if (
    typeof this.ui.loadSectorFromMenu !==
    "function"
  ) {
    console.warn(
      "[MenuManager] loadSectorFromMenu не найден.",
    );

    return;
  }

  if (audioManager?.playUI) {
    audioManager.playUI("start");
  }

  // Мгновенно забираем курсор,
  // пока выполняется исходный клик по карточке.
  this.ui.cb?.onResumeGameplayControls?.();

  this.ui.loadSectorFromMenu(
    sectorId,
  );
}

 showPauseSettings() {
  if (
    !this.settingsView ||
    !this.startMenu ||
    !this.startScreen
  ) {
    return false;
  }

  const pauseOverlay =
    document.getElementById(
      "pause-overlay",
    );

  // -------------------------------------------------
  // Настройки остаются в своём родном DOM-контейнере.
  // Ничего больше никуда не appendChild().
  // -------------------------------------------------

  this.mainView?.classList.remove(
    "active",
  );

  this.sectorsView?.classList.remove(
    "active",
  );

  this.settingsControlsPanel?.classList.remove(
    "active",
  );

  this.settingsMainPanel?.classList.add(
    "active",
  );

  this.settingsView.classList.add(
    "active",
  );

  this.settingsView.dataset.context =
    "pause";

  // Показываем настоящий start-menu UI,
  // но без стартового фонового изображения.
  this.startMenu.classList.remove(
    "game-started",
  );

  this.startScreen.classList.add(
    "pause-submenu-open",
  );

  // Саму карточку паузы прячем,
  // overlay остаётся и продолжает размывать игру.
  pauseOverlay?.classList.add(
    "submenu-open",
  );

  const backText =
    this.btnBackMain?.querySelector(
      ".btn-text",
    );

  const t =
    translations[this.ui.currentLang];

  if (backText && t) {
    backText.textContent =
      t.backToPause;
  }

  // В паузе для управления есть отдельная
  // кнопка, поэтому строку "Управление"
  // внутри барабана не дублируем.
  if (this.btnOpenControls) {
    this.btnOpenControls.style.display =
      "none";
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      this.settingsWheel3D?.resize();
    });
  });

  return true;
}

 showPauseControls() {
  if (!this.showPauseSettings()) {
    return false;
  }

  this.settingsView.dataset.context =
    "pause-controls";

  this.settingsMainPanel?.classList.remove(
    "active",
  );

  this.settingsControlsPanel?.classList.add(
    "active",
  );

  const backText =
    this.btnBackControls?.querySelector(
      ".btn-text",
    );

  const t =
    translations[this.ui.currentLang];

  if (backText && t) {
    backText.textContent =
      t.backToPause;
  }

  return true;
}

  hidePauseSettings() {
  if (!this.settingsView) {
    return false;
  }

  const context =
    this.settingsView.dataset.context;

  const isPauseContext =
    context === "pause" ||
    context === "pause-controls";

  if (!isPauseContext) {
    return false;
  }

  // На короткое время глушим случайные
  // hover-звуки при перестройке интерфейса.
  this.ui.blockHoverSound = true;

  clearTimeout(
    this.pauseHoverUnlockTimer,
  );

  this.pauseHoverUnlockTimer =
    setTimeout(() => {
      this.ui.blockHoverSound = false;
    }, 400);

  const pauseOverlay =
    document.getElementById(
      "pause-overlay",
    );

  // Убираем полноценный экран настроек.
  this.settingsView.classList.remove(
    "active",
  );

  delete this.settingsView.dataset.context;

  // Возвращаем UI игры в скрытое состояние.
  // Сначала принудительно делаем слой стартового меню
// полностью невидимым и отключаем его transition.
this.startScreen?.classList.add(
  "pause-submenu-closing",
);


// Сам UI тоже возвращаем в игровое скрытое состояние.
this.startMenu?.classList.add(
  "game-started",
);


// Теперь можно безопасно снять режим pause-submenu:
// стартовая картинка уже физически не может мигнуть.
this.startScreen?.classList.remove(
  "pause-submenu-open",
);


// Возвращаем карточку паузы.
pauseOverlay?.classList.remove(
  "submenu-open",
);


// После двух кадров браузер уже применил обычное
// состояние .loaded. Временный класс больше не нужен.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    this.startScreen?.classList.remove(
      "pause-submenu-closing",
    );
  });
});

  this.btnLang?.classList.remove(
    "open",
  );

  this.settingsControlsPanel?.classList.remove(
    "active",
  );

  this.settingsMainPanel?.classList.add(
    "active",
  );

  if (this.btnOpenControls) {
    this.btnOpenControls.style.display =
      "";
  }

  const t =
    translations[this.ui.currentLang];

  const backText =
    this.btnBackMain?.querySelector(
      ".btn-text",
    );

  if (backText && t) {
    backText.textContent =
      t.back;
  }

  const controlsBackText =
    this.btnBackControls?.querySelector(
      ".btn-text",
    );

  if (controlsBackText && t) {
    controlsBackText.textContent =
      t.controlsBack;
  }

  return true;
}

  initBindings() {
    // === ЗВУКИ НАВЕДЕНИЯ И КЛИКОВ ДЛЯ ВСЕХ КНОПОК ===
const menuButtons = [
  { id: "btn-start-game", clickSound: null },
  { id: "btn-restart-sector", clickSound: "start" },
  { id: "btn-open-sectors", clickSound: "click" },
  { id: "btn-open-settings", clickSound: "click" },
  { id: "btn-return-title", clickSound: "click" },
  { id: "btn-exit", clickSound: "click" },
  { id: "btn-back-sectors", clickSound: "click" },

  { id: "btn-back-main", clickSound: "click", hoverSound: false },

  { id: "btn-open-controls", clickSound: "click" },

  { id: "btn-back-controls", clickSound: "click", hoverSound: false },
];
    menuButtons.forEach((item) => {
      const btn = document.getElementById(item.id);
      if (btn) {
        // Звук при наведении (играет ТОЛЬКО если браузер уже разблокировал звук после клика)
     btn.addEventListener("mouseenter", () => {
  if (
    item.hoverSound !== false &&
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

    toggleView(
      this.mainView,
      this.sectorsView,
    );

    this.startMenuUI?.classList.add(
      "is-sectors-open",
    );

    requestAnimationFrame(() => {
      this.sectorWheel3D?.resize();
    });
  });
}
   
if (this.btnBackSectors) {
  this.btnBackSectors.addEventListener("click", () => {
    this.startMenuUI?.classList.remove(
      "is-sectors-open",
    );

    toggleView(
      this.sectorsView,
      this.mainView,
    );
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

        toggleView(this.settingsMainPanel, this.settingsControlsPanel);
      });
    }

   if (this.btnBackControls) {
  this.btnBackControls.addEventListener("click", () => {
    const isDirectPauseControls =
      this.settingsView?.dataset.context === "pause-controls";

    // Памятка была открыта отдельной кнопкой из паузы:
    // возвращаемся сразу в меню паузы.
    if (isDirectPauseControls) {
      this.hidePauseSettings();
      return;
    }

    // Обычный путь из главного меню:
    // Управление → Настройки.
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
    const clickedLangBtn =
      e.target.closest(".lang-btn");

    if (!clickedLangBtn) {
      return;
    }

    const lang =
      clickedLangBtn.dataset.lang;

    if (!lang) {
      return;
    }

    this.ui.updateLanguage(lang);

    e.stopPropagation();

    if (audioManager?.playUI) {
      audioManager.playUI("click");
    }
  });
}

    // --- Ползунки громкости ---
    const setupSlider = (
      slider,
      valDisplay,
      funcName,
      multiplier,
      previewScale = 1,
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
     slider.addEventListener(
  "change",
  (e) => {
    const value =
      Number(e.target.value);

    const volumeFloat =
      Math.pow(
        value / 100,
        2,
      ) * multiplier;

    if (
      audioManager?.playVolumePreview
    ) {
      audioManager.playVolumePreview(
        "click",
        volumeFloat * previewScale,
      );
    }
  },
);
    };

    // Вызываем настройки (true для звуков, false для музыки)
  setupSlider(
  this.sliderSfx,
  this.valSfx,
  "setSfxVolume",
  2.0,
  0.5,
);

setupSlider(
  this.sliderMusic,
  this.valMusic,
  "setMusicVolume",
  1.5,
  1.0,
);
  }

  // Вызывается, когда мы нажимаем "Новая игра"
hideMenu() {
  if (this.startMenu) {
    this.startMenu.classList.add(
      "game-started",
    );
  }

  // Выбор сектора больше не считается открытым,
  // когда мы уже вошли в игру.
  this.startMenuUI?.classList.remove(
    "is-sectors-open",
  );

  this.sectorsView?.classList.remove(
    "active",
  );

  this.sectorWheel3D?.clearHoveredCard?.();
}

  // Вызывается, когда мы возвращаемся из игры в меню
showMenu() {
  if (this.startMenu) {
    this.startMenu.classList.remove(
      "game-started",
    );

    // При любом возврате из игры всегда
    // возвращаем главное меню.
    this.startMenuUI?.classList.remove(
      "is-sectors-open",
    );

    // На всякий случай сбрасываем hover
    // оставшейся карточки барабана.
    this.sectorWheel3D?.clearHoveredCard?.();

    if (this.mainView) {
      this.settingsView?.classList.remove(
        "active",
      );

      this.sectorsView?.classList.remove(
        "active",
      );

      this.mainView.classList.add(
        "active",
      );
    }
  }
}
}
