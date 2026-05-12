import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CONFIG } from "./config.js";

// --- ЗАГРУЗКА ТЕКСТУР (УПРАВЛЯЕМАЯ) ---
export let tileTex, tileNormalTex, tileRoughTex;
export let marbleBaseTex, marbleNormalTex, marbleRoughTex;
export let heatTex, ventGridTex;

export function loadGameAssets(onProgress, onComplete) {
  const manager = new THREE.LoadingManager();

  manager.onProgress = (url, itemsLoaded, itemsTotal) => {
    onProgress(itemsLoaded / itemsTotal);
  };
  
  manager.onLoad = () => {
    onComplete();
  };

  const textureLoader = new THREE.TextureLoader(manager);

  const setupTiling = (texture, repeatX, repeatY) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  };

  const repeatX = 0.05;
  const repeatY = 0.05;

  tileTex = textureLoader.load("Image/diff_1k.png", (t) => setupTiling(t, repeatX, repeatY));
  tileNormalTex = textureLoader.load("Image/nor_gl_1k.png", (t) => setupTiling(t, repeatX, repeatY));
  tileRoughTex = textureLoader.load("Image/rough_1k.png", (t) => setupTiling(t, repeatX, repeatY));

  marbleBaseTex = textureLoader.load("Image/marble_69_basecolor-1K.png");
  marbleNormalTex = textureLoader.load("Image/marble_69_normal-1K.png");
  marbleRoughTex = textureLoader.load("Image/marble_69_roughness-1K.png");

  heatTex = textureLoader.load("Image/heat.png");

  ventGridTex = textureLoader.load("Image/ventGrid.png", (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
  });
}

export const lampGlowTex = (() => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  // Рисуем мягкое пятно света для ореола
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
  g.addColorStop(0.0, "rgba(255,255,255,1.0)"); // Центр яркий
  g.addColorStop(0.4, "rgba(255,255,255,0.3)"); // Края мягкие
  g.addColorStop(1.0, "rgba(255,255,255,0.0)"); // Уходит в прозрачность
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();

// --- КЛАСС SCENE MANAGER ---
export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();

    // 1. Берем настройки для старта (регистрации) из конфига
    const camCfg = CONFIG.CAMERA.REGISTRATION;

    this.camera = new THREE.PerspectiveCamera(
      camCfg.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(camCfg.pos.x, camCfg.pos.y, camCfg.pos.z);

 this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    
    // ВАЖНО: физически добавляем канвас на страницу
    document.getElementById("canvas-container").appendChild(this.renderer.domElement);

    // Настраиваем буфер со сглаживанием и поддержкой HDR (для Bloom)
    const renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight,
      { 
        samples: 4,
        type: THREE.HalfFloatType, // Критично для правильной работы свечения!
        colorSpace: THREE.SRGBColorSpace 
      }
    );

    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.15,
      0.6,
      0.15
    );
    this.composer.addPass(this.bloomPass);

    // 3. НАСТРОЙКА УПРАВЛЕНИЯ
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
   
    this.controls.enablePan = false;

    // Отключаем вращение камеры (по твоему запросу)
    this.controls.enableRotate = false;

    // Лимиты и точка фокуса теперь тоже из конфига
    this.controls.minDistance = camCfg.minDist;
    this.controls.maxDistance = camCfg.maxDist;

    // Комментируем старую настройку кнопок мыши, так как вращение отключено
    // this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

    this.controls.target.set(camCfg.target.x, camCfg.target.y, camCfg.target.z);
    this.controls.update();

    this.controls.saveState();

    this.walls = [];
    this.discoSpots = [];
    this.labPanels = []; // <-- НОВАЯ СТРОКА: Хранилище для независимого управления лампами
    this._initResizeHandler();
  }

  createPlayerMesh(radius) {
    const geometry = new THREE.SphereGeometry(radius, 32, 32); // 32 полигона для гладкости
    const material = new THREE.MeshStandardMaterial({
      map: marbleBaseTex,
      normalMap: marbleNormalTex,
      roughnessMap: marbleRoughTex,
      roughness: 0.2, // Можно будет подкрутить потом для глянцевости
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    return mesh;
  }

  setCameraMode(mode) {
    if (mode === "registration") {
      this.controls.reset();
      const cfg = CONFIG.CAMERA.REGISTRATION;

      this.camera.fov = cfg.fov;
      this.camera.position.set(cfg.pos.x, cfg.pos.y, cfg.pos.z);
      this.controls.target.set(cfg.target.x, cfg.target.y, cfg.target.z);

      this.controls.minDistance = cfg.minDist;
      this.controls.maxDistance = cfg.maxDist;

      this.camera.updateProjectionMatrix();
      this.controls.update();
    } else if (mode === "gameplay") {
      const cfg = CONFIG.CAMERA.GAMEPLAY;

      // Мгновенная установка позиции без анимации
      this.camera.position.set(cfg.pos.x, cfg.pos.y, cfg.pos.z);
      this.controls.target.set(cfg.target.x, cfg.target.y, cfg.target.z);
      this.camera.fov = cfg.fov;

      this.camera.updateProjectionMatrix();

      // Обновляем лимиты зума
      this.controls.minDistance = cfg.minDist;
      this.controls.maxDistance = cfg.maxDist;

      // Включаем управление, обновляем контроллер и выходим
      this.controls.enabled = true;
      this.controls.update();
    }
  }
  _initResizeHandler() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.setSize(window.innerWidth, window.innerHeight);
      // Добавь обновление пикселей при ресайзе
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  }


  
  buildEnvironment() {
    this.dayLights = new THREE.Group();
    this.scene.add(this.dayLights);
    this.ambientLight = new THREE.HemisphereLight(0xffffff, 0xb0c4de, 0.8);
    this.dayLights.add(this.ambientLight);
    this.leftLight = new THREE.DirectionalLight(0x9bb7ff, 0.0);
    this.leftLight.position.set(-10, 6, 8);
    this.dayLights.add(this.leftLight);
    this.fillLight = new THREE.DirectionalLight(0xffe2c2, 0.0);
    this.fillLight.position.set(10, 6, 8);
    this.dayLights.add(this.fillLight);

    this.nightLights = new THREE.Group();
    this.scene.add(this.nightLights);
    const ledGeo = new THREE.BoxGeometry(0.2, 0.05, 0.2);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 3.5,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ledStrip = new THREE.InstancedMesh(ledGeo, ledMat, 80 * 2 + 120);
    ledStrip.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy = new THREE.Object3D();
    let idx = 0;
    const placeLedLine = (startX, startZ, endX, endZ, count) => {
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        dummy.position.set(
          startX + (endX - startX) * t,
          CONFIG.WORLD.FLOOR_LEVEL + 0.03,
          startZ + (endZ - startZ) * t,
        );
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        ledStrip.setMatrixAt(idx++, dummy.matrix);
      }
    };
    placeLedLine(-14.7, -10.0, -14.7, 12.0, 80);
    placeLedLine(14.7, -10.0, 14.7, 12.0, 80);
    placeLedLine(-14.7, -10.0, 14.7, -10.0, 120);
    this.nightLights.add(ledStrip);
    this.nightLights.visible = false;

    this.labLampsGroup = new THREE.Group();
    this.scene.add(this.labLampsGroup);

    this.discoLampsGroup = new THREE.Group();
    this.scene.add(this.discoLampsGroup);
    this.discoLampsGroup.visible = false;

    if (!this.corridorLampsGroup) {
      this.corridorLampsGroup = new THREE.Group();
      this.scene.add(this.corridorLampsGroup);
    }

    const createDiscoSpot = (x, z, colorHex) => {
      // 1. Меняем яркость с 40 на 500 (или 800, если покажется темновато)
      const spotLight = new THREE.SpotLight(0xfff0e0, 500, 25);
      spotLight.position.set(x, CONFIG.WORLD.CEILING_HEIGHT - 0.05, z);

      // 2. Делаем конус света шире: меняем Math.PI / 3 на Math.PI / 2.5
      spotLight.angle = Math.PI / 2.5;
      spotLight.penumbra = 1.0;
      spotLight.decay = 2.0;
      spotLight.castShadow = true;
      spotLight.shadow.bias = -0.0001;
      spotLight.target.position.set(0, CONFIG.WORLD.FLOOR_LEVEL, 0);
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 }),
      );
      housing.position.copy(spotLight.position);
      housing.lookAt(spotLight.target.position);
      housing.rotateX(Math.PI / 2);
      this.discoLampsGroup.add(spotLight);
      this.discoLampsGroup.add(spotLight.target);
      this.discoLampsGroup.add(housing);
      this.discoSpots.push({ light: spotLight, housing: housing });
    };
    createDiscoSpot(-13, -8, 0xff00ff);
    createDiscoSpot(13, -8, 0x00ffff);
    createDiscoSpot(-13, 10, 0xffff00);
    createDiscoSpot(13, 10, 0x00ff00);

    this.labProps = new THREE.Group();
    this.scene.add(this.labProps);
    this.baseMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 6, 0.5, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.02,
        transparent: true,
        opacity: 0.25,
        transmission: 1.0,
        ior: 1.52,
        reflectivity: 0.5,
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.baseMesh.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.3, 0);
    this.baseMesh.receiveShadow = true;
    this.baseMesh.renderOrder = 1;
    this.labProps.add(this.baseMesh);
    const ringGeo = new THREE.TorusGeometry(4.5, 0.1, 32, 100);
    const ringMat = new THREE.MeshPhysicalMaterial({
      color: 0xcccccc,
      emissive: 0x0055ff,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 1.0,
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.66, 0);
    this.ringMesh.rotation.x = Math.PI / 2;
    this.ringMesh.renderOrder = 2;
    this.labProps.add(this.ringMesh);

    this.floorLight = new THREE.PointLight(0x0088ff, 12, 7);
    this.floorLight.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 1.5, 0);
    this.labProps.add(this.floorLight);
    this.holoLight = new THREE.PointLight(0x0088ff, 20, 12);
    this.holoLight.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 1, 0);
    this.labProps.add(this.holoLight);

    this.ventOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.WORLD.ROOM_SIZE, CONFIG.WORLD.ROOM_SIZE),
      new THREE.MeshStandardMaterial({
        map: ventGridTex,
        transparent: true,
        opacity: 0.0,
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.0,
        emissive: new THREE.Color(0xffb074),
        emissiveIntensity: 0.0,
        depthWrite: false,
      }),
    );
    this.ventOverlay.rotation.x = -Math.PI / 2;
    this.ventOverlay.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.012, 0);
    this.ventOverlay.renderOrder = 999;
    this.scene.add(this.ventOverlay);

    const reticleGeo = new THREE.PlaneGeometry(3.0, 3.0);
    const reticleTex = new THREE.TextureLoader().load(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--tex-reticle")
        .slice(5, -2),
    );
    const reticleMat = new THREE.MeshBasicMaterial({
      map: reticleTex,
      transparent: true,
      opacity: 0.8,
      color: 0x00f3ff,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.magnetReticle = new THREE.Mesh(reticleGeo, reticleMat);
    this.magnetReticle.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.05, 0);
    this.magnetReticle.visible = false;
    this.scene.add(this.magnetReticle);
  }

  createWallMesh(width, height, pos, rot, material) {
    const geom = new THREE.PlaneGeometry(width, height);

    // === АБСОЛЮТНЫЙ ТАЙЛИНГ (ПУЛЕНЕПРОБИВАЕМЫЙ ВАРИАНТ) ===
    // Обращаемся напрямую к сырому массиву Float32Array
    const uvArray = geom.attributes.uv.array;

    // Массив плоский: [u1, v1, u2, v2, u3, v3 ...]
    // Шагаем по +2, чтобы обрабатывать пары
    for (let i = 0; i < uvArray.length; i += 2) {
      uvArray[i] = uvArray[i] * width; // Координата U (по ширине)
      uvArray[i + 1] = uvArray[i + 1] * height; // Координата V (по высоте)
    }

    // Обязательно сообщаем видеокарте, что сырые данные изменились
    geom.attributes.uv.needsUpdate = true;
    // ========================================================

    const mesh = new THREE.Mesh(geom, material);
    mesh.position.copy(pos);
    if (rot) mesh.rotation.set(rot.x, rot.y, rot.z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.walls.push({
      mesh,
      isFloor: pos.y === CONFIG.WORLD.FLOOR_LEVEL,
      isCeiling: pos.y === CONFIG.WORLD.CEILING_HEIGHT,
      isBack: rot && rot.x === 0 && rot.y === 0,
    });
    return mesh;
  }

  createWallWithWindow(
    width,
    height,
    thickness,
    holeWidth,
    holeHeight,
    radius,
    pos,
    rot,
    wallMaterial,
    glassMaterial,
  ) {
    const group = new THREE.Group();
    group.position.copy(pos);
    if (rot) group.rotation.set(rot.x, rot.y, rot.z);

    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -height / 2);
    shape.lineTo(width / 2, -height / 2);
    shape.lineTo(width / 2, height / 2);
    shape.lineTo(-width / 2, height / 2);

    const holePath = new THREE.Path();
    const hw = holeWidth / 2;
    const hh = holeHeight / 2;
    holePath.moveTo(-hw + radius, -hh);
    holePath.lineTo(hw - radius, -hh);
    holePath.absarc(hw - radius, -hh + radius, radius, -Math.PI / 2, 0, false);
    holePath.lineTo(hw, hh - radius);
    holePath.absarc(hw - radius, hh - radius, radius, 0, Math.PI / 2, false);
    holePath.lineTo(-hw + radius, hh);
    holePath.absarc(
      -hw + radius,
      hh - radius,
      radius,
      Math.PI / 2,
      Math.PI,
      false,
    );
    holePath.lineTo(-hw, -hh + radius);
    holePath.absarc(
      -hw + radius,
      -hh + radius,
      radius,
      Math.PI,
      Math.PI * 1.5,
      false,
    );
    shape.holes.push(holePath);

    const extrudeSettings = { depth: thickness, bevelEnabled: false };
    const wallGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    wallGeom.translate(0, 0, -thickness / 2);

    // Создаем отдельный чистый материал для торцов (reveal)
    const revealMaterial = new THREE.MeshStandardMaterial({
      color: wallMaterial.color,
      roughness: 0.9,
      metalness: 0.0,
    });

    // Настраиваем UV только для лицевых граней (группа 0)
    const posAttr = wallGeom.attributes.position;
    const uvAttr = wallGeom.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      // Если точка на фасаде или задней части — применяем мировые координаты для плитки
      if (Math.abs(z) > thickness / 2 - 0.01) {
        uvAttr.setXY(i, x, y);
      } else {
        // Для торцов сбрасываем UV в ноль, чтобы текстура там не тянулась
        uvAttr.setXY(i, 0, 0);
      }
    }
    uvAttr.needsUpdate = true;

    // ВАЖНО: передаем массив из двух материалов
    const wallMesh = new THREE.Mesh(wallGeom, [wallMaterial, revealMaterial]);
    wallMesh.receiveShadow = true;
    group.add(wallMesh);

    this.walls.push({
      mesh: wallMesh,
      isFloor: false,
      isBack: true,
      isDivider: true,
    });

    // 4. Создаем стекло в раму
    if (glassMaterial) {
      const glassShape = new THREE.Shape();
      glassShape.moveTo(-hw + radius, -hh);
      glassShape.lineTo(hw - radius, -hh);
      glassShape.absarc(
        hw - radius,
        -hh + radius,
        radius,
        -Math.PI / 2,
        0,
        false,
      );
      glassShape.lineTo(hw, hh - radius);
      glassShape.absarc(
        hw - radius,
        hh - radius,
        radius,
        0,
        Math.PI / 2,
        false,
      );
      glassShape.lineTo(-hw + radius, hh);
      glassShape.absarc(
        -hw + radius,
        hh - radius,
        radius,
        Math.PI / 2,
        Math.PI,
        false,
      );
      glassShape.lineTo(-hw, -hh + radius);
      glassShape.absarc(
        -hw + radius,
        -hh + radius,
        radius,
        Math.PI,
        Math.PI * 1.5,
        false,
      );

      const glassGeom = new THREE.ShapeGeometry(glassShape);
      const glassMesh = new THREE.Mesh(glassGeom, glassMaterial);
      glassMesh.position.z = 0;
      group.add(glassMesh);

      // 5. Создаем аккуратную пластиковую оконную раму
      const gWidth = 0.08;
      const gThick = 0.15;

      const outHw = hw;
      const outHh = hh;
      const outRad = radius;

      const gasketShape = new THREE.Shape();
      gasketShape.moveTo(-outHw + outRad, -outHh);
      gasketShape.lineTo(outHw - outRad, -outHh);
      gasketShape.absarc(
        outHw - outRad,
        -outHh + outRad,
        outRad,
        -Math.PI / 2,
        0,
        false,
      );
      gasketShape.lineTo(outHw, outHh - outRad);
      gasketShape.absarc(
        outHw - outRad,
        outHh - outRad,
        outRad,
        0,
        Math.PI / 2,
        false,
      );
      gasketShape.lineTo(-outHw + outRad, outHh);
      gasketShape.absarc(
        -outHw + outRad,
        outHh - outRad,
        outRad,
        Math.PI / 2,
        Math.PI,
        false,
      );
      gasketShape.lineTo(-outHw, -outHh + outRad);
      gasketShape.absarc(
        -outHw + outRad,
        -outHh + outRad,
        outRad,
        Math.PI,
        Math.PI * 1.5,
        false,
      );

      const inHw = hw - gWidth;
      const inHh = hh - gWidth;
      const inRad = radius - gWidth > 0 ? radius - gWidth : 0.01;

      const gasketHole = new THREE.Path();
      gasketHole.moveTo(-inHw + inRad, -inHh);
      gasketHole.lineTo(inHw - inRad, -inHh);
      gasketHole.absarc(
        inHw - inRad,
        -inHh + inRad,
        inRad,
        -Math.PI / 2,
        0,
        false,
      );
      gasketHole.lineTo(inHw, inHh - inRad);
      gasketHole.absarc(
        inHw - inRad,
        inHh - inRad,
        inRad,
        0,
        Math.PI / 2,
        false,
      );
      gasketHole.lineTo(-inHw + inRad, inHh);
      gasketHole.absarc(
        -inHw + inRad,
        inHh - inRad,
        inRad,
        Math.PI / 2,
        Math.PI,
        false,
      );
      gasketHole.lineTo(-inHw, -inHh + inRad);
      gasketHole.absarc(
        -inHw + inRad,
        -inHh + inRad,
        inRad,
        Math.PI,
        Math.PI * 1.5,
        false,
      );

      gasketShape.holes.push(gasketHole);

      const gasketGeom = new THREE.ExtrudeGeometry(gasketShape, {
        depth: gThick,
        bevelEnabled: false,
      });
      gasketGeom.translate(0, 0, -gThick / 2);

      // Светло-серый пластик/металл
      const gasketMat = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa, // Поменяли на 0x888888 (средне-серый). Можно поставить 0xaaaaaa для еще более светлого.
        roughness: 0.2, // Немного увеличили шероховатость, чтобы рамка не слишком сильно бликовала
        metalness: 0.2, // Оставили небольшую металличность для реализма
      });

      const gasketMesh = new THREE.Mesh(gasketGeom, gasketMat);
      gasketMesh.position.z = 0;
      group.add(gasketMesh);
    }

    this.scene.add(group);
    return group;
  }

  setAtmosphere(mode, configColors) {
    this.labProps.visible = false;

   // --- 1. ОБНОВЛЕНИЕ ТЕКСТУР И ГЛЯНЦА ---
for (const w of this.walls) {
  // Некоторые объекты лежат в walls только как препятствия для камеры.
  // Например двери лифта. Их нельзя перекрашивать плиткой.
  if (w.skipMaterialUpdate || w.mesh?.userData?.skipWallMaterialUpdate) {
    continue;
  }

  const applyToMat = (mat, props) => {
        if (Array.isArray(mat)) {
          if (mat[0]) Object.assign(mat[0], props);
          if (mat[1]) {
            mat[1].map = null;
            mat[1].normalMap = null;
            mat[1].roughnessMap = null;
          }
        } else if (mat) {
          Object.assign(mat, props);
        }
      };

      if (w.isFloor || w.isCeiling) {
        applyToMat(w.mesh.material, {
          map: null,
          normalMap: null,
          roughnessMap: null,
          color: new THREE.Color(0xffffff),
          roughness: w.isFloor ? 0.35 : 1.0,
        });
      } else {
        applyToMat(w.mesh.material, {
          map: tileTex,
          normalMap: tileNormalTex,
          roughnessMap: tileRoughTex,
          color: new THREE.Color(0xffffff),
          roughness: w.isDivider || w.mesh.position.z > 10 ? 1.0 : 0.5,
        });
      }

      const mats = Array.isArray(w.mesh.material)
        ? w.mesh.material
        : [w.mesh.material];
      mats.forEach((m) => {
        if (m) {
          m.metalness = 0.0;
          m.needsUpdate = true;
        }
      });
    }

    // --- УТИЛИТА ДЛЯ БЕЗОПАСНОЙ ПОКРАСКИ ---
    const safeSetColor = (material, colorHex) => {
      if (Array.isArray(material)) {
        if (material[0]) material[0].color.setHex(colorHex);
        if (material[1]) material[1].color.setHex(colorHex);
      } else if (material) {
        material.color.setHex(colorHex);
      }
    };

    // --- 2. РЕЖИМЫ ОСВЕЩЕНИЯ ---
    if (mode === "disco") {
      this.scene.background = new THREE.Color(configColors.BG_DISCO);
      this.scene.fog = new THREE.Fog(configColors.BG_DISCO, 40, 120);
      this.ambientLight.intensity = 0;
      this.holoLight.intensity = 8;
      this.ringMesh.material.emissiveIntensity = 0.8;
      this.floorLight.intensity = 4;
      this.leftLight.intensity = 0.2;
      this.fillLight.intensity = 0.2;
      this.labLampsGroup.visible = false;
      this.discoLampsGroup.visible = true;
      this.nightLights.visible = true;

      // Используем безопасную покраску для режима диско
      for (const w of this.walls) {
        safeSetColor(w.mesh.material, 0x666aa6);
      }

      this.renderer.toneMappingExposure = 1.1;
      this.bloomPass.strength = 0.7;
      this.bloomPass.threshold = 0.1;
      this.bloomPass.radius = 0.5;
    } else {
      // --- ПРАВКИ ДЛЯ МЯГКОГО РАССЕИВАНИЯ НА ПОТОЛКЕ ---

      // 1. Делаем фон сцены не черным (0x000000), а очень-очень темно-серым (0x050505).
      // Это поможет потолку не "сливаться" с пустотой.
      this.scene.background = new THREE.Color(0x050505);
      this.scene.fog = new THREE.Fog(0x050505, 50, 150);

      // 2. ВОЗВРАЩАЕМ ФОНОВЫЙ СВЕТ, НО С ОЧЕНЬ НИЗКОЙ ЯРКОСТЬЮ!
      // Поставь 0.05 (это всего 5% от нормы). Это значение "натурально" подсветит потолок
      // и верхние углы, имитируя отраженный свет от пола.
      this.ambientLight.intensity = 0.15; // <--- Было 0.0, стало 0.09

      // --- КОНЕЦ ПРАВОК ДЛЯ ПОТОЛКА ---

      // Остальной код в блоке else оставляем без изменений:
      this.ringMesh.material.color.setHex(0x0088ff);
      this.ringMesh.material.emissive.setHex(0x0055ff);
      this.floorLight.color.setHex(0x0088ff);
      this.holoLight.color.setHex(0x0088ff);
      this.baseMesh.material.color.setHex(0xffffff);
      this.holoLight.intensity = 20;
      this.ringMesh.material.emissiveIntensity = 1.2;
      this.floorLight.intensity = 10;
      this.leftLight.intensity = 0.0;
      this.fillLight.intensity = 0.0;
      this.labLampsGroup.visible = true;
      this.discoLampsGroup.visible = false;
      this.nightLights.visible = false;

      for (const w of this.walls) {
        safeSetColor(w.mesh.material, 0xffffff);
      }

      this.renderer.toneMappingExposure = 1.5;
      this.bloomPass.strength = 0.3;
      this.bloomPass.threshold = 0.9;
      this.bloomPass.radius = 0.2;
    }
  }

  updateAtmosphere(
    timeSec,
    mode,
    platformImpact,
    fanLevel,
    isMagnetEquipped,
    activeToolColor,
  ) {
    const isNight = mode === "disco";
    if (this.currentRingIntensity === undefined)
      this.currentRingIntensity = 1.2;
    const targetRingIntensity = isMagnetEquipped ? 0.0 : isNight ? 0.8 : 1.2;
    this.currentRingIntensity = THREE.MathUtils.lerp(
      this.currentRingIntensity,
      targetRingIntensity,
      0.05,
    );

    const maxIntensity = isNight ? 0.8 : 1.2;
    const ratio = Math.max(
      0,
      Math.min(this.currentRingIntensity / maxIntensity, 1.0),
    );
    this.ringMesh.material.emissiveIntensity = this.currentRingIntensity;
    this.ringMesh.material.opacity = THREE.MathUtils.lerp(0.15, 1.0, ratio);

    if (isNight) {
      const hue = (timeSec * 0.2) % 1;
      this.ringMesh.material.emissive.setHSL(hue, 0.7, 0.5);
      const rgbColor = new THREE.Color().setHSL(hue, 0.7, 0.5);
      const glassColor = new THREE.Color().setHSL(hue, 0.2, 0.95);
      this.floorLight.color.copy(rgbColor);
      this.holoLight.color.copy(rgbColor);
      this.baseMesh.material.color.copy(glassColor);
      this.discoSpots.forEach((spot, index) => {
        const speed = 1.5;
        const time = timeSec * speed + index * 2.0;
        const targetX = Math.sin(time) * 10;
        const targetZ = Math.cos(time * 0.73) * 8;
        spot.light.target.position.set(
          targetX,
          CONFIG.WORLD.FLOOR_LEVEL,
          targetZ,
        );
        spot.light.target.updateMatrixWorld();
        spot.housing.lookAt(spot.light.target.position);
        spot.housing.rotateX(Math.PI / 2);
      });
    } else {
      this.ringMesh.material.emissive.setHex(0x0055ff);
    }

    if (isMagnetEquipped) {
      this.magnetReticle.visible = true;
      if (activeToolColor)
        this.magnetReticle.material.color.setHex(activeToolColor);
      const pulse = 0.8 + 0.2 * Math.sin(timeSec * 8);
      this.magnetReticle.scale.set(pulse, pulse, 1);
      this.magnetReticle.material.opacity = pulse * 0.8;
    } else {
      this.magnetReticle.visible = false;
    }

    const dimFactor = 1.0 - platformImpact * 0.85;
    this.floorLight.intensity = (isNight ? 3 : 10) * dimFactor;
    this.holoLight.intensity = (isNight ? 6 : 20) * dimFactor;

    const env = -(Math.cos(Math.PI * fanLevel) - 1) / 2;
    const nightGlowFactor = isNight ? 0.5 : 1.0;
    this.ventOverlay.material.opacity =
      0.7 * env * (0.92 + 0.08 * Math.sin(timeSec * 6.5)) * nightGlowFactor;
    this.ventOverlay.material.emissiveIntensity = 2.1 * env * nightGlowFactor;
  }

  render() {
    this.composer.render();
  }
}
