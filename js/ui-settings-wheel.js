import * as THREE from "three";
import { audioManager } from "./audio.js";

import {
  drawUiGlass,

} from "./ui-glass.js";
import "./ui-main-menu-glass.js";
import "./ui-controls-glass.js";
import "./ui-pause-menu-glass.js";
import "./ui-confirm-modal-glass.js";

export class SettingsWheel3D {
  constructor(hostElement) {
    this.host = hostElement;

    if (!this.host) {
      console.warn("[SettingsWheel3D] host не найден.");
      return;
    }

    this.sliderSfx = document.getElementById("slider-sfx");

    this.sliderMusic = document.getElementById("slider-music");

    this.btnOpenControls = document.getElementById("btn-open-controls");

    this.langButtons = Array.from(document.querySelectorAll(".lang-btn"));

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

    this.camera.position.set(0, -1.7, 5.4);
    this.camera.lookAt(0, 0.05, 0);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.renderer.setClearColor(0x000000, 0);

    this.renderer.domElement.className = "settings-wheel-three-canvas";

    this.host.appendChild(this.renderer.domElement);

    this.wheelGroup = new THREE.Group();
    this.scene.add(this.wheelGroup);

    this.wheelGroup.scale.set(2.95, 1.92, 1.62);

    this.wheelGroup.position.y = -0.12;

    this.rowVisuals = new Map();

    // =========================================================
    // ИНТЕРАКТИВНОСТЬ 3D-МЕНЮ
    // =========================================================

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.draggingSliderKey = null;
    this.draggingPointerId = null;
    this.hoveredRowVisual = null;

    this.createWheelBody();
    this.createSettingRows();
    this.bindDomState();
    this.bindPointerInteraction();

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
  }

  createWheelBody() {
    const radius = 1.3;
    const height = 1.9;

    this.bodyRadius = radius;
    this.bodyHeight = height;
    this.surfaceRadius = radius + 0.018;

    const visibleAngle = THREE.MathUtils.degToRad(182);

    // Сам сплошной прозрачный корпус больше не рисуем.
    // Остаются только широкие неоновые границы барабана.
    this.createFrame({
      radius,
      height,
      visibleAngle,
    });
  }

  createFrame({ radius, height, visibleAngle }) {
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xeaffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x62eaff,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });

    const outerGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x38dfff,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
    });

    const startAngle = -visibleAngle / 2;
    const endAngle = visibleAngle / 2;

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
      createArcLayer(y, 0.055, 16, outerGlowMaterial);
      createArcLayer(y, 0.038, 14, glowMaterial);
      createArcLayer(y, 0.02, 12, coreMaterial);
    };

    createArc(height / 2);
    createArc(-height / 2);
  }

  createSettingRows() {
    const rowHeight = 0.44;
    const rowAngle = 112;

    this.createRowMesh({
      key: "sfx",
      y: 0.68,
      height: rowHeight,
      angleDeg: rowAngle,
    });

    this.createRowMesh({
      key: "music",
      y: 0.23,
      height: rowHeight,
      angleDeg: rowAngle,
    });

    this.createRowMesh({
      key: "controls",
      y: -0.23,
      height: rowHeight,
      angleDeg: rowAngle,
    });

    this.createRowMesh({
      key: "lang",
      y: -0.68,
      height: rowHeight,
      angleDeg: rowAngle,
    });

    this.updateAllRowTextures();
  }

  createRowMesh({ key, y, height, angleDeg }) {
    const angle = THREE.MathUtils.degToRad(angleDeg);

    const geometry = new THREE.CylinderGeometry(
      this.surfaceRadius,
      this.surfaceRadius,
      height,
      96,
      1,
      true,
      -angle / 2,
      angle,
    );

   const canvas = document.createElement("canvas");
canvas.width = 2048;
canvas.height = 320;

    const ctx = canvas.getContext("2d");

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy?.() ?? 1;

    texture.anisotropy = Math.min(maxAnisotropy, 8);

    

    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,

      transparent: true,
      opacity: 1,

      side: THREE.FrontSide,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.y = y;
    mesh.renderOrder = 5;

    this.wheelGroup.add(mesh);

 this.rowVisuals.set(key, {
  key,
  mesh,
  canvas,
  ctx,
  texture,

  hoverScale: 1,
  hoverAnimationFrame: null,
});
  }

  bindDomState() {
    this.sliderSfx?.addEventListener("input", () => {
      this.updateAllRowTextures();
    });

    this.sliderMusic?.addEventListener("input", () => {
      this.updateAllRowTextures();
    });

    this.langButtons.forEach((button) => {
      button.addEventListener("click", () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.updateAllRowTextures();
          });
        });
      });
    });

    this.languageObserver = new MutationObserver(() => {
      this.updateAllRowTextures();
    });

    this.languageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-ui-lang"],
    });
  }

  getCurrentLanguage() {
    const lang = document.documentElement.dataset.uiLang || "RU";

    return String(lang).toUpperCase() === "EN" ? "EN" : "RU";
  }

  getText(enText, ruText) {
    return this.getCurrentLanguage() === "EN" ? enText : ruText;
  }

  getState() {
    const clampValue = (value) => {
      const num = Number(value);

      if (!Number.isFinite(num)) {
        return 0;
      }

      return Math.max(0, Math.min(100, num));
    };

    return {
      lang: this.getCurrentLanguage(),
      sfx: clampValue(this.sliderSfx?.value ?? 70),
      music: clampValue(this.sliderMusic?.value ?? 40),
    };
  }

  updateAllRowTextures() {
    const state = this.getState();

    this.drawSliderRow(this.rowVisuals.get("sfx"), {
      label: this.getText("SOUND EFFECTS", "ЗВУКОВЫЕ ЭФФЕКТЫ"),
      value: state.sfx,
    });

    this.drawSliderRow(this.rowVisuals.get("music"), {
      label: this.getText("MUSIC", "ФОНОВАЯ МУЗЫКА"),
      value: state.music,
    });

    this.drawControlsRow(this.rowVisuals.get("controls"), {
      label: this.getText("CONTROLS", "УПРАВЛЕНИЕ"),
    });

    this.drawLanguageRow(this.rowVisuals.get("lang"), {
      label: this.getText("LANGUAGE", "ЯЗЫК"),
      lang: state.lang,
    });

    this.render();
  }

  clearCanvas(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
  }

  roundedRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  

  drawGlowText(ctx, text, options = {}) {
    const {
      x = 0,
      y = 0,
      align = "left",
      size = 28,
      weight = 700,
      color = "#ffffff",
      shadowColor = "rgba(100, 230, 255, 0.32)",
      shadowBlur = 12,
      letterSpacing = 1.2,
    } = options;

    ctx.save();

    ctx.font = `${weight} ${size}px Orbitron, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = shadowBlur;

    if (letterSpacing === 0) {
      ctx.fillText(text, x, y);
      ctx.restore();
      return;
    }

    const chars = Array.from(text);

    if (align === "right") {
      let currentX = x;

      for (let i = chars.length - 1; i >= 0; i -= 1) {
        const char = chars[i];
        const width = ctx.measureText(char).width;

        ctx.fillText(char, currentX - width, y);
        currentX -= width + letterSpacing;
      }

      ctx.restore();
      return;
    }

    if (align === "center") {
      let totalWidth = 0;

      chars.forEach((char, index) => {
        totalWidth += ctx.measureText(char).width;

        if (index < chars.length - 1) {
          totalWidth += letterSpacing;
        }
      });

      let currentX = x - totalWidth / 2;

      chars.forEach((char, index) => {
        ctx.fillText(char, currentX, y);
        currentX += ctx.measureText(char).width;

        if (index < chars.length - 1) {
          currentX += letterSpacing;
        }
      });

      ctx.restore();
      return;
    }

    let currentX = x;

    chars.forEach((char, index) => {
      ctx.fillText(char, currentX, y);
      currentX += ctx.measureText(char).width;

      if (index < chars.length - 1) {
        currentX += letterSpacing;
      }
    });

    ctx.restore();
  }

  getSliderLayout(width) {
    return {
      left: 1000,
      right: width - 320,
      y: 168,

      hitHalfHeight: 28,
    };
  }

  drawSliderTrack(ctx, x1, x2, y, value) {
    const knobX = x1 + (x2 - x1) * (value / 100);

    ctx.save();

    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(55, 210, 235, 0.20)";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(knobX, y);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(115, 240, 255, 0.56)";
    ctx.shadowColor = "rgba(95, 235, 255, 0.35)";
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.ellipse(knobX, y, 18, 23, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(240, 252, 255, 0.98)";
    ctx.shadowBlur = 20;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(knobX, y, 27, 32, 0, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(240, 252, 255, 0.95)";
    ctx.shadowColor = "rgba(120, 235, 255, 0.66)";
    ctx.shadowBlur = 14;
    ctx.stroke();

    ctx.restore();
  }

  drawSliderRow(visual, data) {
    if (!visual) {
      return;
    }

    const { ctx, canvas, texture } = visual;
    const width = canvas.width;
    const height = canvas.height;

    this.clearCanvas(ctx, width, height);
    drawUiGlass(ctx, {
  x: 34,
  y: 24,
  width: width - 68,
  height: height - 48,
  radius: 26,
  variant: "normal",
});

    // =========================================================
    // НАЗВАНИЕ — СЛЕВА
    // =========================================================

    this.drawGlowText(ctx, data.label, {
  x: 95,
  y: 160,
  align: "left",

  size: 60,
  weight: 700,

  shadowBlur: 8,
  letterSpacing: 0.35,
});

    // =========================================================
    // ПОЛЗУНОК — ПРАВАЯ ЧАСТЬ
    // =========================================================

    const sliderLayout = this.getSliderLayout(width);

    const sliderLeft = sliderLayout.left;
    const sliderRight = sliderLayout.right;
    const sliderY = sliderLayout.y;

    this.drawSliderTrack(ctx, sliderLeft, sliderRight, sliderY, data.value);

    // =========================================================
    // ПРОЦЕНТ — ЕЩЁ ПРАВЕЕ И КРУПНЕЕ
    // =========================================================

    this.drawGlowText(ctx, `${data.value}%`, {
      x: width - 25,
      y: 168,
      align: "right",

      size: 66,
      weight: 700,

      shadowBlur: 0,
      letterSpacing: 10,
    });

    texture.needsUpdate = true;
  }

  drawControlsRow(visual, data) {
    if (!visual) {
      return;
    }

    const { ctx, canvas, texture } = visual;
    const width = canvas.width;
    const height = canvas.height;

    this.clearCanvas(ctx, width, height);

  drawUiGlass(ctx, {
  x: 34,
  y: 24,
  width: width - 68,
  height: height - 48,
  radius: 26,
  variant: "highlight",
});

    // =========================================================
    // НАЗВАНИЕ
    // =========================================================

    this.drawGlowText(ctx, data.label, {
  x: 95,
  y: 160,
  align: "left",

  size: 62,
  weight: 700,

  shadowBlur: 8,
  letterSpacing: 0.35,
});

    // =========================================================
    // КЛАВИАТУРА — ПРАВЕЕ
    // =========================================================
const rightEdge = width - 25;
   const keyboardX = rightEdge - 500;
const keyboardY = 84;

    const keyboardW = 245;
    const keyboardH = 145;

    ctx.save();

    ctx.globalAlpha = 0.72;

    ctx.strokeStyle = "rgba(235, 252, 255, 0.96)";

    ctx.lineWidth = 5;

    ctx.shadowColor = "rgba(120, 235, 255, 0.62)";

    ctx.shadowBlur = 14;

    this.roundedRectPath(ctx, keyboardX, keyboardY, keyboardW, keyboardH, 18);

    ctx.stroke();

    const cols = 8;
    const rows = 4;

    const innerX = keyboardX + 18;
    const innerY = keyboardY + 18;

    const innerW = keyboardW - 36;
    const innerH = keyboardH - 36;

    const keyGap = 7;

    const keyW = (innerW - keyGap * (cols - 1)) / cols;

    const keyH = (innerH - keyGap * (rows - 1)) / rows;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = innerX + col * (keyW + keyGap);

        const y = innerY + row * (keyH + keyGap);

        this.roundedRectPath(ctx, x, y, keyW, keyH, 4);

        ctx.stroke();
      }
    }

    ctx.restore();

    // =========================================================
    // МЫШЬ — ВЫТЯНУТАЯ, ТОЖЕ ПРАВЕЕ
    // =========================================================

   const mouseX = rightEdge - 185;
const mouseY = 158;

    ctx.save();

    ctx.globalAlpha = 0.76;

    ctx.strokeStyle = "rgba(240, 252, 255, 0.98)";

    ctx.lineWidth = 6;

    ctx.shadowColor = "rgba(120, 235, 255, 0.66)";

    ctx.shadowBlur = 15;

    // Вытянутый корпус мыши
    ctx.beginPath();

    ctx.ellipse(mouseX, mouseY, 30, 62, 0, 0, Math.PI * 2);

    ctx.stroke();

    // Центральная линия сверху
    ctx.beginPath();
    ctx.moveTo(mouseX, mouseY - 56);
    ctx.lineTo(mouseX, mouseY - 12);
    ctx.stroke();

    // Колесико
    ctx.beginPath();
    ctx.roundRect(mouseX - 5, mouseY - 43, 10, 22, 5);
    ctx.stroke();

    ctx.restore();

    // =========================================================
    // СТРЕЛКА
    // =========================================================

   this.drawGlowText(ctx, "›", {
  x: width - 90,
  y: 160,
  align: "center",

  size: 60,

  shadowBlur: 8,
  letterSpacing: 0,
});

    texture.needsUpdate = true;
  }

  getLanguageLayout(width, height) {
    const buttonWidth = 130;
    const buttonHeight = 140;
    const gap = 24;

   const groupWidth = buttonWidth * 2 + gap;

const rightEdge = width - 100;

// Правый край EN совпадает
// с правым краем процентов.
const groupX = rightEdge - groupWidth;

    const y = height / 2 - buttonHeight / 2;

    return {
      buttonWidth,
      buttonHeight,
      gap,

      ru: {
        x: groupX,
        y,
        width: buttonWidth,
        height: buttonHeight,
      },

      en: {
        x: groupX + buttonWidth + gap,
        y,
        width: buttonWidth,
        height: buttonHeight,
      },
    };
  }

  drawLanguagePill(ctx, { x, y, width, height, label, active }) {
    ctx.save();

    this.roundedRectPath(ctx, x, y, width, height, 16);

    const gradient = ctx.createLinearGradient(0, y, 0, y + height);

    if (active) {
      gradient.addColorStop(0, "rgba(120, 235, 255, 0.52)");
      gradient.addColorStop(1, "rgba(35, 110, 140, 0.48)");
    } else {
      gradient.addColorStop(0, "rgba(30, 55, 72, 0.82)");
      gradient.addColorStop(1, "rgba(10, 28, 40, 0.82)");
    }

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = active ? 2.3 : 1.5;
    ctx.strokeStyle = active
      ? "rgba(225, 250, 255, 0.82)"
      : "rgba(175, 240, 255, 0.35)";
    ctx.stroke();

    this.drawGlowText(ctx, label, {
      x: x + width / 2,
      y: y + height / 2 + 2,

      align: "center",

      size: 65,
      weight: 700,

      color: active ? "#ffffff" : "rgba(255,255,255,0.72)",

      shadowBlur: active ? 2 : 0,

      letterSpacing: 0,
    });

    ctx.restore();
  }

  drawLanguageRow(visual, data) {
    if (!visual) {
      return;
    }

    const { ctx, canvas, texture } = visual;
    const width = canvas.width;
    const height = canvas.height;

    this.clearCanvas(ctx, width, height);
    drawUiGlass(ctx, {
  x: 34,
  y: 24,
  width: width - 68,
  height: height - 48,
  radius: 26,
  variant: "normal",
});

  this.drawGlowText(ctx, data.label, {
  x: 95,
  y: 160,
  align: "left",

  size: 60,
  weight: 700,

  shadowBlur: 8,
  letterSpacing: 0.35,
});

    const languageLayout = this.getLanguageLayout(width, height);

    this.drawLanguagePill(ctx, {
      ...languageLayout.ru,
      label: "RU",
      active: data.lang === "RU",
    });

    this.drawLanguagePill(ctx, {
      ...languageLayout.en,
      label: "EN",
      active: data.lang === "EN",
    });

    texture.needsUpdate = true;
  }

  // =========================================================
  // 3D POINTER INTERACTION
  // =========================================================

  getPointerIntersection(event, targetMesh = null) {
    const rect = this.renderer.domElement.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const x = (event.clientX - rect.left) / rect.width;

    const y = (event.clientY - rect.top) / rect.height;

    // Курсор вообще не над canvas.
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return null;
    }

    this.pointer.x = x * 2 - 1;

    this.pointer.y = -(y * 2 - 1);

    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshes = targetMesh
      ? [targetMesh]
      : Array.from(this.rowVisuals.values()).map((visual) => visual.mesh);

    const intersections = this.raycaster.intersectObjects(meshes, false);

    return intersections[0] ?? null;
  }

  // =========================================================
  // ПОИСК СТРОКИ ПО MESH
  // =========================================================

  getRowVisualByMesh(mesh) {
    for (const visual of this.rowVisuals.values()) {
      if (visual.mesh === mesh) {
        return visual;
      }
    }

    return null;
  }

  // =========================================================
  // UV -> КООРДИНАТЫ CANVAS
  // =========================================================

  getCanvasPointFromIntersection(intersection, visual) {
    if (!intersection?.uv || !visual) {
      return null;
    }

    return {
      x: intersection.uv.x * visual.canvas.width,

      y: (1 - intersection.uv.y) * visual.canvas.height,
    };
  }

  // =========================================================
  // ПРОВЕРКА ПОПАДАНИЯ В ПРЯМОУГОЛЬНИК
  // =========================================================

  isPointInsideRect(point, rect) {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  isPointOverSliderTrack(point, visual) {
    if (!point || !visual) {
      return false;
    }

    const layout = this.getSliderLayout(visual.canvas.width);

    return (
      point.x >= layout.left &&
      point.x <= layout.right &&
      point.y >= layout.y - layout.hitHalfHeight &&
      point.y <= layout.y + layout.hitHalfHeight
    );
  }

  // =========================================================
  // ИЗМЕНЕНИЕ ГРОМКОСТИ ПО ПОЗИЦИИ КУРСОРА
  // =========================================================

  updateSliderFromIntersection(key, intersection) {
    const visual = this.rowVisuals.get(key);

    if (!visual || !intersection?.uv) {
      return;
    }

    const point = this.getCanvasPointFromIntersection(intersection, visual);

    if (!point) {
      return;
    }

    const sliderLayout = this.getSliderLayout(visual.canvas.width);

    const range = sliderLayout.right - sliderLayout.left;

    if (range <= 0) {
      return;
    }

    const normalized = (point.x - sliderLayout.left) / range;

    const value = Math.round(THREE.MathUtils.clamp(normalized, 0, 1) * 100);

    const input = key === "sfx" ? this.sliderSfx : this.sliderMusic;

    if (!input) {
      return;
    }

    input.value = String(value);

    input.dispatchEvent(
      new Event("input", {
        bubbles: true,
      }),
    );
  }

  // =========================================================
  // ПЕРЕКЛЮЧЕНИЕ ЯЗЫКА
  // =========================================================

  activateLanguage(lang) {
    const normalizedLang = String(lang).toUpperCase() === "EN" ? "EN" : "RU";

    // Уже выбран этот язык — ничего не делаем.
    if (this.getCurrentLanguage() === normalizedLang) {
      return;
    }

    const button = this.langButtons.find(
      (item) => String(item.dataset.lang).toUpperCase() === normalizedLang,
    );

    if (!button) {
      return;
    }

    button.dispatchEvent(
  new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
  }),
);

this.updateAllRowTextures();
  }


setHoveredRow(visual) {
  if (this.hoveredRowVisual === visual) {
    return;
  }

  this.clearHoveredRow();

  if (!visual) {
    return;
  }

  this.hoveredRowVisual = visual;

  // Тот же hover-звук, что и в главном меню.
  if (
    audioManager?.ctx?.state === "running" &&
    audioManager?.playUI
  ) {
    audioManager.playUI("mouse_menu");
  }

  this.animateRowHover(
    visual,
    1.045,
    200,
  );
}


clearHoveredRow() {
  if (!this.hoveredRowVisual) {
    return;
  }

  const visual =
    this.hoveredRowVisual;

  this.hoveredRowVisual = null;

  this.animateRowHover(
    visual,
    1,
    220,
  );
}


animateRowHover(
  visual,
  targetScale,
  duration,
) {
  if (!visual?.mesh) {
    return;
  }

  if (visual.hoverAnimationFrame) {
    cancelAnimationFrame(
      visual.hoverAnimationFrame,
    );
  }

  const startScale =
    visual.hoverScale ?? 1;

  const startTime =
    performance.now();

  const tick = (now) => {
    const t =
      Math.min(
        1,
        (now - startTime) / duration,
      );

    const eased =
      1 - Math.pow(1 - t, 3);

    visual.hoverScale =
      startScale +
      (targetScale - startScale) *
        eased;

    visual.mesh.scale.setScalar(
      visual.hoverScale,
    );

    this.render();

    if (t < 1) {
      visual.hoverAnimationFrame =
        requestAnimationFrame(tick);

      return;
    }

    visual.hoverScale =
      targetScale;

    visual.mesh.scale.setScalar(
      targetScale,
    );

    visual.hoverAnimationFrame = null;

    this.render();
  };

  visual.hoverAnimationFrame =
    requestAnimationFrame(tick);
}
  // =========================================================
  // ОСНОВНЫЕ POINTER EVENTS
  // =========================================================

  bindPointerInteraction() {
    const canvas = this.renderer.domElement;

    const onPointerDown = (event) => {
      const intersection = this.getPointerIntersection(event);

      if (!intersection) {
        return;
      }

      const visual = this.getRowVisualByMesh(intersection.object);

      if (!visual) {
        return;
      }

      // -----------------------------------------
      // SFX / MUSIC
      // -----------------------------------------

      if (visual.key === "sfx" || visual.key === "music") {
        const point = this.getCanvasPointFromIntersection(intersection, visual);

        // Клик разрешён только рядом
        // с реально нарисованным треком.
        if (!this.isPointOverSliderTrack(point, visual)) {
          return;
        }

        this.draggingSliderKey = visual.key;

        this.draggingPointerId = event.pointerId;

        canvas.setPointerCapture?.(event.pointerId);

        this.updateSliderFromIntersection(visual.key, intersection);

        event.preventDefault();
        return;
      }

      // -----------------------------------------
      // CONTROLS
      // -----------------------------------------

      if (visual.key === "controls") {
        this.btnOpenControls?.click();

        event.preventDefault();
        return;
      }

      // -----------------------------------------
      // LANGUAGE
      // -----------------------------------------

      if (visual.key === "lang") {
        const point = this.getCanvasPointFromIntersection(intersection, visual);

        if (!point) {
          return;
        }

        const layout = this.getLanguageLayout(
          visual.canvas.width,
          visual.canvas.height,
        );

        if (this.isPointInsideRect(point, layout.ru)) {
          this.activateLanguage("RU");

          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (this.isPointInsideRect(point, layout.en)) {
          this.activateLanguage("EN");

          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    };

 const onPointerMove = (event) => {
  // =====================================================
  // HOVER СТРОКИ
  // =====================================================

  const hoverIntersection =
    this.getPointerIntersection(event);

  if (hoverIntersection) {
    const hoverVisual =
      this.getRowVisualByMesh(
        hoverIntersection.object,
      );

    if (hoverVisual) {
      this.setHoveredRow(
        hoverVisual,
      );
    } else {
      this.clearHoveredRow();
    }
  } else {
    this.clearHoveredRow();
  }


  // =====================================================
  // ПЕРЕТАСКИВАНИЕ ПОЛЗУНКА
  // =====================================================

  if (!this.draggingSliderKey) {
    return;
  }

  const visual =
    this.rowVisuals.get(
      this.draggingSliderKey,
    );

  const intersection =
    this.getPointerIntersection(
      event,
      visual?.mesh ?? null,
    );

  if (!intersection) {
    return;
  }

  this.updateSliderFromIntersection(
    this.draggingSliderKey,
    intersection,
  );
};

    const stopSliderDrag = (event) => {
  if (!this.draggingSliderKey) {
    return;
  }

  const finishedKey =
    this.draggingSliderKey;

  if (this.draggingPointerId !== null) {
    canvas.releasePointerCapture?.(
      this.draggingPointerId,
    );
  }

  this.draggingSliderKey = null;
  this.draggingPointerId = null;

  // После окончания перетаскивания сообщаем
  // обычному HTML-ползунку, что изменение завершено.
  const input =
    finishedKey === "sfx"
      ? this.sliderSfx
      : finishedKey === "music"
        ? this.sliderMusic
        : null;

  if (input) {
    input.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );
  }

  event?.preventDefault?.();
};

    canvas.addEventListener("pointerdown", onPointerDown);

    canvas.addEventListener("pointermove", onPointerMove);

    canvas.addEventListener("pointerup", stopSliderDrag);

    canvas.addEventListener("pointercancel", stopSliderDrag);

    canvas.addEventListener(
  "pointerleave",
  () => {
    this.clearHoveredRow();
  },
);
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
