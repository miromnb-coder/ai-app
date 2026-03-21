"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const starterMessage = {
  role: "assistant",
  content:
    "Halo mode valmis. Puhu minulle, kirjoita viesti tai käytä nopeita toimintoja.",
};

const quickPrompts = [
  "Laske 48 * 17",
  "Tiivistä tämä yhdellä lauseella: AI-agentti osaa tehdä asioita itse",
  "Käännä tämä suomeksi: I want smart glasses with AI",
  "Anna 3 ideaa älylasisovellukseen",
];

function supportsSpeechRecognition() {
  return (
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export default function Page() {
  const [messages, setMessages] = useState([starterMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Valmis");
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("halo-mode-chat");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        localStorage.removeItem("halo-mode-chat");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("halo-mode-chat", JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  function speakText(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fi-FI";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(text) {
    const clean = text.trim();
    if (!clean || loading) return;

    const nextMessages = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStatus("Ajattelen...");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Palvelinvirhe");
      }

      const reply = data.reply || "Ei vastausta.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setStatus("Valmis");

      if (data.autoSpeak) speakText(reply);
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

  function toggleListening() {
    if (!recognitionRef.current) {
      setStatus("Puheentunnistus ei ole tuettu tässä selaimessa");
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
    speakText(lastAssistant.content);
  }

  function clearChat() {
    setMessages([starterMessage]);
    localStorage.removeItem("halo-mode-chat");
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
              <div className="haloTitle">HALO MODE</div>
              <div className="haloSubtitle">Voice-first AI agent</div>
            </div>
          </div>

          <div className="haloPills">
            <span className="haloPill">{status}</span>
            <span className="haloPill">{loading ? "Lataus" : "Valmis"}</span>
            <span className="haloPill">{listening ? "Kuuntelee" : "Hiljaa"}</span>
            <span className="haloPill">{speaking ? "Puhuu" : "Ei puhetta"}</span>
          </div>
        </header>

        <section className="haloHero">
          <div className="haloHeroCopy">
            <p className="haloEyebrow">Smart glasses UI</p>
            <h1>Selkeä, nopea ja puheeseen sopiva näkymä</h1>
            <p className="haloLead">
              Tämä UI on tehty näyttämään enemmän älylasien käyttöliittymältä kuin tavalliselta
              chat-sivulta.
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
              Tyhjennä
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
