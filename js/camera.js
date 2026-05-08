import * as THREE from 'three';

export class CameraController {
  constructor(camera, cameraPivot, sceneManager) {
    this.camera = camera;
    this.cameraPivot = cameraPivot;
    this.sceneManager = sceneManager;
    
    this.targetZoom = 15.0;
    this.currentZoom = 15.0;
    this.raycaster = new THREE.Raycaster();

    // Преаллокация векторов
    this._idealLocalPos = new THREE.Vector3();
    this._idealWorldPos = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    
    // КЕШ для стен, чтобы не убивать память каждый кадр
    this.cachedWallsMeshes = []; 
    
    this.initZoomListener();
  }

  initZoomListener() {
    window.addEventListener("wheel", (e) => {
      const zoomSpeed = 0.005;
      this.targetZoom += e.deltaY * zoomSpeed;
      this.targetZoom = THREE.MathUtils.clamp(this.targetZoom, 2.0, 40.0);
    });
  }

  // Умный геттер, который обновляет массив только если добавилась новая стена
  getWallsMeshes() {
    if (this.cachedWallsMeshes.length !== this.sceneManager.walls.length) {
      this.cachedWallsMeshes = this.sceneManager.walls.map((w) => w.mesh);
    }
    return this.cachedWallsMeshes;
  }

  update(dt, playerPosition) {
    const targetPos = playerPosition.clone();
    targetPos.y += 4.0; // Камера смотрит чуть выше головы игрока 

    // Берем готовый массив из кеша (0 нагрузки на систему)
    const wallsMeshes = this.getWallsMeshes(); 

    // === ДИНАМИЧЕСКИЙ ПОТОЛОК ===
    this.raycaster.set(playerPosition, new THREE.Vector3(0, 1, 0));
    const ceilingIntersects = this.raycaster.intersectObjects(wallsMeshes);

    let maxCameraY = 9.5; 
    if (ceilingIntersects.length > 0) {
      const detectedCeilingY = ceilingIntersects[0].point.y;
      maxCameraY = Math.min(9.5, detectedCeilingY - 0.5);
    }

    targetPos.y = Math.min(targetPos.y, maxCameraY);

    this.cameraPivot.position.lerp(targetPos, 15 * dt);
    this.cameraPivot.updateMatrixWorld();

    this.cameraPivot.rotation.z = 0;
    this.camera.rotation.z = 0;

    // 2. Умный Spring Arm
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, 10 * dt);
    
    this._idealLocalPos.set(0, 0, this.currentZoom);
    this._idealWorldPos.copy(this._idealLocalPos).applyMatrix4(this.cameraPivot.matrixWorld);
    
    const pivotPos = this.cameraPivot.position;
    this._rayDir.subVectors(this._idealWorldPos, pivotPos);
    const maxDist = this._rayDir.length();
    this._rayDir.normalize();

    this.raycaster.set(pivotPos, this._rayDir);
    const wallIntersects = this.raycaster.intersectObjects(wallsMeshes);

    let finalDist = maxDist;
    if (wallIntersects.length > 0 && wallIntersects[0].distance < maxDist) {
      finalDist = Math.max(0.4, wallIntersects[0].distance - 0.9);
    }

    this.camera.position.set(0, 0, finalDist);
    this.camera.rotation.set(0, 0, 0);
  }
}