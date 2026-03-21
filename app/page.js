"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const starterMessage = {
  role: "assistant",
  content:
    "Glass Pro Mode on päällä. Sano “Halo” ja anna komento, tai kirjoita viesti.",
};

const quickPrompts = [
  "Halo, muista että tykkään älylaseista",
  "Halo, laske 48 * 17",
  "Halo, käännä tämä suomeksi: I want smart glasses with AI",
  "Halo, anna 3 ideaa älylasisovellukseen",
  "Halo, mitä muistat minusta?",
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
    const prefix = `${word},`;
    const prefix2 = `${word} `;
    if (lower.startsWith(prefix)) return clean.slice(prefix.length).trim();
    if (lower.startsWith(prefix2)) return clean.slice(prefix2.length).trim();
    if (lower === word) return "";
  }

  return clean;
}

export default function Page() {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Valmis");
  const [memory, setMemory] = useState([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [wakeWordMode, setWakeWordMode] = useState(true);
  const [glassMode, setGlassMode] = useState(true);

  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    const savedMessages = localStorage.getItem("glass-agent-chat");
    const savedMemory = localStorage.getItem("glass-agent-memory");
    const savedSettings = localStorage.getItem("glass-agent-settings");

    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch {
        localStorage.removeItem("glass-agent-chat");
      }
    }

    if (savedMemory) {
      try {
        setMemory(JSON.parse(savedMemory));
      } catch {
        localStorage.removeItem("glass-agent-memory");
      }
    }

    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (typeof parsed.autoSpeak === "boolean") setAutoSpeak(parsed.autoSpeak);
        if (typeof parsed.autoListen === "boolean") setAutoListen(parsed.autoListen);
        if (typeof parsed.wakeWordMode === "boolean") setWakeWordMode(parsed.wakeWordMode);
        if (typeof parsed.glassMode === "boolean") setGlassMode(parsed.glassMode);
      } catch {
        localStorage.removeItem("glass-agent-settings");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("glass-agent-chat", JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(
      "glass-agent-settings",
      JSON.stringify({ autoSpeak, autoListen, wakeWordMode, glassMode })
    );
  }, [autoSpeak, autoListen, wakeWordMode, glassMode]);

  useEffect(() => {
    localStorage.setItem("glass-agent-memory", JSON.stringify(memory));
  }, [memory]);

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
      const clean = transcript.trim();
      if (!clean) return;

      const stripped = wakeWordMode ? stripWakeWord(clean) : clean;

      if (wakeWordMode) {
        const lower = clean.toLowerCase();
        const hasWakeWord = WAKE_WORDS.some((word) => lower.includes(word));

        if (!hasWakeWord) {
          setInput(clean);
          return;
        }

        if (stripped) {
          sendMessage(stripped);
        }
        return;
      }

      sendMessage(stripped);
    };

    recognitionRef.current = recognition;
  }, [autoListen, wakeWordMode]);

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "assistant");
  }, [messages]);

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
    localStorage.removeItem("glass-agent-chat");
  }

  function clearMemory() {
    setMemory([]);
    localStorage.removeItem("glass-agent-memory");
  }

  function extractMemoryInstruction(text) {
    const match = text.match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);
    if (!match) return null;
    return match[2].trim();
  }

  async function sendMessage(text) {
    const clean = String(text || "").trim();
    if (!clean || loading) return;

    const memoryItem = extractMemoryInstruction(clean);
    if (memoryItem) {
      const nextMemory = [...memory, memoryItem].slice(-30);
      setMemory(nextMemory);
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
          autoSpeak,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Palvelinvirhe");
      }

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
    <main className={glassMode ? "haloScreen glassModeOn" : "haloScreen"}>
      <div className="haloGlow haloGlowLeft" />
      <div className="haloGlow haloGlowRight" />

      <section className="haloFrame">
        <header className="haloTopbar">
          <div className="haloBrand">
            <span className="haloDot" />
            <div>
              <div className="haloTitle">GLASS PRO MODE</div>
              <div className="haloSubtitle">Wake word + voice + memory + agent</div>
            </div>
          </div>

          <div className="haloPills">
            <span className="haloPill">{status}</span>
            <span className="haloPill">{loading ? "Lataa" : "Valmis"}</span>
            <span className="haloPill">{listening ? "Kuuntelee" : "Hiljaa"}</span>
            <span className="haloPill">{speaking ? "Puhuu" : "Ei puhetta"}</span>
            <span className="haloPill">Muistoja: {memory.length}</span>
          </div>
        </header>

        <section className="haloHero">
          <div className="haloHeroCopy">
            <p className="haloEyebrow">Smart glasses UI</p>
            <h1>Lasimainen AI-agentti, joka kuuntelee, muistaa ja vastaa nopeasti</h1>
            <p className="haloLead">
              Tämä on rakennettu tuntumaan enemmän oikealta älylasikokemukselta: pieni pinta,
              suuret toiminnot ja mahdollisimman vähän turhaa säätöä.
            </p>
          </div>

          <div className="haloActions">
            <button className="haloButton haloButtonSoft" onClick={toggleListening}>
              {listening ? "Lopeta kuuntelu" : "Puhu"}
            </button>
            <button className="haloButton haloButtonSoft" onClick={speakLastAssistant}>
              Lue vastaus
            </button>
            <button className="haloButton haloButtonGhost" onClick={() => setAutoSpeak((v) => !v)}>
              Autoääni: {autoSpeak ? "Päällä" : "Pois"}
            </button>
            <button className="haloButton haloButtonGhost" onClick={() => setAutoListen((v) => !v)}>
              Auto kuuntelu: {autoListen ? "Päällä" : "Pois"}
            </button>
            <button className="haloButton haloButtonGhost" onClick={() => setWakeWordMode((v) => !v)}>
              Wake word: {wakeWordMode ? "Päällä" : "Pois"}
            </button>
            <button className="haloButton haloButtonGhost" onClick={() => setGlassMode((v) => !v)}>
              Glass mode: {glassMode ? "Päällä" : "Pois"}
            </button>
            <button className="haloButton haloButtonGhost" onClick={clearChat}>
              Tyhjennä chat
            </button>
            <button className="haloButton haloButtonGhost" onClick={clearMemory}>
              Tyhjennä muisti
            </button>
          </div>
        </section>

        <section className="haloQuickRow">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              className="haloQuickChip"
              onClick={() => sendMessage(prompt)}
              disabled={loading}
            >
              {prompt}
            </button>
          ))}
        </section>

        <section className="haloChatPanel">
          <div className="haloChatHeader">
            <span>Keskustelu</span>
            <span>{messages.length} viestiä</span>
          </div>

          <div className="haloChatLog">
            {messages.map((message, index) => (
              <article
                key={index}
                className={
                  message.role === "user" ? "haloBubble haloBubbleUser" : "haloBubble haloBubbleAi"
                }
              >
                <div className="haloBubbleTag">
                  {message.role === "user" ? "SINÄ" : "AI"}
                </div>
                <div className="haloBubbleText">{message.content}</div>
              </article>
            ))}

            {loading && (
              <article className="haloBubble haloBubbleAi">
                <div className="haloBubbleTag">AI</div>
                <div className="haloBubbleText">Ajattelen...</div>
              </article>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            className="haloComposer"
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

            <div className="haloComposerRow">
              <button type="button" className="haloButton haloButtonSoft" onClick={toggleListening}>
                {listening ? "Kuuntelu päällä" : "Mikrofoni"}
              </button>
              <button type="submit" className="haloButton haloButtonPrimary" disabled={loading}>
                Lähetä
              </button>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
