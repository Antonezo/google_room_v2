import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { CONFIG } from "./config.js";

export class GameHudManager {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher; // Ссылка на главный UIManager, чтобы дергать его коллбэки

    this.activePaletteTarget = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.isPainting = false;
    this.sprayLoop = null;

    // Собираем все элементы HUD
    this.elements = {
      hudControls: document.getElementById("hud-controls"),
      userBadge: document.getElementById("hud-user-status"),
      holoWrapper: document.getElementById("holo-wrapper"),
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
    };

// НОВЫЙ БЛОК: Скрываем плашку, если дебаг выключен
    if (!CONFIG.DEBUG_MODE && this.elements.userBadge) {
      this.elements.userBadge.style.display = "none";
    }

    this.initBindings();
    this.initStoreSubscriptions();
  }

  // --- ЛОГИКА ИНСТРУМЕНТОВ И ПАЛИТРЫ ---
  closePalette() {
    document
      .querySelectorAll(".palette-container")
      .forEach((p) => p.classList.remove("open"));
    if (this.elements.btnMag)
      this.elements.btnMag.classList.remove("is-selecting");
    if (this.elements.btnPaint)
      this.elements.btnPaint.classList.remove("is-selecting");
    this.activePaletteTarget = null;
  }

  openPalette(target) {
    this.closePalette();
    this.activePaletteTarget = target;
    const palette = document.querySelector(`.${target}-palette`);
    if (palette) palette.classList.add("open");

    if (this.elements.btnMag)
      this.elements.btnMag.classList.toggle("is-selecting", target === "mag");
    if (this.elements.btnPaint)
      this.elements.btnPaint.classList.toggle(
        "is-selecting",
        target === "paint",
      );
  }

  // --- ЛОГИКА ЭФФЕКТОВ (Спрей) ---
  startSprayEffect() {
    if (this.sprayLoop) return;
    const emit = () => {
      const colorIdx = store.get().paintToolColor;
      if (this.isPainting && colorIdx !== -1) {
        if (this.ui.cb && typeof this.ui.cb.onSpray === "function") {
          this.ui.cb.onSpray(this.mouseX, this.mouseY, colorIdx);
        }
        this.sprayLoop = requestAnimationFrame(emit);
      } else {
        this.sprayLoop = null;
      }
    };
    if (this.isPainting && store.get().paintToolColor !== -1) {
      this.sprayLoop = requestAnimationFrame(emit);
    }
  }

  // --- ОБНОВЛЕНИЕ UI (Вызываются извне) ---
  updateBeadCounter(current, max) {
    if (this.elements.beadCount)
      this.elements.beadCount.textContent = `${current}/${max}`;
  }

  updateFanProgress(level) {
    if (this.elements.btnFans)
      this.elements.btnFans.style.setProperty("--prog", level * 100 + "%");
  }

  setLettersActive(isActive) {
    if (this.elements.btnLetters)
      this.elements.btnLetters.classList.toggle("active-state", isActive);
  }

  lockLetters(isLocked) {
    if (!this.elements.btnLetters) return;
    const wrapper = this.elements.btnLetters.closest(".combo-wrapper");
    if (wrapper) wrapper.classList.toggle("locked", isLocked);
    if (isLocked) this.elements.btnLetters.classList.remove("active-state");

    if (this.elements.wordInput) {
      this.elements.wordInput.disabled = isLocked;
      this.elements.wordInput.style.opacity = isLocked ? "0.3" : "1";
      this.elements.wordInput.style.pointerEvents = isLocked ? "none" : "auto";
    }
  }

  triggerApplyWord() {
    if (!this.elements.wordInput) return;
    let newWord = this.elements.wordInput.value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (newWord.length === 0) newWord = "GOOGLE";
    if (newWord.length > 8) newWord = newWord.substring(0, 8);
    this.elements.wordInput.value = newWord;

    // Передаем слово в движок через коллбэк главного UIManager
    if (this.ui.cb?.onApplyWord) this.ui.cb.onApplyWord(newWord);
  }

  resetWordInput() {
    if (this.elements.wordInput) {
      this.elements.wordInput.value = "GOOGLE";
    }
    if (this.ui.cb?.onApplyWord) {
      this.ui.cb.onApplyWord("GOOGLE");
    }
  }

  // --- ИНИЦИАЛИЗАЦИЯ КЛИКОВ И СОБЫТИЙ ---
  initBindings() {
    // 1. Мышь для спрея
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

    // Сброс инструмента на ПКМ
    window.addEventListener("contextmenu", (e) => {
      if (store.get().currentTool !== -1 || store.get().paintToolColor !== -1) {
        e.preventDefault();
        store.update({ currentTool: -1, paintToolColor: -1 });
      }
    });

    // 2. Клики мимо палитры
    document.addEventListener("click", (e) => {
      const btnOrLink = e.target.closest(
        "button, .hud-btn, .icon-btn, .holo-btn, .mode-btn, .mag-main-btn, .palette-color-btn",
      );
      if (btnOrLink) btnOrLink.blur();

      if (this.activePaletteTarget && !e.target.closest(".equipment-rack")) {
        this.closePalette();
      }
    });

    // 4. Ввод слова
    if (this.elements.wordInput) {
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
    }

    // 5. Кнопки панели (биндим через атрибут data-action)
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
      const isEnabled = this.ui.cb?.onToggleLetters
        ? this.ui.cb.onToggleLetters()
        : false;
      this.setLettersActive(isEnabled);
    });

    bindAction('[data-action="returnLetters"]', () =>
      this.ui.cb?.onReturnLetters?.(),
    );
    bindAction('[data-action="spawnBalls"]', () =>
      this.ui.cb?.onSpawnBalls?.(),
    );
    bindAction('[data-action="clearBalls"]', () =>
      this.ui.cb?.onShrinkBalls?.(),
    );
    bindAction('[data-action="toggleFans"]', () =>
      this.ui.cb?.onToggleFans?.(),
    );

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

    // 6. Выбор цвета в палитре
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

    // 7. Кнопка Рестарта на экране
    if (this.elements.btnRestart) {
      this.elements.btnRestart.addEventListener("click", () => {
        if (this.ui.cb?.onReset) this.ui.cb.onReset();
        if (audioManager?.playUI) audioManager.playUI("click");
      });
    }
  }

  // --- ПОДПИСКА НА ИЗМЕНЕНИЯ СОСТОЯНИЯ ---
  initStoreSubscriptions() {
    store.subscribe((state) => {
      document
        .getElementById("mode-lab")
        ?.classList.toggle("active", state.mode === "lab");
      document
        .getElementById("mode-disco")
        ?.classList.toggle("active", state.mode === "disco");
      if (this.elements.btnSlow)
        this.elements.btnSlow.classList.toggle("active-state", state.isSlowMo);

      // Магнит
      const magMainBtn = this.elements.btnMag;
      if (magMainBtn) {
        magMainBtn.className = "mag-main-btn";
        document.body.className = document.body.className
          .replace(/tool-mag-\d/g, "")
          .trim();
        if (state.currentTool !== -1) {
          document.body.classList.add(`tool-mag-${state.currentTool}`);
          magMainBtn.classList.add(`mag-color-${state.currentTool}`);
        }
      }

      // Краска
      const paintBtn = this.elements.btnPaint;
      if (paintBtn) {
        paintBtn.className = "mag-main-btn paint-btn";
        document.body.className = document.body.className
          .replace(/tool-paint-\d/g, "")
          .trim();
        if (state.paintToolColor !== -1) {
          document.body.classList.add(`tool-paint-${state.paintToolColor}`);
          paintBtn.classList.add(`paint-color-${state.paintToolColor}`);
        }
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
