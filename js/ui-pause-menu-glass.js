import * as THREE from "three";

import {
  createUiGlassMesh,
} from "./ui-glass-mesh.js";

class PauseMenuGlass3D {
  constructor() {
    this.overlay =
      document.getElementById("pause-overlay");

    if (!this.overlay) {
      console.warn(
        "[PauseMenuGlass3D] #pause-overlay не найден.",
      );
      return;
    }

    // ПАНЕЛЬ ПАУЗЫ
  this.panel =
  this.overlay.querySelector(
    ".pause-panel",
  );

    if (!this.panel) {
     console.warn(
  "[PauseMenuGlass3D] .pause-panel не найдена.",
      );
      return;
    }

    // КНОПКИ ПАУЗЫ
 this.buttons =
  Array.from(
    this.panel.querySelectorAll(
      ".pause-menu .sk-btn",
    ),
  );

    if (!this.buttons.length) {
    console.warn(
  "[PauseMenuGlass3D] кнопки паузы не найдены.",
);
      return;
    }

    // SCENE
    this.scene =
      new THREE.Scene();

    this.camera =
      new THREE.OrthographicCamera(
        0,
        1,
        1,
        0,
        -10,
        10,
      );

    this.camera.position.z = 5;

    // RENDERER
    this.renderer =
      new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        premultipliedAlpha: true,
      });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2,
      ),
    );

    this.renderer.setClearColor(
      0x000000,
      0,
    );

    this.renderer.setClearAlpha(0);

    this.renderer.domElement.className =
      "pause-menu-glass-three-canvas";

    this.panel.prepend(
      this.renderer.domElement,
    );

    // MESHES
    this.entries =
      this.buttons.map((button) => {
        const mesh =
          createUiGlassMesh({
            width: 1,
            height: 1,
            variant: "normal",
          });

        if (!mesh) {
          return null;
        }

        mesh.renderOrder = 1;

        this.scene.add(mesh);

        return {
          button,
          mesh,

          hoverScale: 1,
          hoverAnimationFrame: null,
        };
      }).filter(Boolean);

    this.bindHover();

    // OBSERVERS
    this.resizeObserver =
      new ResizeObserver(() => {
        this.resize();
      });

    this.resizeObserver.observe(
      this.panel,
    );

    window.addEventListener(
      "resize",
      () => {
        requestAnimationFrame(() => {
          this.resize();
        });
      },
    );

    this.visibilityObserver =
      new MutationObserver(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.resize();
          });
        });
      });

    this.visibilityObserver.observe(
      this.overlay,
      {
        attributes: true,
        attributeFilter: [
          "class",
          "style",
        ],
      },
    );

    this.resize();
  }

  bindHover() {
    for (const entry of this.entries) {
      entry.button.addEventListener(
        "pointerenter",
        () => {
          this.animateHover(
            entry,
            1.045,
            200,
          );
        },
      );

      entry.button.addEventListener(
        "pointerleave",
        () => {
          this.animateHover(
            entry,
            1,
            220,
          );
        },
      );
    }
  }

  animateHover(
    entry,
    targetScale,
    duration,
  ) {
    if (entry.hoverAnimationFrame) {
      cancelAnimationFrame(
        entry.hoverAnimationFrame,
      );
    }

    const startScale =
      entry.hoverScale ?? 1;

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

      entry.hoverScale =
        startScale +
        (targetScale - startScale) *
          eased;

      this.resize();

      if (t < 1) {
        entry.hoverAnimationFrame =
          requestAnimationFrame(tick);
        return;
      }

      entry.hoverScale =
        targetScale;

      entry.hoverAnimationFrame = null;

      this.resize();
    };

    entry.hoverAnimationFrame =
      requestAnimationFrame(tick);
  }

  resize() {
    if (
      !this.panel ||
      !this.renderer ||
      !this.camera
    ) {
      return;
    }

    const panelRect =
      this.panel.getBoundingClientRect();

    const paddingX = 24;
    const paddingY = 12;

    const width =
      Math.round(
        panelRect.width +
        paddingX * 2,
      );

    const height =
      Math.round(
        panelRect.height +
        paddingY * 2,
      );

    if (
      width <= 0 ||
      height <= 0
    ) {
      return;
    }

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2,
      ),
    );

    this.renderer.setSize(
      width,
      height,
      false,
    );

    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = height;
    this.camera.bottom = 0;

    this.camera.updateProjectionMatrix();

    for (const entry of this.entries) {
      const buttonRect =
        entry.button.getBoundingClientRect();

      const buttonWidth =
        buttonRect.width;

      const buttonHeight =
        buttonRect.height;

      if (
        buttonWidth <= 0 ||
        buttonHeight <= 0
      ) {
        entry.mesh.visible = false;
        continue;
      }

      entry.mesh.visible = true;

      const x =
        buttonRect.left -
        panelRect.left +
        buttonWidth / 2 +
        paddingX;

      const yFromTop =
        buttonRect.top -
        panelRect.top +
        buttonHeight / 2 +
        paddingY;

      const y =
        height - yFromTop;

      entry.mesh.position.set(
        x,
        y,
        0,
      );

      const hoverScale =
        entry.hoverScale ?? 1;

      entry.mesh.scale.set(
        buttonWidth * hoverScale,
        buttonHeight * hoverScale,
        1,
      );
    }

    this.render();
  }

  render() {
    this.renderer.render(
      this.scene,
      this.camera,
    );
  }
}

let pauseMenuGlass3D = null;

function initPauseMenuGlass3D() {
  if (pauseMenuGlass3D) {
    return;
  }

  pauseMenuGlass3D =
    new PauseMenuGlass3D();
}

if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initPauseMenuGlass3D,
    { once: true },
  );
} else {
  initPauseMenuGlass3D();
}