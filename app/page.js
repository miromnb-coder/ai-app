"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const starterMessage = {
  role: "assistant",
  content:
    "Agent Level 3 on päällä. Voit puhua, kirjoittaa, pyytää minua muistamaan asioita tai käyttää nopeita toimintoja.",
};

const starterPrompts = [
  "Laske 48 * 17",
  "Muista tämä: tykkään älylaseista",
  "Tiivistä tämä: AI-agentti osaa tehdä asioita itse",
  "Käännä tämä suomeksi: I want smart glasses with AI",
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

export default function Page() {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Valmis");
  const [memory, setMemory] = useState([]);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const savedMessages = localStorage.getItem("halo-mode-chat");
    const savedMemory = localStorage.getItem("halo-mode-memory");

    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch {
        localStorage.removeItem("halo-mode-chat");
      }
    }

    if (savedMemory) {
      try {
        setMemory(JSON.parse(savedMemory));
      } catch {
        localStorage.removeItem("halo-mode-memory");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("halo-mode-chat", JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("halo-mode-memory", JSON.stringify(memory));
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
      setListening(true);
      setStatus("Kuuntelen...");
    };

    recognition.onend = () => {
      setListening(false);
      setStatus("Valmis");
    };

    recognition.onerror = () => {
      setListening(false);
      setStatus("Puheentunnistusvirhe");
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript.trim()) setInput(transcript.trim());
    };

    recognitionRef.current = recognition;
  }, []);

  const lastAssistant = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === "assistant");
  }, [messages]);

  function toggleListening() {
    if (!recognitionRef.current) {
      setStatus("Puheentunnistus ei ole tuettu");
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      return;
    }

    recognitionRef.current.start();
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
    localStorage.removeItem("halo-mode-chat");
  }

  function clearMemory() {
    setMemory([]);
    localStorage.removeItem("halo-mode-memory");
  }

  function extractMemoryInstruction(text) {
    const match = text.match(/^(muista tämä|remember this)\s*:\s*(.+)$/i);
    if (!match) return null;
    return match[2].trim();
  }

  async function sendMessage(text) {
    const clean = text.trim();
    if (!clean || loading) return;

    const memoryItem = extractMemoryInstruction(clean);
    if (memoryItem) {
      const nextMemory = [...memory, memoryItem].slice(-20);
      setMemory(nextMemory);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: clean },
        {
          role: "assistant",
          content: `Muistin tämän: ${memoryItem}`,
        },
      ]);
      setInput("");
      speak(`Muistin tämän: ${memoryItem}`, () => setSpeaking(true), () => setSpeaking(false));
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Palvelinvirhe");
      }

      const reply = data.reply || "Ei vastausta.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setStatus("Valmis");

      if (data.autoSpeak) {
        speak(reply, () => setSpeaking(true), () => setSpeaking(false));
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
    <main className="haloScreen">
      <div className="haloGlow haloGlowLeft" />
      <div className="haloGlow haloGlowRight" />

      <section className="haloFrame">
        <header className="haloTopbar">
          <div className="haloBrand">
            <span className="haloDot" />
            <div>
              <div className="haloTitle">AGENT LEVEL 3</div>
              <div className="haloSubtitle">Voice + memory + glass mode</div>
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
            <h1>Puhuva AI-agentti, joka muistaa asioita</h1>
            <p className="haloLead">
              Tämä versio on jo lähempänä oikeaa älylasikäyttöä: lyhyt näkymä, isot toiminnot,
              muisti ja puhe molempiin suuntiin.
            </p>
          </div>

          <div className="haloActions">
            <button className="haloButton haloButtonSoft" onClick={toggleListening}>
              {listening ? "Lopeta kuuntelu" : "Puhu"}
            </button>
            <button className="haloButton haloButtonSoft" onClick={speakLastAssistant}>
              Lue vastaus
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
          {starterPrompts.map((prompt) => (
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
