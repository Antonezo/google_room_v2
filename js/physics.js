import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

export class PhysicsManager {
  constructor() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, CONFIG.WORLD.GRAVITY, 0) });
    this.matStandard = new CANNON.Material('standard');
    this.matBouncy = new CANNON.Material('bouncy');
    this.matSlippery = new CANNON.Material('slippery');
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matStandard, this.matBouncy, { friction: 0.3, restitution: 0.9 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matBouncy, this.matBouncy, { friction: 0.1, restitution: 0.9 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.matSlippery, this.matBouncy, { friction: 0.0, restitution: 0.5 }));
  }

  createStaticPlane(pos, rot, configGroups) {
    const body = new CANNON.Body({ 
      mass: 0, 
      material: this.matStandard, 
      collisionFilterGroup: configGroups.SCENE, 
      collisionFilterMask: configGroups.OBJECTS | configGroups.TINY 
    });
    body.addShape(new CANNON.Plane());
    body.position.copy(pos);
    if (rot) body.quaternion.setFromEuler(rot.x, rot.y, rot.z);
    this.world.addBody(body);
    return body;
  }
  
  step(dt, isSlowMo) {
    const timeScale = isSlowMo ? 0.2 : 1.0; 
    const scaledDt = dt * timeScale; 
    const fixedTimeStep = (1 / 60) * timeScale; 
    this.world.step(fixedTimeStep, scaledDt, 20);
  }

  applyEnvironmentForces(letterBodies, balls, fanLevel, timeSec, isMagnetEquipped) {
    const env = -(Math.cos(Math.PI * fanLevel) - 1) / 2;
    const repWeaken = fanLevel > 0 ? 0.25 : 1.0;

    const applyLogic = (body, useMagnet) => {
      if (!body || body.position.y > CONFIG.WORLD.FLOOR_LEVEL + 3.0) return;
      const distSq = body.position.x * body.position.x + body.position.z * body.position.z; 
      
      if (useMagnet && distSq < CONFIG.PHYSICS.REPULSOR.MAGNET_OUTER_RADIUS_SQ && distSq > CONFIG.PHYSICS.REPULSOR.MAGNET_INNER_RADIUS_SQ) { 
        body.wakeUp(); 
        const pull = CONFIG.PHYSICS.REPULSOR.MAGNET_PULL_FORCE * repWeaken; 
        body.velocity.x -= body.position.x * pull; 
        body.velocity.z -= body.position.z * pull; 
      }
      
      if (!isMagnetEquipped && distSq <= CONFIG.PHYSICS.REPULSOR.CORE_RADIUS_SQ && body.position.y < CONFIG.WORLD.FLOOR_LEVEL + 2.5) { 
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
      if (!body || body.mass <= 0 || env <= 0 || body.position.y > CONFIG.WORLD.FLOOR_LEVEL + 14.0) return;
      body.wakeUp(); 
      const targetY = CONFIG.WORLD.FLOOR_LEVEL + 8.0; 
      const bob = 0.55 * env * Math.sin(timeSec * 2.3 + body.id * 0.17); 
      const desiredAccY = (6.6 + 4.5 * ((targetY + bob) - body.position.y) - 1.35 * body.velocity.y) * env; 
      const drift = 0.75 * env;
      body.applyForce(new CANNON.Vec3(body.mass * Math.sin(timeSec * 1.35 + body.id * 0.11) * drift, body.mass * desiredAccY, body.mass * Math.cos(timeSec * 1.15 + body.id * 0.09) * drift), body.position); 
      body.angularVelocity.x *= 0.92; body.angularVelocity.y *= 0.92; body.angularVelocity.z *= 0.92;
    };

    for (const body of letterBodies) { applyLogic(body, true); if (env > 0) applyUpdraft(body); }
    for (const body of balls) { if (!body) continue; applyLogic(body, false); if (env > 0) applyUpdraft(body); }
  }
}