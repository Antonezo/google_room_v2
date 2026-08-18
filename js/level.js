import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CONFIG } from "./config.js";
import { audioManager } from "./audio.js";
import {
  tileTex,
  tileNormalTex,
  tileRoughTex,
  plasticYellowBaseTex,
  plasticYellowNormalTex,
  plasticYellowRoughTex,
  plasticGreenBaseTex,
  plasticGreenNormalTex,
  plasticGreenRoughTex,
} from "./scene.js";

export class LevelBuilder {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.world = physicsManager.world;
    this.scene = sceneManager.scene;

    // Ссылки на материалы для удобства
    this.matStandard = physicsManager.matStandard;
    this.matSlippery = physicsManager.matSlippery;
    this.matBox = physicsManager.matBox || physicsManager.matStandard;
    this.matBoxTop = physicsManager.matBoxTop || this.matBox;

    // Параметры комнаты
    this.h = CONFIG.WORLD.ROOM_SIZE;
    this.w = CONFIG.WORLD.ROOM_SIZE;
    this.floorY = CONFIG.WORLD.FLOOR_LEVEL;
    this.ceilingY = CONFIG.WORLD.CEILING_HEIGHT;

    // === НОВАЯ СТРУКТУРА УРОВНЕЙ ===
    // Пока ничего не удаляем и не пересобираем.
    // Просто начинаем складывать объекты по категориям.
    this.currentRoomId = 1;

    // Корневой контейнер всего уровня.
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "LevelRoot";
    this.scene.add(this.rootGroup);

    this.currentRoomGroup = new THREE.Group();
    this.currentRoomGroup.name = "CurrentRoom";

    this.staticLevelGroup = new THREE.Group();
    this.staticLevelGroup.name = "StaticLevel";

    this.rootGroup.add(this.currentRoomGroup);
    this.rootGroup.add(this.staticLevelGroup);

    this.currentRoomBodies = [];
    this.staticBodies = [];
    this.pushableObjects = [];

    // Материалы комнат, сохранённые во время предварительного прогрева.
    //
    // Они больше не привязаны к видимым мешам, но остаются живыми,
    // чтобы Three.js не удалял уже скомпилированные WebGL-программы.
    this.preservePrewarmedMaterials = false;
    this.prewarmedMaterialKeepAlive = new Set();

    this.room2GoalMarkerMesh = null;
    this.room2GoalMarkerBody = null;

    // Отдельное состояние головоломки комнаты 2.
    // Оно больше не связано со старой промежуточной дверью.
    this.room2PuzzleSolved = false;

    // Пульсация красного дна ячейки комнаты 2.
    this.room2SocketFloorMaterial = null;
    this.room2SocketPulseTime = 0;
    this.room2SocketGlowLight = null;

    // Ждём настоящий цикл:
    // стартовый лифт открылся -> затем полностью закрылся.
    this.room2SocketSawStartElevatorOpen = false;
    this.room2SocketCountdownStarted = false;

    // Комнатные лифты.
    this.roomElevators = new Map();

    // Callback завершения головоломки комнаты 2.
    // Назначается снаружи, в main.js.
    this.onRoom2PuzzleSolved = null;

    this.buildTarget = "static";
    this.elevatorDoorPulseTime = 0;
  }

  setBuildTarget(target) {
    // target: "room" | "static"
    this.buildTarget = target;
  }

  build() {
    // 1. Общее окружение: небо, базовый свет, декоративные группы.
    this.setBuildTarget("static");
    this.sceneManager.buildEnvironment();

    // 2. Свет остаётся общим/статическим.
    this.setBuildTarget("static");

    // 3. Каждый сектор теперь сам создаёт нужные ему лифты.
    // Специального постоянного двустороннего MainElevator больше нет.
    this.buildRoom(1);

    // Возвращаем безопасный режим по умолчанию.
    this.setBuildTarget("static");
  }

  getBuildGroup() {
    if (this.buildTarget === "room") {
      return this.currentRoomGroup;
    }

    return this.staticLevelGroup;
  }

  registerMesh(mesh) {
    if (!mesh) return mesh;

    const group = this.getBuildGroup();

    // Если объект уже где-то в сцене, аккуратно переподключаем его в нужную группу.
    if (mesh.parent && mesh.parent !== group) {
      mesh.parent.remove(mesh);
    }

    group.add(mesh);
    return mesh;
  }

  registerBody(body) {
    if (!body) return body;

    if (this.buildTarget === "room") {
      this.currentRoomBodies.push(body);
    } else {
      this.staticBodies.push(body);
    }

    return body;
  }

  addBody(body) {
    this.world.addBody(body);
    this.registerBody(body);
    return body;
  }

  disposeObject3D(object) {
    if (!object) return;

    object.traverse((child) => {
      if (!child.isMesh) return;

      if (child.geometry) {
        child.geometry.dispose();
      }

      if (child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((material) => {
          if (!material) return;

          if (this.preservePrewarmedMaterials) {
            // Во время стартового прогрева материал сохраняем живым.
            // Это удерживает связанную WebGL-программу в кеше Three.js,
            // даже когда временный меш комнаты уже удалён.
            this.prewarmedMaterialKeepAlive.add(material);
            return;
          }

          // При обычной игровой пересборке материал по-прежнему освобождаем.
          material.dispose();
        });
      }
    });
  }

  clearGroup(group) {
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0];

      // Удаляем все меши этой группы из sceneManager.walls,
      // иначе камера/raycast будет видеть уже удалённые "призрачные" стены.
      if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
        child.traverse((obj) => {
          if (!obj.isMesh) return;

          this.sceneManager.walls = this.sceneManager.walls.filter(
            (wall) => wall.mesh !== obj,
          );
        });
      }

      this.disposeObject3D(child);
      group.remove(child);
    }
  }

  clearBodies(bodies) {
    if (!bodies) return;

    bodies.forEach((body) => {
      if (body && this.world.bodies.includes(body)) {
        this.world.removeBody(body);
      }
    });

    bodies.length = 0;
  }

  clearCurrentRoom() {
    this.clearGroup(this.currentRoomGroup);
    this.clearBodies(this.currentRoomBodies);

    if (this.pushableObjects) {
      this.pushableObjects.length = 0;
    }

    this.room2GoalMarkerMesh = null;
    this.room2GoalMarkerBody = null;

    // При полной перестройке комнаты её головоломка
    // снова считается нерешённой.
    this.room2PuzzleSolved = false;
    this.room2SocketFloorMaterial = null;
    this.room2SocketPulseTime = 0;
    this.room2SocketGlowLight = null;

    this.room2SocketSawStartElevatorOpen = false;
    this.room2SocketCountdownStarted = false;

    if (audioManager?.stopBoxSlide) {
      audioManager.stopBoxSlide();
    }

    // Все лифты, которые были частью текущей комнаты,
    // больше не должны обновляться после пересборки комнаты.
    if (this.roomElevators) {
      this.roomElevators.clear();
    }

    console.log("[LEVEL] Current room cleared");
  }

  buildRoom(levelId) {
    // Строит только одну активную комнату.
    // Лифт, двери и общее окружение здесь не создаются.
    this.clearCurrentRoom();

    this.currentRoomId = levelId;
    this.setBuildTarget("room");

    if (levelId === 1) {
      this.buildRoom1VisualWalls();
      this.buildRoom1Physics();
    } else if (levelId === 2) {
      this.buildSecondRoom();
      this.buildRoom2Physics();
    } else if (levelId === 3) {
      this.buildThirdRoom();
      this.buildRoom3Physics();
    } else {
      console.warn(
        `[LEVEL] Unknown room id: ${levelId}. Falling back to room 1.`,
      );
      this.currentRoomId = 1;
      this.buildRoom1VisualWalls();
      this.buildRoom1Physics();
    }

    // Освещение принадлежит именно текущей комнате.
    // Пока buildTarget === "room", светильники попадут
    // в currentRoomGroup и удалятся вместе с комнатой.
    this.buildLightingPanels(this.currentRoomId);
    this.setBuildTarget("static");

    console.log(`[LEVEL] Room ${this.currentRoomId} built`);
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
  addTiledWall(
    width,
    height,
    pos,
    rot,
    uvOffsetX = 0,
    uvOffsetY = 0,
    color = 0xffffff,
  ) {
    // Плитка должна быть только на вертикальных белых стенах.
    // Полы и потолки обычно имеют rotation.x = +/- Math.PI / 2,
    // поэтому их не текстурируем плиткой.
    const isVerticalWall = Math.abs(rot.x) < 0.01;
    const useTileTexture = color === 0xffffff && isVerticalWall;

    const mat = new THREE.MeshStandardMaterial({
      color: color,
      map: useTileTexture ? tileTex : null,
      normalMap: useTileTexture ? tileNormalTex : null,
      roughnessMap: useTileTexture ? tileRoughTex : null,
      side: THREE.DoubleSide,
      roughness: useTileTexture ? 0.35 : 0.7,
      metalness: 0.0,
      dithering: true,
    });

    const mesh = this.sceneManager.createWallMesh(width, height, pos, rot, mat);
    this.registerMesh(mesh);

    if (uvOffsetX !== 0 || uvOffsetY !== 0) {
      const uvArray = mesh.geometry.attributes.uv.array;

      for (let i = 0; i < uvArray.length; i += 2) {
        uvArray[i] += uvOffsetX;
        uvArray[i + 1] += uvOffsetY;
      }

      mesh.geometry.attributes.uv.needsUpdate = true;
    }
    return mesh;
  }

  addSciFiFloor({
    width,
    depth,
    centerZ,

    panelSize = 5.0,

    baseColor = 0xbfc5c8,
    panelColor = 0xd8dddf,

    seamColor = 0x667078,
    glowColor = 0xb8f4ff,
  }) {
    const root = new THREE.Group();
    root.name = "SciFiFloor";

    // ==========================================
    // НИЖНЯЯ ОСНОВА
    // ==========================================

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,

      roughness: 0.72,
      metalness: 0.08,

      side: THREE.DoubleSide,
      dithering: true,
    });

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      baseMaterial,
    );

    base.rotation.x = -Math.PI / 2;

    base.position.set(0, this.floorY, centerZ);

    base.receiveShadow = true;
    base.userData.skipWallMaterialUpdate = true;

    root.add(base);

    // ==========================================
    // МАТЕРИАЛЫ ПАНЕЛЕЙ
    // ==========================================

    const panelMaterial = new THREE.MeshStandardMaterial({
      color: panelColor,

      roughness: 0.56,
      metalness: 0.1,

      dithering: true,
    });

    const insetMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xd7dde0,

      roughness: 0.32,
      metalness: 0.02,

      clearcoat: 0.5,
      clearcoatRoughness: 0.22,

      reflectivity: 0.34,

      dithering: true,
    });

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: 0x4e5961,

      roughness: 0.62,
      metalness: 0.25,

      dithering: true,
    });

    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0xcdf6ff,

      emissive: 0xcdf6ff,
      emissiveIntensity: 0.34,

      roughness: 0.5,
      metalness: 0.04,

      toneMapped: false,
    });

    // ==========================================
    // РАЗМЕРЫ
    // ==========================================

    const columns = Math.round(width / panelSize);

    const rows = Math.round(depth / panelSize);

    const gap = 0.18;

    const panelWidth = panelSize - gap;

    const panelDepth = panelSize - gap;

    // Небольшая высота панели над основой.
    const panelHeight = 0.06;

    const startX = -width / 2 + panelSize / 2;

    const startZ = centerZ - depth / 2 + panelSize / 2;

    // ==========================================
    // ПАНЕЛИ
    // ==========================================

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = startX + column * panelSize;

        const z = startZ + row * panelSize;

        // ------------------------------
        // ОСНОВНАЯ ПАНЕЛЬ
        // ------------------------------
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
          panelMaterial,
        );

        panel.position.set(x, this.floorY + panelHeight / 2 + 0.01, z);

        panel.castShadow = false;
        panel.receiveShadow = true;

        panel.userData.skipWallMaterialUpdate = true;

        root.add(panel);

        // ------------------------------
        // ВНУТРЕННЯЯ ВСТАВКА / РАМКА
        // ------------------------------
        const insetMargin = 0.34;
        const insetHeight = 0.012;

        const inset = new THREE.Mesh(
          new THREE.BoxGeometry(
            panelWidth - insetMargin * 2,
            insetHeight,
            panelDepth - insetMargin * 2,
          ),
          insetMaterial,
        );

        inset.position.set(
          x,
          this.floorY + panelHeight + insetHeight / 2 + 0.012,
          z,
        );

        inset.castShadow = false;
        inset.receiveShadow = true;

        inset.userData.skipWallMaterialUpdate = true;

        root.add(inset);
      }
    }

    // ==========================================
    // ТЁМНЫЕ ШВЫ ПО X
    // ==========================================

    const seamWidth = 0.1;
    const seamHeight = 0.025;

    for (let column = 1; column < columns; column++) {
      const x = -width / 2 + column * panelSize;

      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(seamWidth, seamHeight, depth),
        seamMaterial,
      );

      seam.position.set(x, this.floorY + 0.025, centerZ);

      seam.userData.skipWallMaterialUpdate = true;

      root.add(seam);
    }

    // ==========================================
    // ТЁМНЫЕ ШВЫ ПО Z
    // ==========================================

    for (let row = 1; row < rows; row++) {
      const z = centerZ - depth / 2 + row * panelSize;

      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(width, seamHeight, seamWidth),
        seamMaterial,
      );

      seam.position.set(0, this.floorY + 0.025, z);

      seam.userData.skipWallMaterialUpdate = true;

      root.add(seam);
    }

    // ==========================================
    // СВЕТЯЩИЕСЯ ЛИНИИ
    // ==========================================

    const glowWidth = 0.035;
    const glowHeight = 0.012;

    for (let column = 1; column < columns; column++) {
      const x = -width / 2 + column * panelSize;

      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(glowWidth, glowHeight, depth),
        glowMaterial,
      );

      glow.position.set(x, this.floorY + 0.075, centerZ);

      glow.userData.skipWallMaterialUpdate = true;

      root.add(glow);
    }

    for (let row = 1; row < rows; row++) {
      const z = centerZ - depth / 2 + row * panelSize;

      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(width, glowHeight, glowWidth),
        glowMaterial,
      );

      glow.position.set(0, this.floorY + 0.075, z);

      glow.userData.skipWallMaterialUpdate = true;

      root.add(glow);
    }

    this.registerMesh(root);

    return root;
  }

  addPanelWall(
    width,
    height,
    pos,
    rot,

    // Положение начала этого куска внутри общей сетки стены.
    // 0 = кусок начинается с самого начала полной стены.
    gridStart = 0,

    color = 0xe4e7e9,
    panelWidth = 5.0,
  ) {
    // ==========================================
    // ОСНОВНАЯ ГЛАДКАЯ СТЕНА
    // ==========================================

    const wallMat = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,

      roughness: 0.48,
      metalness: 0.06,

      dithering: true,
    });

    const mesh = this.sceneManager.createWallMesh(
      width,
      height,
      pos,
      rot,
      wallMat,
    );

    mesh.userData.skipWallMaterialUpdate = true;

    // ==========================================
    // ОБЩАЯ СЕТКА ПАНЕЛЕЙ
    // ==========================================

    const seamMaterial = new THREE.MeshStandardMaterial({
      color: 0x899196,

      roughness: 0.65,
      metalness: 0.12,

      side: THREE.DoubleSide,
    });

    const seamWidth = 0.045;

    // Этот кусок стены занимает диапазон
    // gridStart ... gridStart + width
    // внутри общей стены.
    const segmentStart = gridStart;
    const segmentEnd = gridStart + width;

    const epsilon = 0.0001;

    // Ищем первый настоящий шов сетки 5.0,
    // который попадает в этот кусок стены.
    let seamGridPos =
      Math.ceil((segmentStart - epsilon) / panelWidth) * panelWidth;

    while (seamGridPos <= segmentEnd + epsilon) {
      // Переводим координату общей сетки
      // в локальную координату текущего меша.
      const localX = seamGridPos - segmentStart - width / 2;

      const seam = new THREE.Mesh(
        new THREE.PlaneGeometry(seamWidth, height),
        seamMaterial,
      );
      seam.position.set(localX, 0, 0.006);

      seam.castShadow = false;
      seam.receiveShadow = false;

      seam.userData.skipWallMaterialUpdate = true;

      mesh.add(seam);

      seamGridPos += panelWidth;
    }

    this.registerMesh(mesh);

    return mesh;
  }

  addPanelWallWithElevatorOpening({
    wallWidth,
    wallHeight,
    wallZ,
    rotationY = 0,

    openingWidth = 7.5,
    openingHeight = 10.0,

    reverseGrid = false,
  }) {
    const sideW = (wallWidth - openingWidth) / 2;

    const leftX = -(openingWidth / 2) - sideW / 2;

    const rightX = openingWidth / 2 + sideW / 2;

    const topH = wallHeight - openingHeight;

    const topCenterY = this.floorY + openingHeight + topH / 2;

    const wallCenterY = this.floorY + wallHeight / 2;

    // При развороте стены на PI
    // сетка панелей идёт в обратную сторону.
    const leftGridStart = reverseGrid ? sideW + openingWidth : 0;

    const rightGridStart = reverseGrid ? 0 : sideW + openingWidth;

    // Левая часть стены
    this.addPanelWall(
      sideW,
      wallHeight,
      new THREE.Vector3(leftX, wallCenterY, wallZ),
      new THREE.Vector3(0, rotationY, 0),
      leftGridStart,
    );

    // Правая часть стены
    this.addPanelWall(
      sideW,
      wallHeight,
      new THREE.Vector3(rightX, wallCenterY, wallZ),
      new THREE.Vector3(0, rotationY, 0),
      rightGridStart,
    );

    // Перемычка над лифтом
    this.addPanelWall(
      openingWidth,
      topH,
      new THREE.Vector3(0, topCenterY, wallZ),
      new THREE.Vector3(0, rotationY, 0),
      sideW,
    );
  }

  addAlwaysTiledSurface(
    width,
    height,
    pos,
    rot,
    uvOffsetX = 0,
    uvOffsetY = 0,
    color = 0xffffff,
  ) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      map: tileTex,
      normalMap: tileNormalTex,
      roughnessMap: tileRoughTex,
      side: THREE.DoubleSide,
      roughness: 0.35,
      metalness: 0.0,
      dithering: true,
    });

    const mesh = this.sceneManager.createWallMesh(width, height, pos, rot, mat);
    mesh.userData.skipWallMaterialUpdate = true;

    this.registerMesh(mesh);

    if (uvOffsetX !== 0 || uvOffsetY !== 0) {
      const uvArray = mesh.geometry.attributes.uv.array;

      for (let i = 0; i < uvArray.length; i += 2) {
        uvArray[i] += uvOffsetX;
        uvArray[i + 1] += uvOffsetY;
      }

      mesh.geometry.attributes.uv.needsUpdate = true;
    }

    return mesh;
  }

  addPlainSurface(
    width,
    height,
    pos,
    rot,
    {
      color = 0xe4e7e9,
      roughness = 0.45,
      metalness = 0.08,
      emissive = 0x000000,
      emissiveIntensity = 0.0,
      side = THREE.DoubleSide,
    } = {},
  ) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      side,

      roughness,
      metalness,

      emissive,
      emissiveIntensity,

      dithering: true,
    });

    const mesh = this.sceneManager.createWallMesh(width, height, pos, rot, mat);

    mesh.userData.skipWallMaterialUpdate = true;

    this.registerMesh(mesh);

    return mesh;
  }

  createPhysicsWall(
    x,
    y,
    z,
    halfX,
    halfY,
    halfZ,
    customMaterial = this.matSlippery,
  ) {
    const wallBody = new CANNON.Body({
      mass: 0,
      material: customMaterial,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });

    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));
    wallBody.position.set(x, y, z);

    this.addBody(wallBody);
    return wallBody;
  }

  createPlasticBlockMaterial(
    baseTex,
    normalTex,
    roughTex,
    fallbackColor = 0xffffff,
  ) {
    const material = new THREE.MeshStandardMaterial({
      color: fallbackColor,
      map: baseTex || null,
      normalMap: normalTex || null,
      roughnessMap: roughTex || null,
      roughness: 0.75,
      metalness: 0.0,
      normalScale: new THREE.Vector2(1.6, 1.6),
    });

    material.needsUpdate = true;
    return material;
  }

  createPushableBlock({ name, size, position, mass, material }) {
    const halfX = size.x / 2;
    const halfY = size.y / 2;
    const halfZ = size.z / 2;

    const y = position.y ?? this.floorY + halfY;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      material,
    );

    mesh.name = name;
    mesh.position.set(position.x, y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.skipWallMaterialUpdate = true;

    this.registerMesh(mesh);

    // Основной блок — скользкий для шара.
    // Это нужно, чтобы шар не карабкался по боковой стенке.
    const body = new CANNON.Body({
      mass,
      material: this.matBox,
      position: new CANNON.Vec3(position.x, y, position.z),
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.SCENE |
        CONFIG.PHYSICS.GROUPS.OBJECTS |
        CONFIG.PHYSICS.GROUPS.TINY,
    });

    body.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));

    // Блоки теперь могут естественно поворачиваться,
    // если шар толкнул их не по центру, а в край.
    // Но разрешаем только поворот вокруг вертикальной оси Y,
    // чтобы они не заваливались набок и не ломали механику ступенек.
    body.fixedRotation = false;
    body.angularFactor = new CANNON.Vec3(0, 1, 0);
    body.updateMassProperties();

    body.linearDamping = 0.22;
    body.angularDamping = 0.35;
    body.sleepSpeedLimit = 0.03;
    body.sleepTimeLimit = 0.8;

    this.addBody(body);

    // Невидимая цепкая площадка сверху.
    // Она чуть меньше блока по X/Z, чтобы шар не цеплялся за её боковые края.
    const topThickness = 0.04;
    const topGap = 0.01;
    const topInset = 0.25;

    const topBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: this.matBoxTop,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });

    topBody.addShape(
      new CANNON.Box(
        new CANNON.Vec3(
          Math.max(0.1, halfX - topInset),
          topThickness / 2,
          Math.max(0.1, halfZ - topInset),
        ),
      ),
    );

    topBody.position.set(
      position.x,
      y + halfY + topGap + topThickness / 2,
      position.z,
    );

    this.addBody(topBody);

    if (!this.pushableObjects) {
      this.pushableObjects = [];
    }

    this.pushableObjects.push({
      mesh,
      body,
      topBody,
      halfY,
      topThickness,
      topGap,
      slideSound: true,
    });
    return { mesh, body, topBody };
  }

  buildRoom2PushableBlocks() {
    // Размер плитки берём из лифта:
    // 7.5 = 3 плитки, 10.0 = 4 плитки → 1 плитка = 2.5 единицы.
    const TILE = 2.5;

    const blockW = TILE * 2; // 5.0
    const blockD = TILE * 2; // 5.0

    const yellowMat = this.createPlasticBlockMaterial(
      null,
      plasticYellowNormalTex,
      plasticYellowRoughTex,
      0xf2c76b, // пастельный светло-жёлтый
    );

    const greenMat = this.createPlasticBlockMaterial(
      null,
      plasticGreenNormalTex,
      plasticGreenRoughTex,
      0x86c98a, // пастельный светло-зелёный
    );

    // Маленький блок: высота 1 плитка
    this.createPushableBlock({
      name: "Room2_PushableBlock_Yellow_1Tile",
      size: {
        x: blockW,
        y: TILE,
        z: blockD,
      },
      position: {
        x: -4.5,
        z: -10.0,
      },
      mass: 28,
      material: yellowMat,
    });

    // Большой блок: высота 2 плитки
    this.createPushableBlock({
      name: "Room2_PushableBlock_Green_2Tiles",
      size: {
        x: blockW,
        y: TILE * 2,
        z: blockD,
      },
      position: {
        x: 4.5,
        z: -16.0,
      },
      mass: 46,
      material: greenMat,
    });
  }

  syncPushableObjects() {
    if (!this.pushableObjects || this.pushableObjects.length === 0) {
      if (audioManager?.updateBoxSlide) audioManager.updateBoxSlide(0);
      return;
    }

    let maxSlideSpeed = 0;

    for (const obj of this.pushableObjects) {
      if (!obj || !obj.mesh || !obj.body) continue;

      obj.mesh.position.copy(obj.body.position);
      obj.mesh.quaternion.copy(obj.body.quaternion);

      // Цепкая верхняя площадка всегда едет вместе с блоком.
      if (obj.topBody) {
        obj.topBody.position.set(
          obj.body.position.x,
          obj.body.position.y + obj.halfY + obj.topGap + obj.topThickness / 2,
          obj.body.position.z,
        );

        obj.topBody.quaternion.copy(obj.body.quaternion);
        obj.topBody.velocity.copy(obj.body.velocity);
        obj.topBody.angularVelocity.set(0, 0, 0);
      }

      // Звук волочения только для больших блоков-ступенек.
      // Красный маленький кубик не должен сюда попадать.
      if (obj.slideSound && obj.body) {
        const slideSpeed = Math.hypot(obj.body.velocity.x, obj.body.velocity.z);

        maxSlideSpeed = Math.max(maxSlideSpeed, slideSpeed);
      }
    }

    if (audioManager?.updateBoxSlide) {
      const intensity = THREE.MathUtils.clamp(
        (maxSlideSpeed - 0.01) / 1.2,
        0,
        1,
      );

      audioManager.updateBoxSlide(intensity);
    }
  }

  // --- ЭТАПЫ СТРОИТЕЛЬСТВА ---

  buildRoom1VisualWalls() {
    const roomW = 30;
    const roomD = 30;
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    const elW = 7.5; // Лифт: ширина 3 плитки
    const elH = 10.0; // Лифт: высота 4 плитки

    // ==========================================
    // ПОЛ И ПОТОЛОК
    // ==========================================

    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.floorY, 30),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
    );

    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.ceilingY, 30),
      new THREE.Vector3(Math.PI / 2, 0, 0),
    );

    // ==========================================
    // ЛЕВАЯ, ПРАВАЯ И ЗАДНЯЯ СТЕНЫ
    // ==========================================

    // Левая стена
    this.addPanelWall(
      roomD,
      wallH,
      new THREE.Vector3(-15, wallCenterY, 30),
      new THREE.Vector3(0, Math.PI / 2, 0),
    );

    // Правая стена
    this.addPanelWall(
      roomD,
      wallH,
      new THREE.Vector3(15, wallCenterY, 30),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    );

    // Задняя стена
    this.addPanelWall(
      roomW,
      wallH,
      new THREE.Vector3(0, wallCenterY, 45),
      new THREE.Vector3(0, Math.PI, 0),
    );

    this.addPanelWallWithElevatorOpening({
      wallWidth: roomW,
      wallHeight: wallH,

      wallZ: 15,
      rotationY: 0,

      openingWidth: elW,
      openingHeight: elH,

      reverseGrid: false,
    });
    // === ФИНИШНЫЙ ЛИФТ СЕКТОРА 1 ===
    //
    // Используем тот же универсальный шаблон,
    // что и для всех остальных лифтов.
    this.room1ExitElevator = this.createRoomElevator({
      id: "room1_exit",
      name: "Room1ExitElevator",

      wall: "front",

      x: 0,
      z: 15,

      levelNumber: 1,
      elevatorRole: "exit",
    });

    // Временная обучающая площадка комнаты 1.
    // Позже её можно будет заменить настоящим заданием,
    // сохранив тот же вызов unlockExitElevator(1).
    this.buildRoom1UnlockPad();
  }

  buildRoom1UnlockPad() {
    const padRadius = 2.0;

    const material = new THREE.MeshStandardMaterial({
      color: 0x5fc9e8,
      emissive: 0x1687aa,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.82,
      roughness: 0.55,
      metalness: 0.05,
      depthWrite: false,
    });

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(padRadius, 48),
      material,
    );

    pad.name = "Room1_UnlockPad";

    // Дальний правый угол комнаты 1.
    // Комната занимает x: -15...15 и z: 15...45.
    pad.position.set(10.5, this.floorY + 0.025, 40.5);

    pad.rotation.x = -Math.PI / 2;
    pad.renderOrder = 2;

    pad.userData.radius = padRadius;
    pad.userData.activated = false;
    pad.userData.baseOpacity = 0.82;
    pad.userData.baseEmissiveIntensity = 0.85;
    pad.userData.skipWallMaterialUpdate = true;

    this.room1UnlockPad = pad;

    this.registerMesh(pad);
  }

  buildSecondRoom() {
    const roomW = 30;
    const roomD = 45; // Было 30. Удлиняем комнату примерно в 1.5 раза.
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    // Передняя граница комнаты остаётся у лифта на z = 7.5.
    // При глубине 45 центр комнаты уходит дальше: 7.5 - 22.5 = -15.
    const frontZ = 7.5;
    const centerZ = -15.0;
    const backZ = frontZ - roomD; // -37.5

    // SCI-FI ПОЛ ВТОРОЙ КОМНАТЫ
    this.addSciFiFloor({
      width: roomW,
      depth: roomD,
      centerZ,

      panelSize: 5.0,

      baseColor: 0xaeb5b9,
      panelColor: 0xd9dfe2,

      seamColor: 0x4e5961,
      glowColor: 0xcdf6ff,
    });
    // ПОТОЛОК второй комнаты
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.ceilingY, centerZ),
      new THREE.Vector3(Math.PI / 2, 0, 0),
    );

    // ЛЕВАЯ СТЕНА С ЯЧЕЙКОЙ ДЛЯ БЕЛОГО КУБИКА
    this.buildRoom2LeftWallWithSocketVisual(wallH);

    // ПРАВАЯ СТЕНА КОМНАТЫ №2
    this.addPanelWall(
      roomD,
      wallH,
      new THREE.Vector3(15, wallCenterY, centerZ),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    );

    // === ДАЛЬНЯЯ СТЕНА С ПРОЁМОМ ПОД НОВЫЙ ЛИФТ 2 → 3 ===//
    const exitElW = 7.5;
    const exitElH = 10.0;

    this.addPanelWallWithElevatorOpening({
      wallWidth: roomW,
      wallHeight: wallH,

      wallZ: backZ,
      rotationY: 0,

      openingWidth: exitElW,
      openingHeight: exitElH,

      reverseGrid: false,
    });

    // ПЕРЕДНЯЯ СТЕНА С ПРОЁМОМ ПОД СТАРТОВЫЙ ЛИФТ
    const elW = 7.5;
    const elH = 10.0;

    this.addPanelWallWithElevatorOpening({
      wallWidth: roomW,
      wallHeight: wallH,

      wallZ: frontZ,
      rotationY: Math.PI,

      openingWidth: elW,
      openingHeight: elH,

      reverseGrid: true,
    });

    // === СТАРТОВЫЙ ЛИФТ СЕКТОРА 2 ===
    //
    // После перехода игрок появляется внутри этой кабины,
    // а затем двери открываются в комнату.
    this.room2StartElevator = this.createRoomElevator({
      id: "room2_start",
      name: "Room2StartElevator",

      wall: "front_out",

      x: 0,
      z: frontZ,

      levelNumber: 2,
      elevatorRole: "start",
    });

    // Толкаемые блоки-ступеньки комнаты №2.
    this.buildRoom2PushableBlocks();

    // Финальная часть комнаты 2.
    // Полка-цель в правом углу комнаты.
    this.buildRoom2GoalShelfVisual();

    // === НОВЫЙ ВЫХОДНОЙ ЛИФТ КОМНАТЫ 2 → 3 ===
    // Стоит по центру дальней стены.
    // Кабина уходит наружу комнаты по -Z.
    this.room2ExitElevator = this.createRoomElevator({
      id: "room2_exit",
      name: "Room2ExitElevator",

      wall: "back",

      x: 0,
      z: backZ,

      levelNumber: 2,
      elevatorRole: "exit",
    });
  }

  getRoom2GoalShelfConfig() {
    const TILE = 2.5;

    return {
      TILE,

      // Размер верхней площадки полки: 2x2 плитки
      shelfW: TILE * 3, // по Z
      shelfD: TILE * 3, // по X (вылет в комнату)

      // Высота самой полки: 1 плитка
      shelfH: TILE * 0.7,

      // Белый кубик-цель на полке: 0.9x0.9x0.9 плитки
      markerSize: TILE * 0.9,

      // Верх полки на той же высоте, где был "пол" у ниши.
      topY: this.floorY + TILE * 3, // = 2.5 при floorY = -5

      // Если смотреть на стартовый лифт (передняя стена, z = 7.5),
      // полка должна быть в правом углу комнаты.
      // Значит она примыкает к правой стене x = 15
      // и к передней стене z = 7.5.
      rightWallX: 15.0,
      frontWallZ: 7.5,
    };
  }

  buildRoom2GoalShelfVisual() {
    const cfg = this.getRoom2GoalShelfConfig();

    const centerX = cfg.rightWallX - cfg.shelfD / 2;
    const centerY = cfg.topY - cfg.shelfH / 2;
    const centerZ = cfg.frontWallZ - cfg.shelfW / 2;

    // Верх полки — матовый тёмный пластик/резина.
    // На нём белый кубик будет хорошо виден, и не будет пересветов.
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x2f3438,
      roughness: 0.82,
      metalness: 0.05,
    });

    // Боковины — чуть более металлический графит.
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x3f464d,
      roughness: 0.62,
      metalness: 0.22,
    });

    // Низ делаем темнее, чтобы полка визуально не светилась снизу.
    const bottomMat = new THREE.MeshStandardMaterial({
      color: 0x202428,
      roughness: 0.9,
      metalness: 0.05,
    });

    // Порядок материалов для BoxGeometry:
    // +X, -X, +Y, -Y, +Z, -Z
    const shelfMaterials = [
      sideMat,
      sideMat,
      topMat,
      bottomMat,
      sideMat,
      sideMat,
    ];

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.shelfD, cfg.shelfH, cfg.shelfW),
      shelfMaterials,
    );

    shelf.name = "Room2GoalShelf";
    shelf.position.set(centerX, centerY, centerZ);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    shelf.userData.skipWallMaterialUpdate = true;

    this.registerMesh(shelf);

    // Тонкая светлая окантовка сверху, чтобы платформа читалась как цель.
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xbfc7cc,
      roughness: 0.45,
      metalness: 0.25,
    });

    const rimThickness = 0.08;
    const rimHeight = 0.08;
    const rimY = cfg.topY + 0.045;

    const createRim = (name, size, pos) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        rimMat,
      );

      mesh.name = name;
      mesh.position.copy(pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.skipWallMaterialUpdate = true;

      this.registerMesh(mesh);
      return mesh;
    };

    // Передняя планка
    createRim(
      "Room2GoalShelf_RimFront",
      new THREE.Vector3(cfg.shelfD, rimHeight, rimThickness),
      new THREE.Vector3(
        centerX,
        rimY,
        centerZ - cfg.shelfW / 2 + rimThickness / 2,
      ),
    );

    // Левая планка
    createRim(
      "Room2GoalShelf_RimLeft",
      new THREE.Vector3(rimThickness, rimHeight, cfg.shelfW),
      new THREE.Vector3(
        centerX - cfg.shelfD / 2 + rimThickness / 2,
        rimY,
        centerZ,
      ),
    );

    // Правая планка у стены
    createRim(
      "Room2GoalShelf_RimRight",
      new THREE.Vector3(rimThickness, rimHeight, cfg.shelfW),
      new THREE.Vector3(
        centerX + cfg.shelfD / 2 - rimThickness / 2,
        rimY,
        centerZ,
      ),
    );

    // Задняя планка у стены
    createRim(
      "Room2GoalShelf_RimBack",
      new THREE.Vector3(cfg.shelfD, rimHeight, rimThickness),
      new THREE.Vector3(
        centerX,
        rimY,
        centerZ + cfg.shelfW / 2 - rimThickness / 2,
      ),
    );
    // ==========================================
    // ДЕКОРАТИВНАЯ ОПОРА ПОЛКИ — 2 ШТАНГИ К ЗАДНЕЙ СТЕНЕ
    // ==========================================

    const supportGroup = new THREE.Group();
    supportGroup.name = "Room2GoalShelfSupport";

    // Светлый металл для штанг
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0xb7c0c8,

      roughness: 0.3,
      metalness: 0.88,

      dithering: true,
    });

    // Чуть темнее для креплений
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0x7f8991,

      roughness: 0.4,
      metalness: 0.76,

      dithering: true,
    });

    const shelfBottomY = cfg.topY - cfg.shelfH;

    const wallX = centerX + cfg.shelfD / 2;
    const wallZ = centerZ + cfg.shelfW / 2;

    const shelfMinX = centerX - cfg.shelfD / 2;
    const shelfMinZ = centerZ - cfg.shelfW / 2;

    // ------------------------------------------
    // ПАРАМЕТРЫ ШТАНГ
    // ------------------------------------------

    // Теперь штанги идут вдоль Z
    // и крепятся к задней стене (+Z).
    const rodRadius = 0.13;

    // Небольшой отступ от задней стены,
    // чтобы крепление не "врезалось" некрасиво.
    const rodWallInset = 0.22;

    // Насколько штанга доходит до открытого края полки.
    const rodFrontInset = 0.55;

    // Начало и конец вдоль Z
    const rodStartZ = shelfMinZ + rodFrontInset;
    const rodEndZ = wallZ - rodWallInset;

    const rodLength = rodEndZ - rodStartZ;
    const rodCenterZ = (rodStartZ + rodEndZ) / 2;

    // Штанги должны почти касаться низа полки.
    // Ставим их так, чтобы верх цилиндра был почти вплотную снизу.
    const rodY = shelfBottomY - rodRadius + 0.015;

    // Положение двух штанг по X
    const rodX1 = centerX - cfg.shelfD * 0.18;
    const rodX2 = centerX + cfg.shelfD * 0.18;

    // ------------------------------------------
    // ШТАНГА 1
    // ------------------------------------------
    const rod1 = new THREE.Mesh(
      new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 20),
      rodMat,
    );

    // Cylinder по умолчанию идёт по Y,
    // поворачиваем вдоль Z.
    rod1.rotation.x = Math.PI / 2;

    rod1.position.set(rodX1, rodY, rodCenterZ);

    rod1.userData.skipWallMaterialUpdate = true;
    supportGroup.add(rod1);

    // ------------------------------------------
    // ШТАНГА 2
    // ------------------------------------------
    const rod2 = new THREE.Mesh(
      new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength, 20),
      rodMat,
    );

    rod2.rotation.x = Math.PI / 2;

    rod2.position.set(rodX2, rodY, rodCenterZ);

    rod2.userData.skipWallMaterialUpdate = true;
    supportGroup.add(rod2);

    // ------------------------------------------
    // КРЕПЛЕНИЕ 1 НА ЗАДНЕЙ СТЕНЕ
    // ------------------------------------------
    const mount1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.22, 0.16),
      mountMat,
    );

    mount1.position.set(rodX1, rodY, wallZ - 0.08);

    mount1.userData.skipWallMaterialUpdate = true;
    supportGroup.add(mount1);

    // ------------------------------------------
    // КРЕПЛЕНИЕ 2 НА ЗАДНЕЙ СТЕНЕ
    // ------------------------------------------
    const mount2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.22, 0.16),
      mountMat,
    );

    mount2.position.set(rodX2, rodY, wallZ - 0.08);

    mount2.userData.skipWallMaterialUpdate = true;
    supportGroup.add(mount2);

    // ------------------------------------------
    // ВЕРХНИЕ КОНТАКТНЫЕ ПЛОЩАДКИ
    // Чтобы было видно, что штанги реально упираются в полку.
    // ------------------------------------------
    const contactPadY = shelfBottomY - 0.03;

    const contactPad1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.06, 0.5),
      mountMat,
    );

    contactPad1.position.set(rodX1, contactPadY, centerZ + cfg.shelfW * 0.12);

    contactPad1.userData.skipWallMaterialUpdate = true;
    supportGroup.add(contactPad1);

    const contactPad2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.06, 0.5),
      mountMat,
    );

    contactPad2.position.set(rodX2, contactPadY, centerZ + cfg.shelfW * 0.12);

    contactPad2.userData.skipWallMaterialUpdate = true;
    supportGroup.add(contactPad2);

  this.registerMesh(supportGroup);

// ==========================================
// КРАСНЫЙ КУБ — У ОТКРЫТОГО КРАЯ ПОЛКИ
// ==========================================

const cubeHalf =
  cfg.markerSize / 2;

// Небольшой безопасный отступ,
// чтобы куб не сваливался сам.
const cubeEdgeMargin = 0.22;

// Полка находится в правом переднем углу.
// Открытый угол для игрока — направление -X / -Z.
const cubeX =
  centerX -
  cfg.shelfD / 2 +
  cubeHalf +
  cubeEdgeMargin;

const cubeZ =
  centerZ -
  cfg.shelfW / 2 +
  cubeHalf +
  cubeEdgeMargin;

this.createRoom2GoalMarkerCube(
  cubeX,
  cubeZ,
  cfg.topY,
);
}

  createRedMetalCubeTexture() {
    const canvas = document.createElement("canvas");

    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext("2d");

    // ==========================================
    // БАЗОВЫЙ КРАСНЫЙ МЕТАЛЛ
    // ==========================================

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);

    gradient.addColorStop(0.0, "#A61F24");
    gradient.addColorStop(0.18, "#D53138");
    gradient.addColorStop(0.5, "#F04A50");
    gradient.addColorStop(0.82, "#D53138");
    gradient.addColorStop(1.0, "#95191E");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ==========================================
    // ШЛИФОВКА МЕТАЛЛА
    // ==========================================

    for (let y = 0; y < canvas.height; y += 2) {
      const alpha = 0.025 + Math.random() * 0.035;

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, y, canvas.width, 1);
    }

    for (let y = 1; y < canvas.height; y += 4) {
      const alpha = 0.015 + Math.random() * 0.018;

      ctx.fillStyle = `rgba(40,0,0,${alpha})`;
      ctx.fillRect(0, y, canvas.width, 1);
    }

    // Несколько очень слабых царапин
    for (let i = 0; i < 35; i++) {
      const y = Math.random() * canvas.height;
      const x = Math.random() * canvas.width;
      const length = 20 + Math.random() * 100;

      ctx.strokeStyle = "rgba(255,210,210,0.05)";
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(canvas.width, x + length), y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    texture.repeat.set(1.4, 1.4);

    texture.needsUpdate = true;

    return texture;
  }

  createRoom2GoalMarkerCube(centerX, centerZ, shelfTopY) {
    const cfg = this.getRoom2GoalShelfConfig();

    const size = cfg.markerSize;
    const half = size / 2;

    const redMetalTexture = this.createRedMetalCubeTexture();

    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,

      map: redMetalTexture,

      metalness: 0.72,
      roughness: 0.32,

      dithering: true,
    });

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      markerMat,
    );

    marker.name = "Room2GoalMarkerCube";

    // ==========================================
    // МЕТАЛЛИЧЕСКИЕ РЁБРА ПО КРАЯМ КУБА
    // ==========================================

    const edgeMat = new THREE.MeshStandardMaterial({
      // Светлый алюминий
      color: 0xc4c9cc,

      metalness: 0.88,
      roughness: 0.3,

      dithering: true,
    });

    const edgeThickness = 0.11;

    // Рёбра немного выступают наружу,
    // поэтому визуально куб выглядит более массивным.
    const edgeLength = size + edgeThickness * 0.35;

    const addEdge = (name, sx, sy, sz, x, y, z) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), edgeMat);

      edge.name = name;
      edge.position.set(x, y, z);

      edge.castShadow = true;
      edge.receiveShadow = true;
      edge.userData.skipWallMaterialUpdate = true;

      marker.add(edge);

      return edge;
    };

    const h = size / 2;

    // ==========================================
    // 4 РЕБРА ВДОЛЬ X
    // ==========================================

    for (const y of [-h, h]) {
      for (const z of [-h, h]) {
        addEdge(
          "GoalCube_Edge_X",
          edgeLength,
          edgeThickness,
          edgeThickness,
          0,
          y,
          z,
        );
      }
    }

    // ==========================================
    // 4 РЕБРА ВДОЛЬ Y
    // ==========================================

    for (const x of [-h, h]) {
      for (const z of [-h, h]) {
        addEdge(
          "GoalCube_Edge_Y",
          edgeThickness,
          edgeLength,
          edgeThickness,
          x,
          0,
          z,
        );
      }
    }

    // ==========================================
    // 4 РЕБРА ВДОЛЬ Z
    // ==========================================

    for (const x of [-h, h]) {
      for (const y of [-h, h]) {
        addEdge(
          "GoalCube_Edge_Z",
          edgeThickness,
          edgeThickness,
          edgeLength,
          x,
          y,
          0,
        );
      }
    }

    // Ставим кубик чуть выше физической верхней площадки полки,
    // чтобы он не пересекался с ней при старте.
    marker.position.set(centerX, shelfTopY + half + 0.08, centerZ);

    marker.castShadow = true;
    marker.receiveShadow = true;
    marker.userData.skipWallMaterialUpdate = true;

    this.registerMesh(marker);

    const body = new CANNON.Body({
      mass: 38,
      material: this.matBox,
      position: new CANNON.Vec3(
        marker.position.x,
        marker.position.y,
        marker.position.z,
      ),
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.SCENE |
        CONFIG.PHYSICS.GROUPS.OBJECTS |
        CONFIG.PHYSICS.GROUPS.TINY,
    });

    body.addShape(new CANNON.Box(new CANNON.Vec3(half, half, half)));

    body.linearDamping = 0.18;
    body.angularDamping = 0.48;
    body.sleepSpeedLimit = 0.03;
    body.sleepTimeLimit = 0.8;

    this.addBody(body);

    if (!this.pushableObjects) {
      this.pushableObjects = [];
    }

    this.pushableObjects.push({
      mesh: marker,
      body,
    });

    // Сохраняем ссылку на кубик.
    // Потом по нему будем проверять активацию гнезда.
    this.room2GoalMarkerMesh = marker;
    this.room2GoalMarkerBody = body;

    return { mesh: marker, body };
  }

  buildRoom2GoalShelfPhysics() {
    const cfg = this.getRoom2GoalShelfConfig();

    const centerX = cfg.rightWallX - cfg.shelfD / 2;
    const centerY = cfg.topY - cfg.shelfH / 2;
    const centerZ = cfg.frontWallZ - cfg.shelfW / 2;

    // === ОСНОВНОЙ КОРПУС ПОЛКИ ===
    // Боковины делаем как у параллелепипедов:
    // не "липкие", чтобы шар не цеплялся странно за грань.
    this.createPhysicsWall(
      centerX,
      centerY,
      centerZ,
      cfg.shelfD / 2,
      cfg.shelfH / 2,
      cfg.shelfW / 2,
      this.matBox,
    );

    // === ТОНКАЯ ЦЕПКАЯ ВЕРХНЯЯ ПЛОЩАДКА ===
    // Делаем её так же, как у жёлтого и зелёного блоков:
    // тонкий отдельный collider чуть выше поверхности полки.

    const topInset = 0.18;

    const topThickness = 0.04;
    const topGap = 0.01;

    this.createPhysicsWall(
      centerX,

      cfg.topY + topGap + topThickness / 2,

      centerZ,

      cfg.shelfD / 2 - topInset,
      topThickness / 2,
      cfg.shelfW / 2 - topInset,

      this.matBoxTop,
    );
  }

  isRoom2GoalCubeInSocket() {
    if (!this.room2GoalMarkerBody) return false;

    const cfg = this.getRoom2LeftWallSocketConfig();
    const p = this.room2GoalMarkerBody.position;

    // Кубик должен находиться внутри ячейки левой стены.
    // Делаем проверку чуть мягче, чтобы не требовать идеального центра.
    const insideX = p.x <= cfg.wallX - 0.15 && p.x >= cfg.socketBackX - 0.35;

    const insideZ =
      p.z >= cfg.socketZMin + 0.15 && p.z <= cfg.socketZMax - 0.15;

    const insideY = p.y >= this.floorY + 0.4 && p.y <= cfg.socketTopY + 0.35;

    return insideX && insideZ && insideY;
  }

  updateRoom2SocketPulse(dt) {
    if (this.currentRoomId !== 2) return;
    if (!this.room2SocketFloorMaterial) return;

    const minIntensity = 0.04;
    const maxIntensity = 0.42;

    // Интенсивность реального света.
    const minLightIntensity = 0.0;
    const maxLightIntensity = 0.75;

    // ==========================================
    // ЗАДАНИЕ УЖЕ ВЫПОЛНЕНО
    // ==========================================

    if (this.room2PuzzleSolved) {
      // Дно возвращаем в спокойное бордовое состояние.
      this.room2SocketFloorMaterial.emissiveIntensity = minIntensity;

      // Настоящее свечение полностью выключаем.
      if (this.room2SocketGlowLight) {
        this.room2SocketGlowLight.intensity = 0;
      }

      return;
    }

    // ==========================================
    // ЖДЁМ СТАРТОВЫЙ ЛИФТ
    // ==========================================

    const startElevator = this.getRoomElevator("room2_start");

    if (!startElevator) {
      this.room2SocketFloorMaterial.emissiveIntensity = minIntensity;

      if (this.room2SocketGlowLight) {
        this.room2SocketGlowLight.intensity = 0;
      }

      return;
    }

    // Сначала убеждаемся, что двери действительно открывались.
    if (startElevator.openState > 0.9) {
      this.room2SocketSawStartElevatorOpen = true;
    }

    // После открытия ждём полного закрытия.
    if (
      this.room2SocketSawStartElevatorOpen &&
      !this.room2SocketCountdownStarted &&
      startElevator.targetOpenState === 0.0 &&
      startElevator.openState < 0.03
    ) {
      this.room2SocketCountdownStarted = true;
      this.room2SocketPulseTime = 0;
    }

    // Пока лифт ещё не завершил цикл —
    // никакой подсказки.
    if (!this.room2SocketCountdownStarted) {
      this.room2SocketFloorMaterial.emissiveIntensity = minIntensity;

      if (this.room2SocketGlowLight) {
        this.room2SocketGlowLight.intensity = 0;
      }

      return;
    }

    // ==========================================
    // 10 СЕКУНД БЕЗ ПОДСКАЗКИ
    // ==========================================

    this.room2SocketPulseTime += dt;

    const pulseDelay = 10.0;

    if (this.room2SocketPulseTime < pulseDelay) {
      this.room2SocketFloorMaterial.emissiveIntensity = minIntensity;

      if (this.room2SocketGlowLight) {
        this.room2SocketGlowLight.intensity = 0;
      }

      return;
    }

    // ==========================================
    // ПУЛЬСАЦИЯ
    // ==========================================

    const pulseTime = this.room2SocketPulseTime - pulseDelay;

    const pulse =
      0.5 + 0.5 * Math.sin(pulseTime * ((Math.PI * 2) / 2.8) - Math.PI / 2);

    // Пульсирует сама поверхность.
    this.room2SocketFloorMaterial.emissiveIntensity = THREE.MathUtils.lerp(
      minIntensity,
      maxIntensity,
      pulse,
    );

    // И одновременно реальный красный свет.
    if (this.room2SocketGlowLight) {
      this.room2SocketGlowLight.intensity = THREE.MathUtils.lerp(
        minLightIntensity,
        maxLightIntensity,
        pulse,
      );
    }
  }

  updateRoom2Puzzle() {
    if (this.currentRoomId !== 2) {
      return;
    }

    // Callback должен сработать только один раз
    // за текущее прохождение комнаты.
    if (this.room2PuzzleSolved) {
      return;
    }

    if (!this.isRoom2GoalCubeInSocket()) {
      return;
    }

    this.room2PuzzleSolved = true;

    // Активируем дисплей
    // финишного лифта.
    this.activateExitElevator(2);

    if (typeof this.onRoom2PuzzleSolved === "function") {
      this.onRoom2PuzzleSolved();
    } else {
      console.warn(
        "[ROOM 2] Puzzle solved, but onRoom2PuzzleSolved callback is missing.",
      );
    }

    console.log("[ROOM 2] Cube socket activated. Exit elevator unlocked.");
  }

  getRoom2LeftWallSocketConfig() {
    const TILE = 2.5;

    // Левая несущая стена комнаты №2.
    const wallX = -15.0;

    // Физическая стена чуть снаружи комнаты:
    // раньше она была x = -16, halfX = 1.
    const wallBodyX = -16.0;
    const wallHalfX = 1.0;

    const roomFrontZ = 7.5;
    const roomBackZ = -37.5;

    // Отверстие ставим в левой несущей стене, рядом с проходом у перегородки.
    const socketFrameThickness = 0.05;

    // Сдвигаем всю ячейку чуть вправо по стене,
    // чтобы левый край рамки лёг по шву панели.
    const socketShiftRight = socketFrameThickness;

    const socketZ = -13.75 - socketShiftRight;

    // Размер отверстия: 1x1 плитка.
    const socketSize = TILE;

    // Глубина ячейки в стену.
    const socketDepth = TILE;

    const socketZMin = socketZ - socketSize / 2;
    const socketZMax = socketZ + socketSize / 2;

    const socketBottomY = this.floorY;
    const socketTopY = this.floorY + socketSize;
    const socketCenterY = this.floorY + socketSize / 2;

    // Ячейка уходит наружу за левую стену, в минус по X.
    const socketCenterX = wallX - socketDepth / 2;
    const socketBackX = wallX - socketDepth;

    return {
      TILE,

      wallX,
      wallBodyX,
      wallHalfX,

      roomFrontZ,
      roomBackZ,

      socketZ,
      socketSize,
      socketDepth,

      socketFrameThickness,
      socketShiftRight,

      socketZMin,
      socketZMax,

      socketBottomY,
      socketTopY,
      socketCenterY,

      socketCenterX,
      socketBackX,
    };
  }

  buildRoom2LeftWallWithSocketVisual(wallH) {
    const cfg = this.getRoom2LeftWallSocketConfig();
    const wallCenterY = this.floorY + wallH / 2;
    // ==========================================
    // ОБЩАЯ СЕТКА ПАНЕЛЕЙ ДЛЯ ЛЕВОЙ СТЕНЫ
    // ==========================================
    //
    // Важно:
    // эта стена повёрнута на Math.PI / 2,
    // поэтому для неё удобнее считать сетку
    // от ПЕРЕДНЕГО края стены (roomFrontZ),
    // а не от дальнего.
    //
    // Тогда все 3 куска стены будут ссылаться
    // на одну и ту же 45-единичную сетку.
    const frontGridOriginZ = cfg.roomFrontZ;

    // === ЛЕВАЯ СТЕНА ВОКРУГ ОТВЕРСТИЯ ===

    // Участок стены от дальней стены до отверстия
    const backLen = cfg.socketZMin - cfg.roomBackZ;
    const backCenterZ = cfg.roomBackZ + backLen / 2;

    if (backLen > 0.01) {
      const backGridStart = frontGridOriginZ - cfg.socketZMin;

      this.addPanelWall(
        backLen,
        wallH,
        new THREE.Vector3(cfg.wallX, wallCenterY, backCenterZ),
        new THREE.Vector3(0, Math.PI / 2, 0),

        backGridStart,
      );
    }
    // Участок стены от отверстия до передней стены
    const frontLen = cfg.roomFrontZ - cfg.socketZMax;
    const frontCenterZ = cfg.socketZMax + frontLen / 2;

    if (frontLen > 0.01) {
      const frontGridStart = 0;

      this.addPanelWall(
        frontLen,
        wallH,
        new THREE.Vector3(cfg.wallX, wallCenterY, frontCenterZ),
        new THREE.Vector3(0, Math.PI / 2, 0),

        frontGridStart,
      );
    }

    // Часть стены над отверстием
    const topH = this.ceilingY - cfg.socketTopY;
    const topCenterY = cfg.socketTopY + topH / 2;

    if (topH > 0.01) {
      const topGridStart = frontGridOriginZ - cfg.socketZMax;

      this.addPanelWall(
        cfg.socketSize,
        topH,
        new THREE.Vector3(cfg.wallX, topCenterY, cfg.socketZ),
        new THREE.Vector3(0, Math.PI / 2, 0),

        topGridStart,
      );
    }
    // === ВНУТРЕННОСТИ ЯЧЕЙКИ ===

    // Общий стиль для внутренних стенок ячейки.
    // Светлый гладкий тех-материал без плитки.
    const socketInnerWallStyle = {
      color: 0xdfe4e7,
      roughness: 0.42,
      metalness: 0.08,
    };

    const socketInnerCeilingStyle = {
      color: 0xcfd6db,
      roughness: 0.48,
      metalness: 0.1,
    };

    const socketFloorStyle = {
      // Глубокий бордовый основной цвет.
      color: 0x68151a,

      roughness: 0.58,
      metalness: 0.02,

      // Тоже тёмно-красное свечение,
      // чтобы даже максимум не уходил в ярко-алый.
      emissive: 0xa81218,
      emissiveIntensity: 0.04,
    };
    // Задняя стенка ячейки
    this.addPlainSurface(
      cfg.socketSize,
      cfg.socketSize,
      new THREE.Vector3(cfg.socketBackX - 0.03, cfg.socketCenterY, cfg.socketZ),
      new THREE.Vector3(0, Math.PI / 2, 0),
      socketInnerWallStyle,
    );

    // Дальняя внутренняя боковина ячейки
    this.addPlainSurface(
      cfg.socketDepth,
      cfg.socketSize,
      new THREE.Vector3(cfg.socketCenterX, cfg.socketCenterY, cfg.socketZMin),
      new THREE.Vector3(0, 0, 0),
      socketInnerWallStyle,
    );

    // Ближняя внутренняя боковина ячейки
    this.addPlainSurface(
      cfg.socketDepth,
      cfg.socketSize,
      new THREE.Vector3(cfg.socketCenterX, cfg.socketCenterY, cfg.socketZMax),
      new THREE.Vector3(0, Math.PI, 0),
      socketInnerWallStyle,
    );

    // Потолок ячейки
    this.addPlainSurface(
      cfg.socketDepth,
      cfg.socketSize,
      new THREE.Vector3(cfg.socketCenterX, cfg.socketTopY, cfg.socketZ),
      new THREE.Vector3(Math.PI / 2, 0, Math.PI / 2),
      socketInnerCeilingStyle,
    );

    // Красный квадрат на дне ячейки
    const socketFloor = this.addPlainSurface(
      cfg.socketDepth,
      cfg.socketSize,
      new THREE.Vector3(cfg.socketCenterX, this.floorY + 0.01, cfg.socketZ),
      new THREE.Vector3(-Math.PI / 2, 0, Math.PI / 2),
      socketFloorStyle,
    );

    // Сохраняем материал, чтобы затем мягко пульсировать emissiveIntensity.
    this.room2SocketFloorMaterial = socketFloor.material;
    this.room2SocketPulseTime = 0;

    // ==========================================
    // МЯГКОЕ КРАСНОЕ СВЕЧЕНИЕ НАД ЯЧЕЙКОЙ
    // ==========================================

    const socketGlowLight = new THREE.PointLight(
      0xff2630, // красный оттенок
      0.0, // интенсивность управляется пульсацией
      3.2, // радиус действия
      2.0, // затухание
    );

    socketGlowLight.name = "Room2SocketGlowLight";

    // Ставим источник немного выше красного дна,
    // внутри самой ячейки.
    socketGlowLight.position.set(
      cfg.socketCenterX,
      this.floorY + 0.35,
      cfg.socketZ,
    );

    socketGlowLight.castShadow = false;

    this.room2SocketGlowLight = socketGlowLight;

    // Добавляем в группу текущей комнаты,
    // чтобы свет автоматически удалялся при смене сектора.
    this.registerMesh(socketGlowLight);

    this.room2SocketSawStartElevatorOpen = false;
    this.room2SocketCountdownStarted = false;
    // ==========================================
    // П-ОБРАЗНАЯ СЕРАЯ РАМКА У ВХОДА В ЯЧЕЙКУ
    // ==========================================

    const socketFrameStyle = {
      color: 0x899196,
      roughness: 0.46,
      metalness: 0.12,
    };

    const frameThickness = cfg.socketFrameThickness ?? 0.14;

    // Чуть выдвигаем рамку в сторону комнаты,
    // чтобы она лежала поверх стены.
    const frameFrontX = cfg.wallX + 0.012;

    // Высота боковых стоек:
    // от пола ячейки до верхнего внешнего края рамки.
    const sideFrameHeight = cfg.socketSize + frameThickness;
    const sideFrameCenterY = this.floorY + sideFrameHeight / 2;

    // Левая вертикальная стойка
    this.addPlainSurface(
      frameThickness,
      sideFrameHeight,
      new THREE.Vector3(
        frameFrontX,
        sideFrameCenterY,
        cfg.socketZMin - frameThickness / 2,
      ),
      new THREE.Vector3(0, Math.PI / 2, 0),
      socketFrameStyle,
    );

    // Правая вертикальная стойка
    this.addPlainSurface(
      frameThickness,
      sideFrameHeight,
      new THREE.Vector3(
        frameFrontX,
        sideFrameCenterY,
        cfg.socketZMax + frameThickness / 2,
      ),
      new THREE.Vector3(0, Math.PI / 2, 0),
      socketFrameStyle,
    );

    // Верхняя перекладина
    this.addPlainSurface(
      cfg.socketSize + frameThickness * 2,
      frameThickness,
      new THREE.Vector3(
        frameFrontX,
        cfg.socketTopY + frameThickness / 2,
        cfg.socketZ,
      ),
      new THREE.Vector3(0, Math.PI / 2, 0),
      socketFrameStyle,
    );
  }

  buildRoom2LeftWallWithSocketPhysics(wallH, wallCenterY) {
    const cfg = this.getRoom2LeftWallSocketConfig();

    // Участок стены от дальней стены до отверстия
    const backLen = cfg.socketZMin - cfg.roomBackZ;
    const backCenterZ = cfg.roomBackZ + backLen / 2;

    if (backLen > 0.01) {
      this.createPhysicsWall(
        cfg.wallBodyX,
        wallCenterY,
        backCenterZ,
        cfg.wallHalfX,
        wallH / 2,
        backLen / 2,
        this.matStandard,
      );
    }

    // Участок стены от отверстия до передней стены
    const frontLen = cfg.roomFrontZ - cfg.socketZMax;
    const frontCenterZ = cfg.socketZMax + frontLen / 2;

    if (frontLen > 0.01) {
      this.createPhysicsWall(
        cfg.wallBodyX,
        wallCenterY,
        frontCenterZ,
        cfg.wallHalfX,
        wallH / 2,
        frontLen / 2,
        this.matStandard,
      );
    }

    // Верхняя часть стены над отверстием
    const topH = this.ceilingY - cfg.socketTopY;
    const topCenterY = cfg.socketTopY + topH / 2;

    if (topH > 0.01) {
      this.createPhysicsWall(
        cfg.wallBodyX,
        topCenterY,
        cfg.socketZ,
        cfg.wallHalfX,
        topH / 2,
        cfg.socketSize / 2,
        this.matStandard,
      );
    }

    // Задний ограничитель ячейки.
    // Кубик заедет внутрь, но не пролетит наружу за стену.
    this.createPhysicsWall(
      cfg.socketBackX - 0.05,
      cfg.socketCenterY,
      cfg.socketZ,
      0.05,
      cfg.socketSize / 2,
      cfg.socketSize / 2,
      this.matStandard,
    );

    // Дальняя внутренняя стенка ячейки
    this.createPhysicsWall(
      cfg.socketCenterX,
      cfg.socketCenterY,
      cfg.socketZMin - 0.05,
      cfg.socketDepth / 2,
      cfg.socketSize / 2,
      0.05,
      this.matStandard,
    );

    // Ближняя внутренняя стенка ячейки
    this.createPhysicsWall(
      cfg.socketCenterX,
      cfg.socketCenterY,
      cfg.socketZMax + 0.05,
      cfg.socketDepth / 2,
      cfg.socketSize / 2,
      0.05,
      this.matStandard,
    );

    // Потолок ячейки
    this.createPhysicsWall(
      cfg.socketCenterX,
      cfg.socketTopY + 0.05,
      cfg.socketZ,
      cfg.socketDepth / 2,
      0.05,
      cfg.socketSize / 2,
      this.matStandard,
    );

    // Физический пол ячейки.
    // Без него белый кубик проваливается сквозь визуальный белый квадрат.
    this.createPhysicsWall(
      cfg.socketCenterX,
      this.floorY + 0.04,
      cfg.socketZ,
      cfg.socketDepth / 2,
      0.04,
      cfg.socketSize / 2,
      this.matStandard,
    );
  }

  getElevatorStyle() {
    // Единый стиль для всех лифтов.
    // Базовые размеры единого шаблона лифта.
    return {
      doorW: 3.8,
      doorH: 10.0,
      doorD: 0.4,

      // Старая простая рама.
      frameOuterW: 8.1,
      frameSideW: 0.6,
      frameThinH: 0.1,

      closedOffset: 1.9,

      // Створки уходят немного дальше за боковые стойки рамы,
      // чтобы их светлые внутренние края не выглядывали в проём.
      openOffset: 5.25,

      // Размеры кабины.
      cabinDepth: 5.0,
      cabinW: 7.5,
      cabinH: 10.0,

      // Материалы лифта.
      doorColor: 0xd6dbe0,
      seamColor: 0x3e4449,
      frameColor: 0x333333,

      cabinWallColor: 0xd9dde0,
      cabinFloorColor: 0x4b5256,

      // Потолок.
      cabinCeilingColor: 0xd4d9dd,

      // Металлические декоративные элементы.
      cabinTrimColor: 0xa2aab0,

      // Светлая внутренняя потолочная/стеновая кассета.
      cabinPanelColor: 0xe3e7ea,
    };
  }

  createElevatorWallGradientTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext("2d");

    // ==========================================
    // БАЗОВЫЙ ГРАДИЕНТ
    // ==========================================
    //
    // Делаем мягкий металлический переход:
    // светлее по центру, темнее по краям.
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);

    // Делаем стены заметно светлее — ближе к цвету плинтусов.
    grad.addColorStop(0.0, "#C9D1D6");
    grad.addColorStop(0.22, "#D9E0E4");
    grad.addColorStop(0.5, "#EEF2F4");
    grad.addColorStop(0.78, "#D9E0E4");
    grad.addColorStop(1.0, "#C9D1D6");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ==========================================
    // ЭФФЕКТ ШЛИФОВАННОГО МЕТАЛЛА
    // ==========================================
    //
    // Очень лёгкие горизонтальные штрихи.
    // Не делаем их слишком контрастными.
    for (let y = 0; y < canvas.height; y += 2) {
      const alpha = 0.016 + Math.random() * 0.02;
      const shift = Math.floor(Math.random() * 18) - 9;

      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(0, y, canvas.width + shift, 1);
    }

    for (let y = 1; y < canvas.height; y += 4) {
      const alpha = 0.008 + Math.random() * 0.012;

      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, y, canvas.width, 1);
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    // Повторяем по высоте, чтобы шлифовка выглядела плотнее.
    texture.repeat.set(1, 2);

    texture.needsUpdate = true;

    return texture;
  }

  createElevatorDoorCircuitPngTextures() {
    const loader = new THREE.TextureLoader();

    const setupTexture = (texture, mirrorX = false) => {
      texture.colorSpace = THREE.SRGBColorSpace;

      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      // Показываем ВЕСЬ PNG на створке.
      texture.repeat.set(mirrorX ? -1 : 1, 1);
      texture.offset.set(mirrorX ? 1 : 0, 0);

      texture.anisotropy = 4;
      texture.needsUpdate = true;

      return texture;
    };

    const left = setupTexture(loader.load("Image/elevator-circuit.png"), false);
    const right = setupTexture(loader.load("Image/elevator-circuit.png"), true);

    return { left, right };
  }

  createElevatorDoorCircuitTextures(flipX = false) {
    const size = 1024;

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = size;
    baseCanvas.height = size;
    const baseCtx = baseCanvas.getContext("2d");

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = size;
    glowCanvas.height = size;
    const glowCtx = glowCanvas.getContext("2d");

    const mapX = (x) => (flipX ? size - x : x);

    const drawRoundedTrack = (
      ctx,
      points,
      width,
      color,
      alpha = 1,
      radius = 28,
      shadowBlur = 0,
      shadowColor = color,
    ) => {
      if (!points || points.length < 2) return;

      const pts = points.map(([x, y]) => [mapX(x), y]);

      ctx.save();
      ctx.beginPath();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;

      if (shadowBlur > 0) {
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
      }

      ctx.moveTo(pts[0][0], pts[0][1]);

      if (pts.length === 2) {
        ctx.lineTo(pts[1][0], pts[1][1]);
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const [cx, cy] = pts[i];
          const [nx, ny] = pts[i + 1];
          ctx.arcTo(cx, cy, nx, ny, radius);
        }

        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
      }

      ctx.stroke();
      ctx.restore();
    };

    const drawNode = (
      ctx,
      x,
      y,
      radius,
      strokeColor,
      fillColor = "transparent",
      alpha = 1,
      shadowBlur = 0,
      shadowColor = strokeColor,
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;

      if (shadowBlur > 0) {
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
      }

      ctx.arc(mapX(x), y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    // ==========================================
    // БАЗА ДВЕРИ: СВЕТЛЫЙ МЕТАЛЛ
    // ==========================================
    const grad = baseCtx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0.0, "#A5ADB4");
    grad.addColorStop(0.18, "#BCC4CA");
    grad.addColorStop(0.5, "#D9E0E4");
    grad.addColorStop(0.82, "#BCC4CA");
    grad.addColorStop(1.0, "#A5ADB4");

    baseCtx.fillStyle = grad;
    baseCtx.fillRect(0, 0, size, size);

    // Лёгкая шлифовка металла
    for (let y = 0; y < size; y += 2) {
      const alpha = 0.012 + Math.random() * 0.014;
      baseCtx.fillStyle = `rgba(255,255,255,${alpha})`;
      baseCtx.fillRect(0, y, size, 1);
    }

    for (let y = 1; y < size; y += 4) {
      const alpha = 0.006 + Math.random() * 0.01;
      baseCtx.fillStyle = `rgba(0,0,0,${alpha})`;
      baseCtx.fillRect(0, y, size, 1);
    }

    // ==========================================
    // ОСНОВНОЙ УЗОР "ПЛАТА" НА ВСЮ ПЛОЩАДЬ СТВОРКИ
    // ==========================================
    const mainTracks = [
      // Верхняя внешняя Г-образная дорожка
      [
        [90, 120],
        [250, 120],
        [250, 210],
      ],

      // Верхняя внутренняя вертикаль
      [
        [370, 150],
        [370, 260],
      ],

      // Средняя ломаная дорожка
      [
        [150, 290],
        [150, 390],
        [250, 390],
        [250, 470],
      ],

      // Нижняя крупная дорожка
      [
        [160, 560],
        [160, 660],
        [250, 660],
        [250, 760],
        [340, 760],
      ],

      // Нижняя короткая горизонталь
      [
        [330, 720],
        [430, 720],
      ],
    ];

    const secondaryTracks = [
      // Тонкие верхние ответвления
      [
        [430, 180],
        [430, 250],
      ],
      [
        [520, 160],
        [520, 230],
      ],

      // Малые ответвления у середины
      [
        [300, 360],
        [360, 360],
      ],
      [
        [300, 440],
        [360, 440],
      ],

      // Нижние тонкие ответвления
      [
        [300, 620],
        [360, 620],
      ],
      [
        [300, 700],
        [360, 700],
      ],

      // Еле заметные дополнительные линии
      [
        [110, 430],
        [110, 500],
      ],
      [
        [120, 780],
        [220, 780],
      ],
    ];

    // ==========================================
    // РИСУЕМ ОСНОВНЫЕ ДОРОЖКИ
    // ==========================================
    for (const points of mainTracks) {
      // Тонкая серая подложка
      drawRoundedTrack(baseCtx, points, 4, "#A8B0B7", 0.14, 16);

      // Основная светящаяся линия — уже намного тоньше
      drawRoundedTrack(
        glowCtx,
        points,
        1.8,
        "rgba(190,245,255,0.95)",
        1,
        16,
        2,
        "rgba(150,225,255,0.28)",
      );
    }

    for (const points of secondaryTracks) {
      drawRoundedTrack(baseCtx, points, 2.5, "#A8B0B7", 0.1, 12);

      drawRoundedTrack(
        glowCtx,
        points,
        1.1,
        "rgba(190,245,255,0.85)",
        1,
        12,
        1,
        "rgba(150,225,255,0.18)",
      );
    }

    // ==========================================
    // КОНТАКТНЫЕ ТОЧКИ / УЗЛЫ
    // ==========================================
    const nodeMap = new Map();

    const addNode = (x, y, r) => {
      const key = `${x}_${y}`;
      const old = nodeMap.get(key);
      if (!old || r > old) {
        nodeMap.set(key, r);
      }
    };

    for (const track of mainTracks) {
      for (let i = 0; i < track.length; i++) {
        const [x, y] = track[i];
        addNode(x, y, i === 0 || i === track.length - 1 ? 10 : 8);
      }
    }

    for (const track of secondaryTracks) {
      for (let i = 0; i < track.length; i++) {
        const [x, y] = track[i];
        addNode(x, y, i === 0 || i === track.length - 1 ? 7 : 6);
      }
    }

    for (const [key, r] of nodeMap.entries()) {
      const [x, y] = key.split("_").map(Number);

      drawNode(baseCtx, x, y, r, "#66717A", "rgba(220,228,233,0.18)", 1);

      drawNode(
        glowCtx,
        x,
        y,
        r,
        "rgba(255,255,255,0.92)",
        "rgba(180,240,255,0.34)",
        1,
        8,
        "rgba(120,220,255,0.95)",
      );
    }

    const baseTexture = new THREE.CanvasTexture(baseCanvas);
    baseTexture.wrapS = THREE.ClampToEdgeWrapping;
    baseTexture.wrapT = THREE.ClampToEdgeWrapping;
    baseTexture.needsUpdate = true;

    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.wrapS = THREE.ClampToEdgeWrapping;
    glowTexture.wrapT = THREE.ClampToEdgeWrapping;
    glowTexture.needsUpdate = true;

    return {
      baseTexture,
      glowTexture,
    };
  }

  createElevatorMaterials(style = this.getElevatorStyle()) {
    const wallGradientTexture = this.createElevatorWallGradientTexture();
    const circuitTextures = this.createElevatorDoorCircuitPngTextures();

    const backWallGradientTexture = wallGradientTexture.clone();
    backWallGradientTexture.needsUpdate = true;

    return {
      doorMatLeft: new THREE.MeshStandardMaterial({
        color: style.doorColor,
        roughness: 0.52,
        metalness: 0.28,
      }),

      doorMatRight: new THREE.MeshStandardMaterial({
        color: style.doorColor,
        roughness: 0.52,
        metalness: 0.28,
      }),

      doorCircuitMatLeft: new THREE.MeshStandardMaterial({
        map: circuitTextures.left,
        alphaMap: circuitTextures.left,
        emissiveMap: circuitTextures.left,
        color: 0xbfefff,
        emissive: new THREE.Color(0x79dcff),
        emissiveIntensity: 0.22,
        transparent: true,
        depthWrite: false,
        roughness: 0.2,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),

      doorCircuitMatRight: new THREE.MeshStandardMaterial({
        map: circuitTextures.right,
        alphaMap: circuitTextures.right,
        emissiveMap: circuitTextures.right,
        color: 0xbfefff,
        emissive: new THREE.Color(0x79dcff),
        emissiveIntensity: 0.22,
        transparent: true,
        depthWrite: false,
        roughness: 0.2,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),

      doorAccentMat: new THREE.MeshStandardMaterial({
        color: style.cabinTrimColor,
        roughness: 0.48,
        metalness: 0.58,
      }),

      seamMat: new THREE.MeshStandardMaterial({
        color: style.seamColor,
        roughness: 0.8,
        metalness: 0.15,
      }),

      frameMat: new THREE.MeshStandardMaterial({
        color: style.frameColor,

        // Раму пока делаем более матовой.
        // Высокая металличность давала яркие блики на узких боковых гранях,
        // которые при движении камеры выглядели как дрожащие светлые полосы.
        roughness: 0.85,
        metalness: 0.08,
      }),

      outerFrameMat: new THREE.MeshStandardMaterial({
        color: 0xb8bfc5,
        roughness: 0.56,
        metalness: 0.22,
      }),

      cabinSideWallMat: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wallGradientTexture,
        roughness: 0.34,
        metalness: 0.62,
      }),

      cabinBackWallMat: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wallGradientTexture.clone(),
        roughness: 0.34,
        metalness: 0.62,
      }),

      cabinFloorMat: new THREE.MeshStandardMaterial({
        color: style.cabinFloorColor,
        roughness: 0.72,
        metalness: 0.22,
      }),

      cabinCeilingMat: new THREE.MeshStandardMaterial({
        color: style.cabinCeilingColor,
        roughness: 0.48,
        metalness: 0.16,
      }),

      cabinTrimMat: new THREE.MeshStandardMaterial({
        color: style.cabinTrimColor,
        roughness: 0.22,
        metalness: 0.88,
      }),

      cabinPanelMat: new THREE.MeshStandardMaterial({
        color: style.cabinPanelColor,
        roughness: 0.46,
        metalness: 0.1,
      }),

      cabinSkirtingMat: new THREE.MeshStandardMaterial({
        // Чуть темнее стен, чтобы плинтус не светился
        // и смотрелся как спокойная нижняя окантовка.
        color: 0xaeb6bc,
        roughness: 0.58,
        metalness: 0.04,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    };
  }

  getElevatorBasis(wall) {
    // normal — направление, куда уходит кабина от комнаты.
    // slide — направление, вдоль которого разъезжаются створки.
    // axis — имя оси для Cannon/Three position: "x" или "z".
    //
    // right:
    //   стена x = +15
    //   кабина уходит по +X
    //   створки ездят по Z
    //
    // left:
    //   стена x = -15
    //   кабина уходит по -X
    //   створки ездят по Z
    //
    // front:
    //   стена смотрит к комнате со стороны +Z
    //   кабина уходит по -Z
    //   створки ездят по X
    //
    // back:
    //   дальняя стена
    //   кабина уходит наружу комнаты по -Z
    //   створки ездят по X

    if (wall === "right") {
      return {
        wall,
        normal: new THREE.Vector3(1, 0, 0),
        slide: new THREE.Vector3(0, 0, 1),
        slideAxis: "z",
        depthAxis: "x",
        isSideWall: true,
      };
    }

    if (wall === "left") {
      return {
        wall,
        normal: new THREE.Vector3(-1, 0, 0),
        slide: new THREE.Vector3(0, 0, 1),
        slideAxis: "z",
        depthAxis: "x",
        isSideWall: true,
      };
    }

    if (wall === "front") {
      return {
        wall,
        normal: new THREE.Vector3(0, 0, -1),
        slide: new THREE.Vector3(1, 0, 0),
        slideAxis: "x",
        depthAxis: "z",
        isSideWall: false,
      };
    }

    if (wall === "front_out") {
      return {
        wall,

        // Кабина находится с внешней стороны стартовой стены
        // и уходит от комнаты по +Z.
        normal: new THREE.Vector3(0, 0, 1),

        // Створки по-прежнему разъезжаются по X.
        slide: new THREE.Vector3(1, 0, 0),

        slideAxis: "x",
        depthAxis: "z",
        isSideWall: false,
      };
    }

    if (wall === "back") {
      return {
        wall,
        normal: new THREE.Vector3(0, 0, -1),
        slide: new THREE.Vector3(1, 0, 0),
        slideAxis: "x",
        depthAxis: "z",
        isSideWall: false,
      };
    }

    console.warn(`[ELEVATOR] Unknown wall "${wall}", fallback to "front".`);

    return {
      wall: "front",
      normal: new THREE.Vector3(0, 0, -1),
      slide: new THREE.Vector3(1, 0, 0),
      slideAxis: "x",
      depthAxis: "z",
      isSideWall: false,
    };
  }

  createElevatorLevelDisplayTexture(levelNumber = 1, label = "SECTOR") {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 320;

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const roundRect = (x, y, width, height, radius) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height,
      );
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };

    ctx.clearRect(0, 0, w, h);

    // ==========================================
    // ТЁМНО-СЕРЫЙ ЭКРАН
    // ==========================================

    roundRect(12, 12, w - 24, h - 24, 26);
    ctx.save();
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0.0, "#5E6A70");
    bg.addColorStop(0.18, "#47535A");
    bg.addColorStop(0.55, "#303A40");
    bg.addColorStop(1.0, "#20282D");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Мягкое голубоватое свечение из центра
    const centerGlow = ctx.createRadialGradient(
      w / 2,
      h / 2,
      0,
      w / 2,
      h / 2,
      w * 0.42,
    );
    centerGlow.addColorStop(0, "rgba(150, 235, 255, 0.18)");
    centerGlow.addColorStop(1, "rgba(150, 235, 255, 0.0)");

    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, w, h);

    // Верхний блик стекла
    const reflection = ctx.createLinearGradient(0, 18, 0, h * 0.48);
    reflection.addColorStop(0.0, "rgba(255,255,255,0.22)");
    reflection.addColorStop(0.28, "rgba(255,255,255,0.08)");
    reflection.addColorStop(1.0, "rgba(255,255,255,0.0)");
    ctx.fillStyle = reflection;
    ctx.fillRect(28, 20, w - 56, h * 0.42);

    // Лёгкие горизонтальные линии
    for (let y = 28; y < h - 24; y += 4) {
      ctx.fillStyle =
        y % 8 === 0 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.02)";
      ctx.fillRect(22, y, w - 44, 1);
    }

    // ==========================================
    // ТЕКСТ ДИСПЛЕЯ
    // ==========================================

    // Пустая строка означает:
    // дисплей существует, но ничего не показывает.
    if (label) {
      // ------------------------------------------
      // ВЕРХНЯЯ ПОДПИСЬ
      // ------------------------------------------

      ctx.save();

      ctx.font = "700 42px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(30, 38, 44, 0.92)";
      ctx.strokeText(label, w / 2, 62);

      ctx.fillStyle = "#EAFDFF";
      ctx.fillText(label, w / 2, 62);

      ctx.restore();

      // Боковые декоративные линии
      ctx.strokeStyle = "rgba(200,245,255,0.75)";
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(120, 62);
      ctx.lineTo(355, 62);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(w - 120, 62);
      ctx.lineTo(w - 355, 62);
      ctx.stroke();

      // ------------------------------------------
      // НОМЕР
      // ------------------------------------------

      const text = String(levelNumber).padStart(2, "0");

      ctx.save();

      ctx.font = "700 132px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(20, 28, 34, 0.95)";
      ctx.strokeText(text, w / 2, h / 2 + 42);

      ctx.shadowColor = "rgba(160,240,255,0.35)";
      ctx.shadowBlur = 5;

      ctx.fillStyle = "#F8FFFF";
      ctx.fillText(text, w / 2, h / 2 + 42);

      ctx.restore();
    }

    ctx.restore();

    // Внутренняя тонкая светлая рамка в текстуре
    roundRect(15, 15, w - 30, h - 30, 24);
    ctx.strokeStyle = "rgba(180,235,250,0.42)";
    ctx.lineWidth = 3;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    return texture;
  }

  createElevatorRunningDotsTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 24;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const count = 12;
    const cy = canvas.height / 2;

    for (let i = 0; i < count; i++) {
      const x = ((i + 0.5) * canvas.width) / count;

      ctx.save();
      ctx.shadowColor = "rgba(120, 235, 255, 0.95)";
      ctx.shadowBlur = 10;

      ctx.fillStyle = "rgba(185, 250, 255, 0.98)";
      ctx.beginPath();
      ctx.arc(x, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;

    return texture;
  }

  createRoomElevator(config) {
    if (!config || !config.id) {
      console.warn("[ELEVATOR] createRoomElevator: missing config.id");
      return null;
    }

    const style = {
      ...this.getElevatorStyle(),
      ...(config.style || {}),
    };

    const materials = this.createElevatorMaterials(style);
    const basis = this.getElevatorBasis(config.wall || "front");

    const wallX = config.x ?? 0;
    const wallZ = config.z ?? 0;

    const doorY = this.floorY + style.doorH / 2;
    const cabinY = doorY;

    // Вся геометрия считается в двух направлениях:
    // normal — глубина кабины от стены,
    // slide — направление разъезда створок.
    const normal = basis.normal.clone();
    const slide = basis.slide.clone();

    const makePos = (normalOffset, slideOffset, y) => {
      return new THREE.Vector3(
        wallX + normal.x * normalOffset + slide.x * slideOffset,
        y,
        wallZ + normal.z * normalOffset + slide.z * slideOffset,
      );
    };

    const addDoorCircuitOverlay = (mesh, side) => {
      const overlayMaterial =
        side === -1
          ? materials.doorCircuitMatLeft
          : materials.doorCircuitMatRight;

      // Размер светящейся накладки.
      // Эти числа тоже можно потом чуть подкрутить.
      const overlayWidth = style.doorW * 0.92;
      const overlayHeight = style.doorH * 0.94;

      // Насколько накладка выступает над поверхностью двери.
      const overlayDepthOffset = style.doorD / 2 + 0.006;

      const addOverlayFace = (normalSign) => {
        const overlay = new THREE.Mesh(
          new THREE.PlaneGeometry(overlayWidth, overlayHeight),
          overlayMaterial,
        );

        if (basis.slideAxis === "x") {
          // Обычные фронтальные лифты:
          // створка лежит в плоскости XY, поэтому PlaneGeometry
          // вообще не нужно поворачивать вокруг Y.
          overlay.rotation.set(0, normalSign > 0 ? 0 : Math.PI, 0);

          // Толщина двери здесь идёт по Z.
          overlay.position.set(0, 0, normalSign * overlayDepthOffset);
        } else {
          // Боковая ориентация:
          // ширина створки идёт по Z, поэтому плоскость XY
          // действительно нужно повернуть на 90° вокруг Y.
          overlay.rotation.set(
            0,
            normalSign > 0 ? Math.PI / 2 : -Math.PI / 2,
            0,
          );

          // Толщина двери здесь идёт по X.
          overlay.position.set(normalSign * overlayDepthOffset, 0, 0);
        }

        overlay.renderOrder = 3;
        overlay.castShadow = false;
        overlay.receiveShadow = false;

        mesh.add(overlay);
      };

      // basis.normal указывает от стены внутрь кабины.
      // Наружная сторона двери (со стороны комнаты)
      // всегда находится в противоположном направлении.
      let exteriorFaceSign;

      if (basis.depthAxis === "z") {
        exteriorFaceSign = -Math.sign(basis.normal.z);
      } else {
        exteriorFaceSign = -Math.sign(basis.normal.x);
      }

      addOverlayFace(exteriorFaceSign);

      return overlayMaterial;
    };

    // Создаёт BoxGeometry, где:
    // normalSize — толщина/глубина по направлению кабины,
    // slideSize — ширина по направлению движения створок.
    const makeBoxGeometry = (normalSize, height, slideSize) => {
      if (basis.depthAxis === "x") {
        // Боковые стены: глубина по X, ширина по Z.
        return new THREE.BoxGeometry(normalSize, height, slideSize);
      }

      // Передняя/задняя стены: ширина по X, глубина по Z.
      return new THREE.BoxGeometry(slideSize, height, normalSize);
    };

    const makeCannonHalfExtents = (normalSize, height, slideSize) => {
      if (basis.depthAxis === "x") {
        return new CANNON.Vec3(normalSize / 2, height / 2, slideSize / 2);
      }

      return new CANNON.Vec3(slideSize / 2, height / 2, normalSize / 2);
    };

    const group = new THREE.Group();
    group.name = config.name || config.id;

    const addCameraWall = (mesh) => {
      if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
        this.sceneManager.walls.push({
          mesh,
          isElevatorCabinWall: true,
          skipMaterialUpdate: true,
        });
      }
    };

    const addBoxMesh = (
      name,
      normalSize,
      height,
      slideSize,
      normalOffset,
      slideOffset,
      y,
      material,
      cameraWall = true,
    ) => {
      const mesh = new THREE.Mesh(
        makeBoxGeometry(normalSize, height, slideSize),
        material,
      );

      mesh.name = name;
      mesh.position.copy(makePos(normalOffset, slideOffset, y));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.skipWallMaterialUpdate = true;

      group.add(mesh);

      if (cameraWall) {
        addCameraWall(mesh);
      }

      return mesh;
    };

    const addRotatedBoxMesh = (
      name,
      normalSize,
      height,
      slideSize,
      normalOffset,
      slideOffset,
      y,
      material,
      rotationX = 0,
      rotationY = 0,
      rotationZ = 0,
    ) => {
      const mesh = new THREE.Mesh(
        makeBoxGeometry(normalSize, height, slideSize),
        material,
      );

      mesh.name = name;
      mesh.position.copy(makePos(normalOffset, slideOffset, y));
      mesh.rotation.set(rotationX, rotationY, rotationZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.skipWallMaterialUpdate = true;

      group.add(mesh);

      return mesh;
    };

    // Создаёт плинтус с треугольным профилем
    // и, при необходимости, с запилом торцов под 45°.
    const addMiteredSkirtingMesh = ({
      name,
      start,
      end,
      inward,
      size,
      material,
      miterStart = false,
      miterEnd = false,
    }) => {
      const direction = end.clone().sub(start).normalize();
      const up = new THREE.Vector3(0, 1, 0);

      // Точки внутреннего края у пола.
      const startInner = start.clone().addScaledVector(inward, size);

      const endInner = end.clone().addScaledVector(inward, size);

      // Запил под 45°.
      //
      // В начале внутренний край уходит вперёд,
      // в конце — назад. Получается диагональная плоскость стыка.
      if (miterStart) {
        startInner.addScaledVector(direction, size);
      }

      if (miterEnd) {
        endInner.addScaledVector(direction, -size);
      }

      // Поперечное сечение плинтуса — треугольник:
      //
      // стенка
      // │\
      // │ \
      // │__\ пол
      //
      const points = [
        // Начало
        start.clone(), // 0: низ у стены
        start.clone().addScaledVector(up, size), // 1: верх у стены
        startInner, // 2: край на полу

        // Конец
        end.clone(), // 3
        end.clone().addScaledVector(up, size), // 4
        endInner, // 5
      ];

      const vertices = [];

      for (const p of points) {
        vertices.push(p.x, p.y, p.z);
      }

      const indices = [];

      // Прямые торцы закрываем.
      // Скошенные торцы специально не закрываем — там плинтусы
      // сходятся друг с другом запилом.
      if (!miterStart) {
        indices.push(0, 2, 1);
      }

      if (!miterEnd) {
        indices.push(3, 4, 5);
      }

      // Оставляем только ВИДИМУЮ наклонную лицевую поверхность.
      // Поверхности, лежащие на стене и полу, не рисуем вообще,
      // чтобы не было z-fighting.
      indices.push(1, 2, 5, 1, 5, 4);

      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );

      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, material);

      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.skipWallMaterialUpdate = true;

      group.add(mesh);

      return mesh;
    };

    // === КАБИНА ===

    // Расстояние между плоскостью стены комнаты
    // и настоящим началом кабины.
    //
    // В этом пространстве ниже построим короткий портал.
    const cabinStartOffset = 0.7;

    // ВАЖНО:
    // глубина самой кабины НЕ уменьшается.
    // Мы просто целиком переносим её дальше от комнаты.
    const cabinCenterOffset = cabinStartOffset + style.cabinDepth / 2;

    const cabinBackOffset = cabinStartOffset + style.cabinDepth;

    // Раньше 0.42 был нужен, чтобы скрывать торцы у самого входа.
    // Теперь у нас есть отдельный портал, поэтому можем
    // начать внутреннюю обшивку почти сразу за ним.
    const cabinVisualInset = 0.08;

    const cabinVisualDepth = style.cabinDepth - cabinVisualInset;

    const cabinVisualCenterOffset =
      cabinStartOffset + cabinVisualInset + cabinVisualDepth / 2;

    addBoxMesh(
      `${config.id}_floor`,
      style.cabinDepth,
      0.08,
      style.cabinW,
      cabinCenterOffset,
      0,
      this.floorY + 0.04,
      materials.cabinFloorMat,
      false,
    );

    addBoxMesh(
      `${config.id}_ceiling`,
      cabinVisualDepth,
      0.08,
      style.cabinW,
      cabinVisualCenterOffset,
      0,
      this.floorY + style.cabinH - 0.04,
      materials.cabinCeilingMat,
      true,
    );

    // ==========================================
    // ДЕКОРАТИВНЫЙ ПОТОЛОЧНЫЙ МОДУЛЬ
    // ==========================================
    //
    // Вместо одной тёмной плоскости делаем светлую кассету
    // с тёмной рамкой вокруг центрального светильника.

    const ceilingDecorY = this.floorY + style.cabinH - 0.1;

    // Размер центральной потолочной кассеты.
    const ceilingPanelDepth = 3.5;
    const ceilingPanelWidth = 5.7;
    // Центр декоративной потолочной кассеты.
    // Она должна ехать вместе с кабиной.
    const ceilingDecorCenterOffset = cabinStartOffset + style.cabinDepth * 0.48;

    // Светлая внутренняя панель.
    addBoxMesh(
      `${config.id}_ceiling_panel`,
      ceilingPanelDepth,
      0.055,
      ceilingPanelWidth,
      ceilingDecorCenterOffset,
      0,
      ceilingDecorY,
      materials.cabinPanelMat,
      false,
    );

    // Тёмная рамка по четырём сторонам кассеты.
    const ceilingTrimThickness = 0.16;

    // Передняя поперечина.
    addBoxMesh(
      `${config.id}_ceiling_trim_front`,
      ceilingTrimThickness,
      0.08,
      ceilingPanelWidth + 0.32,
      ceilingDecorCenterOffset - ceilingPanelDepth / 2,
      0,
      ceilingDecorY - 0.015,
      materials.cabinTrimMat,
      false,
    );

    // Задняя поперечина.
    addBoxMesh(
      `${config.id}_ceiling_trim_back`,
      ceilingTrimThickness,
      0.08,
      ceilingPanelWidth + 0.32,
      ceilingDecorCenterOffset + ceilingPanelDepth / 2,
      0,
      ceilingDecorY - 0.015,
      materials.cabinTrimMat,
      false,
    );

    // Левая продольная рейка.
    addBoxMesh(
      `${config.id}_ceiling_trim_left`,
      ceilingPanelDepth,
      0.08,
      ceilingTrimThickness,
      ceilingDecorCenterOffset,
      -(ceilingPanelWidth / 2 + ceilingTrimThickness / 2),
      ceilingDecorY - 0.015,
      materials.cabinTrimMat,
      false,
    );

    // Правая продольная рейка.
    addBoxMesh(
      `${config.id}_ceiling_trim_right`,
      ceilingPanelDepth,
      0.08,
      ceilingTrimThickness,
      ceilingDecorCenterOffset,
      ceilingPanelWidth / 2 + ceilingTrimThickness / 2,
      ceilingDecorY - 0.015,
      materials.cabinTrimMat,
      false,
    );

    // === ФИЗИКА КАБИНЫ ===

    const addCabinPhysics = (
      normalSize,
      height,
      slideSize,
      normalOffset,
      slideOffset,
      y,
    ) => {
      const body = new CANNON.Body({
        mass: 0,
        material: this.matStandard,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
        collisionFilterMask:
          CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
      });

      body.addShape(
        new CANNON.Box(makeCannonHalfExtents(normalSize, height, slideSize)),
      );

      body.position.copy(makePos(normalOffset, slideOffset, y));

      this.addBody(body);

      return body;
    };

    // Пол кабины
    addCabinPhysics(
      style.cabinDepth,
      0.08,
      style.cabinW,
      cabinCenterOffset,
      0,
      this.floorY + 0.04,
    );

    // Левая боковая стенка
    addCabinPhysics(
      style.cabinDepth,
      style.cabinH,
      0.08,
      cabinCenterOffset,
      -style.cabinW / 2,
      cabinY,
    );

    // Правая боковая стенка
    addCabinPhysics(
      style.cabinDepth,
      style.cabinH,
      0.08,
      cabinCenterOffset,
      style.cabinW / 2,
      cabinY,
    );

    // Задняя стенка
    addCabinPhysics(
      0.08,
      style.cabinH,
      style.cabinW,
      cabinBackOffset,
      0,
      cabinY,
    );

    const cabinSideA = addBoxMesh(
      `${config.id}_side_a`,
      cabinVisualDepth,
      style.cabinH,
      0.08,
      cabinVisualCenterOffset,
      -style.cabinW / 2,
      cabinY,
      materials.cabinSideWallMat,
      true,
    );

    const cabinSideB = addBoxMesh(
      `${config.id}_side_b`,
      cabinVisualDepth,
      style.cabinH,
      0.08,
      cabinVisualCenterOffset,
      style.cabinW / 2,
      cabinY,
      materials.cabinSideWallMat,
      true,
    );

    addBoxMesh(
      `${config.id}_back_wall`,

      0.08,
      style.cabinH,
      style.cabinW,
      cabinBackOffset,
      0,
      cabinY,
      materials.cabinBackWallMat,
      true,
    );

    // ==========================================
    // ПЛИНТУСЫ КАБИНЫ
    // С НАСТОЯЩИМ ЗАПИЛОМ УГЛОВ ПОД 45°
    // ==========================================

    const skirtingSize = 0.3;

    // Верх поверхности пола.
    // Сам пол имеет толщину 0.08 и центр стоит на floorY + 0.04.
    const skirtingFloorY = this.floorY + 0.08;

    // Внутренняя поверхность боковой стенки.
    // Стенка имеет толщину 0.08.
    const sideWallInnerOffset = style.cabinW / 2 - 0.04;

    // Внутренняя поверхность задней стенки.
    const backWallInnerOffset = cabinBackOffset - 0.04;

    // Передний край.
    // После предыдущей правки внутренняя обшивка начинается
    // с cabinVisualInset. Плинтус начинаем ещё немного глубже,
    // чтобы возле двери вообще ничего не торчало.
    const skirtingFrontOffset = cabinStartOffset + cabinVisualInset + 0.15;

    // ------------------------------------------
    // ЛЕВЫЙ БОКОВОЙ ПЛИНТУС
    // ------------------------------------------

    const leftSkirtingStart = makePos(
      skirtingFrontOffset,
      -sideWallInnerOffset,
      skirtingFloorY,
    );

    const leftSkirtingEnd = makePos(
      backWallInnerOffset,
      -sideWallInnerOffset,
      skirtingFloorY,
    );

    addMiteredSkirtingMesh({
      name: `${config.id}_skirting_left`,

      start: leftSkirtingStart,
      end: leftSkirtingEnd,

      // От левой стенки внутрь кабины.
      inward: slide.clone(),

      size: skirtingSize,
      material: materials.cabinSkirtingMat,

      // Передний торец прямой,
      // задний запилен под 45°.
      miterStart: false,
      miterEnd: true,
    });

    // ------------------------------------------
    // ПРАВЫЙ БОКОВОЙ ПЛИНТУС
    // ------------------------------------------

    const rightSkirtingStart = makePos(
      skirtingFrontOffset,
      sideWallInnerOffset,
      skirtingFloorY,
    );

    const rightSkirtingEnd = makePos(
      backWallInnerOffset,
      sideWallInnerOffset,
      skirtingFloorY,
    );

    addMiteredSkirtingMesh({
      name: `${config.id}_skirting_right`,

      start: rightSkirtingStart,
      end: rightSkirtingEnd,

      // От правой стенки внутрь кабины.
      inward: slide.clone().multiplyScalar(-1),

      size: skirtingSize,
      material: materials.cabinSkirtingMat,

      miterStart: false,
      miterEnd: true,
    });

    // ------------------------------------------
    // ЗАДНИЙ ПЛИНТУС
    // ------------------------------------------

    const backSkirtingStart = makePos(
      backWallInnerOffset,
      -sideWallInnerOffset,
      skirtingFloorY,
    );

    const backSkirtingEnd = makePos(
      backWallInnerOffset,
      sideWallInnerOffset,
      skirtingFloorY,
    );

    addMiteredSkirtingMesh({
      name: `${config.id}_skirting_back`,

      start: backSkirtingStart,
      end: backSkirtingEnd,

      // От задней стены внутрь кабины,
      // то есть в сторону, противоположную normal.
      inward: normal.clone().multiplyScalar(-1),

      size: skirtingSize,
      material: materials.cabinSkirtingMat,

      // Оба конца заднего плинтуса запилены.
      miterStart: true,
      miterEnd: true,
    });

    // === ОСВЕЩЕНИЕ КАБИНЫ ===
    // То же RectAreaLight, что используется в центральном лифте.
    const cabinLight = new THREE.RectAreaLight(0xfff0dd, 4.0, 3.2, 3.2);

    cabinLight.name = `${config.id}_Light`;

    cabinLight.position.copy(
      makePos(ceilingDecorCenterOffset, 0, this.floorY + style.cabinH - 0.12),
    );

    // RectAreaLight направлен вертикально вниз.
    cabinLight.rotation.x = -Math.PI / 2;

    group.add(cabinLight);

    const cabinLamp = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.08, 2.8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.0,
        roughness: 0.2,
        metalness: 0.0,
      }),
    );

    cabinLamp.position.copy(
      makePos(ceilingDecorCenterOffset, 0, this.floorY + style.cabinH - 0.17),
    );
    group.add(cabinLamp);

    // ==========================================
    // КОРОТКИЙ ВХОДНОЙ ПОРТАЛ
    // ==========================================
    //
    // Кабина начинается на cabinStartOffset.
    // Портал соединяет плоскость комнаты с кабиной,
    // не уменьшая внутренний объём лифта.

    const portalDepth = cabinStartOffset - 0.02;
    const portalCenterOffset = portalDepth / 2;

    const portalWallThickness = 0.12;

    // Левая внутренняя стенка портала.
    addBoxMesh(
      `${config.id}_portal_left`,
      portalDepth,
      style.cabinH,
      portalWallThickness,
      portalCenterOffset,
      -style.cabinW / 2 + portalWallThickness / 2,
      cabinY,
      materials.outerFrameMat,
      true,
    );

    // Правая внутренняя стенка портала.
    addBoxMesh(
      `${config.id}_portal_right`,
      portalDepth,
      style.cabinH,
      portalWallThickness,
      portalCenterOffset,
      style.cabinW / 2 - portalWallThickness / 2,
      cabinY,
      materials.outerFrameMat,
      true,
    );

    // Потолок портала.
    addBoxMesh(
      `${config.id}_portal_top`,
      portalDepth,
      portalWallThickness,
      style.cabinW,
      portalCenterOffset,
      0,
      this.floorY + style.cabinH - portalWallThickness / 2,
      materials.outerFrameMat,
      true,
    );

    // Пол короткого входного портала.
    // Соединяет пол комнаты с отодвинутой назад кабиной.
    addBoxMesh(
      `${config.id}_portal_floor`,
      cabinStartOffset,
      0.08,
      style.cabinW,
      cabinStartOffset / 2,
      0,
      this.floorY + 0.04,
      materials.outerFrameMat,
      false,
    );

    // Физический пол портала.
    addCabinPhysics(
      cabinStartOffset,
      0.08,
      style.cabinW,
      cabinStartOffset / 2,
      0,
      this.floorY + 0.04,
    );

    // ==========================================
    // ВНЕШНЯЯ ОБЪЁМНАЯ РАМА ПОРТАЛА
    // ==========================================
    //
    // Рама строится от реального внутреннего проёма портала,
    // поэтому её размеры автоматически связаны с кабиной.

    // Чистая ширина прохода между внутренними стенками портала.
    const frameInnerWidth = style.cabinW - portalWallThickness * 2;

    // Насколько широкими будут боковые стойки рамы.
    const outerFrameSideWidth = 0.62;

    // Высота верхней перемычки.
    const outerFrameTopHeight = 0.62;

    // Полная наружная ширина рамы.
    const outerFrameWidth = frameInnerWidth + outerFrameSideWidth * 2;

    // Глубина рамы.
    // Часть выступает в комнату, часть слегка заходит в портал.
    const outerFrameDepth = 0.24;
    const outerFrameOffset = -0.05;

    // Общая высота вместе с верхней перемычкой.
    const outerFrameHeight = style.doorH + outerFrameTopHeight;

    // ------------------------------------------
    // ЛЕВАЯ СТОЙКА
    // ------------------------------------------

    addBoxMesh(
      `${config.id}_outer_frame_left`,
      outerFrameDepth,
      outerFrameHeight,
      outerFrameSideWidth,
      outerFrameOffset,

      -(frameInnerWidth / 2 + outerFrameSideWidth / 2),

      this.floorY + outerFrameHeight / 2,
      materials.outerFrameMat,
      false,
    );

    // ------------------------------------------
    // ПРАВАЯ СТОЙКА
    // ------------------------------------------

    addBoxMesh(
      `${config.id}_outer_frame_right`,
      outerFrameDepth,
      outerFrameHeight,
      outerFrameSideWidth,
      outerFrameOffset,

      frameInnerWidth / 2 + outerFrameSideWidth / 2,

      this.floorY + outerFrameHeight / 2,
      materials.outerFrameMat,
      false,
    );

    // ------------------------------------------
    // ВЕРХНЯЯ ПЕРЕМЫЧКА
    // ------------------------------------------

    addBoxMesh(
      `${config.id}_outer_frame_top`,
      outerFrameDepth,
      outerFrameTopHeight,
      outerFrameWidth,
      outerFrameOffset,
      0,

      this.floorY + style.doorH + outerFrameTopHeight / 2,

      materials.outerFrameMat,
      false,
    );

    // ==========================================
    // ДИСПЛЕЙ НОМЕРА УРОВНЯ
    // ==========================================
    const levelNumber = config.levelNumber ?? this.currentRoomId;

    const elevatorRole = config.elevatorRole ?? "start";

    const displayLabel = elevatorRole === "exit" ? "" : "SECTOR";

    const displayTexture = this.createElevatorLevelDisplayTexture(
      levelNumber,
      displayLabel,
    );

    // Размеры дисплея
    const displayWidth = 3.25;
    const displayHeight = 1.12;
    const displayDepth = 0.18;

    // Немного опускаем ближе к раме, чтобы не "висел" слишком высоко
    const displayY =
      this.floorY + style.doorH + outerFrameTopHeight + displayHeight / 2 + 0.1;

    // Центр корпуса дисплея
    const displayNormalOffset =
      outerFrameOffset - outerFrameDepth / 2 - displayDepth / 2 - 0.02;

    // Материалы
    const displayBodyMat = new THREE.MeshStandardMaterial({
      color: 0xa9b6be,
      roughness: 0.28,
      metalness: 0.72,
    });

    const displayBezelMat = new THREE.MeshStandardMaterial({
      color: 0xe2edf2,
      roughness: 0.16,
      metalness: 0.88,
    });

    // ЭТО ГЛАВНЫЙ ЭКРАН С ТЕКСТОМ.
    // Он НЕ стеклянный, а именно яркая световая панель.
    // Поэтому текст будет чётче.
    const displayScreenMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: displayTexture,

      emissive: 0xffffff,
      emissiveMap: displayTexture,
      emissiveIntensity: 0.82,

      roughness: 0.16,
      metalness: 0.0,

      transparent: false,
      toneMapped: false,
    });

    // ЭТО ОТДЕЛЬНОЕ ПЕРЕДНЕЕ СТЕКЛО.
    // На нём НЕТ текста.
    const displayGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0.0,

      transparent: true,
      opacity: 0.18,

      transmission: 0.0,
      thickness: 0.0,

      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    });

    const displayGlowBaseMat = new THREE.MeshStandardMaterial({
      color: 0x11181c,
      roughness: 0.35,
      metalness: 0.15,
    });

    const antsTextureH = this.createElevatorRunningDotsTexture();
    antsTextureH.repeat.set(7, 1);

    const antsTextureV = this.createElevatorRunningDotsTexture();
    antsTextureV.repeat.set(1, 7);

    const displayAntsMatH = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: antsTextureH,

      emissive: 0x9eefff,
      emissiveMap: antsTextureH,
      emissiveIntensity: 1.15,

      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.0,
      toneMapped: false,
    });

    const displayAntsMatV = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: antsTextureV,

      emissive: 0x9eefff,
      emissiveMap: antsTextureV,
      emissiveIntensity: 1.15,

      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      roughness: 0.2,
      metalness: 0.0,
      toneMapped: false,
    });

    // ------------------------------------------
    // ОСНОВНОЙ КОРПУС
    // ------------------------------------------

    addBoxMesh(
      `${config.id}_level_display_body`,
      displayDepth,
      displayHeight,
      displayWidth,
      displayNormalOffset,
      0,
      displayY,
      displayBodyMat,
      false,
    );

    // ------------------------------------------
    // ПЕРЕДНЯЯ МЕТАЛЛИЧЕСКАЯ РАМКА
    // ------------------------------------------

    const bezelThickness = 0.09;
    const bezelDepth = 0.03;
    const bezelNormalOffset =
      displayNormalOffset - displayDepth / 2 - bezelDepth / 2 - 0.004;

    // Верх
    addBoxMesh(
      `${config.id}_level_display_bezel_top`,
      bezelDepth,
      bezelThickness,
      displayWidth,
      bezelNormalOffset,
      0,
      displayY + displayHeight / 2 - bezelThickness / 2,
      displayBezelMat,
      false,
    );

    // Низ
    addBoxMesh(
      `${config.id}_level_display_bezel_bottom`,
      bezelDepth,
      bezelThickness,
      displayWidth,
      bezelNormalOffset,
      0,
      displayY - displayHeight / 2 + bezelThickness / 2,
      displayBezelMat,
      false,
    );

    // Левая сторона
    addBoxMesh(
      `${config.id}_level_display_bezel_left`,
      bezelDepth,
      displayHeight - bezelThickness * 2,
      bezelThickness,
      bezelNormalOffset,
      -(displayWidth / 2 - bezelThickness / 2),
      displayY,
      displayBezelMat,
      false,
    );

    // Правая сторона
    addBoxMesh(
      `${config.id}_level_display_bezel_right`,
      bezelDepth,
      displayHeight - bezelThickness * 2,
      bezelThickness,
      bezelNormalOffset,
      displayWidth / 2 - bezelThickness / 2,
      displayY,
      displayBezelMat,
      false,
    );

    // ------------------------------------------
    // ЯРКИЙ ЭКРАН С ТЕКСТУРОЙ
    // ------------------------------------------

    const screenWidth = displayWidth - bezelThickness * 2 - 0.05;
    const screenHeight = displayHeight - bezelThickness * 2 - 0.05;
    const screenDepth = 0.03;

    const screenNormalOffset =
      displayNormalOffset - displayDepth / 2 - screenDepth / 2 + 0.012;

    addBoxMesh(
      `${config.id}_level_display_screen`,
      screenDepth,
      screenHeight,
      screenWidth,
      screenNormalOffset,
      0,
      displayY,
      displayScreenMat,
      false,
    );

    // ------------------------------------------
    // ПЕРЕДНЕЕ ТОНКОЕ СТЕКЛО
    // ------------------------------------------

    const glassWidth = screenWidth;
    const glassHeight = screenHeight;
    const glassDepth = 0.012;

    const glassNormalOffset =
      screenNormalOffset - screenDepth / 2 - glassDepth / 2 - 0.003;

    addBoxMesh(
      `${config.id}_level_display_glass`,
      glassDepth,
      glassHeight,
      glassWidth,
      glassNormalOffset,
      0,
      displayY,
      displayGlassMat,
      false,
    );

    // ------------------------------------------
    // ТЁМНАЯ ВНУТРЕННЯЯ ОКАНТОВКА
    // ------------------------------------------

    const glowDepth = 0.016;
    const glowThickness = 0.04;
    const glowNormalOffset =
      glassNormalOffset - glassDepth / 2 - glowDepth / 2 - 0.001;

    // Тёмная база под "муравьёв"
    addBoxMesh(
      `${config.id}_level_display_glow_top_base`,
      glowDepth,
      glowThickness,
      glassWidth - 0.06,
      glowNormalOffset,
      0,
      displayY + glassHeight / 2 - glowThickness / 2,
      displayGlowBaseMat,
      false,
    );

    addBoxMesh(
      `${config.id}_level_display_glow_bottom_base`,
      glowDepth,
      glowThickness,
      glassWidth - 0.06,
      glowNormalOffset,
      0,
      displayY - glassHeight / 2 + glowThickness / 2,
      displayGlowBaseMat,
      false,
    );

    addBoxMesh(
      `${config.id}_level_display_glow_left_base`,
      glowDepth,
      glassHeight - glowThickness * 2 - 0.02,
      glowThickness,
      glowNormalOffset,
      -(glassWidth / 2 - glowThickness / 2),
      displayY,
      displayGlowBaseMat,
      false,
    );

    addBoxMesh(
      `${config.id}_level_display_glow_right_base`,
      glowDepth,
      glassHeight - glowThickness * 2 - 0.02,
      glowThickness,
      glowNormalOffset,
      glassWidth / 2 - glowThickness / 2,
      displayY,
      displayGlowBaseMat,
      false,
    );

    // ------------------------------------------
    // БЕГУЩИЕ ГОЛУБЫЕ ТОЧКИ
    // ------------------------------------------

    const antsDepth = 0.008;
    const antsThickness = 0.022;
    const antsNormalOffset =
      glowNormalOffset - glowDepth / 2 - antsDepth / 2 - 0.0015;

    // Верх
    const antsTop = addBoxMesh(
      `${config.id}_level_display_ants_top`,
      antsDepth,
      antsThickness,
      glassWidth - 0.08,
      antsNormalOffset,
      0,
      displayY + glassHeight / 2 - antsThickness / 2,
      displayAntsMatH,
      false,
    );

    // Низ
    const antsBottom = addBoxMesh(
      `${config.id}_level_display_ants_bottom`,
      antsDepth,
      antsThickness,
      glassWidth - 0.08,
      antsNormalOffset,
      0,
      displayY - glassHeight / 2 + antsThickness / 2,
      displayAntsMatH,
      false,
    );

    // Лево
    const antsLeft = addBoxMesh(
      `${config.id}_level_display_ants_left`,
      antsDepth,
      glassHeight - antsThickness * 2 - 0.02,
      antsThickness,
      antsNormalOffset,
      -(glassWidth / 2 - antsThickness / 2),
      displayY,
      displayAntsMatV,
      false,
    );

    // Право
    const antsRight = addBoxMesh(
      `${config.id}_level_display_ants_right`,
      antsDepth,
      glassHeight - antsThickness * 2 - 0.02,
      antsThickness,
      antsNormalOffset,
      glassWidth / 2 - antsThickness / 2,
      displayY,
      displayAntsMatV,
      false,
    );
    // ==========================================
    // ДЕКОРАТИВНЫЙ ПОРОГ У ВХОДА
    // ==========================================
    //
    // Он закрывает чёрную полоску пола у входа,
    // но не влияет на физику.

    const thresholdDepth = 0.22;
    const thresholdHeight = 0.035;
    const thresholdWidth = style.cabinW - 0.04;

    // Ставим порог почти у плоскости комнаты.
    const thresholdOffset = thresholdDepth / 2 + 0.01;

    // === ДВЕРИ ===

    const doorOffset = config.doorOffset ?? 0.7;
    const slideDistance = style.openOffset - style.closedOffset;

    const addDoorSeams = (mesh, side) => {
      const seamWidth = 0.05;
      const seamHeight = style.doorH + 0.02;
      const seamThickness = 0.01;
      const edgeCapThickness = 0.022;

      if (basis.slideAxis === "x") {
        // Обычная ориентация: створки едут по X.
        const isLeftLeaf = side === -1;
        const innerEdgeX = isLeftLeaf ? style.doorW / 2 : -style.doorW / 2;
        const edgeDir = isLeftLeaf ? 1 : -1;

        const edgeCap = new THREE.Mesh(
          new THREE.BoxGeometry(
            edgeCapThickness,
            seamHeight,
            style.doorD + 0.02,
          ),
          materials.seamMat,
        );

        edgeCap.position.set(
          innerEdgeX + edgeDir * (edgeCapThickness / 2 + 0.002),
          0,
          0,
        );

        edgeCap.castShadow = true;
        edgeCap.receiveShadow = true;
        mesh.add(edgeCap);

        const seamOffsetZ = style.doorD / 2 + seamThickness / 2 + 0.003;

        const createSeamStrip = (zOffset) => {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(seamWidth, seamHeight, seamThickness),
            materials.seamMat,
          );

          strip.position.set(
            innerEdgeX - edgeDir * (seamWidth / 2 - 0.01),
            0,
            zOffset,
          );

          strip.castShadow = true;
          strip.receiveShadow = true;
          mesh.add(strip);
        };

        createSeamStrip(seamOffsetZ);
        createSeamStrip(-seamOffsetZ);

        return;
      }

      // Повернутая ориентация: створки едут по Z.
      const isNegativeLeaf = side === -1;
      const innerEdgeZ = isNegativeLeaf ? style.doorW / 2 : -style.doorW / 2;
      const edgeDir = isNegativeLeaf ? 1 : -1;

      const edgeCap = new THREE.Mesh(
        new THREE.BoxGeometry(style.doorD + 0.02, seamHeight, edgeCapThickness),
        materials.seamMat,
      );

      edgeCap.position.set(
        0,
        0,
        innerEdgeZ + edgeDir * (edgeCapThickness / 2 + 0.002),
      );

      edgeCap.castShadow = true;
      edgeCap.receiveShadow = true;
      mesh.add(edgeCap);

      const seamOffsetX = style.doorD / 2 + seamThickness / 2 + 0.003;

      const createSeamStrip = (xOffset) => {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(seamThickness, seamHeight, seamWidth),
          materials.seamMat,
        );

        strip.position.set(
          xOffset,
          0,
          innerEdgeZ - edgeDir * (seamWidth / 2 - 0.01),
        );

        strip.castShadow = true;
        strip.receiveShadow = true;
        mesh.add(strip);
      };

      createSeamStrip(seamOffsetX);
      createSeamStrip(-seamOffsetX);
    };

    const createLeaf = (side) => {
      const doorMaterial =
        side === -1 ? materials.doorMatLeft : materials.doorMatRight;
      const mesh = new THREE.Mesh(
        makeBoxGeometry(style.doorD, style.doorH, style.doorW),
        doorMaterial,
      );

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.skipWallMaterialUpdate = true;

      addDoorSeams(mesh, side);
      const glowMaterial = addDoorCircuitOverlay(mesh, side);

      const closedPosition = side * style.closedOffset;
      mesh.position.copy(makePos(doorOffset, closedPosition, doorY));

      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        material: this.matStandard,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
        collisionFilterMask:
          CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
      });

      body.addShape(
        new CANNON.Box(
          makeCannonHalfExtents(style.doorD, style.doorH, style.doorW),
        ),
      );

      body.position.copy(mesh.position);
      this.addBody(body);

      group.add(mesh);

      if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
        this.sceneManager.walls.push({
          mesh,
          isElevatorDoor: true,
          skipMaterialUpdate: true,
        });
      }

      return {
        mesh,
        body,
        side,
        glowMaterial,
        closedPosition: body.position[basis.slideAxis],
      };
    };

    const leafA = createLeaf(-1);
    const leafB = createLeaf(1);

    this.registerRoomElevator({
      id: config.id,

      levelNumber,
      elevatorRole,

      slideAxis: basis.slideAxis,
      slideDistance,

      openState: 0.0,
      targetOpenState: 0.0,

      leaves: [leafA, leafB],

      glowMaterials: [leafA.glowMaterial, leafB.glowMaterial],

      displayScreenMaterial: displayScreenMat,

      antMaterials: [
        {
          material: displayAntsMatH,
          texture: antsTextureH,
          axis: "x",
          direction: 1,
        },
        {
          material: displayAntsMatV,
          texture: antsTextureV,
          axis: "y",
          direction: -1,
        },
      ],
    });

    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.registerMesh(group);

    if (config.id === "room2_exit") {
      this.scene.updateMatrixWorld(true);

      const centralPos = new THREE.Vector3(0, 4.88, 11.25);

      const newExitPos = new THREE.Vector3(0, 4.88, -39.75);

      const lights = [];

      this.scene.traverse((obj) => {
        if (!obj.isLight) return;

        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);

        lights.push({
          name: obj.name || "(no name)",
          type: obj.type,
          intensity: obj.intensity,
          visible: obj.visible,

          worldPosition: worldPos.toArray(),

          distanceToCentral: worldPos.distanceTo(centralPos),

          distanceToNewExit: worldPos.distanceTo(newExitPos),

          parent: obj.parent?.name || "(no name)",
        });
      });

      console.log("============ ALL LIGHTS NEAR ELEVATORS ============");

      console.table(
        lights
          .filter(
            (light) =>
              light.distanceToCentral < 12 || light.distanceToNewExit < 12,
          )
          .sort(
            (a, b) =>
              Math.min(a.distanceToCentral, a.distanceToNewExit) -
              Math.min(b.distanceToCentral, b.distanceToNewExit),
          ),
      );
    }

    return {
      id: config.id,
      group,
      leafA,
      leafB,
      basis,
    };
  }

  createRoom2ExitCabinVisual({
    parent,
    frontX,
    centerZ,
    depth = 5.0,
    width = 7.5,
    height = 10.0,
  }) {
    const group = new THREE.Group();
    group.name = "Room2ExitCabin";

    const centerX = frontX + depth / 2;
    const centerY = this.floorY + height / 2;
    const backX = frontX + depth;

    const wallThickness = 0.08;
    const floorThickness = 0.08;
    const ceilingThickness = 0.08;

    // === МАТЕРИАЛЫ ===

    const sideWallMat = new THREE.MeshStandardMaterial({
      color: 0x6f777c,
      roughness: 0.58,
      metalness: 0.32,
      emissive: 0x24282b,
      emissiveIntensity: 0.18,
    });

    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x6f777c,
      roughness: 0.58,
      metalness: 0.32,
      emissive: 0x6f777c,
      emissiveIntensity: 0.32,
    });

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x4b5256,
      roughness: 0.72,
      metalness: 0.22,
    });

    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x1c2730,
      roughness: 0.65,
      metalness: 0.2,
    });

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.0,
    });

    const addPart = ({
      name,
      geometry,
      position,
      material,
      cameraWall = true,
    }) => {
      const mesh = new THREE.Mesh(geometry, material);

      mesh.name = name;
      mesh.position.copy(position);

      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.skipWallMaterialUpdate = true;

      group.add(mesh);

      if (
        cameraWall &&
        this.sceneManager &&
        Array.isArray(this.sceneManager.walls)
      ) {
        this.sceneManager.walls.push({
          mesh,
          isElevatorCabinWall: true,
          skipMaterialUpdate: true,
        });
      }

      return mesh;
    };

    // === ПОЛ ===

    addPart({
      name: "Room2ExitCabin_Floor",
      geometry: new THREE.BoxGeometry(depth, floorThickness, width),
      position: new THREE.Vector3(
        centerX,
        this.floorY + floorThickness / 2,
        centerZ,
      ),
      material: floorMat,
      cameraWall: false,
    });

    // === ПОТОЛОК ===

    addPart({
      name: "Room2ExitCabin_Ceiling",
      geometry: new THREE.BoxGeometry(depth, ceilingThickness, width),
      position: new THREE.Vector3(
        centerX,
        this.floorY + height - ceilingThickness / 2,
        centerZ,
      ),
      material: ceilingMat,
    });

    // === БОКОВЫЕ СТЕНЫ ===
    //
    // Кабина идёт вдоль X.
    // Поэтому боковины стоят по Z.

    addPart({
      name: "Room2ExitCabin_SideA",
      geometry: new THREE.BoxGeometry(depth, height, wallThickness),
      position: new THREE.Vector3(centerX, centerY, centerZ - width / 2),
      material: sideWallMat,
    });

    addPart({
      name: "Room2ExitCabin_SideB",
      geometry: new THREE.BoxGeometry(depth, height, wallThickness),
      position: new THREE.Vector3(centerX, centerY, centerZ + width / 2),
      material: sideWallMat,
    });

    // === ЗАДНЯЯ СТЕНА ===
    //
    // Передняя сторона на x = frontX остаётся открытой:
    // там находятся двери.
    //
    // Дальний торец — x = backX.

    addPart({
      name: "Room2ExitCabin_BackWall",
      geometry: new THREE.BoxGeometry(wallThickness, height, width),
      position: new THREE.Vector3(backX - wallThickness / 2, centerY, centerZ),
      material: backWallMat,
    });

    // === СВЕТИЛЬНИК ===

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 2.8), lampMat);

    lamp.name = "Room2ExitCabin_Lamp";

    lamp.position.set(centerX, this.floorY + height - 0.08, centerZ);

    lamp.userData.skipWallMaterialUpdate = true;

    group.add(lamp);

    // === РЕАЛЬНЫЙ СВЕТ ===
    //
    // Такой же тип, цвет и интенсивность,
    // как у центральной кабины.

    const light = new THREE.RectAreaLight(0xfff0dd, 4.0, 3.2, 3.2);

    light.name = "Room2ExitCabin_Light";

    light.position.set(centerX, this.floorY + height - 0.12, centerZ);

    light.rotation.x = -Math.PI / 2;

    group.add(light);

    parent.add(group);

    return group;
  }

  buildThirdRoom() {
    // Черновик уровня 3:
    // длинная комната, ниша на дальней стене и две простые фигуры.
    const roomW = 30;
    const roomD = 45;
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    const frontZ = 7.5;
    const centerZ = -15.0;
    const backZ = frontZ - roomD; // -37.5

    // Пол уровня 3
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.floorY, centerZ),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
      0,
      0,
      0x34495e,
    );

    // Потолок
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.ceilingY, centerZ),
      new THREE.Vector3(Math.PI / 2, 0, 0),
    );

    // Левая стена
    this.addPanelWall(
      roomD,
      wallH,
      new THREE.Vector3(-15, wallCenterY, centerZ),
      new THREE.Vector3(0, Math.PI / 2, 0),
    );

    // Правая стена
    this.addPanelWall(
      roomD,
      wallH,
      new THREE.Vector3(15, wallCenterY, centerZ),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    );

    // Дальняя стена
    this.addPanelWall(
      roomW,
      wallH,
      new THREE.Vector3(0, wallCenterY, backZ),
      new THREE.Vector3(0, 0, 0),
    );

    // Передняя стена с проёмом под стартовый лифт
    const elW = 7.5;
    const elH = 10.0;

    this.addPanelWallWithElevatorOpening({
      wallWidth: roomW,
      wallHeight: wallH,

      wallZ: frontZ,
      rotationY: Math.PI,

      openingWidth: elW,
      openingHeight: elH,

      reverseGrid: true,
    });
    // === СТАРТОВЫЙ ЛИФТ СЕКТОРА 3 ===
    this.room3StartElevator = this.createRoomElevator({
      id: "room3_start",
      name: "Room3StartElevator",

      wall: "front_out",

      x: 0,
      z: frontZ,

      levelNumber: 3,
      elevatorRole: "start",
    });

    // === НИША НА ДАЛЬНЕЙ СТЕНЕ ===
    this.buildRoom3NicheVisual();
    this.buildRoom3DraftFiguresVisual();
  }

  createRoom3ChalkTextMesh(text = "Coming soon...") {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Небольшой наклон всей надписи, будто написано рукой.
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-0.055);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Более тонкий рукописный стиль.
    // На Windows обычно есть Segoe Print / Comic Sans MS.
    ctx.font = 'italic 82px "Segoe Print", "Comic Sans MS", cursive';

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.shadowColor = "rgba(255,255,255,0.08)";
    ctx.shadowBlur = 2;

    const drawChalkLine = (str, x, y) => {
      // Не 6 проходов, а 2-3, чтобы текст был тоньше.
      for (let i = 0; i < 3; i++) {
        const dx = (Math.random() - 0.5) * 1.4;
        const dy = (Math.random() - 0.5) * 1.4;
        ctx.fillText(str, x + dx, y + dy);
      }
    };

    drawChalkLine("Coming", 0, -48);
    drawChalkLine("soon...", 0, 48);

    // Лёгкая меловая пыль, но не слишком много.
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 0.8;

    for (let i = 0; i < 60; i++) {
      const x = -360 + Math.random() * 720;
      const y = -120 + Math.random() * 240;
      const len = 2 + Math.random() * 7;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (Math.random() - 0.5) * 1.5);
      ctx.stroke();
    }

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.5), material);

    mesh.name = "Room3ChalkText";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.skipWallMaterialUpdate = true;

    return mesh;
  }

  buildRoom3NicheVisual() {
    const backZ = -37.38;
    const nicheY = this.floorY + 5.0;

    const nicheMat = new THREE.MeshStandardMaterial({
      color: 0x111820,
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0x001122,
      emissiveIntensity: 0.12,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2b3035,
      roughness: 0.55,
      metalness: 0.45,
    });

    const group = new THREE.Group();
    group.name = "Room3NicheVisual";

    // Тёмная внутренняя плоскость ниши
    const nicheBack = new THREE.Mesh(
      new THREE.BoxGeometry(9.0, 5.0, 0.16),
      nicheMat,
    );
    nicheBack.position.set(0, nicheY, backZ);
    group.add(nicheBack);
    // Надпись мелом на доске
    const chalkText = this.createRoom3ChalkTextMesh("Coming soon...");
    chalkText.position.set(0, nicheY, backZ + 0.095);
    group.add(chalkText);

    // Рама вокруг ниши
    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(9.8, 0.35, 0.3),
      frameMat,
    );
    frameTop.position.set(0, nicheY + 2.65, backZ + 0.05);
    group.add(frameTop);

    const frameBottom = new THREE.Mesh(
      new THREE.BoxGeometry(9.8, 0.35, 0.3),
      frameMat,
    );
    frameBottom.position.set(0, nicheY - 2.65, backZ + 0.05);
    group.add(frameBottom);

    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 5.35, 0.3),
      frameMat,
    );
    frameLeft.position.set(-4.9, nicheY, backZ + 0.05);
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 5.35, 0.3),
      frameMat,
    );
    frameRight.position.set(4.9, nicheY, backZ + 0.05);
    group.add(frameRight);

    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.registerMesh(group);
  }

  buildRoom3DraftFiguresVisual() {
    // Две временные фигуры перед нишей.
    // Потом заменим их на нормальные интерактивные объекты.
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0x8e44ad,
      roughness: 0.55,
      metalness: 0.1,
    });

    const cylMat = new THREE.MeshStandardMaterial({
      color: 0xe67e22,
      roughness: 0.55,
      metalness: 0.1,
    });

    const group = new THREE.Group();
    group.name = "Room3DraftFiguresVisual";

    const cube = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), cubeMat);
    cube.position.set(-3.0, this.floorY + 1.2, -29.5);
    cube.castShadow = true;
    cube.receiveShadow = true;
    group.add(cube);

    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 2.6, 32),
      cylMat,
    );
    cylinder.position.set(3.0, this.floorY + 1.3, -29.5);
    cylinder.castShadow = true;
    cylinder.receiveShadow = true;
    group.add(cylinder);

    this.registerMesh(group);
  }

  buildGlassWall() {
    const wallThickness = 2.0;
    const holeWidth = 24;
    const holeHeight = 11;
    const cornerRadius = 1.5;
    const wallPos = new THREE.Vector3(0, 2.5, 14);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1.0,
      transparent: true,
      opacity: 1,
      thickness: 0.1,
      ior: 1.0,
      specularIntensity: 0.0,
    });

    // Графика
    const glassWallGroup = this.sceneManager.createWallWithWindow(
      this.w,
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

    glassWallGroup.children.forEach((child) => {
      if (child.material === glassMat) child.userData.isGlass = true;
    });

    // Физика стены
    this.physicsManager.createWallWithHole(
      this.w,
      20,
      wallThickness,
      holeWidth,
      holeHeight,
      wallPos,
      null,
      CONFIG.PHYSICS.GROUPS,
    );

    // Физика самого стекла
    const glassPhysicsShape = new CANNON.Box(
      new CANNON.Vec3(holeWidth / 2, holeHeight / 2, 0.1),
    );
    const glassBody = new CANNON.Body({
      mass: 0,
      material: this.matSlippery,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    glassBody.addShape(glassPhysicsShape);
    glassBody.position.set(wallPos.x, wallPos.y, wallPos.z);
    this.world.addBody(glassBody);
  }

  buildRoom1Physics() {
    this.setBuildTarget("room");

    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    // === ФИЗИКА КОМНАТЫ №1 ===

    // Пол комнаты №1
    const floor1Body = new CANNON.Body({ mass: 0, material: this.matStandard });
    floor1Body.addShape(new CANNON.Box(new CANNON.Vec3(15, 10, 15)));
    floor1Body.position.set(0, this.floorY - 10, 30);
    this.addBody(floor1Body);

    // Внешние стены комнаты №1
    this.createPhysicsWall(-16, wallCenterY, 30, 1, wallH / 2, 15); // Левая
    this.createPhysicsWall(16, wallCenterY, 30, 1, wallH / 2, 15); // Правая
    this.createPhysicsWall(0, wallCenterY, 46, 15, wallH / 2, 1); // Дальняя

    // Фасад комнаты №1 с проёмом под лифт, Z = 15
    this.createPhysicsWall(-9.375, wallCenterY, 15, 5.625, wallH / 2, 0.1);
    this.createPhysicsWall(9.375, wallCenterY, 15, 5.625, wallH / 2, 0.1);
    this.createPhysicsWall(0, 7.5, 15, 3.75, 5, 0.1); // Козырек
  }

  buildRoom2Physics() {
    this.setBuildTarget("room");

    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    const roomW = 30;
    const roomD = 45;
    const frontZ = 7.5;
    const centerZ = -15.0;
    const backZ = frontZ - roomD; // -37.5

    // === ФИЗИКА КОМНАТЫ №2 ===

    // Пол комнаты №2
    const floor2Body = new CANNON.Body({ mass: 0, material: this.matStandard });
    floor2Body.addShape(
      new CANNON.Box(new CANNON.Vec3(roomW / 2, 10, roomD / 2)),
    );
    floor2Body.position.set(0, this.floorY - 10, centerZ);
    this.addBody(floor2Body);

    // Левая стена с физическим отверстием под белый кубик
    this.buildRoom2LeftWallWithSocketPhysics(wallH, wallCenterY);

    // ПРАВАЯ СТЕНА КОМНАТЫ №2
    // Старого бокового физического проёма больше нет.
    this.createPhysicsWall(16, wallCenterY, centerZ, 1, wallH / 2, roomD / 2);

    // === ДАЛЬНЯЯ ФИЗИЧЕСКАЯ СТЕНА С ПРОЁМОМ ПОД НОВЫЙ ЛИФТ ===

    const exitElW = 7.5;
    const exitElH = 10.0;

    const exitSideW = (roomW - exitElW) / 2;

    const exitLeftX = -(exitElW / 2) - exitSideW / 2;

    const exitRightX = exitElW / 2 + exitSideW / 2;

    // Левая часть дальней стены
    this.createPhysicsWall(
      exitLeftX,
      wallCenterY,
      backZ - 1,
      exitSideW / 2,
      wallH / 2,
      1,
    );

    // Правая часть дальней стены
    this.createPhysicsWall(
      exitRightX,
      wallCenterY,
      backZ - 1,
      exitSideW / 2,
      wallH / 2,
      1,
    );

    // Верхняя перемычка над проёмом
    const exitTopH = wallH - exitElH;

    const exitTopCenterY = this.floorY + exitElH + exitTopH / 2;

    this.createPhysicsWall(
      0,
      exitTopCenterY,
      backZ - 1,
      exitElW / 2,
      exitTopH / 2,
      1,
    );

    // Полка-цель в правом углу комнаты
    this.buildRoom2GoalShelfPhysics();

    // Фасад комнаты №2 с проёмом под стартовый лифт, Z = 7.5
    this.createPhysicsWall(-9.375, wallCenterY, frontZ, 5.625, wallH / 2, 0.1);
    this.createPhysicsWall(9.375, wallCenterY, frontZ, 5.625, wallH / 2, 0.1);
  }

  buildRoom3Physics() {
    this.setBuildTarget("room");

    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    const roomW = 30;
    const roomD = 45;
    const frontZ = 7.5;
    const centerZ = -15.0;
    const backZ = frontZ - roomD; // -37.5

    // Пол комнаты №3
    const floor3Body = new CANNON.Body({ mass: 0, material: this.matStandard });
    floor3Body.addShape(
      new CANNON.Box(new CANNON.Vec3(roomW / 2, 10, roomD / 2)),
    );
    floor3Body.position.set(0, this.floorY - 10, centerZ);
    this.addBody(floor3Body);

    // Внешние стены комнаты №3
    this.createPhysicsWall(-16, wallCenterY, centerZ, 1, wallH / 2, roomD / 2);
    this.createPhysicsWall(16, wallCenterY, centerZ, 1, wallH / 2, roomD / 2);
    this.createPhysicsWall(0, wallCenterY, backZ - 1, roomW / 2, wallH / 2, 1);

    // Фасад комнаты №3 с проёмом под стартовый лифт
    this.createPhysicsWall(-9.375, wallCenterY, frontZ, 5.625, wallH / 2, 0.1);
    this.createPhysicsWall(9.375, wallCenterY, frontZ, 5.625, wallH / 2, 0.1);

    // Черновая физика двух фигур.
    // Пока они статичные, чтобы проверить коллизии и масштаб.
    const cubeBody = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    cubeBody.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 1.2, 1.2)));
    cubeBody.position.set(-3.0, this.floorY + 1.2, -29.5);
    this.addBody(cubeBody);

    const cylApproxBody = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask:
        CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    // Пока цилиндр аппроксимируем коробкой для простоты.
    cylApproxBody.addShape(new CANNON.Box(new CANNON.Vec3(1.25, 1.3, 1.25)));
    cylApproxBody.position.set(3.0, this.floorY + 1.3, -29.5);
    this.addBody(cylApproxBody);
  }

  registerRoomElevator(elevator) {
    if (!elevator || !elevator.id) {
      console.warn("[ELEVATOR] Tried to register room elevator without id.");
      return null;
    }

    if (!this.roomElevators) {
      this.roomElevators = new Map();
    }

    const normalizedElevator = {
      id: elevator.id,

      // Номер сектора, к которому относится этот лифт.
      levelNumber: elevator.levelNumber ?? this.currentRoomId,

      // Роль лифта:
      // "start" -> показывает SECTOR XX
      // "exit"  -> до прохождения пустой
      elevatorRole: elevator.elevatorRole ?? "start",

      openState: elevator.openState ?? 0.0,

      targetOpenState: elevator.targetOpenState ?? 0.0,

      // Ось, вдоль которой разъезжаются створки: "x" или "z".
      slideAxis: elevator.slideAxis || "x",

      // Насколько далеко створки уходят в открытом состоянии.
      slideDistance: elevator.slideDistance ?? 3.4,

      // [{ mesh, body?, side, closedPosition }]
      // side: -1 для левой/нижней створки,
      // +1 для правой/верхней.
      leaves: elevator.leaves || [],

      glowMaterials: elevator.glowMaterials || [],

      // Материал экрана нужен,
      // чтобы потом менять пустой дисплей на NEXT XX.
      displayScreenMaterial: elevator.displayScreenMaterial || null,

      antMaterials: elevator.antMaterials || [],
    };

    this.roomElevators.set(normalizedElevator.id, normalizedElevator);

    return normalizedElevator;
  }

  setRoomElevatorOpen(id, isOpen) {
    if (!this.roomElevators) return;

    const elevator = this.roomElevators.get(id);
    if (!elevator) return;

    elevator.targetOpenState = isOpen ? 1.0 : 0.0;
  }

  openRoomElevator(id) {
    this.setRoomElevatorOpen(id, true);
  }

  closeRoomElevator(id) {
    this.setRoomElevatorOpen(id, false);
  }

  getRoomElevator(id) {
    if (!this.roomElevators) return null;
    return this.roomElevators.get(id) || null;
  }

  getRoomElevatorOpenState(id) {
    const elevator = this.getRoomElevator(id);
    return elevator ? elevator.openState : 0.0;
  }

  setRoomElevatorDisplay(id, label, levelNumber) {
    const elevator = this.getRoomElevator(id);

    if (!elevator || !elevator.displayScreenMaterial) {
      return;
    }

    const material = elevator.displayScreenMaterial;

    // Старая динамическая текстура
    const oldTexture = material.map;

    const newTexture = this.createElevatorLevelDisplayTexture(
      levelNumber,
      label,
    );

    material.map = newTexture;
    material.emissiveMap = newTexture;
    material.needsUpdate = true;

    if (oldTexture) {
      oldTexture.dispose();
    }
  }

  activateExitElevator(levelNumber) {
    if (!this.roomElevators) return null;

    // Находим выходной лифт именно текущего сектора.
    const exitElevator = [...this.roomElevators.values()].find(
      (elevator) =>
        elevator.elevatorRole === "exit" &&
        elevator.levelNumber === levelNumber,
    );

    if (!exitElevator) {
      console.warn(
        `[ELEVATOR] Exit elevator for sector ${levelNumber} not found.`,
      );

      return null;
    }

    const nextLevelNumber = levelNumber + 1;

    this.setRoomElevatorDisplay(exitElevator.id, "NEXT", nextLevelNumber);

    return exitElevator;
  }

  // === ЕДИНЫЙ API ДВЕРЕЙ ЛИФТОВ ===
  //
  // Все лифты создаются через createRoomElevator()
  // и хранятся в roomElevators.

  setElevatorOpen(id, isOpen) {
    this.setRoomElevatorOpen(id, isOpen);
  }

  openElevator(id) {
    this.setElevatorOpen(id, true);
  }

  closeElevator(id) {
    this.setElevatorOpen(id, false);
  }

  getElevatorOpenState(id) {
    return this.getRoomElevatorOpenState(id);
  }

  updateRoomElevators(dt, doorSpeed = 1.6) {
    if (!this.roomElevators || this.roomElevators.size === 0) return;
    this.elevatorDoorPulseTime += dt * 1.9;

    const doorGlowPulse =
      0.05 + 0.48 * (0.5 + 0.5 * Math.sin(this.elevatorDoorPulseTime));

    for (const elevator of this.roomElevators.values()) {
      elevator.openState = THREE.MathUtils.lerp(
        elevator.openState,
        elevator.targetOpenState,
        dt * doorSpeed,
      );

      const axis = elevator.slideAxis;
      const slideDistance = elevator.slideDistance;
      if (Array.isArray(elevator.glowMaterials)) {
        for (const mat of elevator.glowMaterials) {
          if (!mat) continue;
          mat.emissiveIntensity = doorGlowPulse;
        }
      }
      if (Array.isArray(elevator.antMaterials)) {
        for (const ant of elevator.antMaterials) {
          if (!ant || !ant.texture) continue;

          const speed = 0.65 * dt * (ant.direction ?? 1);

          if (ant.axis === "y") {
            ant.texture.offset.y = (ant.texture.offset.y + speed) % 1;
          } else {
            ant.texture.offset.x = (ant.texture.offset.x + speed) % 1;
          }

          if (ant.material) {
            ant.material.emissiveIntensity =
              0.85 +
              0.3 * (0.5 + 0.5 * Math.sin(this.elevatorDoorPulseTime * 1.4));
          }
        }
      }

      for (const leaf of elevator.leaves) {
        if (!leaf || !leaf.mesh) continue;

        const closedPosition = leaf.closedPosition;
        const side = leaf.side || 1;

        const nextPosition =
          closedPosition + side * slideDistance * elevator.openState;

        if (leaf.body) {
          leaf.body.position[axis] = nextPosition;
          leaf.body.aabbNeedsUpdate = true;
          leaf.mesh.position.copy(leaf.body.position);
        } else {
          leaf.mesh.position[axis] = nextPosition;
        }
      }
    }
  }

  updateDoors(dt) {
    // Общие обновления комнаты.
    this.syncPushableObjects();

    // Постоянная мягкая пульсация ячейки.
    this.updateRoom2SocketPulse(dt);

    this.updateRoom2Puzzle();

    // Единая скорость створок для всех универсальных лифтов.
    const doorSpeed = 1.6;

    this.updateRoomElevators(dt, doorSpeed);
  }

  buildLightingPanels(levelId = this.currentRoomId) {
    // В этих массивах должны находиться только светильники
    // текущей активной комнаты.
    this.sceneManager.corridorPanels = [];
    this.sceneManager.labPanels = [];

    const createLightPanel = (x, y, z, isCorridor = false) => {
      // Общий контейнер одного потолочного светильника.
      // Внутри него находятся и геометрия, и реальные источники света.
      // Благодаря этому весь светильник удаляется вместе с currentRoomGroup.
      const root = new THREE.Group();
      root.name = `Room${levelId}_Light_${x}_${z}`;
      root.position.set(x, y, z);

      root.userData = {
        intensity: isCorridor ? 1.0 : 0.0,
        isCorridor,
        isAnimating: false,
      };

      // === КОРПУС ===
      const housingGeo = new THREE.BoxGeometry(4.2, 0.2, 4.2);

      const housingMat = new THREE.MeshStandardMaterial({
        color: 0xd0d0d0,
        roughness: 0.6,
        metalness: 0.3,
      });

      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.set(0, -0.1, 0);
      housing.castShadow = false;
      housing.receiveShadow = true;

      root.add(housing);

      // === СВЕТЯЩИЙСЯ ДИФФУЗОР ===
      const diffuserGeo = new THREE.PlaneGeometry(3.8, 3.8);

      const diffuserMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        emissive: 0xffffff,
        emissiveIntensity: isCorridor ? 2.0 : 0.0,
        roughness: 0.6,
        metalness: 0.1,
      });

      const diffuser = new THREE.Mesh(diffuserGeo, diffuserMat);

      diffuser.rotation.x = Math.PI / 2;
      diffuser.position.set(0, -0.201, 0);

      root.add(diffuser);

      // === ОСНОВНОЙ СВЕТ ===
      const rectLight = new THREE.RectAreaLight(
        0xffffff,
        isCorridor ? 15.0 : 0.0,
        3.8,
        3.8,
      );

      rectLight.position.set(0, -0.21, 0);
      rectLight.rotation.x = -Math.PI / 2;
      rectLight.visible = isCorridor;

      root.add(rectLight);

      // === СВЕТ ДЛЯ ТЕНЕЙ ===
      const shadowLight = new THREE.SpotLight(0xffffff, isCorridor ? 3.0 : 0.0);

      shadowLight.position.set(0, -0.25, 0);
      shadowLight.angle = Math.PI / 3.5;
      shadowLight.penumbra = 1.0;
      shadowLight.decay = 1.5;
      shadowLight.distance = 40;

      shadowLight.castShadow = true;
      shadowLight.shadow.mapSize.set(1024, 1024);
      shadowLight.shadow.bias = -0.0001;
      shadowLight.visible = isCorridor;

      // Цель прожектора находится непосредственно под лампой.
      const targetObj = new THREE.Object3D();
      targetObj.position.set(0, -20, 0);

      root.add(targetObj);

      shadowLight.target = targetObj;

      root.add(shadowLight);

      // ВАЖНО:
      // светильник является частью текущей комнаты,
      // а не глобальной сцены.
      this.currentRoomGroup.add(root);

      return {
        group: root,
        diffuser,
        rectLight,
        shadowLight,
      };
    };

    // ==========================================
    // КОНФИГУРАЦИЯ СВЕТА КАЖДОГО СЕКТОРА
    // ==========================================

    let positions = [];

    if (levelId === 1) {
      positions = [
        { x: -7.5, z: 22.5 },
        { x: 7.5, z: 22.5 },
        { x: -7.5, z: 37.5 },
        { x: 7.5, z: 37.5 },
      ];
    }

    if (levelId === 2) {
      positions = [
        { x: -7.5, z: -7.5 },
        { x: 7.5, z: -7.5 },
        { x: -7.5, z: -30.0 },
        { x: 7.5, z: -30.0 },
      ];
    }

    if (levelId === 3) {
      // У третьего сектора свой независимый набор.
      // Сейчас нужны все четыре светильника.
      positions = [
        { x: -7.5, z: -7.5 },
        { x: 7.5, z: -7.5 },
        { x: -7.5, z: -30.0 },
        { x: 7.5, z: -30.0 },
      ];
    }

    positions.forEach((pos) => {
      this.sceneManager.corridorPanels.push(
        createLightPanel(pos.x, this.ceilingY, pos.z, true),
      );
    });
  }
}
