import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from './config.js';

// --- ГЕНЕРАЦИЯ ТЕКСТУР ---
export const tileTex = (() => {
  const size = 512; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d');
  ctx.fillStyle='#f0f0f0'; ctx.fillRect(0,0,size,size); ctx.strokeStyle='#d0d0d0'; ctx.lineWidth=2; const st=size/8; ctx.beginPath(); 
  for(let i=0;i<=8;i++){ctx.moveTo(i*st,0);ctx.lineTo(i*st,size);ctx.moveTo(0,i*st);ctx.lineTo(size,i*st);} ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; return tex;
})();

export const heatTex = (() => { 
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d'); 
  const g = ctx.createRadialGradient(128,128,0, 128,128,120); g.addColorStop(0.0, 'rgba(255,220,170,0.65)'); 
  g.addColorStop(0.35,'rgba(255,180,120,0.22)'); g.addColorStop(1.0, 'rgba(255,160,90,0)'); 
  ctx.fillStyle = g; ctx.fillRect(0,0,256,256); return new THREE.CanvasTexture(c); 
})();

export const ventGridTex = (() => { 
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const ctx = c.getContext('2d'); 
  ctx.clearRect(0,0,1024,1024); ctx.fillStyle = 'rgba(255, 170, 120, 0.05)'; ctx.fillRect(0,0,1024,1024); 
  ctx.strokeStyle = 'rgba(255, 195, 150, 0.35)'; ctx.lineWidth = 5; const step = 64; 
  for (let x=0; x<=1024; x+=step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke(); } 
  for (let y=0; y<=1024; y+=step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke(); } 
  const g = ctx.createRadialGradient(512,512,280, 512,512,720); g.addColorStop(0,'rgba(255, 190, 140, 0.0)'); 
  g.addColorStop(1,'rgba(255, 140, 90, 0.18)'); ctx.fillStyle = g; ctx.fillRect(0,0,1024,1024); 
  const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1,1); return tex; 
})();

// --- КЛАСС SCENE MANAGER ---
export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 2, 28);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    document.body.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.6, 0.15);
    this.composer.addPass(this.bloomPass);

    this.walls = []; 
    this.discoSpots = [];
    this._initResizeHandler();
  }

  _initResizeHandler() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.setSize(window.innerWidth, window.innerHeight);
    });
  }

  buildEnvironment() {
    this.dayLights = new THREE.Group(); this.scene.add(this.dayLights); 
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8); this.dayLights.add(this.ambientLight); 
    this.leftLight = new THREE.DirectionalLight(0x9bb7ff, 0.0); this.leftLight.position.set(-10, 6, 8); this.dayLights.add(this.leftLight); 
    this.fillLight = new THREE.DirectionalLight(0xffe2c2, 0.0); this.fillLight.position.set(10, 6, 8); this.dayLights.add(this.fillLight);
    
    this.nightLights = new THREE.Group(); this.scene.add(this.nightLights); 
    const ledGeo = new THREE.BoxGeometry(0.2, 0.05, 0.2); 
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.5, roughness: 0.9, metalness: 0.1 }); 
    const ledStrip = new THREE.InstancedMesh(ledGeo, ledMat, (80 * 2) + 120); ledStrip.instanceMatrix.setUsage(THREE.StaticDrawUsage); 
    const dummy = new THREE.Object3D(); let idx = 0;
    const placeLedLine = (startX, startZ, endX, endZ, count) => { for (let i = 0; i < count; i++) { const t = i / (count - 1); dummy.position.set(startX + (endX - startX) * t, CONFIG.WORLD.FLOOR_LEVEL + 0.03, startZ + (endZ - startZ) * t); dummy.rotation.set(0,0,0); dummy.updateMatrix(); ledStrip.setMatrixAt(idx++, dummy.matrix); } }
    placeLedLine(-14.7, -10.0, -14.7, 12.0, 80); placeLedLine(14.7, -10.0, 14.7, 12.0, 80); placeLedLine(-14.7, -10.0, 14.7, -10.0, 120); 
    this.nightLights.add(ledStrip); this.nightLights.visible = false;

    this.labLampsGroup = new THREE.Group(); this.scene.add(this.labLampsGroup);
    this.discoLampsGroup = new THREE.Group(); this.scene.add(this.discoLampsGroup); this.discoLampsGroup.visible = false;

    const createOfficeLamp = (x) => {
      const group = new THREE.Group(); group.position.set(x, CONFIG.WORLD.CEILING_HEIGHT - 0.05, 0); 
      const housing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 6.8), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.1 })); group.add(housing);
      const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 6.4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.1 })); diffuser.rotation.x = Math.PI / 2; diffuser.position.y = -0.026; group.add(diffuser); 
      const rectLight = new THREE.RectAreaLight(0xffffff, 6.0, 2.0, 6.4); rectLight.position.set(0, -0.05, 0); rectLight.lookAt(0, -10, 0); group.add(rectLight);
      const shadowLight = new THREE.SpotLight(0xffffff, 40); shadowLight.position.set(0, -0.05, 0); shadowLight.angle = Math.PI / 2.5; shadowLight.penumbra = 1.0; shadowLight.castShadow = true; shadowLight.shadow.bias = -0.0001; shadowLight.shadow.mapSize.set(1024, 1024);
      group.add(shadowLight); group.add(shadowLight.target); shadowLight.target.position.set(0, -10, 0);
      this.labLampsGroup.add(group);
    };
    createOfficeLamp(-5); createOfficeLamp(5);

    const createDiscoSpot = (x, z, colorHex) => {
      const spotLight = new THREE.SpotLight(colorHex, 500); spotLight.position.set(x, CONFIG.WORLD.CEILING_HEIGHT - 0.5, z);
      spotLight.angle = Math.PI / 12; spotLight.penumbra = 0.5; spotLight.castShadow = true; spotLight.shadow.bias = -0.0001; spotLight.target.position.set(0, CONFIG.WORLD.FLOOR_LEVEL, 0);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })); housing.position.copy(spotLight.position); housing.lookAt(spotLight.target.position); housing.rotateX(Math.PI / 2);
      this.discoLampsGroup.add(spotLight); this.discoLampsGroup.add(spotLight.target); this.discoLampsGroup.add(housing);
      this.discoSpots.push({ light: spotLight, housing: housing });
    };
    createDiscoSpot(-13, -8, 0xff00ff); createDiscoSpot(13, -8, 0x00ffff); createDiscoSpot(-13, 10, 0xffff00); createDiscoSpot(13, 10, 0x00ff00);   

    this.labProps = new THREE.Group(); this.scene.add(this.labProps);
    this.baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 0.5, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.0, roughness: 0.02, transparent: true, opacity: 0.25, transmission: 1.0, ior: 1.52, reflectivity: 0.5, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false }));
    this.baseMesh.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.3, 0); this.baseMesh.receiveShadow = true; this.baseMesh.renderOrder = 1; this.labProps.add(this.baseMesh);
    const ringGeo = new THREE.TorusGeometry(4.5, 0.1, 32, 100);
    const ringMat = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, emissive: 0x0055ff, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 1.0 });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.66, 0); this.ringMesh.rotation.x = Math.PI / 2; this.ringMesh.renderOrder = 2;
    this.labProps.add(this.ringMesh);

    this.floorLight = new THREE.PointLight(0x0088ff, 12, 8); this.floorLight.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 1.5, 0); this.labProps.add(this.floorLight);
    this.holoLight = new THREE.PointLight(0x0088ff, 20, 15); this.holoLight.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 1, 0); this.labProps.add(this.holoLight);

    this.ventOverlay = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.WORLD.ROOM_SIZE, CONFIG.WORLD.ROOM_SIZE), new THREE.MeshStandardMaterial({ map: ventGridTex, transparent: true, opacity: 0.0, color: 0xffffff, roughness: 0.2, metalness: 0.0, emissive: new THREE.Color(0xFFB074), emissiveIntensity: 0.0, depthWrite: false })); 
    this.ventOverlay.rotation.x = -Math.PI / 2; this.ventOverlay.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.012, 0); this.ventOverlay.renderOrder = 999; this.scene.add(this.ventOverlay);
  
    const reticleGeo = new THREE.PlaneGeometry(3.0, 3.0);
    const reticleTex = new THREE.TextureLoader().load(getComputedStyle(document.documentElement).getPropertyValue('--tex-reticle').slice(5, -2));
    const reticleMat = new THREE.MeshBasicMaterial({ map: reticleTex, transparent: true, opacity: 0.8, color: 0x00f3ff, depthWrite: false, blending: THREE.AdditiveBlending });
    this.magnetReticle = new THREE.Mesh(reticleGeo, reticleMat);
    this.magnetReticle.position.set(0, CONFIG.WORLD.FLOOR_LEVEL + 0.05, 0);
    this.magnetReticle.visible = false; this.scene.add(this.magnetReticle);
  }

  createWallMesh(width, height, pos, rot, material) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.copy(pos);
    if (rot) mesh.rotation.set(rot.x, rot.y, rot.z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.walls.push({ mesh, isFloor: pos.y === CONFIG.WORLD.FLOOR_LEVEL, isBack: rot && rot.x === 0 && rot.y === 0 });
    return mesh;
  }

  setAtmosphere(mode, configColors) {
    this.labProps.visible = true;
    for (const w of this.walls) { w.mesh.material.map = tileTex; w.mesh.material.color.setHex(0xffffff); w.mesh.material.roughness = 0.1; w.mesh.material.metalness = 0.1; w.mesh.material.needsUpdate = true; }
    
    if (mode === 'disco') {
      this.scene.background = new THREE.Color(configColors.BG_DISCO); 
      this.scene.fog = new THREE.Fog(configColors.BG_DISCO, 40, 120); 
      this.ambientLight.intensity = 0.4; 
      this.holoLight.intensity = 8; this.ringMesh.material.emissiveIntensity = 0.8; this.floorLight.intensity = 4;
      this.leftLight.intensity = 0.2; this.fillLight.intensity = 0.2; 
      this.labLampsGroup.visible = false; this.discoLampsGroup.visible = true; this.nightLights.visible = true; 
      for (const w of this.walls) w.mesh.material.color.setHex(0x666aa6);
      this.renderer.toneMappingExposure = 1.1; this.bloomPass.strength = 0.7; this.bloomPass.threshold = 0.1; this.bloomPass.radius = 0.5;
    } else {
      this.scene.background = new THREE.Color(configColors.BG_DAY); 
      this.scene.fog = new THREE.Fog(configColors.BG_DAY, 50, 150); 
      this.ambientLight.intensity = 0.8; 
      this.ringMesh.material.color.setHex(0x0088ff); this.ringMesh.material.emissive.setHex(0x0055ff); this.floorLight.color.setHex(0x0088ff); this.holoLight.color.setHex(0x0088ff); this.baseMesh.material.color.setHex(0xffffff); this.holoLight.intensity = 20; this.ringMesh.material.emissiveIntensity = 1.2; this.floorLight.intensity = 10;
      this.leftLight.intensity = 0.0; this.fillLight.intensity = 0.0; 
      this.labLampsGroup.visible = true; this.discoLampsGroup.visible = false; this.nightLights.visible = false; 
      for (const w of this.walls) w.mesh.material.color.setHex(0xffffff);
      this.renderer.toneMappingExposure = 0.8; this.bloomPass.strength = 0.3; this.bloomPass.threshold = 0.9; this.bloomPass.radius = 0.2;
    }
  }

  updateAtmosphere(timeSec, mode, platformImpact, fanLevel, isMagnetEquipped, activeToolColor) {
    const isNight = mode === 'disco';
    if (this.currentRingIntensity === undefined) this.currentRingIntensity = 1.2;
    const targetRingIntensity = isMagnetEquipped ? 0.0 : (isNight ? 0.8 : 1.2);
    this.currentRingIntensity = THREE.MathUtils.lerp(this.currentRingIntensity, targetRingIntensity, 0.05);

    const maxIntensity = isNight ? 0.8 : 1.2;
    const ratio = Math.max(0, Math.min(this.currentRingIntensity / maxIntensity, 1.0));
    this.ringMesh.material.emissiveIntensity = this.currentRingIntensity;
    this.ringMesh.material.opacity = THREE.MathUtils.lerp(0.15, 1.0, ratio);

    if (isNight) {
      const hue = (timeSec * 0.2) % 1;
      this.ringMesh.material.emissive.setHSL(hue, 0.7, 0.5);
      const rgbColor = new THREE.Color().setHSL(hue, 0.7, 0.5);
      const glassColor = new THREE.Color().setHSL(hue, 0.2, 0.95);
      this.floorLight.color.copy(rgbColor);
      this.holoLight.color.copy(rgbColor);
      this.baseMesh.material.color.copy(glassColor);
      this.discoSpots.forEach((spot, index) => {
        const speed = 1.5; const time = timeSec * speed + (index * 2.0);
        const targetX = Math.sin(time) * 10; const targetZ = Math.cos(time * 0.73) * 8;
        spot.light.target.position.set(targetX, CONFIG.WORLD.FLOOR_LEVEL, targetZ);
        spot.light.target.updateMatrixWorld();
        spot.housing.lookAt(spot.light.target.position);
        spot.housing.rotateX(Math.PI / 2);
      });
    } else {
      this.ringMesh.material.emissive.setHex(0x0055ff);
    }

    if (isMagnetEquipped) {
      this.magnetReticle.visible = true;
      if (activeToolColor) this.magnetReticle.material.color.setHex(activeToolColor);
      const pulse = 0.8 + 0.2 * Math.sin(timeSec * 8);
      this.magnetReticle.scale.set(pulse, pulse, 1);
      this.magnetReticle.material.opacity = pulse * 0.8;
    } else {
      this.magnetReticle.visible = false;
    }

    const dimFactor = 1.0 - (platformImpact * 0.85);
    this.floorLight.intensity = (isNight ? 3 : 10) * dimFactor;
    this.holoLight.intensity = (isNight ? 6 : 20) * dimFactor;
    
    const env = -(Math.cos(Math.PI * fanLevel) - 1) / 2;
    const nightGlowFactor = isNight ? 0.5 : 1.0;
    this.ventOverlay.material.opacity = 0.70 * env * (0.92 + 0.08 * Math.sin(timeSec * 6.5)) * nightGlowFactor;
    this.ventOverlay.material.emissiveIntensity = 2.1 * env * nightGlowFactor;
  }

  render() {
    this.composer.render();
  }
}