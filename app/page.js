"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const starterMessage = {
  role: "assistant",
  content: "Vision mode on valmis. Voit puhua minulle tai käynnistää kameran.",
};

const quickPrompts = [
  "Muista tämä: tykkään älylaseista",
  "Laske 48 * 17",
  "Käännä tämä suomeksi: I want smart glasses with AI",
  "Anna 3 ideaa älylasisovellukseen",
  "Mitä muistat minusta?",
];

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
  const wakeWords = ["halo", "agentti", "assistant"];

  for (const word of wakeWords) {
    if (lower.startsWith(`${word},`)) return clean.slice(word.length + 1).trim();
    if (lower.startsWith(`${word} `)) return clean.slice(word.length).trim();
    if (lower === word) return "";
  }

  return clean;
}

export default function Page() {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [memory, setMemory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Valmis");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [wakeWordMode, setWakeWordMode] = useState(false);
  const [visionMode, setVisionMode] = useState(false);
  const [glassMode, setGlassMode] = useState(true);
  const [liveVision, setLiveVision] = useState("");
  const [cameraError, setCameraError] = useState("");

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

  useEffect(() => {
    const savedMessages = localStorage.getItem("glass-pro-chat");
    const savedMemory = localStorage.getItem("glass-pro-memory");
    const savedSettings = localStorage.getItem("glass-pro-settings");
    const savedVision = localStorage.getItem("glass-pro-vision");

    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
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
  }, []);

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
    sendMessageRef.current = sendMessage;
  });

  useEffect(() => {
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

      if (autoListen) {
        window.setTimeout(() => {
          tryStartListening();
        }, 250);
      }
    };

    recognition.onerror = () => {
      listeningRef.current = false;
      setListening(false);
      setStatus("Puhevirhe");

      if (autoListen) {
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
        const hasWakeWord = ["halo", "agentti", "assistant"].some((word) =>
          lower.includes(word)
        );

        if (!hasWakeWord) return;

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
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await startCamera();
        if (cancelled) return;

        await analyzeVisionRef.current?.();

        visionTimerRef.current = window.setInterval(() => {
          analyzeVisionRef.current?.();
        }, 2500);
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

  function tryStartListening() {
    if (!recognitionRef.current || listeningRef.current) return;

    try {
      recognitionRef.current.start();
    } catch {
      // Ignore start errors from browsers that need a fresh user gesture.
    }
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

  function speakLastAssistant() {
    if (!lastAssistant) return;
    speak(
      lastAssistant.content,
      () => setSpeaking(true),
      () => setSpeaking(false)
    );
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

  async function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      throw new Error("Kamera ei ole valmis.");
    }

    const maxWidth = 768;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas ei toimi.");

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  async function analyzeVision() {
    if (!visionMode || visionBusyRef.current) return;
    if (!cameraStreamRef.current) return;

    visionBusyRef.current = true;
    setStatus("Analysoi kuvaa...");

    try {
      const image = await captureFrame();

      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          memory,
          visionContext: liveVision,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Vision-virhe");

      const reply = String(data.reply || "").trim();
      if (reply) {
        setLiveVision(reply);
        setStatus("Kuva analysoitu");
      }
    } catch (error) {
      setCameraError(error?.message || "Vision-analyysi epäonnistui");
      setStatus("Vision virhe");
    } finally {
      visionBusyRef.current = false;
    }
  }

  async function sendMessage(text) {
    const clean = String(text || "").trim();
    if (!clean || loading) return;

    const memoryItem = extractMemoryInstruction(clean);
    if (memoryItem) {
      setMemory((prev) => [...prev, memoryItem].slice(-30));
      setMessages((prev) => [
        ...prev,
        { role: "user", content: clean },
        { role: "assistant", content: `Muistin tämän: ${memoryItem}` },
      ]);
      setInput("");

      if (autoSpeak) {
        speak(
          `Muistin tämän: ${memoryItem}`,
          () => setSpeaking(true),
          () => setSpeaking(false)
        );
      }
      return;
    }

    const nextMessages = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStatus("Ajattelen...");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          memory,
          visionContext: liveVision,
          autoSpeak,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Palvelinvirhe");

      const reply = data.reply || "Ei vastausta.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setStatus("Valmis");

      if (autoSpeak && data.autoSpeak !== false) {
        speak(
          reply,
          () => setSpeaking(true),
          () => setSpeaking(false)
        );
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Virhe: ${error.message}` },
      ]);
      setStatus("Virhe");
    } finally {
      setLoading(false);
    }
  }

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
            <span className="glassPill">{loading ? "Lataa" : "Valmis"}</span>
            <span className="glassPill">{listening ? "Kuuntelee" : "Hiljaa"}</span>
            <span className="glassPill">{speaking ? "Puhuu" : "Ei puhetta"}</span>
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
            <button className="glassButton glassButtonSoft" onClick={speakLastAssistant}>
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
              {cameraError ? cameraError : "Kamera analysoi kuvaa"}
            </div>
            <div className="visionOverlayBottom">
              <div className="visionLabel">LIVE VISIO</div>
              <div className="visionText">
                {liveVision || "Ei analyysiä vielä"}
              </div>
            </div>
          </section>
        )}

        <section className="glassQuickRow">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              className="glassQuickChip"
              onClick={() => sendMessage(prompt)}
              disabled={loading}
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
            {messages.map((message, index) => (
              <article
                key={index}
                className={
                  message.role === "user" ? "glassBubble glassBubbleUser" : "glassBubble glassBubbleAi"
                }
              >
                <div className="glassBubbleTag">
                  {message.role === "user" ? "SINÄ" : "AI"}
                </div>
                <div className="glassBubbleText">{message.content}</div>
              </article>
            ))}

            {loading && (
              <article className="glassBubble glassBubbleAi">
                <div className="glassBubbleTag">AI</div>
                <div className="glassBubbleText">Ajattelen...</div>
              </article>
            )}

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
              <button type="submit" className="glassButton glassButtonPrimary" disabled={loading}>
                Lähetä
              </button>
              <button type="button" className="glassButton glassButtonSoft" onClick={analyzeVision}>
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
