import { store } from "./state.js";
import { audioManager } from "./audio.js";
import { translations } from "./i18n.js";

export class DialogueSystem {
  constructor(uiDispatcher) {
    this.ui = uiDispatcher; // Ссылка на главный UIManager

    this.isAiceTyping = false;
    this.currentAiceFullText = "";
    this._currentAiceResolve = null;
    this._currentDialogueResolve = null;

    this.isHackingRegistration = false;
    this.isRegistrationScanning = false;
    this.isRegistrationComplete = false;
    this.typeTextId = 0;

    // Собственные таймеры для текстов
    this.timers = {
      typewriter: null,
      biosType: null,
    };

    // Собираем элементы, нужные только для диалогов
    this.elements = {
      confirmModal: document.getElementById("confirm-modal"),
      aicePortrait: document.querySelector(".aice-portrait-wrap"),
      biosContinueBtn: document.getElementById("bios-continue"),
    };

    this.initRegistrationLogic();
  }

  // ==========================================
  // 1. БАЗОВАЯ ЛОГИКА ПЕЧАТИ (TYPEWRITER)
  // ==========================================

  typeText(element, text, speed = 30) {
    this.typeTextId++;
    const currentId = this.typeTextId;

    return new Promise((resolve) => {
      if (this.isRegistrationScanning && element.id === "reg-dialogue-text") {
        return resolve();
      }

      this.currentAiceFullText = text;
      this.isAiceTyping = true;
      element.innerHTML = "";

      let i = 0;
      if (this.timers.typewriter) clearInterval(this.timers.typewriter);

      this.timers.typewriter = setInterval(() => {
        if (
          this.typeTextId !== currentId ||
          (this.isRegistrationScanning && element.id === "reg-dialogue-text")
        ) {
          clearInterval(this.timers.typewriter);
          resolve();
          return;
        }

        element.innerHTML += text.charAt(i);
        i++;

        if (i >= text.length) {
          clearInterval(this.timers.typewriter);
          this.isAiceTyping = false;
          resolve();
        }
      }, speed);
    });
  }

  finishAiceTyping(element) {
    if (this.timers.typewriter) clearInterval(this.timers.typewriter);
    this.isAiceTyping = false;
    element.innerHTML = this.currentAiceFullText;
    if (this._currentAiceResolve) {
      this._currentAiceResolve();
      this._currentAiceResolve = null;
    }
  }

  // ==========================================
  // 2. ДИАЛОГИ И BIOS
  // ==========================================

  showAiceDialogue(textToShow = "Привет! Связь установлена.") {
    if (!this.ui.isMenuLocked) return;

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

  async runDialogueSequence(phrasesArray, onCompleteCallback) {
    const aicePanel = document.getElementById("aice-dialogue-container");
    const textElement = aicePanel
      ? aicePanel.querySelector(".aice-dialogue-text")
      : null;

    if (!aicePanel || !textElement) return;

    aicePanel.classList.remove("hidden");
    for (let i = 0; i < phrasesArray.length; i++) {
      if (!this.ui.isMenuLocked) {
        aicePanel.classList.add("hidden");
        return;
      }

      this.typeText(textElement, phrasesArray[i], 35);

      await new Promise((resolve) => {
        this._currentDialogueResolve = resolve;

        const handleInteraction = (e) => {
          if (e) e.stopPropagation();
          if (e.type === "mousedown" && e.button !== 0) return;

          if (this.isAiceTyping) {
            this.finishAiceTyping(textElement);
          } else {
            cleanup();
            this._currentDialogueResolve = null;
            resolve();
          }
        };

        const cleanup = () =>
          aicePanel.removeEventListener("mousedown", handleInteraction);
        aicePanel.addEventListener("mousedown", handleInteraction);
      });
    }

    if (onCompleteCallback) onCompleteCallback();
  }

  typeBiosText(element, text) {
    const cursor = '<span class="bios-cursor"></span>';

    return new Promise((resolve) => {
      if (this.timers.biosType) clearTimeout(this.timers.biosType);
      element.innerHTML = cursor;
      let i = 0;

      const typeChar = () => {
        if (i < text.length) {
         if (text.charAt(i) !== " " && audioManager?.playBiosClick) {
            audioManager.playBiosClick(); // Вызываем твой mp3
          }
          element.innerHTML = text.substring(0, i + 1) + cursor;
          i++;

          let delay = Math.random() * 40 + 30;
          if (text.charAt(i - 1) === ".") delay += 250;
          this.timers.biosType = setTimeout(typeChar, delay);
        } else {
          resolve();
        }
      };
      typeChar();
    });
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

    const currentDict = translations[this.ui.currentLang];
    let shuffled = [...currentDict.biosPhrases].sort(() => 0.5 - Math.random());
    let selectedPhrases = shuffled.slice(0, 3);
    selectedPhrases.push(currentDict.biosFinal);

    for (let i = 0; i < selectedPhrases.length; i++) {
      if (!this.ui.isMenuLocked) {
        container.classList.add("hidden");
        return;
      }

      const isLast = i === selectedPhrases.length - 1;
      if (btn) btn.classList.add("hidden");

      const hackerPrefix = "SYSTEM //: ";
      await this.typeBiosText(textEl, hackerPrefix + selectedPhrases[i]);

      await new Promise((resolve) => {
        if (isLast) {
          if (btn) btn.classList.add("hidden");
          setTimeout(resolve, 1500);
        } else {
          if (btn) {
            btn.classList.remove("hidden");
            btn.style.pointerEvents = "auto";
            btn.style.position = "fixed";
            btn.style.bottom = "40px";
            btn.style.right = "50px";
            btn.style.zIndex = "var(--z-max)";

            const handleBtnClick = (e) => {
              if (e) {
                e.stopPropagation();
                e.preventDefault();
              }
              btn.classList.add("hidden");
              btn.removeEventListener("mousedown", handleBtnClick);
              btn.removeEventListener("touchstart", handleBtnClick);
              resolve();
            };

            btn.addEventListener("mousedown", handleBtnClick);
            btn.addEventListener("touchstart", handleBtnClick, {
              passive: false,
            });
          } else {
            setTimeout(resolve, 2500);
          }
        }
      });
    }

    if (this.ui.isMenuLocked) {
      container.classList.add("hidden");
      setTimeout(() => {
        container.style.display = "";
        container.classList.remove("bios-mode");
        const hudControls = document.getElementById("hud-controls");
        if (hudControls) hudControls.classList.remove("hud-hidden");

        // Включаем свет
        if (this.ui.cb?.onFlickerLights) {
          this.ui.cb.onFlickerLights();

          // === ДОБАВЛЯЕМ ЗВУК ЛАМП ===
          // Убедись, что ключ "fluorescent_lamps" совпадает с тем, как ты назвал этот звук в audio.js!
          if (audioManager?.playUI) audioManager.playUI("lamps");
        }

        if (onCompleteCallback) onCompleteCallback();
      }, 500);
    }
  }

  // === ЗНАКОМСТВО ПЕРЕД РЕГИСТРАЦИЕЙ ===
  async startIntroDialogue() {
    const bottomContainer = document.getElementById("aice-dialogue-container");
    const portrait = bottomContainer?.querySelector(".aice-portrait-wrap");
    const bottomTextEl = document.getElementById("aice-dialogue-text");

    if (!bottomContainer || !bottomTextEl) return;

    // Показываем панель внизу
    bottomContainer.classList.remove("hidden");
    if (portrait) portrait.style.opacity = "1";

    if (audioManager?.playUI) audioManager.playUI("pop");

    const waitForClick = () =>
      new Promise((res) => {
        this._currentDialogueResolve = res;
        const h = () => {
          bottomContainer.removeEventListener("click", h);
          if (this._currentDialogueResolve === res)
            this._currentDialogueResolve = null;
          res();
        };
        setTimeout(() => bottomContainer.addEventListener("click", h), 100);
      });

    // Читаем фразы из твоего словаря (EN или RU)
    const t = translations[this.ui.currentLang];

    // Проходимся по всем строкам из массива introDialog
    for (let i = 0; i < t.introDialog.length; i++) {
      await this.typeText(bottomTextEl, t.introDialog[i], 35);
      await waitForClick();
      if (!this.ui.isMenuLocked) return;
    }

    // После диалога летим в центр экрана для регистрации!
    this.executeTransferToCenter();
  }

  // ==========================================
  // 3. ЛОГИКА РЕГИСТРАЦИИ И ПОЛЕТОВ
  // ==========================================

  initRegistrationLogic() {
    const input = document.getElementById("player-name-input");
    const btnSubmit = document.getElementById("btn-submit-name");
    const textEl = document.getElementById("reg-dialogue-text");
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");
    const aiceWrap = document.querySelector(".center-aice");

    let tempPlayerName = "";

    const showScanningProcess = async (logType = "standard") => {
      this.isRegistrationScanning = true;
      this.typeTextId++;

      if (this.timers.typewriter) {
        clearInterval(this.timers.typewriter);
        this.timers.typewriter = null;
      }
      this.isAiceTyping = false;

      input.disabled = true;
      btnSubmit.style.pointerEvents = "none";
      btnSubmit.style.opacity = "0.5";

      const baseLayer = aiceWrap.querySelector(".base-layer");
      const eyesLayer = aiceWrap.querySelector(".tablet-eyes-layer");
      const beaconLayer = aiceWrap.querySelector(".beacon-layer");

      if (baseLayer) baseLayer.src = "/Image/tablet-1.png";
      if (eyesLayer) eyesLayer.style.display = "none";
      if (beaconLayer) {
        beaconLayer.src = "/Image/light-tablet-1.png";
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

      const t = translations[this.ui.currentLang || "RU"];
      textEl.innerHTML =
        (logType === "hacking" ? t.regHacking : "SCANNING SYSTEM...") +
        "<span class='bios-cursor'></span>";

      if (audioManager?.playScanSound) audioManager.playScanSound();

      for (let i = 0; i < logs.length; i++) {
        input.value = logs[i];
        await new Promise((res) => setTimeout(res, 1000));
      }

      if (baseLayer) baseLayer.src = "/Image/tablet-2.png";
      if (eyesLayer) eyesLayer.style.display = "";
      if (beaconLayer) {
        beaconLayer.src = "/Image/light-tablet-2.png";
        beaconLayer.classList.remove("fast-pulse");
      }

      if (audioManager?.stopScanSound) audioManager.stopScanSound();
      this.isRegistrationScanning = false;
    };

    const runRegistrationFlow = async () => {
      const t = translations[this.ui.currentLang];
      let rawName = input.value.trim();
      if (!rawName || rawName.includes("...")) return;

      tempPlayerName =
        rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
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

      if (audioManager?.playUI) audioManager.playUI("error");

      input.classList.add("error-mode");
      input.value = t.regErrorTaken;

      const baseLayer = aiceWrap.querySelector(".base-layer");
      const beacon = aiceWrap.querySelector(".beacon-layer");
      const eyesLayer = aiceWrap.querySelector(".tablet-eyes-layer");

      if (baseLayer) baseLayer.src = "/Image/tablet-3.png";
      if (beacon) {
        beacon.src = "/Image/light-tablet-3.png";
        beacon.classList.add("error-pulse");
        beacon.style.filter = "";
      }
      if (eyesLayer) eyesLayer.style.display = "none";

      await this.typeText(textEl, t.regPhraseTaken1(tempPlayerName), 30);

      inputGroup.classList.add("hidden");
      choiceGroup.classList.remove("hidden");

      document.getElementById("btn-what-now").style.display = "";
      document.getElementById("btn-accept-friend").style.display = "none";
      document.getElementById("btn-reject-friend").style.display = "none";
    };

    const runHackingFlow = async () => {
      const t = translations[this.ui.currentLang];
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

    // === ИГРОК СПРАШИВАЕТ "И ЧТО НАМ ДЕЛАТЬ?" ===
    document.getElementById("btn-what-now").onclick = async () => {
      const btnWhatNow = document.getElementById("btn-what-now");
      const btnAccept = document.getElementById("btn-accept-friend");
      const btnReject = document.getElementById("btn-reject-friend");
      const t = translations[this.ui.currentLang];

      // 1. Сначала прячем кнопку вопроса
      if (btnWhatNow) btnWhatNow.style.display = "none";

      // 2. ЖДЕМ, пока Айс закончит предлагать стать "Другом"
      // Кнопки выбора еще не видны
      await this.typeText(textEl, t.regPhraseTaken2, 30);

      // 3. И только теперь показываем кнопки выбора
      if (btnAccept) btnAccept.style.display = "";
      if (btnReject) btnReject.style.display = "";
    };

    document.getElementById("btn-accept-friend").onclick = async () => {
      const t = translations[this.ui.currentLang];
      choiceGroup.classList.add("hidden");

      const beacon = aiceWrap.querySelector(".beacon-layer");
      if (beacon) beacon.classList.remove("error-pulse");
      const eyesLayer = aiceWrap.querySelector(".tablet-eyes-layer");
      if (eyesLayer) eyesLayer.style.display = "";

      input.classList.remove("error-mode");
      input.value = "";
      inputGroup.classList.remove("hidden");

      await showScanningProcess("standard");

      input.value = t.regSuccess;
      await new Promise((res) => setTimeout(res, 500));

      await this.typeText(textEl, t.regPhraseAcceptFriend, 30);
      await this.finishRegistration(t.friendName);
    };

    document.getElementById("btn-reject-friend").onclick = async () => {
      choiceGroup.classList.add("hidden");
      this.isHackingRegistration = true;

      const baseLayer = aiceWrap.querySelector(".base-layer");
      const beacon = aiceWrap.querySelector(".beacon-layer");
      const eyesLayer = aiceWrap.querySelector(".tablet-eyes-layer");

      if (baseLayer) baseLayer.src = "/Image/tablet-1.png";
      if (beacon) {
        beacon.src = "/Image/light-tablet-1.png";
        beacon.classList.remove("error-pulse");
        beacon.classList.add("fast-pulse");
        beacon.style.filter = "";
      }
      if (eyesLayer) eyesLayer.style.display = "none";

      const t = translations[this.ui.currentLang];
      await this.typeText(textEl, t.regOverride, 30);

      let dotCount = 1;
      const dotInterval = setInterval(() => {
        textEl.innerHTML = t.regOverride + ".".repeat(dotCount);
        dotCount = dotCount >= 3 ? 1 : dotCount + 1;
      }, 500);

      await new Promise((res) => setTimeout(res, 5000));
      clearInterval(dotInterval);

      if (baseLayer) baseLayer.src = "/Image/tablet-2.png";
      if (beacon) {
        beacon.src = "/Image/light-tablet-2.png";
        beacon.classList.remove("fast-pulse");
      }
      if (eyesLayer) eyesLayer.style.display = "";

      await this.typeText(textEl, t.regPhraseHacked(tempPlayerName), 30);
      await this.finishRegistration(tempPlayerName);
    };
  }

  resetRegistrationForm() {
    const input = document.getElementById("player-name-input");
    const btnSubmit = document.getElementById("btn-submit-name");
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");
    const finalGroup = document.getElementById("reg-final-group");
    const textEl = document.getElementById("reg-dialogue-text");

    document.getElementById("btn-what-now")?.classList.remove("hidden");
    document.getElementById("btn-accept-friend")?.classList.add("hidden");
    document.getElementById("btn-reject-friend")?.classList.add("hidden");

    if (input) {
      input.value = "";
      input.classList.remove("error-mode");
      input.disabled = false;
    }

    if (choiceGroup) choiceGroup.classList.add("hidden");
    if (finalGroup) finalGroup.classList.add("hidden");
    if (inputGroup) inputGroup.classList.add("hidden");

    if (btnSubmit) {
      btnSubmit.style.pointerEvents = "auto";
      btnSubmit.style.opacity = "1";
    }

    if (textEl) textEl.innerHTML = "";

    if (this.timers.typewriter) {
      clearInterval(this.timers.typewriter);
      this.timers.typewriter = null;
    }

    this.isAiceTyping = false;
    this.isHackingRegistration = false;
    this.isRegistrationScanning = false;
    this.isRegistrationComplete = false;

    const centerModal = document.getElementById("registration-modal");
    if (centerModal) {
      const baseLayer = centerModal.querySelector(".base-layer");
      const eyesLayer = centerModal.querySelector(".tablet-eyes-layer");
      const beaconLayer = centerModal.querySelector(".beacon-layer");

      if (baseLayer) baseLayer.src = "/Image/tablet-2.png";
      if (eyesLayer) {
        eyesLayer.src = "/Image/blinks-eyes-tablet-2.png";
        eyesLayer.style.display = "";
      }
      if (beaconLayer) {
        beaconLayer.src = "/Image/light-tablet-2.png";
        beaconLayer.classList.remove("error-pulse", "fast-pulse");
      }
    }
  }

  async finishRegistration(rawName) {
    const finalName =
      rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();

    const finalGroup = document.getElementById("reg-final-group");
    const btnFinal = document.getElementById("btn-final-confirm");
    const inputGroup = document.getElementById("reg-input-group");
    const choiceGroup = document.getElementById("reg-choice-group");

    if (inputGroup) inputGroup.classList.add("hidden");
    if (choiceGroup) choiceGroup.classList.add("hidden");
    if (finalGroup) finalGroup.classList.remove("hidden");

    await new Promise((resolve) => {
      if (btnFinal) {
        const handleFinalClick = (e) => {
          if (e) e.stopPropagation();
          btnFinal.removeEventListener("click", handleFinalClick);
          resolve();
        };
        btnFinal.addEventListener("click", handleFinalClick);
      } else {
        setTimeout(resolve, 1500);
      }
    });

    if (store?.update) store.update({ playerName: finalName });

    if (inputGroup) inputGroup.classList.add("hidden");
    if (choiceGroup) choiceGroup.classList.add("hidden");
    if (finalGroup) finalGroup.classList.add("hidden");

    const textEl = document.getElementById("reg-dialogue-text");
    if (textEl) textEl.innerHTML = "";

    await this.executeTransferToBottom();

    if (!this.ui.isMenuLocked) return;

    const userBadge = document.getElementById("hud-user-status");
    const userNameText = document.getElementById("hud-user-name");
    const bottomContainer = document.getElementById("aice-dialogue-container");
    const bottomAiceWrap = bottomContainer?.querySelector(
      ".aice-portrait-wrap",
    );

    if (userBadge && userNameText) {
      const prefix = this.isHackingRegistration ? "ROOT" : "USER";
      userNameText.innerText = `${prefix}: ${finalName.toUpperCase()}`;
      userBadge.classList.remove("hidden");
    }

    if (bottomContainer && bottomAiceWrap) {
      bottomContainer.classList.remove("hidden");
      bottomAiceWrap.style.opacity = "1";

      const bottomTextEl = document.getElementById("aice-dialogue-text");

      const waitForClick = () =>
        new Promise((res) => {
          this._currentDialogueResolve = res;
          const h = () => {
            bottomContainer.removeEventListener("click", h);
            if (this._currentDialogueResolve === res)
              this._currentDialogueResolve = null;
            res();
          };
          setTimeout(() => bottomContainer.addEventListener("click", h), 100);
        });

      const getDict = () => translations[this.ui.currentLang];
      const lowerName = finalName.toLowerCase();
      const specialNames = ["друг", "айс", "aice", "friend", "buddy"];

      let phrase1 = specialNames.includes(lowerName)
        ? getDict().regFinalSpecial(finalName)
        : getDict().regFinalSarcasm(finalName);

      // Айс говорит, что приятно познакомиться
      await this.typeText(bottomTextEl, phrase1, 35);
      await waitForClick();

      if (!this.ui.isMenuLocked) return;

      const statusWord = this.isHackingRegistration
        ? getDict().statusAdmin
        : getDict().statusUser;

      if (userBadge) {
        userBadge.classList.add("user-badge-highlight");
        const arrow = document.createElement("div");
        arrow.className = "status-arrow-hint";
        arrow.innerHTML = "↑";
        userBadge.appendChild(arrow);
      }

      await this.typeText(
        bottomTextEl,
        getDict().regFinalStatus(statusWord),
        35,
      );
      await waitForClick();

      if (!this.ui.isMenuLocked) return;

      if (userBadge) {
        userBadge.classList.remove("user-badge-highlight");
        userBadge.querySelector(".status-arrow-hint")?.remove();
      }

      // Выводим финальную фразу
      await this.typeText(bottomTextEl, getDict().regFinalAction, 35);
      await waitForClick();

      // ==========================================
      // ПРЯЧЕМ АЙСА (ИСПРАВЛЕННЫЙ ВАРИАНТ)
      // ==========================================
      const finalDialogWindow = document.getElementById(
        "aice-dialogue-container",
      );
      if (finalDialogWindow) {
        finalDialogWindow.classList.add("hidden");
      }

      // Ждем 300 миллисекунд, чтобы анимация скрытия успела начаться, и запускаем полет!
      setTimeout(() => {
        // Разблокируем интерфейс
        this.ui.unlockFeature("feature-equipment");
        this.ui.unlockFeature("feature-word");
        this.ui.unlockFeature("feature-physics");

        this.isRegistrationComplete = true;

        // Даем сигнал камере начать плавный наезд внутрь комнаты
        if (this.ui.cb?.onRegistrationEnd) this.ui.cb.onRegistrationEnd();
      }, 300);
    }
  }

  async executeTransferToCenter() {
    this.resetRegistrationForm();

    const bottomContainer = document.getElementById("aice-dialogue-container");
    const bottomAiceWrap = bottomContainer?.querySelector(
      ".aice-portrait-wrap",
    );
    const centerModal = document.getElementById("registration-modal");
    const centerModalInner = centerModal?.querySelector(".cyber-modal");
    const centerAiceWrap = centerModal?.querySelector(".center-aice");

    if (!bottomAiceWrap || !centerAiceWrap || !centerModal || !bottomContainer)
      return;

    bottomContainer.style.transition = "none";
    bottomContainer.classList.remove("hidden");
    void bottomContainer.offsetHeight;
    const startRect = bottomAiceWrap.getBoundingClientRect();

    centerModal.style.transition = "none";
    centerModal.style.opacity = "0";
    centerModal.classList.remove("hidden");

    if (centerModalInner) {
      centerModalInner.style.transition = "none";
      centerModalInner.style.transform = "scale(1)";
    }

    centerAiceWrap.style.transition = "none";
    centerAiceWrap.style.opacity = "0";

    const inputGroup = document.getElementById("reg-input-group");
    if (inputGroup) inputGroup.classList.remove("hidden");

    void centerModal.offsetHeight;
    const targetRect = centerAiceWrap.getBoundingClientRect();

    const ghost = bottomAiceWrap.cloneNode(true);
    ghost.classList.add("aice-ghost");
    ghost.style.animation = "none";
    ghost.style.opacity = "1";
    ghost.style.position = "fixed";
    ghost.style.zIndex = "var(--z-max)";
    ghost.style.margin = "0";
    ghost.style.width = `${startRect.width}px`;
    ghost.style.height = `${startRect.height}px`;
    ghost.style.left = `${startRect.left}px`;
    ghost.style.top = `${startRect.top}px`;
    ghost.style.transformOrigin = "0 0";
    ghost.style.transition = "none";

    document.body.appendChild(ghost);

    bottomAiceWrap.style.opacity = "0";
    const bottomContent = bottomContainer.querySelector(
      ".aice-dialogue-content",
    );
    if (bottomContent) bottomContent.style.opacity = "0";

    bottomContainer.style.transition = "";
    bottomContainer.classList.add("hidden");

    await new Promise((res) => requestAnimationFrame(res));

    const offsetY = 30;
    const translateX = targetRect.left - startRect.left;
    const translateY = targetRect.top - startRect.top + offsetY;
    const scale = targetRect.width / startRect.width;

    ghost.style.transition = "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
    ghost.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

    centerModal.style.transition = "opacity 0.8s ease-out";
    centerModal.style.opacity = "1";

    if (audioManager?.playUI) audioManager.playUI("pop");

    await new Promise((res) => setTimeout(res, 800));

    centerAiceWrap.style.transition = "none";
    centerAiceWrap.style.opacity = "1";

    ghost.remove();

    const regTextEl = document.getElementById("reg-dialogue-text");
    const t = translations[this.ui.currentLang];

    if (regTextEl && t.regPrompt) {
      this.typeText(regTextEl, t.regPrompt, 35);
    }

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
    const bottomAiceWrap = bottomContainer?.querySelector(
      ".aice-portrait-wrap",
    );
    const centerModal = document.getElementById("registration-modal");
    const centerModalInner = centerModal?.querySelector(".cyber-modal");
    const centerAiceWrap = centerModal?.querySelector(".center-aice");

    if (!bottomAiceWrap || !centerAiceWrap || !bottomContainer) return;

    bottomContainer.style.transition = "none";
    bottomContainer.classList.remove("hidden");
    bottomAiceWrap.style.opacity = "0";

    const dialogContent = bottomContainer.querySelector(
      ".aice-dialogue-content",
    );
    if (dialogContent) {
      dialogContent.style.transition = "none";
      dialogContent.style.opacity = "0";
    }

    if (centerModal) {
      centerModal.style.transition = "none";
      centerModal.classList.remove("hidden");
    }
    if (centerModalInner) {
      centerModalInner.style.transition = "none";
      centerModalInner.style.transform = "scale(1)";
    }

    void bottomContainer.offsetHeight;

    const startRect = centerAiceWrap.getBoundingClientRect();
    const targetRect = bottomAiceWrap.getBoundingClientRect();

    const ghost = bottomAiceWrap.cloneNode(true);
    ghost.classList.add("aice-ghost");
    ghost.style.animation = "none";
    ghost.style.opacity = "1";
    ghost.style.position = "fixed";
    ghost.style.zIndex = "var(--z-max)";
    ghost.style.left = `${targetRect.left}px`;
    ghost.style.top = `${targetRect.top}px`;
    ghost.style.width = `${targetRect.width}px`;
    ghost.style.height = `${targetRect.height}px`;
    ghost.style.margin = "0";
    ghost.style.transition = "none";
    ghost.style.transformOrigin = "0 0";

    document.body.appendChild(ghost);

    const offsetY = 30;
    const translateX = startRect.left - targetRect.left;
    const translateY = startRect.top - targetRect.top + offsetY;
    const scale = startRect.width / targetRect.width;

    ghost.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;

    centerAiceWrap.style.opacity = "0";

    if (centerModal) {
      centerModal.style.transition = "opacity 0.4s ease";
      centerModal.style.opacity = "0";
      centerModal.classList.add("hidden");
    }
    if (centerModalInner) {
      centerModalInner.style.transition = "";
      centerModalInner.style.transform = "";
    }

    await new Promise((res) => requestAnimationFrame(res));

    ghost.style.transition = "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
    ghost.style.transform = "translate(0px, 0px) scale(1)";

    if (audioManager?.playUI) audioManager.playUI("pop");

    await new Promise((res) => setTimeout(res, 800));

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

  // Очистка при выходе в меню
  clear() {
    if (this._currentDialogueResolve) {
      this._currentDialogueResolve();
      this._currentDialogueResolve = null;
    }
    if (this.timers.typewriter) clearInterval(this.timers.typewriter);
    if (this.timers.biosType) clearTimeout(this.timers.biosType);
    this.resetRegistrationForm();
  }
}
