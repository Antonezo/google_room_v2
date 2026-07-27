import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CONFIG } from "./config.js";

export class InputManager {
  constructor(
    camera,
    world,
    getPausedState,
    getCurrentTool,
    getInteractables,
    onDragChange,
    getRoomMeshes,
    getPaintTool,
  ) {
    this.camera = camera;
    this.world = world;
    this.getPausedState = getPausedState;
    this.getCurrentTool = getCurrentTool;
    this.getInteractables = getInteractables;
    this.onDragChange = onDragChange;
    this.getRoomMeshes = getRoomMeshes;
    this.getPaintTool = getPaintTool;

    this.mouse = new THREE.Vector2();
    this.inputCoord = new THREE.Vector2();

    this.raycaster = new THREE.Raycaster();
    this.isDragging = false;
    this.isMouseDown = false;
    this.dragConstraint = null;

    // Невидимое тело для курсора (для физического захвата)
    this.mouseBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      collisionFilterGroup: 0,
    });
    this.world.addBody(this.mouseBody);

    this.movementPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.interactionTarget = new THREE.Vector3();
    this.interactionNormal = new THREE.Vector3(0, 1, 0);
    this.hasInteractionTarget = false;
    this.isPaintingStreamActive = false;

    this.initEvents();
  }

  setInputCoords(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    this.inputCoord.set(x, y);
  }

  cancelDrag() {
    if (this.dragConstraint) {
      this.world.removeConstraint(this.dragConstraint);
      this.dragConstraint = null;
    }
    this.isDragging = false;
    this.onDragChange(false);
  }

  update(dt) {
    if (this.isDragging && this.dragConstraint) {
      this.raycaster.setFromCamera(this.inputCoord, this.camera);
      const targetPoint = new THREE.Vector3();
      const intersection = this.raycaster.ray.intersectPlane(
        this.movementPlane,
        targetPoint,
      );

      if (intersection) {
        const body = this.dragConstraint.bodyA;
        const h =
          body.userData && body.userData.halfHeight
            ? body.userData.halfHeight
            : 0.7;

        // Динамические лимиты высоты (пол и потолок)
        const floorLimit = CONFIG.WORLD.FLOOR_LEVEL + h + 0.05;
        const ceilingLimit = (CONFIG.WORLD.CEILING_HEIGHT || 18.0) - h - 0.5;

        // Высчитываем динамические границы на основе размера комнаты
        const halfRoom = CONFIG.WORLD.ROOM_SIZE / 2;
        const padding = 0.7; // Безопасный отступ от стен

        const minX = -halfRoom + padding;
        const maxX = halfRoom - padding;
        const minZ = -halfRoom + padding;
        // z = 14 — это примерная позиция стекла. В идеале её тоже можно вынести в CONFIG.
        // Пока оставляем динамичный расчет до предполагаемой перегородки.
        const maxZ = 14.0 - 2.5;

        // Ограничиваем движение курсора
        targetPoint.y = Math.max(
          floorLimit,
          Math.min(ceilingLimit, targetPoint.y),
        );
        targetPoint.x = Math.max(minX, Math.min(maxX, targetPoint.x));
        targetPoint.z = Math.max(minZ, Math.min(maxZ, targetPoint.z));

        this.mouseBody.position.copy(targetPoint);
      }
    }
  }

  updateInteractionTarget() {
    this.raycaster.setFromCamera(this.inputCoord, this.camera);
    const intersects = this.raycaster.intersectObjects(this.getRoomMeshes());

    if (intersects.length > 0) {
      this.interactionTarget.copy(intersects[0].point);
      const worldNormal = intersects[0].face.normal.clone();
      worldNormal.transformDirection(intersects[0].object.matrixWorld);
      this.interactionNormal.copy(worldNormal);
      this.hasInteractionTarget = true;
    } else {
      this.hasInteractionTarget = false;
    }
  }

  initEvents() {
    // --- 3. ЗАЩИТА ОТ СДВИГА ЭКРАНА ---
    window.addEventListener("scroll", () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    });

    // --- 4. МЫШЬ И ЛОГИКА ИНСТРУМЕНТОВ ---
    window.addEventListener("mousedown", (e) => {
      if (this.getPausedState()) return;

      // Физическое взаимодействие выполняется только левой кнопкой мыши.
      if (e.button !== 0) return;

      this.setInputCoords(e);
      this.isMouseDown = true;

      const currentTool = this.getCurrentTool();
      const paintTool = this.getPaintTool();
      const noTool =
        (currentTool === -1 || currentTool == null) &&
        (paintTool === -1 || paintTool == null);

      // Режим кулака (если инструментов нет)
      if (e.target.tagName === "CANVAS" && noTool) {
        e.preventDefault(); /* Блокируем стандартную белую стрелку Windows */
        document.body.classList.add("is-pressing");
      }

      // Работа Краски или Магнита
      if (!noTool) {
        if (paintTool !== -1 && paintTool != null)
          this.isPaintingStreamActive = true;
        this.updateInteractionTarget();
        return;
      }

      // Захват объектов (только если нет инструментов)
      this.raycaster.setFromCamera(this.inputCoord, this.camera);
      const interactables = this.getInteractables();
      if (!interactables || !interactables.meshes) return;

      const intersects = this.raycaster.intersectObjects(interactables.meshes);
      if (intersects.length > 0) {
        const hit = intersects[0];
        const body = interactables.getBodyByMesh(hit);

        // === ПРОВЕРКА НА ИГРОКА ===
        // Если у тела масса 20 (как у шара-игрока), запрещаем захват!
        if (body && body.mass === 20) return;

        if (body && body.pointToLocalFrame) {
          this.isDragging = true;
          this.mouseBody.position.copy(hit.point);
          const localPivot = body.pointToLocalFrame(
            new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z),
          );
          this.dragConstraint = new CANNON.PointToPointConstraint(
            body,
            localPivot,
            this.mouseBody,
            new CANNON.Vec3(0, 0, 0),
          );
          this.world.addConstraint(this.dragConstraint);
          this.movementPlane.constant = -hit.point.z;
          if (this.onDragChange) this.onDragChange(true);
        }
      }
    });

    window.addEventListener("mousemove", (e) => {
      this.setInputCoords(e);

      const currentTool = this.getCurrentTool();
      const paintTool = this.getPaintTool();
      const noTool =
        (currentTool === -1 || currentTool == null) &&
        (paintTool === -1 || paintTool == null);

      // Если мы что-то тащим или пшикаем краской — продолжаем обновлять цель,
      // даже если мышь пролетает над интерфейсом
      if (this.isMouseDown && !noTool) {
        this.updateInteractionTarget();
      }
    });

    window.addEventListener("mouseup", () => {
      document.body.classList.remove("is-pressing");
      this.isPaintingStreamActive = false;
      this.isMouseDown = false;
      this.cancelDrag();
    });

    // Сброс инструментов на Правую Кнопку Мыши (ПКМ) на всякий случай
    window.addEventListener("contextmenu", (e) => {
      if (e.target.tagName === "CANVAS") {
        e.preventDefault();
      }
    });
  }
}

export class GameObject {
  constructor(world, scene, mesh, body) {
    this.world = world;
    this.scene = scene;
    this.mesh = mesh;
    this.body = body;
    this.world.addBody(this.body);
    this.scene.add(this.mesh);
  }

  update() {
    if (this.mesh && this.body) {
      this.mesh.position.copy(this.body.position);
      this.mesh.quaternion.copy(this.body.quaternion);
    }
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }
}
