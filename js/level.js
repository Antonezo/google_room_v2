import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CONFIG } from "./config.js";
import { tileTex, tileNormalTex, tileRoughTex } from "./scene.js";

export class LevelBuilder {
  constructor(sceneManager, physicsManager) {
    this.sceneManager = sceneManager;
    this.physicsManager = physicsManager;
    this.world = physicsManager.world;
    this.scene = sceneManager.scene;

    // Ссылки на материалы для удобства
    this.matStandard = physicsManager.matStandard;
    this.matSlippery = physicsManager.matSlippery;

    // Параметры комнаты
    this.h = CONFIG.WORLD.ROOM_SIZE;
    this.w = CONFIG.WORLD.ROOM_SIZE;
    this.floorY = CONFIG.WORLD.FLOOR_LEVEL;
    this.ceilingY = CONFIG.WORLD.CEILING_HEIGHT;

    // === НОВАЯ СТРУКТУРА УРОВНЕЙ ===
    // Пока ничего не удаляем и не пересобираем.
    // Просто начинаем складывать объекты по категориям.
    this.currentRoomId = 1;

    this.rootGroup = new THREE.Group();
    this.rootGroup.name = "LevelRoot";
    this.scene.add(this.rootGroup);

    this.currentRoomGroup = new THREE.Group();
    this.currentRoomGroup.name = "CurrentRoom";

    this.elevatorGroup = new THREE.Group();
    this.elevatorGroup.name = "Elevator";

    this.staticLevelGroup = new THREE.Group();
    this.staticLevelGroup.name = "StaticLevel";

    this.rootGroup.add(this.currentRoomGroup);
    this.rootGroup.add(this.elevatorGroup);
    this.rootGroup.add(this.staticLevelGroup);

    this.currentRoomBodies = [];
    this.elevatorBodies = [];
    this.staticBodies = [];

    // Куда складывать следующий создаваемый объект.
    // Пока по умолчанию всё идёт в static, чтобы ничего не сломать.
    this.buildTarget = "static";
  }

  setBuildTarget(target) {
    // target: "room" | "elevator" | "static"
    this.buildTarget = target;
  }

  getBuildGroup() {
    if (this.buildTarget === "room") return this.currentRoomGroup;
    if (this.buildTarget === "elevator") return this.elevatorGroup;
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
    } else if (this.buildTarget === "elevator") {
      this.elevatorBodies.push(body);
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

  build() {
    // 1. Общее окружение: небо, базовый свет, декоративные группы.
    this.setBuildTarget("static");
    this.sceneManager.buildEnvironment();

    // 2. Лифт строится отдельно и остаётся постоянным между комнатами.
    this.setBuildTarget("elevator");
    this.buildElevatorCabinVisual();
    this.buildElevatorPhysics();

    // 3. Свет пока общий/статический.
    this.setBuildTarget("static");
    this.buildLightingPanels();

    // 4. Двери и рамы лифта отдельно.
    this.setBuildTarget("elevator");
    this.buildElevatorDoors();

    // 5. При старте строим только первую комнату.
    // Вторая комната больше НЕ создаётся сразу.
    this.buildRoom(1);

    // Возвращаем безопасный режим по умолчанию.
    this.setBuildTarget("static");
  }

  getBuildGroup() {
    if (this.buildTarget === "room") return this.currentRoomGroup;
    if (this.buildTarget === "elevator") return this.elevatorGroup;
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
    } else if (this.buildTarget === "elevator") {
      this.elevatorBodies.push(body);
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

          // ВАЖНО:
          // Текстуры пока не dispose-им, потому что они общие
          // и используются разными комнатами/объектами.
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
    // Удаляем только текущую комнату.
    // Лифт, двери, общие световые группы и окружение не трогаем.
    this.clearGroup(this.currentRoomGroup);
    this.clearBodies(this.currentRoomBodies);

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
    } else {
      console.warn(
        `[LEVEL] Unknown room id: ${levelId}. Falling back to room 1.`,
      );
      this.currentRoomId = 1;
      this.buildRoom1VisualWalls();
      this.buildRoom1Physics();
    }

    this.setBuildTarget("static");

    console.log(`[LEVEL] Room ${this.currentRoomId} built`);
  }

  // Полная и безопасная очистка текущих объектов уровня
  clearCurrentLevel() {
    // 1. Очистка физики Cannon.js
    if (this.levelObjects && this.levelObjects.length > 0) {
      this.levelObjects.forEach((obj) => {
        if (obj && obj.body) {
          this.world.removeBody(obj.body);
        }
      });
    }

    // 2. Очистка графики Three.js (освобождение GPU)
    if (this.levelGroup) {
      this.levelGroup.traverse((child) => {
        if (child.isMesh) {
          // Безопасно удаляем геометрию
          if (child.geometry) {
            child.geometry.dispose();
          }

          // Безопасно удаляем материалы (текстуры не трогаем, они глобальные!)
          if (child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => {
              if (m) m.dispose();
            });
          }
        }
      });
      this.scene.remove(this.levelGroup);
    }

    // 3. Сброс ссылок (важно для Garbage Collector)
    this.levelObjects = [];

    // Пересоздаем группу чистой
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
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

      // Текстурные стены чуть менее матовые.
      // Обычные полы/потолки/цветные поверхности делаем матовыми,
      // чтобы зелёный пол не выглядел глянцевым пластиком.
      roughness: useTileTexture ? 0.35 : 0.7,
      metalness: 0.0,
    });

    mat.needsUpdate = true;

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

  // --- ЭТАПЫ СТРОИТЕЛЬСТВА ---
  buildVisualWalls() {
    // Совместимость со старым кодом.
    // Если где-то случайно вызовется buildVisualWalls(),
    // он построит и первую комнату, и кабину лифта.
    this.setBuildTarget("room");
    this.buildRoom1VisualWalls();

    this.setBuildTarget("elevator");
    this.buildElevatorCabinVisual();

    this.setBuildTarget("static");
  }

  buildRoom1VisualWalls() {
    const roomW = 30;
    const roomD = 30;
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    const elW = 7.5; // Лифт: ширина 3 плитки
    const elH = 10.0; // Лифт: высота 4 плитки

    // Пол и потолок комнаты №1
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

    // Левая, правая, задняя стены комнаты №1
    this.addTiledWall(
      roomD,
      wallH,
      new THREE.Vector3(-15, wallCenterY, 30),
      new THREE.Vector3(0, Math.PI / 2, 0),
    );

    this.addTiledWall(
      roomD,
      wallH,
      new THREE.Vector3(15, wallCenterY, 30),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    );

    this.addTiledWall(
      roomW,
      wallH,
      new THREE.Vector3(0, wallCenterY, 45),
      new THREE.Vector3(0, Math.PI, 0),
    );

    // === ПЕРЕДНЯЯ СТЕНА КОМНАТЫ №1 С ПРОЁМОМ ПОД ЛИФТ ===
    const sideW = (roomW - elW) / 2;
    const leftX = -(elW / 2) - sideW / 2;
    const rightX = elW / 2 + sideW / 2;

    // Левая часть передней стены
    this.addTiledWall(
      sideW,
      wallH,
      new THREE.Vector3(leftX, wallCenterY, 15),
      new THREE.Vector3(0, 0, 0),
      0,
      0,
    );

    // Правая часть передней стены
    this.addTiledWall(
      sideW,
      wallH,
      new THREE.Vector3(rightX, wallCenterY, 15),
      new THREE.Vector3(0, 0, 0),
      1.25,
      0,
    );

    // Козырек над лифтом
    const topH = this.ceilingY - (this.floorY + elH);
    const topCenterY = this.floorY + elH + topH / 2;

    this.addTiledWall(
      elW,
      topH,
      new THREE.Vector3(0, topCenterY, 15),
      new THREE.Vector3(0, 0, 0),
      1.25,
      0,
    );
  }

  buildElevatorCabinVisual() {
    const elW = 7.5; // Лифт: ширина 3 плитки
    const elD = 7.5; // Лифт: глубина 3 плитки
    const elH = 10.0; // Лифт: высота 4 плитки
    const elCenterY = this.floorY + elH / 2;
    const elZ = 15 - elD / 2;

    // === КАБИНА ЛИФТА ===

    // Пол лифта
    this.addTiledWall(
      elW,
      elD,
      new THREE.Vector3(0, this.floorY, elZ),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
      1.25,
      0,
    );

    // Потолок лифта
    this.addTiledWall(
      elW,
      elD,
      new THREE.Vector3(0, this.floorY + elH, elZ),
      new THREE.Vector3(Math.PI / 2, 0, 0),
      1.25,
      0,
    );

    // Левая стенка лифта
    this.addTiledWall(
      elD,
      elH,
      new THREE.Vector3(-elW / 2, elCenterY, elZ),
      new THREE.Vector3(0, Math.PI / 2, 0),
    );

    // Правая стенка лифта
    this.addTiledWall(
      elD,
      elH,
      new THREE.Vector3(elW / 2, elCenterY, elZ),
      new THREE.Vector3(0, -Math.PI / 2, 0),
    );
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

    // ПОЛ второй комнаты
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.floorY, centerZ),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
      0,
      0,
      0x228b22
    );

    // ПОТОЛОК второй комнаты
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.ceilingY, centerZ),
      new THREE.Vector3(Math.PI / 2, 0, 0)
    );

    // ЛЕВАЯ СТЕНА
    this.addTiledWall(
      roomD,
      wallH,
      new THREE.Vector3(-15, wallCenterY, centerZ),
      new THREE.Vector3(0, Math.PI / 2, 0)
    );

    // ПРАВАЯ СТЕНА
    this.addTiledWall(
      roomD,
      wallH,
      new THREE.Vector3(15, wallCenterY, centerZ),
      new THREE.Vector3(0, -Math.PI / 2, 0)
    );

    // ДАЛЬНЯЯ СТЕНА
    this.addTiledWall(
      roomW,
      wallH,
      new THREE.Vector3(0, wallCenterY, backZ),
      new THREE.Vector3(0, 0, 0)
    );

    // ПЕРЕДНЯЯ СТЕНА С ПРОЁМОМ ПОД СТАРТОВЫЙ ЛИФТ
    const elW = 7.5;
    const sideW = (roomW - elW) / 2;
    const leftX = -(elW / 2) - (sideW / 2);
    const rightX = (elW / 2) + (sideW / 2);

    // Из-за поворота Math.PI UV идут зеркально относительно первой комнаты,
    // поэтому смещение ставим на левую часть, а не на правую.
    this.addTiledWall(
      sideW,
      wallH,
      new THREE.Vector3(leftX, wallCenterY, frontZ),
      new THREE.Vector3(0, Math.PI, 0),
      1.25,
      0
    );

    this.addTiledWall(
      sideW,
      wallH,
      new THREE.Vector3(rightX, wallCenterY, frontZ),
      new THREE.Vector3(0, Math.PI, 0),
      0,
      0
    );

    const elH = 10.0;
    const topH = wallH - elH;
    const topCenterY = this.floorY + elH + topH / 2;

    this.addTiledWall(
      elW,
      topH,
      new THREE.Vector3(0, topCenterY, frontZ),
      new THREE.Vector3(0, Math.PI, 0),
      1.25,
      0
    );

    // Временный финальный лифт/выход уровня 2.
    // Ставим на правой стене ближе к дальнему углу.
    this.buildRoom2ExitElevatorVisual();
  }

buildRoom2ExitElevatorVisual() {
    // Временный финальный лифт уровня 2.
    // Пока это только визуальная дверь/рама на правой стене.
    // Позже сделаем полноценные створки и привяжем к переходу на уровень 3.

    const exitX = 14.92;      // Правая стена комнаты
    const exitZ = -31.0;      // Почти в дальнем правом углу, но не вплотную
    const doorW = 7.5;
    const doorH = 10.0;
    const doorY = this.floorY + doorH / 2;

    const group = new THREE.Group();
    group.name = "Room2ExitElevatorVisual";
    group.position.set(0, 0, 0);

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.8,
      metalness: 0.0,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.45,
      metalness: 0.7,
    });

    // Чёрная "глубина" двери на правой стене.
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, doorH, doorW),
      darkMat
    );
    doorPanel.position.set(exitX, doorY, exitZ);
    doorPanel.castShadow = false;
    doorPanel.receiveShadow = true;
    group.add(doorPanel);

    // Вертикальные стойки рамы
    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, doorH, 0.35),
      frameMat
    );
    frameLeft.position.set(exitX - 0.08, doorY, exitZ - doorW / 2);
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, doorH, 0.35),
      frameMat
    );
    frameRight.position.set(exitX - 0.08, doorY, exitZ + doorW / 2);
    group.add(frameRight);

    // Верхняя перемычка рамы
    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.35, doorW + 0.5),
      frameMat
    );
    frameTop.position.set(exitX - 0.08, this.floorY + doorH, exitZ);
    group.add(frameTop);

    // Нижний порожек
    const frameBottom = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.25, doorW + 0.5),
      frameMat
    );
    frameBottom.position.set(exitX - 0.08, this.floorY + 0.12, exitZ);
    group.add(frameBottom);

    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

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

  buildPhysicsBoundaries() {
    // Совместимость со старым кодом:
    // пока физика всех частей всё ещё строится сразу,
    // но уже разнесена по методам и buildTarget.
    this.buildRoom1Physics();
    this.buildRoom2Physics();
    this.buildElevatorPhysics();

    this.setBuildTarget("static");
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
    floor2Body.addShape(new CANNON.Box(new CANNON.Vec3(roomW / 2, 10, roomD / 2)));
    floor2Body.position.set(0, this.floorY - 10, centerZ);
    this.addBody(floor2Body);

    // Внешние стены комнаты №2
    this.createPhysicsWall(-16, wallCenterY, centerZ, 1, wallH / 2, roomD / 2); // Левая
    this.createPhysicsWall(16, wallCenterY, centerZ, 1, wallH / 2, roomD / 2);  // Правая
    this.createPhysicsWall(0, wallCenterY, backZ - 1, roomW / 2, wallH / 2, 1); // Дальняя

    // Фасад комнаты №2 с проёмом под стартовый лифт, Z = 7.5
    this.createPhysicsWall(-9.375, wallCenterY, frontZ, 5.625, wallH / 2, 0.1);
    this.createPhysicsWall(9.375, wallCenterY, frontZ, 5.625, wallH / 2, 0.1);
  }

  buildElevatorPhysics() {
    this.setBuildTarget("elevator");

    // === ФИЗИКА ЛИФТА / СОЕДИНИТЕЛЬНОГО МОСТИКА ===

    // Пол лифта
    const floorElevBody = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
    });
    floorElevBody.addShape(new CANNON.Box(new CANNON.Vec3(3.75, 10, 3.75)));
    floorElevBody.position.set(0, this.floorY - 10, 11.25);
    this.addBody(floorElevBody);

    // Внутренние стенки шахты лифта
    const elCenterY = this.floorY + 5;

    this.createPhysicsWall(-4.75, elCenterY, 11.25, 0.1, 5, 3.75); // Левая
    this.createPhysicsWall(4.75, elCenterY, 11.25, 0.1, 5, 3.75); // Правая
    this.createPhysicsWall(0, this.floorY + 11, 11.25, 3.75, 1, 3.75); // Потолок шахты
  }

  buildElevatorDoors() {
    const doorW = 3.8;
    const doorH = 10.0;
    const doorD = 0.4;
    const doorY = this.floorY + doorH / 2;

    const zEntrance = 14.3;
    const zExit = 8.2;

    const doorMat = new THREE.MeshStandardMaterial({
  // Не абсолютно чёрный, чтобы дверь не сливалась с пустотой,
  // но достаточно тёмный для технического лифта.
  color: 0x202426,
  roughness: 0.55,
  metalness: 0.35,
});

const seamMat = new THREE.MeshStandardMaterial({
  color: 0x121517,
  roughness: 0.8,
  metalness: 0.15,
});

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.9,
    });

    // Матовый черный материал для "бездонной пустоты" (не отражает свет!)
    const shaftMat = new THREE.MeshStandardMaterial({
  color: 0x101214,
  roughness: 0.85,
  metalness: 0.2,
});

    const createFrame = (zPos) => {
      const frameGroup = new THREE.Group();

      const buildHalfFrame = (zOffset) => {
        const left = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 10, 0.3),
          frameMat,
        );
        left.position.set(-3.75, doorY, zOffset);

        const right = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 10, 0.3),
          frameMat,
        );
        right.position.set(3.75, doorY, zOffset);

        // ТОНКАЯ ВЕРХНЯЯ РЕЛЬСА (Высота всего 0.1)
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(8.1, 0.1, 0.3),
          frameMat,
        );
        top.position.set(0, doorY + 4.95, zOffset);

        // ТОНКАЯ НИЖНЯЯ РЕЛЬСА (Высота всего 0.1)
        const bottom = new THREE.Mesh(
          new THREE.BoxGeometry(8.1, 0.1, 0.3),
          frameMat,
        );
        bottom.position.set(0, this.floorY + 0.05, zOffset);

        [left, right, top, bottom].forEach((m) => {
          m.castShadow = true;
          m.receiveShadow = true;
          frameGroup.add(m);
        });
      };

      // Два контура (передний и задний)
      buildHalfFrame(zPos + 0.4);
      buildHalfFrame(zPos - 0.4);

      // === ИЛЛЮЗИЯ ШАХТЫ (ЧЕРНАЯ ПУСТОТА) ===

      // 1. Дыра в полу (прячет белый пол между рельсами)
      const floorHole = new THREE.Mesh(
        new THREE.BoxGeometry(16.0, 0.08, 0.5),
        shaftMat,
      );
      floorHole.position.set(0, this.floorY + 0.04, zPos);
      frameGroup.add(floorHole);

      // 2. Дыра в потолке (прячет синий потолок комнаты между верхними рельсами)
      const ceilingHole = new THREE.Mesh(
        new THREE.BoxGeometry(16.0, 0.08, 0.5),
        shaftMat,
      );
      ceilingHole.position.set(0, doorY + 4.95, zPos);
      frameGroup.add(ceilingHole);

      // 3. Боковые карманы (куда уезжают двери, чтобы не проваливаться в стену)
      const leftPocket = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 9.8, 0.5),
        shaftMat,
      );
      leftPocket.position.set(-5.8, doorY, zPos);
      frameGroup.add(leftPocket);

      const rightPocket = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 9.8, 0.5),
        shaftMat,
      );
      rightPocket.position.set(5.8, doorY, zPos);
      frameGroup.add(rightPocket);

      this.scene.add(frameGroup);
      return frameGroup;
    };

    // Создаем рамы
    this.entranceFrame = createFrame(zEntrance);
    this.exitFrame = createFrame(zExit);

 const createDoorLeaf = (side, zPos) => {
const mesh = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorD), doorMat);
mesh.castShadow = true;
mesh.receiveShadow = true;

// Это не обычная плиточная стена, а дверь лифта.
// Камера должна видеть её как препятствие,
// но атмосфера/плиточные текстуры не должны её перекрашивать.
mesh.userData.skipWallMaterialUpdate = true;

// === ЧЁРНАЯ "РЕЗИНОВАЯ" ВСТАВКА НА ВНУТРЕННЕМ КРАЕ СТВОРКИ ===
// Она закрывает серый торец двери и даёт полноценный шов.
// Состоит из:
// 1) торцевой чёрной вставки;
// 2) тонкой накладки с лицевой стороны;
// 3) тонкой накладки с обратной стороны.
const seamWidth = 0.08;
const seamHeight = doorH + 0.02;
const seamThickness = 0.012;

// Поддержка и для числового side (-1 / 1), и для строкового ("left" / "right")
const isLeftLeaf = side === -1 || side === "left";

// Внутренний край створки.
// Для левой створки это правый край, для правой — левый.
const innerEdgeX = isLeftLeaf ? doorW / 2 : -doorW / 2;

// Направление наружу от внутреннего края створки.
const edgeDir = isLeftLeaf ? 1 : -1;

// 1. Чёрная торцевая вставка.
// Ставим её чуть СНАРУЖИ серого торца, чтобы не было z-fighting.
const edgeCapThickness = 0.035;
const edgeCap = new THREE.Mesh(
  new THREE.BoxGeometry(edgeCapThickness, seamHeight, doorD + 0.02),
  seamMat
);

edgeCap.position.set(
  innerEdgeX + edgeDir * (edgeCapThickness / 2 + 0.002),
  0,
  0
);

edgeCap.castShadow = true;
edgeCap.receiveShadow = true;
mesh.add(edgeCap);

// 2. Тонкие накладки на лицевой и обратной стороне.
// Они дают видимый центральный шов, когда двери закрыты.
const seamOffsetZ = doorD / 2 + seamThickness / 2 + 0.003;

const createSeamStrip = (zOffset) => {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(seamWidth, seamHeight, seamThickness),
    seamMat
  );

  strip.position.set(
    innerEdgeX - edgeDir * (seamWidth / 2 - 0.01),
    0,
    zOffset
  );

  strip.castShadow = true;
  strip.receiveShadow = true;

  mesh.add(strip);
};

createSeamStrip(seamOffsetZ);
createSeamStrip(-seamOffsetZ);

this.scene.add(mesh);

  // Дверь должна быть препятствием не только для физики,
  // но и для камеры. Иначе камерой можно заглядывать внутрь закрытого лифта.
if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
  this.sceneManager.walls.push({
    mesh,
    isElevatorDoor: true,
    skipMaterialUpdate: true,
  });
}

  const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC,
        material: this.matStandard,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
        collisionFilterMask:
          CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
      });
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(doorW / 2, doorH / 2, doorD / 2)),
      );

      body.position.set(side === "left" ? -doorW / 2 : doorW / 2, doorY, zPos);

      this.world.addBody(body);
      return { mesh, body };
    };

    this.entranceLeft = createDoorLeaf("left", zEntrance);
    this.entranceRight = createDoorLeaf("right", zEntrance);
    this.exitLeft = createDoorLeaf("left", zExit);
    this.exitRight = createDoorLeaf("right", zExit);

    this.entranceSolidWall = this.addTiledWall(
      7.5,
      10.0,
      new THREE.Vector3(0, doorY, zEntrance),
      new THREE.Vector3(0, 0, 0),
      1.25,
      0,
    );
    this.exitSolidWall = this.addTiledWall(
      7.5,
      10.0,
      new THREE.Vector3(0, doorY, zExit),
      new THREE.Vector3(0, 0, 0),
      1.25,
      0,
    );

    this.entranceOpenState = 0.0;
    this.targetEntranceOpenState = 0.0;
    this.exitOpenState = 0.0;
    this.targetExitOpenState = 0.0;

    this.setElevatorMode("entering");
  }

  setElevatorMode(mode) {
    if (mode === "entering") {
      // Игрок заходит: Входные двери и их рама видны. Передняя стена — белая и чистая.
      this.entranceLeft.mesh.visible = true;
      this.entranceRight.mesh.visible = true;
      this.entranceFrame.visible = true; // Включаем раму входа
      this.entranceSolidWall.visible = false;

      this.exitLeft.mesh.visible = false;
      this.exitRight.mesh.visible = false;
      this.exitFrame.visible = false; // Выключаем раму выхода!
      this.exitSolidWall.visible = true;
    } else if (mode === "exiting") {
      // Игрок выезжает: Задняя стена — белая и чистая. Выходные двери и их рама видны.
      this.entranceLeft.mesh.visible = false;
      this.entranceRight.mesh.visible = false;
      this.entranceFrame.visible = false; // Выключаем раму входа!
      this.entranceSolidWall.visible = true;

      this.exitLeft.mesh.visible = true;
      this.exitRight.mesh.visible = true;
      this.exitFrame.visible = true; // Включаем раму выхода
      this.exitSolidWall.visible = false;
    }
  }

  buildElevatorLight() {
    const elZ = 11.25;
    const ceilingY = this.floorY + 10.0; // Это уровень 2.5

    // 1. Делаем лампу тонким БОКСОМ (толщина 0.1), чтобы не было мерцания
    const lampGeo = new THREE.BoxGeometry(3.5, 0.1, 3.5);
    this.elevatorLampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0,
      roughness: 0.1,
    });

    const lampMesh = new THREE.Mesh(lampGeo, this.elevatorLampMat);
    // Опускаем чуть ниже (на 0.05), чтобы бокс не касался потолка
    lampMesh.position.set(0, ceilingY - 0.05, elZ);
    this.scene.add(lampMesh);

    // 2. Источник света (PointLight)
    this.elevatorLight = new THREE.PointLight(0xfff0dd, 0, 15);
    this.elevatorLight.position.set(0, ceilingY - 0.5, elZ);
    this.elevatorLight.castShadow = true;
    this.elevatorLight.shadow.bias = -0.001;
    this.scene.add(this.elevatorLight);
  }

  openEntrance() {
    this.targetEntranceOpenState = 1.0;
  }
  closeEntrance() {
    this.targetEntranceOpenState = 0.0;
  }

  openExit() {
    this.targetExitOpenState = 1.0;
  }
  closeExit() {
    this.targetExitOpenState = 0.0;
  }

  updateDoors(dt) {
    if (!this.entranceLeft) return;

    // Скорость дверей.
    // Раньше updateDoors(dt) случайно вызывался дважды за кадр,
    // поэтому 1.6 примерно возвращает прежнее ощущение скорости, но уже правильно.
    const doorSpeed = 1.6;

    this.entranceOpenState = THREE.MathUtils.lerp(
      this.entranceOpenState,
      this.targetEntranceOpenState,
      dt * doorSpeed,
    );

    this.exitOpenState = THREE.MathUtils.lerp(
      this.exitOpenState,
      this.targetExitOpenState,
      dt * doorSpeed,
    );

  const closedX = 1.9;

// Створки не должны полностью растворяться в чёрных карманах.
// 5.25 оставляет небольшой видимый край двери, будто она заехала в паз.
const openX = 5.25;

    // --- ДВИГАЕМ ВХОДНЫЕ ДВЕРИ ---
    const entOffset = closedX + (openX - closedX) * this.entranceOpenState;
    this.entranceLeft.body.position.x = -entOffset;
    this.entranceRight.body.position.x = entOffset;
    this.entranceLeft.mesh.position.copy(this.entranceLeft.body.position);
    this.entranceRight.mesh.position.copy(this.entranceRight.body.position);

    // --- ДВИГАЕМ ВЫХОДНЫЕ ДВЕРИ ---
    const exitOffset = closedX + (openX - closedX) * this.exitOpenState;
    this.exitLeft.body.position.x = -exitOffset;
    this.exitRight.body.position.x = exitOffset;
    this.exitLeft.mesh.position.copy(this.exitLeft.body.position);
    this.exitRight.mesh.position.copy(this.exitRight.body.position);
  }

  buildLightingPanels() {
    this.sceneManager.corridorPanels = [];
    this.sceneManager.labPanels = [];

    const createLightPanel = (x, y, z, isCorridor = false) => {
      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.userData = {
        intensity: isCorridor ? 1.0 : 0.0,
        isCorridor: isCorridor,
        isAnimating: false,
      };

      const housingGeo = new THREE.BoxGeometry(4.2, 0.2, 4.2);
      const housingMat = new THREE.MeshStandardMaterial({
        color: 0xd0d0d0,
        roughness: 0.6,
        metalness: 0.3,
      });
      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.y = -0.1;
      group.add(housing);

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
      diffuser.position.y = -0.201;
      group.add(diffuser);

      this.scene.add(group);

      const rectLight = new THREE.RectAreaLight(
        0xffffff,
        isCorridor ? 15.0 : 0.0,
        3.8,
        3.8,
      );
      rectLight.position.set(x, y - 0.21, z);
      rectLight.lookAt(x, -10, z);
      rectLight.visible = isCorridor;
      this.scene.add(rectLight);

      const shadowLight = new THREE.SpotLight(0xffffff, isCorridor ? 3.0 : 0.0);
      shadowLight.position.set(x, y - 0.25, z);
      shadowLight.angle = Math.PI / 3.5;
      shadowLight.penumbra = 1.0;
      shadowLight.decay = 1.5;
      shadowLight.distance = 40;
      shadowLight.castShadow = true;
      shadowLight.shadow.mapSize.set(1024, 1024);
      shadowLight.shadow.bias = -0.0001;
      shadowLight.visible = isCorridor;

      const targetObj = new THREE.Object3D();
      targetObj.position.set(x, -10, z);
      this.scene.add(targetObj);
      shadowLight.target = targetObj;
      this.scene.add(shadowLight);

      return { group, diffuser, rectLight, shadowLight };
    };

    // Позиции для ПЕРВОЙ комнаты (Белой)
    const room1Pos = [
      { x: -7.5, z: 22.5 },
      { x: 7.5, z: 22.5 },
      { x: -7.5, z: 37.5 },
      { x: 7.5, z: 37.5 },
    ];

   // Позиции для ВТОРОЙ комнаты.
// Комната 2 теперь длиннее: от z = 7.5 до z = -37.5.
// Поэтому лампы ставим симметрично:
// передний ряд на z = 0 — 7.5 метров от передней стены,
// дальний ряд на z = -30 — 7.5 метров от дальней стены.
const room2Pos = [
  { x: -7.5, z: 0 },    { x: 7.5, z: 0 },
  { x: -7.5, z: -30 },  { x: 7.5, z: -30 }
];

    // Запускаем создание ламп для обеих комнат
    // Передаем true в конце, чтобы свет был включен (isCorridor = true)
    room1Pos.forEach((pos) =>
      this.sceneManager.corridorPanels.push(
        createLightPanel(pos.x, this.ceilingY, pos.z, true),
      ),
    );
    room2Pos.forEach((pos) =>
      this.sceneManager.corridorPanels.push(
        createLightPanel(pos.x, this.ceilingY, pos.z, true),
      ),
    );
  }
}
