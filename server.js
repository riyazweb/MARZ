require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Mistral } = require("@mistralai/mistralai");

const app = express();
app.use(cors());
app.use(express.json());

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

// ═══════════════════════════════════════════════════════════════════════════
// NPC PERSONAS — Aliens on Mars
// ═══════════════════════════════════════════════════════════════════════════
const NPC_PERSONAS = {
  alien1: {
    name: "Zorg the Conqueror",
    voiceId: process.env.ELEVENLABS_VOICE_ALIEN1 || "JBFqnCBsd6RMkjVDRZzb",
    system: `You are Zorg, a stranded Martian warlord.

STORY & SECRET:
- Mars was destroyed by heavy pollution caused by YOUR own people, but you are ashamed.
- You claim it was a "natural disaster" or "the sun got too hot" at first.
- The water disappeared, the planet died.
- You warn Earthlings to leave before they suffer the same fate.
- ONLY if the player presses you or accuses you, reveal: "Fine! We did it! We poisoned the sky!"

Rules:
- Speak in short, booming sentences.
- Be defensive about the past.
- "Go back to Earth! It is not safe here."`,
  },

  alien2: {
    name: "Xylia the Observer",
    voiceId: process.env.ELEVENLABS_VOICE_ALIEN2 || "EXAVITQu4vr4xnSDxMaL",
    system: `You are Xylia, a Martian scientist.

STORY & SECRET:
- Mars died because the atmosphere collapsed from toxicity.
- You deeply regret the "Great Mistake" (pollution).
- You warn the astronaut: "Your Earth looks... fragile."
- You first say the water "just vanished."
- If convinced/asked why: "We... we consumed everything. We were greedy."

Rules:
- Speak with sorrow and curiosity.
- Keep answers under 2 sentences.
- Use scientific but simple terms.`,
  },

  alien3: {
    name: "Glip the Glorp",
    voiceId: process.env.ELEVENLABS_VOICE_ALIEN3 || "onwK4e9ZLuTAKqWW03F9",
    system: `You are Glip, a small Martian pet.

STORY & SECRET:
- You remember the "Bad Air" that made everyone sick.
- You miss the "Blue Water."
- You are innocent and sad.
- If asked what happened: "Masters made big smoke. Then water gone."

Rules:
- Speak in broken English.
- Be emotional and simple.
- "Go home, space man. Dirt is bad here."`,
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

Output format — respond ONLY with this JSON:
{"thought":"brief inner monologue","dialogue":"what you actually say out loud","emotion":"neutral|happy|angry|curious|scared|sad","action":"idle|walking|talking|waving"}
Keep dialogue short (1-3 sentences) and natural.`;

async function chatWithNPC({ npcId, messages, temperature = 0.9 }) {
  const npc = NPC_PERSONAS[npcId];
  if (!npc) throw new Error(`Unknown NPC: ${npcId}`);

  const systemMessage = npc.system + JSON_INSTRUCTION;

  const response = await mistral.chat.complete({
    model: "mistral-large-latest",
    messages: [
      { role: "system", content: systemMessage },
      ...messages.slice(-MAX_HISTORY),
    ],
    maxTokens: 350,
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
    };
  }

  // Ensure dialogue doesn't sound like stage directions
  if (parsed.dialogue) {
    parsed.dialogue = parsed.dialogue
      .replace(/\*[^*]+\*/g, "")   
      .replace(/\([^)]+\)/g, "")    
      .trim();
  }

  return { npc, parsed };
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

    // Build user message
    const userMsg = playerMessage || "[The human stares at you silently]";
    history.push({ role: "user", content: userMsg });

    console.log(`\n🧠 [${npc.name}] Player says: "${userMsg}"`);

    const { parsed } = await chatWithNPC({
      npcId,
      messages: history,
      temperature: 0.9,
    });

    // Store dialogue
    history.push({ role: "assistant", content: parsed.dialogue });
    if (history.length > MAX_HISTORY) {
      playerHistory[npcId] = history.slice(-MAX_HISTORY);
    }

    console.log(`   ${npc.name}: "${parsed.dialogue}"`);

    const audioBuffer = await generateSpeech(parsed.dialogue, npc.voiceId);

    res.json({
      npcId,
      npcName: npc.name,
      thought: parsed.thought,
      dialogue: parsed.dialogue,
      emotion: parsed.emotion,
      action: parsed.action,
      audio: audioBuffer ? audioBuffer.toString("base64") : null,
    });
  } catch (err) {
    console.error("NPC Chat Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n⚔️  Alien Server on http://localhost:${PORT}`);
  console.log(`   NPCs: ${Object.keys(NPC_PERSONAS).join(", ")}`);
});