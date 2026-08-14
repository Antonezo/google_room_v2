import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CONFIG } from "./config.js";

// Класс для управления частицами (пыль, краска, искры)
export class ParticlePool {
  constructor(scene, texture, maxParticles, type, baseColorHex) {
    this.scene = scene;
    this.pool = [];
    this.activeParticles = [];

    for (let i = 0; i < maxParticles; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: new THREE.Color(baseColorHex),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.scene.add(sprite);

      this.pool.push({
        mesh: sprite,
        velocity: new THREE.Vector3(),
        life: 0,
        decay: 0,
        type: type,
      });
    }
  }

  spawn(pos, velocity, scale, life, decay) {
    if (this.pool.length === 0) return;

    const p = this.pool.pop();

    p.mesh.position.copy(pos);
    p.mesh.scale.set(scale, scale, 1);
    p.mesh.material.opacity = 1.0;
    p.mesh.visible = true;

    p.velocity.copy(velocity);
    p.life = life;
    p.decay = decay;

    this.activeParticles.push(p);
  }

  // === В файле utils.js ===

  update(isSlowMoVal) {
    const sf = isSlowMoVal ? 0.2 : 1.0;
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life -= p.decay * sf;

      if (p.type === "heat") {
        p.mesh.material.opacity = Math.max(0, p.life) * 0.55;
        const s = p.mesh.scale.x * (1.0 + 0.02 * sf);
        p.mesh.scale.set(s, s, 1);
        p.velocity.x *= 0.994;
        p.velocity.z *= 0.994;
      } else if (p.type === "paint") {
        // Прозрачность облака краски
        const opacityFactor = 0.08;

        // 1. Динамическая турбулентность (эффект ветра)
        const turbulence = new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        );
        p.velocity.add(turbulence);

        // 2. Внешний вид
        p.mesh.material.opacity = p.life * opacityFactor;
        p.mesh.material.rotation += 0.02 * sf;

        // 3. Физика облака
        const s = p.mesh.scale.x * (1.0 + 0.02 * sf);
        p.mesh.scale.set(s, s, 1);
        p.velocity.multiplyScalar(0.92);
      }
      // === ВОТ НАШ НОВЫЙ БЛОК ДЛЯ ПЫЛИ ===
      else if (p.type === "dust") {
        // Плавное растворение (коэффициент 0.4 делает её полупрозрачной)
        p.mesh.material.opacity = Math.max(0, p.life) * 0.4;

        // Эффект рассеивания (облачко пыли медленно расширяется)
        const s = p.mesh.scale.x * (1.0 + 0.008 * sf);
        p.mesh.scale.set(s, s, 1);

        // Торможение: пыль вязнет в воздухе и теряет скорость разлета
        p.velocity.multiplyScalar(0.96);
      }

      p.mesh.position.add(p.velocity.clone().multiplyScalar(sf));

      if (p.life <= 0) {
        p.mesh.visible = false;
        const lastParticle =
          this.activeParticles[this.activeParticles.length - 1];
        this.activeParticles[i] = lastParticle;
        this.activeParticles.pop();
        this.pool.push(p);
      }
    }
  }
}

// Базовый класс для связи 3D-модели и Физического тела
export class GameObject {
  constructor(world, scene, mesh, body) {
    this.world = world;
    this.scene = scene;
    this.mesh = mesh;
    this.body = body;

    if (this.mesh) this.scene.add(this.mesh);
    if (this.body) {
      this.world.addBody(this.body);
      this.body.userData.gameObject = this;
    }
  }

  update() {
    if (this.mesh && this.body) {
      this.mesh.position.copy(this.body.position);
      this.mesh.quaternion.copy(this.body.quaternion);
    }
  }

  setVisible(isVisible) {
    if (this.mesh) this.mesh.visible = isVisible;
    if (this.body) {
      if (isVisible && !this.world.bodies.includes(this.body)) {
        this.world.addBody(this.body);
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.position.copy(this.body.userData.startPos);
        this.body.quaternion.set(0, 0, 0, 1);
        this.body.sleep();
      } else if (!isVisible && this.world.bodies.includes(this.body)) {
        this.world.removeBody(this.body);
      }
    }
  }

  destroy() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) {
        Array.isArray(this.mesh.material)
          ? this.mesh.material.forEach((m) => m.dispose())
          : this.mesh.material.dispose();
      }
    }
    if (this.body) this.world.removeBody(this.body);
  }
}

// Пул для маленьких шариков, вылетающих при ударах
export class MiniBeadPool {
  constructor(world, scene, physicsMaterial, maxBeads) {
    this.world = world;
    this.scene = scene;
    this.pool = [];
    this.activeBeads = []; // <--- ВОТ ЭТА СТРОКА ПОТЕРЯЛАСЬ, ВЕРНУЛИ!

    const geo = new THREE.SphereGeometry(0.04, 16, 16);
    const shape = new CANNON.Sphere(0.04);

    this.materialsMap = {};
    CONFIG.COLORS.GOOGLE_UNIQUE.forEach((hex) => {
      this.materialsMap[hex] = new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.1,
        metalness: 0.2,
        transparent: true,
        opacity: 0.9,
      });
    });

    for (let i = 0; i < maxBeads; i++) {
      const mesh = new THREE.Mesh(
        geo,
        this.materialsMap[CONFIG.COLORS.GOOGLE_UNIQUE[0]],
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);

      const body = new CANNON.Body({
        mass: 0.005,
        material: physicsMaterial,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.TINY,
        collisionFilterMask: CONFIG.PHYSICS.GROUPS.SCENE,
      });
      body.addShape(shape);

      this.pool.push({ mesh, body, life: 0 });
    }
  }

  spawn(pos, colorHex) {
    if (this.pool.length === 0) return;

    const bead = this.pool.pop();

    if (this.materialsMap[colorHex]) {
      bead.mesh.material = this.materialsMap[colorHex];
    }
    bead.mesh.visible = true;

    const spawnPos = new THREE.Vector3(
      pos.x + (Math.random() - 0.5) * 0.15,
      pos.y + (Math.random() - 0.5) * 0.15,
      pos.z + (Math.random() - 0.5) * 0.15,
    );

    bead.body.position.copy(spawnPos);
    bead.body.velocity.set(
      (Math.random() - 0.5) * 3,
      Math.random() * 3 + 1.5,
      (Math.random() - 0.5) * 3,
    );
    bead.body.angularVelocity.set(0, 0, 0);

    this.world.addBody(bead.body);
    bead.body.wakeUp();

    bead.life = 0.6;
    this.activeBeads.push(bead);
  }

  update(dt) {
    for (let i = this.activeBeads.length - 1; i >= 0; i--) {
      const bead = this.activeBeads[i];
      bead.life -= dt;

      bead.mesh.position.copy(bead.body.position);
      bead.mesh.quaternion.copy(bead.body.quaternion);

      if (
        bead.life <= 0 ||
        bead.body.position.y < CONFIG.WORLD.FLOOR_LEVEL - 2
      ) {
        bead.mesh.visible = false;
        this.world.removeBody(bead.body);

        // Правильный Swap and Pop
        const lastBead = this.activeBeads[this.activeBeads.length - 1];
        this.activeBeads[i] = lastBead;
        this.activeBeads.pop();

        this.pool.push(bead);
      }
    }
  }
}
