import { audioManager } from "./audio.js";

export class MenuManager {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher; // Связь с главным UIManager

    // Экраны
    this.startMenu = document.getElementById("futuristic-start-menu");
    this.mainView = document.getElementById("view-main");
    this.settingsView = document.getElementById("view-settings");

    // Кнопки (исправлены ID под твой HTML!)
    this.btnSettings = document.getElementById("btn-open-settings");
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

initBindings() {
// === ЗВУКИ НАВЕДЕНИЯ И КЛИКОВ ДЛЯ ВСЕХ КНОПОК ===
    const menuButtons = [
      { id: "btn-start-game", clickSound: "start" },
      { id: "btn-resume-game", clickSound: "start" },
      { id: "btn-open-settings", clickSound: "click" },
      { id: "btn-exit", clickSound: "click" },
      { id: "btn-back-main", clickSound: "click" }
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

    // --- Навигация по меню ---
    const toggleView = (hideView, showView) => {
      this.ui.blockHoverSound = true;
      setTimeout(() => (this.ui.blockHoverSound = false), 500);
      hideView.classList.remove("active");
      showView.classList.add("active");
    };

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
        } else {
          this.btnLang.classList.toggle("open");
        }
      });
    }

    // --- Ползунки громкости ---
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

      // Звук клика при отпускании ползунка
      slider.addEventListener("change", () => {
        if (typeof audioManager !== "undefined" && audioManager.playUI) {
          audioManager.playUI("click");
        }
      });
    };

    setupSlider(this.sliderSfx, this.valSfx, "setSfxVolume", 2.0);
    setupSlider(this.sliderMusic, this.valMusic, "setMusicVolume", 1.5);
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
      if (this.mainView && this.settingsView) {
        this.settingsView.classList.remove("active");
        this.mainView.classList.add("active");
      }
    }
  }
}
