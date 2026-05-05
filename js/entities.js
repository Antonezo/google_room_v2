import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

export class InteractiveBox {
  constructor(world, scene, physicsMaterial, config) {
    this.world = world;
    this.scene = scene;
    
    this.size = config.size; // {x, y, z}
    this.originalMass = config.mass || 15;
    this.isPlayerOn = false;
    
    this.startPosition = config.position;

    this._buildVisuals(config.textures);
    this._buildPhysics(physicsMaterial);
  }

  _buildVisuals(textures) {
    const textureLoader = new THREE.TextureLoader();
    
    const colorTex = textureLoader.load(textures.color);
    const normalTex = textureLoader.load(textures.normal);
    const roughTex = textureLoader.load(textures.rough);

    // Универсальный тайлинг
    const repeatX = this.size.x / 2;
    const repeatY = this.size.y / 2;
    
    [colorTex, normalTex, roughTex].forEach(tex => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    });

    const geo = new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
    const mat = new THREE.MeshStandardMaterial({
      map: colorTex,
      normalMap: normalTex,
      roughnessMap: roughTex,
      color: 0xffffff,
      normalScale: new THREE.Vector2(1.2, 1.2),
      roughness: 1.0,
      metalness: 0.1,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
  }

  _buildPhysics(physicsMaterial) {
    const halfExtents = new CANNON.Vec3(this.size.x / 2, this.size.y / 2, this.size.z / 2);
    const shape = new CANNON.Box(halfExtents);

    this.body = new CANNON.Body({
      mass: this.originalMass,
      material: physicsMaterial,
      position: new CANNON.Vec3(this.startPosition.x, this.startPosition.y, this.startPosition.z),
      linearDamping: 0.1,
      angularDamping: 0.99,
      collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS,
      collisionFilterMask: CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY,
    });

    this.body.angularFactor.set(1, 1, 1);
    this.body.addShape(shape);
    this.world.addBody(this.body);
    this.body.sleep();
  }

  // Обновление графики по физике (вызывается каждый кадр)
  update() {
    this.mesh.position.copy(this.body.interpolatedPosition);
    this.mesh.quaternion.copy(this.body.interpolatedQuaternion);
  }

  // === ИНКАПСУЛЯЦИЯ: Ящик сам управляет своей массой ===
  onPlayerLanded() {
    if (this.isPlayerOn) return;
    this.isPlayerOn = true;
    
    if (this.body.mass !== 0) {
      this.body.mass = 0;
      this.body.updateMassProperties();
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
    }
  }

  onPlayerLeft() {
    if (!this.isPlayerOn) return;
    this.isPlayerOn = false;
    
    if (this.body.mass === 0) {
      this.body.mass = this.originalMass;
      this.body.updateMassProperties();
      this.body.wakeUp();
    }
  }

  reset() {
    this.body.mass = this.originalMass;
    this.body.updateMassProperties();
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.set(this.startPosition.x, this.startPosition.y, this.startPosition.z);
    this.body.quaternion.set(0, 0, 0, 1);
    
    // Синхронизируем интерполированные позиции (чтобы не было визуальных глитчей при рестарте)
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.sleep();
    this.isPlayerOn = false;
  }
}