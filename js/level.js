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

  roughness: useTileTexture ? 0.35 : 0.7,
  metalness: 0.0,

  // Убирает "мыльные кольца" / ступеньки на плавных градиентах освещения
  dithering: true,
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
  const elW = 7.5;   // ширина кабины
  const elD = 5.0;   // глубина кабины
  const elH = 10.0;  // высота кабины

  const elCenterY = this.floorY + elH / 2;
  const elZ = 11.25;

  // === МАТЕРИАЛЫ КАБИНЫ ЛИФТА ===

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x6f777c,   // серо-синий матовый металл
    roughness: 0.58,
    metalness: 0.32,
  });

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x4b5256,   // пол чуть темнее стен
    roughness: 0.72,
    metalness: 0.22,
  });

  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x1c2730,   // графитовый потолок
    roughness: 0.65,
    metalness: 0.2,
  });

const createPanel = (geometry, position, rotation, material, cameraWall = true) => {
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.copy(position);

  if (rotation) {
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  }

  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.skipWallMaterialUpdate = true;

  this.registerMesh(mesh);

  // Эти металлические панели больше не создаются через createWallMesh(),
  // поэтому вручную добавляем их в список стен для камеры.
  // Иначе камера считает их просто декором и может вылетать наружу.
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

  // === КАБИНА ЛИФТА ===

  // Пол
  createPanel(
    new THREE.PlaneGeometry(elW, elD),
    new THREE.Vector3(0, this.floorY + 0.01, elZ),
    new THREE.Vector3(-Math.PI / 2, 0, 0),
    floorMat
  );

  // Потолок
  createPanel(
    new THREE.PlaneGeometry(elW, elD),
    new THREE.Vector3(0, this.floorY + elH - 0.01, elZ),
    new THREE.Vector3(Math.PI / 2, 0, 0),
    ceilingMat
  );

  // Левая стенка
  createPanel(
    new THREE.PlaneGeometry(elD, elH),
    new THREE.Vector3(-elW / 2, elCenterY, elZ),
    new THREE.Vector3(0, Math.PI / 2, 0),
    wallMat
  );

  // Правая стенка
  createPanel(
    new THREE.PlaneGeometry(elD, elH),
    new THREE.Vector3(elW / 2, elCenterY, elZ),
    new THREE.Vector3(0, -Math.PI / 2, 0),
    wallMat
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

// ПРАВАЯ СТЕНА С ПРОЁМОМ ПОД ФИНАЛЬНЫЙ ЛИФТ 2 → 3
// Правая стена идёт вдоль оси Z.
// Чтобы плитка не "сбрасывалась" на каждом отдельном куске,
// задаём UV-смещения так, будто это одна цельная стена от backZ до frontZ.
const exitDoorZ = -31.15;
const exitDoorW = 7.5;
const exitDoorH = 10.0;

const exitDoorZMin = exitDoorZ - exitDoorW / 2; // -34.75
const exitDoorZMax = exitDoorZ + exitDoorW / 2; // -27.25

// Небольшой нахлёст под раму двери.
// Он прячет микротрещины между отдельными плоскостями стены и рамой.
const wallSeamOverlap = 0.04;

// Общая UV-точка отсчёта для всей правой стены.
// Условно считаем, что вся правая стена начинается от backZ.
const rightWallUvBaseZ = backZ;

// === Кусок стены от стартовой стороны комнаты до проёма ===
const rightWallFrontStartZ = exitDoorZMax - wallSeamOverlap;
const rightWallFrontEndZ = frontZ;
const rightWallFrontLen = rightWallFrontEndZ - rightWallFrontStartZ;
const rightWallFrontCenterZ = (rightWallFrontEndZ + rightWallFrontStartZ) / 2;

// UV-смещение по горизонтали, чтобы плитка продолжала общую сетку стены.
const rightWallFrontUvX = rightWallFrontStartZ - rightWallUvBaseZ;

this.addTiledWall(
  rightWallFrontLen,
  wallH,
  new THREE.Vector3(15, wallCenterY, rightWallFrontCenterZ),
  new THREE.Vector3(0, -Math.PI / 2, 0),
  rightWallFrontUvX,
  0
);

// === Кусок стены от проёма до дальней стены ===
const rightWallBackStartZ = backZ;
const rightWallBackEndZ = exitDoorZMin + wallSeamOverlap;
const rightWallBackLen = rightWallBackEndZ - rightWallBackStartZ;
const rightWallBackCenterZ = (rightWallBackEndZ + rightWallBackStartZ) / 2;

const rightWallBackUvX = rightWallBackStartZ - rightWallUvBaseZ;

this.addTiledWall(
  rightWallBackLen,
  wallH,
  new THREE.Vector3(15, wallCenterY, rightWallBackCenterZ),
  new THREE.Vector3(0, -Math.PI / 2, 0),
  rightWallBackUvX,
  0
);

// === Верхняя перемычка над проёмом ===
const exitTopH = wallH - exitDoorH;
const exitTopCenterY = this.floorY + exitDoorH + exitTopH / 2;

// Перемычка занимает участок от exitDoorZMin до exitDoorZMax.
// Делаем её чуть шире, чтобы края ушли под чёрную раму.
const exitTopLen = exitDoorW + wallSeamOverlap * 2;
const exitTopUvX = exitDoorZMin - wallSeamOverlap - rightWallUvBaseZ;

// UV по Y тоже сдвигаем на высоту двери,
// чтобы плитка над проёмом продолжала вертикальную сетку стены,
// а не начиналась заново от нижнего края перемычки.
const exitTopUvY = exitDoorH;

this.addTiledWall(
  exitTopLen,
  exitTopH,
  new THREE.Vector3(15, exitTopCenterY, exitDoorZ),
  new THREE.Vector3(0, -Math.PI / 2, 0),
  exitTopUvX,
  exitTopUvY
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
    // Финальный лифт уровня 2.
    // Пока это отдельная система дверей, не связанная с центральным лифтом.
    // Лифт стоит на правой стене, поэтому створки разъезжаются вдоль оси Z.

    const exitX = 14.55;      // Правая стена комнаты
    const exitZ = -31.35;      // Ближе к дальнему правому углу
    // ВАЖНО:
// doorTotalW — это ширина самих створок/внутреннего проёма.
// Снаружи к ней ещё добавляется рама.
// Чтобы ВЕСЬ лифт вместе с рамой занимал ровно 3 плитки = 7.5,
// сами створки делаем чуть уже.
const doorTotalW = 7.5; // ровно 3 плитки, как у центрального лифта
    const doorH = 10.0;
    const doorD = 0.35;
    const doorY = this.floorY + doorH / 2;

    const group = new THREE.Group();
    group.name = "Room2ExitElevatorVisual";

    const doorMat = new THREE.MeshStandardMaterial({
      color:  0xdcdcdc,
      roughness: 0.55,
      metalness: 0.35,
    });

    const seamMat = new THREE.MeshStandardMaterial({
      color: 0x101214, 
      roughness: 0.85,
      metalness: 0.15,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x333333, 
      roughness: 0.45,
      metalness: 0.7,
    });

    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x050505,  
      roughness: 0.9,
      metalness: 0.0,
    });

   // === МЕТАЛЛИЧЕСКАЯ КАБИНА ФИНАЛЬНОГО ЛИФТА 2 → 3 ===
// Лифт стоит на правой стене, поэтому глубина кабины идёт по оси X.

const cabinDepth = 5.0;
const cabinW = doorTotalW;
const cabinH = doorH;

const cabinCenterX = exitX + cabinDepth / 2;
const cabinBackX = exitX + cabinDepth;
const cabinY = doorY;

const cabinWallMat = new THREE.MeshStandardMaterial({
  color: 0x6f777c, 
  roughness: 0.58,
  metalness: 0.32,
});

const cabinFloorMat = new THREE.MeshStandardMaterial({
  color: 0x4b5256, 
  roughness: 0.72,
  metalness: 0.22,
});

const cabinCeilingMat = new THREE.MeshStandardMaterial({
  color: 0x1c2730,
  roughness: 0.65,
  metalness: 0.2,
});

const addCameraWall = (mesh) => {
  if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
    this.sceneManager.walls.push({
      mesh,
      isElevatorCabinWall: true,
      skipMaterialUpdate: true,
    });
  }
};

const addCabinBox = (
  name,
  geometry,
  position,
  material,
  cameraWall = true
) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.skipWallMaterialUpdate = true;

  group.add(mesh);

  if (cameraWall) {
    addCameraWall(mesh);
  }

  return mesh;
};

// Пол кабины
addCabinBox(
  "Room2ExitElevatorFloor",
  new THREE.BoxGeometry(cabinDepth, 0.08, cabinW),
  new THREE.Vector3(cabinCenterX, this.floorY + 0.04, exitZ),
  cabinFloorMat,
  false
);

// Потолок кабины
addCabinBox(
  "Room2ExitElevatorCeiling",
  new THREE.BoxGeometry(cabinDepth, 0.08, cabinW),
  new THREE.Vector3(cabinCenterX, this.floorY + cabinH - 0.04, exitZ),
  cabinCeilingMat,
  true
);

// Нижняя/верхняя боковая стенка кабины по Z
addCabinBox(
  "Room2ExitElevatorSideA",
  new THREE.BoxGeometry(cabinDepth, cabinH, 0.08),
  new THREE.Vector3(cabinCenterX, cabinY, exitZ - cabinW / 2),
  cabinWallMat,
  true
);

addCabinBox(
  "Room2ExitElevatorSideB",
  new THREE.BoxGeometry(cabinDepth, cabinH, 0.08),
  new THREE.Vector3(cabinCenterX, cabinY, exitZ + cabinW / 2),
  cabinWallMat,
  true
);

// Задняя стенка кабины
addCabinBox(
  "Room2ExitElevatorBackWall",
  new THREE.BoxGeometry(0.08, cabinH, cabinW),
  new THREE.Vector3(cabinBackX, cabinY, exitZ),
  cabinWallMat,
  true
);

// === РАМА И ДВЕРИ ФИНАЛЬНОГО ЛИФТА 2 → 3 ===
// Копируем размеры центрального лифта, только разворачиваем систему на правую стену.
// У центрального лифта: ширина 7.5, две створки по 3.75,
// верх/низ тонкие, боковые стойки толще.

const frameX = exitX - 0.12;
const doorX = exitX - 0.08;

const frameW = 7.5;      // вся ширина лифта = 3 плитки
const leafW = frameW / 2; // каждая створка = половина проёма
const frameSideW = 0.6;  // как боковые стойки центрального лифта
const frameThinH = 0.1;  // тонкий верх/низ, как у центрального лифта

// Верхняя тонкая планка
const frameTop = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, frameThinH, frameW),
  frameMat
);
frameTop.position.set(frameX, this.floorY + doorH - frameThinH / 2, exitZ);
group.add(frameTop);

// Нижняя тонкая планка
const frameBottom = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, frameThinH, frameW),
  frameMat
);
frameBottom.position.set(frameX, this.floorY + frameThinH / 2, exitZ);
group.add(frameBottom);

// Левая боковая стойка
const frameA = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, doorH, frameSideW),
  frameMat
);
frameA.position.set(frameX, doorY, exitZ - frameW / 2 + frameSideW / 2);
group.add(frameA);

// Правая боковая стойка
const frameB = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, doorH, frameSideW),
  frameMat
);
frameB.position.set(frameX, doorY, exitZ + frameW / 2 - frameSideW / 2);
group.add(frameB);

const createExitLeaf = (side) => {
  // side: -1 нижняя/левая по Z створка, 1 верхняя/правая по Z створка
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(doorD, doorH, leafW),
    doorMat
  );

  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leaf.userData.skipWallMaterialUpdate = true;

  // Закрытое положение: створки ровно сходятся в центре.
  const closedZ = exitZ + side * (leafW / 2);
  leaf.position.set(doorX, doorY, closedZ);

  // Центральный резиновый шов, как у остальных лифтов.
  const seamThickness = 0.04;
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(doorD + 0.03, doorH + 0.02, seamThickness),
    seamMat
  );

  seam.position.set(
    0,
    0,
    -side * (leafW / 2 + seamThickness / 2 + 0.002)
  );

  seam.castShadow = true;
  seam.receiveShadow = true;
  leaf.add(seam);

  group.add(leaf);

  return {
    mesh: leaf,
    side,
    closedZ,
  };
};

this.room2ExitDoorA = createExitLeaf(-1);
this.room2ExitDoorB = createExitLeaf(1);

    this.room2ExitOpenState = 0.0;
    this.targetRoom2ExitOpenState = 0.0;

    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.room2ExitElevatorGroup = group;
    this.registerMesh(group);
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

    // Пол уровня 3 — пока другой цвет, чтобы отличать комнату от уровня 2.
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.floorY, centerZ),
      new THREE.Vector3(-Math.PI / 2, 0, 0),
      0,
      0,
      0x34495e
    );

    // Потолок
    this.addTiledWall(
      roomW,
      roomD,
      new THREE.Vector3(0, this.ceilingY, centerZ),
      new THREE.Vector3(Math.PI / 2, 0, 0)
    );

    // Левая стена
    this.addTiledWall(
      roomD,
      wallH,
      new THREE.Vector3(-15, wallCenterY, centerZ),
      new THREE.Vector3(0, Math.PI / 2, 0)
    );

    // Правая стена
    this.addTiledWall(
      roomD,
      wallH,
      new THREE.Vector3(15, wallCenterY, centerZ),
      new THREE.Vector3(0, -Math.PI / 2, 0)
    );

    // Дальняя стена
    this.addTiledWall(
      roomW,
      wallH,
      new THREE.Vector3(0, wallCenterY, backZ),
      new THREE.Vector3(0, 0, 0)
    );

    // Передняя стена с проёмом под стартовый лифт
    const elW = 7.5;
    const sideW = (roomW - elW) / 2;
    const leftX = -(elW / 2) - sideW / 2;
    const rightX = elW / 2 + sideW / 2;

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

    // === НИША НА ДАЛЬНЕЙ СТЕНЕ ===
    this.buildRoom3NicheVisual();
    this.buildRoom3DraftFiguresVisual();
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
      nicheMat
    );
    nicheBack.position.set(0, nicheY, backZ);
    group.add(nicheBack);

    // Рама вокруг ниши
    const frameTop = new THREE.Mesh(
      new THREE.BoxGeometry(9.8, 0.35, 0.3),
      frameMat
    );
    frameTop.position.set(0, nicheY + 2.65, backZ + 0.05);
    group.add(frameTop);

    const frameBottom = new THREE.Mesh(
      new THREE.BoxGeometry(9.8, 0.35, 0.3),
      frameMat
    );
    frameBottom.position.set(0, nicheY - 2.65, backZ + 0.05);
    group.add(frameBottom);

    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 5.35, 0.3),
      frameMat
    );
    frameLeft.position.set(-4.9, nicheY, backZ + 0.05);
    group.add(frameLeft);

    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 5.35, 0.3),
      frameMat
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

    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2.4, 2.4),
      cubeMat
    );
    cube.position.set(-3.0, this.floorY + 1.2, -29.5);
    cube.castShadow = true;
    cube.receiveShadow = true;
    group.add(cube);

    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 2.6, 32),
      cylMat
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

// Правая стена комнаты №2 с физическим проёмом под финальный лифт 2 → 3.
// Визуальный проём уже есть в buildSecondRoom(), теперь делаем такой же проём в коллизиях.
const exitDoorZ = -31.15; //
const exitDoorW = 7.5; //

const exitDoorZMin = exitDoorZ - exitDoorW / 2; // -34.75
const exitDoorZMax = exitDoorZ + exitDoorW / 2; // -27.25

// Участок правой стены от стартовой стороны комнаты до проёма.
const rightWallFrontLen = frontZ - exitDoorZMax;
const rightWallFrontCenterZ = (frontZ + exitDoorZMax) / 2;

this.createPhysicsWall(
  16,
  wallCenterY,
  rightWallFrontCenterZ,
  1,
  wallH / 2,
  rightWallFrontLen / 2
);

// Участок правой стены от проёма до дальней стены.
const rightWallBackLen = exitDoorZMin - backZ;
const rightWallBackCenterZ = (exitDoorZMin + backZ) / 2;

this.createPhysicsWall(
  16,
  wallCenterY,
  rightWallBackCenterZ,
  1,
  wallH / 2,
  rightWallBackLen / 2
);

this.createPhysicsWall(0, wallCenterY, backZ - 1, roomW / 2, wallH / 2, 1); // Дальняя

// === ФИЗИКА КАБИНЫ ФИНАЛЬНОГО ЛИФТА 2 → 3 ===
// Кабина стоит за правой стеной комнаты, глубина идёт по оси X.
const room2ExitX = 14.55;
const room2ExitZ = -31.15;
const room2ExitDepth = 5.0;
const room2ExitW = 7.5;

const room2ExitCenterX = room2ExitX + room2ExitDepth / 2;
const room2ExitBackX = room2ExitX + room2ExitDepth;

// Пол кабины
const room2ExitFloorBody = new CANNON.Body({
  mass: 0,
  material: this.matStandard,
});
room2ExitFloorBody.addShape(
  new CANNON.Box(
    new CANNON.Vec3(room2ExitDepth / 2, 10, room2ExitW / 2)
  )
);
room2ExitFloorBody.position.set(
  room2ExitCenterX,
  this.floorY - 10,
  room2ExitZ
);
this.addBody(room2ExitFloorBody);

// Боковые стенки кабины по Z
this.createPhysicsWall(
  room2ExitCenterX,
  wallCenterY,
  room2ExitZ - room2ExitW / 2,
  room2ExitDepth / 2,
  wallH / 2,
  0.1
);

this.createPhysicsWall(
  room2ExitCenterX,
  wallCenterY,
  room2ExitZ + room2ExitW / 2,
  room2ExitDepth / 2,
  wallH / 2,
  0.1
);

// Задняя стенка кабины по X
this.createPhysicsWall(
  room2ExitBackX,
  wallCenterY,
  room2ExitZ,
  0.1,
  wallH / 2,
  room2ExitW / 2
);

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
      new CANNON.Box(new CANNON.Vec3(roomW / 2, 10, roomD / 2))
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
      collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    cubeBody.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 1.2, 1.2)));
    cubeBody.position.set(-3.0, this.floorY + 1.2, -29.5);
    this.addBody(cubeBody);

    const cylApproxBody = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    // Пока цилиндр аппроксимируем коробкой для простоты.
    cylApproxBody.addShape(new CANNON.Box(new CANNON.Vec3(1.25, 1.3, 1.25)));
    cylApproxBody.position.set(3.0, this.floorY + 1.3, -29.5);
    this.addBody(cylApproxBody);
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

const revealMat = new THREE.MeshStandardMaterial({
  color: 0x555b61,   // мягкий металлический серый
  roughness: 0.35,
  metalness: 0.9,
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

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(8.1, 0.1, 0.3),
      frameMat,
    );
    top.position.set(0, doorY + 4.95, zOffset);

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

  // Оставляем только один внешний контур рамы
  buildHalfFrame(zPos + 0.4);

  // === ИЛЛЮЗИЯ ШАХТЫ (только верх и низ) ===

  const floorHole = new THREE.Mesh(
    new THREE.BoxGeometry(16.0, 0.08, 0.5),
    shaftMat,
  );
  floorHole.position.set(0, this.floorY + 0.04, zPos);
  frameGroup.add(floorHole);

  const ceilingHole = new THREE.Mesh(
    new THREE.BoxGeometry(16.0, 0.08, 0.5),
    shaftMat,
  );
  ceilingHole.position.set(0, doorY + 4.95, zPos);
  frameGroup.add(ceilingHole);

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

const elevatorBackWallMat = new THREE.MeshStandardMaterial({
  color: 0x6f777c,
  roughness: 0.58,
  metalness: 0.32,

  // Важно: не DoubleSide.
  // Стенка должна быть видна только изнутри кабины,
  // чтобы снаружи/сверху камера не видела огромную серую панель.
  side: THREE.FrontSide,
});

// Глухие металлические стенки кабины.
// Это односторонние плоскости, видимые только изнутри лифта.
const cabinFrontZ = 13.75;
const cabinBackZ = 8.75;

// Передняя глухая стенка.
// Она стоит у входа в кабину и должна смотреть внутрь лифта, то есть в сторону -Z.
this.entranceSolidWall = new THREE.Mesh(
  new THREE.PlaneGeometry(7.5, 10.0),
  elevatorBackWallMat
);
this.entranceSolidWall.position.set(0, doorY, cabinFrontZ);
this.entranceSolidWall.rotation.set(0, Math.PI, 0);
this.entranceSolidWall.castShadow = false;
this.entranceSolidWall.receiveShadow = true;
this.entranceSolidWall.userData.skipWallMaterialUpdate = true;
this.registerMesh(this.entranceSolidWall);
if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
  this.sceneManager.walls.push({
    mesh: this.entranceSolidWall,
    isElevatorCabinWall: true,
    skipMaterialUpdate: true,
  });
}

// Задняя глухая стенка.
// Она стоит в глубине кабины и должна смотреть внутрь лифта, то есть в сторону +Z.
this.exitSolidWall = new THREE.Mesh(
  new THREE.PlaneGeometry(7.5, 10.0),
  elevatorBackWallMat
);
this.exitSolidWall.position.set(0, doorY, cabinBackZ);
this.exitSolidWall.rotation.set(0, 0, 0);
this.exitSolidWall.castShadow = false;
this.exitSolidWall.receiveShadow = true;
this.exitSolidWall.userData.skipWallMaterialUpdate = true;
this.registerMesh(this.exitSolidWall);
if (this.sceneManager && Array.isArray(this.sceneManager.walls)) {
  this.sceneManager.walls.push({
    mesh: this.exitSolidWall,
    isElevatorCabinWall: true,
    skipMaterialUpdate: true,
  });
}

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
  openRoom2Exit() {
    if (this.room2ExitDoorA && this.room2ExitDoorB) {
      this.targetRoom2ExitOpenState = 1.0;
    }
  }

  closeRoom2Exit() {
    if (this.room2ExitDoorA && this.room2ExitDoorB) {
      this.targetRoom2ExitOpenState = 0.0;
    }
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

        // --- ДВИГАЕМ ФИНАЛЬНЫЙ ЛИФТ УРОВНЯ 2 ---
    // Эти двери стоят на правой стене, поэтому разъезжаются вдоль Z.
    if (this.room2ExitDoorA && this.room2ExitDoorB) {
      this.room2ExitOpenState = THREE.MathUtils.lerp(
        this.room2ExitOpenState || 0,
        this.targetRoom2ExitOpenState || 0,
        dt * doorSpeed
      );

      const slideDistance = 3.4;

      this.room2ExitDoorA.mesh.position.z =
        this.room2ExitDoorA.closedZ - slideDistance * this.room2ExitOpenState;

      this.room2ExitDoorB.mesh.position.z =
        this.room2ExitDoorB.closedZ + slideDistance * this.room2ExitOpenState;
    }
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
