import * as THREE from "three";

import {
  createUiGlassMesh,
} from "./ui-glass-mesh.js";


class ConfirmModalGlass3D {
  constructor() {
    this.modal =
      document.getElementById(
        "confirm-modal",
      );

    if (!this.modal) {
      return;
    }

    this.panel =
      this.modal.querySelector(
        ".cyber-modal",
      );

    if (!this.panel) {
      return;
    }

  this.buttons = [
  {
    button: document.getElementById("btn-confirm-yes"),
    variant: "confirmDanger",
  },

  {
    button: document.getElementById("btn-confirm-no"),
    variant: "confirmNormal",
  },
].filter((entry) => entry.button);

    if (!this.buttons.length) {
      return;
    }

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
      "confirm-modal-glass-three-canvas";

    this.panel.prepend(
      this.renderer.domElement,
    );

    this.entries =
      this.buttons
        .map(
          ({
            button,
            variant,
          }) => {
            const mesh =
              createUiGlassMesh({
                width: 1,
                height: 1,
                variant,
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
          },
        )
        .filter(Boolean);

    this.bindHover();

    this.resizeObserver =
      new ResizeObserver(() => {
        this.resize();
      });

    this.resizeObserver.observe(
      this.panel,
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
      this.modal,
      {
        attributes: true,
        attributeFilter: [
          "class",
          "style",
        ],
      },
    );

    window.addEventListener(
      "resize",
      () => {
        this.resize();
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
          (now - startTime) /
            duration,
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

      entry.hoverAnimationFrame =
        null;

      this.resize();
    };

    entry.hoverAnimationFrame =
      requestAnimationFrame(tick);
  }


  resize() {
    const panelRect =
      this.panel
        ?.getBoundingClientRect();

    if (!panelRect) {
      return;
    }

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

    for (
      const entry of this.entries
    ) {
      const buttonRect =
        entry.button
          .getBoundingClientRect();

      if (
        buttonRect.width <= 0 ||
        buttonRect.height <= 0
      ) {
        entry.mesh.visible = false;
        continue;
      }

      entry.mesh.visible = true;

      const x =
        buttonRect.left -
        panelRect.left +
        buttonRect.width / 2 +
        paddingX;

      const yFromTop =
        buttonRect.top -
        panelRect.top +
        buttonRect.height / 2 +
        paddingY;

      const y =
        height - yFromTop;

      entry.mesh.position.set(
        x,
        y,
        0,
      );

      const scale =
        entry.hoverScale ?? 1;

      entry.mesh.scale.set(
        buttonRect.width * scale,
        buttonRect.height * scale,
        1,
      );
    }

    this.renderer.render(
      this.scene,
      this.camera,
    );
  }
}


let confirmModalGlass3D = null;

function initConfirmModalGlass3D() {
  if (confirmModalGlass3D) {
    return;
  }

  confirmModalGlass3D =
    new ConfirmModalGlass3D();
}


if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initConfirmModalGlass3D,
    { once: true },
  );
} else {
  initConfirmModalGlass3D();
}