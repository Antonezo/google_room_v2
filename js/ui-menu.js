import { audioManager } from "./audio.js";

export class MenuManager {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher; // Связь с главным UIManager

    // Экраны
this.startMenu = document.getElementById("futuristic-start-menu");
this.mainView = document.getElementById("view-main");
this.sectorsView = document.getElementById("view-sectors");
this.settingsView = document.getElementById("view-settings");

    // Кнопки (исправлены ID под твой HTML!)
   this.btnSectors = document.getElementById("btn-open-sectors");
this.btnSettings = document.getElementById("btn-open-settings");

this.btnBackSectors = document.getElementById("btn-back-sectors");
this.btnBackMain = document.getElementById("btn-back-main");
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
  const highestUnlocked =
    this.ui.cb?.getHighestUnlockedSector?.() ?? 1;

  const currentSector =
    this.ui.cb?.getCurrentSector?.() ?? 1;

  const sectorCards = document.querySelectorAll(".sector-card");

  sectorCards.forEach((card) => {
    const sectorId = Number(card.dataset.sectorId);
    const isUnlocked = sectorId <= highestUnlocked;
    const isCurrent = sectorId === currentSector;

    card.hidden = !isUnlocked;
    card.classList.toggle("current-sector", isCurrent);

    const status = card.querySelector(".sector-status");

    if (status) {
      status.textContent = isCurrent
        ? "ТЕКУЩИЙ СЕКТОР"
        : "ДОСТУПЕН";
    }
  });
}

initBindings() {
// === ЗВУКИ НАВЕДЕНИЯ И КЛИКОВ ДЛЯ ВСЕХ КНОПОК ===
const menuButtons = [
  { id: "btn-start-game", clickSound: "start" },
  { id: "btn-resume-game", clickSound: "start" },
  { id: "btn-restart-sector", clickSound: "start" },
  { id: "btn-open-sectors", clickSound: "click" },
  { id: "btn-open-settings", clickSound: "click" },
  { id: "btn-return-title", clickSound: "click" },
  { id: "btn-exit", clickSound: "click" },
  { id: "btn-back-sectors", clickSound: "click" },
  { id: "btn-back-main", clickSound: "click" },
];

    menuButtons.forEach(item => {
      const btn = document.getElementById(item.id);
      if (btn) {
        // Звук при наведении (играет ТОЛЬКО если браузер уже разблокировал звук после клика)
        btn.addEventListener("mouseenter", () => {
          if (audioManager?.ctx?.state === "running" && !this.ui.isMenuLocked && !this.ui.blockHoverSound) {
            audioManager.playUI("mouse_menu");
          }
        });
        
        // Звук при клике (любой клик автоматически разблокирует звук для браузера)
        btn.addEventListener("click", () => {
          if (audioManager?.playUI) audioManager.playUI(item.clickSound);
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
    if (audioManager?.playUI) {
      audioManager.playUI("click");
    }
  });
});

// === ЗВУКИ НАВЕДЕНИЯ ДЛЯ ПОЛЗУНКОВ (без кнопок внутри языков) ===
    const settingsElements = document.querySelectorAll(
      '#slider-sfx, #slider-music, #btn-toggle-lang' 
    );

    settingsElements.forEach(el => {
      el.addEventListener('mouseenter', () => {
        if (audioManager?.ctx?.state === "running" && !this.ui.isMenuLocked && !this.ui.blockHoverSound) {
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

    if (this.btnBackMain) {
      this.btnBackMain.addEventListener("click", () => {
        toggleView(this.settingsView, this.mainView);
        if (this.btnLang) this.btnLang.classList.remove("open");
      });
    }

    if (this.btnExit) {
      this.btnExit.addEventListener("click", () => {
        this.btnExit.classList.add("show-joke");
        setTimeout(() => this.btnExit.classList.remove("show-joke"), 3000);
      });
    }

    // --- Переключение языков ---
    if (this.btnLang) {
      this.btnLang.addEventListener("click", (e) => {
        const clickedLangBtn = e.target.closest(".lang-btn");

        if (clickedLangBtn && this.btnLang.classList.contains("open")) {
          const lang = clickedLangBtn.dataset.lang;
          this.ui.updateLanguage(lang); // Дергаем метод из главного UIManager

          document
            .querySelectorAll(".lang-btn")
            .forEach((b) => b.classList.remove("active-lang"));
          clickedLangBtn.classList.add("active-lang");

          this.btnLang.classList.remove("open");
          e.stopPropagation();

if (audioManager?.playUI) audioManager.playUI("click");

        } else {
          this.btnLang.classList.toggle("open");
        }
      });
    }

// --- Ползунки громкости ---
    const setupSlider = (slider, valDisplay, funcName, multiplier, playClick = false) => {
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
