export const CONFIG = {
  WORLD: { ROOM_SIZE: 50, FLOOR_LEVEL: -5, CEILING_HEIGHT: 10, GRAVITY: -5.0 },

// === НОВЫЙ БЛОК НАСТРОЕК КАМЕРЫ ===
  CAMERA: {
    REGISTRATION: {
      fov: 60,
      pos: { x: 0, y: 6, z: 22 },
      target: { x: 0, y: 3, z: 0 },
      minDist: 10,
      maxDist: 24
    },
    GAMEPLAY: {
      fov: 75,
      pos: { x: 0, y: 2, z: 9 },
      target: { x: 0, y: 2, z: 0 },
      minDist: 2,
      maxDist: 9.5
    }
  },

  COLORS: {
    BG_DAY: 0xd8d8d8,
    BG_DISCO: 0x0b0f17,
    GOOGLE_PALETTE: [
      0x4285f4, 0xea4335, 0xfbbc05, 0x4285f4, 0x34a853, 0xea4335,
    ],
    GOOGLE_UNIQUE: [0x34a853, 0xfbbc05, 0xea4335, 0x4285f4],
  },
  PHYSICS: {
    MAX_BALLS: 200,
    BALL_RADIUS: 0.2,
    BALL_MASS: 0.02,
    LETTER_MASS: 0.002,
    REPULSOR: {
      MAGNET_OUTER_RADIUS_SQ: 120,
      MAGNET_INNER_RADIUS_SQ: 9,
      MAGNET_PULL_FORCE: 0.04,
      CORE_RADIUS_SQ: 20,
      CORE_UP_FORCE: 55,
      CORE_SCATTER: 8,
    },
    PAINT_STREAM: {
      PARTICLES_PER_SECOND: 100,
      SIZE: 0.35,
      DECAY: 0.1,
      EMISSION_RADIUS: 0.2,
    },
    GROUPS: { SCENE: 1, OBJECTS: 2, TINY: 4 },
  },
};
