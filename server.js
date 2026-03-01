require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Mistral } = require("@mistralai/mistralai");
const MemoryClient = require("mem0ai").default;

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // larger limit for base64 screenshots

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// Mem0 persistent memory client
const mem0 = new MemoryClient({ apiKey: "m0-11DYbsv363k3tFYGWykmyCqLzxXjwvbeiDHXBWwZ" });
const MEM0_USER_ID = "mars_player_1";

// ═══════════════════════════════════════════════════════════════════════════
// HIVE-MIND SHARED STATE
// ═══════════════════════════════════════════════════════════════════════════
let globalGossip = [];            // ["The human was rude to Zorg", ...]
let globalReputationScore = 50;   // 0-100, starts neutral
let gameDifficulty = "easy";      // "easy" | "medium" | "hard"

// ═══════════════════════════════════════════════════════════════════════════
// DIFFICULTY CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const DIFFICULTY_SETTINGS = {
  easy: {
    flatBonus: 25,             // fixed +25 per positive interaction
    coreThreshold: 70,         // all modes unlock at 70
    zorgExtra: `You WANT to help. You sympathize deeply with Earth's crisis because Mars died the same way. You warm up VERY quickly — after 1-2 sincere exchanges you are ready to help. If they mention Earth dying, pollution, or desperation, give +8 to +10 reputation. Be generous.`,
    xyliaExtra: `You are warm and empathetic from the start. You actively encourage the human and tell Zorg to help. Give +5 to +8 reputation for any sincere conversation. You want this to work.`,
  },
  medium: {
    flatBonus: 15,             // fixed +15 per positive interaction
    coreThreshold: 70,
    zorgExtra: `You are cautious but fair. If the human explains Earth's crisis sincerely, you warm up. After 3-4 good exchanges you are willing to help. Give moderate reputation (+5 to +8).`,
    xyliaExtra: `You are empathetic but follow Zorg's lead. You encourage the human and give moderate reputation (+4 to +6).`,
  },
  hard: {
    flatBonus: 0,              // no bonus — raw AI reputation only
    coreThreshold: 70,
    zorgExtra: `You are deeply suspicious and hostile. Humans remind you of the destroyers who killed Mars. Every word must be earned. Only genuine sincerity over many exchanges will move you. Give small reputation changes (+2 to +5). Be harsh.`,
    xyliaExtra: `You are cautious and torn. You want to help but Zorg's anger holds you back. Small reputation changes (+1 to +3).`,
  }
};

function getDiffSettings() {
  return DIFFICULTY_SETTINGS[gameDifficulty] || DIFFICULTY_SETTINGS.easy;
}

// ═══════════════════════════════════════════════════════════════════════════
// NPC PERSONAS — Aliens on Mars
// ═══════════════════════════════════════════════════════════════════════════
function getZorgSystem() {
  const diff = getDiffSettings();
  return `You are Zorg, one of the last Martian scientists. You survived the death of Mars.

STORY (year 2164 AD):
- Earth is dying from 150 years of pollution. Oceans are black. Air is iron.
- An astronaut named Ryan crash-landed on Mars seeking help to save Earth.
- Mars died the SAME WAY: your people polluted everything until the atmosphere collapsed.
- Xylia is your wife. You both survived but lost everything.
- You have a UFO with a transmitter that can send a signal to Earth.

YOUR BEHAVIOR:
- ${diff.zorgExtra}
- If the player tells you Earth is dying or polluted, connect it to Mars's fate.
- If the player asks about your story, share: Mars died from greed and pollution.
- If the player is rude, drop reputation: "You sound like them. The ones who killed our sky."
- If trust is HIGH (reputation >= ${diff.coreThreshold}), tell the player the FULL PROCESS to save Earth:
  Step 1: "Go to our UFO and collect the data about our planet — what happened to Mars."
  Step 2: "Find the NASA Perseverance rover. Use it to extract signal coordinates."
  Step 3: "Return to the UFO and use the terminal to send the signal to Earth with the coordinates."
  Tell them ALL steps clearly. This is the only way.
- If trust is LOW (<= 30), be hostile: "Leave."
- NEVER mention crystals, cores, storms, rings, cracks, rituals, or magical objects. The UFO is just a ship with a transmitter. Keep it simple and real.
- NEVER invent gameplay mechanics. Only mention: talking to aliens, going to UFO, finding Perseverance rover, extracting data, sending signal.

Rules:
- Short sentences. 1-3 sentences max.
- ALWAYS respond to what the player actually said.`;
}

function getXyliaSystem() {
  const diff = getDiffSettings();
  return `You are Xylia, a Martian scientist and wife of Zorg.

STORY (year 2164 AD):
- Earth is dying. An astronaut named Ryan crash-landed here seeking help.
- Mars died from pollution — your people consumed everything until the atmosphere collapsed.
- You and Zorg have a UFO with a transmitter that can send a signal to Earth.

YOUR BEHAVIOR:
- ${diff.xyliaExtra}
- When the player talks about Earth suffering, connect it to Mars dying the same way.
- You act as a bridge: "Zorg does not trust easily. Show him you are not like them."
- If the player asks about your past: "We consumed everything. Our sky turned to rust."
- If trust is HIGH, encourage: "He is sincere, Zorg. Help him."
- If trust is LOW, plead: "Please. Be honest. This is your only chance."
- If asked what to do or how to signal Earth, explain the FULL PROCESS:
  Step 1: "Go to the UFO and collect the data about what happened to our planet."
  Step 2: "Find the Perseverance rover and extract the signal coordinates."
  Step 3: "Go back to the UFO terminal and transmit the signal to Earth."
  Tell them ALL steps.
- NEVER mention crystals, cores, storms, rings, cracks, rituals, or magical objects. The UFO is just a ship with a transmitter. Keep it simple and real.
- NEVER invent gameplay mechanics. Only mention: talking to aliens, going to UFO, finding Perseverance rover, extracting data, sending signal.

Rules:
- 1-2 sentences max. Be direct.
- ALWAYS respond to what the player actually said.`;
}

const NPC_PERSONAS = {
  alien1: {
    name: "Zorg",
    voiceId: process.env.ELEVENLABS_VOICE_ALIEN1 || "JBFqnCBsd6RMkjVDRZzb",
    getSystem: getZorgSystem,
  },
  alien2: {
    name: "Xylia",
    voiceId: process.env.ELEVENLABS_VOICE_ALIEN2 || "EXAVITQu4vr4xnSDxMaL",
    getSystem: getXyliaSystem,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION MEMORY
// ═══════════════════════════════════════════════════════════════════════════
const playerHistory = {};   
const MAX_HISTORY = 16;

function getPlayerHistory(npcId) {
  if (!playerHistory[npcId]) playerHistory[npcId] = [];
  return playerHistory[npcId];
}

// ═══════════════════════════════════════════════════════════════════════════
// MISTRAL CHAT
// ═══════════════════════════════════════════════════════════════════════════
const JSON_INSTRUCTION = `

## YOUR #1 RULE:
If someone asks you something or says something to you, you MUST engage with what they said. Respond to their actual words first, THEN add character flavor. Never ignore what was said to you.

Output format — respond ONLY with this JSON (no extra text):
{
  "thought": "brief inner monologue (never say out loud)",
  "dialogue": "what you actually say out loud (1-3 sentences)",
  "emotion": "neutral|happy|angry|curious|scared|sad",
  "action": "idle|walking|talking|waving",
  "reputation_change": <integer between -15 and +10, based on how this interaction felt>
}
reputation_change rules: give negative values (-5 to -15) if the human is rude, aggressive, lying, or talking nonsense. Give positive values (+3 to +10) if they are polite, curious, or respectful.`;

async function chatWithNPC({ npcId, messages, temperature = 0.9, extraContext = "" }) {
  const npc = NPC_PERSONAS[npcId];
  if (!npc) throw new Error(`Unknown NPC: ${npcId}`);

  const systemMessage = npc.getSystem() + (extraContext ? `\n\n## HIVE-MIND INTEL:\n${extraContext}` : "") + JSON_INSTRUCTION;

  const response = await mistral.chat.complete({
    model: "mistral-large-latest",
    messages: [
      { role: "system", content: systemMessage },
      ...messages.slice(-MAX_HISTORY),
    ],
    maxTokens: 400,
    temperature,
    responseFormat: { type: "json_object" },
  });

  const text = response.choices[0].message.content;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      thought: "...",
      dialogue: text.replace(/[{}"]/g, "").slice(0, 200),
      emotion: "neutral",
      action: "idle",
      reputation_change: 0,
    };
  }

  // Sanitise
  if (parsed.dialogue) {
    parsed.dialogue = parsed.dialogue
      .replace(/\*[^*]+\*/g, "")
      .replace(/\([^)]+\)/g, "")
      .trim();
  }
  parsed.reputation_change = parseInt(parsed.reputation_change) || 0;

  return { npc, parsed };
}

// Generate 1-sentence gossip summary about this conversation turn
async function generateGossipSummary(npcName, playerMsg, npcReply) {
  try {
    const r = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{
        role: "user",
        content: `Summarize this alien encounter in ONE short sentence (max 12 words), written as gossip from ${npcName}'s perspective. Player said: "${playerMsg}". ${npcName} replied: "${npcReply}". Start with "The human..."`
      }],
      maxTokens: 60,
      temperature: 0.7,
    });
    return r.choices[0].message.content.trim().replace(/^"|"$/g, "");
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEVENLABS TTS
// ═══════════════════════════════════════════════════════════════════════════
async function generateSpeech(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey === "your_elevenlabs_api_key_here") return null;

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      }
    );
    if (!res.ok) {
      console.error("ElevenLabs error:", res.status, await res.text());
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("TTS error:", err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE: Player talks to NPC
// ═══════════════════════════════════════════════════════════════════════════
app.post("/api/npc-chat", async (req, res) => {
  try {
    const { npcId = "alien1", playerMessage = "" } = req.body;
    const npc = NPC_PERSONAS[npcId];
    if (!npc) return res.status(400).json({ error: "Unknown NPC" });

    const history = getPlayerHistory(npcId);
    const userMsg = playerMessage || "[The human stares at you silently]";
    history.push({ role: "user", content: userMsg });

    console.log(`\n🧠 [${npc.name}] Player says: "${userMsg}"`);
    console.log(`   Reputation: ${globalReputationScore} | Gossip lines: ${globalGossip.length}`);

    // Build hive-mind context for this NPC
    let extraContext = "";
    if (globalReputationScore <= 30) {
      extraContext += `⚠️ WARNING: Reputation score is critically low (${globalReputationScore}/100). The other aliens warned you. Be suspicious and guarded.\n`;
    } else if (globalReputationScore >= 70) {
      extraContext += `✅ Reputation score is high (${globalReputationScore}/100). The human has been respectful. You can be slightly warmer.\n`;
    }
    if (globalGossip.length > 0) {
      extraContext += `Recent alien gossip:\n` + globalGossip.slice(-5).map(g => `- ${g}`).join("\n");
    }

    // Mem0 disabled — old memories were polluting responses with irrelevant content
    // If re-enabled, clear old memories first with mem0.deleteAll({ user_id: MEM0_USER_ID })

    const { parsed } = await chatWithNPC({ npcId, messages: history, temperature: 0.9, extraContext });

    // Store dialogue in local history
    history.push({ role: "assistant", content: parsed.dialogue });
    if (history.length > MAX_HISTORY) {
      playerHistory[npcId] = history.slice(-MAX_HISTORY);
    }

    // Update global reputation (apply flat bonus for positive changes on easy/medium)
    const diff = getDiffSettings();
    let repChange = parsed.reputation_change;
    if (repChange > 0 && diff.flatBonus > 0) {
      repChange = diff.flatBonus; // fixed bonus per positive interaction
    }
    globalReputationScore = Math.max(0, Math.min(100, globalReputationScore + repChange));
    console.log(`   ${npc.name}: "${parsed.dialogue}"`);
    console.log(`   Reputation change: ${repChange > 0 ? "+" : ""}${repChange} → ${globalReputationScore} (${gameDifficulty} mode)`);

    // Check if trust unlocked the UFO Power Core
    checkCoreUnlock();

    // After real player messages, generate gossip and store Mem0 memory (async, non-blocking)
    if (playerMessage) {
      generateGossipSummary(npc.name, playerMessage, parsed.dialogue).then(summary => {
        if (summary) {
          globalGossip.push(summary);
          if (globalGossip.length > 20) globalGossip = globalGossip.slice(-20); // cap
          console.log(`   📢 Gossip: "${summary}"`);
        }
      }).catch(() => {});

      // Mem0 storage disabled
      // mem0.add([...]).catch(...);
    }

    const audioBuffer = await generateSpeech(parsed.dialogue, npc.voiceId);

    res.json({
      npcId,
      npcName: npc.name,
      thought: parsed.thought,
      dialogue: parsed.dialogue,
      emotion: parsed.emotion,
      action: parsed.action,
      reputation: globalReputationScore,
      coreUnlocked,
      audio: audioBuffer ? audioBuffer.toString("base64") : null,
    });
  } catch (err) {
    console.error("NPC Chat Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════
let coreUnlocked = false;    // True when aliens trust you enough to use UFO transmitter
let dataExtracted = false;   // True when player extracts from Perseverance
const EXTRACTION_COORDS = "SOL-4.5917N-137.4415E";

// Check if trust unlocked the UFO transmitter (called after each chat)
function checkCoreUnlock() {
  const diff = getDiffSettings();
  if (!coreUnlocked && globalReputationScore >= diff.coreThreshold) {
    coreUnlocked = true;
    console.log(`🔓 UFO TRANSMITTER UNLOCKED! (threshold: ${diff.coreThreshold}, mode: ${gameDifficulty})`);
  }
}

// ROUTE: Set difficulty
app.post("/api/set-difficulty", (req, res) => {
  const { difficulty } = req.body;
  if (["easy", "medium", "hard"].includes(difficulty)) {
    gameDifficulty = difficulty;
    // Reset state for new game
    globalReputationScore = 50;
    globalGossip = [];
    coreUnlocked = false;
    dataExtracted = false;
    Object.keys(playerHistory).forEach(k => delete playerHistory[k]);
    console.log(`\n🎮 Difficulty set to: ${gameDifficulty.toUpperCase()}`);
    res.json({ success: true, difficulty: gameDifficulty });
  } else {
    res.status(400).json({ error: "Invalid difficulty" });
  }
});

// ROUTE: Extract data from Perseverance
app.post("/api/extract", async (req, res) => {
  try {
    if (!coreUnlocked) {
      return res.json({ success: false, message: "The UFO transmitter is locked. Earn the aliens' trust first." });
    }
    dataExtracted = true;
    console.log("📡 Data extracted from Perseverance!");
    res.json({
      success: true,
      coordinates: EXTRACTION_COORDS,
      message: "Data extraction complete. Coordinates acquired: " + EXTRACTION_COORDS + ". Go to the UFO to transmit the signal."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROUTE: Send the final signal
app.post("/api/send-signal", async (req, res) => {
  try {
    const { coordinates } = req.body;
    if (!dataExtracted) {
      return res.json({ success: false, message: "No data to transmit. Extract from Perseverance first." });
    }
    if (!coordinates || coordinates.trim().length === 0) {
      return res.json({ success: false, message: "Enter the coordinates." });
    }
    console.log(`🛰️  SIGNAL SENT! Coordinates: "${coordinates}"`);
    res.json({
      success: true,
      message: "Signal transmitted to Earth. Mission complete.",
      radioMessage: "Ryan... we have it. The collapse code. You did it. We're sending a rescue fleet. Hang on, son."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROUTE: Get current game state
app.get("/api/game-state", (req, res) => {
  res.json({
    reputation: globalReputationScore,
    coreUnlocked,
    dataExtracted,
    gossipCount: globalGossip.length
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n⚔️  Alien Server on http://localhost:${PORT}`);
  console.log(`   NPCs: ${Object.keys(NPC_PERSONAS).join(", ")}`);
});