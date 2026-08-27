import * as THREE from "three";

import {
  drawUiGlass,
} from "./ui-glass.js";

export class SectorWheel3D {
  constructor(hostElement, options = {}) {
    this.host = hostElement;
    this.onSelect =
      typeof options.onSelect === "function" ? options.onSelect : null;

    if (!this.host) {
      console.warn("[SectorWheel3D] host не найден.");
      return;
    }

    this.scene = new THREE.Scene();

    const viewHeight = 4.6;

    this.camera = new THREE.OrthographicCamera(
      -viewHeight / 2,
      viewHeight / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      100,
    );

    this.camera.position.set(0, -1.8, 5.4);
    this.camera.lookAt(0, 0.1, 0);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderer.setClearColor(0x000000, 0);

    this.renderer.domElement.className = "sector-wheel-three-canvas";

    this.host.appendChild(this.renderer.domElement);

    this.wheelGroup = new THREE.Group();
    this.scene.add(this.wheelGroup);

    this.wheelGroup.scale.set(2.5, 1.15, 1.62);
    this.wheelGroup.position.y = -0.66;

    // Неподвижный корпус находится прямо в wheelGroup.

    // Карточки — отдельная вращающаяся группа.
    this.cardsGroup = new THREE.Group();
    this.wheelGroup.add(this.cardsGroup);

    this.items = [];
    this.cardMeshes = [];

    this.currentCenterIndex = 0;
    this.targetCenterIndex = 0;

    this.sectorAngle = 0;
    this.isAnimating = false;

    this.wheelAnimationFrame = null;
    // Raycaster для определения карточки под курсором.
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.hoveredCard = null;
    this.hoverAnimationFrame = null;
    this.btnPrev = document.getElementById("btn-sector-prev");

    this.btnNext = document.getElementById("btn-sector-next");

    this.createTestWheel();

    this.bindControls();
    this.bindPointerEvents();

    this.resize();
    this.render();

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });

    this.resizeObserver.observe(this.host);

    window.addEventListener("resize", () => {
      requestAnimationFrame(() => {
        this.resize();
      });
    });

    document.addEventListener("fullscreenchange", () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.resize();
        });
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.resize();
          });
        });
      }
    });
  }

  createTestWheel() {
    const radius = 1.34;
    const height = 1.7;

    const sectorAngle = THREE.MathUtils.degToRad(30);

    this.sectorAngle = sectorAngle;

    const visibleSectorCount = 5;

    const bodyAngle = sectorAngle * (visibleSectorCount + 1.2);

    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x78e6f7,

      transparent: true,
      opacity: 0.28,

      roughness: 0.14,
      metalness: 0.04,

      transmission: 0.2,
      thickness: 0.3,

      emissive: 0x53dfff,
      emissiveIntensity: 0.16,

      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const bodyGeometry = new THREE.CylinderGeometry(
      radius,
      radius,
      height,
      96,
      1,
      true,
      -bodyAngle / 2,
      bodyAngle,
    );

    this.bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);

    this.wheelGroup.add(this.bodyMesh);

    this.createWheelFrame({
      radius,
      height,
      sectorAngle,
    });

    this.wheelGroup.rotation.x = 0;
  }

  createWheelFrame({ radius, height, sectorAngle }) {
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xe9fdff,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    });

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x5be8ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    const outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x38dfff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });

    const visibleSectorCount = 5;

    const totalAngle = sectorAngle * (visibleSectorCount + 1.2);

    const startAngle = -totalAngle / 2;
    const endAngle = totalAngle / 2;

    const buildArcCurve = (y) => {
      const points = [];
      const segments = 120;

      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const angle = startAngle + (endAngle - startAngle) * t;

        points.push(
          new THREE.Vector3(
            Math.sin(angle) * radius,
            y,
            Math.cos(angle) * radius,
          ),
        );
      }

      return new THREE.CatmullRomCurve3(points);
    };

    const createArcLayer = (y, tubeRadius, radialSegments, material) => {
      const curve = buildArcCurve(y);

      const geometry = new THREE.TubeGeometry(
        curve,
        120,
        tubeRadius,
        radialSegments,
        false,
      );

      const mesh = new THREE.Mesh(geometry, material);

      this.wheelGroup.add(mesh);
    };

    const createArc = (y) => {
      // Внешний слабый ореол
      createArcLayer(y, 0.06, 16, outerGlowMaterial);

      // Средний ореол
      createArcLayer(y, 0.042, 14, glowMaterial);

      // Яркое внутреннее ядро
      createArcLayer(y, 0.022, 12, coreMaterial);
    };

    createArc(height / 2);
    createArc(-height / 2);
  }

  bindControls() {
  this.btnPrev?.addEventListener("click", () => {
    this.stepWheel(-1);
  });

  this.btnNext?.addEventListener("click", () => {
    this.stepWheel(1);
  });

  window.addEventListener(
    "wheel",
    (event) => {
      const sectorsScreen =
        document.querySelector(".start-menu-ui.is-sectors-open");

      // Колесо управляет барабаном только на экране выбора уровня.
      if (!sectorsScreen || !this.items.length) {
        return;
      }

      // Вертикальное колесо мыши.
      // Горизонтальный жест тачпада тоже поддерживаем.
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;

      if (Math.abs(delta) < 2) {
        return;
      }

      event.preventDefault();

      const now = performance.now();

      // Защита от пачки wheel-событий от одного движения колесика.
      if (
        this.lastWheelStepTime &&
        now - this.lastWheelStepTime < 140
      ) {
        return;
      }

      this.lastWheelStepTime = now;

      this.stepWheel(delta > 0 ? 1 : -1);
    },
    {
      passive: false,
      capture: true,
    },
  );
}

  bindPointerEvents() {
    this.host.addEventListener("pointermove", (event) => {
      // Стрелки находятся внутри того же host.
      // Их Raycaster обрабатывать не должен.
      if (event.target.closest?.(".sector-wheel-arrow")) {
        this.clearHoveredCard();
        return;
      }

      this.updatePointerRaycast(event);
    });

    this.host.addEventListener("pointerleave", () => {
      this.clearHoveredCard();
    });
    this.host.addEventListener("click", (event) => {
      if (event.target.closest?.(".sector-wheel-arrow")) {
        return;
      }

      this.handleCardClick(event);
    });
  }

updatePointerRaycast(event) {
  if (
    this.isAnimating ||
    !this.cardMeshes.length
  ) {
    this.clearHoveredCard();
    return;
  }

  const rect =
    this.renderer.domElement
      .getBoundingClientRect();

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    this.clearHoveredCard();
    return;
  }

  this.pointer.x =
    ((event.clientX - rect.left) /
      rect.width) *
      2 -
    1;

  this.pointer.y =
    -(
      (event.clientY - rect.top) /
      rect.height
    ) *
      2 +
    1;

  this.raycaster.setFromCamera(
    this.pointer,
    this.camera,
  );

  const intersections =
    this.raycaster.intersectObjects(
      this.cardMeshes,
      false,
    );

  if (!intersections.length) {
    this.clearHoveredCard();
    return;
  }

  const card =
    intersections[0].object;

  const isCenter =
    card.userData.itemIndex ===
    this.currentCenterIndex;

  const isLocked =
    card.userData.locked === true;

  // Hover разрешён ТОЛЬКО
  // центральной открытой карточке.
  if (!isCenter || isLocked) {
    this.clearHoveredCard();
    return;
  }

  this.setHoveredCard(card);
}

handleCardClick(event) {
  if (
    this.isAnimating ||
    !this.cardMeshes.length
  ) {
    return;
  }

  const rect =
    this.renderer.domElement
      .getBoundingClientRect();

  if (
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return;
  }

  this.pointer.x =
    ((event.clientX - rect.left) /
      rect.width) *
      2 -
    1;

  this.pointer.y =
    -(
      (event.clientY - rect.top) /
      rect.height
    ) *
      2 +
    1;

  this.raycaster.setFromCamera(
    this.pointer,
    this.camera,
  );

  const intersections =
    this.raycaster.intersectObjects(
      this.cardMeshes,
      false,
    );

  if (!intersections.length) {
    return;
  }

  const card =
    intersections[0].object;

  const cardIndex =
    card.userData.itemIndex;

  const sectorId =
    card.userData.sectorId;

  const isLocked =
    card.userData.locked === true;

  const isCenter =
    cardIndex ===
    this.currentCenterIndex;

  // =================================================
  // КЛИКАБЕЛЬНАЯ ЗОНА БАРАБАНА:
  //
  //       -2  -1  [0]  +1  +2
  //
  // Всё, что дальше двух позиций от центра,
  // может быть немного видно по краям,
  // но кликабельным НЕ является.
  // =================================================

  const distanceFromCenter =
    Math.abs(
      cardIndex -
      this.currentCenterIndex,
    );

  if (distanceFromCenter > 2) {
    return;
  }

  // Боковая карточка из пяти рабочих:
  // только переводим её в центр.
  if (!isCenter) {
    this.clearHoveredCard();

    this.targetCenterIndex =
      cardIndex;

    this.animateWheelToTarget();

    return;
  }

  // Центральная закрытая карточка:
  // уровень не запускаем.
  if (isLocked) {
    return;
  }

  // Центральная открытая:
  // второй клик подтверждает выбор.
  if (
    sectorId == null ||
    !this.onSelect
  ) {
    return;
  }

  this.onSelect(sectorId);
}

  setCardRadialOffset(card, offset = 0) {
    const angle = card.rotation.y;

    card.position.x = Math.sin(angle) * offset;

    card.position.z = Math.cos(angle) * offset;
  }

  animateCardHover(card, targetOffset, targetScale, duration = 180) {
    if (!card) {
      return;
    }

    if (this.hoverAnimationFrame) {
      cancelAnimationFrame(this.hoverAnimationFrame);

      this.hoverAnimationFrame = null;
    }

    const startOffset = card.userData.hoverOffset ?? 0;

    const startScale = card.scale.x;

    const startTime = performance.now();

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed = now - startTime;

      const t = Math.min(elapsed / duration, 1);

      const eased = easeOutCubic(t);

      const currentOffset = THREE.MathUtils.lerp(
        startOffset,
        targetOffset,
        eased,
      );

      const currentScale = THREE.MathUtils.lerp(startScale, targetScale, eased);

      card.userData.hoverOffset = currentOffset;

      this.setCardRadialOffset(card, currentOffset);

      card.scale.setScalar(currentScale);

      this.render();

      if (t < 1) {
        this.hoverAnimationFrame = requestAnimationFrame(tick);

        return;
      }

      card.userData.hoverOffset = targetOffset;

      card.scale.setScalar(targetScale);

      this.hoverAnimationFrame = null;

      this.render();
    };

    this.hoverAnimationFrame = requestAnimationFrame(tick);
  }

  setHoveredCard(card) {
    if (this.hoveredCard === card) {
      return;
    }

    this.clearHoveredCard();

    this.hoveredCard = card;

    this.host.dataset.sectorHover = String(card.userData.sectorId);

    this.host.style.cursor = "var(--cur-ui-arrow)";

    this.animateCardHover(card, 0.055, 1.045, 200);
  }

  clearHoveredCard() {
    if (!this.hoveredCard) {
      return;
    }

    const card = this.hoveredCard;

    this.hoveredCard = null;

    delete this.host.dataset.sectorHover;

    this.host.style.cursor = "";

    this.animateCardHover(card, 0, 1, 220);
  }

  clearLevelCards() {
    for (const card of this.cardMeshes) {
      if (card.material?.map) {
        card.material.map.dispose();
      }

      card.geometry?.dispose();
      card.material?.dispose();
    }

    this.cardMeshes.length = 0;

    this.cardsGroup.clear();
  }

  createLevelCards() {
    this.clearLevelCards();

    if (!this.items.length) {
      return;
    }

    const radius = 1.34;
    const height = 1.7;

    const cardRadius = radius + 0.012;

    const cardHeight = height * 0.84;

    const cardAngle = this.sectorAngle * 0.84;

    this.items.forEach((item, index) => {
      const geometry = new THREE.CylinderGeometry(
        cardRadius,
        cardRadius,
        cardHeight,
        36,
        1,
        true,
        -cardAngle / 2,
        cardAngle,
      );

      const texture = this.createSectorTexture(item, {
        isCentered: index === this.currentCenterIndex,
      });

      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: texture,

        transparent: true,
        opacity: 1,

        side: THREE.FrontSide,
        depthWrite: true,
      });

      const card = new THREE.Mesh(geometry, material);
      const focusGeometry =
  new THREE.CylinderGeometry(
    cardRadius + 0.004,
    cardRadius + 0.004,
    cardHeight,
    36,
    1,
    true,
    -cardAngle / 2,
    cardAngle,
  );

const focusTexture =
  this.createFocusBorderTexture();

const focusMaterial =
  new THREE.MeshBasicMaterial({
    map: focusTexture,
    transparent: true,
    opacity: 0,
    side: THREE.FrontSide,
    depthWrite: false,
  });

const focusMesh =
  new THREE.Mesh(
    focusGeometry,
    focusMaterial,
  );

focusMesh.renderOrder = 10;

card.add(focusMesh);

card.userData.focusMesh =
  focusMesh;

      card.rotation.y = index * this.sectorAngle;

      card.userData.sectorId = item.sectorId;

      card.userData.locked = item.locked;

      card.userData.current = item.current;

      card.userData.itemIndex = index;

      this.cardsGroup.add(card);
      this.cardMeshes.push(card);
    });
  }

updateCardFocusVisuals() {
  if (!this.cardMeshes.length) {
    return;
  }

  for (const card of this.cardMeshes) {
    const focusMesh =
      card.userData.focusMesh;

    if (!focusMesh?.material) {
      continue;
    }

    // Реальный угол карточки относительно камеры:
    // её собственный угол + поворот всей группы.
    const angle =
      THREE.MathUtils.euclideanModulo(
        card.rotation.y +
          this.cardsGroup.rotation.y +
          Math.PI,
        Math.PI * 2,
      ) - Math.PI;

    const distance =
      Math.abs(angle);

    // При угле 0 карточка строго в центре.
    // На расстоянии одного сектора подсветка уже исчезает.
    let focus =
      1 -
      distance /
        this.sectorAngle;

    focus =
      THREE.MathUtils.clamp(
        focus,
        0,
        1,
      );

    // Smoothstep — чтобы переход был мягким.
    focus =
      focus *
      focus *
      (3 - 2 * focus);

    focusMesh.material.opacity =
      focus;
  }
}

  setItems(items = []) {
    this.items = Array.isArray(items) ? items : [];

    const currentIndex = this.items.findIndex((item) => item?.current === true);

    this.currentCenterIndex = currentIndex >= 0 ? currentIndex : 0;
    this.targetCenterIndex = this.currentCenterIndex;

    this.createLevelCards();

    // Сразу ставим текущий уровень
    // фронтально перед камерой.
    this.cardsGroup.rotation.y = -this.currentCenterIndex * this.sectorAngle;
    this.updateCardFocusVisuals();

    this.updateArrowStates();

    this.render();
  }

  createSectorTexture(item, options = {}) {
    const locked = item?.locked === true;
    const isGameCurrent = item?.current === true;
    const isCentered = options.isCentered === true;
    const canvas = document.createElement("canvas");

    canvas.width = 1024;
    canvas.height = 1024;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return null;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // =========================================================
    // ОСНОВНАЯ КАРТОЧКА
    // =========================================================

    const cardX = 70;
    const cardY = 76;
    const cardW = 884;
    const cardH = 872;
    const radius = 52;

    let glassVariant = "normal";

if (locked) {
  glassVariant = "locked";
} else if (isGameCurrent) {
  glassVariant = "highlight";
}

drawUiGlass(ctx, {
  x: cardX,
  y: cardY,
  width: cardW,
  height: cardH,
  radius,
  variant: glassVariant,

  // У карточек секторов рамка раньше была 6 px.
  borderWidth: 6,

  // Текущий сектор получает светлый фон,
  // но отдельная focus-рамка у него уже есть.
  // Поэтому здесь не усиливаем основную рамку.
  highlightBorder: false,
});

    // =========================================================
    // БОЛЬШОЙ НОМЕР
    // =========================================================

    const number = String(item?.sectorId ?? "").padStart(2, "0");

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.shadowColor = locked
      ? "rgba(180,225,235,0.10)"
      : "rgba(135,240,255,0.18)";
    ctx.shadowBlur = 2;

    ctx.fillStyle = locked
      ? "rgba(236,242,245,0.86)"
      : "rgba(252,254,255,0.99)";

    // Огромный номер — занимает почти весь квадрат.
    ctx.font = "700 300px Orbitron, Arial, sans-serif";

    ctx.fillText(number, 512, 380, 620);

    // =========================================================
    // ПОДПИСЬ "СЕКТОР"
    // =========================================================

    ctx.shadowBlur = 0;

    ctx.fillStyle = locked
      ? "rgba(220,236,242,0.82)"
      : "rgba(236,249,255,0.96)";

    ctx.font = "700 104px Orbitron, Arial, sans-serif";

    ctx.fillText("СЕКТОР", 512, 655);

    // =========================================================
    // ЗАМОЧЕК ДЛЯ LOCKED
    // =========================================================

    if (locked) {
      ctx.save();

      ctx.strokeStyle = "rgba(220,236,242,0.84)";
      ctx.fillStyle = "rgba(212,228,232,0.76)";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.arc(512, 760, 26, Math.PI, 0, false);
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect(478, 760, 68, 54, 10);
      ctx.fill();

      ctx.fillStyle = "rgba(36,60,70,0.88)";

      ctx.beginPath();
      ctx.arc(512, 782, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillRect(509, 782, 6, 13);

      ctx.restore();
    }

   

  
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    texture.generateMipmaps = true;

    if (this.renderer) {
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    }

    texture.needsUpdate = true;

    return texture;
  }

  createFocusBorderTexture() {
  const canvas =
    document.createElement("canvas");

  canvas.width = 1024;
  canvas.height = 1024;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const cardX = 70;
  const cardY = 76;
  const cardW = 884;
  const cardH = 872;
  const radius = 52;

  // Мягкое внешнее свечение.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    cardX + 3,
    cardY + 3,
    cardW - 6,
    cardH - 6,
    radius - 2,
  );
  ctx.closePath();

  ctx.strokeStyle =
    "rgba(175,245,255,0.42)";

  ctx.lineWidth = 16;

  ctx.shadowColor =
    "rgba(150,240,255,0.72)";

  ctx.shadowBlur = 26;

  ctx.stroke();
  ctx.restore();

  // Яркое ядро рамки.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    cardX + 8,
    cardY + 8,
    cardW - 16,
    cardH - 16,
    radius - 6,
  );
  ctx.closePath();

  ctx.strokeStyle =
    "rgba(250,255,255,0.96)";

  ctx.lineWidth = 6;

  ctx.stroke();
  ctx.restore();

  const texture =
    new THREE.CanvasTexture(canvas);

  texture.colorSpace =
    THREE.SRGBColorSpace;

  texture.minFilter =
    THREE.LinearMipmapLinearFilter;

  texture.magFilter =
    THREE.LinearFilter;

  texture.generateMipmaps = true;

  if (this.renderer) {
    texture.anisotropy =
      this.renderer.capabilities
        .getMaxAnisotropy();
  }

  texture.needsUpdate = true;

  return texture;
}

  updateArrowStates() {
    const activeIndex = this.isAnimating
      ? this.targetCenterIndex
      : this.currentCenterIndex;

    if (this.btnPrev) {
      this.btnPrev.disabled = activeIndex <= 0;
    }

    if (this.btnNext) {
      this.btnNext.disabled = activeIndex >= this.items.length - 1;
    }
  }

  stepWheel(direction) {
    this.clearHoveredCard();

    // Если барабан уже движется,
    // считаем следующий шаг от его текущей ЦЕЛИ,
    // а не от карточки, с которой движение началось.
    const baseIndex = this.isAnimating
      ? this.targetCenterIndex
      : this.currentCenterIndex;

    const nextIndex = baseIndex + direction;

    if (nextIndex < 0 || nextIndex >= this.items.length) {
      return;
    }

    this.targetCenterIndex = nextIndex;

    this.animateWheelToTarget();
  }

  animateWheelToTarget() {
    // Если предыдущая анимация ещё идёт,
    // прерываем только её RAF.
    // Текущее положение барабана при этом сохраняется.
    if (this.wheelAnimationFrame) {
      cancelAnimationFrame(this.wheelAnimationFrame);

      this.wheelAnimationFrame = null;
    }

    this.isAnimating = true;

    const startRotation = this.cardsGroup.rotation.y;

    const targetRotation = -this.targetCenterIndex * this.sectorAngle;

    const angleDistance = Math.abs(targetRotation - startRotation);

    const sectorDistance = angleDistance / this.sectorAngle;

    // Один сектор — примерно 260 мс.
    // Если игрок быстро накликал много уровней,
    // время не растёт бесконечно.
    const duration = Math.min(650, Math.max(220, 180 + sectorDistance * 90));

    const startTime = performance.now();

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed = now - startTime;

      const t = Math.min(elapsed / duration, 1);

      const eased = easeOutCubic(t);

      this.cardsGroup.rotation.y = THREE.MathUtils.lerp(
        startRotation,
        targetRotation,
        eased,
      );
this.updateCardFocusVisuals();
      this.render();

      if (t < 1) {
        this.wheelAnimationFrame = requestAnimationFrame(tick);

        return;
      }

      this.cardsGroup.rotation.y = targetRotation;
      this.updateCardFocusVisuals();

this.currentCenterIndex =
  this.targetCenterIndex;

this.isAnimating = false;
this.wheelAnimationFrame = null;

this.updateArrowStates();

this.render();
    };

    this.wheelAnimationFrame = requestAnimationFrame(tick);

    // Стрелки сразу должны учитывать уже выбранную цель.
    this.updateArrowStates();
  }

  resize() {
    if (!this.host || !this.renderer || !this.camera) {
      return;
    }

    const rect = this.host.getBoundingClientRect();

    const width = Math.max(1, Math.round(rect.width));

    const height = Math.max(1, Math.round(rect.height));

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.renderer.setSize(width, height, false);

    const aspect = width / height;

    const viewHeight = 4.6;
    const viewWidth = viewHeight * aspect;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;

    this.camera.updateProjectionMatrix();

    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
