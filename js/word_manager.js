import * as THREE from "three";
import * as CANNON from "cannon-es";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { CONFIG } from "./config.js";
import { GameObject } from "./utils.js"; // Или откуда у тебя импортируется GameObject

export class WordManager {
  constructor(world, scene, physicsMaterial, audioManager) {
    this.world = world;
    this.scene = scene;
    this.physicsMaterial = physicsMaterial;
    this.audioManager = audioManager; // Передаем, чтобы звуки ударов работали

    this.letterObjects = [];
    this.currentWord = "GOOGLE";
    this.globalFont = null;
    this.lettersEnabled = false;
    
    this.isChangingWord = false;

    // Внешние коллбеки для эффектов (будем передавать из main.js)
    this.onLetterHit = null; 
    this.onDustExplosion = null;

    this._loadFont();
  }

  _loadFont() {
    const fontLoader = new FontLoader();
    fontLoader.load(
      "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
      (font) => {
        this.globalFont = font;
        this.spawnLetters(this.currentWord);

        // Если при старте буквы отключены — прячем
        if (!this.lettersEnabled) {
          this.setLettersVisibility(false);
        }
      }
    );
  }

  setLettersVisibility(isVisible) {
    this.letterObjects.forEach((obj) => {
      if (obj.setVisible) obj.setVisible(isVisible);
      else if (obj.mesh) obj.mesh.visible = isVisible;
      
      if (obj.body) {
        obj.body.collisionFilterMask = isVisible 
          ? CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS 
          : 0;
      }
    });
  }

  spawnLetters(wordStr) {
    // Очистка старых
    this.letterObjects.forEach((obj) => {
       if (obj.body) this.world.removeBody(obj.body);
       if (obj.mesh) this.scene.remove(obj.mesh);
    });
    this.letterObjects.length = 0;

    if (!this.globalFont || !wordStr) return;

    const charSpacing = 2.8;
    const totalWidth = wordStr.length * charSpacing;
    const startXOffset = -totalWidth / 2 + charSpacing / 2;

    for (let i = 0; i < wordStr.length; i++) {
      const color = CONFIG.COLORS.GOOGLE_PALETTE[i % CONFIG.COLORS.GOOGLE_PALETTE.length];
      
      const geo = new TextGeometry(wordStr[i], {
        font: this.globalFont, size: 2.5, height: 0.8,
        curveSegments: 8, bevelEnabled: true,
        bevelThickness: 0.15, bevelSize: 0.08, bevelSegments: 5,
      });
      geo.center();

      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color, roughness: 0.5, metalness: 0.1, emissive: color, emissiveIntensity: 0.0,
        })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      geo.computeBoundingBox();
      const size = geo.boundingBox.getSize(new THREE.Vector3());
      
      const body = new CANNON.Body({
        mass: CONFIG.PHYSICS.LETTER_MASS,
        material: this.physicsMaterial,
        angularDamping: 0.1,
        linearDamping: 0.01,
        collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS,
        collisionFilterMask: CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS,
      });
      body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
      
      const startX = startXOffset + i * charSpacing;
      body.position.set(startX, 2, 0);
      
      body.userData = {
        startPos: new CANNON.Vec3(startX, 2, 0),
        googleColor: color,
        halfHeight: size.y / 2,
      };
      body.sleep();

      const letterObj = new GameObject(this.world, this.scene, mesh, body);

      // Логика столкновений
      body.addEventListener("collide", (e) => {
        if (!this.lettersEnabled) return;
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v <= 1.35) return;
        
        const contactPos = new THREE.Vector3(
          e.contact.bi.position.x + e.contact.ri.x,
          e.contact.bi.position.y + e.contact.ri.y,
          e.contact.bi.position.z + e.contact.ri.z,
        );

        // Спавн бисера (вызываем внешний коллбек)
        if (e.body && e.body.mass === 0 && this.onLetterHit) {
          this.onLetterHit(contactPos, body.userData.googleColor);
        }
        
        if (this.audioManager && this.audioManager.playHitSound) {
          // Здесь бы передать isSlowMo, но можно обойтись проверкой внутри audioManager
          this.audioManager.playHitSound(v, false); 
        }
      });

      this.letterObjects.push(letterObj);
    }
  }

  changeWordSmoothly(newWord) {
    if (this.isChangingWord) return;
    if (this.currentWord === newWord) {
      this.returnLettersToStart();
      return;
    }

    this.isChangingWord = true;

    if (this.wordTimer1) clearTimeout(this.wordTimer1);
    if (this.wordTimer2) clearTimeout(this.wordTimer2);

    if (!this.lettersEnabled) {
      this.currentWord = newWord;
      this.spawnLetters(this.currentWord);
      this.setLettersVisibility(false);
      this.isChangingWord = false;
      return;
    }

    const now = performance.now();
    const duration = 300;

    this.letterObjects.forEach((obj) => {
      const body = obj.body;
      if (!body) return;
      body.userData.isShrinkingWord = true;
      body.userData.shrinkStartTime = now;
      body.collisionFilterMask = 0;
      body.type = CANNON.Body.KINEMATIC;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    });

    this.wordTimer1 = setTimeout(() => {
      this.letterObjects.forEach((obj) => {
        if (obj.body && this.onDustExplosion) {
          this.onDustExplosion(obj.body.position, 0.35);
        }
      });

      this.currentWord = newWord;
      this.spawnLetters(this.currentWord);

      const growStartTime = performance.now();

      this.letterObjects.forEach((obj) => {
        const body = obj.body;
        if (!body) return;
        obj.mesh.scale.set(0, 0, 0);
        body.userData.isGrowingWord = true;
        body.userData.growStartTime = growStartTime;
        body.collisionFilterMask = 0;
        body.type = CANNON.Body.KINEMATIC;
      });

      this.wordTimer2 = setTimeout(() => {
        this.letterObjects.forEach((obj) => {
          const body = obj.body;
          if (!body) return;
          body.userData.isGrowingWord = false;
          obj.mesh.scale.set(1, 1, 1);
          body.type = CANNON.Body.DYNAMIC;
          body.collisionFilterMask = CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.previousPosition.copy(body.position);
          body.sleep();
        });
        this.isChangingWord = false;
      }, duration);
    }, duration);
  }

  hideLettersSmoothly() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();
    this.letterObjects.forEach((obj) => {
      const body = obj.body;
      body.userData.isShrinkingWord = true;
      body.userData.isGrowingWord = false;
      body.userData.shrinkStartTime = now;
      body.collisionFilterMask = 0;
      if (this.onDustExplosion) this.onDustExplosion(body.position, 0.25);
    });
  }

  showLettersSmoothly() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();
    this.letterObjects.forEach((obj) => {
      obj.body.userData.isGrowingWord = true;
      obj.body.userData.isShrinkingWord = false;
      obj.body.userData.growStartTime = now;
    });
    this.returnLettersToStart();
  }

  returnLettersToStart() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();
    this.letterObjects.forEach((obj) => {
      const body = obj.body;
      body.type = CANNON.Body.KINEMATIC;
      body.collisionFilterMask = 0;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);

      body.userData.returnStartPos = body.position.clone();
      body.userData.returnStartQuat = { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w };
      body.userData.returnStartTime = now;
      body.userData.isReturning = true;
    });
  }

  updateAnimations(currentTime) {
    const targetColor = new THREE.Color();

    this.letterObjects.forEach((obj) => {
      const body = obj.body;

      // 1. Анимация сжатия
      if (body.userData.isShrinkingWord) {
        const progress = Math.min((currentTime - body.userData.shrinkStartTime) / 300, 1.0);
        const scale = 1.0 - THREE.MathUtils.smoothstep(progress, 0, 1);
        obj.mesh.scale.set(scale, scale, scale);

        if (progress >= 1.0) {
          body.userData.isShrinkingWord = false;
          body.type = CANNON.Body.KINEMATIC;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.sleep();
        }
      } 
      // 2. Анимация роста
      else if (body.userData.isGrowingWord) {
        const progress = Math.min((currentTime - body.userData.growStartTime) / 300, 1.0);
        const scale = THREE.MathUtils.smoothstep(progress, 0, 1);
        obj.mesh.scale.set(scale, scale, scale);
      }

      // 3. Обновление цвета
      if (body.userData.googleColor !== undefined) {
        targetColor.setHex(body.userData.googleColor);
        obj.mesh.material.color.lerp(targetColor, 0.05);
        if (obj.mesh.material.emissive) obj.mesh.material.emissive.lerp(targetColor, 0.05);
      }

      // 4. Возвращение на старт
      if (body.userData.isReturning) {
        const elapsed = currentTime - body.userData.returnStartTime;
        let progress = Math.min(elapsed / 800, 1.0);
        const ease = 1 - Math.pow(1 - progress, 3);

        body.position.x = THREE.MathUtils.lerp(body.userData.returnStartPos.x, body.userData.startPos.x, ease);
        body.position.y = THREE.MathUtils.lerp(body.userData.returnStartPos.y, body.userData.startPos.y, ease);
        body.position.z = THREE.MathUtils.lerp(body.userData.returnStartPos.z, body.userData.startPos.z, ease);

        const qStart = new THREE.Quaternion(
          body.userData.returnStartQuat.x, body.userData.returnStartQuat.y,
          body.userData.returnStartQuat.z, body.userData.returnStartQuat.w
        );
        qStart.slerp(new THREE.Quaternion(0, 0, 0, 1), ease);
        body.quaternion.set(qStart.x, qStart.y, qStart.z, qStart.w);

        if (progress >= 1.0) {
          body.userData.isReturning = false;
          body.type = CANNON.Body.DYNAMIC;
          body.collisionFilterMask = CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
          body.previousPosition.copy(body.position);
          body.sleep();
        }
      }
      
      // Синхронизация физики
      obj.update(); 
    });
  }
}