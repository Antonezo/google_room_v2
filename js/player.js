import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

export class PlayerController {
 constructor(world, scene, sceneManager, physicsManager, cameraPivot, startPos, interactivePlatforms = []) {
    this.world = world;
    this.scene = scene;
    this.cameraPivot = cameraPivot;

    const playerRadius = CONFIG.PLAYER.RADIUS || 1.5;

    // Инкапсулированное создание игрока
    this.mesh = sceneManager.createPlayerMesh(playerRadius);
    this.body = physicsManager.createPlayerBody(playerRadius, CONFIG.PLAYER.MASS, startPos);

    // Инкапсулированная тень
    const shadowGeo = new THREE.CircleGeometry(playerRadius, 32);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.5,
      depthWrite: false, 
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.scene.add(this.shadowMesh);
    
    
    this.interactivePlatforms = interactivePlatforms; 
    // ДОБАВИЛИ КЕШ ТАЙМЕРОВ ДЛЯ ПЛАТФОРМ
    this.platformTimers = new Map(); 

    this.keys = { w: false, a: false, s: false, d: false, space: false };
    this.initInput();
    this.isLocked = false; // Блокировка управления (например, во время кат-сцены)

    this.isGrounded = false;
    this.coyoteTimer = 0;
    this.radius = CONFIG.PLAYER.RADIUS || 1.5;

    this._torqueVec = new CANNON.Vec3();
    this._forceVec = new CANNON.Vec3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._torqueAxis = new THREE.Vector3();
  }

  initInput() {
    window.addEventListener("keydown", (e) => {
      if (document.activeElement.tagName === "INPUT") return;
      const key = e.code.replace('Key', '').toLowerCase();
      if (this.keys.hasOwnProperty(key)) this.keys[key] = true;
      if (e.code === "Space") {
        e.preventDefault();
        this.keys.space = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      const key = e.code.replace('Key', '').toLowerCase();
      if (this.keys.hasOwnProperty(key)) this.keys[key] = false;
      if (e.code === "Space") this.keys.space = false;
    });

    window.addEventListener("blur", () => {
      for (let k in this.keys) this.keys[k] = false;
    });
  }

  checkGround(dt) {
    let actualGroundContact = false;
    let platformsPlayerIsOn = new Set();

    for (let i = 0; i < this.world.contacts.length; i++) {
      let contact = this.world.contacts[i];

      if (contact.bi === this.body || contact.bj === this.body) {
        if (contact.bi === this.body && contact.ni.y < -0.1) actualGroundContact = true;
        if (contact.bj === this.body && contact.ni.y > 0.1) actualGroundContact = true;

        if (this.interactivePlatforms) {
          this.interactivePlatforms.forEach((platform) => {
            if (contact.bi === platform.body || contact.bj === platform.body) {
              if (contact.bi === this.body && contact.ni.y < -0.5) platformsPlayerIsOn.add(platform);
              if (contact.bj === this.body && contact.ni.y > 0.5) platformsPlayerIsOn.add(platform);
            }
          });
        }
      }
    }

    if (actualGroundContact) {
      this.coyoteTimer = 0.25;
    } else {
      this.coyoteTimer -= dt;
    }
    
    this.isGrounded = this.coyoteTimer > 0;

    // МАГИЯ УМНЫХ КОРОБОК С ЗАЩИТОЙ ОТ ДРЕБЕЗГА
    if (this.interactivePlatforms) {
      this.interactivePlatforms.forEach(platform => {
        if (platformsPlayerIsOn.has(platform)) {
          // Игрок на платформе — даем ей 200мс "доверия"
          this.platformTimers.set(platform, 0.2); 
          platform.onPlayerLanded();
        } else {
          // Игрок потерял контакт. Уменьшаем таймер.
          let timeLeft = this.platformTimers.get(platform) || 0;
          timeLeft -= dt;
          this.platformTimers.set(platform, timeLeft);

          // Отпускаем платформу ТОЛЬКО если 200мс реально прошло
          if (timeLeft <= 0) {
            platform.onPlayerLeft();
          }
        }
      });
    }
  }

  update(dt) {
   this.mesh.position.copy(this.body.interpolatedPosition);
    this.mesh.quaternion.copy(this.body.interpolatedQuaternion);

    this.checkGround(dt);

    let inputX = (this.keys.d ? 1 : 0) - (this.keys.a ? 1 : 0);
    let inputZ = (this.keys.s ? 1 : 0) - (this.keys.w ? 1 : 0);

     // === НОВОЕ: БЛОКИРОВКА УПРАВЛЕНИЯ ДЛЯ КАТ-СЦЕН ===
    if (this.isLocked) {
      inputX = 0;
      inputZ = 0;
      this.keys.space = false;
    }

    const hasMoveInput = inputX !== 0 || inputZ !== 0;
    const wantsJump = this.keys.space && this.isGrounded;

    if (hasMoveInput) {

      this._forward.set(0, 0, -1).applyQuaternion(this.cameraPivot.quaternion);
      this._forward.y = 0;
      this._forward.normalize();

      this._right.set(1, 0, 0).applyQuaternion(this.cameraPivot.quaternion);
      this._right.y = 0;
      this._right.normalize();

      this._moveDir.set(0, 0, 0)
        .addScaledVector(this._right, inputX)
        .addScaledVector(this._forward, -inputZ)
        .normalize();

      this._torqueAxis.crossVectors(this._moveDir, new THREE.Vector3(0, 1, 0));

      const torqueForce = -6000.0;
      this._torqueVec.set(this._torqueAxis.x * torqueForce, this._torqueAxis.y * torqueForce, this._torqueAxis.z * torqueForce);
      
           // Управление в воздухе должно быть слабым,
      // иначе шар перелетает маленькие платформы и ступени.
      const airForce = 320.0;
      this._forceVec.set(
        this._moveDir.x * airForce,
        0,
        this._moveDir.z * airForce,
      );
    }

      if (this.isGrounded) {
      if (hasMoveInput && !wantsJump) {
        this.body.wakeUp();
        this.body.applyTorque(this._torqueVec);
        
        const maxSpin = 35.0;
        if (this.body.angularVelocity.length() > maxSpin) {
          this.body.angularVelocity.scale(maxSpin / this.body.angularVelocity.length(), this.body.angularVelocity);
        }
      } else {
        this.body.angularVelocity.scale(0.96, this.body.angularVelocity);
        this.body.velocity.scale(0.98, this.body.velocity);
      }
        } else {
      if (inputX !== 0 || inputZ !== 0) {
        this.body.wakeUp();
        this.body.applyForce(this._forceVec, new CANNON.Vec3(0, 0, 0));
      }

      // Небольшое воздушное сопротивление по горизонтали.
      // Помогает не перелетать маленькие блоки.
      this.body.velocity.x *= 0.992;
      this.body.velocity.z *= 0.992;

      // Жёсткий лимит горизонтальной скорости в воздухе.
      // Вертикальную скорость не трогаем, чтобы прыжок остался нормальным.
      const maxAirHorizontalSpeed = 7.0;
      const horizontalSpeed = Math.hypot(
        this.body.velocity.x,
        this.body.velocity.z,
      );

      if (horizontalSpeed > maxAirHorizontalSpeed) {
        const k = maxAirHorizontalSpeed / horizontalSpeed;
        this.body.velocity.x *= k;
        this.body.velocity.z *= k;
      }

      this.body.angularVelocity.scale(0.92, this.body.angularVelocity);
    }

      if (wantsJump) {
      this.body.wakeUp();

      // При прыжке с разбега даём чуть больше вертикали,
      // чтобы шар не цеплялся за край ступеньки.
      this.body.velocity.y =  hasMoveInput ? 12.2 : 11.2;

      // Убираем лишнюю раскрутку в момент отрыва.
      // Иначе шар может продолжать буксовать/давить в край блока.
      this.body.angularVelocity.scale(0.45, this.body.angularVelocity);

      // Не даём горизонтальной скорости стать слишком большой при отрыве.
      // Это не тормозит разбег полностью, а только убирает чрезмерный "влёт" в стенку.
      const maxTakeoffHorizontalSpeed = 8.0;
      const takeoffSpeed = Math.hypot(
        this.body.velocity.x,
        this.body.velocity.z,
      );

      if (takeoffSpeed > maxTakeoffHorizontalSpeed) {
        const k = maxTakeoffHorizontalSpeed / takeoffSpeed;
        this.body.velocity.x *= k;
        this.body.velocity.z *= k;
      }

      this.isGrounded = false;
      this.coyoteTimer = 0;
    }

    this.updateShadow();
  }

  updateShadow() {
    if (!this.shadowMesh) return;
    const floorY = CONFIG.WORLD.FLOOR_LEVEL;
    this.shadowMesh.position.set(this.body.interpolatedPosition.x, floorY + 0.05, this.body.interpolatedPosition.z);
    
    const heightOffset = this.body.interpolatedPosition.y - this.radius - floorY;
    let shadowScale = Math.max(0.2, 1.0 - heightOffset / 12.0);
    
    this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
    this.shadowMesh.material.opacity = 0.5 * shadowScale;
  }
}