import * as THREE from 'three'

const INTERACTION_RADIUS = 8   // distance at which alien stops and faces player
const STOP_RESUME_DELAY = 3    // seconds to wait after player leaves before wandering
const AVOID_RADIUS = 4         // walk targets avoid this radius around the player
const ROAM_RADIUS = 8          // NPCs wander within this radius of their spawn point

export class NPC {
    model: THREE.Group
    mixer: THREE.AnimationMixer
    animationsMap: Map<string, THREE.AnimationAction> = new Map()
    currentAction: string = 'Idle'
    
    // Movement
    velocity: number = 1.2
    direction: THREE.Vector3 = new THREE.Vector3(0, 0, 1)
    targetPosition: THREE.Vector3 = new THREE.Vector3()
    spawnPosition: THREE.Vector3 = new THREE.Vector3()
    
    // AI Timer
    changeTimer: number = 2
    state: 'idle' | 'walking' | 'talking' = 'idle'

    // Cached player position for target picking
    private lastPlayerPos: THREE.Vector3 | null = null

    npcId: string = 'alien1'
    hasGreeted: boolean = false

    constructor(model: THREE.Group, mixer: THREE.AnimationMixer, animationsMap: Map<string, THREE.AnimationAction>, npcId: string) {
        this.model = model
        this.mixer = mixer
        this.animationsMap = animationsMap
        this.npcId = npcId
        this.spawnPosition.copy(model.position)
        
        const firstAction = Array.from(this.animationsMap.values())[0]
        if (firstAction) {
            firstAction.play()
            this.currentAction = Array.from(this.animationsMap.keys())[0]
        }
        
        this.setNewTarget(null)
    }

    private setNewTarget(avoidPos: THREE.Vector3 | null) {
        // Wander within ROAM_RADIUS of spawn point, avoiding the player
        let tries = 0
        do {
            const angle = Math.random() * Math.PI * 2
            const dist = Math.random() * ROAM_RADIUS
            this.targetPosition.set(
                this.spawnPosition.x + Math.cos(angle) * dist,
                0,
                this.spawnPosition.z + Math.sin(angle) * dist
            )
            tries++
        } while (
            avoidPos !== null &&
            tries < 20 &&
            Math.sqrt(
                Math.pow(this.targetPosition.x - avoidPos.x, 2) +
                Math.pow(this.targetPosition.z - avoidPos.z, 2)
            ) < AVOID_RADIUS
        )
    }

    private ensureAnimationPlaying() {
        const action = this.animationsMap.get('mixamo.com')
        if (action && !action.isRunning()) action.play()
    }

    public update(delta: number, playerPosition?: THREE.Vector3, customRadius?: number) {
        // --- Proximity check: if player is close, FREEZE ANIMATION and face them ---
        if (playerPosition) {
            this.lastPlayerPos = playerPosition

            const dx = playerPosition.x - this.model.position.x
            const dz = playerPosition.z - this.model.position.z
            const distToPlayer = Math.sqrt(dx * dx + dz * dz)

            const radius = customRadius || INTERACTION_RADIUS

            if (distToPlayer < radius) {
                // Smoothly face player
                const faceDir = new THREE.Vector3(dx, 0, dz).normalize()
                const targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceDir)
                this.model.quaternion.slerp(targetQ, 0.08)

                // Freeze everything: stop mixer and return immediately
                this.state = 'talking'
                this.changeTimer = STOP_RESUME_DELAY

                // Trigger greeting via callback if we haven't already
                if (!this.hasGreeted) {
                    this.hasGreeted = true;
                    // We'll dispatch a custom event because we can't easily inject the chat function here
                    const event = new CustomEvent('npc-greet', { detail: { npcId: this.npcId } });
                    document.dispatchEvent(event);
                }

                return 
            }

            if (this.state === 'talking') {
                this.state = 'idle'
                this.changeTimer = STOP_RESUME_DELAY
                // Don't reset hasGreeted immediately, let them walk away first
                if (distToPlayer > radius + 5) { // Reset greeting flag only when player is far away
                    this.hasGreeted = false;
                }
                return
            }
        }

        // Only update animation if NOT talking (freezes hands/legs)
        this.mixer.update(delta)
        this.ensureAnimationPlaying()

        // --- Normal wandering AI ---
        this.changeTimer -= delta

        if (this.state === 'idle') {
            if (this.changeTimer <= 0) {
                this.state = 'walking'
                this.changeTimer = 4 + Math.random() * 4
                this.setNewTarget(this.lastPlayerPos)  // never target the player's area
            }
        } else if (this.state === 'walking') {
            const dx = this.targetPosition.x - this.model.position.x
            const dz = this.targetPosition.z - this.model.position.z
            const distance = Math.sqrt(dx * dx + dz * dz)

            if (distance < 0.5 || this.changeTimer <= 0) {
                this.state = 'idle'
                this.changeTimer = 2 + Math.random() * 3
            } else {
                const moveDir = new THREE.Vector3(dx, 0, dz).normalize()
                const targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), moveDir)
                this.model.quaternion.slerp(targetQ, 0.1)
                this.model.position.x += moveDir.x * this.velocity * delta
                this.model.position.z += moveDir.z * this.velocity * delta
            }
        }
    }
}

