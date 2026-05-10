import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CONFIG } from "./config.js";

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
  }

build() {
    // 1. Вызываем базовое окружение (атмосфера, небо)
    this.sceneManager.buildEnvironment();

    // 2. Строим графические стены
    this.buildVisualWalls();
    this.buildSecondRoom(); // Наша новая комната

    // 3. Строим стеклянную перегородку
    //this.buildGlassWall();

    // 4. Строим невидимые физические коллайдеры
    this.buildPhysicsBoundaries();

    // 5. Развешиваем свет
    this.buildLightingPanels();

    // ВЫЗЫВАЕМ ПОСТРОЙКУ ДВЕРЕЙ:
    this.buildElevatorDoors();
  }

  // Полная очистка текущих объектов уровня
  clearCurrentLevel() {
    // 1. Очистка физики Cannon.js
    if (this.levelObjects) {
      this.levelObjects.forEach(obj => {
        if (obj.body) this.world.removeBody(obj.body);
      });
    }

    // 2. Очистка графики Three.js (освобождение GPU)
    if (this.levelGroup) {
      this.levelGroup.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose(); // Удаляем геометрию из памяти
          
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose()); // Удаляем массив материалов
          } else {
            child.material.dispose(); // Удаляем одиночный материал
          }
        }
      });
      this.scene.remove(this.levelGroup); // Убираем группу со сцены
    }

    // 3. Сброс массивов
    this.levelObjects = [];
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
addTiledWall(width, height, pos, rot, uvOffsetX = 0, uvOffsetY = 0, color = 0xffffff) {
    const mat = new THREE.MeshStandardMaterial({
      color: color, // Используем цвет из аргумента
      side: THREE.DoubleSide, // Видно с двух сторон — это страховка от «пропадания» стен
      roughness: 0.1,
      metalness: 0.1,
    });
    
    const mesh = this.sceneManager.createWallMesh(width, height, pos, rot, mat);
    
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

 createPhysicsWall(x, y, z, halfX, halfY, halfZ, customMaterial = this.matSlippery) {
    const wallBody = new CANNON.Body({
      mass: 0,
      material: customMaterial, // Теперь переменная берется из параметров выше
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(halfX, halfY, halfZ)));
    wallBody.position.set(x, y, z);
    this.world.addBody(wallBody);
  }

  // --- ЭТАПЫ СТРОИТЕЛЬСТВА ---
buildVisualWalls() {
    const roomW = 30;
    const roomD = 30;
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;
    
    const elW = 7.5;  // Лифт: ширина 3 плитки
    const elD = 7.5;  // Лифт: глубина 3 плитки
    const elH = 10.0; // Лифт: высота 4 плитки
    const elCenterY = this.floorY + elH / 2;
    
    // Пол и потолок комнаты
    this.addTiledWall(roomW, roomD, new THREE.Vector3(0, this.floorY, 30), new THREE.Vector3(-Math.PI / 2, 0, 0)); 
    this.addTiledWall(roomW, roomD, new THREE.Vector3(0, this.ceilingY, 30), new THREE.Vector3(Math.PI / 2, 0, 0)); 
    
    // Левая, Правая, Задняя стены комнаты
    this.addTiledWall(roomD, wallH, new THREE.Vector3(-15, wallCenterY, 30), new THREE.Vector3(0, Math.PI / 2, 0));
    this.addTiledWall(roomD, wallH, new THREE.Vector3(15, wallCenterY, 30), new THREE.Vector3(0, -Math.PI / 2, 0));
    this.addTiledWall(roomW, wallH, new THREE.Vector3(0, wallCenterY, 45), new THREE.Vector3(0, Math.PI, 0));
    
    // === ПЕРЕДНЯЯ СТЕНА (С идеальными углами) ===
    const sideW = (roomW - elW) / 2; 
    const leftX = -(elW / 2) - (sideW / 2); 
    const rightX = (elW / 2) + (sideW / 2); 
    
    // Сдвигаем UV на правой стене на 1.25 (полплитки)
    this.addTiledWall(sideW, wallH, new THREE.Vector3(leftX, wallCenterY, 15), new THREE.Vector3(0, 0, 0), 0, 0); 
    this.addTiledWall(sideW, wallH, new THREE.Vector3(rightX, wallCenterY, 15), new THREE.Vector3(0, 0, 0), 1.25, 0); 
    
    // Козырек над лифтом
    const topH = this.ceilingY - (this.floorY + elH);
    const topCenterY = this.floorY + elH + topH / 2;
    this.addTiledWall(elW, topH, new THREE.Vector3(0, topCenterY, 15), new THREE.Vector3(0, 0, 0), 1.25, 0);

    // === КАБИНА ЛИФТА ===
    const elZ = 15 - elD / 2; 
    
    // Пол и потолок лифта
    this.addTiledWall(elW, elD, new THREE.Vector3(0, this.floorY, elZ), new THREE.Vector3(-Math.PI / 2, 0, 0), 1.25, 0);
    this.addTiledWall(elW, elD, new THREE.Vector3(0, this.floorY + elH, elZ), new THREE.Vector3(Math.PI / 2, 0, 0), 1.25, 0);
    
    // Стенки лифта
    this.addTiledWall(elD, elH, new THREE.Vector3(-elW/2, elCenterY, elZ), new THREE.Vector3(0, Math.PI / 2, 0)); 
    this.addTiledWall(elD, elH, new THREE.Vector3(elW/2, elCenterY, elZ), new THREE.Vector3(0, -Math.PI / 2, 0));  
  }

buildSecondRoom() {
    const roomW = 30;
    const roomD = 30;
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;
    const centerZ = -7.5; 

    // ПОЛ. Чтобы сменить цвет, меняй 0x228b22 на любой другой (например, 0x0000ff для синего)
    this.addTiledWall(roomW, roomD, new THREE.Vector3(0, this.floorY, centerZ), new THREE.Vector3(-Math.PI / 2, 0, 0), 0, 0, 0x228b22); 
    
    // ПОТОЛОК
    this.addTiledWall(roomW, roomD, new THREE.Vector3(0, this.ceilingY, centerZ), new THREE.Vector3(Math.PI / 2, 0, 0)); 
    
    // БОКОВЫЕ СТЕНЫ
    this.addTiledWall(roomD, wallH, new THREE.Vector3(-15, wallCenterY, centerZ), new THREE.Vector3(0, Math.PI / 2, 0));
    this.addTiledWall(roomD, wallH, new THREE.Vector3(15, wallCenterY, centerZ), new THREE.Vector3(0, -Math.PI / 2, 0));

    // ЗАДНЯЯ СТЕНА (Дальняя). Поворот 0, чтобы смотрела на нас
    this.addTiledWall(roomW, wallH, new THREE.Vector3(0, wallCenterY, -22.5), new THREE.Vector3(0, 0, 0));

    // ПЕРЕДНЯЯ СТЕНА (Примыкает к лифту). Поворот Math.PI, чтобы смотрела внутрь комнаты
    const elW = 7.5;
    const sideW = (roomW - elW) / 2; 
    const leftX = -(elW / 2) - (sideW / 2); 
    const rightX = (elW / 2) + (sideW / 2); 

    this.addTiledWall(sideW, wallH, new THREE.Vector3(leftX, wallCenterY, 7.5), new THREE.Vector3(0, Math.PI, 0)); 
    this.addTiledWall(sideW, wallH, new THREE.Vector3(rightX, wallCenterY, 7.5), new THREE.Vector3(0, Math.PI, 0), 1.25, 0); 
    
    const elH = 10.0;
    const topH = wallH - elH;
    const topCenterY = this.floorY + elH + topH / 2;
    this.addTiledWall(elW, topH, new THREE.Vector3(0, topCenterY, 7.5), new THREE.Vector3(0, Math.PI, 0), 1.25, 0);
  }

  buildGlassWall() {
    const wallThickness = 2.0; 
    const holeWidth = 24;
    const holeHeight = 11;
    const cornerRadius = 1.5;
    const wallPos = new THREE.Vector3(0, 2.5, 14);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.0 });
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
      this.w, 20, wallThickness, holeWidth, holeHeight, cornerRadius, wallPos, null, wallMat, glassMat
    );

    glassWallGroup.children.forEach((child) => {
      if (child.material === glassMat) child.userData.isGlass = true;
    });

    // Физика стены
    this.physicsManager.createWallWithHole(
      this.w, 20, wallThickness, holeWidth, holeHeight, wallPos, null, CONFIG.PHYSICS.GROUPS
    );

    // Физика самого стекла
    const glassPhysicsShape = new CANNON.Box(new CANNON.Vec3(holeWidth / 2, holeHeight / 2, 0.1));
    const glassBody = new CANNON.Body({
      mass: 0,
      material: this.matSlippery,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    glassBody.addShape(glassPhysicsShape);
    glassBody.position.set(wallPos.x, wallPos.y, wallPos.z);
    this.world.addBody(glassBody);
  }

buildPhysicsBoundaries() {
    const wallH = this.ceilingY - this.floorY;
    const wallCenterY = this.floorY + wallH / 2;

    // === 1. ФИЗИЧЕСКИЙ ПОЛ (ТРИ СЕКЦИИ БЕЗ ЩЕЛЕЙ) ===

    // Секция комнаты №1 (Белая)
    const floor1Body = new CANNON.Body({ mass: 0, material: this.matStandard });
    floor1Body.addShape(new CANNON.Box(new CANNON.Vec3(15, 10, 15))); 
    floor1Body.position.set(0, this.floorY - 10, 30); 
    this.world.addBody(floor1Body);

    // Секция комнаты №2 (Зеленая)
    const floor2Body = new CANNON.Body({ mass: 0, material: this.matStandard });
    floor2Body.addShape(new CANNON.Box(new CANNON.Vec3(15, 10, 15)));
    floor2Body.position.set(0, this.floorY - 10, -7.5);
    this.world.addBody(floor2Body);

    // Секция ЛИФТА (Соединительный мостик)
    // Ширина 7.5 (half=3.75), Глубина 7.5 (half=3.75)
    const floorElevBody = new CANNON.Body({ mass: 0, material: this.matStandard });
    floorElevBody.addShape(new CANNON.Box(new CANNON.Vec3(3.75, 10, 3.75)));
    floorElevBody.position.set(0, this.floorY - 10, 11.25); // Ровно между 7.5 и 15
    this.world.addBody(floorElevBody);


  // === 2. ВНЕШНИЕ ГРАНИЦЫ (СТЕНЫ) ===

    // Стены комнаты №1 (Сдвигаем центры на 1 метр наружу)
    this.createPhysicsWall(-16, wallCenterY, 30, 1, wallH/2, 15); // Левая (было -15)
    this.createPhysicsWall(16, wallCenterY, 30, 1, wallH/2, 15);  // Правая (было 15)
    this.createPhysicsWall(0, wallCenterY, 46, 15, wallH/2, 1);   // Дальняя (было 45)

    // Стены комнаты №2
    this.createPhysicsWall(-16, wallCenterY, -7.5, 1, wallH/2, 15); // Левая (было -15)
    this.createPhysicsWall(16, wallCenterY, -7.5, 1, wallH/2, 15);  // Правая (было 15)
    this.createPhysicsWall(0, wallCenterY, -23.5, 15, wallH/2, 1);  // Дальняя (было -22.5)
    

    // === 3. ПЕРЕГОРОДКИ С ПРОЕМАМИ ===
    // Делаем их тонкими (0.1 вместо 1), чтобы не мешать дверям лифта

    // Фасад 1-й комнаты (Z = 15)
    this.createPhysicsWall(-9.375, wallCenterY, 15, 5.625, wallH/2, 0.1);
    this.createPhysicsWall(9.375, wallCenterY, 15, 5.625, wallH/2, 0.1);
    this.createPhysicsWall(0, 7.5, 15, 3.75, 5, 0.1); // Козырек

    // Фасад 2-й комнаты (Z = 7.5)
    this.createPhysicsWall(-9.375, wallCenterY, 7.5, 5.625, wallH/2, 0.1);
    this.createPhysicsWall(9.375, wallCenterY, 7.5, 5.625, wallH/2, 0.1);


    // === 4. ВНУТРЕННИЕ СТЕНКИ ШАХТЫ ЛИФТА ===
    const elCenterY = this.floorY + 5; 
    
    // Стенки лифта тоже делаем тонкими
    this.createPhysicsWall(-4.75, elCenterY, 11.25, 0.1, 5, 3.75); // Левая
    this.createPhysicsWall(4.75, elCenterY, 11.25, 0.1, 5, 3.75);  // Правая
    this.createPhysicsWall(0, this.floorY + 11, 11.25, 3.75, 1, 3.75); // Потолок шахты (оставляем толстым)
}


buildElevatorDoors() {
    const doorW = 3.8; 
    const doorH = 10.0;
    const doorD = 0.4; 
    const doorY = this.floorY + doorH / 2;
    
    const zEntrance = 14.3; 
    const zExit = 8.2;      

    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x151515,
      roughness: 0.3,
      metalness: 0.8
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.9
    });

    // Матовый черный материал для "бездонной пустоты" (не отражает свет!)
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

    const createFrame = (zPos) => {
      const frameGroup = new THREE.Group(); 

      const buildHalfFrame = (zOffset) => {
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 0.3), frameMat);
        left.position.set(-3.75, doorY, zOffset);
        
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 0.3), frameMat);
        right.position.set(3.75, doorY, zOffset);
        
        // ТОНКАЯ ВЕРХНЯЯ РЕЛЬСА (Высота всего 0.1)
        const top = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.1, 0.3), frameMat);
        top.position.set(0, doorY + 4.95, zOffset);
        
        // ТОНКАЯ НИЖНЯЯ РЕЛЬСА (Высота всего 0.1)
        const bottom = new THREE.Mesh(new THREE.BoxGeometry(8.1, 0.1, 0.3), frameMat);
        bottom.position.set(0, this.floorY + 0.05, zOffset);

        [left, right, top, bottom].forEach(m => {
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
      const floorHole = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.08, 0.5), shaftMat);
      floorHole.position.set(0, this.floorY + 0.04, zPos);
      frameGroup.add(floorHole);

      // 2. Дыра в потолке (прячет синий потолок комнаты между верхними рельсами)
      const ceilingHole = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.08, 0.5), shaftMat);
      ceilingHole.position.set(0, doorY + 4.95, zPos);
      frameGroup.add(ceilingHole);

      // 3. Боковые карманы (куда уезжают двери, чтобы не проваливаться в стену)
      const leftPocket = new THREE.Mesh(new THREE.BoxGeometry(4.6, 9.8, 0.5), shaftMat);
      leftPocket.position.set(-5.8, doorY, zPos);
      frameGroup.add(leftPocket);

      const rightPocket = new THREE.Mesh(new THREE.BoxGeometry(4.6, 9.8, 0.5), shaftMat);
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
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 0,
        type: CANNON.Body.KINEMATIC, 
        material: this.matStandard,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
        collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(doorW / 2, doorH / 2, doorD / 2)));
      
      body.position.set(side === 'left' ? -doorW / 2 : doorW / 2, doorY, zPos);
      
      this.world.addBody(body);
      return { mesh, body };
    };

    this.entranceLeft = createDoorLeaf('left', zEntrance);
    this.entranceRight = createDoorLeaf('right', zEntrance);
    this.exitLeft = createDoorLeaf('left', zExit);
    this.exitRight = createDoorLeaf('right', zExit);

    this.entranceSolidWall = this.addTiledWall(7.5, 10.0, new THREE.Vector3(0, doorY, zEntrance), new THREE.Vector3(0, 0, 0), 1.25, 0);
    this.exitSolidWall = this.addTiledWall(7.5, 10.0, new THREE.Vector3(0, doorY, zExit), new THREE.Vector3(0, 0, 0), 1.25, 0);

    this.entranceOpenState = 0.0;
    this.targetEntranceOpenState = 0.0;
    this.exitOpenState = 0.0;
    this.targetExitOpenState = 0.0;

    this.setElevatorMode('entering');
  }

  setElevatorMode(mode) {
    if (mode === 'entering') {
      // Игрок заходит: Входные двери и их рама видны. Передняя стена — белая и чистая.
      this.entranceLeft.mesh.visible = true;
      this.entranceRight.mesh.visible = true;
      this.entranceFrame.visible = true;     // Включаем раму входа
      this.entranceSolidWall.visible = false;

      this.exitLeft.mesh.visible = false;
      this.exitRight.mesh.visible = false;
      this.exitFrame.visible = false;        // Выключаем раму выхода!
      this.exitSolidWall.visible = true;
      
    } else if (mode === 'exiting') {
      // Игрок выезжает: Задняя стена — белая и чистая. Выходные двери и их рама видны.
      this.entranceLeft.mesh.visible = false;
      this.entranceRight.mesh.visible = false;
      this.entranceFrame.visible = false;    // Выключаем раму входа!
      this.entranceSolidWall.visible = true;

      this.exitLeft.mesh.visible = true;
      this.exitRight.mesh.visible = true;
      this.exitFrame.visible = true;         // Включаем раму выхода
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
      roughness: 0.1
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

openEntrance() { this.targetEntranceOpenState = 1.0; }
  closeEntrance() { this.targetEntranceOpenState = 0.0; }
  
  openExit() { this.targetExitOpenState = 1.0; }
  closeExit() { this.targetExitOpenState = 0.0; }

updateDoors(dt) {
    if (!this.entranceLeft) return;

    // Уменьшили скорость с 2.0 до 0.8 для эффекта тяжелого металла
    this.entranceOpenState = THREE.MathUtils.lerp(this.entranceOpenState, this.targetEntranceOpenState, dt * 0.8);
    this.exitOpenState = THREE.MathUtils.lerp(this.exitOpenState, this.targetExitOpenState, dt * 0.8);
    
    const closedX = 1.9; 
    const openX = 5.7; 
    
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
      group.userData = { intensity: isCorridor ? 1.0 : 0.0, isCorridor: isCorridor, isAnimating: false };

      const housingGeo = new THREE.BoxGeometry(4.2, 0.2, 4.2);
      const housingMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.6, metalness: 0.3 });
      const housing = new THREE.Mesh(housingGeo, housingMat);
      housing.position.y = -0.1;
      group.add(housing);

      const diffuserGeo = new THREE.PlaneGeometry(3.8, 3.8);
      const diffuserMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: isCorridor ? 2.0 : 0.0, roughness: 0.6, metalness: 0.1
      });
      const diffuser = new THREE.Mesh(diffuserGeo, diffuserMat);
      diffuser.rotation.x = Math.PI / 2;
      diffuser.position.y = -0.201;
      group.add(diffuser);

      this.scene.add(group);

      const rectLight = new THREE.RectAreaLight(0xffffff, isCorridor ? 15.0 : 0.0, 3.8, 3.8);
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
      { x: -7.5, z: 22.5 }, { x: 7.5, z: 22.5 },
      { x: -7.5, z: 37.5 }, { x: 7.5, z: 37.5 }
    ];

    // Позиции для ВТОРОЙ комнаты (Зеленой)
    const room2Pos = [
      { x: -7.5, z: -15 }, { x: 7.5, z: -15 },
      { x: -7.5, z: 0 },   { x: 7.5, z: 0 }
    ];

    // Запускаем создание ламп для обеих комнат
    // Передаем true в конце, чтобы свет был включен (isCorridor = true)
    room1Pos.forEach(pos => this.sceneManager.corridorPanels.push(createLightPanel(pos.x, this.ceilingY, pos.z, true)));
    room2Pos.forEach(pos => this.sceneManager.corridorPanels.push(createLightPanel(pos.x, this.ceilingY, pos.z, true)));
  }
}