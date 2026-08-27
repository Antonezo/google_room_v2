import * as THREE from "three";

import {
  drawUiGlass,
} from "./ui-glass.js";

export function createUiGlassMesh({
  width = 2,
  height = 0.5,

  textureWidth = 2048,
  textureHeight = 320,

  variant = "normal",

  radius = 26,

  borderWidth = null,
  highlightBorder = true,
} = {}) {
  const canvas =
    document.createElement("canvas");

  canvas.width = textureWidth;
  canvas.height = textureHeight;

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

  drawUiGlass(ctx, {
    x: 34,
    y: 24,

    width:
      canvas.width - 68,

    height:
      canvas.height - 48,

    radius,

    variant,

    borderWidth,
    highlightBorder,
  });

  const texture =
    new THREE.CanvasTexture(canvas);

  texture.colorSpace =
    THREE.SRGBColorSpace;

  texture.needsUpdate = true;

  const geometry =
    new THREE.PlaneGeometry(
      width,
      height,
    );

  const material =
    new THREE.MeshBasicMaterial({
      map: texture,

      transparent: true,

      side:
        THREE.DoubleSide,

      depthWrite: false,
    });

  const mesh =
    new THREE.Mesh(
      geometry,
      material,
    );

  mesh.userData.uiGlassCanvas =
    canvas;

  mesh.userData.uiGlassTexture =
    texture;

  return mesh;
}