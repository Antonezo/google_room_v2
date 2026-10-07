import * as CANNON from "cannon-es";
import { CONFIG } from "./config.js";

export class PhysicsManager {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, CONFIG.WORLD.GRAVITY, 0),
    });
    this.matStandard = new CANNON.Material("standard");
    this.matBouncy = new CANNON.Material("bouncy");
    this.matSlippery = new CANNON.Material("slippery");

    // === НОВЫЙ МАТЕРИАЛ ДЛЯ ТЯЖЕЛОГО ШАРА ===
    this.matHeavy = new CANNON.Material("heavy");

    this.matTutorialShelf =
  new CANNON.Material("tutorialShelf");

    // === НОВЫЙ МАТЕРИАЛ ДЛЯ ИНТЕРАКТИВНЫХ КОРОБОК ===
    this.matBox = new CANNON.Material("box");

    // Верхняя поверхность интерактивных коробок.
    // Она должна быть цепкой, чтобы шар мог ехать по блоку.
    this.matBoxTop = new CANNON.Material("boxTop");

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matStandard, this.matBouncy, {
        friction: 0.3,
        restitution: 0.9,
      }),
    );

this.world.addContactMaterial(
  new CANNON.ContactMaterial(
    this.matTutorialShelf,
    this.matHeavy,
    {
      friction: 1.35,
      restitution: 0.05,

      contactEquationStiffness: 5e7,
      contactEquationRelaxation: 4,
    },
  ),
);

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matBouncy, this.matBouncy, {
        friction: 0.1,
        restitution: 0.9,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matSlippery, this.matBouncy, {
        friction: 0.0,
        restitution: 0.5,
      }),
    );

    // === ПРАВИЛА СТОЛКНОВЕНИЯ: ТЯЖЕЛЫЙ ШАР + КОРОБКА ===
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matBox, this.matHeavy, {
        // Низкое трение, чтобы шар толкал блок,
        // а не пытался "закатываться" по его ребру.
        friction: 0.02,
        restitution: 0.0,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
      }),
    );

    // === ПРАВИЛА СТОЛКНОВЕНИЯ: ТЯЖЕЛЫЙ ШАР + ВЕРХ КОРОБКИ ===
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matBoxTop, this.matHeavy, {
        friction: 1.5,
        restitution: 0.0,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
      }),
    );

    // === ПРАВИЛА СТОЛКНОВЕНИЯ: КОРОБКА + ПОЛ ===
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matBox, this.matStandard, {
        friction: 0.01, // Очень низкое трение: блок скользит по полу без зацепа ребром.
        restitution: 0.0, // Никакой прыгучести
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      }),
    );

    // === ПРАВИЛА СТОЛКНОВЕНИЯ: КОРОБКА + СКОЛЬЗКАЯ СТЕНА ===
    //
    // Стены комнат используют matSlippery.
    // Без отдельного ContactMaterial Cannon применяет настройки по умолчанию,
    // из-за чего зажатый у стены блок может резко отбрасываться обратно.
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matBox, this.matSlippery, {
        friction: 0.0,
        restitution: 0.0,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 4,
      }),
    );

    // === ПРАВИЛА СТОЛКНОВЕНИЯ: ТЯЖЕЛЫЙ ШАР + СТЕНА/ПОЛ ===
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matStandard, this.matHeavy, {
        friction: 1.2,
        restitution: 0.15, // <--- СНИЗИЛИ ДО МИНИМУМА (было 0.35)
        contactEquationStiffness: 5e7,
        contactEquationRelaxation: 4,
      }),
    );

    // === ПРАВИЛА СТОЛКНОВЕНИЯ: ТЯЖЕЛЫЙ ШАР + СКОЛЬЗКАЯ СТЕНА ===
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.matSlippery, this.matHeavy, {
        friction: 0.0, // Идеально скользко! Никакого эффекта "шины".
        restitution: 0.15, // Отскок такой же глухой, как у пола
        contactEquationStiffness: 5e7,
        contactEquationRelaxation: 4,
      }),
    );

    this._tempForce = new CANNON.Vec3();
    // Настраиваем настоящее направленное трение:
// верхние поверхности matBox цепкие,
// боковые поверхности matBox скользкие.
this.installDirectionalBoxFriction();
  }

installDirectionalBoxFriction() {
  const narrowphase = this.world.narrowphase;

  // Сохраняем оригинальный метод Cannon.
  const originalCreateFriction =
    narrowphase.createFrictionEquationsFromContact.bind(narrowphase);

  narrowphase.createFrictionEquationsFromContact = (
    contactEquation,
    outArray,
  ) => {
    // Запоминаем, сколько уравнений трения было до этого контакта.
    const startIndex = outArray.length;

    // Сначала Cannon создаёт свои обычные FrictionEquation.
    const created = originalCreateFriction(
      contactEquation,
      outArray,
    );

    if (!created) {
      return created;
    }

    const bodyA = contactEquation.bi;
    const bodyB = contactEquation.bj;

    if (!bodyA || !bodyB) {
      return created;
    }

    // Нас интересует только:
    //
    // шар игрока (matHeavy)
    //          ↕
    // динамическая фигура (matBox)
    const isHeavyBoxPair =
      (bodyA.material === this.matHeavy &&
        bodyB.material === this.matBox) ||
      (bodyA.material === this.matBox &&
        bodyB.material === this.matHeavy);

    if (!isHeavyBoxPair) {
      return created;
    }

    // ==========================================
    // НОРМАЛЬ ПОВЕРХНОСТИ ФИГУРЫ В СТОРОНУ ШАРА
    // ==========================================
    //
    // contactEquation.ni направлена от bodyA к bodyB.
    //
    // Нам нужно понять не порядок тел,
    // а насколько поверхность matBox смотрит ВВЕРХ.

    let surfaceNormalY;

    if (bodyA.material === this.matHeavy) {
      // A = шар
      // B = фигура
      //
      // ni идёт от шара к фигуре,
      // значит нормаль фигуры в сторону шара противоположна.
      surfaceNormalY = -contactEquation.ni.y;
    } else {
      // A = фигура
      // B = шар
      //
      // ni уже идёт от фигуры к шару.
      surfaceNormalY = contactEquation.ni.y;
    }

    // ==========================================
    // ВЫБИРАЕМ КОЭФФИЦИЕНТ ТРЕНИЯ
    // ==========================================

    const UPWARD_SURFACE_THRESHOLD = 0.93;

    // Такое же нормальное сцепление, как у пола.
    const TOP_FRICTION = 0.75;

    // Почти скользкая боковая грань.
    const SIDE_FRICTION = 0.02;

    const friction =
      surfaceNormalY > UPWARD_SURFACE_THRESHOLD
        ? TOP_FRICTION
        : SIDE_FRICTION;

    // ==========================================
    // ПОВТОРЯЕМ ШТАТНЫЙ РАСЧЁТ CANNON
    // ==========================================
    //
    // Cannon использует:
    //
    // friction × gravity × reducedMass
    //
    // Мы не создаём собственную физику.
    // Только меняем допустимую силу уже созданных
    // Cannon FrictionEquation.

    const frictionGravity =
      this.world.frictionGravity || this.world.gravity;

    const gravityStrength = frictionGravity.length();

    let reducedMass =
      bodyA.invMass + bodyB.invMass;

    if (reducedMass > 0) {
      reducedMass = 1 / reducedMass;
    }

    const maxFrictionForce =
      friction *
      gravityStrength *
      reducedMass;

    // Для одного контакта Cannon обычно добавляет
    // две касательные FrictionEquation.
    //
    // Меняем только те, которые были созданы
    // непосредственно этим контактом.
    for (let i = startIndex; i < outArray.length; i++) {
      const frictionEquation = outArray[i];

      frictionEquation.minForce = -maxFrictionForce;
      frictionEquation.maxForce = maxFrictionForce;
    }

    return created;
  };
}

  createStaticPlane(pos, rot, configGroups) {
    const body = new CANNON.Body({
      mass: 0,
      material: this.matStandard,
      collisionFilterGroup: configGroups.SCENE,
      collisionFilterMask: configGroups.OBJECTS | configGroups.TINY,
    });
    body.addShape(new CANNON.Plane());
    body.position.copy(pos);
    if (rot) body.quaternion.setFromEuler(rot.x, rot.y, rot.z);
    this.world.addBody(body);
    return body;
  }

  createWallWithHole(
    width,
    height,
    thickness,
    holeWidth,
    holeHeight,
    pos,
    rot,
    configGroups,
  ) {
    const body = new CANNON.Body({
      mass: 0,
      material: this.matSlippery, // <--- БЫЛ matStandard, СТАЛ matSlippery
      collisionFilterGroup: configGroups.SCENE,
      collisionFilterMask: configGroups.OBJECTS | configGroups.TINY,
    });

    const hw = width / 2;
    const hh = height / 2;
    const hHoleW = holeWidth / 2;
    const hHoleH = holeHeight / 2;
    const hThick = thickness / 2;

    // 1. Нижняя панель
    const bottomH = (height - holeHeight) / 2;
    if (bottomH > 0) {
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(hw, bottomH / 2, hThick)),
        new CANNON.Vec3(0, -hh + bottomH / 2, 0),
      );
    }

    // 2. Верхняя панель
    const topH = (height - holeHeight) / 2;
    if (topH > 0) {
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(hw, topH / 2, hThick)),
        new CANNON.Vec3(0, hh - topH / 2, 0),
      );
    }

    // 3. Левая панель
    const sideW = (width - holeWidth) / 2;
    if (sideW > 0) {
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(sideW / 2, hHoleH, hThick)),
        new CANNON.Vec3(-hw + sideW / 2, 0, 0),
      );
    }

    // 4. Правая панель
    if (sideW > 0) {
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(sideW / 2, hHoleH, hThick)),
        new CANNON.Vec3(hw - sideW / 2, 0, 0),
      );
    }

    body.position.copy(pos);
    if (rot) body.quaternion.setFromEuler(rot.x, rot.y, rot.z);

    this.world.addBody(body);
    return body;
  }

  // НОВЫЙ МЕТОД ДЛЯ ШАРА-ИГРОКА

  createPlayerBody(radius, mass, posVec) {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: mass,
      material: this.matHeavy, // <--- ИЗМЕНИЛИ: теперь он "Тяжелый", а не "Стандартный"
      position: new CANNON.Vec3(posVec.x, posVec.y, posVec.z),
      collisionFilterGroup: 2, // Группа OBJECTS
      collisionFilterMask: 3, // Сталкивается с 1 и 2
    });

    body.addShape(shape);

    body.linearDamping = 0.05; // Почти не тормозит об воздух
    body.angularDamping = 0.4; // Чуть снизили, тормозить будет за счет трения качения

    // Учим шар чувствовать микро-вибрации перед сном
    body.sleepSpeedLimit = 0.02; // По умолчанию 0.1. Позволяем дребезжать на низких скоростях.
    body.sleepTimeLimit = 1.5; // Даем ему полторы секунды на вибрации, прежде чем "уснуть".

    this.world.addBody(body);
    return body;
  }



step(dt, isSlowMo) {
  const timeScale = isSlowMo ? 0.2 : 1.0;
  const scaledDt = dt * timeScale;
  const fixedTimeStep = (1 / 60) * timeScale;

  this.world.step(
    fixedTimeStep,
    scaledDt,
    20,
  );
}

  applyEnvironmentForces(
    letterBodies,
    balls,
    fanLevel,
    timeSec,
    isMagnetEquipped,
  ) {
    const env = -(Math.cos(Math.PI * fanLevel) - 1) / 2;
    const repWeaken = fanLevel > 0 ? 0.25 : 1.0;

    const applyLogic = (body, useMagnet) => {
      if (!body || body.position.y > CONFIG.WORLD.FLOOR_LEVEL + 3.0) return;
      const distSq =
        body.position.x * body.position.x + body.position.z * body.position.z;

      if (
        useMagnet &&
        distSq < CONFIG.PHYSICS.REPULSOR.MAGNET_OUTER_RADIUS_SQ &&
        distSq > CONFIG.PHYSICS.REPULSOR.MAGNET_INNER_RADIUS_SQ
      ) {
        body.wakeUp();
        const pull = CONFIG.PHYSICS.REPULSOR.MAGNET_PULL_FORCE * repWeaken;
        body.velocity.x -= body.position.x * pull;
        body.velocity.z -= body.position.z * pull;
      }

      if (
        !isMagnetEquipped &&
        distSq <= CONFIG.PHYSICS.REPULSOR.CORE_RADIUS_SQ &&
        body.position.y < CONFIG.WORLD.FLOOR_LEVEL + 2.5
      ) {
        body.wakeUp();
        const vForce = CONFIG.PHYSICS.REPULSOR.CORE_UP_FORCE * repWeaken;
        if (body.velocity.y < vForce) {
          body.velocity.y = vForce;
          const a = Math.random() * Math.PI * 2;
          const s = CONFIG.PHYSICS.REPULSOR.CORE_SCATTER * repWeaken;
          body.velocity.x += Math.cos(a) * s;
          body.velocity.z += Math.sin(a) * s;
          body.angularVelocity.x += (Math.random() - 0.5) * 30;
          body.angularVelocity.z += (Math.random() - 0.5) * 30;
        }
      }
    };

    const applyUpdraft = (body) => {
      if (
        !body ||
        body.mass <= 0 ||
        env <= 0 ||
        body.position.y > CONFIG.WORLD.FLOOR_LEVEL + 14.0
      )
        return;
      body.wakeUp();
      const targetY = CONFIG.WORLD.FLOOR_LEVEL + 8.0;
      const bob = 0.55 * env * Math.sin(timeSec * 2.3 + body.id * 0.17);
      const desiredAccY =
        (6.6 +
          4.5 * (targetY + bob - body.position.y) -
          1.35 * body.velocity.y) *
        env;
      const drift = 0.75 * env;
      this._tempForce.set(
        body.mass * Math.sin(timeSec * 1.35 + body.id * 0.11) * drift,
        body.mass * desiredAccY,
        body.mass * Math.cos(timeSec * 1.15 + body.id * 0.09) * drift,
      );
      body.applyForce(this._tempForce, body.position);
      body.angularVelocity.x *= 0.92;
      body.angularVelocity.y *= 0.92;
      body.angularVelocity.z *= 0.92;
    };

    for (const body of letterBodies) {
      applyLogic(body, true);
      if (env > 0) applyUpdraft(body);
    }
    for (const body of balls) {
      if (!body) continue;
      applyLogic(body, false);
      if (env > 0) applyUpdraft(body);
    }
  }
}
