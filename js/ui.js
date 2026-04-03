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
    this._currentDialogueResolve = null;

    // Централизованное хранилище всех таймеров для чистой отмены
    this.animTimers = {
      enter1: null,
      enter2: null,
      exit: null,
      scratch: null,
      biosSequence: null,
      biosType: null,
      typewriter: null,
      aice: null,
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
    const modal = document.getElementById("registration-modal");

    let tempPlayerName = "";
    this.isHackingRegistration = false;

    const showScanningProcess = async (logType = "standard") => {
      input.disabled = true;
      btnSubmit.style.pointerEvents = "none";
      btnSubmit.style.opacity = "0.5";

      const baseLayer = aiceWrap.querySelector(".base-layer");
      const eyesLayer = aiceWrap.querySelector(".tablet-eyes-layer");
      const beaconLayer = aiceWrap.querySelector(".beacon-layer");

      if (baseLayer) baseLayer.src = "../Image/tablet-1.png";
      if (eyesLayer) eyesLayer.style.display = "none";
      if (beaconLayer) {
        beaconLayer.src = "../Image/light-tablet-1.png";
        beaconLayer.classList.add("fast-pulse");
      }

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

      const lang = this.currentLang || "RU";
      const t = translations[lang];

      textEl.innerHTML =
        (logType === "hacking" ? t.regHacking : "SCANNING SYSTEM...") +
        "<span class='bios-cursor'></span>";

      for (let i = 0; i < logs.length; i++) {
        await new Promise((res) => setTimeout(res, 800));
        input.value = logs[i];
        if (typeof audioManager !== "undefined" && audioManager.playBiosBeep)
          audioManager.playBiosBeep();
      }

      if (baseLayer) baseLayer.src = "../Image/tablet-2.png";
      if (eyesLayer) eyesLayer.style.display = "";
      if (beaconLayer) {
        beaconLayer.src = "../Image/light-tablet-2.png";
        beaconLayer.classList.remove("fast-pulse");
      }
    };

    const runRegistrationFlow = async () => {
   const t = translations[this.currentLang];
      let rawName = input.value.trim();
      if (!rawName || rawName.includes("...")) return;
      
      // Делаем первую букву заглавной сразу для всех последующих диалогов!
      tempPlayerName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

      await showScanningProcess("standard");

      const lowerName = tempPlayerName.toLowerCase();
      const isAice = ["айс", "aice"].includes(lowerName);
      const isFriend = ["друг", "friend", "buddy", "bro"].includes(lowerName);

      if (isAice) {
        input.value = "ANOMALY";
        input.classList.add("error-mode");
        await this.typeText(textEl, t.regPhraseAice, 30);
        await this.finishRegistration(tempPlayerName);
        return;
      }

      if (isFriend) {
        input.value = t.regSuccess;
        await this.typeText(textEl, t.regPhraseFriend, 30);
       await this.finishRegistration(t.friendName);
        return;
      }

      // Обычное имя
      if (typeof audioManager !== "undefined" && audioManager.playHitSound)
        audioManager.playHitSound(15, false);
      input.classList.add("error-mode");
      input.value = t.regErrorTaken;

      const beacon = aiceWrap.querySelector(".beacon-layer");
      if (beacon)
        beacon.style.filter =
          "hue-rotate(130deg) drop-shadow(0 0 15px red) brightness(1.5)";

      await this.typeText(textEl, t.regPhraseTaken(tempPlayerName), 30);
      inputGroup.classList.add("hidden");
      choiceGroup.classList.remove("hidden");
    };

    const runHackingFlow = async () => {
      const t = translations[this.currentLang];
      await showScanningProcess("hacking");
      input.value = t.regHackSuccess;
      await this.typeText(textEl, t.regPhraseHacked(tempPlayerName), 30);
      await this.finishRegistration(tempPlayerName);
    };

    const submitHandler = () => {
      if (input.disabled) return;
      if (this.isHackingRegistration) runHackingFlow();
      else runRegistrationFlow();
    };

    btnSubmit.onclick = submitHandler;
    input.onkeypress = (e) => {
      if (e.key === "Enter") submitHandler();
    };

    document.getElementById("btn-accept-friend").onclick = async () => {
      const t = translations[this.currentLang];
      choiceGroup.classList.add("hidden");
      await this.typeText(textEl, t.regPhraseAcceptFriend, 30);
     await this.finishRegistration(t.friendName);
    };

   document.getElementById("btn-reject-friend").onclick = async () => {
      choiceGroup.classList.add("hidden");
      const beacon = aiceWrap.querySelector(".beacon-layer");
      if (beacon) beacon.style.filter = "";
      
      const t = translations[this.currentLang]; // Получаем текущий словарь
      await this.typeText(textEl, t.regOverride, 30); // Используем фразу из словаря
      
      input.classList.remove("error-mode");
      input.disabled = false;
      input.value = tempPlayerName;
      btnSubmit.style.pointerEvents = "auto";
      btnSubmit.style.opacity = "1";
      inputGroup.classList.remove("hidden");
      this.isHackingRegistration = true;
    };
  }

resetRegistrationForm() {
    const input = document.getElementById("player-name-input");
    const btnSubmit = document.getElementById("btn-submit-name");
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");
    const textEl = document.getElementById("reg-dialogue-text");

    if (input) {
      input.value = "";
      input.disabled = false;
      input.classList.remove("error-mode");
    }
    if (btnSubmit) {
      btnSubmit.style.pointerEvents = "auto";
      btnSubmit.style.opacity = "1";
    }
    if (inputGroup) inputGroup.classList.add("hidden");
    if (choiceGroup) choiceGroup.classList.add("hidden");
    if (textEl) textEl.innerHTML = "";

    this.isHackingRegistration = false;
  }

async finishRegistration(rawName) {
    const finalName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
    
    const modal = document.getElementById("registration-modal");
    const finalGroup = document.getElementById("reg-final-group");
    const btnFinal = document.getElementById("btn-final-confirm");
    
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");

    // 1. Прячем всё лишнее, показываем кнопку СПАСИБО
    if (inputGroup) inputGroup.classList.add("hidden");
    if (choiceGroup) choiceGroup.classList.add("hidden");
    if (finalGroup) finalGroup.classList.remove("hidden");

 // 2. Ждем клика по кнопке СПАСИБО
    if (btnFinal && finalGroup) {
      await new Promise((resolve) => {
        btnFinal.onclick = () => {
          if (typeof audioManager !== "undefined" && audioManager.playUI) audioManager.playUI("click");
          finalGroup.classList.add("hidden");
          
          if (modal) {
            modal.style.opacity = ""; 
            modal.classList.add("hidden"); // Окно начинает растворяться
          }
          
          resolve(); // Отпускаем промис!
        };
      });
    }

    // Сохраняем имя
    if (store?.update) store.update({ playerName: finalName });

    // === ЗАПУСКАЕМ ПОЛЕТ АЙСА ОБРАТНО ===
    await this.executeTransferToBottom();

    if (!this.isMenuLocked) return; 

    // Чистим текст для будущих запусков
    if (modal) {
      const textEl = document.getElementById("reg-dialogue-text");
      if (textEl) textEl.innerHTML = "";
    }

    const userBadge = document.getElementById("hud-user-status");
    const userNameText = document.getElementById("hud-user-name");
    const bottomContainer = document.getElementById("aice-dialogue-container");
    const bottomAiceWrap = bottomContainer?.querySelector(".aice-portrait-wrap");

    // Показываем плашку с именем
    if (userBadge && userNameText) {
      const prefix = this.isHackingRegistration ? "ROOT" : "USER";
      userNameText.innerText = `${prefix}: ${finalName.toUpperCase()}`;
      userBadge.classList.remove("hidden");
    }

    this.unlockFeature("feature-equipment");
    this.unlockFeature("feature-word");
    this.unlockFeature("feature-physics");

    // 4. Запускаем нижнего Айса
    if (bottomContainer && bottomAiceWrap) {
      bottomContainer.classList.remove("hidden");
      bottomAiceWrap.style.opacity = "1";
      
      // ВАЖНО: Новое имя переменной, чтобы не крашился скрипт!
      const bottomTextEl = document.getElementById("aice-dialogue-text");

      const waitForClick = () => new Promise(res => {
        this._currentDialogueResolve = res; 
        const h = () => { 
          bottomContainer.removeEventListener("click", h); 
          if (this._currentDialogueResolve === res) this._currentDialogueResolve = null;
          res(); 
        };
        setTimeout(() => bottomContainer.addEventListener("click", h), 100);
      });

      const getDict = () => translations[this.currentLang];
      const lowerName = finalName.toLowerCase();
      const specialNames = ["друг", "айс", "aice", "friend", "buddy"];
      
      let phrase1 = specialNames.includes(lowerName) ? getDict().regFinalSpecial(finalName) : getDict().regFinalSarcasm(finalName);

      await this.typeText(bottomTextEl, phrase1, 35);
      await waitForClick();
      
      if (!this.isMenuLocked) return;

      const statusWord = this.isHackingRegistration ? getDict().statusAdmin : getDict().statusUser;
      
      if (userBadge) {
        userBadge.classList.add("user-badge-highlight");
        const arrow = document.createElement("div");
        arrow.className = "status-arrow-hint";
        arrow.innerHTML = "↑";
        userBadge.appendChild(arrow);
      }

      await this.typeText(bottomTextEl, getDict().regFinalStatus(statusWord), 35);
      await waitForClick();
      
      if (!this.isMenuLocked) return;

      if (userBadge) {
        userBadge.classList.remove("user-badge-highlight");
        userBadge.querySelector(".status-arrow-hint")?.remove();
      }

      await this.typeText(bottomTextEl, getDict().regFinalAction, 35);
      
      this.isRegistrationComplete = true;
    }
  }

  updateLanguage(lang) {
    this.currentLang = lang;
    const t = translations[lang];
    const el = this.elements;

  // Перевод инпута регистрации, если он сейчас активен
    const regInput = document.getElementById("player-name-input");
    if (regInput && regInput.disabled) {
      // Если в инпуте была надпись "Доступ разрешен" на старом языке - меняем на новый
      if (
        regInput.value === translations.EN.regSuccess ||
        regInput.value === translations.RU.regSuccess
      ) {
        regInput.value = t.regSuccess;
      }
    }

    // Перевод таблички с именем персонажа (АЙС / AICE)
    const nameplate = document.querySelector('.aice-nameplate .name-text');
    if (nameplate) {
      nameplate.textContent = lang === 'RU' ? 'АЙС' : 'AICE';
    }

    // Дальше идет твой старый код перевода кнопок:
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
    // --- ПЕРЕВОД ЭЛЕМЕНТОВ ОКНА РЕГИСТРАЦИИ ---
    const regTitle = document.querySelector('.registration-form .section-title');
    if (regTitle) regTitle.textContent = t.regTerminalTitle;

    const nameInput = document.getElementById("player-name-input");
    if (nameInput) nameInput.placeholder = t.regPlaceholder;

    const btnAccept = document.getElementById("btn-accept-friend");
    if (btnAccept) btnAccept.textContent = t.btnAcceptFriend;

    const btnReject = document.getElementById("btn-reject-friend");
    if (btnReject) btnReject.textContent = t.btnRejectFriend;
    // Перевод финальной кнопки подтверждения
    const btnFinal = document.getElementById("btn-final-confirm");
    if (btnFinal) btnFinal.textContent = t.btnFinalConfirm;
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

      // Используем безопасный вызов
      if (typeof this.clearAnimTimers === "function") {
        this.clearAnimTimers();
      } else {
        console.error(
          "Критическая ошибка: метод clearAnimTimers не найден в классе UIManager!",
        );
      }

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

            // Внутри enterGame (когда нажали Resume)
            if (document.body.classList.contains("lights-on")) {
              el.hudControls.classList.remove("hud-hidden");
              const userBadge = document.getElementById("hud-user-status");
              if (userBadge) userBadge.classList.remove("hidden");

              this.animTimers.aice = setTimeout(() => {
                // БЕРЕМ ТЕКСТ ИЗ СЛОВАРЯ, а не хардкодом!
                const t = translations[this.currentLang];
                this.showAiceDialogue(t.welcomeBack);
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
                  // 1. Защита от повторных кликов
                  if (this.hasRegistered) return;
                  this.hasRegistered = true;

                  const t = translations[this.currentLang];

                  // 3. ПОКАЗЫВАЕМ ПОЛЕ ВВОДА ЗАРАНЕЕ
                  // Теперь, когда окно регистрации появится на экране, поле уже будет на месте
                  const inputGroup = document.getElementById("reg-input-group");
                  if (inputGroup) {
                      inputGroup.classList.remove("hidden");
                  }

                  // 4. Запускаем полет клона
                  await this.executeTransferToCenter();

                  // 5. Айс приземлился и печатает фразу, поле ввода уже под ним
                  const textEl = document.getElementById("reg-dialogue-text");
                  if (textEl) {
                      await this.typeText(textEl, t.regPrompt, 35);
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
      
      if (this._currentDialogueResolve) {
        this._currentDialogueResolve();
        this._currentDialogueResolve = null;
      }
      document.body.classList.add("loading");
      if (el.hudControls) el.hudControls.classList.add("hud-hidden");

  // === ИСПРАВЛЕННЫЙ БЛОК: Сбрасываем всё, что натворили анимации ===
      const aicePanel = document.getElementById("aice-dialogue-container");
      if (aicePanel) {
        aicePanel.classList.add("hidden");
        const portrait = aicePanel.querySelector(".aice-portrait-wrap");
        const content = aicePanel.querySelector(".aice-dialogue-content");
        
        if (portrait) portrait.style.opacity = "1"; // Возвращаем видимость роботу
        if (content) content.style.opacity = "1";   // ВОТ ЭТО ОЖИВИТ ТЕКСТ!
      }

      const userBadge = document.getElementById("hud-user-status");
      if (userBadge) userBadge.classList.add("hidden");

    const regModal = document.getElementById("registration-modal");
      if (regModal) {
        regModal.style.opacity = "0";
        regModal.classList.add("hidden");
        
        // ИСПРАВЛЕНО: теперь проверка и вызов совпадают!
        if (typeof this.resetRegistrationForm === "function") {
           this.resetRegistrationForm();
        }
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
  const bottomContainer = document.getElementById("aice-dialogue-container");
  const bottomAiceWrap = bottomContainer?.querySelector(".aice-portrait-wrap");
  const centerModal = document.getElementById("registration-modal");
  const centerModalInner = centerModal?.querySelector(".cyber-modal"); // Берем внутреннее окно
  const centerAiceWrap = centerModal?.querySelector(".center-aice");

  if (!bottomAiceWrap || !centerAiceWrap || !centerModal || !bottomContainer) return;

  // 1. ЗАМОРАЖИВАЕМ НИЖНЮЮ ПАНЕЛЬ ДЛЯ ТОЧНЫХ ЗАМЕРОВ СТАРТА
  bottomContainer.style.transition = "none";
  bottomContainer.classList.remove("hidden");
  void bottomContainer.offsetHeight; // Принудительный рендер для фиксации позиции
  const startRect = bottomAiceWrap.getBoundingClientRect();

  // 2. ГОТОВИМ ЦЕНТРАЛЬНОЕ ОКНО И ЖЕСТКО ФИКСИРУЕМ ЕГО SCALE
  centerModal.style.transition = "none";
  centerModal.style.opacity = "0";
  centerModal.classList.remove("hidden");

  if (centerModalInner) {
    centerModalInner.style.transition = "none";
    centerModalInner.style.transform = "scale(1)"; // Игнорируем scale(0.9) из CSS
  }

  centerAiceWrap.style.transition = "none";
  centerAiceWrap.style.opacity = "0";

  const inputGroup = document.getElementById("reg-input-group");
  if (inputGroup) inputGroup.classList.remove("hidden");

  void centerModal.offsetHeight; 
  const targetRect = centerAiceWrap.getBoundingClientRect(); // Теперь координаты 100% точные

  // 3. СОЗДАЕМ И НАСТРАИВАЕМ ПРИЗРАКА
  const ghost = bottomAiceWrap.cloneNode(true);
  ghost.classList.add("aice-ghost");
  ghost.style.animation = "none";
  ghost.style.opacity = "1";
  ghost.style.position = "fixed";
  ghost.style.margin = "0";
  ghost.style.width = `${startRect.width}px`;
  ghost.style.height = `${startRect.height}px`;
  ghost.style.left = `${startRect.left}px`;
  ghost.style.top = `${startRect.top}px`;
  ghost.style.transformOrigin = "0 0"; // Крайне важно для правильного scale
  ghost.style.transition = "none";

  document.body.appendChild(ghost);

  // Прячем оригинальный нижний спрайт и текст
  bottomAiceWrap.style.opacity = "0";
  const bottomContent = bottomContainer.querySelector(".aice-dialogue-content");
  if (bottomContent) bottomContent.style.opacity = "0";

  // ТЕПЕРЬ МОЖНО СПРЯТАТЬ НИЖНЮЮ ПАНЕЛЬ
  bottomContainer.style.transition = ""; 
  bottomContainer.classList.add("hidden");

  await new Promise((res) => requestAnimationFrame(res));

// 4. ВЫЧИСЛЯЕМ МАТЕМАТИКУ ПОЛЕТА
  const offsetY = 30; // <-- Поправка. Если Айс всё еще высоко, сделай 40 или 50. Если низко — 10.
  const translateX = targetRect.left - startRect.left;
  const translateY = (targetRect.top - startRect.top) + offsetY;
  const scale = targetRect.width / startRect.width;

  // Делаем полет быстрее (0.8s) и меняем кривую, чтобы он не зависал
  ghost.style.transition = "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
  ghost.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

  // Плавно показываем фон окна регистрации
  centerModal.style.transition = "opacity 0.8s ease-out";
  centerModal.style.opacity = "1";

  if (typeof audioManager !== "undefined" && audioManager.playUI) audioManager.playUI("pop");

  // Ждем конца полета (800мс вместо 1200)
  await new Promise((res) => setTimeout(res, 800));

  // 5. МГНОВЕННАЯ ПОДМЕНА
  centerAiceWrap.style.transition = "none";
  centerAiceWrap.style.opacity = "1";
  
  ghost.remove(); // Уничтожаем призрака

  // Возвращаем CSS-свойства
  setTimeout(() => {
    if (centerModal) centerModal.style.transition = "";
    if (centerModalInner) {
      centerModalInner.style.transition = "";
      centerModalInner.style.transform = "";
    }
    if (centerAiceWrap) centerAiceWrap.style.transition = "";
  }, 50);
}


async executeTransferToBottom() {
  const bottomContainer = document.getElementById("aice-dialogue-container");
  const bottomAiceWrap = bottomContainer?.querySelector(".aice-portrait-wrap");
  const centerModal = document.getElementById("registration-modal");
  const centerModalInner = centerModal?.querySelector(".cyber-modal"); 
  const centerAiceWrap = centerModal?.querySelector(".center-aice");

  if (!bottomAiceWrap || !centerAiceWrap || !bottomContainer) return;

  // 1. ЗАМОРАЖИВАЕМ НИЖНЮЮ ПАНЕЛЬ (ЦЕЛЬ)
  bottomContainer.style.transition = "none";
  bottomContainer.classList.remove("hidden");
  bottomAiceWrap.style.opacity = "0";

  const dialogContent = bottomContainer.querySelector(".aice-dialogue-content");
  if (dialogContent) {
    dialogContent.style.transition = "none";
    dialogContent.style.opacity = "0";
  }

  // 2. ЗАМОРАЖИВАЕМ ЦЕНТРАЛЬНУЮ ПАНЕЛЬ (СТАРТ)
  if (centerModal) {
    centerModal.style.transition = "none";
    centerModal.classList.remove("hidden"); // Отменяем скрытие
  }
  if (centerModalInner) {
    centerModalInner.style.transition = "none";
    centerModalInner.style.transform = "scale(1)"; // Жестко ставим размер
  }

  void bottomContainer.offsetHeight; // Рефлоу

  const startRect = centerAiceWrap.getBoundingClientRect();
  const targetRect = bottomAiceWrap.getBoundingClientRect();

  // 3. СОЗДАЕМ ПРИЗРАКА
  const ghost = bottomAiceWrap.cloneNode(true);
  ghost.classList.add("aice-ghost");
  ghost.style.animation = "none"; 
  ghost.style.opacity = "1";
  ghost.style.left = `${targetRect.left}px`;
  ghost.style.top = `${targetRect.top}px`;
  ghost.style.width = `${targetRect.width}px`;
  ghost.style.height = `${targetRect.height}px`;
  ghost.style.margin = "0";
  ghost.style.transition = "none"; 
  ghost.style.transformOrigin = "0 0"; // ДОБАВЛЕНО! Иначе скейл ломается

  document.body.appendChild(ghost);

// 4. ПОМЕЩАЕМ ПРИЗРАКА НА МЕСТО ЦЕНТРАЛЬНОГО И ДОБАВЛЯЕМ СДВИГ
  const offsetY = 30; // <-- Поправка для ровного старта (настраивай вместе с первой функцией)
  const translateX = startRect.left - targetRect.left;
  const translateY = (startRect.top - targetRect.top) + offsetY;
  const scale = startRect.width / targetRect.width; // Единый масштаб!

  ghost.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

  // Прячем планшетного Айса, чтобы не было "двойника"
  centerAiceWrap.style.opacity = "0";

  // --- ВОТ ЭТОТ БЛОК ОБЯЗАТЕЛЬНО ОСТАВЛЯЕМ ---
  // Возвращаем анимацию закрытия модалке
  if (centerModal) {
    centerModal.style.transition = "";
    centerModal.classList.add("hidden");
  }
  if (centerModalInner) {
    centerModalInner.style.transition = "";
    centerModalInner.style.transform = "";
  }
  // ------------------------------------------

  await new Promise((res) => requestAnimationFrame(res));

  // 5. ЗАПУСКАЕМ БЫСТРЫЙ ПОЛЕТ ВНИЗ
  ghost.style.transition = "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
  ghost.style.transform = "translate(0px, 0px) scale(1)"; // Тут тоже убрали второй scale

  if (typeof audioManager !== "undefined" && audioManager.playUI) audioManager.playUI("pop");

  // Ждем окончания полета (800мс вместо 1200)
  await new Promise((res) => setTimeout(res, 800));

  // 6. ПРИЗЕМЛЕНИЕ
  ghost.remove();
  bottomAiceWrap.style.opacity = "1";
  centerAiceWrap.style.opacity = "1"; 

  if (dialogContent) {
    dialogContent.style.transition = "opacity 0.4s ease-in";
    dialogContent.style.opacity = "1";
  }

  setTimeout(() => {
    bottomContainer.style.transition = "";
    if (dialogContent) dialogContent.style.transition = "";
  }, 400);
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
        this._currentDialogueResolve = resolve; // Сохраняем "кнопку отмены" промиса

        const handleInteraction = (e) => {
          if (e) e.stopPropagation();
          if (e.type === "mousedown" && e.button !== 0) return;

          if (this.isAiceTyping) {
            this.finishAiceTyping(textElement);
          } else {
            cleanup();
            this._currentDialogueResolve = null; // Очищаем после успешного клика
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

  // Метод для очистки всех таймеров анимаций
  clearAnimTimers() {
    if (!this.animTimers) return;
    Object.values(this.animTimers).forEach((timer) => {
      if (timer) clearTimeout(timer);
    });
    if (this.animTimers.typewriter) clearInterval(this.animTimers.typewriter);
  }
}
