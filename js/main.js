import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { LevelBuilder } from "./level.js";
import { CONFIG } from "./config.js";
import { audioManager } from "./audio.js";
import { store, isSlowMo } from "./state.js";
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

        // Единая конфигурация выходного лифта.
        exitElevator: {
          doorId: "main_entrance",

          // Выход комнаты 1 доступен сразу.
          unlocked: false,

          // Точка мягкого подхвата перед дверями.
          approachPoint: {
            x: 0,
            z: 17.0,
          },

          // Конечная точка внутри кабины.
          cabinPoint: {
            x: 0,
            z: 11.25,
          },

          // Через какую дверь игрок выйдет в следующем секторе.
          arrivalDoorId: "main_exit",

          // Круглая зона запуска кат-сцены.
          // markerRadius специально больше radius:
          // игрок сначала въезжает в свечение и только затем активирует лифт.
          activationZone: {
            x: 0,
            z: 18.2,
            radius: 1.45,
            markerRadius: 2.5,
          },

          // Постановочная камера внутри комнаты.
          cameraPoint: {
            x: 0,
            y: 9.0,
            z: 29.0,
          },

          // Точка, на которую камера смотрит.
          cameraLookPoint: {
            x: 0,
            y: 1.8,
            z: 14.0,
          },
        },

        entryDoor: "entrance",
        nextLevelId: 2,
      },

      2: {
        spawn: { x: 0, y: 0, z: 11.25 },

        // Новый выход уровня 2:
        // по центру дальней стены z = -37.5.
        exitTrigger: {
          xMin: -4.0,
          xMax: 4.0,
          zMin: -43.0,
          zMax: -37.0,
        },

        exitElevator: {
          doorId: "room2_exit",

          // По умолчанию закрыт.
          // Разблокируется после решения головоломки.
          unlocked: false,

          // Точка перед лифтом, ещё внутри комнаты.
          approachPoint: {
            x: 0,
            z: -34.0,
          },

          // Конечная точка внутри новой кабины.
          // Кабина уходит наружу комнаты по -Z.
          cabinPoint: {
            x: 0,
            z: -40.0,
          },

          // В следующем секторе игрок по-прежнему
          // появляется через центральный лифт.
          arrivalDoorId: "main_exit",

          // Зелёный маркер перед новым лифтом.
          activationZone: {
            x: 0,
            z: -34.0,
            radius: 1.55,
            markerRadius: 2.55,
          },

          // Камера кат-сцены находится внутри комнаты
          // и смотрит на новый лифт на дальней стене.
          cameraPoint: {
            x: 8.0,
            y: 5.0,
            z: -27.0,
          },

          cameraLookPoint: {
            x: 0,
            y: 1.6,
            z: -39.0,
          },
        },

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

    // Конфигурация выходного лифта, запомненная на время кат-сцены.
    this.activeExitElevator = null;

    // Визуальный маркер зоны активации лифта.
    this.exitElevatorMarker = null;
    this.exitElevatorMarkerFloor = null;
    this.exitElevatorMarkerFloorRing = null;
    this.exitElevatorMarkerBeam = null;
    // Время устойчивой остановки шара перед въездом в лифт.
    this.elevatorSettlingTime = 0;
    // Камера ещё не была отделена от игрового слежения
    // для текущей лифтовой кат-сцены.
    this.elevatorCameraInitialized = false;

    // Вспомогательный объект для плавного расчёта поворота камеры.
    this.elevatorCameraTarget = new THREE.Object3D();

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
        // Загрузка более раннего сектора создаёт новую игровую ветку:
        // его собственное состояние и состояния следующих комнат
        // должны начинаться заново.
        if (levelId === 1) {
          this.lockExitElevator(1);
          this.lockExitElevator(2);
        }

        if (levelId === 2) {
          this.lockExitElevator(2);
        }

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

  onFinishExitToMenu: () => {
  this.finishExitToMenu();
},

onBlockGameplayLook: () => {
  this.lockGameplayLookInput();
},

onFreezeGameplayCamera: () => {
  this.lockGameplayCamera();
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

    // Во время последовательного прогрева комнат не уничтожаем материалы,
    // иначе Three.js удалит только что скомпилированные программы.
    if (this.levelBuilder) {
      this.levelBuilder.preservePrewarmedMaterials = true;
    }

    const totalStart = performance.now();

    const compileCurrentScene = async () => {
      // Обновляем мировые матрицы перед компиляцией.
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);

      // Даём загрузчику один кадр перед тяжёлой подготовкой.
      await nextFrame();

      const previousRenderTarget = this.renderer.getRenderTarget();

      // EffectComposer сначала рисует сцену во внутренний render target.
      // Поэтому шейдеры нужно компилировать именно для этой цели,
      // иначе первый composer.render() создаст дополнительные программы.
      const composerRenderTarget =
        this.composer?.readBuffer || this.composer?.renderTarget1 || null;

      try {
        if (composerRenderTarget) {
          this.renderer.setRenderTarget(composerRenderTarget);
        }

        if (typeof this.renderer.compileAsync === "function") {
          await this.renderer.compileAsync(this.scene, this.camera);
        } else {
          console.warn(
            "[PREPARE] compileAsync недоступен, используется compile().",
          );

          this.renderer.compile(this.scene, this.camera);
        }
      } finally {
        this.renderer.setRenderTarget(previousRenderTarget);
      }

      // После правильного compileAsync проход composer уже не должен
      // создавать новые варианты программ.
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
      if (this.levelBuilder) {
        this.levelBuilder.preservePrewarmedMaterials = false;
      }

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
    this.activeExitElevator = null;
    this.elevatorCameraInitialized = false;
    this.activeRoomExitElevatorId = null;
    this.elevatorEntryDoor = null;
    this.elevatorHoldPos = null;
    this.elevatorSettlingTime = 0;
    this.roomExitHoldPos = null;
    this.elevatorStopStableTime = 0;
    this.isExitDoorClosingPending = false;

    if (this.fadeScreen) {
      this.fadeScreen.style.opacity = "0";
    }
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
    this.activeExitElevator = null;
    this.elevatorCameraInitialized = false;
    this.activeRoomExitElevatorId = null;
    this.elevatorEntryDoor = null;
    this.elevatorHoldPos = null;
    this.elevatorSettlingTime = 0;
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

    this.unlockGameplayCamera?.();

    this.lastTime = performance.now();
  }

lockGameplayLookInput() {
  // Сразу запрещаем игроку вращать камеру мышью,
  // но CameraController продолжает работать и может
  // сам корректно поставить камеру относительно геометрии.
  if (this.controls) {
    if (this.savedPointerSpeed === undefined) {
      this.savedPointerSpeed = this.controls.pointerSpeed ?? 1.0;
    }

    this.controls.pointerSpeed = 0;
  }
}

 lockGameplayCamera() {
  // Сначала запрещаем ручное вращение мышью.
  this.lockGameplayLookInput();

  // Затем полностью фиксируем автоматическую игровую камеру.
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

  getCurrentExitActivationZone(levelId = this.currentLevelId) {
    const config = this.levelConfigs[levelId];

    if (
      !config ||
      !config.nextLevelId ||
      !config.exitElevator?.activationZone
    ) {
      return null;
    }

    return config.exitElevator.activationZone;
  }

  updateExitElevatorMarker(timeSec = 0) {
    if (
      !this.exitElevatorMarker ||
      !this.exitElevatorMarkerFloor ||
      !this.exitElevatorMarkerFloorRing ||
      !this.exitElevatorMarkerBeam
    ) {
      return;
    }

    const zone = this.getCurrentExitActivationZone();
    const isUnlocked = this.isExitElevatorUnlocked();

    const shouldShow =
      this.isGameActive &&
      !this.isPaused &&
      !this.isExitingToMenu &&
      !this.isElevatorSequenceActive &&
      isUnlocked &&
      !!zone;

    this.exitElevatorMarker.visible = shouldShow;

    if (!shouldShow) {
      return;
    }

    const floorY = CONFIG.WORLD.FLOOR_LEVEL + 0.02;
    const markerRadius = zone.markerRadius ?? zone.radius;

    // Скорость оставляем спокойной, меняем только амплитуду.
    const radiusPulse = 1.0 + Math.sin(timeSec * 2.4) * 0.035;
    const outerHeight = 3.4 + Math.sin(timeSec * 2.0) * 0.55;

    this.exitElevatorMarker.position.set(zone.x, floorY, zone.z);

    // Пол: делаем немного заметнее, особенно для белого пола 1-й комнаты.
    this.exitElevatorMarkerFloor.scale.set(
      markerRadius * 1.04,
      markerRadius * 1.04,
      1,
    );
    this.exitElevatorMarkerFloor.material.opacity =
      0.82 + Math.sin(timeSec * 2.0) * 0.05;

    // Кольцо на полу
    const shouldShowFloorRing = this.currentLevelId === 1;

    this.exitElevatorMarkerFloorRing.visible = shouldShowFloorRing;

    if (shouldShowFloorRing) {
      this.exitElevatorMarkerFloorRing.scale.set(
        markerRadius * 1.08,
        markerRadius * 1.08,
        1,
      );

      this.exitElevatorMarkerFloorRing.material.opacity =
        0.55 + Math.sin(timeSec * 2.0 + 0.2) * 0.05;
    }

    // Внешний луч
    this.exitElevatorMarkerBeam.scale.set(
      markerRadius * radiusPulse,
      outerHeight,
      markerRadius * radiusPulse,
    );
    this.exitElevatorMarkerBeam.position.y = outerHeight * 0.5;
    this.exitElevatorMarkerBeam.material.opacity =
      0.2 + Math.sin(timeSec * 2.0) * 0.03;
  }

  getCurrentExitElevator() {
    const config = this.getCurrentLevelConfig();
    return config.exitElevator || null;
  }

  isExitElevatorUnlocked(levelId = this.currentLevelId) {
    const config = this.levelConfigs[levelId];
    const exitElevator = config?.exitElevator;

    if (!exitElevator || !config?.nextLevelId) {
      return false;
    }

    // Для старых конфигураций без поля unlocked сохраняем
    // прежнее совместимое поведение: выход считается доступным.
    return exitElevator.unlocked !== false;
  }

  setExitElevatorUnlocked(levelId, isUnlocked) {
    const config = this.levelConfigs[levelId];
    const exitElevator = config?.exitElevator;

    if (!exitElevator) {
      console.warn(
        `[ELEVATOR] Cannot change unlocked state: level ${levelId} has no exitElevator.`,
      );
      return false;
    }

    exitElevator.unlocked = Boolean(isUnlocked);

    // На случай блокировки уже открытого выхода сразу задаём
    // дверям закрытое целевое состояние.
    if (!exitElevator.unlocked && this.levelBuilder) {
      this.levelBuilder.closeElevator(exitElevator.doorId);
    }

    console.log(
      `[ELEVATOR] Level ${levelId} exit is now ${
        exitElevator.unlocked ? "unlocked" : "locked"
      }.`,
    );

    return true;
  }

  unlockExitElevator(levelId = this.currentLevelId) {
    return this.setExitElevatorUnlocked(levelId, true);
  }

  lockExitElevator(levelId = this.currentLevelId) {
    return this.setExitElevatorUnlocked(levelId, false);
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

   if (levelId > 1) {
  this.cameraPivot.position.set(
    startPos.x,
    startPos.y + 5.5,
    startPos.z,
  );

  this.cameraPivot.rotation.set(-0.6, 0, 0);

  if (this.cameraController) {
    this.cameraController.currentZoom = 15.0;
    this.cameraController.targetZoom = 15.0;
  }

  this.camera.position.set(0, 0, 15.0);
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

    // После перестройки комнаты текущая конфигурация уровня изменится,
    // поэтому заранее запоминаем дверь, через которую игрок прибудет.
    const arrivalDoorId = this.activeExitElevator?.arrivalDoorId || "main_exit";

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

      if (nextLevelId > 1 && this.levelBuilder) {
        this.levelBuilder.setElevatorMode("exiting");

        // Двери прибытия должны быть закрыты уже в первом видимом кадре.
        // resetElevatorForLevel() оставляет выходную сторону открытой,
        // поэтому сбрасываем не только target, но и текущее состояние.
        this.levelBuilder.closeElevator(arrivalDoorId);

        if (arrivalDoorId === "main_entrance") {
          this.levelBuilder.entranceOpenState = 0;
          this.levelBuilder.targetEntranceOpenState = 0;
        } else if (arrivalDoorId === "main_exit") {
          this.levelBuilder.exitOpenState = 0;
          this.levelBuilder.targetExitOpenState = 0;
        } else {
          const arrivalElevator =
            this.levelBuilder.getRoomElevator?.(arrivalDoorId);

          if (arrivalElevator) {
            arrivalElevator.openState = 0;
            arrivalElevator.targetOpenState = 0;
          }
        }

        // Немедленно применяем закрытое положение к мешам и коллайдерам,
        // пока экран ещё полностью чёрный.
        this.levelBuilder.updateDoors(0);
      }
      this.elevatorPhase = "opening_doors";

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.fadeScreen.style.opacity = "0";
        });
      });

      setTimeout(() => {
        if (this.levelBuilder) {
          this.levelBuilder.openElevator(arrivalDoorId);
        }

        // Ждём, пока створки разъедутся, и только потом возвращаем управление.
        setTimeout(() => {
          playerRef.isLocked = false;
          this.unlockGameplayCamera();

          this.isElevatorSequenceActive = false;
          this.elevatorPhase = "";
          this.targetLevelId = null;
          this.activeExitElevator = null;
          this.elevatorSettlingTime = 0;
          this.elevatorCameraInitialized = false;
          this.activeRoomExitElevatorId = null;
          this.elevatorHoldPos = null;
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

    // Головоломка комнаты 2 разблокирует её выходной лифт.
    this.levelBuilder.onRoom2PuzzleSolved = () => {
      const unlocked = this.unlockExitElevator(2);

      console.log("[ELEVATOR] Room 2 puzzle callback executed.", { unlocked });
    };

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

    // Визуальный зелёный маркер зоны активации лифта.
    this.createExitElevatorMarker();
  }

  createExitElevatorMarker() {
    const markerGroup = new THREE.Group();
    markerGroup.visible = false;

    // =========================
    // 1) МЯГКОЕ СВЕЧЕНИЕ НА ПОЛУ
    // =========================
    const floorCanvas = document.createElement("canvas");
    floorCanvas.width = 256;
    floorCanvas.height = 256;

    const floorCtx = floorCanvas.getContext("2d");
    const floorGradient = floorCtx.createRadialGradient(
      128,
      128,
      8,
      128,
      128,
      128,
    );

    floorGradient.addColorStop(0.0, "rgba(120,255,140,0.70)");
    floorGradient.addColorStop(0.35, "rgba(80,255,110,0.38)");
    floorGradient.addColorStop(0.72, "rgba(40,210,70,0.14)");
    floorGradient.addColorStop(1.0, "rgba(0,0,0,0.0)");

    floorCtx.clearRect(0, 0, 256, 256);
    floorCtx.fillStyle = floorGradient;
    floorCtx.fillRect(0, 0, 256, 256);

    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.needsUpdate = true;

    // =========================
    // 2) ВЕРТИКАЛЬНЫЙ ALPHA-ГРАДИЕНТ
    // =========================
    const beamCanvas = document.createElement("canvas");
    beamCanvas.width = 64;
    beamCanvas.height = 256;

    const beamCtx = beamCanvas.getContext("2d");
    const beamGradient = beamCtx.createLinearGradient(0, 0, 0, 256);

    // Для alphaMap:
    // чёрный = полностью прозрачно;
    // белый = полностью видно.
    //
    // У CylinderGeometry верх текстуры находится около y = 0,
    // низ — около y = 256.
    beamGradient.addColorStop(0.0, "rgb(0, 0, 0)");
    beamGradient.addColorStop(0.18, "rgb(0, 0, 0)");
    beamGradient.addColorStop(0.38, "rgb(18, 18, 18)");
    beamGradient.addColorStop(0.58, "rgb(75, 75, 75)");
    beamGradient.addColorStop(0.76, "rgb(165, 165, 165)");
    beamGradient.addColorStop(0.92, "rgb(235, 235, 235)");
    beamGradient.addColorStop(1.0, "rgb(255, 255, 255)");

    beamCtx.clearRect(0, 0, 64, 256);
    beamCtx.fillStyle = beamGradient;
    beamCtx.fillRect(0, 0, 64, 256);

    const beamTexture = new THREE.CanvasTexture(beamCanvas);
    beamTexture.needsUpdate = true;

    // =========================
    // 3) МАТЕРИАЛЫ
    // =========================
    const floorMaterial = new THREE.MeshBasicMaterial({
      color: 0x2fff57,
      map: floorTexture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Кольцо на полу — чтобы на белом полу маркер не терялся.
    const floorRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x32ff5a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Внешний слой — основной зелёный объём.
    const outerBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0x32ff5a,
      alphaMap: beamTexture,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Внутренний слой — мягкий, но НЕ белый.
    const innerBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0x7aff95,
      alphaMap: beamTexture,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // =========================
    // 4) ГЕОМЕТРИЯ
    // =========================
    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 64),
      floorMaterial,
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = 0.015;
    floorGlow.renderOrder = 18;

    const floorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1.0, 64),
      floorRingMaterial,
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.02;
    floorRing.renderOrder = 19;

    const outerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 1.0, 64, 1, true),
      outerBeamMaterial,
    );
    outerBeam.renderOrder = 20;

    const innerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 1.0, 64, 1, true),
      innerBeamMaterial,
    );
    markerGroup.add(floorGlow);
    markerGroup.add(floorRing);
    markerGroup.add(outerBeam);

    this.exitElevatorMarker = markerGroup;
    this.exitElevatorMarkerFloor = floorGlow;
    this.exitElevatorMarkerFloorRing = floorRing;
    this.exitElevatorMarkerBeam = outerBeam;

    this.scene.add(markerGroup);
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

    // Если до reset активной игровой сессии не было,
    // значит сектор сейчас запускается именно из главного меню.
    const startingFromMenu = !this.hasStartedGame && !this.isGameActive;

    this.hardResetTransitions();

    // Считаем, что после reset игра должна оказаться именно
    // в том уровне, который нам передали.
    this.currentLevelId = levelId;
    this.targetLevelId = null;

    // Сбрасываем runtime-состояние выбранного сектора
    // и всех следующих уже существующих секторов.
    //
    // Если начинаем с комнаты 1 — комната 2 тоже должна
    // снова быть непройденной.
    if (levelId === 1) {
      this.lockExitElevator(1);
      this.lockExitElevator(2);
    }

    if (levelId === 2) {
      this.lockExitElevator(2);
    }

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
    this.isExitDoorClosingPending = false;

    if (this.fadeScreen) {
      this.fadeScreen.style.opacity = "0";
    }

    if (this.playerController) {
      // При запуске из меню шар физически существует,
      // но не принимает управление игрока.
      this.playerController.isLocked = startingFromMenu;
    }

    if (this.cameraPivot) {
      this.cameraPivot.rotation.set(0, 0, 0);
    }

    if (this.controls) {
      // Из меню мышь пока не управляет камерой.
      // При обычном рестарте внутри игры управление остаётся доступным.
      this.controls.enabled = !startingFromMenu;
    }

    // Сам CameraController НЕ замораживаем.
    // Он должен рассчитать правильное положение камеры
    // относительно пола, потолка и стен ещё во время открытия хаба.
    if (this.cameraController) {
      this.cameraController.enabled = true;
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
    // При запуске сектора из главного меню мир уже начинает жить:
    // физика работает, шар падает/оседает на пол,
    // CameraController приводит камеру в корректное положение.
    //
    // Но управление игрок получит только после полного открытия хаба.
    if (startingFromMenu) {
      this.isGameActive = true;
      this.isPaused = false;

      if (this.playerController) {
        this.playerController.isLocked = true;

        if (this.playerController.keys) {
          for (const key in this.playerController.keys) {
            this.playerController.keys[key] = false;
          }
        }
      }

      this.lastTime = performance.now();
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

     for (const l of this.wordManager.letterObjects) {
  l.mesh.material.emissiveIntensity = 0.0;
  l.mesh.material.roughness = 0.5;
  l.mesh.material.color.setHex(l.body.userData.googleColor);
}

this.setBallGlow(false);

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

   this.setBallGlow(false);

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

        const activeElevatorCamera = this.activeExitElevator;

        if (
          this.isElevatorSequenceActive &&
          activeElevatorCamera?.cameraPoint &&
          activeElevatorCamera?.cameraLookPoint &&
          this.elevatorPhase !== "opening_doors"
        ) {
          // При первом кадре кат-сцены сохраняем фактическое мировое
          // положение камеры. После этого отвязываем её от игрового плеча.
          // Благодаря этому камера не телепортируется при начале сцены.
          if (!this.elevatorCameraInitialized) {
            const currentCameraWorldPosition = new THREE.Vector3();

            this.camera.getWorldPosition(currentCameraWorldPosition);

            this.cameraPivot.position.copy(currentCameraWorldPosition);

            this.camera.position.set(0, 0, 0);
            this.camera.rotation.set(0, 0, 0);

            this.elevatorCameraInitialized = true;
          }

          const cameraPoint = activeElevatorCamera.cameraPoint;
          const cameraLookPoint = activeElevatorCamera.cameraLookPoint;

          const targetCameraPosition = new THREE.Vector3(
            cameraPoint.x,
            cameraPoint.y,
            cameraPoint.z,
          );

          const targetLookPosition = new THREE.Vector3(
            cameraLookPoint.x,
            cameraLookPoint.y,
            cameraLookPoint.z,
          );

          // Камера плавно перелетает в постановочную точку.
          const positionLerp = 1 - Math.exp(-2.2 * dt);

          this.cameraPivot.position.lerp(targetCameraPosition, positionLerp);

          // На вспомогательном объекте рассчитываем нужный поворот.
          this.elevatorCameraTarget.position.copy(this.cameraPivot.position);

          this.elevatorCameraTarget.quaternion.copy(
            this.cameraPivot.quaternion,
          );

          this.elevatorCameraTarget.lookAt(targetLookPosition);

          // Камера является дочерним объектом cameraPivot,
          // поэтому для правильного направления нужен разворот на 180°.
          this.elevatorCameraTarget.rotateY(Math.PI);

          const rotationLerp = 1 - Math.exp(-3.0 * dt);

          this.cameraPivot.quaternion.slerp(
            this.elevatorCameraTarget.quaternion,
            rotationLerp,
          );

          this.cameraPivot.rotation.z = 0;
        } else {
          // Обычная игровая камера и камера после прибытия в новый сектор.
          this.cameraController.update(dt, this.playerController.mesh.position);
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

      // === ВРЕМЕННОЕ ЗАДАНИЕ КОМНАТЫ 1 ===
      //
      // Игрок заезжает на голубую площадку,
      // после чего выходной лифт комнаты 1 разблокируется.
      if (
        this.currentLevelId === 1 &&
        this.isGameActive &&
        !this.isPaused &&
        !this.isExitingToMenu &&
        !this.isElevatorSequenceActive &&
        this.playerController?.body &&
        this.levelBuilder?.room1UnlockPad &&
        !this.isExitElevatorUnlocked(1)
      ) {
        const pad = this.levelBuilder.room1UnlockPad;
        const playerPosition = this.playerController.body.position;

        const dx = playerPosition.x - pad.position.x;
        const dz = playerPosition.z - pad.position.z;

        const activationRadius = pad.userData.radius ?? 2.0;

        const isPlayerOnPad =
          dx * dx + dz * dz <= activationRadius * activationRadius;

        if (isPlayerOnPad) {
          pad.userData.activated = true;

          // Площадка визуально гаснет после активации.
          if (pad.material) {
            pad.material.opacity = 0.2;
            pad.material.emissiveIntensity = 0.08;
          }

          // Общий механизм разблокировки выходного лифта.
          this.unlockExitElevator(1);

          console.log("[ROOM 1] Temporary unlock pad activated.");
        }
      }

      // === 1. ТРИГГЕР ВЫХОДНОГО ЛИФТА ===
      // Доступность берётся из общей конфигурации exitElevator.
      // Позже комната 2 сможет вызвать unlockExitElevator(2)
      // после решения головоломки.
      const isElevatorUnlocked = this.isExitElevatorUnlocked();

      if (
        this.isGameActive &&
        !this.isExitingToMenu &&
        !this.isElevatorSequenceActive &&
        this.levelBuilder &&
        this.playerController &&
        isElevatorUnlocked
      ) {
        const pPos = this.playerController.body.position;

        const exitZone = this.getCurrentExitActivationZone();

        let isPlayerInLevelExit = false;

        if (exitZone) {
          const dx = pPos.x - exitZone.x;
          const dz = pPos.z - exitZone.z;

          isPlayerInLevelExit =
            dx * dx + dz * dz <= exitZone.radius * exitZone.radius;
        }

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

            const exitElevator = this.getCurrentExitElevator();

            if (!exitElevator) {
              console.warn(
                `[ELEVATOR] Missing exitElevator config for level ${this.currentLevelId}.`,
              );
            } else {
              this.targetLevelId = nextLevelId;

              // Запоминаем конфигурацию именно в момент запуска кат-сцены.
              // После смены уровня getCurrentExitElevator() уже вернёт другой конфиг.
              this.activeExitElevator = exitElevator;

              this.isElevatorSequenceActive = true;
              this.elevatorPhase = "elevator_approaching";

              this.elevatorHoldPos = null;
              this.elevatorCameraInitialized = false;
              this.elevatorSettlingTime = 0;

              // Управление блокируем сразу, но скорость шара не обнуляем.
              // Если он вошёл в триггер в прыжке, физика спокойно завершит падение.
              this.playerController.isLocked = true;
              this.lockGameplayCamera();

              // Двери начинают открываться одновременно с блокировкой управления.
              this.levelBuilder.openElevator(exitElevator.doorId);
            }
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

        // === ЕДИНАЯ ЛИФТОВАЯ КАТ-СЦЕНА ===
        //
        // Фазы:

        // elevator_approaching    — естественное приземление и движение к точке перед дверями;
        // elevator_settling       — короткая устойчивая остановка перед лифтом;
        // elevator_entering       — въезд внутрь кабины;
        // elevator_doors_closing  — фиксация шара и закрытие дверей;
        // elevator_transition     — запуск перехода в следующий сектор.

        const exitElevator = this.activeExitElevator;

        if (exitElevator && playerRef && playerRef.body) {
          const body = playerRef.body;
          const radius = CONFIG.PLAYER.RADIUS || 1.5;

          const moveHorizontallyTo = (
            targetPoint,
            stopDistance = 0.08,
            maxSpeed = 6.2,
          ) => {
            const dx = targetPoint.x - body.position.x;
            const dz = targetPoint.z - body.position.z;
            const distance = Math.hypot(dx, dz);

            if (distance <= stopDistance) {
              body.velocity.x = 0;
              body.velocity.z = 0;

              body.angularVelocity.x = 0;
              body.angularVelocity.z = 0;

              return true;
            }

            const dirX = dx / distance;
            const dirZ = dz / distance;

            // Чем ближе шар к точке, тем мягче движение.
            const speed = THREE.MathUtils.clamp(distance * 4.2, 0.75, maxSpeed);

            const vx = dirX * speed;
            const vz = dirZ * speed;

            body.velocity.x = vx;
            body.velocity.z = vz;

            // Визуально и физически продолжаем катить шар,
            // а не просто скользить им по полу.
            body.angularVelocity.x = vz / radius;
            body.angularVelocity.z = -vx / radius;

            return false;
          };

          // === ФАЗА 1: ПОДХОД К ЛИФТУ ===
          if (this.elevatorPhase === "elevator_approaching") {
            // Пока шар находится в воздухе, горизонтальную и вертикальную
            // скорость не трогаем. Он должен естественно приземлиться.
            if (playerRef.isGrounded === true) {
              const reachedApproach = moveHorizontallyTo(
                exitElevator.approachPoint,
                0.12,
                5.2,
              );

              if (reachedApproach) {
                // Шар дошёл до точки перед дверями.
                // Теперь отдельно даём ему полностью успокоиться.
                body.velocity.x = 0;
                body.velocity.z = 0;

                body.angularVelocity.x = 0;
                body.angularVelocity.z = 0;

                this.elevatorSettlingTime = 0;
                this.elevatorPhase = "elevator_settling";
              }
            }
          }

          // === ФАЗА 2: СТАБИЛИЗАЦИЯ ПЕРЕД ЛИФТОМ ===
          if (this.elevatorPhase === "elevator_settling") {
            const approachPoint = exitElevator.approachPoint;

            const dx = approachPoint.x - body.position.x;
            const dz = approachPoint.z - body.position.z;
            const distanceToApproach = Math.hypot(dx, dz);

            // Если физика слегка сдвинула шар от точки,
            // мягко возвращаем его, не телепортируя.
            if (distanceToApproach > 0.1) {
              moveHorizontallyTo(approachPoint, 0.08, 1.6);

              this.elevatorSettlingTime = 0;
            } else {
              // Гасим только горизонтальное движение.
              // Вертикальную физику не трогаем.
              body.velocity.x = 0;
              body.velocity.z = 0;

              body.angularVelocity.x = 0;
              body.angularVelocity.z = 0;

              const horizontalSpeed = Math.hypot(
                body.velocity.x,
                body.velocity.z,
              );

              const angularSpeed = Math.hypot(
                body.angularVelocity.x,
                body.angularVelocity.z,
              );

              const isStable =
                playerRef.isGrounded === true &&
                horizontalSpeed < 0.05 &&
                angularSpeed < 0.1;

              if (isStable) {
                this.elevatorSettlingTime += dt;
              } else {
                this.elevatorSettlingTime = 0;
              }

              const doorOpenState = this.levelBuilder.getElevatorOpenState(
                exitElevator.doorId,
              );

              // Въезд начинается только при выполнении двух условий:
              // шар устойчиво остановился, а двери достаточно открыты.
              if (this.elevatorSettlingTime >= 0.3 && doorOpenState >= 0.82) {
                this.elevatorSettlingTime = 0;
                this.elevatorPhase = "elevator_entering";
              }
            }
          }

          // === ФАЗА 3: ВЪЕЗД В КАБИНУ ===
          if (this.elevatorPhase === "elevator_entering") {
            const reachedCabin = moveHorizontallyTo(
              exitElevator.cabinPoint,
              0.08,
              6.2,
            );

            if (reachedCabin) {
              body.velocity.set(0, 0, 0);
              body.angularVelocity.set(0, 0, 0);

              // Запоминаем реальную позицию остановки.
              // Шар не телепортируется точно в cabinPoint.
              this.elevatorHoldPos = new CANNON.Vec3(
                body.position.x,
                body.position.y,
                body.position.z,
              );

              body.previousPosition.copy(body.position);
              body.interpolatedPosition.copy(body.position);

              if (playerRef.mesh) {
                playerRef.mesh.position.copy(body.position);
                playerRef.mesh.quaternion.copy(body.quaternion);
              }

              this.elevatorPhase = "elevator_doors_closing";

              this.levelBuilder.closeElevator(exitElevator.doorId);
            }
          }

          // === ФАЗА 4: ЗАКРЫТИЕ ДВЕРЕЙ ===
          if (this.elevatorPhase === "elevator_doors_closing") {
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);

            if (this.elevatorHoldPos) {
              body.position.copy(this.elevatorHoldPos);
            }

            body.previousPosition.copy(body.position);
            body.interpolatedPosition.copy(body.position);

            if (playerRef.mesh) {
              playerRef.mesh.position.copy(body.position);
              playerRef.mesh.quaternion.copy(body.quaternion);
            }

            const doorOpenState = this.levelBuilder.getElevatorOpenState(
              exitElevator.doorId,
            );

            if (doorOpenState <= 0.12) {
              this.elevatorPhase = "elevator_transition";
            }
          }

          // === ФАЗА 5: ПЕРЕХОД В СЛЕДУЮЩИЙ СЕКТОР ===
          if (this.elevatorPhase === "elevator_transition") {
            const nextLevelId = this.targetLevelId;

            if (!nextLevelId) {
              console.warn("[ELEVATOR] Missing target level for transition.");

              this.isElevatorSequenceActive = false;
              this.elevatorPhase = "";
              this.activeExitElevator = null;
              this.elevatorHoldPos = null;
              this.elevatorSettlingTime = 0;

              playerRef.isLocked = false;
              this.unlockGameplayCamera();
            } else {
              // Метод сразу сменит фазу на level_direct_transition,
              // поэтому повторный запуск в следующем кадре не произойдёт.
              this.startDirectLevelTransition(nextLevelId);
            }
          }
        }
      }

      // === 3. СЕНСОР ЗАКРЫТИЯ ДВЕРЕЙ ЗА ИГРОКОМ ===
      //
      // Двери закрываются только после того,
      // как шар и камера полностью покинули кабину.
      if (
        !this.isElevatorSequenceActive &&
        this.levelBuilder &&
        this.playerController &&
        this.camera
      ) {
        const pPos = this.playerController.body.position;

        const cameraWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPos);

        const playerLeftElevator = pPos.z < 5.0;
        const cameraLeftElevator = cameraWorldPos.z < 7.0;

        if (
          playerLeftElevator &&
          cameraLeftElevator &&
          this.levelBuilder.targetExitOpenState > 0
        ) {
          this.levelBuilder.closeExit();
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
    this.updateExitElevatorMarker(currentTime / 1000);

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
      const spawnChance = 0.85;
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
