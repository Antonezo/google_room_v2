// =========================================================
// ОБЩЕЕ СТЕКЛО ИНТЕРФЕЙСА
//
// Используется:
// - барабаном настроек;
// - карточками барабана секторов;
// - HTML-панелью назначения клавиш.
//
// Цвета, блики и отражения теперь задаются ТОЛЬКО здесь.
// =========================================================

const GLASS_PALETTES = {
  normal: {
    top: "rgba(112, 190, 214, 0.24)",
    middle: "rgba(38, 88, 118, 0.54)",
    bottom: "rgba(8, 22, 38, 0.95)",

    shadow: "rgba(110, 220, 245, 0.10)",
    shadowBlur: 10,

    border: "rgba(238,250,255,0.68)",
  },

  highlight: {
    top: "rgba(160, 226, 242, 0.34)",
    middle: "rgba(62, 126, 160, 0.62)",
    bottom: "rgba(10, 30, 48, 0.96)",

    shadow: "rgba(145, 240, 255, 0.24)",
    shadowBlur: 18,

    border: "rgba(250,255,255,0.88)",
  },

  locked: {
    top: "rgba(118, 170, 186, 0.24)",
    middle: "rgba(42, 76, 98, 0.54)",
    bottom: "rgba(8, 20, 34, 0.94)",

    shadow: "rgba(110, 220, 245, 0.10)",
    shadowBlur: 10,

    border: "rgba(224,240,245,0.52)",
  },
 danger: {
  top: "rgba(255, 150, 165, 0.34)",
  middle: "rgba(185, 52, 72, 0.72)",
  bottom: "rgba(72, 10, 20, 0.98)",

  shadow: "rgba(255, 70, 90, 0.34)",
  shadowBlur: 20,

  border: "rgba(255, 145, 155, 0.95)",
},
confirmNormal: {
  top: "rgba(195, 225, 245, 0.10)",
  middle: "rgba(72, 126, 176, 0.62)",
  bottom: "rgba(14, 42, 74, 0.96)",

  shadow: "rgba(85, 205, 255, 0.08)",
  shadowBlur: 8,

  border: "rgba(205, 235, 255, 0.72)",
},

confirmDanger: {
  top: "rgba(255, 188, 198, 0.10)",
  middle: "rgba(185, 54, 74, 0.66)",
  bottom: "rgba(72, 12, 24, 0.97)",

  shadow: "rgba(255, 82, 98, 0.10)",
  shadowBlur: 8,

  border: "rgba(255, 195, 202, 0.78)",
},
};


// =========================================================
// ОСНОВНАЯ ФУНКЦИЯ ОТРИСОВКИ СТЕКЛА
// =========================================================

export function drawUiGlass(
  ctx,
  {
    x,
    y,
    width,
    height,
    radius,

    variant = "normal",

    borderWidth = null,
    highlightBorder = true,
  },
) {
  if (!ctx) {
    return;
  }

  const palette =
    GLASS_PALETTES[variant] ??
    GLASS_PALETTES.normal;

  const isHighlight = variant === "highlight";
  const isLocked = variant === "locked";

  // =========================================================
  // ОСНОВНОЙ ТЁМНЫЙ ГРАДИЕНТ
  // =========================================================

  const bgGradient =
    ctx.createLinearGradient(
      x,
      y,
      x,
      y + height,
    );

  bgGradient.addColorStop(
    0,
    palette.top,
  );

  bgGradient.addColorStop(
    0.36,
    palette.middle,
  );

  bgGradient.addColorStop(
    1,
    palette.bottom,
  );

  ctx.save();

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius,
  );
  ctx.closePath();

  ctx.shadowColor =
    palette.shadow;

  ctx.shadowBlur =
    palette.shadowBlur;

  ctx.fillStyle =
    bgGradient;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // ВЕРХНИЙ СТЕКЛЯННЫЙ БЛИК
  // =========================================================

  const shineGradient =
    ctx.createLinearGradient(
      0,
      y,
      0,
      y + height * 0.44,
    );

  shineGradient.addColorStop(
    0,
    "rgba(255,255,255,0.26)",
  );

  shineGradient.addColorStop(
    0.45,
    "rgba(255,255,255,0.10)",
  );

  shineGradient.addColorStop(
    1,
    "rgba(255,255,255,0)",
  );

  ctx.save();

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius,
  );
  ctx.closePath();

  ctx.fillStyle =
    shineGradient;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // ЛЕВЫЙ ВЕРТИКАЛЬНЫЙ БЛИК
  // =========================================================

  ctx.save();

  const sideGlow =
    ctx.createLinearGradient(
      x + 80,
      0,
      x + 240,
      0,
    );

  sideGlow.addColorStop(
    0,
    "rgba(255,255,255,0.12)",
  );

  sideGlow.addColorStop(
    1,
    "rgba(255,255,255,0)",
  );

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius,
  );
  ctx.closePath();

  ctx.fillStyle =
    sideGlow;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // НИЖНИЙ РЕФЛЕКС
  // =========================================================

  ctx.save();

  const bottomReflection =
    ctx.createLinearGradient(
      0,
      y + height * 0.58,
      0,
      y + height,
    );

  bottomReflection.addColorStop(
    0,
    "rgba(170,235,255,0.00)",
  );

  bottomReflection.addColorStop(
    0.55,
    "rgba(120,220,255,0.06)",
  );

  bottomReflection.addColorStop(
    1,
    "rgba(210,245,255,0.14)",
  );

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius,
  );
  ctx.closePath();

  ctx.fillStyle =
    bottomReflection;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // ПЕРВАЯ ВЕРТИКАЛЬНАЯ ПОЛОСА
  // =========================================================

  ctx.save();

  const verticalReflection1 =
    ctx.createLinearGradient(
      x + width * 0.18,
      0,
      x + width * 0.34,
      0,
    );

  verticalReflection1.addColorStop(
    0,
    "rgba(255,255,255,0.00)",
  );

  verticalReflection1.addColorStop(
    0.45,
    "rgba(255,255,255,0.10)",
  );

  verticalReflection1.addColorStop(
    1,
    "rgba(255,255,255,0.00)",
  );

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius,
  );
  ctx.closePath();

  ctx.fillStyle =
    verticalReflection1;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // ВТОРАЯ СЛАБАЯ ВЕРТИКАЛЬНАЯ ПОЛОСА
  // =========================================================

  ctx.save();

  const verticalReflection2 =
    ctx.createLinearGradient(
      x + width * 0.62,
      0,
      x + width * 0.75,
      0,
    );

  verticalReflection2.addColorStop(
    0,
    "rgba(255,255,255,0.00)",
  );

  verticalReflection2.addColorStop(
    0.5,
    "rgba(190,245,255,0.055)",
  );

  verticalReflection2.addColorStop(
    1,
    "rgba(255,255,255,0.00)",
  );

  ctx.beginPath();
  ctx.roundRect(
    x,
    y,
    width,
    height,
    radius,
  );
  ctx.closePath();

  ctx.fillStyle =
    verticalReflection2;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // ДИАГОНАЛЬНЫЙ ГЛЯНЕЦ
  // =========================================================

  ctx.save();

  ctx.translate(
    x + width * 0.52,
    y + height * 0.3,
  );

  ctx.rotate(-0.32);

  const diagonalShine =
    ctx.createLinearGradient(
      -220,
      0,
      220,
      0,
    );

  diagonalShine.addColorStop(
    0,
    "rgba(255,255,255,0.00)",
  );

  diagonalShine.addColorStop(
    0.45,
    "rgba(255,255,255,0.045)",
  );

  diagonalShine.addColorStop(
    0.55,
    "rgba(255,255,255,0.095)",
  );

  diagonalShine.addColorStop(
    1,
    "rgba(255,255,255,0.00)",
  );

  ctx.fillStyle =
    diagonalShine;

  ctx.fillRect(
    -260,
    -34,
    520,
    68,
  );

  ctx.restore();


  // =========================================================
  // ВНУТРЕННЯЯ ПОДСВЕТКА СНИЗУ
  // =========================================================

  ctx.save();

  ctx.beginPath();

  ctx.roundRect(
    x + 12,
    y + 12,
    width - 24,
    height - 24,
    Math.max(0, radius - 8),
  );

  ctx.closePath();

  const innerGlow =
    ctx.createLinearGradient(
      0,
      y + height * 0.68,
      0,
      y + height,
    );

  innerGlow.addColorStop(
    0,
    "rgba(255,255,255,0.00)",
  );

  innerGlow.addColorStop(
    1,
    "rgba(150,235,255,0.07)",
  );

  ctx.strokeStyle =
    "rgba(180,245,255,0.05)";

  ctx.lineWidth = 2;

  ctx.stroke();

  ctx.fillStyle =
    innerGlow;

  ctx.fill();

  ctx.restore();


  // =========================================================
  // ВНЕШНИЙ МЯГКИЙ ОБОДОК
  // =========================================================

  ctx.save();

  ctx.beginPath();

  ctx.roundRect(
    x + 1,
    y + 1,
    width - 2,
    height - 2,
    radius,
  );

  ctx.closePath();

  ctx.strokeStyle =
    "rgba(165,230,245,0.18)";

  ctx.lineWidth = 14;

  ctx.shadowColor =
    "rgba(150,225,245,0.18)";

  ctx.shadowBlur = 12;

  ctx.stroke();

  ctx.restore();


  // =========================================================
  // ОСНОВНАЯ СВЕТЛАЯ РАМКА
  // =========================================================

  ctx.save();

  ctx.beginPath();

  ctx.roundRect(
    x + 4,
    y + 4,
    width - 8,
    height - 8,
    Math.max(0, radius - 3),
  );

  ctx.closePath();

  if (
    isHighlight &&
    !highlightBorder
  ) {
    ctx.strokeStyle =
      GLASS_PALETTES.normal.border;
  } else {
    ctx.strokeStyle =
      palette.border;
  }

  ctx.lineWidth =
    borderWidth ??
    (isHighlight ? 6 : 5);

  if (isLocked && borderWidth == null) {
    ctx.lineWidth = 6;
  }

  ctx.stroke();

  ctx.restore();
}


// =========================================================
// HTML-ВЕРСИЯ СТЕКЛА
//
// Canvas имеет те же 2048×320, что и строки барабана
// настроек. Поэтому CSS просто масштабирует ТО ЖЕ стекло
// до размеров HTML-строки.
// =========================================================

export function installUiGlassRows(
  selector,
  {
    variant = "normal",
  } = {},
) {
  const elements =
    Array.from(
      document.querySelectorAll(selector),
    );

  elements.forEach((element) => {
    if (
      element.querySelector(
        ":scope > .ui-glass-canvas",
      )
    ) {
      return;
    }

    const canvas =
      document.createElement("canvas");

    canvas.className =
      "ui-glass-canvas";

    canvas.width = 2048;
    canvas.height = 320;

    canvas.setAttribute(
      "aria-hidden",
      "true",
    );

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

  drawUiGlass(ctx, {
  x: 8,
  y: 8,
  width: canvas.width - 16,
  height: canvas.height - 16,
  radius: 26,
  variant,
});

    element.prepend(canvas);
  });
}