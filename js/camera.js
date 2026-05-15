import * as THREE from "three";

export class CameraController {
  constructor(camera, cameraPivot, sceneManager) {
    this.camera = camera;
    this.cameraPivot = cameraPivot;
    this.sceneManager = sceneManager;

    this.targetZoom = 15.0;
    this.currentZoom = 15.0;

    // Реальная дистанция камеры после всех ограничений.
    // Нужна, чтобы камера не дёргалась при выходе из узких мест.
    this.actualDistance = 15.0;

// Плавный лимит высоты камеры.
// Нужен, чтобы после выхода из лифта/тоннеля камера не прыгала резко наверх.
this.currentMaxCameraY = 9.5;

    this.raycaster = new THREE.Raycaster();

    // Преаллокация векторов
    this._idealLocalPos = new THREE.Vector3();
    this._idealWorldPos = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._testLocalPos = new THREE.Vector3();
    this._testWorldPos = new THREE.Vector3();

    // Кеш стен
    this.cachedWallsMeshes = [];

    this.initZoomListener();
  }

  initZoomListener() {
    window.addEventListener("wheel", (e) => {
      const zoomSpeed = 0.005;
      this.targetZoom += e.deltaY * zoomSpeed;

      // В узких местах камера всё равно сама приблизится,
      // но обычный максимум можно оставить большим.
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom, 2.0, 40.0);
    });
  }

  invalidateWallsCache() {
    this.cachedWallsMeshes = [];
  }

  getWallsMeshes() {
    // ВАЖНО:
    // Просто сравнивать длину массива недостаточно,
    // потому что комнаты могут пересобираться с тем же числом стен.
    // Поэтому берём актуальные видимые стены каждый кадр.
    if (!this.sceneManager || !Array.isArray(this.sceneManager.walls)) {
      return [];
    }

    this.cachedWallsMeshes = this.sceneManager.walls
      .map((w) => w.mesh)
      .filter((mesh) => mesh && mesh.visible);

    return this.cachedWallsMeshes;
  }

  update(dt, playerPosition) {
    const wallsMeshes = this.getWallsMeshes();

    // === 1. ЦЕЛЬ КАМЕРЫ ===
    // Pivot всегда привязан к игроку, но смотрит чуть выше шара.
    const targetPos = playerPosition.clone();
    targetPos.y += 4.0;

    // === 2. ДИНАМИЧЕСКИЙ ПОТОЛОК НАД ИГРОКОМ ===
    // Если игрок в лифте/тоннеле, потолок ниже обычного.
    this.raycaster.set(playerPosition, new THREE.Vector3(0, 1, 0));
    const ceilingIntersects = this.raycaster.intersectObjects(wallsMeshes, false);

 let desiredMaxCameraY = 9.5;

if (ceilingIntersects.length > 0) {
  const detectedCeilingY = ceilingIntersects[0].point.y;

  // Отступ от потолка, чтобы камера не касалась плоскости.
  desiredMaxCameraY = Math.min(desiredMaxCameraY, detectedCeilingY - 0.55);
}

// Если потолок стал ниже — реагируем сразу.
// Если потолок "пропал" после выхода из лифта — отпускаем ограничение плавно,
// чтобы камера не прыгала поверх лифта.
if (desiredMaxCameraY < this.currentMaxCameraY) {
  this.currentMaxCameraY = desiredMaxCameraY;
} else {
  this.currentMaxCameraY = THREE.MathUtils.lerp(
    this.currentMaxCameraY,
    desiredMaxCameraY,
    Math.min(1 * dt, 1)
  );
}

const maxCameraY = this.currentMaxCameraY;

targetPos.y = Math.min(targetPos.y, maxCameraY);
    this.cameraPivot.position.lerp(targetPos, Math.min(15 * dt, 1));
    this.cameraPivot.updateMatrixWorld();

    this.cameraPivot.rotation.z = 0;
    this.camera.rotation.z = 0;

    // === 3. ЖЕЛАЕМАЯ ДИСТАНЦИЯ ===
    this.currentZoom = THREE.MathUtils.lerp(
      this.currentZoom,
      this.targetZoom,
      Math.min(10 * dt, 1)
    );

    this._idealLocalPos.set(0, 0, this.currentZoom);
    this._idealWorldPos.copy(this._idealLocalPos).applyMatrix4(this.cameraPivot.matrixWorld);

    const pivotPos = this.cameraPivot.position;

    this._rayDir.subVectors(this._idealWorldPos, pivotPos);
    const maxDist = this._rayDir.length();

    if (maxDist < 0.001) {
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      return;
    }

    this._rayDir.normalize();

  // === 4. ПРОВЕРКА СТЕН МЕЖДУ ИГРОКОМ И КАМЕРОЙ ===
// Раньше был один raycast по центру.
// Из-за этого камера могла "пролезать" через узкие щели над дверями лифта.
// Теперь проверяем несколько лучей, как будто камера имеет радиус.

let finalDist = maxDist;

// Радиус "толстой камеры".
// Чем больше — тем меньше шанс пролезть через щель.
// Если камера станет слишком сильно приближаться к шару, уменьши до 0.45.
const cameraRadius = 0.5;

// Оси камеры в мировом пространстве
const cameraRight = new THREE.Vector3(1, 0, 0)
  .applyQuaternion(this.cameraPivot.quaternion)
  .normalize();

const cameraUp = new THREE.Vector3(0, 1, 0)
  .applyQuaternion(this.cameraPivot.quaternion)
  .normalize();

// Проверяем центр + края условной сферы камеры
const cameraRayOffsets = [
  [0, 0],
  [cameraRadius, 0],
  [-cameraRadius, 0],
  [0, cameraRadius],
  [0, -cameraRadius],
  [cameraRadius * 0.7, cameraRadius * 0.7],
  [-cameraRadius * 0.7, cameraRadius * 0.7],
  [cameraRadius * 0.7, -cameraRadius * 0.7],
  [-cameraRadius * 0.7, -cameraRadius * 0.7],
];

for (const [offsetX, offsetY] of cameraRayOffsets) {
  const testWorldPos = this._idealWorldPos
    .clone()
    .addScaledVector(cameraRight, offsetX)
    .addScaledVector(cameraUp, offsetY);

  const testDir = testWorldPos.clone().sub(pivotPos);
  const testDist = testDir.length();

  if (testDist < 0.001) continue;

  testDir.normalize();

  this.raycaster.set(pivotPos, testDir);
  const wallIntersects = this.raycaster.intersectObjects(wallsMeshes, false);

  if (wallIntersects.length > 0 && wallIntersects[0].distance < testDist) {
    finalDist = Math.min(
      finalDist,
      Math.max(0.55, wallIntersects[0].distance - 0.85)
    );
  }
}

    // === 5. ОГРАНИЧЕНИЕ ПО ВЫСОТЕ САМОЙ КАМЕРЫ ===
    // Это главный фикс для лифта/тоннелей.
    // Даже если raycast не поймал потолок идеально,
    // камера не имеет права оказаться выше maxCameraY.
    const cameraWorldYAtDist = (dist) => {
      this._testLocalPos.set(0, 0, dist);
      this._testWorldPos.copy(this._testLocalPos).applyMatrix4(this.cameraPivot.matrixWorld);
      return this._testWorldPos.y;
    };

    if (cameraWorldYAtDist(finalDist) > maxCameraY) {
      let low = 0.55;
      let high = finalDist;

      // Бинарный поиск: ищем максимальную дистанцию,
      // при которой камера всё ещё ниже потолка.
      for (let i = 0; i < 8; i++) {
        const mid = (low + high) / 2;

        if (cameraWorldYAtDist(mid) > maxCameraY) {
          high = mid;
        } else {
          low = mid;
        }
      }

      finalDist = low;
    }

// === 6. СГЛАЖИВАНИЕ ДИСТАНЦИИ ===
// Камера может плавно отдаляться и приближаться,
// но если при резком повороте мыши она иначе окажется за стеной,
// делаем аварийный мгновенный clamp.

const isCameraGettingCloser = finalDist < this.actualDistance;

// Насколько резко камера должна была приблизиться за один кадр.
const distanceDrop = this.actualDistance - finalDist;

// Если препятствие внезапно оказалось очень близко,
// не сглаживаем, иначе камера на 1 кадр вылетит за текстуры.
const emergencyClamp = isCameraGettingCloser && distanceDrop > 1.2;

if (emergencyClamp) {
  this.actualDistance = finalDist;
} else {
  const distanceLerpSpeed = isCameraGettingCloser ? 14.0 : 6.0;

  this.actualDistance = THREE.MathUtils.lerp(
    this.actualDistance,
    finalDist,
    Math.min(distanceLerpSpeed * dt, 1)
  );

  // Жёсткая страховка:
  // даже после lerp камера не имеет права быть дальше безопасной дистанции.
  if (this.actualDistance > finalDist && isCameraGettingCloser) {
    this.actualDistance = finalDist;
  }
}

this.camera.position.set(0, 0, this.actualDistance);
this.camera.rotation.set(0, 0, 0);
  }
}