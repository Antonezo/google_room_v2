import * as THREE from "three";

import {
  createUiGlassMesh,
} from "./ui-glass-mesh.js";


class ControlsGlass3D {
  constructor() {
   this.panel =
  document.querySelector(
    "#futuristic-start-menu .controls-console",
  );

    if (!this.panel) {
    console.warn(
  "[ControlsGlass3D] .controls-console не найден.",
);

      return;
    }

    this.rows =
      Array.from(
        this.panel.querySelectorAll(
          ".control-row",
        ),
      );

    if (!this.rows.length) {
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
      "controls-glass-three-canvas";

    this.panel.prepend(
      this.renderer.domElement,
    );


    // =====================================================
    // ПЛАШКИ
    // =====================================================

    this.entries =
      this.rows.map((row) => {
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
  row,
  mesh,
};
      }).filter(Boolean);

    // =====================================================
    // RESIZE
    // =====================================================

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
      this.panel,
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

    const width =
      Math.round(panelRect.width);

    const height =
      Math.round(panelRect.height);

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
      const rowRect =
        entry.row.getBoundingClientRect();

      const rowWidth =
        rowRect.width;

      const rowHeight =
        rowRect.height;

      if (
        rowWidth <= 0 ||
        rowHeight <= 0
      ) {
        entry.mesh.visible = false;
        continue;
      }

      entry.mesh.visible = true;


      const x =
        rowRect.left -
        panelRect.left +
        rowWidth / 2;

      const yFromTop =
        rowRect.top -
        panelRect.top +
        rowHeight / 2;

      const y =
        height - yFromTop;


      entry.mesh.position.set(
        x,
        y,
        0,
      );

entry.mesh.scale.set(
  rowWidth,
  rowHeight,
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


let controlsGlass3D = null;

function initControlsGlass3D() {
  if (controlsGlass3D) {
    return;
  }

  controlsGlass3D =
    new ControlsGlass3D();
}


if (
  document.readyState === "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initControlsGlass3D,
    {
      once: true,
    },
  );
} else {
  initControlsGlass3D();
}