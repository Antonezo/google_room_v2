import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import * as CANNON from "cannon-es";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

import { CONFIG } from "./config.js";
import { audioManager } from "./audio.js";
import { store, isNight, isSlowMo } from "./state.js";
import { PhysicsManager } from "./physics.js";
import { SceneManager, heatTex } from "./scene.js";
import { UIManager } from "./ui.js";
import { InputManager } from "./input.js";
import { ParticlePool, GameObject, MiniBeadPool } from "./utils.js";

RectAreaLightUniformsLib.init();

export class GoogleRoomApp {
  constructor() {
    this.isPaused = false;
    this.isResetting = false;
    this.lastTime = performance.now();
    this.platformImpact = 0;
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

    this.currentWord = "GOOGLE";
    this.globalFont = null;
    this.lettersEnabled = false;
    this.fansActive = false;
    this.fanLevel = 0.0;
    this.lettersHiddenByMagnet = false;
    this.currentRingIntensity = 1.2;

    this.dustPool = new ParticlePool(this.scene, heatTex, 60, "dust", 0xaaaaaa);
    this.heatPool = new ParticlePool(this.scene, heatTex, 40, "heat", 0xffb074);

    this.paintPools = CONFIG.COLORS.GOOGLE_UNIQUE.map(
      (colorHex) =>
        new ParticlePool(this.scene, heatTex, 1000, "paint", colorHex),
    );
    this.paintParticleTime = 0;

    this.letterObjects = [];
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

    this.miniBeadPool = new MiniBeadPool(
      this.world,
      this.scene,
      this.matBouncy,
      120,
    );

    this.uiManager = new UIManager({
      onTogglePause: () => {
        this.isPaused = !this.isPaused;
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
        if (this.isPaused) return this.lettersEnabled;

        this.lettersEnabled = !this.lettersEnabled;

        // Универсальная функция-предохранитель
        const setObjVisible = (obj, isVis) => {
          if (obj.setVisible) obj.setVisible(isVis);
          else if (obj.mesh) obj.mesh.visible = isVis;
        };

        if (this.lettersEnabled) {
          this.letterObjects.forEach((obj) => setObjVisible(obj, true));
          this.showLettersSmoothly();
        } else {
          this.hideLettersSmoothly();

          clearTimeout(this.lettersToggleTimeout);
          this.lettersToggleTimeout = setTimeout(() => {
            if (!this.lettersEnabled) {
              this.letterObjects.forEach((obj) => setObjVisible(obj, false));
            }
          }, 300);
        }

        return this.lettersEnabled;
      },
      onReturnLetters: () => {
        if (!this.isPaused) this.returnLettersToStart();
      },
      onApplyWord: (word) => {
        if (!this.isPaused) {
          this.changeWordSmoothly(word);
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
          ...(this.lettersEnabled ? this.letterObjects.map((d) => d.mesh) : []),
          this.ballInstancedMesh,
        ];
        const getBodyByMesh = (hitObj) => {
          if (hitObj.object === this.ballInstancedMesh) {
            const body = this.ballsPool[hitObj.instanceId];
            return body ? body : null;
          } else {
            const letterObj = this.letterObjects.find(
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

    const fontLoader = new FontLoader();
    fontLoader.load(
      "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
      (font) => {
        this.globalFont = font;
        this.spawnLetters(this.currentWord);

        // Сразу прячем буквы и отключаем им физику при старте
        if (!this.lettersEnabled) {
          this.letterObjects.forEach((obj) => {
            if (obj.setVisible) obj.setVisible(false);
            else if (obj.mesh) obj.mesh.visible = false;

            if (obj.body) obj.body.collisionFilterMask = 0; // Чтобы не было невидимых препятствий
          });
        }
      },
    );

    // === СОЗДАНИЕ ШАРА-ИГРОКА ===
    const playerRadius = CONFIG.PLAYER.RADIUS; // В config.js оставь 1.5

    const startPos = {
      x: 0,
      y: 0, // Сбросим его с высоты 5 метров (уровень пола у нас -5)
      z: 18, // Прямо перед стеклом (стекло на 14)
    };

    this.playerMesh = this.sceneManager.createPlayerMesh(playerRadius);
    this.playerBody = this.physicsManager.createPlayerBody(
      playerRadius,
      CONFIG.PLAYER.MASS,
      startPos,
    );

    // ==========================================
    // ВСТАВЛЯЕМ СЮДА: ФЕЙКОВАЯ ТЕНЬ ДЛЯ ПЛАТФОРМИНГА
    // ==========================================
    const shadowGeo = new THREE.CircleGeometry(playerRadius, 32);
    shadowGeo.rotateX(-Math.PI / 2); // Кладем круг плашмя на пол

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false, // ВАЖНО: Запрещаем тени конфликтовать с текстурой пола (убирает мерцание)
    });

    this.playerShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.scene.add(this.playerShadowMesh);
    // ==========================================

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

    // === СЛУШАТЕЛИ КЛАВИАТУРЫ ДЛЯ ИГРОКА ===
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false, // <--- ДОБАВЛЯЕМ СЮДА
    };

    // === НОВЫЙ БЛОК KEYDOWN (ТОЛЬКО ЧТЕНИЕ КНОПОК) ===
    window.addEventListener("keydown", (e) => {
      if (document.activeElement.tagName === "INPUT") return;

      const key = e.key.toLowerCase();
      if (this.keys.hasOwnProperty(key)) this.keys[key] = true;

      if (e.code === "Space") {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (
          document.activeElement &&
          document.activeElement.tagName !== "BODY"
        ) {
          document.activeElement.blur();
        }

        // Просто запоминаем, что пробел зажат. Вся физика теперь в tick()!
        this.keys.space = true;
      }
    });

    // === НОВЫЙ БЛОК KEYUP ===
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        e.stopImmediatePropagation();

        // Запоминаем, что пробел отпущен
        this.keys.space = false;
      }

      const key = e.key.toLowerCase();
      if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
    });

    // ==========================================
    // НАСТРОЙКА УПРАВЛЕНИЯ МЫШЬЮ И ПЛАВНОГО ЗУМА
    // ==========================================

    // Создаем "штатив" для камеры
    this.cameraPivot = new THREE.Object3D();
    this.cameraPivot.rotation.order = "YXZ";
    this.scene.add(this.cameraPivot);

    // Привязываем камеру к штативу
    this.cameraPivot.add(this.camera);

    // Переменные для плавного зума (дистанция от шара)
    this.targetZoom = 15.0;
    this.currentZoom = 15.0;

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
    this.controls.minPolarAngle = Math.PI / 4;   // Ограничитель неба: не дает задирать нос слишком высоко
    this.controls.maxPolarAngle = Math.PI - 0.2; // Ограничитель пола: разрешает смотреть почти вертикально сверху вниз

    // Задаем красивый стартовый ракурс! 
    // При запуске игры камера уже будет наклонена на 30 градусов вниз и висеть над шаром.
    this.cameraPivot.rotation.x = -Math.PI / 6; 
    // =========================================

    // Логика захвата курсора
    document.addEventListener("click", (e) => {
      if (
        e.target.closest("#holo-wrapper") ||
        e.target.closest("#hud-controls") ||
        e.target.tagName === "INPUT"
      )
        return;

      if (!this.controls.isLocked) {
        this.controls.lock();
      }
    });

    // Колесико мыши теперь только меняет ЦЕЛЬ (targetZoom)
    window.addEventListener("wheel", (e) => {
      if (!this.controls.isLocked) return;

      const zoomSpeed = 0.005;
      this.targetZoom += e.deltaY * zoomSpeed;

      // Ограничиваем дистанцию: от 2.0 (почти вплотную) до 40.0 (панорама)
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom, 2.0, 40.0);
    });
    requestAnimationFrame(this.tick);
  }

  initSceneObjects() {
    this.sceneManager.buildEnvironment();

    const h = CONFIG.WORLD.ROOM_SIZE;
    const w = CONFIG.WORLD.ROOM_SIZE;
    const floorY = CONFIG.WORLD.FLOOR_LEVEL;
    const ceilingY = CONFIG.WORLD.CEILING_HEIGHT;

    // Вспомогательная функция для создания стен.
    const addTiledWall = (width, height, pos, rot) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        roughness: 0.1,
        metalness: 0.1,
      });
      this.sceneManager.createWallMesh(width, height, pos, rot, mat);
    };

    // --- ЗОНА 1: ОСНОВНАЯ ЛАБОРАТОРИЯ (за окном) ---
    addTiledWall(
      w,
      h,
      new THREE.Vector3(0, floorY, 0),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
    ); // Пол
    addTiledWall(
      w,
      h,
      new THREE.Vector3(0, ceilingY, 0),
      new THREE.Vector3(Math.PI / 2, 0, 0),
    ); // Потолок
    addTiledWall(
      w,
      20,
      new THREE.Vector3(0, 2.5, -10),
      new THREE.Vector3(0, 0, 0),
    ); // Задняя стена
    addTiledWall(
      w,
      20,
      new THREE.Vector3(-15, 2.5, 0),
      new THREE.Vector3(0, Math.PI / 2, 0),
    ); // Левая
    addTiledWall(
      w,
      20,
      new THREE.Vector3(15, 2.5, 0),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    ); // Правая

    // --- ЗОНА 2: КОРИДОР ПЕРЕД ОКНОМ (где стоит камера) ---
    const corridorDepth = 30;
    const corridorZ = 15 + corridorDepth / 2;

    addTiledWall(
      w,
      corridorDepth,
      new THREE.Vector3(0, floorY, corridorZ),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
    ); // Пол коридора
    addTiledWall(
      w,
      corridorDepth,
      new THREE.Vector3(0, ceilingY, corridorZ),
      new THREE.Vector3(Math.PI / 2, 0, 0),
    ); // Потолок коридора
    addTiledWall(
      corridorDepth,
      20,
      new THREE.Vector3(-15, 2.5, corridorZ),
      new THREE.Vector3(0, Math.PI / 2, 0),
    ); // Левая стена
    addTiledWall(
      corridorDepth,
      20,
      new THREE.Vector3(15, 2.5, corridorZ),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    ); // Правая стена

    // ==========================================================
    // --- ЗОНА 3: РАЗДЕЛИТЕЛЬНАЯ СТЕНА СО СТЕКЛОМ (НОВЫЙ КОД) ---
    // ==========================================================

    // 1. Создаем красивые материалы для стены и стекла
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95, // <-- ИСПРАВЛЕНО: Делаем матовым, чтобы убрать пятна над окном
      metalness: 0.0, // <-- ИСПРАВЛЕНО: Убираем металличность
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0, // Убрали металл (был 0.1) — он давал серость
      roughness: 0.0, // Убрали матовость (была 0.05) — теперь идеально гладкое
      transmission: 1.0, // Выкрутили на 100% (было 0.8) — максимальная прозрачность
      transparent: true,
      opacity: 1,
      ior: 1.5,
      thickness: 0.1,
    });

    // 2. Настраиваем размеры
    const wallThickness = 2.0; // СДЕЛАЛИ ТОЛЩЕ (было 1.0, попробуй 3.0 или больше)
    const holeWidth = 24;
    const holeHeight = 11;
    const cornerRadius = 1.5;

    // ПОДВИНУЛИ БЛИЖЕ К КАМЕРЕ (Увеличили Z: было 12, стало 18)
    const wallPos = new THREE.Vector3(0, 2.5, 14);

    // 3. Создаем визуал (вызываем функцию из scene.js)
    const glassWallGroup = this.sceneManager.createWallWithWindow(
      w,
      20,
      wallThickness,
      holeWidth,
      holeHeight,
      cornerRadius,
      wallPos,
      null,
      wallMat,
      glassMat,
    );

    // 4. Добавляем пометку, чтобы мышка "проходила" сквозь стекло
    // (Я вижу, что в InputManager у вас уже есть фильтр: !w.mesh.userData.isGlass)
    glassWallGroup.children.forEach((child) => {
      if (child.material === glassMat) {
        child.userData.isGlass = true;
      }
    });

    // 5. Создаем физику (вызываем функцию из physics.js)
    this.physicsManager.createWallWithHole(
      w,
      20,
      wallThickness,
      holeWidth,
      holeHeight,
      wallPos,
      null,
      CONFIG.PHYSICS.GROUPS,
    );

    // ==========================================
    // 6. ДОБАВЛЯЕМ ТВЕРДОЕ ФИЗИЧЕСКОЕ СТЕКЛО
    // ==========================================
    const glassPhysicsShape = new CANNON.Box(
      new CANNON.Vec3(holeWidth / 2, holeHeight / 2, 0.1),
    );

    const glassBody = new CANNON.Body({
      mass: 0,
      material: this.matSlippery, // <--- ИЗМЕНИЛИ ЗДЕСЬ
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });

    glassBody.addShape(glassPhysicsShape);
    // Ставим физическое стекло ровно в те же координаты, что и саму стену
    glassBody.position.set(wallPos.x, wallPos.y, wallPos.z);

    // Добавляем в физический мир
    this.world.addBody(glassBody);
    // ==========================================

    // Физический пол для всей сцены
    const floorBody = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(50, 1, 50)));
    floorBody.position.set(0, floorY - 1, 0);
    this.world.addBody(floorBody);

    // ==========================================
    // 7. НЕВИДИМЫЕ ФИЗИЧЕСКИЕ СТЕНЫ ПО ПЕРИМЕТРУ
    // ==========================================
    const createPhysicsWall = (x, y, z, halfX, halfY, halfZ) => {
      const wallBody = new CANNON.Body({
        mass: 0,
        material: this.matSlippery, // <--- ИЗМЕНИЛИ ЗДЕСЬ
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
        collisionFilterMask:
          CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
      });
      wallBody.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));
      wallBody.position.set(x, y, z);
      this.world.addBody(wallBody);
    };

    // Параметры: (X, Y, Z, половина_ширины, половина_высоты, половина_длины)

    // 1. Левая стена (чуть левее визуала на x: -15)
    createPhysicsWall(-16, 2.5, 10, 1, 10, 35);

    // 2. Правая стена (чуть правее визуала на x: 15)
    createPhysicsWall(16, 2.5, 10, 1, 10, 35);

    // 3. Задняя стена лаборатории (за окном, визуально на z: -10)
    // Делаем ее широкой, чтобы перекрывала углы с запасом
    createPhysicsWall(0, 2.5, -11, 25, 10, 1);

    // 4. Невидимая "четвертая стена" сзади камеры в коридоре (z: 46)
    // Чтобы шар не мог уехать назад за пределы экрана
    createPhysicsWall(0, 2.5, 46, 25, 10, 1);
    // ==========================================

    // Инициализация шариков и инстансов
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

    // 1. Визуальная часть (Three.js)
    const boxGeo = new THREE.BoxGeometry(4, 4, 4); // Размер 4x4x4
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      roughness: 0.5,
    });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    boxMesh.receiveShadow = true;
    this.scene.add(boxMesh);

    // 2. Физическая часть (Cannon.js)
    // ВАЖНО: В Cannon.js размеры Box задаются ПОЛОВИНАМИ от реальных!
    const boxShape = new CANNON.Box(new CANNON.Vec3(2, 2, 2));
    const boxBody = new CANNON.Body({
      mass: 5, // Легче шара (у шара 20), поэтому мы сможем его толкать!
      material: this.matStandard,
      position: new CANNON.Vec3(10, 5, 0), // Спавним где-нибудь сбоку
    });
    boxBody.addShape(boxShape);
    this.world.addBody(boxBody);

    // 3. Сохраняем, чтобы синхронизировать в tick()
    this.interactiveBox = { mesh: boxMesh, body: boxBody };
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

    this.letterObjects.forEach((obj, i) => {
      const body = obj.body;
      const palette = CONFIG.COLORS.GOOGLE_PALETTE;
      body.userData.googleColor = palette[i % palette.length];
    });

    // Если буквы уже открыты (по сюжету) — возвращаем их на старт.
    // Если еще закрыты — не трогаем, пусть сидят в невидимости.
    if (this.lettersEnabled) {
      this.returnLettersToStart();
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
        for (const l of this.letterObjects) {
          l.mesh.material.emissiveIntensity = 0.02;
          l.mesh.material.roughness = 0.25;
          l.mesh.material.color.setHex(l.body.userData.googleColor);
        }
        this.setBallGlow(true);
      } else {
        for (const l of this.letterObjects) {
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
            if (this.lettersEnabled) {
              this.hideLettersSmoothly();
              this.lettersHiddenByMagnet = true;
            }
          } else {
            if (this.lettersHiddenByMagnet) {
              this.uiManager.setLettersActive(true);
              this.showLettersSmoothly();
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
    this.letterObjects.forEach((obj) => {
      if (!this.lettersEnabled || obj.body.collisionFilterMask === 0) return;

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

  changeWordSmoothly(newWord) {
    if (this.isChangingWord) return;

    if (this.currentWord === newWord) {
      this.returnLettersToStart();
      return;
    }

    this.isChangingWord = true;

    // Очищаем старые застрявшие таймеры
    if (this.wordTimer1) clearTimeout(this.wordTimer1);
    if (this.wordTimer2) clearTimeout(this.wordTimer2);

    if (!this.lettersEnabled) {
      this.currentWord = newWord;
      this.spawnLetters(this.currentWord);
      this.letterObjects.forEach((obj) => {
        if (obj.setVisible) obj.setVisible(false);
        else if (obj.mesh) obj.mesh.visible = false;
      });
      this.isChangingWord = false;
      return;
    }

    const now = performance.now();
    const duration = 300;

    this.letterObjects.forEach((obj) => {
      const body = obj.body;
      if (!body) return; // Защита от краша, если тело уже удалено

      body.userData.isShrinkingWord = true;
      body.userData.shrinkStartTime = now;

      body.collisionFilterMask = 0;
      body.type = CANNON.Body.KINEMATIC;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    });

    this.wordTimer1 = setTimeout(() => {
      this.letterObjects.forEach((obj) => {
        if (obj.body) this.createDustExplosion(obj.body.position, 0.35);
      });

      this.currentWord = newWord;
      this.spawnLetters(this.currentWord);

      const growStartTime = performance.now();

      this.letterObjects.forEach((obj) => {
        const body = obj.body;
        if (!body) return;

        obj.mesh.scale.set(0, 0, 0);

        body.userData.isGrowingWord = true;
        body.userData.growStartTime = growStartTime;

        body.collisionFilterMask = 0;
        body.type = CANNON.Body.KINEMATIC;
      });

      this.wordTimer2 = setTimeout(() => {
        this.letterObjects.forEach((obj) => {
          const body = obj.body;
          if (!body) return;

          body.userData.isGrowingWord = false;
          obj.mesh.scale.set(1, 1, 1);

          body.type = CANNON.Body.DYNAMIC;
          body.collisionFilterMask =
            CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS;

          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.previousPosition.copy(body.position);

          body.sleep();
        });

        this.isChangingWord = false;
      }, duration);
    }, duration);
  }

  spawnLetters(wordStr) {
    this.letterObjects.forEach((obj) => obj.destroy());
    this.letterObjects.length = 0;

    if (!this.globalFont || !wordStr) return;

    const charSpacing = 2.8;
    const totalWidth = wordStr.length * charSpacing;
    const startXOffset = -totalWidth / 2 + charSpacing / 2;

    for (let i = 0; i < wordStr.length; i++) {
      const color =
        CONFIG.COLORS.GOOGLE_PALETTE[i % CONFIG.COLORS.GOOGLE_PALETTE.length];
      const geo = new TextGeometry(wordStr[i], {
        font: this.globalFont,
        size: 2.5,
        height: 0.8,
        curveSegments: 8,
        bevelEnabled: true,
        bevelThickness: 0.15,
        bevelSize: 0.08,
        bevelSegments: 5,
      });
      geo.center();
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.5,
          metalness: 0.1,
          emissive: color,
          emissiveIntensity: 0.0,
        }),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      geo.computeBoundingBox();
      const size = geo.boundingBox.getSize(new THREE.Vector3());
      const body = new CANNON.Body({
        mass: CONFIG.PHYSICS.LETTER_MASS,
        material: this.matBouncy,
        angularDamping: 0.1,
        linearDamping: 0.01,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS,
        collisionFilterMask:
          CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS,
      });
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)),
      );
      const startX = startXOffset + i * charSpacing;
      body.position.set(startX, 2, 0);
      body.userData = {
        startPos: new CANNON.Vec3(startX, 2, 0),
        googleColor: color,
        halfHeight: size.y / 2,
      };
      body.sleep();

      const letterObj = new GameObject(this.world, this.scene, mesh, body);

      body.addEventListener("collide", (e) => {
        if (!this.lettersEnabled) return;
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v <= 1.35) return;
        const contactPos = new THREE.Vector3(
          e.contact.bi.position.x + e.contact.ri.x,
          e.contact.bi.position.y + e.contact.ri.y,
          e.contact.bi.position.z + e.contact.ri.z,
        );
        if (e.body && e.body.mass === 0) {
          this.spawnMiniBeads(contactPos, body.userData.googleColor);
          if (
            Math.abs(contactPos.x) < 5 &&
            Math.abs(contactPos.z) < 5 &&
            contactPos.y < CONFIG.WORLD.FLOOR_LEVEL + 1.0
          ) {
            this.platformImpact = 1.0;
          }
        }
        if (typeof audioManager !== "undefined" && audioManager.playHitSound) {
          audioManager.playHitSound(v, isSlowMo());
        }
      });

      this.letterObjects.push(letterObj);
    }
    if (isNight()) this.setBallGlow(true);
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

  hideLettersSmoothly() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();

    this.letterObjects.forEach((obj) => {
      const body = obj.body;
      body.userData.isShrinkingWord = true;
      body.userData.isGrowingWord = false;
      body.userData.shrinkStartTime = now;

      body.collisionFilterMask = 0;

      this.createDustExplosion(body.position, 0.25);
    });
  }

  showLettersSmoothly() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();

    this.letterObjects.forEach((obj) => {
      const body = obj.body;
      body.userData.isGrowingWord = true;
      body.userData.isShrinkingWord = false;
      body.userData.growStartTime = now;
    });

    this.returnLettersToStart();
  }

  returnLettersToStart() {
    if (this.letterObjects.length === 0 || this.isPaused) return;

    const now = performance.now();

    this.letterObjects.forEach((obj) => {
      const body = obj.body;

      body.type = CANNON.Body.KINEMATIC;
      body.collisionFilterMask = 0;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);

      body.userData.returnStartPos = body.position.clone();
      body.userData.returnStartQuat = {
        x: body.quaternion.x,
        y: body.quaternion.y,
        z: body.quaternion.z,
        w: body.quaternion.w,
      };
      body.userData.returnStartTime = now;

      body.userData.isReturning = true;
    });
  }

  spawnMiniBeads(pos, colorHex) {
    for (let i = 0; i < 12; i++) {
      this.miniBeadPool.spawn(pos, colorHex);
    }
  }

  createDustExplosion(pos, intensity01) {
    const basePos = new THREE.Vector3(pos.x, pos.y, pos.z);

    const cloudCount = 4 + Math.floor(4 * intensity01);
    for (let i = 0; i < cloudCount; i++) {
      const spawnPos = basePos
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
          ),
        );
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        0.1 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.2,
      );
      const scale = 1.0 + Math.random() * 1.5;
      const decay = 0.02 + Math.random() * 0.02;

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
    // Жестко фиксируем горизонт, чтобы камеру не кренило
    if (this.cameraPivot) this.cameraPivot.rotation.z = 0;
    this.camera.rotation.z = 0;

    requestAnimationFrame(this.tick);

    if (!this.isPaused) {
      let dt = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;
      if (dt > 0.1) dt = 0.1;

      this.physicsManager.step(dt, isSlowMo());
      const timeSec = currentTime / 1000;

      this.inputManager.update(dt);

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

      // === 7. ПЛАВНОЕ СЛЕДОВАНИЕ КАМЕРЫ (CHASE CAMERA) ===
      if (this.cameraPivot) {
        // Берем позицию шара
        const targetPos = this.playerMesh.position.clone();

        // Поднимаем точку фокусировки на полметра вверх (улучшает ракурс)
        targetPos.y += 2.5;

        // Плавная "резинка" следования. 15 - это жесткость (чем больше, тем резче)
        this.cameraPivot.position.lerp(targetPos, 15 * dt);
        this.cameraPivot.updateMatrixWorld();
      }
      // ==========================================
      // СИНХРОНИЗАЦИЯ И УПРАВЛЕНИЕ ШАРОМ-ИГРОКОМ
      // ==========================================
      if (this.playerMesh && this.playerBody) {
        this.playerMesh.position.copy(this.playerBody.interpolatedPosition);
        this.playerMesh.quaternion.copy(this.playerBody.interpolatedQuaternion);

        // 2. Умная проверка пола с "Coyote Time" (Защита от углов)
        let actualGroundContact = false;
        for (let i = 0; i < this.world.contacts.length; i++) {
          let contact = this.world.contacts[i];
          if (
            contact.bi === this.playerBody ||
            contact.bj === this.playerBody
          ) {
            if (contact.bi === this.playerBody && contact.ni.y < -0.5)
              actualGroundContact = true;
            if (contact.bj === this.playerBody && contact.ni.y > 0.5)
              actualGroundContact = true;
          }
        }

        // Даем шару 150мс "памяти" о поле (помогает прыгать на уступах и в углах)
        this.coyoteTimer = this.coyoteTimer || 0;
        if (actualGroundContact) {
          this.coyoteTimer = 0.15;
        } else {
          this.coyoteTimer -= dt;
        }

        // Сохраняем флаг глобально, чтобы его мог прочитать Пробел
        this.isPlayerGrounded = this.coyoteTimer > 0;

       // ==========================================
        // === 2.1 ПЛАВНЫЙ ЗУМ И УМНАЯ КАМЕРА (SPRING ARM) ===
        // ==========================================
        this.currentZoom = THREE.MathUtils.lerp(
          this.currentZoom,
          this.targetZoom,
          10 * dt,
        );

        // Камера просто находится сзади на оси Z. Всю высоту задает наклон штатива!
        const idealLocalPos = new THREE.Vector3(0, 0, this.currentZoom);
        const idealWorldPos = idealLocalPos
          .clone()
          .applyMatrix4(this.cameraPivot.matrixWorld);

        const pivotPos = this.cameraPivot.position;
        const rayDir = new THREE.Vector3().subVectors(idealWorldPos, pivotPos);
        const maxDist = rayDir.length();
        rayDir.normalize();

        if (!this.cameraRaycaster) this.cameraRaycaster = new THREE.Raycaster();
        this.cameraRaycaster.set(pivotPos, rayDir);

        const wallsMeshes = this.sceneManager.walls.map((w) => w.mesh);
        const intersects = this.cameraRaycaster.intersectObjects(wallsMeshes);

        let finalDist = maxDist;
        if (intersects.length > 0 && intersects[0].distance < maxDist) {
          finalDist = intersects[0].distance - 0.6;
          if (finalDist < 1.5) finalDist = 1.5;
        }

        // Применяем финальную дистанцию
        this.camera.position.set(0, 0, finalDist);
        
        // ВАЖНО: обнуляем вращение самой камеры, чтобы навсегда убрать "крен" пола
        this.camera.rotation.set(0, 0, 0);

        // 3. Умная подготовка векторов (Относительно взгляда)
        // Используем положительные значения, так как математика ниже сама найдет направление
        const torqueForce = -400.0;
        const airForce = -120.0;
        const torqueVec = new CANNON.Vec3(0, 0, 0);
        const forceVec = new CANNON.Vec3(0, 0, 0);

        let inputX = 0;
        let inputZ = 0;
        if (this.keys.w) inputZ -= 1;
        if (this.keys.s) inputZ += 1;
        if (this.keys.a) inputX -= 1;
        if (this.keys.d) inputX += 1;

        if (inputX !== 0 || inputZ !== 0) {
          // 1. Считаем направление "Вперед" и "Вправо" на основе поворота штатива
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            this.cameraPivot.quaternion,
          );
          forward.y = 0;
          forward.normalize();

          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(
            this.cameraPivot.quaternion,
          );
          right.y = 0;
          right.normalize();

          // 2. Формируем итоговый вектор движения (куда хотим катиться)
          const moveDir = new THREE.Vector3()
            .addScaledVector(right, inputX)
            .addScaledVector(forward, -inputZ)
            .normalize();

          // 3. МАГИЯ: Векторное произведение (Cross Product)
          // Мы берем направление движения и "перемножаем" его с вектором Вверх (0, 1, 0).
          // Результат — это ВСЕГДА идеальная ось, вокруг которой должен крутиться шар,
          // чтобы ехать в сторону moveDir.
          const torqueAxis = new THREE.Vector3().crossVectors(
            moveDir,
            new THREE.Vector3(0, 1, 0),
          );

          torqueVec.x = torqueAxis.x * torqueForce;
          torqueVec.y = torqueAxis.y * torqueForce;
          torqueVec.z = torqueAxis.z * torqueForce;

          // Сила для управления в прыжке
          forceVec.x = moveDir.x * airForce;
          forceVec.z = moveDir.z * airForce;
        }

        // 4. ПРИМЕНЯЕМ РАЗНУЮ ФИЗИКУ
        if (this.isPlayerGrounded) {
          if (inputX !== 0 || inputZ !== 0) {
            this.playerBody.wakeUp();
            this.playerBody.applyTorque(torqueVec);

            const maxSpin = 35.0;
            if (this.playerBody.angularVelocity.length() > maxSpin) {
              this.playerBody.angularVelocity.scale(
                maxSpin / this.playerBody.angularVelocity.length(),
                this.playerBody.angularVelocity,
              );
            }
          }
        } else {
          // МЫ В ВОЗДУХЕ: Легкое подруливание
          if (inputX !== 0 || inputZ !== 0) {
            this.playerBody.wakeUp();
            this.playerBody.applyForce(forceVec, new CANNON.Vec3(0, 0, 0));
          }
          this.playerBody.angularVelocity.scale(
            0.92,
            this.playerBody.angularVelocity,
          );
        }

        // === 5. ПРЫЖОК (БАННИХОП) ===
        if (this.keys.space && this.isPlayerGrounded) {
          this.playerBody.wakeUp();
          this.playerBody.velocity.y = 9.0;

          // Жесткий сброс, чтобы не прыгнуть дважды за кадр
          this.isPlayerGrounded = false;
          this.coyoteTimer = 0;

          if (
            typeof audioManager !== "undefined" &&
            audioManager.playPuffSound
          ) {
            audioManager.playPuffSound(0.5);
          }
        }
      }

      // ==========================================
      // === 6. ЛОГИКА ФЕЙКОВОЙ ТЕНИ ===
      // ==========================================
      if (this.playerShadowMesh) {
        const floorY = CONFIG.WORLD.FLOOR_LEVEL;

        this.playerShadowMesh.position.set(
          this.playerBody.interpolatedPosition.x,
          floorY + 0.05,
          this.playerBody.interpolatedPosition.z,
        );

        const heightOffset =
          this.playerBody.interpolatedPosition.y -
          CONFIG.PLAYER.RADIUS -
          floorY;

        // Динамический размер: чем выше шар, тем меньше и бледнее тень
        let shadowScale = 1.0 - heightOffset / 12.0; // 12.0 - сила уменьшения
        if (shadowScale < 0.2) shadowScale = 0.2; // Тень никогда не исчезает полностью

        this.playerShadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
        this.playerShadowMesh.material.opacity = 0.5 * shadowScale; // Бледнеет в полете
      }

      // ==========================================
      // ОГРАНИЧЕНИЕ НАКЛОНА КАМЕРЫ И УБИРАНИЕ КРЕНА
      // ==========================================
      if (this.cameraPivot) {
        this.cameraPivot.rotation.z = 0; // Блокируем крен "бочкой"
        this.camera.rotation.z = 0;
      }

      // ВСТАВЛЯЕМ СИНХРОНИЗАЦИЮ КОРОБКИ ПРЯМО СЮДА:
      if (this.interactiveBox) {
        this.interactiveBox.mesh.position.copy(
          this.interactiveBox.body.interpolatedPosition,
        );
        this.interactiveBox.mesh.quaternion.copy(
          this.interactiveBox.body.interpolatedQuaternion,
        );
      }
    } else {
      // Обрати внимание, чтобы это было ДО закрывающей скобки блока if (!this.isPaused)
      this.lastTime = currentTime;
    }

    this.updateLetterAnimations(currentTime);
    this.updateBallInstances(currentTime);

    // ==========================================
    // ЛОГИКА НЕЗАВИСИМОГО СВЕТА В ЛАБОРАТОРИИ
    // ==========================================
    this.sceneManager.labPanels.forEach((panel) => {
      const intensity = panel.group.userData.intensity;

      // 1. Свечение самой белой панели (визуальный эффект)
      // Мы ставим 5.0, чтобы сработал эффект Bloom (свечение)
      panel.diffuser.material.emissiveIntensity = 5.0 * intensity;

      // 2. Площадной свет (мягкое освещение комнаты)
      panel.rectLight.intensity = 15.0 * intensity;

      // 3. Прожектор (для отрисовки теней от шариков и букв)
      panel.shadowLight.intensity = 80.0 * intensity;
    });

    // Опциональная подсветка окружения (голограммы и кольцо на полу)
    this.sceneManager.holoLight.intensity = 20;
    this.sceneManager.floorLight.intensity = 10;
    this.sceneManager.ringMesh.material.emissiveIntensity = 1.2;
    // ==========================================

    // === ЖЕСТКАЯ ЗАЩИТА КАМЕРЫ ОТ ПРОХОЖДЕНИЯ СКВОЗЬ ПОЛ ===
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

    for (const obj of this.letterObjects) {
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

    this.physicsManager.applyEnvironmentForces(
      this.lettersEnabled ? this.letterObjects.map((obj) => obj.body) : [],
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

  updateLetterAnimations(currentTime) {
    const targetColor = new THREE.Color();

    this.letterObjects.forEach((obj) => {
      const body = obj.body;

      if (body.userData.isShrinkingWord) {
        const progress = Math.min(
          (currentTime - body.userData.shrinkStartTime) / 300,
          1.0,
        );
        const scale = 1.0 - THREE.MathUtils.smoothstep(progress, 0, 1);
        obj.mesh.scale.set(scale, scale, scale);

        if (progress >= 1.0) {
          body.userData.isShrinkingWord = false;
          body.type = CANNON.Body.KINEMATIC;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.sleep();
        }
      } else if (body.userData.isGrowingWord) {
        const progress = Math.min(
          (currentTime - body.userData.growStartTime) / 300,
          1.0,
        );
        const scale = THREE.MathUtils.smoothstep(progress, 0, 1);
        obj.mesh.scale.set(scale, scale, scale);
      }

      if (body.userData.googleColor !== undefined) {
        targetColor.setHex(body.userData.googleColor);
        obj.mesh.material.color.lerp(targetColor, 0.05);
        if (obj.mesh.material.emissive)
          obj.mesh.material.emissive.lerp(targetColor, 0.05);
      }

      if (body.userData.isReturning) {
        const elapsed = currentTime - body.userData.returnStartTime;
        let progress = Math.min(elapsed / 800, 1.0);
        const ease = 1 - Math.pow(1 - progress, 3);

        body.position.x = THREE.MathUtils.lerp(
          body.userData.returnStartPos.x,
          body.userData.startPos.x,
          ease,
        );
        body.position.y = THREE.MathUtils.lerp(
          body.userData.returnStartPos.y,
          body.userData.startPos.y,
          ease,
        );
        body.position.z = THREE.MathUtils.lerp(
          body.userData.returnStartPos.z,
          body.userData.startPos.z,
          ease,
        );

        const qStart = new THREE.Quaternion(
          body.userData.returnStartQuat.x,
          body.userData.returnStartQuat.y,
          body.userData.returnStartQuat.z,
          body.userData.returnStartQuat.w,
        );
        qStart.slerp(new THREE.Quaternion(0, 0, 0, 1), ease);
        body.quaternion.set(qStart.x, qStart.y, qStart.z, qStart.w);

        if (progress >= 1.0) {
          body.userData.isReturning = false;
          body.type = CANNON.Body.DYNAMIC;
          body.collisionFilterMask =
            CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.previousPosition.copy(body.position);
          body.sleep();
        }
      }
      obj.update();
    });
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

const app = new GoogleRoomApp();
