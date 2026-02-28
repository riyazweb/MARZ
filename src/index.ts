import { KeyDisplay } from './utils';
import { CharacterControls } from './characterControls';
import { NPC } from './npc';
import * as THREE from 'three'
import { CameraHelper } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// SCENE
const scene = new THREE.Scene();
const skyColor = new THREE.Color(0xff7436);
scene.background = skyColor;
scene.fog = new THREE.FogExp2(0xff7436, 0.04); // Heavier fog to blend floor into sky seamlessly

// CAMERA
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 5;
camera.position.z = 5;
camera.position.x = 0;

// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true

// CONTROLS
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true
orbitControls.minDistance = 5
orbitControls.maxDistance = 15
orbitControls.enablePan = false
orbitControls.maxPolarAngle = Math.PI / 2 - 0.05
orbitControls.update();

// LIGHTS
light()

// FLOOR
generateFloor()

// LOADING MANAGER
const loadingScreen = document.getElementById('loading-screen');
const loadingManager = new THREE.LoadingManager();

loadingManager.onLoad = () => {
    console.log('All assets loaded! Starting simulation...');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 1000); // Wait for transition to finish
    }
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const text = document.getElementById('loading-text');
    if (text) {
        const progress = Math.round((itemsLoaded / itemsTotal) * 100);
        text.innerText = `PREPARING MARS EXPEDITION... ${progress}%`;
    }
};

// MODEL WITH ANIMATIONS
var characterControls: CharacterControls
new GLTFLoader(loadingManager).load('models/mercenary_astronaut.glb', function (gltf) {
    const model = gltf.scene;
    model.traverse(function (object: any) {
        if (object.isMesh) object.castShadow = true;
    });
    scene.add(model);

    // Ground the model so feet are on the floor (handles models with offset origins)
    model.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;

    const gltfAnimations: THREE.AnimationClip[] = gltf.animations;
    const mixer = new THREE.AnimationMixer(model);
    const animationsMap: Map<string, THREE.AnimationAction> = new Map()
    gltfAnimations.filter(a => a.name != 'TPose').forEach((a: THREE.AnimationClip) => {
        console.log("Animation found:", a.name);
        animationsMap.set(a.name, mixer.clipAction(a))
    })

    const initialAction = animationsMap.has('Mixamo Idle') ? 'Mixamo Idle' : (gltfAnimations[0] ? gltfAnimations[0].name : '');
    characterControls = new CharacterControls(model, mixer, animationsMap, orbitControls, camera,  initialAction)
});

// NPC ALIENS
const npcs: NPC[] = []
const NUM_ALIENS = 2 // Change this value to increase or decrease the number of aliens
const INTERACTION_DISTANCE = 4 // How close player needs to be to make them stop and look (decreased from 8)

const loader = new GLTFLoader(loadingManager)
const spawnNPC = (x: number, z: number, id: string) => {
    loader.load('models/alien.glb', function (gltf) {
        const model = gltf.scene;
        model.position.set(x, 0, z)
        model.traverse(function (object: any) {
            if (object.isMesh) object.castShadow = true;
        });
        scene.add(model);

        // Ground the alien so feet are on the floor (not clipping under ground)
        model.updateMatrixWorld();
        const alienBox = new THREE.Box3().setFromObject(model);
        model.position.y -= alienBox.min.y;  // Move up so the bottom strictly touches y=0

        const mixer = new THREE.AnimationMixer(model);
        const animationsMap: Map<string, THREE.AnimationAction> = new Map()
        gltf.animations.forEach((a: THREE.AnimationClip) => {
            console.log("Alien Animation found:", a.name);
            animationsMap.set(a.name, mixer.clipAction(a))
        })

        model.scale.set(1, 1, 1); // Normal original size
        model.position.y = 0; // Mixamo models have feet exactly at y=0 in model space

        npcs.push(new NPC(model, mixer, animationsMap, id))
    })
}

// Spawn the configured number of aliens at random starting positions that are far apart
const alienSpawnPositions: [number, number][] = []
for (let i = 0; i < NUM_ALIENS; i++) {
    let x: number, z: number, tooClose: boolean;
    let attempts = 0;
    do {
        tooClose = false;
        x = (Math.random() - 0.5) * 50; // Widen the range
        z = (Math.random() - 0.5) * 50;
        
        // Ensure they aren't on top of player (0,0)
        if (Math.abs(x) < 5 && Math.abs(z) < 5) tooClose = true;
        
        // Ensure they are far from each other (at least 15 units)
        for (const pos of alienSpawnPositions) {
            const dist = Math.sqrt(Math.pow(x - pos[0], 2) + Math.pow(z - pos[1], 2));
            if (dist < 15) tooClose = true;
        }
        attempts++;
    } while (tooClose && attempts < 50);
    
    alienSpawnPositions.push([x, z]);
    // Assign unique IDs: alien1, alien2, alien3...
    spawnNPC(x, z, `alien${i + 1}`);
}

// ===================================
// 🎤 VOICE INPUT & CHAT SYSTEM
// ===================================
const micBtn = document.getElementById('mic-btn');
const chatContainer = document.getElementById('chat-container');
const npcNameUI = document.getElementById('npc-name');
const chatTextUI = document.getElementById('chat-text');

let isRecording = false;
let recognition: any;

// Initialize Web Speech API
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isRecording = true;
        micBtn?.classList.add('listening');
        console.log("Listening...");
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn?.classList.remove('listening');
        console.log("Stopped listening.");
    };

    recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        console.log("You said:", transcript);
        
        // Find the CLOSEST alien to talk to
        const closestNPC = getClosestNPC();

        if (closestNPC) {
            await sendToBackend(closestNPC.npcId, transcript);
        } else {
            showChat("System", "No alien nearby to hear you. Get closer!");
            speakText("No alien nearby.");
        }
    };
} else {
    console.warn("Web Speech API not supported in this browser.");
    if (micBtn) micBtn.style.display = 'none';
}

if (micBtn) {
    // START recording on press
    micBtn.addEventListener('mousedown', () => {
        if (!isRecording && recognition) recognition.start();
    });
    micBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!isRecording && recognition) recognition.start();
    });

    // STOP recording on release
    micBtn.addEventListener('mouseup', () => {
        if (isRecording && recognition) recognition.stop();
    });
    micBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (isRecording && recognition) recognition.stop();
    });
}

// ⌨️ SHORTCUT: Hold ALT to speak
document.addEventListener('keydown', (event) => {
    if ((event.key === 'Alt' || event.key === 'AltGraph') && !event.repeat) {
        event.preventDefault(); 
        if (!isRecording && recognition) recognition.start();
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key === 'Alt' || event.key === 'AltGraph') {
        if (isRecording && recognition) recognition.stop();
    }
});

// Listener for automatic NPC greeting
document.addEventListener('npc-greet', ((e: CustomEvent) => {
    const npcId = e.detail.npcId;
    console.log("NPC Auto Greet:", npcId);
    
    // We send a hidden context message to trigger the greeting about Mars pollution
    // The player won't see this text, but the alien will reply to it.
    sendToBackend(npcId, "", "[You see the human approach. Start telling them the story of how Mars was destroyed by pollution. Warn them to leave. Keep it short.]");
}) as EventListener);

function getClosestNPC(): NPC | null {
    if (!characterControls) return null;
    let closest: NPC | null = null;
    let minDist = Infinity;
    
    npcs.forEach(npc => {
        const dist = npc.model.position.distanceTo(characterControls.model.position);
        if (dist < 10 && dist < minDist) { // Only if within 10 units
            minDist = dist;
            closest = npc;
        }
    });
    return closest;
}

function showChat(name: string, text: string) {
    if (chatContainer && npcNameUI && chatTextUI) {
        chatContainer.style.display = 'block';
        npcNameUI.innerText = name;
        chatTextUI.innerText = text;
        
        // Hide after 6 seconds
        setTimeout(() => {
            chatContainer.style.display = 'none';
        }, 8000);
    }
}

async function sendToBackend(npcId: string, playerMessage: string, contextOverride?: string) {
    if (playerMessage) showChat("You", playerMessage); // Show what you said first

    try {
        const payload = {
            npcId,
            playerMessage: playerMessage || contextOverride // Send context if no spoken message
        };

        const response = await fetch('http://localhost:3001/api/npc-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.error) {
            console.error("Backend Error:", data.error);
            showChat("Error", "Alien Brain Disconnected.");
            return;
        }

        // Show Alien Response
        showChat(data.npcName, data.dialogue);

        // Play Audio
        if (data.audio) {
            const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
            audio.play();
        }

    } catch (error) {
        console.error("Network Error:", error);
        showChat("System", "Could not reach the alien server. Is it running?");
    }
}

function speakText(text: string) {
    const utter = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utter);
}

// WORLD OBJECTS — scattered around behind/around the player spawn
const objectLoader = new GLTFLoader(loadingManager)

interface ObjectConfig {
    file: string
    scale: number
    y: number  // manual y offset if needed
}

const worldObjects: ObjectConfig[] = [
    { file: 'objects/ufo.glb',                                   scale: 0.55,  y: 0 },
    { file: 'objects/starship_mk1.glb',                          scale: 0.075, y: 0 },
    { file: 'objects/perseverance_-_nasa_mars_landing_2021.glb', scale: 0.82,  y: 0 },
    { file: 'objects/mars_rover.glb',                            scale: 0.04,  y: 0 },
]

// Fixed spawn positions scattered around the map (not on top of player spawn at 0,0)
const objectSpawnPositions = [
    [-8, -10], [10, -8], [-12, 6], [14, 12],
    [18, -4], [-16, -6], [8, 18], [-10, 16]
]

worldObjects.forEach((cfg, index) => {
    const pos = objectSpawnPositions[index % objectSpawnPositions.length]
    objectLoader.load(cfg.file, function (gltf) {
        const obj = gltf.scene
        obj.scale.setScalar(cfg.scale)
        obj.position.set(pos[0], cfg.y, pos[1])
        obj.rotation.y = Math.random() * Math.PI * 2
        obj.traverse(function (child: any) {
            if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
        })
        scene.add(obj)
    }, undefined, function (err) {
        console.warn('Could not load object:', cfg.file, err)
    })
})

// CLIFFS — some near objects, some far away
const cliffConfigs = [
    { file: 'objects/desert_high_cliff.glb', scale: 0.0005 },
    { file: 'objects/desert_cliff_6.glb',    scale: 0.002  },
]

// Near-object positions (offsets from rocket/rover positions)
// Placing them at a distance of 3-7 units to ensure they don't overlap with the main object
const nearPositions: [number, number][] = objectSpawnPositions.map(pos => {
    // Choose a random angle
    const angle = Math.random() * Math.PI * 2;
    // Distance between 3 and 7 units (enough to be "beside" but not "on top")
    const distance = 3 + Math.random() * 4;
    const offsetX = Math.cos(angle) * distance;
    const offsetZ = Math.sin(angle) * distance;
    return [pos[0] + offsetX, pos[1] + offsetZ] as [number, number]
})

// Far-edge positions (30-38 units from center)
const farPositions: [number, number][] = [
    [-35, -30], [32, -34], [-30, 33], [34, 30],
    [-34, 5],   [36, -8],  [5, -36],  [-6, 35]
]

function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
}

cliffConfigs.forEach(cfg => {
    // 1-2 near objects, 1-2 far away (total 2-4)
    const nearCount = 1 + Math.floor(Math.random() * 2)
    const farCount = 1 + Math.floor(Math.random() * 2)

    const selectedPositions = [
        ...pickRandom(nearPositions, nearCount),
        ...pickRandom(farPositions, farCount)
    ]

    selectedPositions.forEach(pos => {
        objectLoader.load(cfg.file, function (gltf) {
            const obj = gltf.scene
            obj.scale.setScalar(cfg.scale)
            obj.position.set(pos[0], 0, pos[1])
            obj.rotation.y = Math.random() * Math.PI * 2
            obj.traverse(function (child: any) {
                if (child.isMesh) { child.castShadow = true; child.receiveShadow = true }
            })
            scene.add(obj)
        }, undefined, function (err) {
            console.warn('Could not load cliff:', cfg.file, err)
        })
    })
})

// CONTROL KEYS
const keysPressed = {  }
const keyDisplayQueue = new KeyDisplay();
document.addEventListener('keydown', (event) => {
    keyDisplayQueue.down(event.key)
    if (event.shiftKey && characterControls) {
        characterControls.switchRunToggle()
    } else {
        (keysPressed as any)[event.key.toLowerCase()] = true
    }
}, false);
document.addEventListener('keyup', (event) => {
    keyDisplayQueue.up(event.key);
    (keysPressed as any)[event.key.toLowerCase()] = false
}, false);

const clock = new THREE.Clock();
// ANIMATE
function animate() {
    let mixerUpdateDelta = clock.getDelta();
    if (characterControls) {
        characterControls.update(mixerUpdateDelta, keysPressed);
    }
    npcs.forEach(npc => npc.update(mixerUpdateDelta, characterControls ? characterControls.model.position : undefined, INTERACTION_DISTANCE))
    orbitControls.update()
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
document.body.appendChild(renderer.domElement);
animate();

// RESIZE HANDLER
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    keyDisplayQueue.updatePosition()
}
window.addEventListener('resize', onWindowResize);

function generateFloor() {
    // TEXTURES
    const textureLoader = new THREE.TextureLoader();
    const placeholder = textureLoader.load("./textures/placeholder/placeholder.png");
    const sandBaseColor = textureLoader.load("./textures/sand/c.webp");
    const sandNormalMap = textureLoader.load("./textures/sand/Sand 002_NRM.jpg");
    const sandHeightMap = textureLoader.load("./textures/sand/Sand 002_DISP.jpg");
    const sandAmbientOcclusion = textureLoader.load("./textures/sand/Sand 002_OCC.jpg");

    const WIDTH = 80
    const LENGTH = 80

    const geometry = new THREE.PlaneGeometry(WIDTH, LENGTH, 512, 512);
    const material = new THREE.MeshStandardMaterial(
        {
            map: sandBaseColor, normalMap: sandNormalMap,
            displacementMap: sandHeightMap, displacementScale: 0.1,
            aoMap: sandAmbientOcclusion
        })
    wrapAndRepeatTexture(material.map)
    wrapAndRepeatTexture(material.normalMap)
    wrapAndRepeatTexture(material.displacementMap)
    wrapAndRepeatTexture(material.aoMap)
    // const material = new THREE.MeshPhongMaterial({ map: placeholder})

    const floor = new THREE.Mesh(geometry, material)
    floor.receiveShadow = true
    floor.rotation.x = - Math.PI / 2
    scene.add(floor)
}

function wrapAndRepeatTexture (map: THREE.Texture) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.repeat.x = map.repeat.y = 10
}

function light() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    const dirLight = new THREE.DirectionalLight(0xffffff, 1)
    dirLight.position.set(- 60, 100, - 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = - 50;
    dirLight.shadow.camera.left = - 50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 200;
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    scene.add(dirLight);
    // scene.add( new THREE.CameraHelper(dirLight.shadow.camera))
}