import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import * as CANNON from 'cannon-es';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

import { CONFIG } from './config.js';
import { audioManager } from './audio.js';
import { store, isNight, isSlowMo } from './state.js';
import { PhysicsManager } from './physics.js';
import { SceneManager, heatTex } from './scene.js';
import { UIManager } from './ui.js';
import { InputManager } from './input.js';
import { ParticlePool, GameObject, MiniBeadPool } from './utils.js';

RectAreaLightUniformsLib.init();

export class GoogleRoomApp {
  constructor() {
    this.isPaused = false;
    this.isResetting = false; 
    this.lastTime = performance.now();
    this.platformImpact = 0;
    this.sceneManager = new SceneManager();

    this.scene = this.sceneManager.scene;
    this.camera = this.sceneManager.camera;
    this.renderer = this.sceneManager.renderer;
    this.composer = this.sceneManager.composer;
    this.bloomPass = this.sceneManager.bloomPass;
    
    this.currentWord = "GOOGLE";
    this.globalFont = null;
    this.lettersEnabled = true;
    this.fansActive = false; 
    this.fanLevel = 0.0;
    this.lettersHiddenByMagnet = false; 
    this.currentRingIntensity = 1.2;
    
    this.dustPool = new ParticlePool(this.scene, heatTex, 60, 'dust', 0xaaaaaa);
    this.heatPool = new ParticlePool(this.scene, heatTex, 40, 'heat', 0xFFB074);
    
    this.paintPools = CONFIG.COLORS.GOOGLE_UNIQUE.map(colorHex => 
      new ParticlePool(this.scene, heatTex, 1000, 'paint', colorHex)
    );
    this.paintParticleTime = 0;

    this.letterObjects = []; 
    this.ballsPool = new Array(CONFIG.PHYSICS.MAX_BALLS).fill(null);
    this.activeBallsCount = 0;
    this.ballSpawnIndex = 0;
    
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });
    this.tick = this.tick.bind(this);
    
    this.physicsManager = new PhysicsManager();
    this.world = this.physicsManager.world;
    this.matStandard = this.physicsManager.matStandard;
    this.matBouncy = this.physicsManager.matBouncy;
    this.matSlippery = this.physicsManager.matSlippery;

    this.miniBeadPool = new MiniBeadPool(this.world, this.scene, this.matBouncy, 120);

    this.uiManager = new UIManager({
      onTogglePause: () => { this.isPaused = !this.isPaused; return this.isPaused; },
      onReset: () => this.resetScene(),
      onSpawnBalls: () => { if (!this.isPaused) this.spawnBalls(); },
      onShrinkBalls: () => { if (!this.isPaused) this.startShrinkingBalls(); },
      onToggleFans: () => {
        if (!this.isPaused) {
          this.fansActive = !this.fansActive;
          if (this.fansActive) audioManager.playFansWhoosh(isSlowMo());
        }
      },
      onToggleLetters: () => {
        if (this.isPaused) return this.lettersEnabled;
        
        this.lettersEnabled = !this.lettersEnabled;
        
        if (this.lettersEnabled) {
          this.letterObjects.forEach(obj => obj.setVisible(true));
          this.showLettersSmoothly();
        } else {
          this.hideLettersSmoothly();
          
          clearTimeout(this.lettersToggleTimeout);
          this.lettersToggleTimeout = setTimeout(() => {
            if (!this.lettersEnabled) {
              this.letterObjects.forEach(obj => obj.setVisible(false));
            }
          }, 300);
        }
        
        return this.lettersEnabled;
      },
      onReturnLetters: () => { if (!this.isPaused) this.returnLettersToStart(); },
      onApplyWord: (word) => {
        if (!this.isPaused) {
          this.changeWordSmoothly(word); 
        }
      }
    });

    this.initSceneObjects();
    
    this.inputManager = new InputManager(
      this.camera, 
      this.world, 
      () => this.isPaused,
      () => store.get().currentTool,
      () => {
        const meshes = [...(this.lettersEnabled ? this.letterObjects.map(d=>d.mesh) : []), this.ballInstancedMesh];
        const getBodyByMesh = (hitObj) => {
           if (hitObj.object === this.ballInstancedMesh) {
              const body = this.ballsPool[hitObj.instanceId];
              return body ? body : null; 
           } else {
              const letterObj = this.letterObjects.find(d => d.mesh === hitObj.object);
              return letterObj ? letterObj.body : null; 
           }
        };
        return { meshes, getBodyByMesh };
      },
      (isDragging) => {
        if (isDragging) document.body.classList.add('is-dragging');
        else document.body.classList.remove('is-dragging');
      },
      () => this.sceneManager.walls.map(w => w.mesh),
      () => store.get().paintToolColor !== undefined ? store.get().paintToolColor : -1
    );

    this.setupStateReactions();
    
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_bold.typeface.json', (font) => { 
      this.uiManager.hideLoader(); 
      this.globalFont = font; 
      this.spawnLetters(this.currentWord); 
    });

    requestAnimationFrame(this.tick);
  }

  clearBalls() {
    if (this.activeBallsCount === 0) return;

    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        if (Math.random() < 0.3) {
          this.createDustExplosion(body.position, 0.15); 
        }
        
        this.world.removeBody(body);
        this.ballsPool[i] = null;
      }
      
      this.dummyObj.scale.set(0, 0, 0); 
      this.dummyObj.updateMatrix();
      this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
    }
    
    this.updateBeadsBlinking(); 
    this.ballInstancedMesh.instanceMatrix.needsUpdate = true;
    this.activeBallsCount = 0;
    this.ballSpawnIndex = 0;
    
    this.uiManager.updateBeadCounter(this.activeBallsCount, CONFIG.PHYSICS.MAX_BALLS);
  }

  resetScene() {
    if (store && typeof store.get === 'function') {
      const currentState = store.get();
      if (typeof store.set === 'function') {
        store.set({ ...currentState, currentTool: -1, paintToolColor: -1 });
      } else if (typeof store.update === 'function') {
        store.update({ currentTool: -1, paintToolColor: -1 });
      }
      if (store.get().mode === 'space') {
        const btnZeroG = document.getElementById('btn-zerog');
        if (btnZeroG) btnZeroG.click();
      }
    }

    document.body.classList.remove('is-pressing');

    document.querySelectorAll('.mag-main-btn, .paint-btn, .palette-item').forEach(btn => {
      btn.classList.remove('active', 'active-state', 'is-selecting');
    });

    if (typeof isSlowMo === 'function' && isSlowMo()) {
      const btnSlow = document.getElementById('btn-slow'); 
      if (btnSlow) btnSlow.click(); 
    }

    if (this.fansActive) {
      const btnFans = document.getElementById('btn-fans');
      if (btnFans) {
        btnFans.click();
      } else {
        this.fansActive = false; 
      }
    }
    this.fanLevel = 0.0;
    if (this.uiManager && typeof this.uiManager.updateFanProgress === 'function') {
      this.uiManager.updateFanProgress(0);
    }

    this.startShrinkingBalls();

    this.letterObjects.forEach((obj, i) => {
      const body = obj.body;
      const palette = CONFIG.COLORS.GOOGLE_PALETTE;
      body.userData.googleColor = palette[i % palette.length];
    });

    if (!this.lettersEnabled) {
      this.lettersEnabled = true;
      if (this.uiManager && typeof this.uiManager.setLettersActive === 'function') {
        this.uiManager.setLettersActive(true);
      }
      this.letterObjects.forEach(obj => {
        if (obj.setVisible) obj.setVisible(true);
        else obj.mesh.visible = true; 
      });
      this.showLettersSmoothly();
    } else {
      this.returnLettersToStart();
    }
  }
  
  setupStateReactions() {
    let lastMode = store.get().mode;
    let lastTool = store.get().currentTool;

    store.subscribe((state) => {
      if (state.mode !== lastMode) {
          this.fansActive = false; this.fanLevel = 0.0;
          this.uiManager.updateFanProgress(0);
          lastMode = state.mode; 
      }
      this.sceneManager.setAtmosphere(state.mode, CONFIG.COLORS);
      if (!this.world.bodies.includes(this.platformBody)) this.world.addBody(this.platformBody);
      
      if (state.mode === 'disco') {
        for (const l of this.letterObjects) { l.mesh.material.emissiveIntensity = 0.02; l.mesh.material.roughness = 0.25; l.mesh.material.color.setHex(l.body.userData.googleColor); }
        this.setBallGlow(true); 
      } else {
        for (const l of this.letterObjects) { l.mesh.material.emissiveIntensity = 0.0; l.mesh.material.roughness = 0.5; l.mesh.material.color.setHex(l.body.userData.googleColor); }
        this.setBallGlow(false); 
      }

      if (state.currentTool !== lastTool) {
        const wasMagnet = lastTool !== -1;
        const isMagnet = state.currentTool !== -1;

        if (wasMagnet !== isMagnet) {
          this.uiManager.lockLetters(isMagnet);

          if (isMagnet) {
            if (this.lettersEnabled) {
              this.hideLettersSmoothly();
              this.lettersHiddenByMagnet = true;
            }
          } else {
            if (this.lettersHiddenByMagnet) {
              this.uiManager.setLettersActive(true); 
              this.showLettersSmoothly(); 
              this.lettersHiddenByMagnet = false;
            }
          }
          this.updateBeadsBlinking();
        }
        lastTool = state.currentTool;
      }
    });
  }

  
  initSceneObjects() {
    this.sceneManager.buildEnvironment();

    const platformShape = new CANNON.Cylinder(5, 6, 0.2, 16); 
    this.platformBody = new CANNON.Body({ mass: 0, material: this.matSlippery, collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE, collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY });
    this.platformBody.addShape(platformShape, new CANNON.Vec3(0,0,0), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(1,0,0), -Math.PI/2)); 
    this.platformBody.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.1, 0); this.platformBody.userData = { isRubber: true }; 
    this.world.addBody(this.platformBody);

    const createWall = (w, h, pos, rot) => {
      this.physicsManager.createStaticPlane(pos, rot, CONFIG.PHYSICS.GROUPS);
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide, roughness: 0.1, metalness: 0.1 });
      this.sceneManager.createWallMesh(w, h, pos, rot, material);
    };
    
    const h = CONFIG.WORLD.ROOM_SIZE; const w = CONFIG.WORLD.ROOM_SIZE; const thickness = 2.0; 
    const floorBody = new CANNON.Body({ mass: 0, material: this.matStandard, collisionFilterGroup: CONFIG.PHYSICS.GROUPS.SCENE, collisionFilterMask: CONFIG.PHYSICS.GROUPS.OBJECTS | CONFIG.PHYSICS.GROUPS.TINY }); 
    floorBody.addShape(new CANNON.Box(new CANNON.Vec3(w/2, thickness/2, h/2)), new CANNON.Vec3(0, -thickness/2, 0)); floorBody.position.set(0, CONFIG.WORLD.FLOOR_LEVEL, 0); this.world.addBody(floorBody);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide, roughness: 0.1, metalness: 0.1 });
    this.sceneManager.createWallMesh(w, h, new THREE.Vector3(0, CONFIG.WORLD.FLOOR_LEVEL, 0), new THREE.Vector3(-Math.PI / 2, 0, 0), floorMaterial);
    
    createWall(CONFIG.WORLD.ROOM_SIZE, CONFIG.WORLD.ROOM_SIZE, new THREE.Vector3(0, CONFIG.WORLD.CEILING_HEIGHT, 0), new THREE.Vector3(Math.PI/2, 0, 0)); 
    createWall(CONFIG.WORLD.ROOM_SIZE, 20, new THREE.Vector3(0, 2.5, -10), new THREE.Vector3(0, 0, 0)); 
    createWall(CONFIG.WORLD.ROOM_SIZE, 20, new THREE.Vector3(-15, 2.5, 0), new THREE.Vector3(0, Math.PI/2, 0)); 
    createWall(CONFIG.WORLD.ROOM_SIZE, 20, new THREE.Vector3(15, 2.5, 0), new THREE.Vector3(0, -Math.PI/2, 0)); 
    createWall(CONFIG.WORLD.ROOM_SIZE, 20, new THREE.Vector3(0, 2.5, 12), new THREE.Vector3(0, Math.PI, 0)); 

    const ballGeo = new THREE.SphereGeometry(CONFIG.PHYSICS.BALL_RADIUS, 16, 16); 
    this.ballShape = new CANNON.Sphere(CONFIG.PHYSICS.BALL_RADIUS);
    this.ballInstancedMesh = new THREE.InstancedMesh(ballGeo, this.ballMat, CONFIG.PHYSICS.MAX_BALLS);
    this.ballInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ballInstancedMesh.castShadow = true;
    this.ballInstancedMesh.receiveShadow = true;
    this.scene.add(this.ballInstancedMesh);
    
    this.dummyObj = new THREE.Object3D();
    this.dummyObj.scale.set(0, 0, 0); this.dummyObj.updateMatrix();
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
        this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
        this.ballInstancedMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
  }

  setBallGlow(enabled) {
      if (enabled) {
        this.ballMat.emissive.setHex(0x000000); this.ballMat.emissiveIntensity = 0.0;
        this.ballMat.metalness = 0.75; this.ballMat.roughness = 0.15; 
      } else {
        this.ballMat.emissive.setHex(0x000000); this.ballMat.emissiveIntensity = 0.0;
        this.ballMat.metalness = 0.3; this.ballMat.roughness = 0.15;
      }
      this.ballMat.needsUpdate = true;
      for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
        const body = this.ballsPool[i];
        if (body) {
          this.ballInstancedMesh.setColorAt(i, new THREE.Color(body.userData.originalColorHex));
        }
      }
      if (this.ballInstancedMesh.instanceColor) this.ballInstancedMesh.instanceColor.needsUpdate = true;
  }

  startShrinkingBalls() {
    if (this.activeBallsCount === 0) return;

    const shrinkDuration = 0.8; 
    const startTime = performance.now();

    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        body.userData.isShrinking = true;
        body.userData.shrinkStartTime = startTime;
        body.userData.shrinkDuration = shrinkDuration * 1000; 
        
        body.collisionFilterMask = 0;
      }
    }
    
    this.activeBallsCount = 0;
    this.ballSpawnIndex = 0;
    this.uiManager.updateBeadCounter(0, CONFIG.PHYSICS.MAX_BALLS);
    
    this.updateBeadsBlinking(); 
  }

  spawnBalls() {
    for (let i = 0; i < 40; i++) {
      const idx = this.ballSpawnIndex;
      const oldBody = this.ballsPool[idx];
      
      if (oldBody) { 
         this.createDustExplosion(oldBody.position, 0.2);
         this.world.removeBody(oldBody); 
      } else {
         this.activeBallsCount++;
      }
      
      const colorHex = CONFIG.COLORS.GOOGLE_UNIQUE[Math.floor(Math.random() * CONFIG.COLORS.GOOGLE_UNIQUE.length)];
      const x = (Math.random()-0.5)*20, y = 8+Math.random()*5, z = (Math.random()-0.5)*10;
      
      const body = new CANNON.Body({ mass: CONFIG.PHYSICS.BALL_MASS, material: this.matBouncy, angularDamping: 0.1, linearDamping: 0.01, collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS, collisionFilterMask: CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS });
      body.addShape(this.ballShape); body.position.set(x, y, z); this.world.addBody(body); 
      body.userData = { originalColorHex: colorHex, instanceId: idx };
      this.ballsPool[idx] = body;
      this.ballSpawnIndex = (this.ballSpawnIndex + 1) % CONFIG.PHYSICS.MAX_BALLS;
    } 
    
    this.setBallGlow(isNight()); 
    this.uiManager.updateBeadCounter(this.activeBallsCount, CONFIG.PHYSICS.MAX_BALLS);
    this.updateBeadsBlinking(); 
  }

  paintRoom(colorIndex) {
    const colors = CONFIG.COLORS.GOOGLE_UNIQUE; 
    const targetColor = colors[colorIndex]; 
    
    const camPos = this.camera.position;
    const sprayDir = new THREE.Vector3().subVectors(this.inputManager.interactionTarget, camPos).normalize();

    // 1. ОБРАБОТКА БУКВ (Высокая чувствительность, без физической отдачи)
    this.letterObjects.forEach(obj => {
      if (!this.lettersEnabled || obj.body.collisionFilterMask === 0) return;
      
      const v = new THREE.Vector3().subVectors(obj.body.position, camPos);
      const distAlongRay = v.dot(sprayDir); 

      if (distAlongRay > 0 && distAlongRay < 40) {
        const perpDist = v.clone().cross(sprayDir).length();
        
        // Увеличенный радиус захвата специально для букв (было ~0.5, стало 1.8)
        const letterSensitivity = 1.8 + distAlongRay * 0.12; 

        if (perpDist < letterSensitivity) {
          obj.body.userData.googleColor = targetColor;
          // Физический импульс (applyImpulse) удален, чтобы буквы оставались на месте
        }
      }
    });

    // 2. ОБРАБОТКА ШАРИКОВ (Старая логика: малый радиус и физический отброс)
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        const v = new THREE.Vector3().subVectors(body.position, camPos);
        const distAlongRay = v.dot(sprayDir);

        if (distAlongRay > 0 && distAlongRay < 40) {
          const perpDist = v.clone().cross(sprayDir).length();
          const ballRadius = 0.5 + distAlongRay * 0.075; 
          
          if (perpDist < ballRadius) {
            body.userData.originalColorHex = targetColor;
            this.ballInstancedMesh.setColorAt(i, new THREE.Color(targetColor));

            // Для шариков оставляем физику, чтобы они разлетались от струи
            const pushForce = 1.0 - (distAlongRay / 40.0);
            const spread = new THREE.Vector3(
                (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 0.6,
                (Math.random() - 0.5) * 0.6
            );
            const randomizedDir = sprayDir.clone().add(spread).normalize();
            const impulseVec = randomizedDir.multiplyScalar(pushForce * 0.0005);

            body.applyImpulse(
                new CANNON.Vec3(impulseVec.x, impulseVec.y, impulseVec.z),
                body.position
            );
          }
        }
      }
    }
    
    if (this.ballInstancedMesh.instanceColor) {
      this.ballInstancedMesh.instanceColor.needsUpdate = true;
    }

    if (Math.random() < 0.1) audioManager.playPuffSound(0.2);
  }

  changeWordSmoothly(newWord) {
    if (this.isChangingWord) return;

    if (this.currentWord === newWord) {
      this.returnLettersToStart();
      return;
    }

    this.isChangingWord = true;

    if (!this.lettersEnabled) {
      this.currentWord = newWord;
      this.spawnLetters(this.currentWord);
      this.letterObjects.forEach(obj => obj.setVisible(false));
      this.isChangingWord = false;
      return;
    }

    const now = performance.now();
    const duration = 300; 

    this.letterObjects.forEach(obj => {
      const body = obj.body;
      body.userData.isShrinkingWord = true;
      body.userData.shrinkStartTime = now;
      
      body.collisionFilterMask = 0; 
      body.type = CANNON.Body.KINEMATIC;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    });

    setTimeout(() => {
      this.letterObjects.forEach(obj => {
        this.createDustExplosion(obj.body.position, 0.35); 
      });

      this.currentWord = newWord;
      this.spawnLetters(this.currentWord);

      const growStartTime = performance.now();
      
      this.letterObjects.forEach(obj => {
        const body = obj.body;
        obj.mesh.scale.set(0, 0, 0); 
        
        body.userData.isGrowingWord = true;
        body.userData.growStartTime = growStartTime;
        
        body.collisionFilterMask = 0;
        body.type = CANNON.Body.KINEMATIC;
      });

      setTimeout(() => {
        this.letterObjects.forEach(obj => {
          const body = obj.body;
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

  spawnLetters(wordStr) {
      this.letterObjects.forEach(obj => obj.destroy());
      this.letterObjects.length = 0;

      if (!this.globalFont || !wordStr) return;
      
      const charSpacing = 2.8; 
      const totalWidth = wordStr.length * charSpacing; 
      const startXOffset = -totalWidth / 2 + (charSpacing / 2);

      for (let i = 0; i < wordStr.length; i++) {
          const color = CONFIG.COLORS.GOOGLE_PALETTE[i % CONFIG.COLORS.GOOGLE_PALETTE.length];
          const geo = new TextGeometry(wordStr[i], { font: this.globalFont, size: 2.5, height: 0.8, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.08, bevelSegments: 5 }); geo.center();
          const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, emissive: color, emissiveIntensity: 0.0 })); 
          mesh.castShadow = true; mesh.receiveShadow = true; 
          
          geo.computeBoundingBox(); const size = geo.boundingBox.getSize(new THREE.Vector3());
          const body = new CANNON.Body({ mass: CONFIG.PHYSICS.LETTER_MASS, material: this.matBouncy, angularDamping: 0.1, linearDamping: 0.01, collisionFilterGroup: CONFIG.PHYSICS.GROUPS.OBJECTS, collisionFilterMask: CONFIG.PHYSICS.GROUPS.SCENE | CONFIG.PHYSICS.GROUPS.OBJECTS });
          body.addShape(new CANNON.Box(new CANNON.Vec3(size.x/2, size.y/2, size.z/2))); 
          const startX = startXOffset + (i * charSpacing); 
          body.position.set(startX, 2, 0); 
          body.userData = { startPos: new CANNON.Vec3(startX, 2, 0), googleColor: color, halfHeight: size.y/2 }; 
          body.sleep();

          const letterObj = new GameObject(this.world, this.scene, mesh, body);

          body.addEventListener('collide', (e) => {
            if (!this.lettersEnabled) return; 
            const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v <= 1.35) return;
            const contactPos = new THREE.Vector3(e.contact.bi.position.x + e.contact.ri.x, e.contact.bi.position.y + e.contact.ri.y, e.contact.bi.position.z + e.contact.ri.z);
            if (e.body && e.body.mass === 0) {
                this.spawnMiniBeads(contactPos, body.userData.googleColor); 
                if (Math.abs(contactPos.x) < 5 && Math.abs(contactPos.z) < 5 && contactPos.y < CONFIG.WORLD.FLOOR_LEVEL + 1.0) { this.platformImpact = 1.0; } 
            } audioManager.playHitSound(v, isSlowMo());
          });
          
          this.letterObjects.push(letterObj);
      }
      if (isNight()) this.setBallGlow(true);
  }

  updateBeadsBlinking() {
    const isMagnet = store.get().currentTool !== -1;
    const hasNoBalls = this.activeBallsCount === 0;

    const btn = this.uiManager.elements.btnBalls;
    
    if (isMagnet && hasNoBalls) {
      if (!btn.classList.contains('needs-attention')) {
        btn.classList.add('needs-attention');
      }
    } else {
      btn.classList.remove('needs-attention');
    }
  }

  hideLettersSmoothly() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();
    
    this.letterObjects.forEach(obj => {
      const body = obj.body;
      body.userData.isShrinkingWord = true;
      body.userData.isGrowingWord = false; 
      body.userData.shrinkStartTime = now;
      
      body.collisionFilterMask = 0; 
      
      this.createDustExplosion(body.position, 0.25); 
    });
  }

  showLettersSmoothly() {
    if (this.letterObjects.length === 0) return;
    const now = performance.now();
    
    this.letterObjects.forEach(obj => {
      const body = obj.body;
      body.userData.isGrowingWord = true;
      body.userData.isShrinkingWord = false; 
      body.userData.growStartTime = now;
    });

    this.returnLettersToStart();
  }

  returnLettersToStart() {
    if (this.letterObjects.length === 0 || this.isPaused) return;
    
    const now = performance.now();
    
    this.letterObjects.forEach(obj => {
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

  spawnMiniBeads(pos, colorHex) {
    for (let i = 0; i < 12; i++) {
      this.miniBeadPool.spawn(pos, colorHex);
    }
  }

  createDustExplosion(pos, intensity01) {
    const basePos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    const cloudCount = 4 + Math.floor(4 * intensity01);
    for(let i = 0; i < cloudCount; i++) {
      const spawnPos = basePos.clone().add(new THREE.Vector3((Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5));
      const vel = new THREE.Vector3((Math.random()-0.5)*0.2, 0.1 + Math.random()*0.3, (Math.random()-0.5)*0.2);
      const scale = 1.0 + Math.random() * 1.5;
      const decay = 0.02 + Math.random() * 0.02;
      
      this.dustPool.spawn(spawnPos, vel, scale, 1.0, decay);
    }
  }

  createHeatAirPuff(x, z, env) {
    const spawnPos = new THREE.Vector3(x + (Math.random()-0.5)*0.8, CONFIG.WORLD.FLOOR_LEVEL + 0.18, z + (Math.random()-0.5)*0.8);
    const vel = new THREE.Vector3((Math.random()-0.5)*0.08, 0.55 + Math.random()*0.70, (Math.random()-0.5)*0.08);
    if (isSlowMo()) vel.multiplyScalar(0.75);
    const scale = 0.55 + Math.random() * 0.70;
    
    this.heatPool.spawn(spawnPos, vel, scale, 1.0 * env, 0.032);
  }
  
  tick(currentTime) {
    requestAnimationFrame(this.tick);
    
    if (!this.isPaused) {
      let dt = (currentTime - this.lastTime) / 1000; 
      this.lastTime = currentTime; 
      if (dt > 0.1) dt = 0.1; 
      
      this.physicsManager.step(dt, isSlowMo());
      const timeSec = currentTime / 1000; 

      this.inputManager.update(dt); 

      const state = this.updateEnvironment(dt, timeSec);
      this.updatePhysics(dt, timeSec, state.isMagnetEquipped, state.isMagnetPulling, state.activeColor);

      this.dustPool.update(isSlowMo());
      this.heatPool.update(isSlowMo());
      this.paintPools.forEach(pool => pool.update(isSlowMo())); 
      this.miniBeadPool.update(dt);
    } else {
      this.lastTime = currentTime; 
    }

    this.updateLetterAnimations(currentTime);
    this.updateBallInstances(currentTime);
    this.composer.render();
  }

  updateEnvironment(dt, timeSec) {
    this.platformImpact = THREE.MathUtils.lerp(this.platformImpact, 0, 0.05);
    const tool = store.get().currentTool;
    const isMagnetEquipped = tool !== -1;
    const isMagnetPulling = isMagnetEquipped && this.inputManager.isMouseDown && this.inputManager.hasInteractionTarget;
    const TOOL_COLORS = { 0: 0x34A853, 1: 0xFBBC05, 2: 0xEA4335, 3: 0x4285F4 };
    const activeColor = isMagnetEquipped ? TOOL_COLORS[tool] : null;

    this.sceneManager.updateAtmosphere(timeSec, store.get().mode, this.platformImpact, this.fanLevel, isMagnetEquipped, activeColor, isMagnetPulling);

    if (isMagnetEquipped && this.inputManager.hasInteractionTarget) {
      this.sceneManager.magnetReticle.position.copy(this.inputManager.interactionTarget);
      this.sceneManager.magnetReticle.position.addScaledVector(this.inputManager.interactionNormal, 0.05);
      const lookPos = this.sceneManager.magnetReticle.position.clone().add(this.inputManager.interactionNormal);
      this.sceneManager.magnetReticle.lookAt(lookPos);
    }

    if (this.fansActive) { 
      this.fanLevel += dt / 1.0; 
    } else { 
      this.fanLevel -= dt / (this.isResetting ? 0.8 : 2.0); 
    }
    this.fanLevel = Math.max(0, Math.min(1, this.fanLevel)); 
    this.uiManager.updateFanProgress(this.fanLevel);
    
    const env = -(Math.cos(Math.PI * this.fanLevel) - 1) / 2;
    if (env > 0) { 
      const tries = isSlowMo() ? 2 : 4; 
      for (let k = 0; k < tries; k++) { 
         const spawnChance = isNight() ? 0.2 : 0.85;
         if (Math.random() < spawnChance) this.createHeatAirPuff((Math.random()-0.5)*26, (Math.random()-0.5)*18, env); 
      } 
    }
    return { isMagnetEquipped, isMagnetPulling, activeColor };
  }

  updatePhysics(dt, timeSec, isMagnetEquipped, isMagnetPulling, activeColor) {
    const limit = 30; 
    
    for (const obj of this.letterObjects) {
      if (!obj.body) continue;
      
      const pos = obj.body.position;
      
      if (pos.y < -5 || pos.y > 40 || pos.x < -limit || pos.x > limit || pos.z < -limit || pos.z > limit) {
        
        obj.body.velocity.set(0, 0, 0);
        obj.body.angularVelocity.set(0, 0, 0);
        
        obj.body.position.set((Math.random() - 0.5) * 5, 10, (Math.random() - 0.5) * 5);
        
        if (this.inputManager && this.inputManager.isDragging && 
            this.inputManager.dragConstraint && 
            this.inputManager.dragConstraint.bodyA === obj.body) {
            this.inputManager.cancelDrag();
        }
      }
    }

    this.physicsManager.applyEnvironmentForces(
        this.lettersEnabled ? this.letterObjects.map(obj => obj.body) : [], 
        this.ballsPool, 
        this.fanLevel, 
        timeSec,
        isMagnetEquipped 
    );

    const interactionTarget = this.inputManager.interactionTarget;
    const hasInteractionTarget = this.inputManager.hasInteractionTarget;
    const isPaintingStreamActive = this.inputManager.isPaintingStreamActive;
    const interactionNormal = this.inputManager.interactionNormal
    const sprayColorIdx = store.get().paintToolColor !== undefined ? store.get().paintToolColor : -1;


   // === В файле main.js (внутри updatePhysics) ===

  // === В файле main.js (внутри updatePhysics) ===

    if (isPaintingStreamActive && hasInteractionTarget && sprayColorIdx !== -1) {
        // Физическое перекрашивание объектов
        if (Math.random() < 0.4) {
            this.paintRoom(sprayColorIdx);
        }

        // Генерация визуального облака аэрозоли
        const camPos = this.camera.position;
        const sprayDir = new THREE.Vector3().subVectors(interactionTarget, camPos).normalize();
        
        // Точка спавна чуть впереди игрока
        const spawnPos = camPos.clone().addScaledVector(sprayDir, 1.2);
        const intensity = isSlowMo() ? 1 : 3;

        for (let i = 0; i < intensity; i++) {
            // Формируем конус распыления
            const spread = new THREE.Vector3(
                (Math.random() - 0.5) * 0.15,
                (Math.random() - 0.5) * 0.15,
                (Math.random() - 0.5) * 0.15
            );
            
            const randomizedDir = sprayDir.clone().add(spread).normalize();
            
            // Разная скорость и размер для "рваного" эффекта дыма
            const vel = randomizedDir.multiplyScalar(0.7 + Math.random() * 0.6);
            const scale = 0.6 + Math.random() * 1.4;

            this.paintPools[sprayColorIdx].spawn(spawnPos, vel, scale, 1.0, 0.03);
        }
    } else {
        this.paintParticleTime = 0;
    }

    if (isMagnetPulling) {
      const magCenter = interactionTarget.clone();
      magCenter.addScaledVector(interactionNormal, 0.4);
      const normalVec = new CANNON.Vec3(interactionNormal.x, interactionNormal.y, interactionNormal.z);

      const applyMagnetForce = (body, colorHex) => {
        if (!body || colorHex !== activeColor) return; 
        body.wakeUp(); 
        
        const toBall = new CANNON.Vec3(body.position.x - magCenter.x, body.position.y - magCenter.y, body.position.z - magCenter.z);
        const dist = toBall.length();
        
        if (dist < 40.0) { 
          const distFromPlane = toBall.dot(normalVec);
          const radialVec = new CANNON.Vec3(
            toBall.x - normalVec.x * distFromPlane, 
            toBall.y - normalVec.y * distFromPlane, 
            toBall.z - normalVec.z * distFromPlane
          );
          
          const radiusDist = radialVec.length();
          const flattenForce = -distFromPlane * 15.0; 
          
          body.velocity.x += normalVec.x * flattenForce * dt;
          body.velocity.y += normalVec.y * flattenForce * dt;
          body.velocity.z += normalVec.z * flattenForce * dt;

          if (radiusDist > 0.01) {
            radialVec.normalize();
            const orbitRadius = 0.8; 
            const maxPullDist = Math.min(Math.abs(orbitRadius - radiusDist), 5.0);
            const pullDirection = (orbitRadius - radiusDist) > 0 ? 1 : -1; 
            let radialPull = pullDirection * maxPullDist * 12.0; 

            if (radiusDist < orbitRadius * 0.6) {
                radialPull *= 2.0; 
            }

            body.velocity.x += radialVec.x * radialPull * dt;
            body.velocity.y += radialVec.y * radialPull * dt;
            body.velocity.z += radialVec.z * radialPull * dt;

            const tangent = normalVec.cross(radialVec);
            const orbitSpeed = 45.0; 
            body.velocity.x += tangent.x * orbitSpeed * dt;
            body.velocity.y += tangent.y * orbitSpeed * dt;
            body.velocity.z += tangent.z * orbitSpeed * dt;
          } else {
             let kick = normalVec.cross(new CANNON.Vec3(0, 1, 0));
             if (kick.lengthSquared() < 0.01) kick.set(1, 0, 0);
             kick.normalize();
             body.velocity.x += kick.x * 15.0 * dt;
             body.velocity.y += kick.y * 15.0 * dt;
             body.velocity.z += kick.z * 15.0 * dt;
          }

          const currentSpeed = body.velocity.length();
          const MAX_SPEED = 25.0; 
          if (currentSpeed > MAX_SPEED) {
              body.velocity.scale(MAX_SPEED / currentSpeed, body.velocity);
          }

          body.velocity.scale(0.93, body.velocity); 
        }
      };
      
      this.ballsPool.forEach(b => { if(b) applyMagnetForce(b, b.userData.originalColorHex); });
    }
  }

  updateLetterAnimations(currentTime) {
    const targetColor = new THREE.Color();

    this.letterObjects.forEach(obj => {
      const body = obj.body;
      
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

      } else if (body.userData.isGrowingWord) {
        const progress = Math.min((currentTime - body.userData.growStartTime) / 300, 1.0);
        const scale = THREE.MathUtils.smoothstep(progress, 0, 1);
        obj.mesh.scale.set(scale, scale, scale);
      }

      if (body.userData.googleColor !== undefined) {
        targetColor.setHex(body.userData.googleColor);
        obj.mesh.material.color.lerp(targetColor, 0.05);
        if (obj.mesh.material.emissive) obj.mesh.material.emissive.lerp(targetColor, 0.05);
      }

      if (body.userData.isReturning) {
        const elapsed = currentTime - body.userData.returnStartTime;
        let progress = Math.min(elapsed / 800, 1.0);
        const ease = 1 - Math.pow(1 - progress, 3);

        body.position.x = THREE.MathUtils.lerp(body.userData.returnStartPos.x, body.userData.startPos.x, ease);
        body.position.y = THREE.MathUtils.lerp(body.userData.returnStartPos.y, body.userData.startPos.y, ease);
        body.position.z = THREE.MathUtils.lerp(body.userData.returnStartPos.z, body.userData.startPos.z, ease);

        const qStart = new THREE.Quaternion(body.userData.returnStartQuat.x, body.userData.returnStartQuat.y, body.userData.returnStartQuat.z, body.userData.returnStartQuat.w);
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
      obj.update(); 
    });
  }

  updateBallInstances(currentTime) {
    for (let i = 0; i < CONFIG.PHYSICS.MAX_BALLS; i++) {
      const body = this.ballsPool[i];
      if (body) {
        let scale = 1.0;
        if (body.userData.isShrinking) {
          const elapsed = currentTime - body.userData.shrinkStartTime;
          const progress = Math.min(elapsed / body.userData.shrinkDuration, 1.0);
          scale = 1.0 - THREE.MathUtils.smoothstep(progress, 0, 1);
          if (progress >= 1.0) {
            this.world.removeBody(body);
            this.ballsPool[i] = null;
            scale = 0; 
          }
        }
        this.dummyObj.position.copy(body.position);
        this.dummyObj.quaternion.copy(body.quaternion);
        this.dummyObj.scale.set(scale, scale, scale);
        this.dummyObj.updateMatrix();
        this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      } else {
        this.dummyObj.scale.set(0, 0, 0);
        this.dummyObj.updateMatrix();
        this.ballInstancedMesh.setMatrixAt(i, this.dummyObj.matrix);
      }
    }
    this.ballInstancedMesh.instanceMatrix.needsUpdate = true;
  }
}

window.addEventListener('mousedown', (e) => {
  if (document.activeElement.tagName === 'INPUT') {
    document.activeElement.blur();
  }

  if (e.target.tagName === 'CANVAS') {
    document.body.classList.add('is-pressing');
  }
});

const app = new GoogleRoomApp();