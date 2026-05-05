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

    // 3. Строим стеклянную перегородку
    this.buildGlassWall();

    // 4. Строим невидимые физические коллайдеры
    this.buildPhysicsBoundaries();

    // 5. Развешиваем свет
    this.buildLightingPanels();
  }

  // --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
  addTiledWall(width, height, pos, rot) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.FrontSide,
      roughness: 0.1,
      metalness: 0.1,
    });
    this.sceneManager.createWallMesh(width, height, pos, rot, mat);
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
    // ЗОНА 1: ОСНОВНАЯ ЛАБОРАТОРИЯ (за окном)
    this.addTiledWall(30, 24, new THREE.Vector3(0, this.floorY, 2), new THREE.Vector3(-Math.PI / 2, 0, 0)); // Пол
    this.addTiledWall(30, 24, new THREE.Vector3(0, this.ceilingY, 2), new THREE.Vector3(Math.PI / 2, 0, 0)); // Потолок
    this.addTiledWall(30, 20, new THREE.Vector3(0, 2.5, -10), new THREE.Vector3(0, 0, 0)); // Задняя стена
    this.addTiledWall(24, 20, new THREE.Vector3(-15, 2.5, 2), new THREE.Vector3(0, Math.PI / 2, 0)); // Левая
    this.addTiledWall(24, 20, new THREE.Vector3(15, 2.5, 2), new THREE.Vector3(0, -Math.PI / 2, 0)); // Правая

    // ЗОНА 2: КОРИДОР ПЕРЕД ОКНОМ
    const corridorDepth = 30;
    const corridorZ = 15 + corridorDepth / 2;

    this.addTiledWall(this.w, corridorDepth, new THREE.Vector3(0, this.floorY, corridorZ), new THREE.Vector3(-Math.PI / 2, 0, 0)); // Пол коридора
    this.addTiledWall(this.w, corridorDepth, new THREE.Vector3(0, this.ceilingY, corridorZ), new THREE.Vector3(Math.PI / 2, 0, 0)); // Потолок коридора
    this.addTiledWall(corridorDepth, 20, new THREE.Vector3(-15, 2.5, corridorZ), new THREE.Vector3(0, Math.PI / 2, 0)); // Левая стена
    this.addTiledWall(this.w, 20, new THREE.Vector3(0, 2.5, 45), new THREE.Vector3(0, Math.PI, 0)); // Задняя стена коридора

    // ЗОНА 3: ПРАВАЯ СТЕНА С НИШЕЙ
    this.addTiledWall(20, 20, new THREE.Vector3(15, 2.5, 25), new THREE.Vector3(0, -Math.PI / 2, 0)); 
    this.addTiledWall(5, 20, new THREE.Vector3(15, 2.5, 42.5), new THREE.Vector3(0, -Math.PI / 2, 0)); 
    this.addTiledWall(5, 7.5, new THREE.Vector3(15, -1.25, 37.5), new THREE.Vector3(0, -Math.PI / 2, 0)); 
    this.addTiledWall(5, 2.5, new THREE.Vector3(15, 8.75, 37.5), new THREE.Vector3(0, -Math.PI / 2, 0)); 

    // ВНУТРЕННОСТИ НИШИ
    this.addTiledWall(5, 5, new THREE.Vector3(17.5, 2.5, 37.5), new THREE.Vector3(-Math.PI / 2, 0, 0)); 
    this.addTiledWall(5, 5, new THREE.Vector3(17.5, 7.5, 37.5), new THREE.Vector3(Math.PI / 2, 0, 0));  
    this.addTiledWall(5, 5, new THREE.Vector3(20, 5, 37.5), new THREE.Vector3(0, -Math.PI / 2, 0));      
    this.addTiledWall(5, 5, new THREE.Vector3(17.5, 5, 35), new THREE.Vector3(0, 0, 0));                
    this.addTiledWall(5, 5, new THREE.Vector3(17.5, 5, 40), new THREE.Vector3(0, Math.PI, 0));          
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
    // Основной пол
    const floorBody = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE,
      collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(50, 10, 50)));
    floorBody.position.set(0, this.floorY - 10, 0);
    this.world.addBody(floorBody);

    // Левая стена
    this.createPhysicsWall(-16, 2.5, 10, 1, 10, 35);

    // Правая стена и монолитные блоки ниши
    this.createPhysicsWall(16, 2.5, 25, 1, 10, 10);
    this.createPhysicsWall(16, 2.5, 42.5, 1, 10, 2.5);
    this.createPhysicsWall(17.5, -1.25, 37.5, 2.5, 3.75, 2.5); // Под нишей
    this.createPhysicsWall(17.5, 8.75, 37.5, 2.5, 1.25, 2.5);  // Над нишей
    this.createPhysicsWall(20.5, 5, 37.5, 0.5, 2.5, 2.5);      // Задняя
    this.createPhysicsWall(17.5, 5, 34.5, 2.5, 2.5, 0.5);      // Левая боковая
    this.createPhysicsWall(17.5, 5, 40.5, 2.5, 2.5, 0.5);      // Правая боковая

    // Внутренности ниши
    this.createPhysicsWall(17.5, 8.0, 37.5, 2.5, 0.5, 2.5); // Потолок ниши (остается скользким)
    
    // ПОЛ НИШИ: Добавляем this.matStandard, чтобы у шара появилось сцепление
    this.createPhysicsWall(17.5, 2.0, 37.5, 2.5, 0.5, 2.5, this.matStandard);

    // Задние невидимые стены
    this.createPhysicsWall(0, 2.5, -11, 25, 10, 1);
    this.createPhysicsWall(0, 2.5, 46, 25, 10, 1);
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

    const corridorPositions = [{ x: -6, z: 30 }, { x: 6, z: 30 }];
    corridorPositions.forEach((pos) => {
      this.sceneManager.corridorPanels.push(createLightPanel(pos.x, this.ceilingY, pos.z, true));
    });

    const labPositions = [{ x: -7, z: 0 }, { x: 7, z: 0 }];
    labPositions.forEach((pos) => {
      this.sceneManager.labPanels.push(createLightPanel(pos.x, this.ceilingY, pos.z, false));
    });
  }
}