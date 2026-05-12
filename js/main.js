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
    this.lastTime = performance.now();
    this.platformImpact = 0;

    // === СОСТОЯНИЕ УРОВНЕЙ ===
    // Пока уровни физически ещё не пересобираются,
    // но вся логика уже должна знать, где мы находимся.
    this.currentLevelId = 1;
    this.targetLevelId = null;

    // === ИНИЦИАЛИЗАЦИЯ МЕНЕДЖЕРОВ ===
    this.sceneManager = new SceneManager();

    this.scene = this.sceneManager.scene;
    this.camera = this.sceneManager.camera;
    this.renderer = this.sceneManager.renderer;
    this.composer = this.sceneManager.composer;
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
      onTogglePause: () => {
        this.isPaused = !this.isPaused;

        // === ЖЕЛЕЗОБЕТОННОЕ ПОЯВЛЕНИЕ КНОПКИ ===
        // Если меню открылось (пауза) и игра уже была начата
        if (this.isPaused && this.hasStartedGame) {
          const resumeBtn = document.getElementById("btn-resume-game");
          if (resumeBtn) {
            resumeBtn.classList.remove("locked-feature");
          }
        }

        return this.isPaused;
      },
      onReset: () => this.resetScene(),
      onFlickerLights: () => this.flickerLights(),
      onSpawnBalls: () => {
        if (!this.isPaused) this.spawnBalls();
      },
      onShrinkBalls: () => {
        if (!this.isPaused) this.startShrinkingBalls();
      },
      onToggleFans: () => {
        if (!this.isPaused) {
          this.fansActive = !this.fansActive;
          if (
            this.fansActive &&
            typeof audioManager !== "undefined" &&
            audioManager.playFansWhoosh
          ) {
            audioManager.playFansWhoosh(isSlowMo());
          }
        }
      },

      onToggleLetters: () => {
        if (this.isPaused) return this.wordManager.lettersEnabled;

        this.wordManager.lettersEnabled = !this.wordManager.lettersEnabled;

        if (this.wordManager.lettersEnabled) {
          this.wordManager.setLettersVisibility(true);
          this.wordManager.showLettersSmoothly();
        } else {
          this.wordManager.hideLettersSmoothly();
          clearTimeout(this.lettersToggleTimeout);
          this.lettersToggleTimeout = setTimeout(() => {
            if (!this.wordManager.lettersEnabled) {
              this.wordManager.setLettersVisibility(false);
            }
          }, 300);
        }
        return this.wordManager.lettersEnabled;
      },
      onReturnLetters: () => {
        if (!this.isPaused) this.wordManager.returnLettersToStart();
      },
      onApplyWord: (word) => {
        if (!this.isPaused) {
          this.wordManager.changeWordSmoothly(word);
        }
      },
      onForceLightsOff: () => {
        this.currentExposure = 0;
        this.renderer.toneMappingExposure = 0;
      },
      // === НОВЫЕ КОЛЛБЕКИ ДЛЯ КАМЕРЫ ===
      onRegistrationStart: () => {
        this.sceneManager.setCameraMode("registration");
      },
      onRegistrationEnd: () => {
        this.sceneManager.setCameraMode("gameplay");
      },
    });

    this.initSceneObjects();

    this.inputManager = new InputManager(
      this.camera,
      this.world,
      () =>
        this.isPaused || !this.uiManager.dialogueSystem.isRegistrationComplete,
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
      const btnResume = e.target.closest("#btn-resume-game");

      // 1. Если кликнули по кнопкам "Новая игра" или "Продолжить"
      if (btnStart || btnResume) {
        // Если это Новая игра - сбрасываем сцену и запоминаем, что сессия начата
        if (btnStart) {
          this.resetScene();
          this.hasStartedGame = true; // Запоминаем, что игра идет!
          this.start3DIntro();
          // Обрати внимание: мы БОЛЬШЕ НЕ убираем класс 'locked-feature' здесь,
          // чтобы кнопка не появлялась резко перед глазами.
        }

        // Захватываем мышь (возвращаемся в игру),
        // но не во время лифтовой кат-сцены.
        if (!this.isElevatorSequenceActive && !this.controls.isLocked) {
          this.controls.lock();
        }
        return;
      }

      // 2. Если кликаем по остальному меню, настройкам или HUD — игнорируем захват
      if (
        e.target.closest("#holo-wrapper") ||
        e.target.closest("#hud-controls") ||
        e.target.closest("#loader-doors") ||
        e.target.tagName === "INPUT"
      )
        return;

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
      // Теперь мы правильно обращаемся к кнопкам внутри контроллера!
      if (this.playerController) {
        for (const key in this.playerController.keys) {
          this.playerController.keys[key] = false;
        }
      }

      // === МАГИЯ КНОПКИ "ПРОДОЛЖИТЬ" ===
      // Обновляем кнопку ровно в тот момент, когда игрок выходит в меню
      const resumeElement = document.getElementById("btn-resume-game");
      if (this.hasStartedGame && resumeElement) {
        resumeElement.classList.remove("locked-feature");
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

    // === ТЕСТОВОЕ УПРАВЛЕНИЕ ЛИФТОМ ===
    window.addEventListener("keydown", (e) => {
      if (document.activeElement.tagName === "INPUT") return;

      // Кнопку 'O' мы удалили, теперь всё автоматически!

      if (e.code === "KeyC") {
        if (this.levelBuilder) {
          this.levelBuilder.closeEntrance();
          this.levelBuilder.closeExit();
        }
      }
    });

    requestAnimationFrame(this.tick); // <--- ВОТ ЭТО МЫ ПОТЕРЯЛИ
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
  loadLevel(levelId) {
    // Пока это только логическое переключение уровня.
    // На следующих этапах здесь будет:
    // unloadCurrentRoom();
    // buildRoom(levelId);
    this.currentLevelId = levelId;
    this.targetLevelId = null;

    console.log(`[LEVEL] Loaded level ${levelId}`);
  }

  getLevelStartPosition(levelId) {
    // Старт первого уровня — первая комната.
    if (levelId === 1) {
      return { x: 0, y: 0, z: 30 };
    }

    // Старт второго уровня — пока ставим в зоне выхода из лифта/второй комнаты.
    // Позже уточним координаты под реальную комнату.
    if (levelId === 2) {
      return { x: 0, y: 0, z: 3 };
    }

    // Безопасный fallback.
    return { x: 0, y: 0, z: 30 };
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

    this.levelBuilder.closeEntrance();
    this.levelBuilder.closeExit();

    this.levelBuilder.entranceOpenState = 0;
    this.levelBuilder.targetEntranceOpenState = 0;

    this.levelBuilder.exitOpenState = 0;
    this.levelBuilder.targetExitOpenState = 0;

    // Если начинаем с 1 уровня — лифт в режиме входа.
    // Если начинаем со 2 уровня — пока считаем, что игрок уже вышел из лифта.
    if (levelId === 1) {
      this.levelBuilder.setElevatorMode("entering");
    } else {
      this.levelBuilder.setElevatorMode("exiting");
    }
  }

  resetCameraForLevel(levelId) {
    if (!this.cameraPivot || !this.camera) return;

    const startPos = this.getLevelStartPosition(levelId);

    this.cameraPivot.position.set(startPos.x, startPos.y + 4.0, startPos.z);
    this.cameraPivot.rotation.set(-Math.PI / 6, 0, 0);

    if (this.cameraController) {
      this.cameraController.currentZoom = 15.0;
      this.cameraController.targetZoom = 15.0;
    }

    this.camera.position.set(0, 0, 15.0);
    this.camera.rotation.set(0, 0, 0);
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

    this.uiManager.updateBeadCounter(
      this.activeBallsCount,
      CONFIG.PHYSICS.MAX_BALLS,
    );
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

  resetScene() {
    // Новая игра всегда начинается с первого уровня.
    this.currentLevelId = 1;
    this.targetLevelId = null;
    // Если до этого была построена другая комната,
    // возвращаем активную комнату к первому уровню.
    if (this.levelBuilder) {
      this.levelBuilder.buildRoom(1);

      if (this.cameraController) {
        this.cameraController.invalidateWallsCache();
      }
    }
    // === 1. СБРОС ЛИФТА И КАТ-СЦЕНЫ ===
    if (this.levelBuilder) {
      this.levelBuilder.closeEntrance();
      this.levelBuilder.closeExit();
      this.levelBuilder.entranceOpenState = 0;
      this.levelBuilder.exitOpenState = 0;
      this.levelBuilder.setElevatorMode("entering");
    }
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
    if (this.playerController.body) {
      this.playerController.body.velocity.set(0, 0, 0);
      this.playerController.body.angularVelocity.set(0, 0, 0);
      this.playerController.body.position.set(0, 0, 30);
      this.playerController.body.quaternion.set(0, 0, 0, 1);
      this.playerController.body.previousPosition.copy(
        this.playerController.body.position,
      );
      this.playerController.body.interpolatedPosition.copy(
        this.playerController.body.position,
      );
      this.playerController.body.previousQuaternion.copy(
        this.playerController.body.quaternion,
      );
      this.playerController.body.interpolatedQuaternion.copy(
        this.playerController.body.quaternion,
      );
      this.playerController.body.wakeUp();
    }

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

    if (
      this.uiManager &&
      typeof this.uiManager.updateFanProgress === "function"
    ) {
      this.uiManager.updateFanProgress(0);
    }

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
        this.uiManager.updateFanProgress(0);
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
          this.uiManager.lockLetters(isMagnet);

          if (isMagnet) {
            if (this.wordManager.lettersEnabled) {
              this.wordManager.hideLettersSmoothly();
              this.lettersHiddenByMagnet = true;
            }
          } else {
            if (this.lettersHiddenByMagnet) {
              this.uiManager.setLettersActive(true);
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
    this.uiManager.updateBeadCounter(0, CONFIG.PHYSICS.MAX_BALLS);

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
    this.uiManager.updateBeadCounter(
      this.activeBallsCount,
      CONFIG.PHYSICS.MAX_BALLS,
    );
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
          // Во время opening_doors уже можно использовать обычную умную камеру.
          // Мышь всё равно заблокирована через pointerSpeed = 0,
          // поэтому игрок не сможет крутить камеру во время кат-сцены.
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
        const landingPos = new THREE.Vector3(-4, impactY, 30);

        this.cameraController.currentZoom = 15.0;
        this.cameraController.update(dt, landingPos);

        // Жестко фиксируем угол
        this.cameraPivot.rotation.set(0.15, Math.PI / 2, 0);
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
        !this.isElevatorSequenceActive &&
        this.levelBuilder &&
        this.playerController &&
        isElevatorUnlocked
      ) {
        const pPos = this.playerController.body.position;

        // Зона перед лифтом: X от -4 до 4, Z от 15.0 до 19.0 (за 4 метра до дверей)
        if (pPos.z < 19.0 && pPos.z > 15.0 && pPos.x > -4.0 && pPos.x < 4.0) {
          this.isElevatorSequenceActive = true;
          this.elevatorPhase = "waiting_entrance_open";

          this.playerController.isLocked = true; // Отбираем управление у шара
          this.lockGameplayCamera(); // Отбираем управление у камеры

          this.levelBuilder.openEntrance(); // Командуем дверям открыться
        }
      }

      // === 2. КАТ-СЦЕНА И АВТОПИЛОТ ===
      if (this.isElevatorSequenceActive && this.levelBuilder) {
        const playerRef = this.playerController;

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

          if (dist > 0.1) {
            dir.normalize();

            // ВАЖНО: Замедлили скорость (было 12.0, стало 5.0)
            const speed = Math.min(5.0, dist * 2.5);
            const radius = 1.5;

            const vx = dir.x * speed;
            const vz = dir.z * speed;

            playerRef.body.velocity.x = vx;
            playerRef.body.velocity.z = vz;

            playerRef.body.angularVelocity.x = vz / radius;
            playerRef.body.angularVelocity.z = -vx / radius;
          } else {
            // ФАЗА 2: ДОЕХАЛИ. Точная парковка.
            playerRef.body.velocity.set(0, 0, 0);
            playerRef.body.angularVelocity.set(0, 0, 0);
            playerRef.body.position.set(0, pPos.y, 11.25);

            this.elevatorPhase = "doors_closing";

            // === ОДНОВРЕМЕННО: ЗАКРЫВАЕМ ДВЕРИ И ГАСИМ ЭКРАН ===
            this.levelBuilder.closeEntrance();
            this.fadeScreen.style.opacity = "1";

            setTimeout(() => {
              // === ФАЗА 3: МАГИЯ ПЕРЕСТРОЙКИ УРОВНЯ В ТЕМНОТЕ ===
              this.levelBuilder.setElevatorMode("exiting");

              // В ТЕМНОТЕ пересобираем активную комнату.
              // Комната 1 удаляется, комната 2 строится.
              this.levelBuilder.buildRoom(2);
              this.loadLevel(2);

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

    // Опциональная подсветка окружения (голограммы и кольцо на полу)
    this.sceneManager.holoLight.intensity = 20;
    this.sceneManager.floorLight.intensity = 10;
    this.sceneManager.ringMesh.material.emissiveIntensity = 1.2;

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

    this.composer.render();
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
    this.uiManager.updateFanProgress(this.fanLevel);

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
