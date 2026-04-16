import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

export class InputManager {
  constructor(camera, world, getPausedState, getCurrentTool, getInteractables, onDragChange, getRoomMeshes, getPaintTool) {
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
    this.mouseBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0 });
    this.world.addBody(this.mouseBody);
    
    this.movementPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.interactionTarget = new THREE.Vector3();
    this.interactionNormal = new THREE.Vector3(0, 1, 0);
    this.hasInteractionTarget = false;
    this.isPaintingStreamActive = false; 

    this.initEvents();
    this.initFullscreenListener();
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
    const intersection = this.raycaster.ray.intersectPlane(this.movementPlane, targetPoint);
    
    if (intersection) {
      const body = this.dragConstraint.bodyA;
      const h = (body.userData && body.userData.halfHeight) ? body.userData.halfHeight : 0.7;

      // Динамические лимиты высоты (пол и потолок)
      const floorLimit = CONFIG.WORLD.FLOOR_LEVEL + h + 0.05;
      const ceilingLimit = (CONFIG.WORLD.CEILING_HEIGHT || 18.0) - h - 0.5; 

      // Ограничиваем движение курсора по всем осям
      targetPoint.y = Math.max(floorLimit, Math.min(ceilingLimit, targetPoint.y));
      targetPoint.x = Math.max(-14.3, Math.min(14.3, targetPoint.x));
      targetPoint.z = Math.max(-14.3, Math.min(14.3, targetPoint.z));
      
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

  // --- ЛОГИКА FULLSCREEN ИКОНКИ ---
  initFullscreenListener() {
    const btnFull = document.getElementById('btn-fullscreen');
    if (!btnFull) return;

    const iconEnter = `<svg viewBox="0 0 24 24"><path d="M5 5h5V3H3v7h2V5zm5 14H5v-5H3v7h7v-2zm11-5h-2v5h-5v2h7v-7zm-2-9V5h-5V3h7v7h-2z"/></svg>`;
    const iconExit = `<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        btnFull.innerHTML = iconExit + '<span class="ghost-hint">EXIT</span>';
      } else {
        btnFull.innerHTML = iconEnter + '<span class="ghost-hint">FULLSCREEN</span>';
      }
    });
  }

  initEvents() {
    const input = document.getElementById('word-input');
    const btnApply = document.getElementById('btn-apply-word');
    const holoWrapper = document.getElementById('holo-wrapper');

    // Инициализация памяти инпута
    if (input) input.dataset.lastWord = input.value || "GOOGLE";

    const applyNewWord = () => {
      if (input) {
        input.dataset.lastWord = input.value.toUpperCase();
        input.blur();
        if (btnApply) btnApply.click();
      }
    };

    const cancelInput = () => {
      if (input && document.activeElement === input) {
        input.value = input.dataset.lastWord || "GOOGLE";
        input.blur();
      }
    };

    // --- 1. КЛАВИАТУРА ---
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.id === 'word-input') {
        if (e.key === 'Enter') applyNewWord();
        else if (e.key === 'Escape') cancelInput();
        else e.stopPropagation(); // Защита от игровых кнопок
      }
    }, true);

    // --- 2. УМНЫЙ БЛЮР ПРИ УХОДЕ С ПАНЕЛИ ---
    if (holoWrapper) {
      holoWrapper.addEventListener('mouseleave', cancelInput);
    }

    // --- 3. ЗАЩИТА ОТ СДВИГА ЭКРАНА ---
    window.addEventListener('scroll', () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    });

  // --- 4. МЫШЬ И ЛОГИКА ИНСТРУМЕНТОВ ---
    window.addEventListener('mousedown', (e) => {
      // Сброс фокуса с текста, если клик мимо инпута
      if (e.target.tagName !== 'INPUT' && e.target.id !== 'btn-apply-word') {
        cancelInput();
      }

      if (this.getPausedState()) return; 
      
      // Игнорируем нажатия ПО интерфейсу (кнопкам), чтобы не срабатывала физика/краска
      if (e.target.closest('#holo-wrapper') || e.target.closest('#hud-controls')) return;

      // === НОВАЯ СТРОКА: Игнорируем всё, кроме Левой Кнопки Мыши (0) ===
      if (e.button !== 0) return; 

      this.setInputCoords(e);
      this.isMouseDown = true;

      const currentTool = this.getCurrentTool();
      const paintTool = this.getPaintTool();
      const noTool = (currentTool === -1 || currentTool == null) && (paintTool === -1 || paintTool == null);

      // Режим кулака (если инструментов нет)
      if (e.target.tagName === 'CANVAS' && noTool) {
        e.preventDefault(); /* Блокируем стандартную белую стрелку Windows */
        document.body.classList.add('is-pressing');
      }

      // Работа Краски или Магнита
      if (!noTool) {
          if (paintTool !== -1 && paintTool != null) this.isPaintingStreamActive = true;
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

        if (body && body.pointToLocalFrame) {
          this.isDragging = true;
          this.mouseBody.position.copy(hit.point);
          const localPivot = body.pointToLocalFrame(new CANNON.Vec3(hit.point.x, hit.point.y, hit.point.z));
          this.dragConstraint = new CANNON.PointToPointConstraint(body, localPivot, this.mouseBody, new CANNON.Vec3(0, 0, 0));
          this.world.addConstraint(this.dragConstraint);
          this.movementPlane.constant = -hit.point.z;
          if (this.onDragChange) this.onDragChange(true);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.setInputCoords(e);
      
      const currentTool = this.getCurrentTool();
      const paintTool = this.getPaintTool();
      const noTool = (currentTool === -1 || currentTool == null) && (paintTool === -1 || paintTool == null);

      // Если мы что-то тащим или пшикаем краской — продолжаем обновлять цель, 
      // даже если мышь пролетает над интерфейсом
      if (this.isMouseDown && !noTool) {
        this.updateInteractionTarget();
      }
    });

    window.addEventListener('mouseup', () => {
      document.body.classList.remove('is-pressing');
      this.isPaintingStreamActive = false;
      this.isMouseDown = false;
      this.cancelDrag();
    });

    // Сброс инструментов на Правую Кнопку Мыши (ПКМ) на всякий случай
    window.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'CANVAS') {
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