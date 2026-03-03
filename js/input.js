import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from './config.js';

export class InputManager {
  constructor(camera, world, getPausedState, getCurrentTool, getInteractables, onDragChange, getRoomMeshes, getPaintTool) {
    this.getPaintTool = getPaintTool;
    this.getRoomMeshes = getRoomMeshes; 
    
    this.camera = camera;
    this.world = world;
    this.getPausedState = getPausedState; 
    this.getCurrentTool = getCurrentTool;
    this.getInteractables = getInteractables; 
    this.onDragChange = onDragChange; 

    this.raycaster = new THREE.Raycaster();
    this.inputCoord = new THREE.Vector2();
    this.isDragging = false;
    this.isMouseDown = false;
    this.dragConstraint = null;

    this.mouseBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 0 });
    this.world.addBody(this.mouseBody);
    
    this.movementPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.WORLD.FLOOR_LEVEL);
    
    this.interactionTarget = new THREE.Vector3();
    this.interactionNormal = new THREE.Vector3(0, 1, 0);
    this.hasInteractionTarget = false;
    this.isPaintingStreamActive = false; 
    this.currentDragOffset = 0;

    this.initEvents();
  }

  setInputCoords(e) {
    this.inputCoord.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.inputCoord.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  updateInteractionTarget() {
    this.raycaster.setFromCamera(this.inputCoord, this.camera);
    const meshes = this.getRoomMeshes();
    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      this.interactionTarget.copy(intersects[0].point);
      this.hasInteractionTarget = true;
      
      const n = intersects[0].face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[0].object.matrixWorld);
      this.interactionNormal.copy(n.applyMatrix3(normalMatrix).normalize());
    } else {
      this.hasInteractionTarget = false;
    }
  }

  update(dt) {
      if (!this.getPausedState() && this.isPaintingStreamActive) {
            this.updateInteractionTarget(); 
      }
  }

  initEvents() {
    window.addEventListener('mousedown', (e) => {
      if (this.getPausedState()) return; 
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('#holo-wrapper') || e.target.closest('#hud-controls')) return;
      
      this.setInputCoords(e);
      this.isMouseDown = true;

      const paintColorIdx = this.getPaintTool ? this.getPaintTool() : -1;
      if (paintColorIdx !== -1) {
          this.isPaintingStreamActive = true;
          this.updateInteractionTarget();
          return;
      }

      if (this.getCurrentTool() !== -1) {
        this.updateInteractionTarget();
        return; 
      }
      
      this.raycaster.setFromCamera(this.inputCoord, this.camera);
      const { meshes, getBodyByMesh } = this.getInteractables();
      const intersects = this.raycaster.intersectObjects(meshes);
      
      if (intersects.length > 0) {
        let hitBody = null; let halfHeight = 0.2;
        for (const hitObj of intersects) {
          const result = getBodyByMesh(hitObj);
          if (result) { hitBody = result.body; halfHeight = result.halfHeight; break; }
        }

        if (hitBody) {
          this.isDragging = true;
          this.onDragChange(true); 
          hitBody.wakeUp();
          this.currentDragOffset = halfHeight;
          this.movementPlane.constant = -hitBody.position.z;
          this.mouseBody.position.copy(hitBody.position);
          this.dragConstraint = new CANNON.PointToPointConstraint(hitBody, new CANNON.Vec3(0,0,0), this.mouseBody, new CANNON.Vec3(0,0,0));
          this.world.addConstraint(this.dragConstraint);
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.setInputCoords(e);
      
      if (this.isMouseDown && this.getCurrentTool() !== -1) {
        this.updateInteractionTarget();
      }

      if (this.isDragging && this.dragConstraint) {
        this.raycaster.setFromCamera(this.inputCoord, this.camera);
        const targetVec = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.movementPlane, targetVec);
        if (targetVec) {
          targetVec.x = Math.max(-14, Math.min(14, targetVec.x));
          targetVec.y = Math.max(CONFIG.WORLD.FLOOR_LEVEL + this.currentDragOffset + 0.1, Math.min(9, targetVec.y));
          targetVec.z = Math.max(-10, Math.min(10, targetVec.z));
          this.mouseBody.position.set(targetVec.x, targetVec.y, targetVec.z);
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPaintingStreamActive = false;
      this.isMouseDown = false;
      if (this.dragConstraint) {
        const body = this.dragConstraint.bodyA;
        if (body) {
          body.velocity.scale(1.8, body.velocity);
          body.angularVelocity.scale(1.5, body.angularVelocity);
        }
        this.world.removeConstraint(this.dragConstraint);
        this.dragConstraint = null;
      }
      if (this.isDragging) {
          this.isDragging = false;
          this.onDragChange(false); 
      }
    });
  }

  cancelDrag() {
    this.isPaintingStreamActive = false;
    this.isMouseDown = false;
    if (this.dragConstraint) {
      this.world.removeConstraint(this.dragConstraint);
      this.dragConstraint = null;
    }
    this.isDragging = false;
    this.onDragChange(false);
  }
}