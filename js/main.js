import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { LevelBuilder } from "./level.js";
import { CONFIG } from "./config.js";
import { audioManager } from "./audio.js";
import { store, isNight, isSlowMo } from "./state.js";
import { PhysicsManager } from "./physics.js";
import { SceneManager, heatTex, lampGlowTex, loadGameAssets } from "./scene.js";
import { UIManager } from "./ui.js";
import { InputManager } from "./input.js";
import { ParticlePool, GameObject, MiniBeadPool } from "./utils.js";
import { PlayerController } from "./player.js";
import { CameraController } from "./camera.js";
import { InteractiveBox } from "./entities.js";
import { WordManager } from "./word_manager.js";
const SAVE_KEY = "google-room-save-v1";

RectAreaLightUniformsLib.init();

export class GoogleRoomApp {
  constructor() {
    // === UI ДЛЯ ЗАТЕМНЕНИЯ ЭКРАНА (Fade) ===
    this.fadeScreen = document.createElement("div");
    this.fadeScreen.style.position = "absolute";
    this.fadeScreen.style.top = "0";
    this.fadeScreen.style.left = "0";
    this.fadeScreen.style.width = "100%";
    this.fadeScreen.style.height = "100%";
    this.fadeScreen.style.backgroundColor = "black";
    this.fadeScreen.style.opacity = "0"; // Сначала прозрачный
    this.fadeScreen.style.pointerEvents = "none"; // Чтобы клики проходили сквозь него
    this.fadeScreen.style.transition = "opacity 2s ease-in-out"; // Плавность 2 секунды
    this.fadeScreen.style.zIndex = "9999";
    document.body.appendChild(this.fadeScreen);

    // === ФЛАГИ СОСТОЯНИЙ ===
    this.isElevatorSequenceActive = false; // Флаг лифтовой кат-сцены
    this.hasStartedGame = false;
    this.isIntroPlaying = false;
    this.isPaused = false;
    this.isResetting = false;
    this.isPreparingGame = false;
    this.hasPrewarmedRooms = false;

    // Геймплей активен только когда игрок реально внутри игры.
    // В главном меню физика/триггеры не должны жить своей жизнью.
    this.isGameActive = false;

    // Короткий режим выхода в меню:
    // мир ещё 1–2 секунды физически доживает, но новые кат-сцены запрещены.
    this.isExitingToMenu = false;
    this.lastTime = performance.now();
    this.platformImpact = 0;
    this.lastRenderStatsTime = 0;
    this.fpsFrameCount = 0;
    this.fpsLastTime = performance.now();

    // === СОСТОЯНИЕ УРОВНЕЙ ===
    // Конфиг уровня описывает:
    // spawn — где появляется игрок при старте уровня;
    // exitTrigger — зона, которая запускает переход на следующий уровень;
    // nextLevelId — куда ведёт выход уровня.
    this.levelConfigs = {
      1: {
        spawn: { x: 0, y: 0, z: 30 },

        // Финальный лифт первого уровня — текущий лифт.
        exitTrigger: {
          xMin: -4.0,
          xMax: 4.0,
          zMin: 15.0,
          zMax: 19.0,
        },

        entryDoor: "entrance",
        nextLevelId: 2,
      },

      2: {
        spawn: { x: 0, y: 0, z: 11.25 },

        // Финальный выход уровня 2.
        // Он стоит у правой боковой стены, ближе к дальнему углу комнаты.
        exitTrigger: {
          xMin: 10.5,
          xMax: 15.5,
          zMin: -35.0,
          zMax: -27.0,
        },

        // Это временный финальный выход-заглушка,
        // поэтому он не управляет створками текущего стартового лифта.
        entryDoor: "none",

        nextLevelId: 3,
      },

      3: {
        spawn: { x: 0, y: 0, z: 11.25 },

        // Пока у уровня 3 нет настоящего выхода.
        // Оставляем временную зону у дальней стены, чтобы позже удобно привязать финал.
        exitTrigger: {
          xMin: -5.0,
          xMax: 5.0,
          zMin: -36.5,
          zMax: -31.0,
        },

        entryDoor: "none",
        nextLevelId: null,
      },
    };

    this.savedProgress = this.loadSavedProgress();

    this.currentLevelId = 1;
    this.targetLevelId = null;

    // id комнатного лифта, который сейчас участвует в кат-сцене.
    // Пока используется только финальный лифт уровня 2.
    this.activeRoomExitElevatorId = null;

    // Сколько времени шар непрерывно находится в полном покое
    // перед началом лифтовой кат-сцены.
    this.elevatorStopStableTime = 0;

    // === ИНИЦИАЛИЗАЦИЯ МЕНЕДЖЕРОВ ===
    this.sceneManager = new SceneManager();

    this.scene = this.sceneManager.scene;
    this.camera = this.sceneManager.camera;
    this.renderer = this.sceneManager.renderer;
    this.composer = this.sceneManager.composer;
    // Не позволяем Three.js сбрасывать статистику после каждого прохода EffectComposer.
    this.renderer.info.autoReset = false;
    this.bloomPass = this.sceneManager.bloomPass;

    this._tempVec = new THREE.Vector3();
    this._tempSpread = new THREE.Vector3();
    this._tempDir = new THREE.Vector3();
    this._tempCannonVec = new CANNON.Vec3();

    this.fansActive = false;
    this.fanLevel = 0.0;
    this.lettersHiddenByMagnet = false;
    this.currentRingIntensity = 1.2;

    // ... остальной твой код конструктора (инициализация физики, игрока и т.д.) ...

    // Используем мягкую текстуру lampGlowTex и делаем цвет настоящим серым (0x888888)
    this.dustPool = new ParticlePool(
      this.scene,
      lampGlowTex,
      250,
      "dust",
      0x888888,
    );
    this.heatPool = new ParticlePool(this.scene, heatTex, 40, "heat", 0xffb074); // Эту не трогаем!
    this.paintPools = CONFIG.COLORS.GOOGLE_UNIQUE.map(
      (colorHex) =>
        new ParticlePool(this.scene, heatTex, 1000, "paint", colorHex),
    );
    this.paintParticleTime = 0;
    // =================================================

    this.ballsPool = new Array(CONFIG.PHYSICS.MAX_BALLS).fill(null);
    this.activeBallsCount = 0;
    this.ballSpawnIndex = 0;

    this.ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1,
    });
    this.tick = this.tick.bind(this);

    this.physicsManager = new PhysicsManager();
    this.world = this.physicsManager.world;
    this.matStandard = this.physicsManager.matStandard;
    this.matBouncy = this.physicsManager.matBouncy;
    this.matSlippery = this.physicsManager.matSlippery;
    this.matBox = this.physicsManager.matBox;

    this.miniBeadPool = new MiniBeadPool(
      this.world,
      this.scene,
      this.matBouncy,
      120,
    );

    // === ИНИЦИАЛИЗАЦИЯ 3D-СЛОВ ===
    this.wordManager = new WordManager(
      this.world,
      this.scene,
      this.matBouncy,
      typeof audioManager !== "undefined" ? audioManager : null,
    );

    // Привязываем визуальные эффекты из main к событиям внутри WordManager
    this.wordManager.onLetterHit = (pos, color) => {
      this.spawnMiniBeads(pos, color);
      if (
        Math.abs(pos.x) < 5 &&
        Math.abs(pos.z) < 5 &&
        pos.y < CONFIG.WORLD.FLOOR_LEVEL + 1.0
      ) {
        this.platformImpact = 1.0;
      }
    };
    this.wordManager.onDustExplosion = (pos, intensity) =>
      this.createDustExplosion(pos, intensity);

    this.uiManager = new UIManager({
      canReturnToMenu: () => {
        return !this.isElevatorSequenceActive && !this.isExitingToMenu;
      },
      hasActiveSession: () => {
        return this.hasStartedGame;
      },
      hasSavedProgress: () => {
        return this.savedProgress?.hasSave === true;
      },

      getSavedSector: () => {
        return this.savedProgress?.currentSector ?? 1;
      },

      onDeleteSavedProgress: () => {
        this.deleteSavedProgress();
      },

      onReturnToTitle: () => {
        // Сохраняем достигнутый сектор, но не положение предметов.
        this.saveProgress(this.currentLevelId);

        // Живая игровая сессия закончена.
        // При следующем "Продолжить" сектор будет построен заново.
        this.hasStartedGame = false;
        this.isGameActive = false;
        this.isPaused = true;
        this.isExitingToMenu = false;

        this.lastTime = performance.now();
      },

      getHighestUnlockedSector: () => {
        return this.savedProgress?.highestUnlockedSector ?? 1;
      },

      getCurrentSector: () => {
        if (this.hasStartedGame) {
          return this.currentLevelId;
        }

        return this.savedProgress?.currentSector ?? 1;
      },
      onEnableGameplayControls: () => {
        if (this.controls) {
          this.controls.enabled = true;
        }

        this.isIntroPlaying = false;
      },

      canOpenPause: () => {
        return (
          this.hasStartedGame &&
          this.isGameActive &&
          !this.isElevatorSequenceActive &&
          !this.isExitingToMenu
        );
      },

      canRestartCurrentRoom: () => {
        return (
          this.hasStartedGame &&
          this.isGameActive &&
          !this.isResetting &&
          !this.isElevatorSequenceActive &&
          !this.isExitingToMenu &&
          !this.isPreparingGame
        );
      },

      onSetPaused: (paused) => {
        // Поставить игру на паузу во время лифтовой кат-сцены нельзя.
        if (paused && (this.isElevatorSequenceActive || this.isExitingToMenu)) {
          return false;
        }

        this.isPaused = paused;

        if (paused) {
          if (audioManager?.stopOpenDoor) {
            audioManager.stopOpenDoor();
          }

          if (audioManager?.stopBoxSlide) {
            audioManager.stopBoxSlide();
          }

          // Сбрасываем зажатые клавиши движения,
          // чтобы после паузы шар сам не продолжал ехать.
          if (this.playerController?.keys) {
            for (const key in this.playerController.keys) {
              this.playerController.keys[key] = false;
            }
          }
        } else {
          // После паузы не допускаем большого скачка физики по времени.
          this.lastTime = performance.now();
        }

        return true;
      },

      onReleaseGameplayControls: () => {
        if (this.controls?.isLocked) {
          this.controls.unlock();
        }
      },

      onResumeGameplayControls: () => {
        if (!this.controls) return;

        this.controls.enabled = true;

        // PointerLockControls создан на document.body,
        // поэтому проверяем реальное состояние браузера.
        if (document.pointerLockElement !== document.body) {
          this.controls.lock();
        }
      },

      onReset: (options) => this.resetScene(options),
      onSectorLoadedFromMenu: (levelId) => {
        this.saveProgress(levelId);
      },

      onRestartCurrentRoom: () => {
        const canRestart =
          this.hasStartedGame &&
          this.isGameActive &&
          !this.isResetting &&
          !this.isElevatorSequenceActive &&
          !this.isExitingToMenu &&
          !this.isPreparingGame;

        if (!canRestart) {
          console.warn("[RESTART] Restart blocked during unsafe game state.");
          return false;
        }

        this.isResetting = true;

        try {
          this.resetScene({
            levelId: this.currentLevelId,
          });

          return true;
        } finally {
          this.isResetting = false;
        }
      },

      onForceLightsOff: () => {
        this.currentExposure = 0;
        this.renderer.toneMappingExposure = 0;
      },

      onPrepareNewGame: (onProgress) => this.prepareNewGame(onProgress),

      onBeginExitToMenu: () => {
        this.beginExitToMenu();
      },

      onFinishExitToMenu: () => {
        this.finishExitToMenu();
      },

      onStartGameplay: () => {
        this.startGameplaySession();
      },
    });

    this.initSceneObjects();

    this.inputManager = new InputManager(
      this.camera,
      this.world,
      () => this.isPaused || !this.isGameActive,
      () => store.get().currentTool,
      () => {
        const meshes = [
          ...(this.wordManager.lettersEnabled
            ? this.wordManager.letterObjects.map((d) => d.mesh)
            : []),
          this.ballInstancedMesh,
        ];
        const getBodyByMesh = (hitObj) => {
          if (hitObj.object === this.ballInstancedMesh) {
            const body = this.ballsPool[hitObj.instanceId];
            return body ? body : null;
          } else {
            const letterObj = this.wordManager.letterObjects.find(
              (d) => d.mesh === hitObj.object,
            );
            return letterObj ? letterObj.body : null;
          }
        };
        return { meshes, getBodyByMesh };
      },
      (isDragging) => {
        if (isDragging) document.body.classList.add("is-dragging");
        else document.body.classList.remove("is-dragging");
      },

      // ИЗМЕНЕННАЯ СТРОКА: Игнорируем стекло для raycaster'а
      () =>
        this.sceneManager.walls
          .filter((w) => !w.mesh.userData.isGlass)
          .map((w) => w.mesh),
      () =>
        store.get().paintToolColor !== undefined
          ? store.get().paintToolColor
          : -1,
    );

    this.setupStateReactions();

    // ==========================================
    // ФИЗИКА СВЕТА: Настройка экспозиции камеры
    // ==========================================
    // Запоминаем дефолтную яркость сцены (обычно 1.0)
    this.baseExposure =
      this.renderer.toneMappingExposure > 0
        ? this.renderer.toneMappingExposure
        : 1.0;

    // Если ToneMapping был выключен, включаем линейный
    // (он не меняет оригинальные цвета, но дает управлять светом)
    if (this.renderer.toneMapping === THREE.NoToneMapping) {
      this.renderer.toneMapping = THREE.LinearToneMapping;
    }

    // ==========================================
    // НАСТРОЙКА УПРАВЛЕНИЯ МЫШЬЮ И ПЛАВНОГО ЗУМА
    // ==========================================

    // Создаем "штатив" для камеры
    this.cameraPivot = new THREE.Object3D();
    this.cameraPivot.rotation.order = "YXZ";
    this.scene.add(this.cameraPivot);

    // Привязываем камеру к штативу
    this.cameraPivot.add(this.camera);

    // Устанавливаем начальную позицию (позже она будет плавно меняться в tick)
    this.camera.position.set(0, this.targetZoom * 0.35, this.targetZoom);
    // Считаем начальный наклон (rotation.x), чтобы смотреть на шар
    this.camera.rotation.set(
      -Math.atan2(this.camera.position.y, this.camera.position.z),
      0,
      0,
    );

    // Инициализируем контроллер мыши
    this.controls = new PointerLockControls(this.cameraPivot, document.body);

    // === НОВЫЕ ПРАВИЛЬНЫЕ ЛИМИТЫ (От 3-го лица) ===
    // Горизонт — это Math.PI / 2. Чтобы смотреть вниз, угол должен быть БОЛЬШЕ горизонта!
    this.controls.minPolarAngle = Math.PI / 4; // Ограничитель неба: не дает задирать нос слишком высоко
    this.controls.maxPolarAngle = Math.PI - 0.2; // Ограничитель пола: разрешает смотреть почти вертикально сверху вниз

    // Задаем красивый стартовый ракурс!
    // При запуске игры камера уже будет наклонена на 30 градусов вниз и висеть над шаром.
    this.cameraPivot.rotation.x = -Math.PI / 6;
    // =========================================

    // Логика захвата курсора
    document.addEventListener("click", (e) => {
      const btnStart = e.target.closest("#btn-start-game");
      const btnConfirmYes = e.target.closest("#btn-confirm-yes");

      // Pointer Lock включаем:
      const highestUnlockedSector =
        this.savedProgress?.highestUnlockedSector ?? 1;

      const shouldLockForGameStart =
        btnConfirmYes || (btnStart && highestUnlockedSector < 2);

      if (shouldLockForGameStart) {
        if (!this.isElevatorSequenceActive && !this.controls.isLocked) {
          this.controls.lock();
        }

        return;
      }

      // При наличии сохранения первый клик по "Новая игра"
      // только открывает окно подтверждения.
      if (btnStart) {
        return;
      }

      // 2. Если кликаем по остальному меню, настройкам или HUD — игнорируем захват
      if (
        e.target.closest("#loader-doors") ||
        e.target.closest("#confirm-modal") ||
        e.target.closest("#pause-overlay") ||
        e.target.tagName === "INPUT"
      ) {
        return;
      }

      // 3. Во всех остальных случаях (клик по самой игре) — захватываем мышь,
      // но не во время кат-сцен.
      if (this.isElevatorSequenceActive || this.isIntroPlaying) {
        return;
      }

      if (!this.controls.isLocked) {
        this.controls.lock();
      }
    });

    this.controls.addEventListener("unlock", () => {
      // Сбрасываем движение, чтобы шар не продолжал ехать
      // после открытия паузы.
      if (this.playerController?.keys) {
        for (const key in this.playerController.keys) {
          this.playerController.keys[key] = false;
        }
      }

      const shouldOpenPause =
        this.hasStartedGame &&
        this.isGameActive &&
        !this.isElevatorSequenceActive &&
        !this.isExitingToMenu;

      if (shouldOpenPause) {
        this.uiManager?.openPauseMenu();
      }
    });

    const startPos = { x: 0, y: 0, z: 30 }; // Стартовая позиция переехала сюда
    this.playerController = new PlayerController(
      this.world,
      this.scene,
      this.sceneManager,
      this.physicsManager,
      this.cameraPivot,
      startPos,
      this.interactivePlatforms,
    );

    this.cameraController = new CameraController(
      this.camera,
      this.cameraPivot,
      this.sceneManager,
    );

    requestAnimationFrame(this.tick);
  }

  loadSavedProgress() {
    try {
      const rawSave = localStorage.getItem(SAVE_KEY);

      if (!rawSave) {
        return {
          hasSave: false,
          currentSector: 1,
          highestUnlockedSector: 1,
        };
      }

      const parsedSave = JSON.parse(rawSave);

      const currentSector = Number(parsedSave.currentSector);
      const highestUnlockedSector = Number(parsedSave.highestUnlockedSector);

      const safeCurrentSector =
        Number.isInteger(currentSector) && this.levelConfigs[currentSector]
          ? currentSector
          : 1;

      const safeHighestUnlockedSector =
        Number.isInteger(highestUnlockedSector) &&
        highestUnlockedSector >= safeCurrentSector
          ? highestUnlockedSector
          : safeCurrentSector;

      return {
        hasSave: true,
        currentSector: safeCurrentSector,
        highestUnlockedSector: safeHighestUnlockedSector,
      };
    } catch (error) {
      console.warn("[SAVE] Не удалось прочитать сохранение:", error);

      return {
        hasSave: false,
        currentSector: 1,
        highestUnlockedSector: 1,
      };
    }
  }

  saveProgress(sectorId = this.currentLevelId) {
    const safeSectorId = this.levelConfigs[sectorId] ? sectorId : 1;

    const previousHighest = this.savedProgress?.highestUnlockedSector ?? 1;

    this.savedProgress = {
      hasSave: true,
      currentSector: safeSectorId,
      highestUnlockedSector: Math.max(previousHighest, safeSectorId),
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.savedProgress));

      console.log("[SAVE] Progress saved:", this.savedProgress);
    } catch (error) {
      console.warn("[SAVE] Не удалось сохранить прогресс:", error);
    }
  }

  deleteSavedProgress() {
    this.savedProgress = {
      hasSave: false,
      currentSector: 1,
      highestUnlockedSector: 1,
    };

    try {
      localStorage.removeItem(SAVE_KEY);
      console.log("[SAVE] Progress deleted");
    } catch (error) {
      console.warn("[SAVE] Не удалось удалить сохранение:", error);
    }
  }

  async prepareNewGame(onProgress = () => {}) {
    if (this.isPreparingGame) {
      return;
    }

    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(resolve));

    // Если комнаты уже были прогреты в этой вкладке,
    // не гоняем снова Room 1 → Room 2 → Room 3.
    if (this.hasPrewarmedRooms) {
      const quickStart = performance.now();

      onProgress("Быстрая подготовка…", 25);
      await nextFrame();

      // После первого полного прогрева тут уже не нужно снова собирать комнаты.
      // Даем UI один кадр, чтобы игрок увидел короткую проверку.
      onProgress("Проверка готовых шейдеров…", 75);
      await nextFrame();

      onProgress("Система готова", 100);
      await nextFrame();

      console.log(
        `[PREPARE] Quick start completed in ${Math.round(
          performance.now() - quickStart,
        )} ms`,
      );

      return;
    }

    this.isPreparingGame = true;

    const totalStart = performance.now();

    const compileCurrentScene = async () => {
      // Обновляем мировые матрицы перед компиляцией.
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);

      // Даём интерфейсу успеть показать новый этап.
      await nextFrame();

      if (typeof this.renderer.compileAsync === "function") {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        console.warn(
          "[PREPARE] compileAsync недоступен, используется compile().",
        );

        this.renderer.compile(this.scene, this.camera);
      }

      // Прогреваем ещё и цепочку EffectComposer / Bloom.
      this.renderer.info.reset();
      this.composer.render();

      await nextFrame();
    };

    const runStage = async (label, percentBefore, percentAfter, task) => {
      const stageStart = performance.now();

      onProgress(label, percentBefore);
      await nextFrame();

      await task();

      const stageTime = Math.round(performance.now() - stageStart);

      console.log(`[PREPARE] ${label} completed in ${stageTime} ms`);

      onProgress(`${label} готово`, percentAfter);
      await nextFrame();
    };

    try {
      await runStage("Подготовка комнаты 1…", 5, 25, async () => {
        // Комната 1 уже построена при создании LevelBuilder.
        await compileCurrentScene();
      });

      await runStage("Подготовка комнаты 2…", 25, 55, async () => {
        this.levelBuilder.buildRoom(2);

        if (this.cameraController) {
          this.cameraController.invalidateWallsCache();
        }

        await compileCurrentScene();
      });

      await runStage("Подготовка комнаты 3…", 55, 80, async () => {
        this.levelBuilder.buildRoom(3);

        if (this.cameraController) {
          this.cameraController.invalidateWallsCache();
        }

        await compileCurrentScene();
      });

      await runStage("Возврат в комнату 1…", 80, 96, async () => {
        this.levelBuilder.buildRoom(1);

        if (this.cameraController) {
          this.cameraController.invalidateWallsCache();
        }

        await compileCurrentScene();
      });

      // Возвращаем логическое состояние первой комнаты.
      this.currentLevelId = 1;
      this.targetLevelId = null;

      // Полный прогрев комнат успешно завершён.
      // Следующие "Новая игра" в этой вкладке будут быстрыми.
      this.hasPrewarmedRooms = true;

      const totalTime = Math.round(performance.now() - totalStart);

      onProgress(`Система готова за ${(totalTime / 1000).toFixed(1)} сек`, 100);
      await nextFrame();

      console.log(`[PREPARE] Full prewarm completed in ${totalTime} ms`);
    } catch (error) {
      console.error("[PREPARE] Ошибка прогрева комнат:", error);
      throw error;
    } finally {
      this.isPreparingGame = false;
    }
  }

  hardResetTransitions() {
    // Инвалидируем все старые отложенные действия переходов.
    this.transitionResetToken = (this.transitionResetToken || 0) + 1;

    // Останавливаем таймеры интро.
    if (this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = null;
    }

    if (this.introImpactCheck) {
      clearInterval(this.introImpactCheck);
      this.introImpactCheck = null;
    }

    // Останавливаем таймер финального выхода комнаты 2.
    if (this.roomExitCloseTimer) {
      clearTimeout(this.roomExitCloseTimer);
      this.roomExitCloseTimer = null;
    }

    // Сбрасываем лифтовые фазы.
    this.isElevatorSequenceActive = false;
    this.elevatorPhase = "";
    this.targetLevelId = null;
    this.activeRoomExitElevatorId = null;
    this.elevatorEntryDoor = null;
    this.elevatorHoldPos = null;
    this.roomExitHoldPos = null;
    this.elevatorStopStableTime = 0;
    this.isExitDoorClosingPending = false;

    if (this.playerController) {
      this.playerController.isLocked = false;
    }

    if (this.fadeScreen) {
      this.fadeScreen.style.opacity = "0";
    }

    this.unlockGameplayCamera?.();
  }

  beginExitToMenu() {
    // Начинаем мягкий выход: мир ещё виден за дверями,
    // но новые лифтовые триггеры и кат-сцены уже запрещены.
    this.isExitingToMenu = true;
    this.isGameActive = true;

    // Инвалидируем старые отложенные переходы.
    this.transitionResetToken = (this.transitionResetToken || 0) + 1;

    // Останавливаем опасные таймеры, которые могут позже открыть/закрыть двери.
    if (this.roomExitCloseTimer) {
      clearTimeout(this.roomExitCloseTimer);
      this.roomExitCloseTimer = null;
    }

    if (this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = null;
    }

    if (this.introImpactCheck) {
      clearInterval(this.introImpactCheck);
      this.introImpactCheck = null;
    }

    // Останавливаем старую лифтовую кат-сцену,
    // но НЕ замораживаем физику мгновенно.
    this.isElevatorSequenceActive = false;
    this.elevatorPhase = "";
    this.targetLevelId = null;
    this.activeRoomExitElevatorId = null;
    this.elevatorEntryDoor = null;
    this.elevatorHoldPos = null;
    this.roomExitHoldPos = null;
    this.elevatorStopStableTime = 0;
    this.isExitDoorClosingPending = false;

    if (this.playerController) {
      this.playerController.isLocked = true;

      // Не даём шару продолжать разгоняться от старого управления.
      if (this.playerController.keys) {
        for (const key in this.playerController.keys) {
          this.playerController.keys[key] = false;
        }
      }
    }

    if (audioManager?.stopOpenDoor) audioManager.stopOpenDoor();
    if (audioManager?.stopBoxSlide) audioManager.stopBoxSlide();
  }

  finishExitToMenu() {
    // Двери хаба уже закрылись. Теперь игровой мир действительно заморожен.
    this.isExitingToMenu = false;
    this.isGameActive = false;
    this.isPaused = true;

    if (this.playerController) {
      this.playerController.isLocked = true;
    }

    // Обнуляем dt, чтобы после долгого меню физика не получила большой скачок.
    this.lastTime = performance.now();
  }

  startGameplaySession() {
    this.hasStartedGame = true;

    if (!this.savedProgress?.hasSave) {
      this.saveProgress(this.currentLevelId);
    }

    // Новая игра или продолжение реально начались.
    this.isGameActive = true;
    this.isExitingToMenu = false;
    this.isPaused = false;

    if (this.playerController) {
      this.playerController.isLocked = false;
    }

    if (this.controls) {
      this.controls.enabled = true;
    }

    this.lastTime = performance.now();
  }

  lockGameplayCamera() {
    // Не делаем controls.unlock(), иначе появится обычный курсор.
    // Вместо этого оставляем Pointer Lock активным, но выключаем чувствительность мыши.
    if (this.controls) {
      if (this.savedPointerSpeed === undefined) {
        this.savedPointerSpeed = this.controls.pointerSpeed ?? 1.0;
      }

      this.controls.pointerSpeed = 0;
    }

    // Блокируем колесико зума.
    if (this.cameraController) {
      this.cameraController.enabled = false;
    }

    if (this.cameraPivot) {
      this.cameraPivot.rotation.z = 0;
    }
  }

  unlockGameplayCamera() {
    // Возвращаем чувствительность мыши.
    if (this.controls) {
      this.controls.pointerSpeed = this.savedPointerSpeed ?? 1.0;
      this.savedPointerSpeed = undefined;
    }

    // Возвращаем колесико зума.
    if (this.cameraController) {
      this.cameraController.enabled = true;
    }
  }

  getCurrentLevelConfig() {
    const config = this.levelConfigs[this.currentLevelId];

    if (!config) {
      console.warn(
        `[LEVEL] Missing config for level ${this.currentLevelId}. Falling back to level 1.`,
      );
      return this.levelConfigs[1];
    }

    return config;
  }

  getNextLevelId() {
    const config = this.getCurrentLevelConfig();
    return config.nextLevelId || null;
  }

  getCurrentExitTrigger() {
    const config = this.getCurrentLevelConfig();

    return (
      config.exitTrigger || {
        xMin: -4.0,
        xMax: 4.0,
        zMin: 15.0,
        zMax: 19.0,
      }
    );
  }

  getCurrentExitDoor() {
    const config = this.getCurrentLevelConfig();
    return config.entryDoor || "entrance";
  }

  loadLevel(levelId) {
    // Пока это только логическое переключение уровня.
    // На следующих этапах здесь будет:
    // unloadCurrentRoom();
    // buildRoom(levelId);
    this.currentLevelId = levelId;
    this.targetLevelId = null;
    this.saveProgress(levelId);
    console.log(`[LEVEL] Loaded level ${levelId}`);
  }

  getLevelStartPosition(levelId) {
    const config = this.levelConfigs[levelId];

    if (config && config.spawn) {
      return config.spawn;
    }

    return this.levelConfigs[1].spawn;
  }

  resetPlayerForLevel(levelId) {
    if (!this.playerController || !this.playerController.body) return;

    const startPos = this.getLevelStartPosition(levelId);
    const body = this.playerController.body;

    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.position.set(startPos.x, startPos.y, startPos.z);
    body.quaternion.set(0, 0, 0, 1);

    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.previousQuaternion.copy(body.quaternion);
    body.interpolatedQuaternion.copy(body.quaternion);

    body.wakeUp();

    if (this.playerController.mesh) {
      this.playerController.mesh.position.copy(body.position);
      this.playerController.mesh.quaternion.copy(body.quaternion);
    }

    if (this.playerController.shadowMesh) {
      this.playerController.shadowMesh.visible = true;
    }
  }

  resetElevatorForLevel(levelId) {
    if (!this.levelBuilder) return;

    // Сначала закрываем всё и сбрасываем числовые состояния.
    this.levelBuilder.closeEntrance();
    this.levelBuilder.closeExit();

    this.levelBuilder.entranceOpenState = 0;
    this.levelBuilder.targetEntranceOpenState = 0;

    this.levelBuilder.exitOpenState = 0;
    this.levelBuilder.targetExitOpenState = 0;

    this.isExitDoorClosingPending = false;

    if (levelId === 1) {
      // Комната 1: игрок стартует в самой комнате,
      // лифт находится в режиме входа.
      this.levelBuilder.setElevatorMode("entering");
    } else {
      // Комнаты 2, 3 и дальше:
      // игрок появляется внутри стартового лифта,
      // двери уже открыты в новую комнату.
      this.levelBuilder.setElevatorMode("exiting");

      this.levelBuilder.exitOpenState = 1;
      this.levelBuilder.targetExitOpenState = 1;

      if (this.levelBuilder.openExit) {
        this.levelBuilder.openExit();
      }
    }

    // Сразу применяем положение дверей к мешам,
    // чтобы после рестарта не было промежуточного состояния.
    if (this.levelBuilder.updateDoors) {
      this.levelBuilder.updateDoors(999);
    }
  }

  resetCameraForLevel(levelId) {
    if (!this.cameraPivot || !this.camera) return;

    const startPos = this.getLevelStartPosition(levelId);

    // Уровни 2, 3 и дальше: игрок появляется в стартовом лифте.
    // Камеру ставим чуть выше и дальше, чтобы она смотрела в комнату,
    // а не под ноги/в пол.
    if (levelId > 1) {
      this.cameraPivot.position.set(startPos.x, startPos.y + 5.5, startPos.z);

      // Наклон вниз, но не слишком крутой.
      // Было -Math.PI / 6. Делаем чуть мягче.
      this.cameraPivot.rotation.set(-0.6, 0, 0);

      if (this.cameraController) {
        this.cameraController.currentZoom = 18.0;
        this.cameraController.targetZoom = 18.0;
      }

      this.camera.position.set(0, 0, 18.0);
      this.camera.rotation.set(0, 0, 0);

      return;
    }

    // Уровень 1 оставляем как раньше.
    this.cameraPivot.position.set(startPos.x, startPos.y + 4.0, startPos.z);
    this.cameraPivot.rotation.set(-Math.PI / 6, 0, 0);

    if (this.cameraController) {
      this.cameraController.currentZoom = 15.0;
      this.cameraController.targetZoom = 15.0;
    }

    this.camera.position.set(0, 0, 15.0);
    this.camera.rotation.set(0, 0, 0);
  }

  startDirectLevelTransition(nextLevelId) {
    if (!nextLevelId || !this.levelBuilder || !this.playerController) return;

    const playerRef = this.playerController;

    this.targetLevelId = nextLevelId;
    this.isElevatorSequenceActive = true;
    this.elevatorPhase = "level_direct_transition";

    playerRef.isLocked = true;
    this.lockGameplayCamera();

    playerRef.body.velocity.set(0, 0, 0);
    playerRef.body.angularVelocity.set(0, 0, 0);

    this.fadeScreen.style.opacity = "1";

    setTimeout(() => {
      // В темноте строим следующий уровень.
      this.levelBuilder.buildRoom(nextLevelId);
      this.loadLevel(nextLevelId);

      // Сбрасываем лифт и ставим игрока в стартовую позицию нового уровня.
      this.resetElevatorForLevel(nextLevelId);
      this.resetPlayerForLevel(nextLevelId);
      this.resetCameraForLevel(nextLevelId);

      // Подготавливаем матрицы и шейдеры новой комнаты,
      // пока экран ещё полностью чёрный.
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
      // Временно отключено для проверки стартового прогрева.
      // this.renderer.compile(this.scene, this.camera);

      if (this.cameraController) {
        this.cameraController.invalidateWallsCache();
        this.cameraController.currentZoom = 15.0;
        this.cameraController.targetZoom = 15.0;
      }

      // Для уровней после первого игрок появляется внутри кабины,
      // а затем выезжает через выходные двери в новую комнату.
      if (nextLevelId > 1 && this.levelBuilder) {
        this.levelBuilder.setElevatorMode("exiting");

        // Двери сначала закрыты, чтобы игрок появился именно в лифте.
        this.levelBuilder.closeExit();
      }

      this.elevatorPhase = "opening_doors";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.fadeScreen.style.opacity = "0";
        });
      });

      // Даём экрану немного "проявиться", затем открываем двери лифта.
      setTimeout(() => {
        if (this.levelBuilder) {
          this.levelBuilder.openExit();
        }

        // Ждём, пока створки разъедутся, и только потом возвращаем управление.
        setTimeout(() => {
          playerRef.isLocked = false;
          this.unlockGameplayCamera();

          this.isElevatorSequenceActive = false;
          this.elevatorPhase = "";
          this.targetLevelId = null;
          this.activeRoomExitElevatorId = null;
        }, 1200);
      }, 600);
    }, 2200);
  }

  resetToLevel(levelId) {
    this.loadLevel(levelId);

    this.isElevatorSequenceActive = false;
    this.elevatorPhase = "";
    this.isExitDoorClosingPending = false;

    if (this.fadeScreen) {
      this.fadeScreen.style.opacity = "0";
    }

    if (this.playerController) {
      this.playerController.isLocked = false;
    }

    this.resetElevatorForLevel(levelId);
    this.resetPlayerForLevel(levelId);
    this.resetCameraForLevel(levelId);
  }

  start3DIntro() {
    this.isIntroPlaying = true;
    if (this.controls) this.controls.enabled = false;

    if (this.introTimeout) clearTimeout(this.introTimeout);
    if (this.introImpactCheck) clearInterval(this.introImpactCheck);
    this.shakeIntensity = 0; // Сбрасываем тряску при новом запуске

    const dropX = 0; // Бросаем ровно по центру
    const dropZ = 30;
    const impactY = CONFIG.WORLD.FLOOR_LEVEL + CONFIG.PLAYER.RADIUS;

    this.playerController.shadowMesh.visible = false;
    this.playerController.body.mass = 0;
    this.playerController.body.type = CANNON.Body.STATIC;
    this.playerController.body.position.set(dropX, 25, dropZ);
    this.playerController.body.velocity.set(0, 0, 0);
    this.playerController.body.angularVelocity.set(0, 0, 0);
    this.playerController.body.updateMassProperties();

    this.cameraPivot.position.set(dropX, impactY + 4.0, dropZ);

    this.introTimeout = setTimeout(() => {
      this.playerController.body.mass = CONFIG.PLAYER.MASS;
      this.playerController.body.type = CANNON.Body.DYNAMIC;
      this.playerController.body.updateMassProperties();
      this.playerController.body.wakeUp();

      this.introImpactCheck = setInterval(() => {
        // Ждем самого момента касания (+ 0.2)
        if (this.playerController.body.position.y <= impactY + 0.2) {
          clearInterval(this.introImpactCheck);

          // ФИКС РЫВКА: Гасим инерцию, чтобы тяжелый шар не отскакивал как мячик.
          // Он тяжело шлепнется и останется ровно в координатах приземления!
          this.playerController.body.velocity.set(0, 0, 0);

          this.playSeamlessIntroTransition();
        }
      }, 16);
    }, 1500);
  }

  playSeamlessIntroTransition() {
    this.playerController.shadowMesh.visible = true;
    this.createDustExplosion(this.playerController.body.position, 1.5);

    // ЗАДАЕМ СИЛУ ТРЯСКИ (0.8 - это довольно сильный удар, можешь менять)
    this.shakeIntensity = 0.8;

    setTimeout(() => {
      // Отключаем режим интро и отдаем управление мыши
      this.isIntroPlaying = false;
      if (this.controls) this.controls.enabled = true;
    }, 200);
  }

  initSceneObjects() {
    // 1. Уровень
    this.levelBuilder = new LevelBuilder(
      this.sceneManager,
      this.physicsManager,
    );
    this.levelBuilder.build();

    // 2. Мелкие шарики (инстансы оставляем как есть, это эффективно)
    const ballGeo = new THREE.SphereGeometry(
      CONFIG.PHYSICS.BALL_RADIUS,
      16,
      16,
    );
    this.ballShape = new CANNON.Sphere(CONFIG.PHYSICS.BALL_RADIUS);
    this.ballInstancedMesh = new THREE.InstancedMesh(
      ballGeo,
      this.ballMat,
      CONFIG.PHYSICS.MAX_BALLS,
    );
    this.ballInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ballInstancedMesh.castShadow = true;
    this.ballInstancedMesh.receiveShadow = true;
    this.scene.add(this.ballInstancedMesh);

    this.dummyObj = new THREE.Object3D();
    this.dummyObj.scale.set(0, 0, 0);
    this.dummyObj.updateMatrix();
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      this.ballInstancedMesh.setColorAt(i, new THREE.Color(0xffffff));
    }

    this.interactivePlatforms = [];
  }

  clearBalls() {
    if (this.activeBallsCount === 0) return;

    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        if (Math.random() < 0.3) {
          this.createDustExplosion(body.position, 0.15);
        }

        this.world.removeBody(body);
        this.ballsPool[i] = null;
      }

      this.dummyObj.scale.set(0, 0, 0);
      this.dummyObj.updateMatrix();
      this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.updateBeadsBlinking();
    this.ballInstancedMesh.instanceMatrix.needsUpdate = true;
    this.activeBallsCount = 0;
    this.ballSpawnIndex = 0;
  }

  flickerLights() {
    const sequence = [100, 150, 50, 200, 50, 500]; // Паузы между вспышками в мс
    let currentStep = 0;

    const nextFlicker = () => {
      if (currentStep >= sequence.length) {
        document.body.classList.add("lights-on"); // Финальное включение
        return;
      }

      // Переключаем класс туда-сюда для вспышки
      document.body.classList.toggle("lights-on");

      setTimeout(() => {
        nextFlicker();
      }, sequence[currentStep++]);
    };

    nextFlicker();
  }

  resetScene(options = {}) {
    const { rebuildRoom = true, levelId = this.currentLevelId || 1 } = options;

    this.hardResetTransitions();

    // Считаем, что после reset игра должна оказаться именно
    // в том уровне, который нам передали.
    this.currentLevelId = levelId;
    this.targetLevelId = null;

    if (this.levelBuilder && rebuildRoom) {
      this.levelBuilder.buildRoom(levelId);

      if (this.cameraController) {
        this.cameraController.invalidateWallsCache();
      }
    }
    // === 1. СБРОС ЛИФТА И КАТ-СЦЕНЫ ===
    this.resetElevatorForLevel(levelId);

    this.isElevatorSequenceActive = false;
    this.elevatorPhase = "";
    this.isExitDoorClosingPending = false; // <--- ДОБАВИТЬ ЭТОТ ФЛАГ
    if (this.fadeScreen) this.fadeScreen.style.opacity = "0";
    if (this.playerController) this.playerController.isLocked = false;

    // ПОЛНЫЙ СБРОС КАМЕРЫ: Очищаем углы поворота, чтобы интро всегда начиналось с чистого листа
    if (this.cameraPivot) {
      this.cameraPivot.rotation.set(0, 0, 0);
    }
    // Отключаем контроллер на время сброса и интро, чтобы он не мешал математике
    if (this.controls) {
      this.controls.enabled = false;
    }
    // === СБРОС ШАРИКА-ИГРОКА ===
    // Ставим игрока в spawn текущего/выбранного уровня.
    this.resetPlayerForLevel(levelId);

    // === СБРОС КАМЕРЫ ПОД ЭТОТ УРОВЕНЬ ===
    this.resetCameraForLevel(levelId);

    // === СБРОС ИНТЕРАКТИВНЫХ ПЛАТФОРМ (ЯЩИКОВ) ===
    // Смотри, как чисто! Вся логика спрятана внутри класса InteractiveBox
    if (this.interactivePlatforms) {
      this.interactivePlatforms.forEach((platform) => platform.reset());
    }

    // Сброс UI и стейта
    if (store && typeof store.get === "function") {
      const currentState = store.get();
      if (typeof store.set === "function") {
        store.set({ ...currentState, currentTool: -1, paintToolColor: -1 });
      } else if (typeof store.update === "function") {
        store.update({ currentTool: -1, paintToolColor: -1 });
      }
      if (store.get().mode === "space") {
        const btnZeroG = document.getElementById("btn-zerog");
        if (btnZeroG) btnZeroG.click();
      }
    }

    document.body.classList.remove("is-pressing");

    document
      .querySelectorAll(".mag-main-btn, .paint-btn, .palette-item")
      .forEach((btn) => {
        btn.classList.remove("active", "active-state", "is-selecting");
      });

    if (typeof isSlowMo === "function" && isSlowMo()) {
      const btnSlow = document.getElementById("btn-slow");
      if (btnSlow) btnSlow.click();
    }

    if (this.fansActive) {
      const btnFans = document.getElementById("btn-fans");
      if (btnFans) {
        btnFans.click();
      } else {
        this.fansActive = false;
      }
    }
    this.fanLevel = 0.0;

    this.startShrinkingBalls();

    // Сбрасываем цвета букв через новый WordManager
    if (this.wordManager && this.wordManager.letterObjects) {
      this.wordManager.letterObjects.forEach((obj, i) => {
        const palette = CONFIG.COLORS.GOOGLE_PALETTE;
        obj.body.userData.googleColor = palette[i % palette.length];
      });

      // Если буквы уже открыты (по сюжету) — возвращаем их на старт.
      if (this.wordManager.lettersEnabled) {
        this.wordManager.returnLettersToStart();
      }
    }
  }

  setupStateReactions() {
    let lastMode = store.get().mode;
    let lastTool = store.get().currentTool;

    store.subscribe((state) => {
      if (state.mode !== lastMode) {
        this.fansActive = false;
        this.fanLevel = 0.0;
        lastMode = state.mode;
      }
      this.sceneManager.setAtmosphere(state.mode, CONFIG.COLORS);
      // КОММЕНТИРУЕМ ЭТИ ДВЕ СТРОКИ:
      // if (!this.world.bodies.includes(this.platformBody))
      //   this.world.addBody(this.platformBody);

      if (state.mode === "disco") {
        for (const l of this.wordManager.letterObjects) {
          l.mesh.material.emissiveIntensity = 0.02;
          l.mesh.material.roughness = 0.25;
          l.mesh.material.color.setHex(l.body.userData.googleColor);
        }
        this.setBallGlow(true);
      } else {
        for (const l of this.wordManager.letterObjects) {
          l.mesh.material.emissiveIntensity = 0.0;
          l.mesh.material.roughness = 0.5;
          l.mesh.material.color.setHex(l.body.userData.googleColor);
        }
        this.setBallGlow(false);
      }

      if (state.currentTool !== lastTool) {
        const wasMagnet = lastTool !== -1;
        const isMagnet = state.currentTool !== -1;

        if (wasMagnet !== isMagnet) {
          if (isMagnet) {
            if (this.wordManager.lettersEnabled) {
              this.wordManager.hideLettersSmoothly();
              this.lettersHiddenByMagnet = true;
            }
          } else {
            if (this.lettersHiddenByMagnet) {
              this.wordManager.showLettersSmoothly();
              this.lettersHiddenByMagnet = false;
            }
          }
          this.updateBeadsBlinking();
        }
        lastTool = state.currentTool;
      }
    });
  }

  setBallGlow(enabled) {
    if (enabled) {
      this.ballMat.emissive.setHex(0x000000);
      this.ballMat.emissiveIntensity = 0.0;
      this.ballMat.metalness = 0.75;
      this.ballMat.roughness = 0.15;
    } else {
      this.ballMat.emissive.setHex(0x000000);
      this.ballMat.emissiveIntensity = 0.0;
      this.ballMat.metalness = 0.3;
      this.ballMat.roughness = 0.15;
    }
    this.ballMat.needsUpdate = true;
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        this.ballInstancedMesh.setColorAt(
          i,
          new THREE.Color(body.userData.originalColorHex),
        );
      }
    }
    if (this.ballInstancedMesh.instanceColor)
      this.ballInstancedMesh.instanceColor.needsUpdate = true;
  }

  startShrinkingBalls() {
    if (this.activeBallsCount === 0) return;

    const shrinkDuration = 0.8;
    const startTime = performance.now();

    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        body.userData.isShrinking = true;
        body.userData.shrinkStartTime = startTime;
        body.userData.shrinkDuration = shrinkDuration * 1000;

        body.collisionFilterMask = 0;
      }
    }

    this.activeBallsCount = 0;
    this.ballSpawnIndex = 0;

    this.updateBeadsBlinking();
  }

  turnOnLabLights() {
    this.sceneManager.labPanels.forEach((panel, index) => {
      if (panel.group.userData.isAnimating) return;
      panel.group.userData.isAnimating = true;

      // Сценарий вспышек: val - яркость, delay - время до следующего шага
      const sequence = [
        { val: 0.2, delay: 100 },
        { val: 0.0, delay: 50 + Math.random() * 50 }, // Случайная пауза для реализма
        { val: 0.6, delay: 150 },
        { val: 0.0, delay: 50 },
        { val: 1.0, delay: 0 },
      ];

      let currentStep = 0;

      // Делаем задержку: вторая лампа начнет моргать на четверть секунды позже первой
      setTimeout(() => {
        const flicker = () => {
          if (currentStep < sequence.length) {
            panel.group.userData.intensity = sequence[currentStep].val;

            // Заготовка: когда добавим звук, он будет воспроизводиться на каждой вспышке
            if (
              sequence[currentStep].val > 0 &&
              typeof audioManager !== "undefined" &&
              audioManager.playFlickerSound
            ) {
              audioManager.playFlickerSound();
            }

            setTimeout(
              () => {
                currentStep++;
                flicker();
              },
              sequence[currentStep - 1]?.delay || 0,
            );
          } else {
            panel.group.userData.isAnimating = false;
          }
        };
        flicker();
      }, index * 250);
    });
  }

  spawnBalls() {
    for (let i = 0; i < 40; i++) {
      const idx = this.ballSpawnIndex;
      const oldBody = this.ballsPool[idx];

      if (oldBody) {
        this.createDustExplosion(oldBody.position, 0.2);
        this.world.removeBody(oldBody);
      } else {
        this.activeBallsCount++;
      }

      const colorHex =
        CONFIG.COLORS.GOOGLE_UNIQUE[
          Math.floor(Math.random() * CONFIG.COLORS.GOOGLE_UNIQUE.length)
        ];
      const x = (Math.random() - 0.5) * 20,
        y = 8 + Math.random() * 5,
        z = (Math.random() - 0.5) * 10;

      const body = new CANNON.Body({
        mass: CONFIG.PHYSICS.BALL_MASS,
        material: this.matBouncy,
        angularDamping: 0.1,
        linearDamping: 0.01,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS,
        collisionFilterMask:
          CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS,
      });
      body.addShape(this.ballShape);
      body.position.set(x, y, z);
      this.world.addBody(body);
      body.userData = { originalColorHex: colorHex, instanceId: idx };
      this.ballsPool[idx] = body;
      this.ballSpawnIndex =
        (this.ballSpawnIndex + 1) % CONFIG.PHYSICS.MAX_BALLS;
    }

    this.setBallGlow(isNight());

    this.updateBeadsBlinking();
  }

  paintRoom(colorIndex) {
    const colors = CONFIG.COLORS.GOOGLE_UNIQUE;
    const targetColor = colors[colorIndex];

    const camPos = this.camera.position;
    const sprayDir = new THREE.Vector3()
      .subVectors(this.inputManager.interactionTarget, camPos)
      .normalize();

    // 1. ОБРАБОТКА БУКВ (Высокая чувствительность, без физической отдачи)
    if (this.wordManager && this.wordManager.letterObjects) {
      this.wordManager.letterObjects.forEach((obj) => {
        if (
          !this.wordManager.lettersEnabled ||
          obj.body.collisionFilterMask === 0
        )
          return;

        const v = new THREE.Vector3().subVectors(obj.body.position, camPos);
        const distAlongRay = v.dot(sprayDir);

        if (distAlongRay > 0 && distAlongRay < 40) {
          const perpDist = v.clone().cross(sprayDir).length();

          // Увеличенный радиус захвата специально для букв (было ~0.5, стало 1.8)
          const letterSensitivity = 1.8 + distAlongRay * 0.12;

          if (perpDist < letterSensitivity) {
            obj.body.userData.googleColor = targetColor;
            // Физический импульс (applyImpulse) удален, чтобы буквы оставались на месте
          }
        }
      });
    }

    // 2. ОБРАБОТКА ШАРИКОВ (Старая логика: малый радиус и физический отброс)
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        this._tempVec.subVectors(body.position, camPos);
        const distAlongRay = this._tempVec.dot(sprayDir);

        if (distAlongRay > 0 && distAlongRay < 40) {
          const perpDist = this._tempVec.cross(sprayDir).length();
          const ballRadius = 0.5 + distAlongRay * 0.075;

          if (perpDist < ballRadius) {
            body.userData.originalColorHex = targetColor;
            this.ballInstancedMesh.setColorAt(i, new THREE.Color(targetColor));

            const pushForce = 1.0 - distAlongRay / 40.0;
            this._tempSpread.set(
              (Math.random() - 0.5) * 0.6,
              (Math.random() - 0.5) * 0.6,
              (Math.random() - 0.5) * 0.6,
            );

            this._tempDir
              .copy(sprayDir)
              .add(this._tempSpread)
              .normalize()
              .multiplyScalar(pushForce * 0.0005);
            this._tempCannonVec.set(
              this._tempDir.x,
              this._tempDir.y,
              this._tempDir.z,
            );

            body.applyImpulse(this._tempCannonVec, body.position);
          }
        }
      }
    }

    if (this.ballInstancedMesh.instanceColor) {
      this.ballInstancedMesh.instanceColor.needsUpdate = true;
    }
    if (
      Math.random() < 0.1 &&
      typeof audioManager !== "undefined" &&
      audioManager.playPuffSound
    ) {
      audioManager.playPuffSound(0.2);
    }
  }

  updateBeadsBlinking() {
    const isMagnet = store.get().currentTool !== -1;
    const hasNoBalls = this.activeBallsCount === 0;

    const btn = this.uiManager.elements.btnBalls;

    if (isMagnet && hasNoBalls) {
      if (!btn.classList.contains("needs-attention")) {
        btn.classList.add("needs-attention");
      }
    } else {
      btn.classList.remove("needs-attention");
    }
  }

  spawnMiniBeads(pos, colorHex) {
    for (let i = 0; i < 12; i++) {
      this.miniBeadPool.spawn(pos, colorHex);
    }
  }

  createDustExplosion(pos, intensity01) {
    // Уменьшили количество частиц в 2.5 раза (было 60 + 40, стало 25 + 15)
    const cloudCount = 25 + Math.floor(15 * intensity01);

    for (let i = 0; i < cloudCount; i++) {
      const angle = Math.random() * Math.PI * 2;

      // Скорость разлета стала еще меньше
      const speed = 0.15 + Math.random() * 0.2;

      const spawnRadius = 0.3 + Math.random() * 0.6;
      const spawnPos = new THREE.Vector3(
        pos.x + Math.cos(angle) * spawnRadius,
        pos.y - 0.8 + Math.random() * 0.2,
        pos.z + Math.sin(angle) * spawnRadius,
      );

      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        0.01 + Math.random() * 0.03, // Практически не поднимается вверх
        Math.sin(angle) * speed,
      );

      // Масштаб немного убавили, чтобы они не перекрывали весь экран
      const scale = 1.5 + Math.random() * 1.5;

      // Время жизни (скорость затухания)
      const decay = 0.006 + Math.random() * 0.006;

      this.dustPool.spawn(spawnPos, vel, scale, 1.0, decay);
    }
  }

  createHeatAirPuff(x, z, env) {
    const spawnPos = new THREE.Vector3(
      x + (Math.random() - 0.5) * 0.8,
      CONFIG.WORLD.FLOOR_LEVEL + 0.18,
      z + (Math.random() - 0.5) * 0.8,
    );
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.08,
      0.55 + Math.random() * 0.7,
      (Math.random() - 0.5) * 0.08,
    );
    if (isSlowMo()) vel.multiplyScalar(0.75);
    const scale = 0.55 + Math.random() * 0.7;

    this.heatPool.spawn(spawnPos, vel, scale, 1.0 * env, 0.032);
  }

  tick(currentTime) {
    requestAnimationFrame(this.tick);
    if (this.isPreparingGame) {
      return;
    }
    // Пока хаб-двери полностью закрыты и игрок в главном меню,
    // не считаем физику, инпут, лифты и триггеры.
    // Рендер оставляем, чтобы фон/сцена под меню отображались.
    if (!this.isGameActive && !this.isExitingToMenu) {
      this.lastTime = currentTime;

      this.renderer.info.reset();
      this.composer.render();

      return;
    }

    this.fpsFrameCount++;

    if (!this.isPaused) {
      let dt = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;
      if (dt > 0.1) dt = 0.1;

      const timeSec = currentTime / 1000;

      // 1. Считаем физику
      this.physicsManager.step(dt, isSlowMo());

      // 2. Считаем глобальный инпут мыши (магнит, краска)
      this.inputManager.update(dt);

      // 3 и 4. Обновляем игрока и камеру
      if (!this.isIntroPlaying) {
        this.playerController.update(dt);

        if (
          !this.isElevatorSequenceActive ||
          this.elevatorPhase === "opening_doors"
        ) {
          // ИГРОВОЙ РЕЖИМ:
          // Финальный лифт уровня 2 не включаем сюда,
          // потому что у него ниже есть своя постановочная камера.
          this.cameraController.update(dt, this.playerController.mesh.position);
        } else if (
          this.elevatorPhase === "waiting_entrance_open" ||
          this.elevatorPhase === "rolling" ||
          this.elevatorPhase === "doors_closing"
        ) {
          // КИНЕМАТОГРАФИЧЕСКИЙ РЕЖИМ:
          // камера плавно отъезжает и смотрит на лифт.
          const targetCamPos = new THREE.Vector3(0, 6, 24);
          this.cameraPivot.position.lerp(targetCamPos, dt * 2.0);

          this.cameraPivot.rotation.x = THREE.MathUtils.lerp(
            this.cameraPivot.rotation.x,
            -0.1,
            dt * 2.0,
          );

          this.cameraPivot.rotation.y = THREE.MathUtils.lerp(
            this.cameraPivot.rotation.y,
            0,
            dt * 2.0,
          );

          this.cameraPivot.rotation.z = 0;
        }
      } else {
        // Синхронизируем графику падающего шара (Интро)
        this.playerController.mesh.position.copy(
          this.playerController.body.position,
        );
        this.playerController.mesh.quaternion.copy(
          this.playerController.body.quaternion,
        );

        // ИДЕАЛЬНЫЙ ТРЮК: скармливаем камере точку приземления
        const impactY = CONFIG.WORLD.FLOOR_LEVEL + CONFIG.PLAYER.RADIUS;

        // Было x = -4.
        // Из-за этого при передаче управления камера могла дёргаться,
        // потому что шар реально падает в x = 0.
        const landingPos = new THREE.Vector3(0, impactY, 30);

        // Было 15.0.
        // Чуть приближаем камеру к шару, чтобы переход к игровой камере был мягче.
        this.cameraController.currentZoom = 13.0;
        this.cameraController.targetZoom = 13.0;
        this.cameraController.update(dt, landingPos);

        // Было 0.15.
        // Чуть сильнее опускаем взгляд вниз, чтобы потолочные лампы меньше попадали в кадр.
        this.cameraPivot.rotation.set(-0.05, Math.PI / 2, 0);
      }

      // === ПРАВИЛЬНАЯ ТРЯСКА ЭКРАНА ===
      // Срабатывает каждый кадр, сдвигая камеру, а затем плавно затухает
      if (this.shakeIntensity > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;

        // Уменьшаем силу тряски (затухание)
        this.shakeIntensity -= dt * 3.5;
        if (this.shakeIntensity < 0) this.shakeIntensity = 0;
      }

      // 5. Обновляем партиклы, магниты и окружение
      const state = this.updateEnvironment(dt, timeSec);
      this.updatePhysics(
        dt,
        timeSec,
        state.isMagnetEquipped,
        state.isMagnetPulling,
        state.activeColor,
      );

      this.dustPool.update(isSlowMo());
      this.heatPool.update(isSlowMo());
      this.paintPools.forEach((pool) => pool.update(isSlowMo()));
      this.miniBeadPool.update(dt);

      // Обновляем двери лифта
      if (this.levelBuilder) {
        this.levelBuilder.updateDoors(dt);
      }

      // === 1. АВТОМАТИЧЕСКИЙ НЕВИДИМЫЙ ТРИГГЕР ===
      // На будущее: когда сделаем квесты, эта переменная будет становиться true
      // только после того, как игрок выполнит задание (например, раскрасит все буквы).
      const isElevatorUnlocked = true;

      if (
        this.isGameActive &&
        !this.isExitingToMenu &&
        !this.isElevatorSequenceActive &&
        this.levelBuilder &&
        this.playerController &&
        isElevatorUnlocked
      ) {
        const pPos = this.playerController.body.position;

        const exitTrigger = this.getCurrentExitTrigger();

        const isPlayerInLevelExit =
          pPos.x > exitTrigger.xMin &&
          pPos.x < exitTrigger.xMax &&
          pPos.z > exitTrigger.zMin &&
          pPos.z < exitTrigger.zMax;

        if (isPlayerInLevelExit) {
          const nextLevelId = this.getNextLevelId();

          // Если следующего уровня ещё нет, переход не запускаем.
          // ВАЖНО: не делаем return из tick(), иначе игра визуально "зависает".
          if (!nextLevelId) {
            if (!this.noNextLevelWarningShown) {
              console.warn(
                "[LEVEL] Next level does not exist yet. Level exit is disabled.",
              );
              this.noNextLevelWarningShown = true;
            }
          } else {
            this.noNextLevelWarningShown = false;

            this.targetLevelId = nextLevelId;
            this.elevatorEntryDoor = this.getCurrentExitDoor();

            // Сначала отбираем управление, но НЕ обнуляем скорость.
            // Шар должен самостоятельно приземлиться, докатиться
            // и полностью погасить инерцию.
            this.isElevatorSequenceActive = true;
            this.elevatorPhase = "waiting_for_elevator_stop";
            this.elevatorStopStableTime = 0;

            this.elevatorHoldPos = null;
            this.roomExitHoldPos = null;

            this.playerController.isLocked = true;
            this.lockGameplayCamera();

            // На этом этапе двери ещё не открываем.
            // Переход к конкретной кат-сцене произойдёт только после остановки.
          }
        } else {
          this.noNextLevelWarningShown = false;
        }
      }

      // === 2. КАТ-СЦЕНА И АВТОПИЛОТ ===
      if (
        this.isGameActive &&
        !this.isExitingToMenu &&
        this.isElevatorSequenceActive &&
        this.levelBuilder
      ) {
        const playerRef = this.playerController;

        // === ОЖИДАНИЕ ПОЛНОЙ ОСТАНОВКИ ПЕРЕД КАТ-СЦЕНОЙ ===
        if (
          this.elevatorPhase === "waiting_for_elevator_stop" &&
          playerRef &&
          playerRef.body
        ) {
          const body = playerRef.body;
          const pPos = body.position;
          const exitTrigger = this.getCurrentExitTrigger();

          const isStillInsideExit =
            pPos.x > exitTrigger.xMin &&
            pPos.x < exitTrigger.xMax &&
            pPos.z > exitTrigger.zMin &&
            pPos.z < exitTrigger.zMax;

          // Если шар по инерции выкатился из зоны,
          // отменяем запуск кат-сцены и возвращаем управление.
          if (!isStillInsideExit) {
            this.isElevatorSequenceActive = false;
            this.elevatorPhase = "";
            this.elevatorStopStableTime = 0;
            this.targetLevelId = null;
            this.elevatorEntryDoor = null;

            playerRef.isLocked = false;
            this.unlockGameplayCamera();
          } else {
            const horizontalSpeed = Math.hypot(
              body.velocity.x,
              body.velocity.z,
            );

            const verticalSpeed = Math.abs(body.velocity.y);
            const angularSpeed = body.angularVelocity.length();

            const isFullyStopped =
              playerRef.isGrounded === true &&
              horizontalSpeed < 0.35 &&
              verticalSpeed < 0.25 &&
              angularSpeed < 0.8;

            // Остановка должна сохраняться несколько кадров подряд.
            if (isFullyStopped) {
              this.elevatorStopStableTime += dt;
            } else {
              this.elevatorStopStableTime = 0;
            }

            if (this.elevatorStopStableTime >= 0.25) {
              this.elevatorStopStableTime = 0;

              // Убираем только остаточное физическое микродвижение.
              body.velocity.set(0, 0, 0);
              body.angularVelocity.set(0, 0, 0);

              // Отдельный финальный лифт уровня 2.
              if (this.elevatorEntryDoor === "none") {
                this.elevatorPhase = "room_exit_opening";
                this.roomExitHoldPos = null;

                if (this.roomExitCloseTimer) {
                  clearTimeout(this.roomExitCloseTimer);
                  this.roomExitCloseTimer = null;
                }

                if (
                  this.currentLevelId === 2 &&
                  this.levelBuilder.openRoom2Exit
                ) {
                  this.activeRoomExitElevatorId = "room2_exit";

                  if (this.levelBuilder.openRoomElevator) {
                    this.levelBuilder.openRoomElevator(
                      this.activeRoomExitElevatorId,
                    );
                  } else {
                    this.levelBuilder.openRoom2Exit();
                  }
                }
              } else {
                // Обычный лифт первого сектора.
                this.elevatorPhase = "waiting_entrance_open";
                this.elevatorHoldPos = null;

                if (this.elevatorEntryDoor === "exit") {
                  this.levelBuilder.openExit();
                } else if (this.elevatorEntryDoor === "entrance") {
                  this.levelBuilder.openEntrance();
                }
              }
            }
          }
        }

        // === ФИНАЛЬНЫЙ ЛИФТ УРОВНЯ 2 ===
        // Фазы:
        // room_exit_opening       — камера выравнивается, двери открываются;
        // room_exit_rolling       — шар подкатывается к проёму;
        // room_exit_doors_closing — шар зафиксирован, двери закрываются, потом fade.
        if (
          (this.elevatorPhase === "room_exit_opening" ||
            this.elevatorPhase === "room_exit_rolling" ||
            this.elevatorPhase === "room_exit_doors_closing") &&
          playerRef &&
          playerRef.body
        ) {
          const pPos = playerRef.body.position;

          // Центр финального лифта уровня 2.
          const exitX = 14.55;
          const exitZ = -31.15;

          // === ПОСТАНОВОЧНАЯ КАМЕРА ===
          // ВАЖНО: во время этой кат-сцены ставим сам cameraPivot
          // в позицию камеры внутри комнаты, а camera держим в нуле.
          // Так камера не улетает "за спину" pivot-а и не вылетает за текстуры.

          const cameraWorldPos = new THREE.Vector3(
            -11.0, // дальше от лифта, глубже в комнату
            pPos.y + 11.0, // выше, почти под потолком
            exitZ, // строго напротив лифта
          );

          const lookTarget = new THREE.Vector3(
            13.0, // смотрим на область перед дверьми
            pPos.y + 1.6, // ниже цели, чтобы камера смотрела вниз под углом
            exitZ,
          );

          // Плавно двигаем сам pivot в позицию камеры.
          this.cameraPivot.position.lerp(cameraWorldPos, dt * 2.5);

          // Камера находится прямо в pivot-е.
          this.camera.position.set(0, 0, 0);
          this.camera.rotation.set(0, 0, 0);

          // Поворачиваем pivot на цель.
          // Так как камера сидит внутри cameraPivot как дочерний объект,
          // направление получается зеркальным, поэтому разворачиваем pivot на 180°.
          this.cameraPivot.lookAt(lookTarget);
          this.cameraPivot.rotateY(Math.PI);
          this.cameraPivot.rotation.z = 0;

          // Точка остановки шара ВНУТРИ финального лифта уровня 2.
          // Лифт стоит на правой стене, кабина уходит по +X.
          const targetX = 17.6;
          const targetZ = exitZ;

          // 1. Ждём, пока двери финального лифта достаточно открылись.
          if (this.elevatorPhase === "room_exit_opening") {
            playerRef.body.velocity.set(0, 0, 0);
            playerRef.body.angularVelocity.set(0, 0, 0);

            const roomExitOpenState =
              this.levelBuilder.getRoomElevatorOpenState?.(
                this.activeRoomExitElevatorId,
              ) ??
              this.levelBuilder.room2ExitOpenState ??
              0;

            if (roomExitOpenState > 0.82) {
              this.elevatorPhase = "room_exit_rolling";
            }
          }

          // 2. Автоподкат шара к проёму.
          if (this.elevatorPhase === "room_exit_rolling") {
            const dir = new THREE.Vector3(
              targetX - pPos.x,
              0,
              targetZ - pPos.z,
            );
            const dist = dir.length();

            if (dist > 0.08) {
              dir.normalize();

              // Чем ближе к цели, тем мягче докатывание.
              // Кривая скорости:
              // далеко — быстро, ближе к цели — плавное замедление.
              const speed = THREE.MathUtils.clamp(dist * 4.2, 0.75, 6.2);
              const radius = CONFIG.PLAYER.RADIUS || 1.5;

              const vx = dir.x * speed;
              const vz = dir.z * speed;

              playerRef.body.velocity.x = vx;
              playerRef.body.velocity.z = vz;

              playerRef.body.angularVelocity.x = vz / radius;
              playerRef.body.angularVelocity.z = -vx / radius;
            } else {
              // Доехали: НЕ телепортируем шар в targetX/targetZ.
              // Фиксируем его там, где он реально остановился.
              playerRef.body.velocity.set(0, 0, 0);
              playerRef.body.angularVelocity.set(0, 0, 0);

              this.roomExitHoldPos = new THREE.Vector3(
                playerRef.body.position.x,
                playerRef.body.position.y,
                playerRef.body.position.z,
              );

              playerRef.body.previousPosition.copy(playerRef.body.position);
              playerRef.body.interpolatedPosition.copy(playerRef.body.position);

              if (playerRef.mesh) {
                playerRef.mesh.position.copy(playerRef.body.position);
                playerRef.mesh.quaternion.copy(playerRef.body.quaternion);
              }

              this.elevatorPhase = "room_exit_doors_closing";

              if (this.levelBuilder.closeRoomElevator) {
                this.levelBuilder.closeRoomElevator(
                  this.activeRoomExitElevatorId,
                );
              } else if (this.levelBuilder.closeRoom2Exit) {
                // Временный fallback, чтобы старый код не сломался.
                this.levelBuilder.closeRoom2Exit();
              }
            }
          }

          // 3. Пока двери закрываются, держим шар на месте.
          if (this.elevatorPhase === "room_exit_doors_closing") {
            playerRef.body.velocity.set(0, 0, 0);
            playerRef.body.angularVelocity.set(0, 0, 0);

            // Держим шар в той точке, где он реально остановился,
            // а не телепортируем его в targetX/targetZ.
            if (this.roomExitHoldPos) {
              playerRef.body.position.copy(this.roomExitHoldPos);
            }

            playerRef.body.previousPosition.copy(playerRef.body.position);
            playerRef.body.interpolatedPosition.copy(playerRef.body.position);

            if (playerRef.mesh) {
              playerRef.mesh.position.copy(playerRef.body.position);
              playerRef.mesh.quaternion.copy(playerRef.body.quaternion);
            }

            // Ждём, пока двери почти закрылись, и только потом запускаем fade.
            const roomExitOpenState =
              this.levelBuilder.getRoomElevatorOpenState?.(
                this.activeRoomExitElevatorId,
              ) ??
              this.levelBuilder.room2ExitOpenState ??
              0;

            if (roomExitOpenState < 0.12 && !this.roomExitCloseTimer) {
              this.roomExitCloseTimer = setTimeout(() => {
                this.roomExitCloseTimer = null;
                this.startDirectLevelTransition(this.targetLevelId);
              }, 250);
            }
          }
        }

        // ФАЗА 1: ждём, пока входные двери реально разъедутся.
        // Иначе шар начинает ехать слишком рано и упирается в физические створки.
        if (this.elevatorPhase === "waiting_entrance_open") {
          playerRef.body.velocity.set(0, 0, 0);
          playerRef.body.angularVelocity.set(0, 0, 0);

          if (this.levelBuilder.entranceOpenState > 0.85) {
            this.elevatorPhase = "rolling";
          }
        }

        if (this.elevatorPhase === "rolling" && playerRef && playerRef.body) {
          const pPos = playerRef.body.position;
          const targetZ = 11.25; // Центр лифта
          const targetX = 0;

          const dir = new THREE.Vector3(targetX - pPos.x, 0, targetZ - pPos.z);
          const dist = dir.length();

          if (dist > 0.08) {
            dir.normalize();

            // Кривая скорости для лифта 1 → 2:
            // сначала быстрее, потом плавно замедляется у центра.
            const speed = THREE.MathUtils.clamp(dist * 4.2, 0.75, 6.2);

            const radius = CONFIG.PLAYER.RADIUS || 1.5;

            const vx = dir.x * speed;
            const vz = dir.z * speed;

            playerRef.body.velocity.x = vx;
            playerRef.body.velocity.z = vz;

            playerRef.body.angularVelocity.x = vz / radius;
            playerRef.body.angularVelocity.z = -vx / radius;
          } else {
            // Доехали: НЕ телепортируем шар в центр.
            // Фиксируем его там, где он реально остановился.
            playerRef.body.velocity.set(0, 0, 0);
            playerRef.body.angularVelocity.set(0, 0, 0);

            this.elevatorHoldPos = new THREE.Vector3(
              playerRef.body.position.x,
              playerRef.body.position.y,
              playerRef.body.position.z,
            );

            playerRef.body.previousPosition.copy(playerRef.body.position);
            playerRef.body.interpolatedPosition.copy(playerRef.body.position);

            if (playerRef.mesh) {
              playerRef.mesh.position.copy(playerRef.body.position);
              playerRef.mesh.quaternion.copy(playerRef.body.quaternion);
            }

            this.elevatorPhase = "doors_closing";

            // === ОДНОВРЕМЕННО: ЗАКРЫВАЕМ ДВЕРЬ И ГАСИМ ЭКРАН ===
            // Закрываем дверь, если выход привязан к текущему тестовому лифту.
            // Для временного финального выхода уровня 2 может быть entryDoor: "none".
            if (this.elevatorEntryDoor === "exit") {
              this.levelBuilder.closeExit();
            } else if (this.elevatorEntryDoor === "entrance") {
              this.levelBuilder.closeEntrance();
            }

            this.fadeScreen.style.opacity = "1";

            setTimeout(() => {
              // === ФАЗА 3: МАГИЯ ПЕРЕСТРОЙКИ УРОВНЯ В ТЕМНОТЕ ===
              this.levelBuilder.setElevatorMode("exiting");

              // В ТЕМНОТЕ пересобираем активную комнату.
              // Берём цель, которую запомнили в момент запуска лифта.
              const nextLevelId = this.targetLevelId;

              if (!nextLevelId) {
                console.warn(
                  "[LEVEL] No target level for elevator transition.",
                );
                this.fadeScreen.style.opacity = "0";
                this.isElevatorSequenceActive = false;
                this.elevatorPhase = "";
                playerRef.isLocked = false;
                this.unlockGameplayCamera();
                return;
              }

              this.levelBuilder.buildRoom(nextLevelId);
              this.loadLevel(nextLevelId);

              const exitCameraZoom = 15.0;
              const camTargetY = playerRef.body.position.y + 4.0;

              // Сбрасываем кэш стен камеры после пересборки комнаты.
              if (this.cameraController) {
                this.cameraController.invalidateWallsCache();
                this.cameraController.currentZoom = exitCameraZoom;
                this.cameraController.targetZoom = exitCameraZoom;
              }

              // Пока экран чёрный, жёстко ставим камеру в безопасный ракурс.
              this.cameraPivot.position.set(0, camTargetY, 11.25);
              this.cameraPivot.rotation.set(-Math.PI / 6, 0, 0);

              this.camera.position.set(0, 0, exitCameraZoom);
              this.camera.rotation.set(0, 0, 0);

              // Принудительно обновляем матрицы, чтобы следующий кадр уже был правильным.
              this.cameraPivot.updateMatrixWorld(true);
              this.camera.updateMatrixWorld(true);

              // Прогреваем материалы и шейдеры новой комнаты,
              // пока fadeScreen ещё чёрный
              this.scene.updateMatrixWorld(true);
              // Временно отключено для проверки стартового прогрева.
              // this.renderer.compile(this.scene, this.camera);

              this.elevatorPhase = "opening_doors";

              // === ФАЗА 4: СВЕТЛЕЕТ... ===
              // Не снимаем затемнение в этот же кадр.
              // Даем браузеру 2 кадра, чтобы новая комната и камера точно применились.
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  this.fadeScreen.style.opacity = "0";
                });
              });

              // === ФАЗА 4: СВЕТЛЕЕТ... ===
              this.fadeScreen.style.opacity = "0";

              // Ждем 600 миллисекунд (чтобы свет немного зажегся)
              // Ждем 600 миллисекунд (чтобы свет немного зажегся)
              setTimeout(() => {
                // ...И ТОЛЬКО ТЕПЕРЬ ОТКРЫВАЕМ ДВЕРИ
                this.levelBuilder.openExit();

                // Ждем еще 1.2 секунды, пока створки разъедутся
                setTimeout(() => {
                  playerRef.isLocked = false;
                  this.unlockGameplayCamera();

                  this.isElevatorSequenceActive = false;
                  this.elevatorPhase = "";
                }, 1200);
              }, 600);
            }, 2200);
          }
        }
      }

      // === 3. СЕНСОР ЗАКРЫТИЯ ДВЕРЕЙ ЗА ИГРОКОМ ===
      if (
        !this.isElevatorSequenceActive &&
        this.levelBuilder &&
        this.playerController
      ) {
        const pPos = this.playerController.body.position;

        // Если шар выехал (Z < 5.0), двери открыты, и таймер ЕЩЕ НЕ запущен
        if (
          pPos.z < 5.0 &&
          this.levelBuilder.targetExitOpenState > 0 &&
          !this.isExitDoorClosingPending
        ) {
          this.isExitDoorClosingPending = true; // Ставим "замок", чтобы не плодить таймеры

          // Ждем 1.5 секунды перед тем, как захлопнуть двери.
          // ВАЖНО: перед закрытием повторно проверяем позицию игрока.
          setTimeout(() => {
            const currentPos = this.playerController.body.position;

            // Закрываем двери только если игрок действительно ушел во вторую комнату.
            // Если он быстро вернулся в лифт, НЕ закрываем двери.
            const playerReallyLeftElevator = currentPos.z < 5.0;

            if (playerReallyLeftElevator) {
              this.levelBuilder.closeExit();
              this.shakeIntensity = 0.15; // Тряска камеры при закрытии
            }

            // Снимаем "замок", чтобы проверка могла сработать снова позже.
            this.isExitDoorClosingPending = false;
          }, 1500);
        }
      }
      // 6. Синхронизация интерактивных объектов
      if (this.interactivePlatforms) {
        this.interactivePlatforms.forEach((platform) => platform.update());
      }
    } else {
      this.lastTime = currentTime;
    }

    this.wordManager.updateAnimations(currentTime);
    this.updateBallInstances(currentTime);

    // ==========================================
    // ЛОГИКА НЕЗАВИСИМОГО СВЕТА (ЛАБОРАТОРИЯ И КОРИДОР)
    // ==========================================
    const allLightPanels = [
      ...this.sceneManager.labPanels,
      ...(this.sceneManager.corridorPanels || []),
    ];

    allLightPanels.forEach((panel) => {
      const intensity = panel.group.userData.intensity;
      const isCorridor = panel.group.userData.isCorridor;
      const isOn = intensity > 0.01;

      // Перекрашиваем сам пластик диффузора: белый если включен, светло-серый если выключен
      panel.diffuser.material.color.setHex(isOn ? 0xffffff : 0xdddddd);
      // Управляем свечением строго пропорционально включенности
      panel.diffuser.material.emissiveIntensity = 2.0 * intensity;

      // Управляем основным светом
      if (panel.rectLight) {
        panel.rectLight.intensity = (isCorridor ? 15.0 : 25.0) * intensity;
        panel.rectLight.visible = isOn;
      }

      // Управляем теневым прожектором
      if (panel.shadowLight) {
        panel.shadowLight.intensity = (isCorridor ? 3.0 : 5.0) * intensity;
        panel.shadowLight.visible = isOn;
      }
    });

    // Временно отключаем старую голографическую подсветку пола
    this.sceneManager.holoLight.intensity = 0;
    this.sceneManager.floorLight.intensity = 0;
    this.sceneManager.ringMesh.material.emissiveIntensity = 0;
    this.sceneManager.ringMesh.material.opacity = 0;

    // ==========================================
    // === ЖЕСТКАЯ ЗАЩИТА КАМЕРЫ ОТ ПРОХОЖДЕНИЯ СКВОЗЬ ПОЛ ===
    // ==========================================
    const camWorldPos = new THREE.Vector3();
    this.camera.getWorldPosition(camWorldPos);

    // Безопасная высота: уровень пола + 0.3 метра (чтобы линза не цепляла текстуру)
    const safeFloorY = CONFIG.WORLD.FLOOR_LEVEL + 0.3;

    if (camWorldPos.y < safeFloorY) {
      camWorldPos.y = safeFloorY;
      // Конвертируем обратно в локальные координаты штатива
      this.cameraPivot.worldToLocal(camWorldPos);
      this.camera.position.copy(camWorldPos);
    }
    // ========================================================

    if (!this.isPreparingGame) {
      // Начинаем подсчёт заново для текущего кадра.
      this.renderer.info.reset();

      // Обычный игровой рендер.
      this.composer.render();
    }

    if (currentTime - this.lastRenderStatsTime >= 1000) {
      const elapsedSeconds = (currentTime - this.fpsLastTime) / 1000;
      const fps = Math.round(this.fpsFrameCount / elapsedSeconds);

      this.lastRenderStatsTime = currentTime;
      this.fpsLastTime = currentTime;
      this.fpsFrameCount = 0;

      const info = this.renderer.info;

      console.log(
        `[RENDER STATS] ` +
          `level=${this.currentLevelId} | ` +
          `fps=${fps} | ` +
          `calls=${info.render.calls} | ` +
          `triangles=${info.render.triangles} | ` +
          `geometries=${info.memory.geometries} | ` +
          `textures=${info.memory.textures} | ` +
          `programs=${info.programs?.length ?? 0}`,
      );
    }
  }

  updateEnvironment(dt, timeSec) {
    this.platformImpact = THREE.MathUtils.lerp(this.platformImpact, 0, 0.05);
    const tool = store.get().currentTool;
    const isMagnetEquipped = tool !== -1;
    const isMagnetPulling =
      isMagnetEquipped &&
      this.inputManager.isMouseDown &&
      this.inputManager.hasInteractionTarget;
    const TOOL_COLORS = { 0: 0x34a853, 1: 0xfbbc05, 2: 0xea4335, 3: 0x4285f4 };
    const activeColor = isMagnetEquipped ? TOOL_COLORS[tool] : null;

    this.sceneManager.updateAtmosphere(
      timeSec,
      store.get().mode,
      this.platformImpact,
      this.fanLevel,
      isMagnetEquipped,
      activeColor,
      isMagnetPulling,
    );

    if (isMagnetEquipped && this.inputManager.hasInteractionTarget) {
      this.sceneManager.magnetReticle.position.copy(
        this.inputManager.interactionTarget,
      );
      this.sceneManager.magnetReticle.position.addScaledVector(
        this.inputManager.interactionNormal,
        0.05,
      );
      const lookPos = this.sceneManager.magnetReticle.position
        .clone()
        .add(this.inputManager.interactionNormal);
      this.sceneManager.magnetReticle.lookAt(lookPos);
    }

    if (this.fansActive) {
      this.fanLevel += dt / 1.0;
    } else {
      this.fanLevel -= dt / (this.isResetting ? 0.8 : 2.0);
    }
    this.fanLevel = Math.max(0, Math.min(1, this.fanLevel));

    const env = -(Math.cos(Math.PI * this.fanLevel) - 1) / 2;
    if (env > 0) {
      const tries = isSlowMo() ? 2 : 4;
      for (let k = 0; k < tries; k++) {
        const spawnChance = isNight() ? 0.2 : 0.85;
        if (Math.random() < spawnChance)
          this.createHeatAirPuff(
            (Math.random() - 0.5) * 26,
            (Math.random() - 0.5) * 18,
            env,
          );
      }
    }
    return { isMagnetEquipped, isMagnetPulling, activeColor };
  }

  updatePhysics(dt, timeSec, isMagnetEquipped, isMagnetPulling, activeColor) {
    const limit = 30;

    if (this.wordManager && this.wordManager.letterObjects) {
      for (const obj of this.wordManager.letterObjects) {
        // --- ПРЕДОХРАНИТЕЛЬ ЗДЕСЬ ---
        if (!obj || !obj.body) continue;

        const pos = obj.body.position;
        if (!pos) continue;

        if (
          pos.y < -5 ||
          pos.y > 40 ||
          pos.x < -limit ||
          pos.x > limit ||
          pos.z < -limit ||
          pos.z > limit
        ) {
          obj.body.velocity.set(0, 0, 0);
          obj.body.angularVelocity.set(0, 0, 0);

          obj.body.position.set(
            (Math.random() - 0.5) * 5,
            10,
            (Math.random() - 0.5) * 5,
          );

          if (
            this.inputManager &&
            this.inputManager.isDragging &&
            this.inputManager.dragConstraint &&
            this.inputManager.dragConstraint.bodyA === obj.body
          ) {
            this.inputManager.cancelDrag();
          }
        }
      }
    }

    this.physicsManager.applyEnvironmentForces(
      this.wordManager && this.wordManager.lettersEnabled
        ? this.wordManager.letterObjects.map((obj) => obj.body)
        : [],
      this.ballsPool,
      this.fanLevel,
      timeSec,
      isMagnetEquipped,
    );

    const interactionTarget = this.inputManager.interactionTarget;
    const hasInteractionTarget = this.inputManager.hasInteractionTarget;
    const isPaintingStreamActive = this.inputManager.isPaintingStreamActive;
    const interactionNormal = this.inputManager.interactionNormal;
    const sprayColorIdx =
      store.get().paintToolColor !== undefined
        ? store.get().paintToolColor
        : -1;

    if (
      isPaintingStreamActive &&
      hasInteractionTarget &&
      sprayColorIdx !== -1
    ) {
      // Физическое перекрашивание объектов
      if (Math.random() < 0.4) {
        this.paintRoom(sprayColorIdx);
      }

      // Генерация визуального облака аэрозоли
      const camPos = this.camera.position;
      const sprayDir = new THREE.Vector3()
        .subVectors(interactionTarget, camPos)
        .normalize();

      // Точка спавна чуть впереди игрока
      const spawnPos = camPos.clone().addScaledVector(sprayDir, 1.2);
      const intensity = isSlowMo() ? 1 : 3;

      for (let i = 0; i < intensity; i++) {
        // Формируем конус распыления
        const spread = new THREE.Vector3(
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15,
          (Math.random() - 0.5) * 0.15,
        );

        const randomizedDir = sprayDir.clone().add(spread).normalize();

        // Разная скорость и размер для "рваного" эффекта дыма
        const vel = randomizedDir.multiplyScalar(0.7 + Math.random() * 0.6);
        const scale = 0.6 + Math.random() * 1.4;

        this.paintPools[sprayColorIdx].spawn(spawnPos, vel, scale, 1.0, 0.03);
      }
    } else {
      this.paintParticleTime = 0;
    }

    if (isMagnetPulling) {
      const magCenter = interactionTarget.clone();
      magCenter.addScaledVector(interactionNormal, 0.4);
      const normalVec = new CANNON.Vec3(
        interactionNormal.x,
        interactionNormal.y,
        interactionNormal.z,
      );

      const applyMagnetForce = (body, colorHex) => {
        if (!body || colorHex !== activeColor) return;
        body.wakeUp();

        const toBall = new CANNON.Vec3(
          body.position.x - magCenter.x,
          body.position.y - magCenter.y,
          body.position.z - magCenter.z,
        );
        const dist = toBall.length();

        if (dist < 40.0) {
          const distFromPlane = toBall.dot(normalVec);
          const radialVec = new CANNON.Vec3(
            toBall.x - normalVec.x * distFromPlane,
            toBall.y - normalVec.y * distFromPlane,
            toBall.z - normalVec.z * distFromPlane,
          );

          const radiusDist = radialVec.length();
          const flattenForce = -distFromPlane * 15.0;

          body.velocity.x += normalVec.x * flattenForce * dt;
          body.velocity.y += normalVec.y * flattenForce * dt;
          body.velocity.z += normalVec.z * flattenForce * dt;

          if (radiusDist > 0.01) {
            radialVec.normalize();
            const orbitRadius = 0.8;
            const maxPullDist = Math.min(
              Math.abs(orbitRadius - radiusDist),
              5.0,
            );
            const pullDirection = orbitRadius - radiusDist > 0 ? 1 : -1;
            let radialPull = pullDirection * maxPullDist * 12.0;

            if (radiusDist < orbitRadius * 0.6) {
              radialPull *= 2.0;
            }

            body.velocity.x += radialVec.x * radialPull * dt;
            body.velocity.y += radialVec.y * radialPull * dt;
            body.velocity.z += radialVec.z * radialPull * dt;

            const tangent = normalVec.cross(radialVec);
            const orbitSpeed = 45.0;
            body.velocity.x += tangent.x * orbitSpeed * dt;
            body.velocity.y += tangent.y * orbitSpeed * dt;
            body.velocity.z += tangent.z * orbitSpeed * dt;
          } else {
            let kick = normalVec.cross(new CANNON.Vec3(0, 1, 0));
            if (kick.lengthSquared() < 0.01) kick.set(1, 0, 0);
            kick.normalize();
            body.velocity.x += kick.x * 15.0 * dt;
            body.velocity.y += kick.y * 15.0 * dt;
            body.velocity.z += kick.z * 15.0 * dt;
          }

          const currentSpeed = body.velocity.length();
          const MAX_SPEED = 25.0;
          if (currentSpeed > MAX_SPEED) {
            body.velocity.scale(MAX_SPEED / currentSpeed, body.velocity);
          }

          body.velocity.scale(0.93, body.velocity);
        }
      };

      this.ballsPool.forEach((b) => {
        if (b) applyMagnetForce(b, b.userData.originalColorHex);
      });
    }
  }

  updateBallInstances(currentTime) {
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        let scale = 1.0;
        if (body.userData.isShrinking) {
          const elapsed = currentTime - body.userData.shrinkStartTime;
          const progress = Math.min(
            elapsed / body.userData.shrinkDuration,
            1.0,
          );
          scale = 1.0 - THREE.MathUtils.smoothstep(progress, 0, 1);
          if (progress >= 1.0) {
            this.world.removeBody(body);
            this.ballsPool[i] = null;
            scale = 0;
          }
        }
        this.dummyObj.position.copy(body.position);
        this.dummyObj.quaternion.copy(body.quaternion);
        this.dummyObj.scale.set(scale, scale, scale);
        this.dummyObj.updateMatrix();
        this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      } else {
        this.dummyObj.scale.set(0, 0, 0);
        this.dummyObj.updateMatrix();
        this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      }
    }
    this.ballInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}

function updatePreparationStatus(stage, percent) {
  const status = document.getElementById("game-preparation-status");
  const stageElement = document.getElementById("preparation-stage");
  const percentElement = document.getElementById("preparation-percent");
  const progressFill = document.getElementById("preparation-progress-fill");

  const safePercent = THREE.MathUtils.clamp(Math.round(percent), 0, 100);

  if (status) {
    status.classList.add("visible");
  }

  if (stageElement) {
    stageElement.textContent = stage;
  }

  if (percentElement) {
    percentElement.textContent = `${safePercent}%`;
  }

  if (progressFill) {
    progressFill.style.width = `${safePercent}%`;
  }

  const coreSubtext = document.querySelector(".core-subtext");

  if (coreSubtext) {
    coreSubtext.textContent = `${safePercent}%`;
  }
}

function setPreparationMode(enabled) {
  const loaderDoors = document.getElementById("loader-doors");

  if (!loaderDoors) return;

  loaderDoors.classList.toggle("is-preparing", enabled);
}

window.addEventListener("mousedown", (e) => {
  if (document.activeElement.tagName === "INPUT") {
    document.activeElement.blur();
  }
  // Фейковый кулак удален!
});

// Элемент для отображения процентов на двери A.I.C.E.
const progressText = document.querySelector(".core-subtext");

loadGameAssets(
  // Коллбек прогресса
  (progress) => {
    if (progressText) {
      progressText.innerText = `ЗАГРУЗКА: ${Math.floor(progress * 100)}%`;
    }
  },
  // Коллбек завершения
  () => {
    if (progressText) {
      progressText.innerText = "SYSTEMS"; // Возвращаем оригинальный текст
    }

    // Снимаем класс loading, чтобы двери могли реагировать
    document.body.classList.remove("loading");

    // Инстанцируем тяжелый класс ИГРЫ только когда все картинки готовы!
    window.app = new GoogleRoomApp();
  },
);
