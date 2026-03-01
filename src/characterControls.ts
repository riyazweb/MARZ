import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { A, D, DIRECTIONS, S, W } from './utils'


export class CharacterControls {

    model: THREE.Group
    mixer: THREE.AnimationMixer
    animationsMap: Map<string, THREE.AnimationAction> = new Map() // Walk, Run, Idle
    orbitControl: OrbitControls
    camera: THREE.Camera

    // state
    toggleRun: boolean = false
    currentAction: string
    groundHeight: number = 0
    
    // temporary data
    walkDirection = new THREE.Vector3()
    rotateAngle = new THREE.Vector3(0, 1, 0)
    rotateQuarternion: THREE.Quaternion = new THREE.Quaternion()
    cameraTarget = new THREE.Vector3()
    
    // constants
    fadeDuration: number = 0.2
    runVelocity = 5
    walkVelocity = 2

    constructor(model: THREE.Group,
        mixer: THREE.AnimationMixer, animationsMap: Map<string, THREE.AnimationAction>,
        orbitControl: OrbitControls, camera: THREE.Camera,
        currentAction: string, groundHeight: number = 0) {
        this.model = model
        this.mixer = mixer
        this.animationsMap = animationsMap
        this.currentAction = currentAction
        this.groundHeight = groundHeight
        this.animationsMap.forEach((value, key) => {
            if (key == currentAction) {
                value.play()
            }
        })
        this.orbitControl = orbitControl
        this.camera = camera
        this.updateCameraTarget(0,0)
    }

    public switchRunToggle() {
        this.toggleRun = !this.toggleRun
    }

    public update(delta: number, keysPressed: any, colliders: THREE.Box3[] = []) {
        const directionPressed = DIRECTIONS.some(key => keysPressed[key] == true)

        var play = '';
        if (directionPressed && this.toggleRun) {
            play = 'Mixamo Running'
        } else if (directionPressed) {
            play = 'Mixamo Walk'
        } else {
            play = 'Mixamo Idle'
        }

        // Force ground height every frame
        this.model.position.y = this.groundHeight

        if (this.currentAction != play) {
            const toPlay = this.animationsMap.get(play)
            const current = this.animationsMap.get(this.currentAction)

            if (current) {
                current.fadeOut(this.fadeDuration)
            }
            if (toPlay) {
                toPlay.reset().fadeIn(this.fadeDuration).play();
            }

            this.currentAction = play
        }

        this.mixer.update(delta)

        if (this.currentAction == 'Mixamo Running' || this.currentAction == 'Mixamo Walk') {
            // calculate towards camera direction
            var angleYCameraDirection = Math.atan2(
                    (this.camera.position.x - this.model.position.x), 
                    (this.camera.position.z - this.model.position.z))
            // diagonal movement angle offset
            var directionOffset = this.directionOffset(keysPressed)

            // rotate model (+Math.PI because this model's forward axis faces +Z, not -Z)
            this.rotateQuarternion.setFromAxisAngle(this.rotateAngle, angleYCameraDirection + directionOffset + Math.PI)
            this.model.quaternion.rotateTowards(this.rotateQuarternion, 0.2)

            // calculate direction
            this.camera.getWorldDirection(this.walkDirection)
            this.walkDirection.y = 0
            this.walkDirection.normalize()
            this.walkDirection.applyAxisAngle(this.rotateAngle, directionOffset)

            // run/walk velocity
            const velocity = this.currentAction == 'Mixamo Running' ? this.runVelocity : this.walkVelocity

            // move model & camera
            const moveX = this.walkDirection.x * velocity * delta
            const moveZ = this.walkDirection.z * velocity * delta

            // COLLISION CHECK
            // Predict next position
            const currentX = this.model.position.x
            const currentZ = this.model.position.z 
            const nextX = currentX + moveX
            const nextZ = currentZ + moveZ

            // Simple Axis-Aligned Bounding Box (AABB) for Player
            // Assume player width ~1 unit, height ~2 units
            const playerBox = new THREE.Box3();
            playerBox.min.set(nextX - 0.3, this.model.position.y, nextZ - 0.3);
            playerBox.max.set(nextX + 0.3, this.model.position.y + 2, nextZ + 0.3);

            let collision = false;
            if (colliders && colliders.length > 0) {
                for(let i = 0; i < colliders.length; i++) {
                    if(playerBox.intersectsBox(colliders[i])) {
                        collision = true;
                        break; 
                    }
                }
            }

            if (!collision) {
                this.model.position.x += moveX
                this.model.position.z += moveZ
                this.updateCameraTarget(moveX, moveZ)
            } else {
                // Determine if we can slide along X or Z
                // Try moving only X
                playerBox.min.set(nextX - 0.3, this.model.position.y, currentZ - 0.3);
                playerBox.max.set(nextX + 0.3, this.model.position.y + 2, currentZ + 0.3);
                let collisionX = false;
                for(let i = 0; i < colliders.length; i++) {
                    if(playerBox.intersectsBox(colliders[i])) {
                        collisionX = true;
                        break;
                    }
                }
                
                if (!collisionX) {
                    this.model.position.x += moveX;
                    this.updateCameraTarget(moveX, 0);
                } else {
                     // Try moving only Z
                    playerBox.min.set(currentX - 0.3, this.model.position.y, nextZ - 0.3);
                    playerBox.max.set(currentX + 0.3, this.model.position.y + 2, nextZ + 0.3);
                    let collisionZ = false;
                    for(let i = 0; i < colliders.length; i++) {
                        if(playerBox.intersectsBox(colliders[i])) {
                            collisionZ = true;
                            break;
                        }
                    }
                    if (!collisionZ) {
                        this.model.position.z += moveZ;
                        this.updateCameraTarget(0, moveZ);
                    }
                }
            }
        }
    }

    private updateCameraTarget(moveX: number, moveZ: number) {
        // move camera
        this.camera.position.x += moveX
        this.camera.position.z += moveZ

        // update camera target
        this.cameraTarget.x = this.model.position.x
        this.cameraTarget.y = this.model.position.y + 1
        this.cameraTarget.z = this.model.position.z
        this.orbitControl.target = this.cameraTarget
    }

    private directionOffset(keysPressed: any) {
        var directionOffset = 0 // w

        if (keysPressed[W]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 // w+a
            } else if (keysPressed[D]) {
                directionOffset = - Math.PI / 4 // w+d
            }
        } else if (keysPressed[S]) {
            if (keysPressed[A]) {
                directionOffset = Math.PI / 4 + Math.PI / 2 // s+a
            } else if (keysPressed[D]) {
                directionOffset = -Math.PI / 4 - Math.PI / 2 // s+d
            } else {
                directionOffset = Math.PI // s
            }
        } else if (keysPressed[A]) {
            directionOffset = Math.PI / 2 // a
        } else if (keysPressed[D]) {
            directionOffset = - Math.PI / 2 // d
        }

        return directionOffset
    }
}