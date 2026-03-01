import { KeyDisplay } from './utils';
import { CharacterControls } from './characterControls';
import { NPC } from './npc';
import * as THREE from 'three'
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

// â”€â”€â”€ Cinematic intro â€” pairs of sentences shown together â”€â”€â”€
const introPairs = [ 
    "THE YEAR IS 2164 AD.\n150 YEARS OF NEGLECT HAVE FINALLY BROKEN EARTH.",
    "THE OCEANS ARE BLACK. THE AIR IS IRON.\nHUMANITY'S FINAL HOPE RESTS ON A SINGLE SIGNAL FROM MARS.",
    "YOU ARE RYAN, SENT TO MARS\nTO FIND A NEW HABITAT FOR HUMANITY.",
    "YOUR SHIP LOSES SIGNAL.\nEARTH CAN NO LONGER HEAR YOU.",
    "SYSTEMS ARE FAILING.\nYOU CRASH INTO THE RED DUST.",
    "NO LIFE. ONLY RED SMOKE.\nONLY SILENCE.",
    "YOUR SHIP IS SCRAP.\nBUT YOU ARE NOT ALONE.",
    "CONVINCE THEM, YOU MIGHT SAVE EARTH.\nFAIL, AND YOU DIE THE LAST HUMAN."
];
let introFinished = false;
let assetsLoaded = false;
let selectedDifficulty = 'easy';

// Hide the 3D canvas until the game actually starts
renderer.domElement.style.display = 'none';
const titleScreen = document.getElementById('title-screen');
const controlsScreen = document.getElementById('controls-screen');
const diffScreen = document.getElementById('difficulty-screen');
if (titleScreen) titleScreen.style.display = 'flex';
if (controlsScreen) controlsScreen.style.display = 'none';
if (diffScreen) diffScreen.style.display = 'none';
if (loadingScreen) loadingScreen.style.display = 'none';

// Pick a random controls image
const controlImages = ['images/controls.png', 'images/controls2.png', 'images/controls3.png', 'images/controls4.png'];
const randomControlImg = controlImages[Math.floor(Math.random() * controlImages.length)];
const controlsImg = document.getElementById('controls-img') as HTMLImageElement;
if (controlsImg) controlsImg.src = randomControlImg;

// START button â†’ go fullscreen then show controls screen
const startBtn = document.getElementById('start-btn');
if (startBtn) {
    startBtn.addEventListener('click', () => {
        document.documentElement.requestFullscreen().catch(() => {});
        if (titleScreen) titleScreen.style.display = 'none';
        if (controlsScreen) controlsScreen.style.display = 'flex';
    });
}

// CONTINUE button â†’ show difficulty screen
const continueBtn = document.getElementById('continue-btn');
if (continueBtn) {
    continueBtn.addEventListener('click', () => {
        if (controlsScreen) controlsScreen.style.display = 'none';
        if (diffScreen) diffScreen.style.display = 'flex';
    });
}

function dismissLoadingScreen() {
    if (!loadingScreen) return;
    introFinished = true;
    if (introAudio) { introAudio.pause(); introAudio = null; }
    renderer.domElement.style.display = 'block';
    loadingScreen.style.display = 'none';
}

function startGameWithDifficulty(diff: string) {
    selectedDifficulty = diff;
    if (diffScreen) {
        if (loadingScreen) loadingScreen.style.display = 'flex';
        diffScreen.style.display = 'none';
        runCinematicIntro();
    }
    // Tell server which difficulty
    fetch('/api/set-difficulty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: diff })
    }).catch(() => {});
}

// Wire up difficulty buttons
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        startGameWithDifficulty((btn as HTMLElement).getAttribute('data-diff') || 'easy');
    });
});

let introAudio: HTMLAudioElement | null = null;
let voiceEnded = false;

function runCinematicIntro() {
    const sentenceEl = document.getElementById('intro-sentence');
    const skipBtn = document.getElementById('skip-intro');
    if (!sentenceEl) return;

    voiceEnded = false;

    // Play voice.mp3 at 1.2x speed
    introAudio = new Audio('voice/voice.mp3');
    introAudio.playbackRate = 1.2;
    introAudio.play().catch(() => {});
    introAudio.onended = () => { voiceEnded = true; };

    let idx = 0;
    let cancelled = false;

    // Calculate timing: spread slides evenly across audio duration
    // Fallback to 6s per slide if duration unknown
    function getSlideTime(): number {
        if (introAudio && introAudio.duration && isFinite(introAudio.duration)) {
            return (introAudio.duration / introAudio.playbackRate) / introPairs.length * 1000;
        }
        return 6000;
    }

    function showNext() {
        if (cancelled || idx >= introPairs.length) {
            sentenceEl.classList.remove('visible');
            // Wait for BOTH voice to end AND assets to load
            const waitForAll = () => {
                if (voiceEnded && assetsLoaded) { dismissLoadingScreen(); }
                else { setTimeout(waitForAll, 200); }
            };
            setTimeout(waitForAll, 600);
            return;
        }
        sentenceEl.classList.remove('visible');
        setTimeout(() => {
            sentenceEl.innerText = introPairs[idx];
            sentenceEl.classList.add('visible');
            idx++;
            setTimeout(showNext, getSlideTime());
        }, 400);
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            cancelled = true;
            voiceEnded = true;
            if (introAudio) { introAudio.pause(); introAudio = null; }
            const waitForAssets = () => {
                if (assetsLoaded) { dismissLoadingScreen(); }
                else {
                    sentenceEl.innerText = 'Loading...';
                    sentenceEl.classList.add('visible');
                    setTimeout(waitForAssets, 200);
                }
            };
            waitForAssets();
        });
    }

    showNext();
}

loadingManager.onLoad = () => {
    console.log('All assets loaded!');
    assetsLoaded = true;
    const barContainer = document.getElementById('loading-bar-container');
    const pctLabel = document.getElementById('loading-pct');
    if (barContainer) barContainer.style.opacity = '0';
    if (pctLabel) pctLabel.style.opacity = '0';
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const barFill = document.getElementById('loading-bar-fill');
    const pctLabel = document.getElementById('loading-pct');
    const progress = Math.round((itemsLoaded / itemsTotal) * 100);
    if (barFill) barFill.style.width = `${progress}%`;
    if (pctLabel) pctLabel.innerText = `LOADING ${progress}%`;
};

// Intro starts after difficulty selection (see startGameWithDifficulty)

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

// NPC ALIENS â€” Zorg (alien1) and Xylia (alien2)
const npcs: NPC[] = []

const INTERACTION_DISTANCE = 4

const loader = new GLTFLoader(loadingManager)
const spawnNPC = (x: number, z: number, id: string) => {
    loader.load('models/alien.glb', function (gltf) {
        const model = gltf.scene;
        model.position.set(x, 0, z)
        model.traverse(function (object: any) {
            if (object.isMesh) object.castShadow = true;
        });
        scene.add(model);

        model.updateMatrixWorld();
        const alienBox = new THREE.Box3().setFromObject(model);
        model.position.y -= alienBox.min.y;

        const mixer = new THREE.AnimationMixer(model);
        const animationsMap: Map<string, THREE.AnimationAction> = new Map()
        gltf.animations.forEach((a: THREE.AnimationClip) => {
            console.log("Alien Animation found:", a.name);
            animationsMap.set(a.name, mixer.clipAction(a))
        })

        model.scale.set(1, 1, 1);
        model.position.y = 0;

        npcs.push(new NPC(model, mixer, animationsMap, id))
    })
}

// Fixed positions: Zorg and Xylia far from player, on opposite sides of each other
spawnNPC(-20, -18, 'alien1');  // Zorg â€” far left
spawnNPC(18, 16, 'alien2');   // Xylia â€” far right, opposite side

// ===================================
// ðŸŽ¤ VOICE INPUT & CHAT SYSTEM
// ===================================
const micBtn = document.getElementById('mic-btn');
const chatContainer = document.getElementById('chat-container');
const npcNameUI = document.getElementById('npc-name');
const chatTextUI = document.getElementById('chat-text');
const thoughtBubble = document.getElementById('thought-bubble');
const hudOverlay = document.getElementById('hud-overlay');
const hudText = document.getElementById('hud-text');
const repValue = document.getElementById('rep-value');
const repBarFill = document.getElementById('rep-bar-fill') as HTMLElement;

// Unlock audio on first user interaction (browser autoplay policy)
let audioUnlocked = false;
const unlockAudio = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    ctx.close();
};
document.addEventListener('click', unlockAudio, { once: true });
document.addEventListener('keydown', unlockAudio, { once: true });

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

// âŒ¨ï¸ SHORTCUT: Hold ALT to speak
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
    
    const context = npcId === 'alien1'
        ? "[The human astronaut Ryan approaches. He crashed here seeking the Ancestral Martian Core to save Earth. Greet him and test his sincerity. Keep it short.]"
        : "[Ryan the astronaut approaches. He needs help to send a signal to Earth from your UFO. Greet him with cautious empathy. Keep it short.]";
    sendToBackend(npcId, "", context);
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

function showThought(thought: string) {
    if (!thoughtBubble || !thought) return;
    thoughtBubble.innerText = `ðŸ’­ "${thought}"`;
    thoughtBubble.style.display = 'block';
    thoughtBubble.style.opacity = '1';
    // Sits just above the chat container (chat = top:20px, thought = top:20px â†’ we push chat down temporarily)
    if (chatContainer) chatContainer.style.top = '58px';
    setTimeout(() => {
        thoughtBubble.style.opacity = '0';
        setTimeout(() => {
            thoughtBubble.style.display = 'none';
            if (chatContainer) chatContainer.style.top = '20px';
        }, 500);
    }, 4000);
}

function showHUD(lines: string[]) {
    if (!hudOverlay || !hudText) return;
    hudOverlay.style.display = 'block';
    const content = lines.map(l => `> ${l}`).join('\n');
    hudText.innerText = content;
    (hudText as HTMLElement).style.opacity = '1';
    setTimeout(() => {
        (hudText as HTMLElement).style.opacity = '0';
        setTimeout(() => { hudOverlay.style.display = 'none'; }, 400);
    }, 3500);
}

function updateReputation(score: number) {
    if (repValue) repValue.innerText = String(score);
    if (repBarFill) {
        repBarFill.style.width = `${score}%`;
        if (score < 30) repBarFill.style.background = '#8b3a1a';
        else if (score < 60) repBarFill.style.background = '#c2703a';
        else repBarFill.style.background = '#d3843a';
    }
}

async function sendToBackend(npcId: string, playerMessage: string, contextOverride?: string) {
    if (playerMessage) showChat("You", playerMessage); // Show what you said first

    // Show HUD while waiting for AI
    showHUD(['NEURAL LINK ESTABLISHED...', `CONNECTING TO ${npcId.toUpperCase()}...`, 'DECODING ALIEN THOUGHTS...']);

    try {
        const payload = {
            npcId,
            playerMessage: playerMessage || contextOverride // Send context if no spoken message
        };

        const response = await fetch('/api/npc-chat', {
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

        // Show AI thought immediately (before audio plays)
        if (data.thought) showThought(data.thought);

        // Show HUD with live AI JSON telemetry
        showHUD([
            `[NPC: ${data.npcName}]`,
            `EMOTION: ${(data.emotion || 'neutral').toUpperCase()}`,
            `REPUTATION: ${data.reputation ?? '?'}/100`
        ]);

        // Update reputation bar
        if (typeof data.reputation === 'number') updateReputation(data.reputation);

        // Check if trust unlocked the core
        if (data.coreUnlocked && !coreUnlocked) {
            coreUnlocked = true;
            showChat("System", "âš¡ The aliens trust you. You can now use the UFO transmitter.");
        }

        // Show Alien Response
        showChat(data.npcName, data.dialogue);

        // Play Audio
        if (data.audio) {
            const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
            audio.play().catch(err => {
                console.warn('Audio autoplay blocked (interact with the page first):', err);
            });
        }

    } catch (error) {
        console.error("Network Error:", error);
        showChat("System", "Could not reach the alien server. Is it running?");
    }
}

function speakText(_text: string) {
    // Removed â€” using ElevenLabs TTS only
}

// ===================================
// GAME STATE
// ===================================
let coreUnlocked = false;
let dataExtracted = false;
let extractedCoordinates = '';
let missionComplete = false;

// ===================================
// ðŸ“· SCANNER â€” 'C' key
// ===================================
interface ScannableObject {
    name: string
    description: string
    scanId: string  // 'perseverance' | 'curiosity' | 'ufo' | etc
    position: THREE.Vector3
}
const scannableObjects: ScannableObject[] = [];
const SCAN_DISTANCE = 10;

function scanNearbyObject() {
    if (!characterControls || missionComplete) return;
    const playerPos = characterControls.model.position;
    let closest: ScannableObject | null = null;
    let minDist = Infinity;

    scannableObjects.forEach(obj => {
        const dist = playerPos.distanceTo(obj.position);
        if (dist < SCAN_DISTANCE && dist < minDist) {
            minDist = dist;
            closest = obj;
        }
    });

    if (!closest) {
        showChat('Scanner', 'No objects nearby to scan. Get closer to something.');
        return;
    }

    const obj = closest as ScannableObject;
    showHUD([`[VISUAL SCANNER]`, `TARGET: ${obj.name}`, `DISTANCE: ${minDist.toFixed(1)}m`]);

    if (obj.scanId === 'ufo') {
        if (coreUnlocked && dataExtracted) {
            showChat('Scanner', 'UFO transmitter ready. Press [E] to open the terminal and send signal.');
        } else if (coreUnlocked) {
            showChat('Scanner', 'UFO transmitter unlocked. But you need data first â€” find Perseverance rover.');
        } else {
            showChat('Scanner', 'Alien UFO. You need the aliens\' trust before you can use this.');
        }
    } else if (obj.scanId === 'curiosity') {
        showChat('Scanner', 'NASA Curiosity. Old hardware. Not useful for sending signals.');
    } else if (obj.scanId === 'perseverance') {
        if (dataExtracted) {
            showChat('Scanner', 'Perseverance. Data already extracted. Go to the UFO.');
        } else if (coreUnlocked) {
            showChat('Scanner', 'NASA Perseverance. Hold [E] to extract signal data.');
        } else {
            showChat('Scanner', 'NASA Perseverance. You need the aliens\' trust before you can extract data.');
        }
    } else {
        showChat('Scanner', `${obj.name}: ${obj.description}`);
    }
}

document.addEventListener('keydown', (event) => {
    if ((event.key === 'c' || event.key === 'C') && !event.ctrlKey && !event.metaKey) {
        scanNearbyObject();
    }
});

// ===================================
// â³ EXTRACTION â€” Hold 'E'
// ===================================
const extractOverlay = document.getElementById('extract-overlay');
const extractCircle = document.querySelector('#extract-ring svg circle') as SVGCircleElement | null;
const extractLabel = document.getElementById('extract-label');
const earthComm = document.getElementById('earth-comm');
const coordInput = document.getElementById('coord-input') as HTMLInputElement | null;
const sendSignalBtn = document.getElementById('send-signal-btn');
const missionCompleteScreen = document.getElementById('mission-complete');

let eHeld = false;
let extractProgress = 0;
const EXTRACT_DURATION = 3; // seconds to hold E

function getNearestScannable(): ScannableObject | null {
    if (!characterControls) return null;
    const playerPos = characterControls.model.position;
    let closest: ScannableObject | null = null;
    let minDist = Infinity;
    scannableObjects.forEach(obj => {
        const dist = playerPos.distanceTo(obj.position);
        if (dist < SCAN_DISTANCE && dist < minDist) {
            minDist = dist;
            closest = obj;
        }
    });
    return closest;
}

document.addEventListener('keydown', async (event) => {
    if (event.key === 'e' || event.key === 'E') {
        if (event.repeat || missionComplete) return;
        const nearest = getNearestScannable();
        if (!nearest) return;

        // Always sync game state from server before checking
        try {
            const stateRes = await fetch('/api/game-state');
            const state = await stateRes.json();
            coreUnlocked = state.coreUnlocked;
            dataExtracted = state.dataExtracted;
            if (typeof state.reputation === 'number') updateReputation(state.reputation);
        } catch (e) { /* use local state */ }

        if (nearest.scanId === 'perseverance' && !dataExtracted) {
            if (!coreUnlocked) {
                showChat('System', 'The aliens don\'t trust you yet. Talk to them first.');
                return;
            }
            eHeld = true;
            extractProgress = 0;
            if (extractOverlay) extractOverlay.style.display = 'flex';
            if (extractLabel) extractLabel.innerText = 'EXTRACTING...';
        } else if (nearest.scanId === 'ufo' && coreUnlocked && dataExtracted) {
            // Open Earth-Comm Terminal
            if (earthComm) {
                earthComm.style.display = 'block';
                if (coordInput) coordInput.value = extractedCoordinates;
                coordInput?.focus();
            }
        } else if (nearest.scanId === 'ufo' && coreUnlocked && !dataExtracted) {
            showChat('System', 'Go find the Perseverance rover first. Use [C] to scan and [E] to extract data from it.');
        } else if (nearest.scanId === 'ufo' && !coreUnlocked) {
            showChat('System', 'The aliens don\'t trust you yet. Talk to them first.');
        } else if (nearest.scanId === 'perseverance' && dataExtracted) {
            showChat('System', 'Data already extracted. Go to the UFO to transmit the signal.');
        }
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key === 'e' || event.key === 'E') {
        eHeld = false;
        extractProgress = 0;
        if (extractOverlay) extractOverlay.style.display = 'none';
        if (extractCircle) extractCircle.style.strokeDashoffset = '314';
    }
});

// Update extraction progress in animation loop (called from animate())
function updateExtraction(delta: number) {
    if (!eHeld || dataExtracted) return;
    extractProgress += delta;
    const pct = Math.min(extractProgress / EXTRACT_DURATION, 1);
    if (extractCircle) {
        extractCircle.style.strokeDashoffset = String(314 * (1 - pct));
    }
    if (extractLabel) extractLabel.innerText = `EXTRACTING ${Math.round(pct * 100)}%`;

    if (pct >= 1) {
        eHeld = false;
        if (extractOverlay) extractOverlay.style.display = 'none';
        completeExtraction();
    }
}

async function completeExtraction() {
    showHUD(['[DATA EXTRACTION]', 'SYNCING WITH PERSEVERANCE...', 'DOWNLOADING MARTIAN COLLAPSE LOGS...']);
    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
            dataExtracted = true;
            extractedCoordinates = data.coordinates || '';
            showChat('Perseverance', data.message);
            showHUD(['[EXTRACTION COMPLETE]', `COORDS: ${extractedCoordinates}`, 'GO TO UFO TO TRANSMIT']);
        } else {
            showChat('System', data.message);
        }
    } catch (err) {
        showChat('System', 'Extraction failed. Is the server running?');
    }
}

// ===================================
// ðŸ“¡ EARTH-COMM TERMINAL
// ===================================
if (sendSignalBtn) {
    sendSignalBtn.addEventListener('click', async () => {
        const coords = coordInput?.value || '';
        if (earthComm) earthComm.style.display = 'none';

        showHUD(['[TRANSMITTING]', 'LOCKING DEEP SPACE FREQUENCY...', 'BEAMING SIGNAL TO EARTH...']);

        try {
            const res = await fetch('/api/send-signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: coords })
            });
            const data = await res.json();
            if (data.success) {
                triggerEnding(data.radioMessage);
            } else {
                showChat('System', data.message);
            }
        } catch (err) {
            showChat('System', 'Transmission failed.');
        }
    });
}

// Close earth-comm on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && earthComm) earthComm.style.display = 'none';
});

// ===================================
// ðŸŽ¬ ENDING SEQUENCE
// ===================================
function triggerEnding(radioMessage: string) {
    missionComplete = true;

    // Flash white beam effect
    const beam = new THREE.PointLight(0xffffff, 5, 100);
    beam.position.set(-8, 20, -10);
    scene.add(beam);

    // Fade NPCs to dust over 4 seconds
    npcs.forEach(npc => {
        let fadeStart = Date.now();
        const fadeInterval = setInterval(() => {
            const elapsed = (Date.now() - fadeStart) / 4000;
            npc.model.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    child.material.transparent = true;
                    child.material.opacity = Math.max(0, 1 - elapsed);
                }
            });
            if (elapsed >= 1) {
                clearInterval(fadeInterval);
                scene.remove(npc.model);
            }
        }, 50);
    });

    // Radio crackle after 3 seconds
    setTimeout(() => {
        showChat('Earth Radio', radioMessage);
        speakText(radioMessage);
    }, 3000);

    // Show mission complete screen after 8 seconds
    setTimeout(() => {
        if (missionCompleteScreen) missionCompleteScreen.style.display = 'flex';
    }, 8000);
}

// WORLD OBJECTS â€” scattered around behind/around the player spawn
const objectLoader = new GLTFLoader(loadingManager)

interface ObjectConfig {
    file: string
    scale: number
    y: number
    displayName: string
    description: string
    scanId: string
}

const worldObjects: ObjectConfig[] = [
    { file: 'objects/ufo.glb',                                   scale: 0.55,  y: 0, scanId: 'ufo',          displayName: 'Alien UFO', description: 'An alien spacecraft with a transmitter that can send signals to Earth.' },
    { file: 'objects/starship_mk1.glb',                          scale: 0.055, y: 4, scanId: 'starship',     displayName: 'Ryan\'s Crashed Ship', description: 'Your ship. Destroyed on landing. There is no going back.' },
    { file: 'objects/perseverance_-_nasa_mars_landing_2021.glb', scale: 0.82,  y: 0, scanId: 'perseverance', displayName: 'NASA Perseverance Rover', description: 'NASA Perseverance. High-gain antenna detected. Can sync with the Martian Core.' },
    { file: 'objects/curiosity_rover_mars_nasa.glb',              scale: 0.04,  y: 0, scanId: 'curiosity',    displayName: 'NASA Curiosity Rover', description: 'NASA Curiosity. Outdated hardware. Cannot amplify the Martian Core signal.' },
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

        // Register for C-key scanning
        scannableObjects.push({
            name: cfg.displayName,
            description: cfg.description,
            scanId: cfg.scanId,
            position: obj.position
        })
    }, undefined, function (err) {
        console.warn('Could not load object:', cfg.file, err)
    })
})

// CLIFFS â€” some near objects, some far away
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
    updateExtraction(mixerUpdateDelta);
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
