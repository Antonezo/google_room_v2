import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";

export class UIManager {
  constructor(callbacks) {
    this.preloadImages([
      "../Image/tablet-2.png",
      "../Image/blinks-eyes-tablet-2.png",
      "../Image/light-tablet-2.png",
    ]);
    this.cb = callbacks;
    this.isMenuLocked = false;
    this.hasRegistered = false;
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
    this.initRegistrationLogic();
  }

  initRegistrationLogic() {
    const input = document.getElementById("player-name-input");
    const btnSubmit = document.getElementById("btn-submit-name");
    const textEl = document.getElementById("reg-dialogue-text");
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");
    const aiceWrap = document.querySelector(".center-aice");

    let tempPlayerName = "";
    this.isHackingRegistration = false; // Стартуем всегда в обычном режиме

    // Вспомогательная функция для анимации логов (5 секунд)
    // Вспомогательная функция для анимации логов (5 секунд)
    const showScanningProcess = async (logType = "standard") => {
      input.disabled = true;
      btnSubmit.style.pointerEvents = "none";
      btnSubmit.style.opacity = "0.5";

      // === МАГИЯ АНИМАЦИИ: МЕНЯЕМ СПРАЙТ ===
      // Находим наши слои картинок в HTML
      const baseLayer = aiceWrap.querySelector(".base-layer");
      const eyesLayer = aiceWrap.querySelector(".tablet-eyes-layer");
      const beaconLayer = aiceWrap.querySelector(".beacon-layer");

      // Меняем картинки на позу "Смотрит в планшет"
      if (baseLayer) baseLayer.src = "../Image/tablet-1.png";
      if (eyesLayer) eyesLayer.style.display = "none"; // Прячем слой с открытыми глазами
      if (beaconLayer) {
        beaconLayer.src = "../Image/light-tablet-1.png";
        beaconLayer.classList.add("fast-pulse"); // Включаем режим бешеной лампочки
      }
      // =====================================

      const logs =
        logType === "hacking"
          ? [
              "FORCE_OPEN_DB...",
              "BYPASSING_ID...",
              "INJECTING_NAME...",
              "DELETING_OLD_USER...",
              "CLEANING_LOGS...",
            ]
          : [
              "HSH_KEY_GEN...",
              "UPLOADING...",
              "CALCULATING...",
              "BYPASSING...",
              "VERIFYING...",
            ];

      textEl.innerHTML =
        (logType === "hacking"
          ? "ПРИНУДИТЕЛЬНЫЙ ВЗЛОМ БАЗЫ"
          : "СВЯЗЬ С КВАНТОВЫМ СЕРВЕРОМ") + "<span class='bios-cursor'></span>";

      // Бежим по логам
      for (let i = 0; i < logs.length; i++) {
        await new Promise((res) => setTimeout(res, 1000));
        input.value = logs[i];
        if (typeof audioManager !== "undefined" && audioManager.playBiosBeep)
          audioManager.playBiosBeep();
      }
      await new Promise((res) => setTimeout(res, 500));

      // === МАГИЯ АНИМАЦИИ: ВОЗВРАЩАЕМ КАК БЫЛО ===
      // Как только логи закончились, Айс поднимает глаза на игрока
      if (baseLayer) baseLayer.src = "../Image/tablet-2.png";
      if (eyesLayer) eyesLayer.style.display = ""; // Снова показываем глаза
      if (beaconLayer) {
        beaconLayer.src = "../Image/light-tablet-2.png";
        beaconLayer.classList.remove("fast-pulse"); // Выключаем бешеное мигание
      }
      // ===========================================
    };
    // ГЛАВНАЯ ЛОГИКА ПРОВЕРКИ (Обычный режим)
    const runRegistrationFlow = async () => {
      tempPlayerName = input.value.trim();
      if (!tempPlayerName || tempPlayerName.includes("...")) return;

      await showScanningProcess("standard");

      const lowerName = tempPlayerName.toLowerCase();

      // Пасхалки
      if (lowerName === "айс" || lowerName === "aice") {
        input.value = "СИСТЕМНАЯ АНОМАЛИЯ";
        input.classList.add("error-mode");
        await this.typeText(
          textEl,
          "Подожди... Ты Айс? Но Я Айс! Нас двое? Это сбой в квантовом реестре?! Ладно, Айс-младший, заходи, но чур я главный!",
          30,
        );
        this.finishRegistration(tempPlayerName);
        return;
      }

      if (lowerName === "друг") {
        input.value = "ДОСТУП РАЗРЕШЕН";
        await this.typeText(
          textEl,
          "О, решил сразу облегчить мне задачу? Уважаю! Добро пожаловать в систему, Друг!",
          30,
        );
        this.finishRegistration("Друг");
        return;
      }

      // Если обычное имя — выдаем ошибку
      if (typeof audioManager !== "undefined" && audioManager.playHitSound)
        audioManager.playHitSound(15, false);
      input.classList.add("error-mode");
      input.value = "ОШИБКА: ИМЯ ЗАНЯТО";

      const beacon = aiceWrap.querySelector(".beacon-layer");
      if (beacon)
        beacon.style.filter =
          "hue-rotate(130deg) drop-shadow(0 0 15px red) brightness(1.5)";

      // Замени старую строку на эту:
      await this.typeText(
        textEl,
        `Критическая ошибка базы! Имя "${tempPlayerName}" уже занято... подопытным хомяком из отдела биологии. Слушай, давай я буду звать тебя просто "Друг"? Не хватало еще путаницы в графике кормления.`,
        30,
      );
      inputGroup.classList.add("hidden");
      choiceGroup.classList.remove("hidden");
    };

    // ХАКЕРСКАЯ ЛОГИКА (Вторая попытка)
    const runHackingFlow = async () => {
      await showScanningProcess("hacking");

      input.value = "ВЗЛОМ УСПЕШЕН";
      await this.typeText(
        textEl,
        `Ну вот, пришлось попотеть! Доступ разрешен. Добро пожаловать, ${tempPlayerName}!`,
        30,
      );
      this.finishRegistration(tempPlayerName);
    };

    // === ЕДИНЫЙ ОБРАБОТЧИК КЛИКОВ ===
    // Он сам решает, какую функцию запустить, глядя на флаг
    const submitHandler = () => {
      if (input.disabled) return;
      if (this.isHackingRegistration) {
        runHackingFlow();
      } else {
        runRegistrationFlow();
      }
    };

    // ВЕШАЕМ СОБЫТИЯ ОДИН РАЗ И НАВСЕГДА
    btnSubmit.onclick = submitHandler;
    input.onkeypress = (e) => {
      if (e.key === "Enter") submitHandler();
    };

    // КНОПКА "СОГЛАСЕН НА ДРУГА"
    document
      .getElementById("btn-accept-friend")
      .addEventListener("click", async () => {
        choiceGroup.classList.add("hidden");
        await this.typeText(
          textEl,
          "Спасибо, что облегчил мне задачу!",
          30,
        );
        this.finishRegistration("Друг");
      });

    // КНОПКА "ХОЧУ СВОЁ ИМЯ" (Включаем хакерский режим)
    document
      .getElementById("btn-reject-friend")
      .addEventListener("click", async () => {
        choiceGroup.classList.add("hidden");
        const beacon = aiceWrap.querySelector(".beacon-layer");
        if (beacon) beacon.style.filter = "";

        await this.typeText(
          textEl,
          "Понял, настаиваешь на своем! Сейчас попробую обойти защиту и вычеркнуть хомяка из реестра... Жми ввод еще раз, я протолкну это имя в базу.",
          30,
        );
        input.classList.remove("error-mode");
        input.disabled = false;
        input.value = tempPlayerName;
        btnSubmit.style.pointerEvents = "auto";
        btnSubmit.style.opacity = "1";
        inputGroup.classList.remove("hidden");

        // ВАЖНО: Включаем режим взлома. Теперь submitHandler запустит runHackingFlow
        this.isHackingRegistration = true;
      });
  }

// Общий финал регистрации
  async finishRegistration(finalName) {
    this.isRegistrationComplete = true;
    if (store && typeof store.update === "function") {
      store.update({ playerName: finalName });
    }

    await new Promise((res) => setTimeout(res, 1500));

    const modal = document.getElementById("registration-modal");
    if (modal) {
      modal.style.opacity = "0";
      setTimeout(() => modal.classList.add("hidden"), 300);
    }

    // === ИНТЕГРАЦИЯ ИМЕНИ В HUD ===
    const userBadge = document.getElementById("hud-user-status");
    const userNameText = document.getElementById("hud-user-name");

    if (userBadge && userNameText) {
      const prefix = this.isHackingRegistration ? "ROOT" : "USER";
      userNameText.innerText = `${prefix}: ${finalName.toUpperCase()}`;
      userBadge.classList.remove("hidden");
    }

    this.unlockFeature("feature-equipment");
    this.unlockFeature("feature-word");
    this.unlockFeature("feature-physics");

    const bottomContainer = document.getElementById("aice-dialogue-container");
    const bottomAiceWrap = bottomContainer.querySelector(".aice-portrait-wrap");

    if (bottomContainer && bottomAiceWrap) {
      bottomAiceWrap.style.opacity = "1";
      bottomContainer.classList.remove("hidden");

      if (typeof audioManager !== "undefined" && audioManager.playUI) {
        audioManager.playUI("pop");
      }

      const textEl = document.getElementById("aice-dialogue-text");

      // === АРХИТЕКТУРНЫЙ ФИКС: Ожидание клика по панели ===
      const waitForClick = () => new Promise(resolve => {
        const handler = () => {
          bottomContainer.removeEventListener("click", handler);
          resolve();
        };
        // Небольшая задержка, чтобы клик, открывший диалог, не пролистал его мгновенно
        setTimeout(() => bottomContainer.addEventListener("click", handler), 100);
      });

   // --- ФРАЗА 1: Знакомство ---
      let phrase1 = "";
      const lowerName = finalName.toLowerCase();
      
      // Массив "пасхалочных" имен. Сюда в будущем можно легко добавлять новые!
      const specialNames = ["друг", "айс", "aice"];

      // Проверяем, есть ли имя игрока в списке особых
      if (specialNames.includes(lowerName)) {
        // Сценарий для особых имен (без сарказма)
        // ${finalName} подставит то имя, которое мы передали (Друг, Айс и т.д.)
        phrase1 = `Что ж, официально посвящаю тебя в пользователи этой системы. Добро пожаловать, ${finalName}!`;
      } else {
        // Сценарий для обычных и "взломанных" имен
        phrase1 = `Ну вот и познакомились, друг ${finalName}!`;
      }

      await this.typeText(textEl, phrase1, 35);
      
      // ЖДЕМ КЛИК ИГРОКА
      await waitForClick();

      // --- ФРАЗА 2: Акцент на статус ---
      // Здесь всё остается так же, с пульсацией и стрелкой
      const statusType = this.isHackingRegistration ? "администратора" : "пользователя";
      await this.typeText(textEl, `Обрати внимание в правый верхний угол. Твой статус ${statusType} зафиксирован в системе.`, 35);

      // Включаем пульсацию и стрелку прямо во время этой фразы
      let arrow;
      if (userBadge) {
        userBadge.classList.add("user-badge-highlight");
        arrow = document.createElement("div");
        arrow.className = "status-arrow-hint";
        arrow.innerHTML = "↑";
        userBadge.appendChild(arrow);
      }

      // СНОВА ЖДЕМ КЛИК ИГРОКА!
      await waitForClick();

      // Как только игрок кликнул, убираем спецэффекты с плашки
      if (userBadge) {
        userBadge.classList.remove("user-badge-highlight");
        if (arrow) {
          arrow.style.opacity = "0";
          setTimeout(() => arrow.remove(), 500);
        }
      }

      // --- ФРАЗА 3: Переход к действию ---
      await this.typeText(textEl, "А теперь к делу. Попробуй заспавнить пару объектов через голографическое меню справа.", 35);
      // После этой фразы клик можно не ждать, игрок пойдет нажимать кнопки меню
    }
  }
  // Сбрасываем форму регистрации в заводское состояние
  resetRegistrationForm() {
    const input = document.getElementById("player-name-input");
    const btnSubmit = document.getElementById("btn-submit-name");
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");
    const textEl = document.getElementById("reg-dialogue-text");
    const aiceWrap = document.querySelector(".center-aice");

    if (!input) return;

    // Сбрасываем флаг хакерского режима!
    this.isHackingRegistration = false;

    // Очищаем и разблокируем инпут
    input.value = "";
    input.disabled = false;
    input.classList.remove("error-mode");

    // Возвращаем кнопку в рабочее состояние
    if (btnSubmit) {
      btnSubmit.style.pointerEvents = "auto";
      btnSubmit.style.opacity = "1";
    }

    // Показываем строку ввода, прячем кнопки выбора
    if (inputGroup) inputGroup.classList.remove("hidden");
    if (choiceGroup) choiceGroup.classList.add("hidden");

    // Гасим красную лампу
    if (aiceWrap) {
      const beacon = aiceWrap.querySelector(".beacon-layer");
      if (beacon) beacon.style.filter = "";
    }

    // Очищаем текст
    if (textEl) textEl.innerHTML = "";
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

          document
            .querySelectorAll(".lang-btn")
            .forEach((b) => b.classList.remove("active-lang"));
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

              // === ВОЗВРАЩАЕМ ПЛАШКУ С ИМЕНЕМ ===
              const userBadge = document.getElementById("hud-user-status");
              if (userBadge) userBadge.classList.remove("hidden");
              // ==================================

              this.animTimers.aice = setTimeout(() => {
                // Эту фразу мы ОСТАВЛЯЕМ! Она звучит, если игрок вернулся из меню
                this.showAiceDialogue(
                  "С возвращением. Системы в режиме ожидания.",
                );
              }, 1500);
            } else {
              // === НАЧАЛО: НОВАЯ ИГРА И ЗНАКОМСТВО ===
              this.isRegistrationComplete = false;
              // Моргаем светом, показываем HUD
              if (this.cb && this.cb.onFlickerLights) this.cb.onFlickerLights();
              el.hudControls.classList.remove("hud-hidden");

              this.animTimers.aice = setTimeout(() => {
                // === ФИКС ЗВУКА: Выкатываем панель со звуком "pop" ===
                const bottomContainer = document.getElementById(
                  "aice-dialogue-container",
                );
                if (bottomContainer) {
                  bottomContainer.classList.remove("hidden"); // Плавно выкатываем
                  if (
                    typeof audioManager !== "undefined" &&
                    audioManager.playUI
                  ) {
                    audioManager.playUI("pop"); // Играем звук!
                  }
                }

                // Берем нужные фразы
                const introPhrases = translations[this.currentLang].introDialog;

                this.runDialogueSequence(introPhrases, async () => {
                  // Архитектурная защита от двойного клика
                  if (this.hasRegistered) return;
                  this.hasRegistered = true;

                  // 1. Прячем нижнюю панель диалога перед полетом
                  if (bottomContainer) bottomContainer.classList.add("hidden");

                  // 2. Запускаем полет клона!
                  await this.executeTransferToCenter();

                  // 3. Как только Айс приземлился в центре, печатаем текст
                  const textEl = document.getElementById("reg-dialogue-text");
                  if (textEl) {
                    await this.typeText(
                      textEl,
                      "Введи свое имя в терминал. Постарайся без опечаток, я высекаю это в квантовом реестре.",
                      35,
                    );
                  }

                  // 4. Показываем поле ввода игроку
                  const inputGroup = document.getElementById("reg-input-group");
                  if (inputGroup) {
                    inputGroup.classList.remove("hidden");
                  }
                });
              }, 800);
              // === КОНЕЦ: НОВАЯ ИГРА И ЗНАКОМСТВО ===
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
      this.hasRegistered = false;
      this.clearAnimTimers();
      document.body.classList.add("loading");
      if (el.hudControls) el.hudControls.classList.add("hud-hidden");

      // === НАШ НОВЫЙ БЛОК: Прячем нижнего Айса и чистим его прозрачность ===
      const aicePanel = document.getElementById("aice-dialogue-container");
      if (aicePanel) {
        aicePanel.classList.add("hidden");
        const bottomAiceWrap = aicePanel.querySelector(".aice-portrait-wrap");
        if (bottomAiceWrap) bottomAiceWrap.style.opacity = "";
      }

      // === ПРЯЧЕМ ИМЯ ИГРОКА ПРИ ВЫХОДЕ В МЕНЮ ===
      const userBadge = document.getElementById("hud-user-status");
      if (userBadge) {
        userBadge.classList.add("hidden");
      }
      // ==========================================

      // === НАШ НОВЫЙ БЛОК: Прячем регистрацию и вызываем "дворника" ===
      const regModal = document.getElementById("registration-modal");
      if (regModal) {
        regModal.style.opacity = "0";
        regModal.classList.add("hidden");
        if (typeof this.resetRegistrationForm === "function") {
          this.resetRegistrationForm();
        }
      }
      // ==============================================================

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

      if (el.btnResume) {
        if (this.isRegistrationComplete) {
          el.btnResume.style.display = "flex";
        } else {
          el.btnResume.style.display = "none";
        }
      }
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

  preloadImages(urls) {
    urls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
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

  async executeTransferToCenter() {
    const bottomAiceWrap = document.querySelector(
      "#aice-dialogue-container .aice-portrait-wrap",
    );
    const centerModal = document.getElementById("registration-modal");
    const centerAiceWrap = centerModal.querySelector(".center-aice");

    // 1. Узнаем, где сейчас находится нижний Айс
    const startRect = bottomAiceWrap.getBoundingClientRect();

    // 2. Делаем центральную модалку блочной, но прозрачной (чтобы узнать, куда лететь)
    centerModal.classList.remove("hidden");
    const targetRect = centerAiceWrap.getBoundingClientRect();

    // 3. Создаем Призрака (копируем нижнего Айса)
    const ghost = bottomAiceWrap.cloneNode(true);
    ghost.classList.add("aice-ghost");
    // Отключаем анимацию парения, чтобы он не дергался в полете
    ghost.style.animation = "none";

    // Ставим призрака ровно поверх оригинала
    ghost.style.left = `${startRect.left}px`;
    ghost.style.top = `${startRect.top}px`;
    ghost.style.width = `${startRect.width}px`;
    ghost.style.height = `${startRect.height}px`;
    ghost.style.margin = "0";

    document.body.appendChild(ghost);

    // 4. Прячем оригинал нижнего Айса
    bottomAiceWrap.style.opacity = "0";

    // 5. Запускаем полет
    // Ждем один кадр, чтобы браузер применил начальные координаты
    await new Promise((res) => requestAnimationFrame(res));

    // Вычисляем, насколько нужно сдвинуть и уменьшить призрака
    const translateX = targetRect.left - startRect.left;
    const translateY = targetRect.top - startRect.top;
    const scaleX = targetRect.width / startRect.width;
    const scaleY = targetRect.height / startRect.height;

    // Звук перелета (вжииих)
    if (audioManager?.playUI) audioManager.playUI("pop");

    // Отправляем призрака в полет
    ghost.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;

    // Ждем 800мс (время транзиции из CSS)
    await new Promise((res) => setTimeout(res, 800));

    // 6. МАГИЯ ПОДМЕНЫ
    // Делаем центральное окно видимым (появляется Айс с планшетом)
    centerModal.style.opacity = "1";

    // Удаляем призрака
    ghost.remove();

    // Теперь можно запускать печать текста в центральном окне!
    // const textEl = document.getElementById("reg-dialogue-text");
    // this.typeText(textEl, "Введи свое имя в терминал. Постарайся без опечаток, я высекаю это в квантовом реестре.", 30);
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
    const textElement = aicePanel
      ? aicePanel.querySelector(".aice-dialogue-text")
      : null;

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
      await new Promise((resolve) => {
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
