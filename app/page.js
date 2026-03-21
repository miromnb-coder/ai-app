"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const starterMessage = {
  id: "starter-message",
  role: "assistant",
  content:
    "Vision mode on valmis. Voit puhua minulle, kirjoittaa, tai painaa \"Katso ja kysy\".",
};

const quickPrompts = [
  "Muista tämä: tykkään älylaseista",
  "Laske 48 * 17",
  "Käännä tämä suomeksi: I want smart glasses with AI",
  "Anna 3 ideaa älylasisovellukseen",
  "Mitä muistat minusta?",
  "Kerro mitä näet kamerassa",
];

const WAKE_WORDS = ["halo", "agentti", "assistant"];
const VISION_INTERVAL_MS = 2600;
const MOTION_THRESHOLD = 5.5;

function supportsSpeechRecognition() {
  return (
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

function speak(text, onStart, onEnd) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fi-FI";
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
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

function makeId(prefix = "msg") {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${random}`;
}

function normalizeMessages(list) {
  if (!Array.isArray(list) || !list.length) return [starterMessage];

  return list.map((message, index) => ({
    id: message?.id || makeId(`msg-${index}`),
    role: message?.role === "user" ? "user" : "assistant",
    content: String(message?.content || ""),
  }));
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

export default function Page() {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [memory, setMemory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Valmis");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [wakeWordMode, setWakeWordMode] = useState(true);
  const [visionMode, setVisionMode] = useState(false);
  const [glassMode, setGlassMode] = useState(true);
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
  const sendMessageRef = useRef(null);
  const analyzeVisionRef = useRef(null);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const loadingRef = useRef(false);
  const streamingRef = useRef(false);
  const lastFingerprintRef = useRef(null);

  useEffect(() => {
    const savedMessages = localStorage.getItem("glass-pro-chat");
    const savedMemory = localStorage.getItem("glass-pro-memory");
    const savedSettings = localStorage.getItem("glass-pro-settings");
    const savedVision = localStorage.getItem("glass-pro-vision");
    const savedSessionId = localStorage.getItem("glass-pro-session-id");

    if (savedMessages) {
      try {
        setMessages(normalizeMessages(JSON.parse(savedMessages)));
      } catch {
        localStorage.removeItem("glass-pro-chat");
      }
    }

    if (savedMemory) {
      try {
        setMemory(JSON.parse(savedMemory));
      } catch {
        localStorage.removeItem("glass-pro-memory");
      }
    }

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.autoSpeak === "boolean") setAutoSpeak(parsed.autoSpeak);
        if (typeof parsed.autoListen === "boolean") setAutoListen(parsed.autoListen);
        if (typeof parsed.wakeWordMode === "boolean") setWakeWordMode(parsed.wakeWordMode);
        if (typeof parsed.visionMode === "boolean") setVisionMode(parsed.visionMode);
        if (typeof parsed.glassMode === "boolean") setGlassMode(parsed.glassMode);
      } catch {
        localStorage.removeItem("glass-pro-settings");
      }
    }

    if (savedVision) {
      setLiveVision(savedVision);
    }

    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      const nextSessionId = makeId("session");
      localStorage.setItem("glass-pro-session-id", nextSessionId);
      setSessionId(nextSessionId);
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("glass-pro-session-id", sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    localStorage.setItem("glass-pro-chat", JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("glass-pro-memory", JSON.stringify(memory));
  }, [memory]);

  useEffect(() => {
    localStorage.setItem(
      "glass-pro-settings",
      JSON.stringify({ autoSpeak, autoListen, wakeWordMode, visionMode, glassMode })
    );
  }, [autoSpeak, autoListen, wakeWordMode, visionMode, glassMode]);

  useEffect(() => {
    localStorage.setItem("glass-pro-vision", liveVision);
  }, [liveVision]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    analyzeVisionRef.current = analyzeVision;
  });

  useEffect(() => {
    if (!supportsSpeechRecognition()) return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.lang = "fi-FI";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
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
        !speakingRef.current &&
        !loadingRef.current &&
        !streamingRef.current
      ) {
        window.setTimeout(() => {
          tryStartListening();
        }, 300);
      }
    };

    recognition.onerror = () => {
      listeningRef.current = false;
      setListening(false);
      setStatus("Puhevirhe");

      if (autoListen && !speakingRef.current) {
        window.setTimeout(() => {
          tryStartListening();
        }, 400);
      }
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      const clean = String(transcript).trim();
      if (!clean) return;

      if (wakeWordMode) {
        const lower = clean.toLowerCase();
        const hasWakeWord = WAKE_WORDS.some((word) => lower.includes(word));

        if (!hasWakeWord) {
          setInput(clean);
          return;
        }

        const stripped = stripWakeWord(clean);
        if (stripped) sendMessageRef.current?.(stripped);
        return;
      }

      sendMessageRef.current?.(clean);
    };

    recognitionRef.current = recognition;
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

        await analyzeVisionRef.current?.({ force: true, announce: false });

        visionTimerRef.current = window.setInterval(() => {
          analyzeVisionRef.current?.({ force: false, announce: false });
        }, VISION_INTERVAL_MS);
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
  }, [visionMode]);

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "assistant");
  }, [messages]);

  function ensureSessionId() {
    if (sessionId) return sessionId;
    const nextSessionId = makeId("session");
    setSessionId(nextSessionId);
    localStorage.setItem("glass-pro-session-id", nextSessionId);
    return nextSessionId;
  }

  function stopListeningIfActive() {
    if (recognitionRef.current && listeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }

  function speakReply(text) {
    if (!text) return;

    speakingRef.current = true;
    setSpeaking(true);
    stopListeningIfActive();

    speak(
      text,
      () => {},
      () => {
        speakingRef.current = false;
        setSpeaking(false);
      }
    );
  }

  async function streamAssistantReply(assistantId, reply) {
    const letters = Array.from(String(reply || ""));
    if (!letters.length) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content: "Ei vastausta." } : message
        )
      );
      return;
    }

    setStreaming(true);
    setStatus("Vastaa...");

    const chunkSize = letters.length > 160 ? 4 : 2;
    const delay = letters.length > 200 ? 10 : 14;
    let index = 0;

    while (index < letters.length) {
      index = Math.min(letters.length, index + chunkSize);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: letters.slice(0, index).join("") }
            : message
        )
      );
      if (index < letters.length) {
        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }
    }

    setStreaming(false);
  }

  async function startCamera() {
    if (cameraStreamRef.current) return cameraStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Kameraa ei tueta tässä selaimessa.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
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

    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(160, Math.round(video.videoWidth * scale));
    const height = Math.max(90, Math.round(video.videoHeight * scale));

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas ei toimi.");

    ctx.drawImage(video, 0, 0, width, height);
    const image = canvas.toDataURL("image/jpeg", 0.72);
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

  async function analyzeVision({ force = false, announce = false } = {}) {
    if ((!visionMode && !force) || visionBusyRef.current || !cameraStreamRef.current) return;

    visionBusyRef.current = true;
    setStatus("Analysoi kuvaa...");

    try {
      const { image, fingerprint } = await captureFrameAndFingerprint();
      const diff = averageDiff(lastFingerprintRef.current || [], fingerprint);
      setVisionMotion(Number.isFinite(diff) ? diff.toFixed(1) : "0.0");

      if (!force && Number.isFinite(diff) && diff < MOTION_THRESHOLD) {
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
          memory,
          visionContext: liveVision,
          sessionId: activeSessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Vision-virhe");
      }

      const reply = String(data.reply || "").trim();
      if (reply) {
        setLiveVision(reply);
        setStatus("Kuva analysoitu");

        if (announce && autoSpeak) {
          speakReply(reply);
        }
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
      try {
        recognitionRef.current.stop();
      } catch {}
      return;
    }

    tryStartListening();
  }

  function clearChat() {
    setMessages([starterMessage]);
    localStorage.removeItem("glass-pro-chat");
  }

  function clearMemory() {
    setMemory([]);
    localStorage.removeItem("glass-pro-memory");
  }

  function extractMemoryInstruction(text) {
    const match = text.match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);
    if (!match) return null;
    return match[2].trim();
  }

  function triggerLookAndAsk() {
    if (!visionMode) {
      setVisionMode(true);
      window.setTimeout(() => {
        analyzeVisionRef.current?.({ force: true, announce: true });
      }, 1300);
      return;
    }

    analyzeVisionRef.current?.({ force: true, announce: true });
  }

  async function sendMessage(text) {
    const clean = String(text || "").trim();
    if (!clean || loading || streaming) return;

    const memoryItem = extractMemoryInstruction(clean);
    if (memoryItem) {
      const nextMemory = [...memory, memoryItem].slice(-30);
      setMemory(nextMemory);
      setMessages((prev) => [
        ...prev,
        { id: makeId("user"), role: "user", content: clean },
        { id: makeId("assistant"), role: "assistant", content: `Muistin tämän: ${memoryItem}` },
      ]);
      setInput("");

      if (autoSpeak) {
        speakReply(`Muistin tämän: ${memoryItem}`);
      }
      return;
    }

    const userMessage = { id: makeId("user"), role: "user", content: clean };
    const assistantId = makeId("assistant");
    const nextMessages = [...messages, userMessage];

    setMessages([
      ...nextMessages,
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
          memory,
          visionContext: liveVision,
          autoSpeak,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Palvelinvirhe");
      }

      const reply = String(data.reply || "Ei vastausta.").trim();
      setLoading(false);
      await streamAssistantReply(assistantId, reply);
      setStatus("Valmis");

      if (autoSpeak && data.autoSpeak !== false) {
        speakReply(reply);
      }
    } catch (error) {
      setLoading(false);
      setStreaming(false);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: `Virhe: ${error.message}` }
            : message
        )
      );
      setStatus("Virhe");
    }
  }

  const lastAssistantText = lastAssistant?.content || "";

  return (
    <main className={glassMode ? "glassShell glassModeOn" : "glassShell"}>
      <div className="glassGlow glassGlowLeft" />
      <div className="glassGlow glassGlowRight" />

      <section className="glassFrame">
        <header className="glassTopbar">
          <div className="glassBrand">
            <span className="glassDot" />
            <div>
              <div className="glassTitle">VISION MODE</div>
              <div className="glassSubtitle">camera + voice + memory + agent</div>
            </div>
          </div>

          <div className="glassPills">
            <span className="glassPill">{status}</span>
            <span className="glassPill">
              {loading ? "Ajattelee" : streaming ? "Kirjoittaa" : "Valmis"}
            </span>
            <span className="glassPill">{listening ? "Kuuntelee" : "Hiljaa"}</span>
            <span className="glassPill">{speaking ? "Puhuu" : "Ei puhetta"}</span>
            <span className="glassPill">Vision {visionMode ? "Päällä" : "Pois"}</span>
            <span className="glassPill">Liike {visionMotion}</span>
            <span className="glassPill">Muistoja: {memory.length}</span>
          </div>
        </header>

        <section className="glassHero">
          <div className="glassHeroCopy">
            <p className="glassEyebrow">Smart glasses UI</p>
            <h1>AI-agentti, joka kuulee, näkee ja vastaa nopeasti</h1>
            <p className="glassLead">
              Tämä on rakennettu tuntumaan enemmän oikealta älylasikokemukselta: kamera,
              overlay, puhe, muisti ja lyhyet nopeat vastaukset.
            </p>
          </div>

          <div className="glassActions">
            <button className="glassButton glassButtonSoft" onClick={toggleListening}>
              {listening ? "Lopeta kuuntelu" : "Puhu"}
            </button>
            <button className="glassButton glassButtonSoft" onClick={() => speakReply(lastAssistantText)}>
              Lue vastaus
            </button>
            <button className="glassButton glassButtonGhost" onClick={() => setAutoSpeak((v) => !v)}>
              Autoääni: {autoSpeak ? "Päällä" : "Pois"}
            </button>
            <button className="glassButton glassButtonGhost" onClick={() => setAutoListen((v) => !v)}>
              Auto kuuntelu: {autoListen ? "Päällä" : "Pois"}
            </button>
            <button className="glassButton glassButtonGhost" onClick={() => setWakeWordMode((v) => !v)}>
              Wake word: {wakeWordMode ? "Päällä" : "Pois"}
            </button>
            <button className="glassButton glassButtonGhost" onClick={() => setVisionMode((v) => !v)}>
              Vision: {visionMode ? "Päällä" : "Pois"}
            </button>
            <button className="glassButton glassButtonGhost" onClick={triggerLookAndAsk}>
              Katso ja kysy
            </button>
            <button className="glassButton glassButtonGhost" onClick={() => setGlassMode((v) => !v)}>
              Glass mode: {glassMode ? "Päällä" : "Pois"}
            </button>
            <button className="glassButton glassButtonGhost" onClick={clearChat}>
              Tyhjennä chat
            </button>
            <button className="glassButton glassButtonGhost" onClick={clearMemory}>
              Tyhjennä muisti
            </button>
          </div>
        </section>

        {visionMode && (
          <section className="visionStage">
            <video ref={videoRef} className="visionVideo" autoPlay muted playsInline />
            <div className="visionOverlayTop">
              {cameraError ? cameraError : `Kamera analysoi kuvaa • liike ${visionMotion}`}
            </div>
            <div className="visionOverlayBottom">
              <div className="visionLabel">LIVE VISIO</div>
              <div className="visionText">{liveVision || "Ei analyysiä vielä"}</div>
            </div>
          </section>
        )}

        <section className="glassQuickRow">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              className="glassQuickChip"
              onClick={() => sendMessage(prompt)}
              disabled={loading || streaming}
            >
              {prompt}
            </button>
          ))}
        </section>

        <section className="glassChatPanel">
          <div className="glassChatHeader">
            <span>Keskustelu</span>
            <span>{messages.length} viestiä</span>
          </div>

          <div className="glassChatLog">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user"
                    ? "glassBubble glassBubbleUser"
                    : "glassBubble glassBubbleAi"
                }
              >
                <div className="glassBubbleTag">
                  {message.role === "user" ? "SINÄ" : "AI"}
                </div>
                <div className="glassBubbleText">{message.content}</div>
              </article>
            ))}

            <div ref={bottomRef} />
          </div>

          <form
            className="glassComposer"
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

            <div className="glassComposerRow">
              <button type="button" className="glassButton glassButtonSoft" onClick={toggleListening}>
                {listening ? "Kuuntelu päällä" : "Mikrofoni"}
              </button>
              <button type="submit" className="glassButton glassButtonPrimary" disabled={loading || streaming}>
                Lähetä
              </button>
              <button
                type="button"
                className="glassButton glassButtonSoft"
                onClick={() => analyzeVisionRef.current?.({ force: true, announce: true })}
              >
                Analysoi nyt
              </button>
            </div>
          </form>

          <canvas ref={canvasRef} style={{ display: "none" }} />
        </section>
      </section>
    </main>
  );
}
