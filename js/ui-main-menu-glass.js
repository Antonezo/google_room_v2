import * as THREE from "three";

import {
  createUiGlassMesh,
} from "./ui-glass-mesh.js";


// =========================================================
// THREE.JS-СТЕКЛО ГЛАВНОГО МЕНЮ
//
// HTML-кнопки остаются настоящими кнопками.
// Three.js рисует только их стеклянную поверхность.
// =========================================================

class MainMenuGlass3D {
  constructor() {
    this.view =
      document.getElementById("view-main");

    if (!this.view) {
      console.warn(
        "[MainMenuGlass3D] #view-main не найден.",
      );

      return;
    }

    this.buttons =
      Array.from(
        this.view.querySelectorAll(
          ".sk-btn",
        ),
      );

    if (!this.buttons.length) {
      return;
    }


    // =====================================================
    // SCENE
    // =====================================================

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


    // =====================================================
    // RENDERER
    // =====================================================

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
      "main-menu-glass-three-canvas";

    this.view.prepend(
      this.renderer.domElement,
    );


    // =====================================================
    // ПЛАШКИ
    // =====================================================

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
  hoverTargetScale: 1,
  hoverAnimationFrame: null,
};
      }).filter(Boolean);
      this.bindHover();


    // =====================================================
    // RESIZE
    // =====================================================

    this.resizeObserver =
      new ResizeObserver(() => {
        this.resize();
      });

    this.resizeObserver.observe(
      this.view,
    );

    window.addEventListener(
      "resize",
      () => {
        requestAnimationFrame(() => {
          this.resize();
        });
      },
    );


    // Когда экран главного меню
    // снова становится видимым.
    this.visibilityObserver =
      new MutationObserver(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.resize();
          });
        });
      });

    this.visibilityObserver.observe(
      this.view,
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
  // =======================================================
  // РАЗМЕЩЕНИЕ THREE.JS-ПЛАШЕК
  // ТОЧНО ПОД HTML-КНОПКАМИ
  // =======================================================

  resize() {
    if (
      !this.view ||
      !this.renderer ||
      !this.camera
    ) {
      return;
    }

   const viewRect =
  this.view.getBoundingClientRect();

const paddingX = 24;
const paddingY = 12;

const width =
  Math.round(
    viewRect.width +
    paddingX * 2,
  );

const height =
  Math.round(
    viewRect.height +
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


    // Камера работает прямо
    // в CSS-пикселях.
    this.camera.left = 0;
    this.camera.right = width;

    this.camera.top = height;
    this.camera.bottom = 0;

    this.camera.updateProjectionMatrix();


    // =====================================================
    // СИНХРОНИЗАЦИЯ С DOM
    // =====================================================

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


      // Координаты относительно #view-main.
  const x =
  buttonRect.left -
  viewRect.left +
  buttonWidth / 2 +
  paddingX;

const yFromTop =
  buttonRect.top -
  viewRect.top +
  buttonHeight / 2 +
  paddingY;

      const y =
        height - yFromTop;


      entry.mesh.position.set(
        x,
        y,
        0,
      );


      // PlaneGeometry внутри
      // createUiGlassMesh() имеет размер 1×1.
      // Поэтому scale можно задавать
      // прямо в CSS-пикселях.
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


// =========================================================
// АВТОЗАПУСК
// =========================================================

let mainMenuGlass3D = null;

function initMainMenuGlass3D() {
  if (mainMenuGlass3D) {
    return;
  }

  mainMenuGlass3D =
    new MainMenuGlass3D();
}


if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initMainMenuGlass3D,
    {
      once: true,
    },
  );
} else {
  initMainMenuGlass3D();
}