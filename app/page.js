"use client";

import { useEffect, useRef, useState } from "react";

const starterMessage = {
  id: "starter-message",
  role: "assistant",
  content: "Halo Glass AI on valmis. Sano komento tai kirjoita viesti.",
};

const quickPrompts = [
  "Halo, katso tätä",
  "Halo, mitä tässä lukee",
  "Halo, käännä tämä",
  "Halo, muista tämä: tykkään älylaseista",
  "Halo, mitä muistat minusta?",
  "Halo, lue vastaus",
  "Halo, tila vision",
];

const WAKE_WORDS = ["halo", "agentti", "assistant"];

function supportsSpeechRecognition() {
  return (
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

function speak(text, onStart, onEnd) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(String(text || ""));
  utterance.lang = "fi-FI";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

function makeId(prefix = "msg") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMessages(list) {
  if (!Array.isArray(list) || !list.length) return [starterMessage];

  return list.map((message, index) => ({
    id: message?.id || makeId(`msg-${index}`),
    role: message?.role === "user" ? "user" : "assistant",
    content: String(message?.content || ""),
  }));
}

function cleanMessages(list) {
  return (Array.isArray(list) ? list : [])
    .map((message) => ({
      role: message?.role === "user" ? "user" : "assistant",
      content: String(message?.content || "").trim(),
    }))
    .filter((message) => message.content.length > 0);
}

function averageDiff(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += Math.abs(a[i] - b[i]);
  }

  return total / a.length;
}

function stripWakeWord(text) {
  const clean = String(text || "").trim();
  const lower = clean.toLowerCase();

  for (const word of WAKE_WORDS) {
    if (lower.startsWith(`${word},`)) return clean.slice(word.length + 1).trim();
    if (lower.startsWith(`${word} `)) return clean.slice(word.length).trim();
    if (lower === word) return "";
  }

  return clean;
}

function createMemoryItem(text, type = "fact", source = "manual") {
  const clean = normalizeText(text);
  if (!clean) return null;

  return {
    id: makeId("mem"),
    text: clean,
    type,
    source,
    createdAt: new Date().toISOString(),
  };
}

function normalizeMemory(list = []) {
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      if (typeof item === "string") {
        return createMemoryItem(item, "fact", "legacy");
      }

      const text = normalizeText(item?.text);
      if (!text) return null;

      return {
        id: item?.id || makeId("mem"),
        text,
        type: item?.type || "fact",
        source: item?.source || "manual",
        createdAt: item?.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function mergeMemory(...lists) {
  const seen = new Set();
  const out = [];

  for (const list of lists) {
    for (const item of normalizeMemory(list)) {
      const key = item.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  return out.slice(-60);
}

function memoryToText(memory = []) {
  const items = normalizeMemory(memory);
  if (!items.length) return "Ei tallennettuja muistoja.";

  return items
    .map((item, index) => `${index + 1}. ${item.text} [${item.type}]`)
    .join("\n");
}

function extractMemoryCandidates(text) {
  const clean = normalizeText(text);
  if (!clean) return [];

  const result = [];

  const explicit = clean.match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);
  if (explicit?.[2]) {
    result.push(createMemoryItem(explicit[2], "fact", "explicit"));
    return result;
  }

  const patterns = [
    /^tykkään\s+(.+)$/i,
    /^pidän\s+(.+)$/i,
    /^en tykkää\s+(.+)$/i,
    /^olen\s+(.+)$/i,
    /^minun nimeni on\s+(.+)$/i,
    /^mun nimi on\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      result.push(createMemoryItem(match[1], "preference", "auto"));
      break;
    }
  }

  return result;
}

function parseVoiceCommand(text) {
  const clean = String(text || "").trim();

  const memoryMatch = clean.match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);
  if (memoryMatch?.[2]) {
    return { type: "remember", value: memoryMatch[2].trim() };
  }

  if (/(näytä muisti|mitä muistat|minun muisti)/i.test(clean)) {
    return { type: "show_memory" };
  }

  if (/(tyhjennä muisti|unohda kaikki)/i.test(clean)) {
    return { type: "clear_memory" };
  }

  if (/(sammuta kamera|lopeta kamera|kamera pois)/i.test(clean)) {
    return { type: "vision_off" };
  }

  if (/(avaa kamera|kamera päälle|vision päälle|katso ympärille)/i.test(clean)) {
    return { type: "vision_on" };
  }

  if (/(katso ja kysy)/i.test(clean)) {
    return {
      type: "vision_task",
      visionTask: "question",
      instruction: "Vastaa käyttäjän kysymykseen kameran näkymän perusteella.",
      mode: "vision",
    };
  }

  if (/(mitä tässä lukee|lue teksti|lue tämä)/i.test(clean)) {
    return {
      type: "vision_task",
      visionTask: "read_text",
      instruction: "Lue kuvassa näkyvä teksti.",
      mode: "vision",
    };
  }

  if (/(käännä tämä|käännä se|translate)/i.test(clean)) {
    return {
      type: "vision_task",
      visionTask: "translate",
      instruction: "Käännä kuvassa näkyvä teksti suomeksi.",
      mode: "translate",
    };
  }

  if (/(mitä näet|mitä tässä on|mikä tämä on|katso tätä)/i.test(clean)) {
    return {
      type: "vision_task",
      visionTask: "summary",
      instruction: "Tee lyhyt yhteenveto siitä mitä kuvassa näkyy.",
      mode: "vision",
    };
  }

  if (/(mitä esineitä|mitä objekteja|mitä näkyy ympärillä|näe ympäristö)/i.test(clean)) {
    return {
      type: "vision_task",
      visionTask: "objects",
      instruction: "Tunnista näkyvät tärkeimmät esineet tai objektit lyhyesti.",
      mode: "vision",
    };
  }

  if (/(tallenna havainto|muista näkymä|muista tämä näkymä)/i.test(clean)) {
    return {
      type: "vision_task",
      visionTask: "memory",
      instruction: "Tallenna vain tärkeä havainto tästä näkymästä.",
      mode: "vision",
    };
  }

  if (/(lue vastaus|toista vastaus)/i.test(clean)) {
    return { type: "readout" };
  }

  if (/(tila\s+ask|mode ask)/i.test(clean)) return { type: "mode", mode: "ask" };
  if (/(tila\s+vision|mode vision)/i.test(clean)) return { type: "mode", mode: "vision" };
  if (/(tila\s+käännä|mode translate)/i.test(clean)) return { type: "mode", mode: "translate" };
  if (/(tila\s+muisti|mode memory)/i.test(clean)) return { type: "mode", mode: "memory" };
  if (/(tila\s+ääni|mode readout)/i.test(clean)) return { type: "mode", mode: "readout" };

  if (/(battery saver|säästötila|akku säästö)/i.test(clean)) {
    return { type: "battery_toggle" };
  }

  return { type: "chat", text: clean, mode: "ask" };
}

function getVisionPreset(modeValue) {
  switch (modeValue) {
    case "translate":
      return {
        visionTask: "translate",
        instruction: "Käännä kuvassa näkyvä teksti suomeksi.",
      };
    case "vision":
      return {
        visionTask: "summary",
        instruction: "Tee lyhyt yhteenveto siitä mitä näet.",
      };
    case "ask":
    default:
      return {
        visionTask: "question",
        instruction: "Kerro mitä näet ja vastaa käyttäjän mahdolliseen kysymykseen.",
      };
  }
}

export default function Page() {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [memoryList, setMemoryList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Valmis");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [wakeWordMode, setWakeWordMode] = useState(true);
  const [visionMode, setVisionMode] = useState(false);
  const [batterySaver, setBatterySaver] = useState(false);
  const [glassMode, setGlassMode] = useState(true);
  const [mode, setMode] = useState("ask");
  const [liveVision, setLiveVision] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [visionMotion, setVisionMotion] = useState("0.0");
  const [sessionId, setSessionId] = useState("");

  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const visionTimerRef = useRef(null);
  const visionBusyRef = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const handleVoiceInputRef = useRef(null);
  const analyzeVisionRef = useRef(null);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const loadingRef = useRef(false);
  const modeRef = useRef("ask");
  const batterySaverRef = useRef(false);
  const liveVisionRef = useRef("");
  const memoryRef = useRef([]);
  const sessionIdRef = useRef("");
  const lastFingerprintRef = useRef(null);

  useEffect(() => {
    const savedMessages = localStorage.getItem("glass-pro-chat");
    const savedMemory = localStorage.getItem("glass-pro-memory-v5");
    const savedSettings = localStorage.getItem("glass-pro-settings");
    const savedVision = localStorage.getItem("glass-pro-vision");
    const savedSessionId = localStorage.getItem("glass-pro-session-id");
    const savedMode = localStorage.getItem("glass-pro-mode");

    if (savedMessages) {
      try {
        setMessages(normalizeMessages(JSON.parse(savedMessages)));
      } catch {
        localStorage.removeItem("glass-pro-chat");
      }
    }

    if (savedMemory) {
      try {
        const parsed = JSON.parse(savedMemory);
        setMemoryList(Array.isArray(parsed) ? normalizeMemory(parsed) : []);
      } catch {
        localStorage.removeItem("glass-pro-memory-v5");
      }
    }

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.autoSpeak === "boolean") setAutoSpeak(parsed.autoSpeak);
        if (typeof parsed.autoListen === "boolean") setAutoListen(parsed.autoListen);
        if (typeof parsed.wakeWordMode === "boolean") setWakeWordMode(parsed.wakeWordMode);
        if (typeof parsed.visionMode === "boolean") setVisionMode(parsed.visionMode);
        if (typeof parsed.batterySaver === "boolean") setBatterySaver(parsed.batterySaver);
        if (typeof parsed.glassMode === "boolean") setGlassMode(parsed.glassMode);
      } catch {
        localStorage.removeItem("glass-pro-settings");
      }
    }

    if (savedVision) setLiveVision(savedVision);
    if (savedMode) setMode(savedMode);

    if (savedSessionId) {
      setSessionId(savedSessionId);
      sessionIdRef.current = savedSessionId;
    } else {
      const nextSessionId = makeId("session");
      setSessionId(nextSessionId);
      sessionIdRef.current = nextSessionId;
      localStorage.setItem("glass-pro-session-id", nextSessionId);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("glass-pro-chat", JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("glass-pro-memory-v5", JSON.stringify(memoryList));
  }, [memoryList]);

  useEffect(() => {
    localStorage.setItem("glass-pro-vision", liveVision);
    liveVisionRef.current = liveVision;
  }, [liveVision]);

  useEffect(() => {
    localStorage.setItem("glass-pro-mode", mode);
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(
      "glass-pro-settings",
      JSON.stringify({
        autoSpeak,
        autoListen,
        wakeWordMode,
        visionMode,
        batterySaver,
        glassMode,
      })
    );
  }, [autoSpeak, autoListen, wakeWordMode, visionMode, batterySaver, glassMode]);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("glass-pro-session-id", sessionId);
      sessionIdRef.current = sessionId;
    }
  }, [sessionId]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    batterySaverRef.current = batterySaver;
  }, [batterySaver]);

  useEffect(() => {
    memoryRef.current = memoryList;
  }, [memoryList]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    handleVoiceInputRef.current = handleVoiceInput;
    analyzeVisionRef.current = analyzeVision;
  });

  useEffect(() => {
    if (!supportsSpeechRecognition()) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = "fi-FI";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      stopRequestedRef.current = false;
      listeningRef.current = true;
      setListening(true);
      setStatus("Kuuntelen...");
    };

    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
      setStatus("Valmis");

      if (
        autoListen &&
        !stopRequestedRef.current &&
        !speakingRef.current &&
        !loadingRef.current
      ) {
        window.setTimeout(() => {
          tryStartListening();
        }, batterySaverRef.current ? 1000 : 300);
      }
    };

    recognition.onerror = () => {
      listeningRef.current = false;
      setListening(false);
      setStatus("Puhevirhe");

      if (autoListen && !stopRequestedRef.current && !speakingRef.current) {
        window.setTimeout(() => {
          tryStartListening();
        }, batterySaverRef.current ? 1300 : 450);
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      const clean = String(transcript).trim();
      if (!clean) return;

      const stripped = wakeWordMode ? stripWakeWord(clean) : clean;
      if (!stripped) return;

      handleVoiceInputRef.current?.(stripped);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, [autoListen, wakeWordMode]);

  useEffect(() => {
    if (!visionMode) {
      stopCamera();

      if (visionTimerRef.current) {
        window.clearInterval(visionTimerRef.current);
        visionTimerRef.current = null;
      }

      lastFingerprintRef.current = null;
      setVisionMotion("0.0");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await startCamera();
        if (cancelled) return;

        const preset = getVisionPreset(modeRef.current);

        await analyzeVisionRef.current?.({
          force: true,
          announce: false,
          visionTask: preset.visionTask,
          instruction: preset.instruction,
        });

        const interval = batterySaverRef.current ? 6000 : 1800;

        visionTimerRef.current = window.setInterval(() => {
          const currentPreset = getVisionPreset(modeRef.current);

          analyzeVisionRef.current?.({
            force: false,
            announce: false,
            visionTask: currentPreset.visionTask,
            instruction: currentPreset.instruction,
          });
        }, interval);
      } catch (error) {
        setCameraError(error?.message || "Kamera ei käynnistynyt");
        setStatus("Kamera virhe");
        setVisionMode(false);
      }
    })();

    return () => {
      cancelled = true;

      if (visionTimerRef.current) {
        window.clearInterval(visionTimerRef.current);
        visionTimerRef.current = null;
      }

      stopCamera();
    };
  }, [visionMode, batterySaver]);

  function ensureSessionId() {
    if (sessionIdRef.current) return sessionIdRef.current;

    const nextSessionId = makeId("session");
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
    localStorage.setItem("glass-pro-session-id", nextSessionId);

    return nextSessionId;
  }

  function stopListeningIfActive({ permanent = false } = {}) {
    if (recognitionRef.current && listeningRef.current) {
      if (permanent) stopRequestedRef.current = true;

      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }

  function speakReply(text) {
    const reply = String(text || "").trim();
    if (!reply) return;

    speakingRef.current = true;
    setSpeaking(true);
    stopListeningIfActive({ permanent: false });

    speak(
      reply,
      () => {},
      () => {
        speakingRef.current = false;
        setSpeaking(false);

        if (autoListen && !stopRequestedRef.current) {
          window.setTimeout(() => {
            tryStartListening();
          }, batterySaverRef.current ? 1100 : 350);
        }
      }
    );
  }

  function toggleBatterySaver(nextValue) {
    const next =
      typeof nextValue === "boolean" ? nextValue : !batterySaverRef.current;

    batterySaverRef.current = next;
    setBatterySaver(next);
  }

  function applyMode(nextMode) {
    setMode(nextMode);

    if (nextMode === "vision" || nextMode === "translate") {
      setVisionMode(true);
    } else {
      setVisionMode(false);
    }
  }

  function showMemory() {
    const text = memoryRef.current.length
      ? memoryToText(memoryRef.current)
      : "Muisti on tyhjä.";

    setMessages((prev) => [
      ...prev,
      { id: makeId("assistant"), role: "assistant", content: text },
    ]);

    if (autoSpeak) speakReply(text);
  }

  function clearLocalMemory() {
    memoryRef.current = [];
    setMemoryList([]);
    localStorage.removeItem("glass-pro-memory-v5");
  }

  function clearChat() {
    setMessages([starterMessage]);
    localStorage.removeItem("glass-pro-chat");
  }

  function scheduleVisionTask({
    visionTask = "describe",
    instruction = "",
    mode: nextMode = "vision",
    announce = true,
    delay = 1000,
  } = {}) {
    setVisionMode(true);
    setMode(nextMode);

    window.setTimeout(() => {
      analyzeVisionRef.current?.({
        force: true,
        announce,
        visionTask,
        instruction,
      });
    }, delay);
  }

  async function startCamera() {
    if (cameraStreamRef.current) return cameraStreamRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Kameraa ei tueta tässä selaimessa.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: batterySaverRef.current ? 640 : 1280 },
        height: { ideal: batterySaverRef.current ? 360 : 720 },
      },
      audio: false,
    });

    cameraStreamRef.current = stream;

    const video = videoRef.current;
    if (!video) throw new Error("Videonäkymää ei löytynyt.");

    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    await video.play();
    setCameraError("");
    setStatus("Kamera päällä");

    return stream;
  }

  function stopCamera() {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }

  async function captureFrameAndFingerprint() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      throw new Error("Kamera ei ole valmis.");
    }

    const maxWidth = batterySaverRef.current ? 220 : 320;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(160, Math.round(video.videoWidth * scale));
    const height = Math.max(90, Math.round(video.videoHeight * scale));

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas ei toimi.");

    ctx.drawImage(video, 0, 0, width, height);

    const image = canvas.toDataURL("image/jpeg", batterySaverRef.current ? 0.55 : 0.72);
    const pixels = ctx.getImageData(0, 0, width, height).data;

    const cols = 8;
    const rows = 8;
    const fingerprint = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const xStart = Math.floor((col * width) / cols);
        const xEnd = Math.max(xStart + 1, Math.floor(((col + 1) * width) / cols));
        const yStart = Math.floor((row * height) / rows);
        const yEnd = Math.max(yStart + 1, Math.floor(((row + 1) * height) / rows));

        let sum = 0;
        let count = 0;

        for (let y = yStart; y < yEnd; y += 2) {
          for (let x = xStart; x < xEnd; x += 2) {
            const index = (y * width + x) * 4;
            const luma = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
            sum += luma;
            count += 1;
          }
        }

        fingerprint.push(count ? sum / count : 0);
      }
    }

    return { image, fingerprint };
  }

  async function analyzeVision({
    force = false,
    announce = false,
    visionTask = "describe",
    instruction = "",
  } = {}) {
    if ((!visionMode && !force) || visionBusyRef.current || !cameraStreamRef.current) return;

    visionBusyRef.current = true;
    setStatus("Analysoi kuvaa...");

    try {
      const { image, fingerprint } = await captureFrameAndFingerprint();
      const prevFingerprint = lastFingerprintRef.current;
      const diff = prevFingerprint ? averageDiff(prevFingerprint, fingerprint) : Infinity;

      setVisionMotion(Number.isFinite(diff) ? diff.toFixed(1) : "0.0");

      const motionThreshold = batterySaverRef.current ? 8.0 : 5.5;
      if (!force && Number.isFinite(diff) && diff < motionThreshold) {
        setStatus("Vision idle");
        return;
      }

      lastFingerprintRef.current = fingerprint;

      const activeSessionId = ensureSessionId();
      const response = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          memory: memoryRef.current.map((item) => item.text),
          visionContext: liveVisionRef.current,
          sessionId: activeSessionId,
          visionTask,
          instruction,
          mode: modeRef.current,
          batterySaver: batterySaverRef.current,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Vision-virhe");

      const reply = String(data.reply || "").trim();

      if (!reply) {
        setStatus("Ei vastausta");
        return;
      }

      if (reply === liveVisionRef.current) {
        setStatus("Sama näkymä, ei päivitystä");
        return;
      }

      liveVisionRef.current = reply;
      setLiveVision(reply);
      setStatus("Kuva analysoitu");

      if (announce && autoSpeak) {
        speakReply(reply);
      }
    } catch (error) {
      setCameraError(error?.message || "Vision-analyysi epäonnistui");
      setStatus("Vision virhe");
    } finally {
      visionBusyRef.current = false;
    }
  }

  function tryStartListening() {
    if (!recognitionRef.current || listeningRef.current) return;

    stopRequestedRef.current = false;

    try {
      recognitionRef.current.start();
    } catch {}
  }

  function toggleListening() {
    if (!recognitionRef.current) {
      setStatus("Puheentunnistus ei ole tuettu");
      return;
    }

    if (listeningRef.current) {
      stopRequestedRef.current = true;

      try {
        recognitionRef.current.stop();
      } catch {}
      return;
    }

    tryStartListening();
  }

  function extractExplicitMemoryText(text) {
    const match = String(text || "")
      .trim()
      .match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);

    return match?.[2]?.trim() || "";
  }

  async function sendMessage(text, explicitMode = modeRef.current) {
    const clean = String(text || "").trim();
    if (!clean || loadingRef.current) return;

    const explicitMemoryText = extractExplicitMemoryText(clean);
    if (explicitMemoryText) {
      const item = createMemoryItem(explicitMemoryText, "fact", "explicit");
      if (item) {
        const nextMemory = mergeMemory(memoryRef.current, [item]);
        memoryRef.current = nextMemory;
        setMemoryList(nextMemory);
      }

      const reply = `Muistin tämän: ${explicitMemoryText}`;
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content: clean },
        { id: makeId("assistant"), role: "assistant", content: reply },
      ]);

      if (autoSpeak) speakReply(reply);
      setInput("");
      return;
    }

    const autoCandidates = extractMemoryCandidates(clean);
    if (autoCandidates.length) {
      const nextMemory = mergeMemory(memoryRef.current, autoCandidates);
      memoryRef.current = nextMemory;
      setMemoryList(nextMemory);
    }

    const userMessage = { id: makeId("user"), role: "user", content: clean };
    const assistantId = makeId("assistant");
    const nextMessages = [...messages.slice(-12), userMessage];

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: "assistant", content: "Ajattelen..." },
    ]);

    setInput("");
    setLoading(true);
    setStatus("Ajattelen...");

    try {
      const activeSessionId = ensureSessionId();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          messages: nextMessages,
          memory: memoryRef.current.map((item) => item.text),
          visionContext: liveVisionRef.current,
          mode: explicitMode,
          batterySaver: batterySaverRef.current,
          autoSpeak,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Palvelinvirhe");

      const reply = String(data.reply || "Ei vastausta.").trim();

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content: reply } : message
        )
      );

      setStatus("Valmis");

      if (autoSpeak && data.autoSpeak !== false) {
        speakReply(reply);
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: `Virhe: ${error.message}` }
            : message
        )
      );
      setStatus("Virhe");
    } finally {
      setLoading(false);
    }
  }

  async function handleVoiceInput(text) {
    const command = parseVoiceCommand(text);

    if (command.type === "remember" && command.value) {
      const item = createMemoryItem(command.value, "fact", "explicit");
      if (item) {
        const nextMemory = mergeMemory(memoryRef.current, [item]);
        memoryRef.current = nextMemory;
        setMemoryList(nextMemory);
      }

      const reply = `Muistin tämän: ${command.value}`;
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content: text },
        { id: makeId("assistant"), role: "assistant", content: reply },
      ]);

      if (autoSpeak) speakReply(reply);
      return;
    }

    if (command.type === "show_memory") {
      const textToShow = memoryRef.current.length
        ? memoryToText(memoryRef.current)
        : "Muisti on tyhjä.";

      setMessages((prev) => [
        ...prev,
        { id: makeId("assistant"), role: "assistant", content: textToShow },
      ]);

      if (autoSpeak) speakReply(textToShow);
      return;
    }

    if (command.type === "clear_memory") {
      clearLocalMemory();

      const reply = "Muisti tyhjennetty.";
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content: text },
        { id: makeId("assistant"), role: "assistant", content: reply },
      ]);

      if (autoSpeak) speakReply(reply);
      return;
    }

    if (command.type === "battery_toggle") {
      const next = !batterySaverRef.current;
      toggleBatterySaver(next);

      const reply = `Battery saver ${next ? "päällä" : "pois"}.`;
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content: text },
        { id: makeId("assistant"), role: "assistant", content: reply },
      ]);

      if (autoSpeak) speakReply(reply);
      return;
    }

    if (command.type === "vision_off") {
      setVisionMode(false);
      setMode("ask");
      if (autoSpeak) speakReply("Kamera pois.");
      return;
    }

    if (command.type === "vision_on") {
      setVisionMode(true);
      setMode("vision");
      if (autoSpeak) speakReply("Kamera päällä.");
      return;
    }

    if (command.type === "vision_task") {
      setVisionMode(true);
      setMode(command.mode || "vision");

      scheduleVisionTask({
        visionTask: command.visionTask,
        instruction: command.instruction,
        mode: command.mode || "vision",
        announce: true,
        delay: batterySaverRef.current ? 1000 : 1200,
      });

      return;
    }

    if (command.type === "readout") {
      speakReply(messages.slice().reverse().find((m) => m.role === "assistant")?.content || "");
      return;
    }

    if (command.type === "mode") {
      applyMode(command.mode || "ask");
      if (autoSpeak) speakReply(`Tila asetettu: ${command.mode || "ask"}`);
      return;
    }

    await sendMessage(text, command.mode || modeRef.current);
  }

  function triggerLookAndAsk() {
    scheduleVisionTask({
      visionTask: "question",
      instruction: "Kerro mitä näet ja vastaa käyttäjän mahdolliseen kysymykseen.",
      mode: "vision",
      announce: true,
      delay: batterySaverRef.current ? 900 : 1100,
    });
  }

  const lastAssistantText =
    messages
      .slice()
      .reverse()
      .find((message) => message.role === "assistant")?.content || "";

  const batteryText = batterySaver ? "Päällä" : "Pois";

  return (
    <main className={glassMode ? "shell shell--glass" : "shell"}>
      <div className="glow glow--left" />
      <div className="glow glow--right" />

      <section className="frame">
        <header className="topbar">
          <div className="brand">
            <span className="brand__dot" />
            <div>
              <div className="brand__title">HALO GLASS AI</div>
              <div className="brand__sub">voice commands · memory · battery saver</div>
            </div>
          </div>

          <div className="pills">
            <span className="pill">{status}</span>
            <span className="pill">Mode {mode}</span>
            <span className="pill">{loading ? "Ajattelee" : "Valmis"}</span>
            <span className="pill">{listening ? "Kuuntelee" : "Hiljaa"}</span>
            <span className="pill">{speaking ? "Puhuu" : "Ei puhetta"}</span>
            <span className="pill">Vision {visionMode ? "Päällä" : "Pois"}</span>
            <span className="pill">Battery {batteryText}</span>
          </div>
        </header>

        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Smart glasses UI</p>
            <h1>AI-agentti, joka kuulee, näkee ja vastaa nopeasti</h1>
            <p className="lead">
              Puhu komento, käytä kameraa, vaihda toimintotilaa ja näe lyhyt AR-tyylinen overlay.
            </p>
          </div>

          <div className="actions">
            <button className="button button--soft" onClick={toggleListening}>
              {listening ? "Lopeta kuuntelu" : "Puhu"}
            </button>
            <button className="button button--soft" onClick={() => speakReply(lastAssistantText)}>
              Lue vastaus
            </button>
            <button className="button button--ghost" onClick={() => setAutoSpeak((v) => !v)}>
              Autoääni: {autoSpeak ? "Päällä" : "Pois"}
            </button>
            <button className="button button--ghost" onClick={() => setAutoListen((v) => !v)}>
              Auto kuuntelu: {autoListen ? "Päällä" : "Pois"}
            </button>
            <button className="button button--ghost" onClick={() => setWakeWordMode((v) => !v)}>
              Wake word: {wakeWordMode ? "Päällä" : "Pois"}
            </button>
            <button className="button button--ghost" onClick={() => setGlassMode((v) => !v)}>
              Glass mode: {glassMode ? "Päällä" : "Pois"}
            </button>
            <button className="button button--ghost" onClick={triggerLookAndAsk}>
              Katso ja kysy
            </button>
            <button className="button button--ghost" onClick={() => toggleBatterySaver()}>
              Battery saver: {batteryText}
            </button>
            <button className="button button--ghost" onClick={() => applyMode("ask")}>
              Tila ask
            </button>
            <button className="button button--ghost" onClick={() => applyMode("vision")}>
              Tila vision
            </button>
            <button className="button button--ghost" onClick={() => applyMode("translate")}>
              Tila käännä
            </button>
            <button className="button button--ghost" onClick={showMemory}>
              Näytä muisti
            </button>
            <button className="button button--ghost" onClick={clearLocalMemory}>
              Tyhjennä muisti
            </button>
            <button className="button button--ghost" onClick={clearChat}>
              Tyhjennä chat
            </button>
          </div>
        </section>

        {visionMode && (
          <section className="vision">
            <video ref={videoRef} className="vision__video" autoPlay muted playsInline />
            <div className="vision__top">
              {cameraError
                ? cameraError
                : `Kamera analysoi kuvaa • liike ${visionMotion} • ${batteryText}`}
            </div>
            <div className="vision__bottom">
              <div className="vision__label">LIVE VISIO</div>
              <div className="vision__text">{liveVision || "Ei analyysiä vielä"}</div>
            </div>
          </section>
        )}

        <section className="quick">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              className="quick__chip"
              onClick={() => handleVoiceInput(prompt.replace(/^Halo,\s*/i, ""))}
              disabled={loading}
            >
              {prompt}
            </button>
          ))}
        </section>

        <section className="chat">
          <div className="chat__header">
            <span>Keskustelu</span>
            <span>{messages.length} viestiä</span>
          </div>

          <div className="chat__log">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user" ? "bubble bubble--user" : "bubble bubble--ai"
                }
              >
                <div className="bubble__tag">
                  {message.role === "user" ? "SINÄ" : "AI"}
                </div>
                <div className="bubble__text">{message.content}</div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Kirjoita tai käytä puhetta..."
              rows={3}
            />

            <div className="composer__row">
              <button type="button" className="button button--soft" onClick={toggleListening}>
                {listening ? "Kuuntelu päällä" : "Mikrofoni"}
              </button>
              <button type="submit" className="button button--primary" disabled={loading}>
                Lähetä
              </button>
              <button
                type="button"
                className="button button--soft"
                onClick={() =>
                  scheduleVisionTask({
                    visionTask: "question",
                    instruction: "Kerro mitä näet ja vastaa käyttäjän mahdolliseen kysymykseen.",
                    mode: "vision",
                    announce: true,
                    delay: 250,
                  })
                }
              >
                Analysoi nyt
              </button>
            </div>
          </form>

          <canvas ref={canvasRef} style={{ display: "none" }} />
        </section>
      </section>

      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          min-height: 100%;
          background:
            radial-gradient(circle at top, rgba(99, 102, 241, 0.18), transparent 30%),
            radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.12), transparent 28%),
            linear-gradient(180deg, #050816 0%, #0b1020 100%);
          color: #ecf2ff;
          font-family:
            Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        button,
        textarea {
          font: inherit;
        }

        .shell {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          padding: 16px;
        }

        .shell--glass {
          opacity: 0.98;
        }

        .glow {
          position: absolute;
          width: 42vw;
          height: 42vw;
          max-width: 560px;
          max-height: 560px;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.24;
          pointer-events: none;
        }

        .glow--left {
          left: -12vw;
          top: -10vw;
          background: rgba(59, 130, 246, 0.6);
        }

        .glow--right {
          right: -12vw;
          bottom: -10vw;
          background: rgba(168, 85, 247, 0.55);
        }

        .frame {
          position: relative;
          z-index: 1;
          width: min(980px, 100%);
          margin: 0 auto;
          min-height: calc(100vh - 32px);
          display: grid;
          grid-template-rows: auto auto auto 1fr;
          gap: 14px;
        }

        .topbar,
        .hero,
        .chat {
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(10, 15, 30, 0.68);
          backdrop-filter: blur(18px);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
        }

        .topbar {
          border-radius: 24px;
          padding: 14px;
          display: grid;
          gap: 14px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand__dot {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #60a5fa, #a78bfa);
          box-shadow: 0 0 18px rgba(96, 165, 250, 0.8);
          flex: 0 0 auto;
        }

        .brand__title {
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.14em;
        }

        .brand__sub {
          margin-top: 2px;
          font-size: 0.84rem;
          color: #aab6d3;
        }

        .pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pill {
          padding: 8px 11px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #dbe7ff;
          font-size: 0.82rem;
        }

        .hero {
          border-radius: 24px;
          padding: 18px;
          display: grid;
          gap: 16px;
        }

        .eyebrow {
          margin: 0 0 10px;
          color: #8bb4ff;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 0.78rem;
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(1.65rem, 4.8vw, 3.3rem);
          line-height: 1.04;
          max-width: 13ch;
        }

        .lead {
          margin: 12px 0 0;
          max-width: 60ch;
          color: #c5d0ea;
          line-height: 1.55;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .quick {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .quick__chip {
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.06);
          color: #eff4ff;
          border-radius: 18px;
          padding: 13px 14px;
          min-height: 62px;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            opacity 0.15s ease;
          line-height: 1.3;
        }

        .quick__chip:hover,
        .button:hover {
          transform: translateY(-1px);
        }

        .quick__chip:disabled,
        .button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .vision {
          position: relative;
          min-height: 280px;
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(3, 7, 20, 0.8);
        }

        .vision__video {
          width: 100%;
          height: 100%;
          min-height: 280px;
          object-fit: cover;
          display: block;
        }

        .vision__top,
        .vision__bottom {
          position: absolute;
          left: 12px;
          right: 12px;
          border-radius: 18px;
          background: rgba(10, 15, 30, 0.78);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #eef4ff;
        }

        .vision__top {
          top: 12px;
          padding: 10px 12px;
          font-size: 0.84rem;
        }

        .vision__bottom {
          bottom: 12px;
          padding: 12px;
        }

        .vision__label {
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8bb4ff;
          margin-bottom: 8px;
        }

        .vision__text {
          white-space: pre-wrap;
          line-height: 1.45;
          color: #f8fbff;
        }

        .chat {
          border-radius: 24px;
          overflow: hidden;
          display: grid;
          grid-template-rows: auto 1fr auto;
          min-height: 52vh;
        }

        .chat__header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          color: #b9c8e8;
          font-size: 0.84rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .chat__log {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          max-height: 52vh;
        }

        .bubble {
          max-width: min(720px, 94%);
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          padding: 14px 15px;
        }

        .bubble--user {
          align-self: flex-end;
          background: rgba(59, 130, 246, 0.18);
        }

        .bubble--ai {
          align-self: flex-start;
          background: rgba(255, 255, 255, 0.05);
        }

        .bubble__tag {
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #8bb4ff;
          margin-bottom: 8px;
        }

        .bubble__text {
          white-space: pre-wrap;
          line-height: 1.55;
          color: #f8fbff;
        }

        .composer {
          padding: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: grid;
          gap: 10px;
        }

        textarea {
          width: 100%;
          resize: vertical;
          min-height: 110px;
          border-radius: 18px;
          padding: 14px;
          color: #f8fbff;
          background: rgba(3, 7, 20, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          outline: none;
        }

        textarea:focus {
          border-color: rgba(96, 165, 250, 0.9);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
        }

        .composer__row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }

        .button {
          border: 0;
          border-radius: 16px;
          padding: 13px 15px;
          color: #eef4ff;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            opacity 0.15s ease;
        }

        .button--soft {
          background: rgba(255, 255, 255, 0.08);
        }

        .button--ghost {
          background: rgba(255, 255, 255, 0.04);
        }

        .button--primary {
          background: linear-gradient(135deg, #60a5fa, #a78bfa);
          min-width: 130px;
        }

        @media (min-width: 720px) {
          .topbar {
            grid-template-columns: auto 1fr;
            align-items: center;
          }

          .hero {
            grid-template-columns: 1.2fr 0.8fr;
            align-items: end;
          }

          .quick {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .hero__copy {
            padding-right: 12px;
          }
        }

        @media (max-width: 640px) {
          .shell {
            padding: 10px;
          }

          .frame {
            min-height: calc(100vh - 20px);
          }

          .composer__row {
            flex-direction: column;
          }

          .button--primary {
            width: 100%;
          }

          .bubble {
            max-width: 100%;
          }

          .vision,
          .vision__video {
            min-height: 220px;
          }
        }
      `}</style>
    </main>
  );
}
