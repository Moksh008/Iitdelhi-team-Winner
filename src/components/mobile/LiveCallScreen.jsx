import React, { useState, useEffect, useRef } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Radio, 
  CreditCard, 
  User, 
  ShieldAlert, 
  Send,
  Volume2,
  VolumeX,
  MessageCircle,
  Video,
  Lock,
  Signal
} from 'lucide-react';

export default function LiveCallScreen({ 
  scenario, 
  onEndCall, 
  onOpenUPI,
  chunkHistory = [],
  rollingC = 0.0,
  activeLanguage,
  onLiveChunkReceived,
  callSource = 'whatsapp', // 'whatsapp' | 'cellular' | 'telegram' | 'mic'
  onChangeCallSource
}) {
  const [seconds, setSeconds] = useState(0);
  const [isMicListening, setIsMicListening] = useState(false);
  const [isTTSEnabled, setIsTTSEnabled] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [customInputText, setCustomInputText] = useState('');
  const recognitionRef = useRef(null);

  // Call timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Web Speech API Voice Recognition (Live microphone transcription)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = activeLanguage?.speechLocale || 'hi-IN';

      recognition.onresult = (event) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        const currentText = finalText || interimText;
        setLiveTranscript(currentText);

        if (finalText && finalText.trim().length > 3) {
          if (onLiveChunkReceived) {
            onLiveChunkReceived(finalText.trim());
          }
          setLiveTranscript('');
        }
      };

      recognition.onerror = (err) => {
        console.warn('SpeechRecognition error:', err);
        setIsMicListening(false);
      };

      recognition.onend = () => {
        setIsMicListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
    };
  }, [activeLanguage, onLiveChunkReceived]);

  // Text-To-Speech (TTS) synthesizer to speak caller's voice aloud in Indian languages
  const speakTextAloud = (text) => {
    if (!isTTSEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel(); // Stop prior audio
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = activeLanguage?.speechLocale || 'hi-IN';
    utterance.rate = 1.05; // Slightly urgent tone
    window.speechSynthesis.speak(utterance);
  };

  // Speak aloud automatically when new chunk is injected if TTS is toggled on
  useEffect(() => {
    if (isTTSEnabled && chunkHistory.length > 0) {
      const latest = chunkHistory[chunkHistory.length - 1];
      if (latest?.text) {
        speakTextAloud(latest.text);
      }
    }
  }, [chunkHistory.length, isTTSEnabled]);

  const toggleMicListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported in this browser. Please use Chrome/Edge or type text below.');
      return;
    }

    if (isMicListening) {
      recognitionRef.current.stop();
      setIsMicListening(false);
    } else {
      try {
        recognitionRef.current.lang = activeLanguage?.speechLocale || 'hi-IN';
        recognitionRef.current.start();
        setIsMicListening(true);
      } catch (err) {
        console.warn('Mic start failed:', err);
      }
    }
  };

  const handleSendCustomText = (e) => {
    e.preventDefault();
    if (customInputText.trim().length > 0) {
      if (onLiveChunkReceived) {
        onLiveChunkReceived(customInputText.trim());
      }
      if (isTTSEnabled) {
        speakTextAloud(customInputText.trim());
      }
      setCustomInputText('');
    }
  };

  const formatTimer = (s) => {
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const caller = scenario?.caller || {
    name: 'Unknown Number',
    number: '+91 98201 00000',
    isFlagged: false
  };

  // Theme adaptations based on Call Source
  const isWhatsApp = callSource === 'whatsapp';
  const isCellular = callSource === 'cellular';

  return (
    <div 
      className="call-overlay-screen" 
      id="live-call-screen"
      style={{
        background: isWhatsApp 
          ? 'linear-gradient(180deg, #0b141a 0%, #070d10 100%)' 
          : 'linear-gradient(180deg, #090e1c 0%, #030509 100%)'
      }}
    >
      {/* Call Source / Platform Switcher Tab Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        width: '100%',
        marginBottom: '0.4rem',
        padding: '0.2rem',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 'var(--radius-full)'
      }}>
        <button
          onClick={() => onChangeCallSource && onChangeCallSource('whatsapp')}
          style={{
            background: isWhatsApp ? '#25d366' : 'transparent',
            color: isWhatsApp ? '#000000' : '#94a3b8',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            padding: '0.25rem 0.65rem',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
          title="WhatsApp Audio / Video Call (Accessibility Hook: com.whatsapp)"
        >
          <MessageCircle size={12} />
          <span>WhatsApp</span>
        </button>

        <button
          onClick={() => onChangeCallSource && onChangeCallSource('cellular')}
          style={{
            background: isCellular ? '#38bdf8' : 'transparent',
            color: isCellular ? '#000000' : '#94a3b8',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            padding: '0.25rem 0.65rem',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
          title="Cellular Mobile Call (TelephonyManager: GSM/VoLTE)"
        >
          <Phone size={12} />
          <span>Mobile GSM</span>
        </button>

        <button
          onClick={() => setIsTTSEnabled(!isTTSEnabled)}
          style={{
            background: isTTSEnabled ? '#f59e0b' : 'transparent',
            color: isTTSEnabled ? '#000000' : '#94a3b8',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            padding: '0.25rem 0.55rem',
            fontSize: '0.68rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
          title="Speak Scammer Voice Aloud via Text-To-Speech in Indian Language"
        >
          {isTTSEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
          <span>{isTTSEnabled ? 'Voice ON' : 'Voice Muted'}</span>
        </button>
      </div>

      {/* WhatsApp / GSM Context Pill */}
      <div style={{
        fontSize: '0.68rem',
        color: isWhatsApp ? '#25d366' : '#38bdf8',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        background: isWhatsApp ? 'rgba(37, 211, 102, 0.1)' : 'rgba(56, 189, 248, 0.1)',
        padding: '0.2rem 0.6rem',
        borderRadius: 'var(--radius-full)'
      }}>
        {isWhatsApp ? <Lock size={10} /> : <Signal size={10} />}
        <span>
          {isWhatsApp 
            ? 'WhatsApp Audio Call · Hook Active (com.whatsapp)' 
            : 'SIM 1 (Jio 5G) · PhoneStateListener Active'}
        </span>
      </div>

      {/* Caller Header */}
      <div className="call-header-pulse" style={{ marginTop: '0.75rem' }}>
        <div className={`caller-avatar ${caller.isFlagged ? 'threat-flagged' : ''}`} style={{ borderColor: isWhatsApp ? '#25d366' : undefined }}>
          <User size={44} color="#f8fafc" />
        </div>

        <h2 className="caller-title">{caller.name}</h2>
        <p className="caller-number">{caller.number}</p>
        <span className="caller-timer">{formatTimer(seconds)}</span>

        {caller.isFlagged && (
          <div className="badge-pill danger" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldAlert size={12} />
            <span>National Threat Feed Match</span>
          </div>
        )}
      </div>

      {/* Dynamic Sound Wave Visualizer */}
      <div className="waveform-container" title="Real-Time 3s Streaming Audio Ingestion">
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
      </div>

      {/* Live Mic Status Indicator */}
      {isMicListening && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.35rem 0.65rem',
          fontSize: '0.72rem',
          color: '#fca5a5',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          marginBottom: '0.4rem'
        }}>
          <Radio size={12} className="nudge-icon" />
          <span>Listening to Microphone in <strong>{activeLanguage?.nativeName || 'हिन्दी'}</strong> ({activeLanguage?.speechLocale})</span>
        </div>
      )}

      {liveTranscript && (
        <div style={{
          fontSize: '0.72rem',
          color: '#38bdf8',
          fontStyle: 'italic',
          background: 'rgba(56, 189, 248, 0.08)',
          padding: '0.3rem 0.5rem',
          borderRadius: 'var(--radius-sm)',
          width: '100%',
          textAlign: 'center'
        }}>
          "{liveTranscript}"...
        </div>
      )}

      {/* Streaming 3-Second Text Transcript Buffer */}
      <div className="transcript-stream-box" id="transcript-stream-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Radio size={10} color={isWhatsApp ? '#25d366' : '#10b981'} />
            STREAM BUFFER ({activeLanguage?.name || 'Multilingual'} · {callSource.toUpperCase()})
          </span>
          <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: rollingC > 0.7 ? '#ef4444' : '#38bdf8' }}>
            C = {(rollingC * 100).toFixed(0)}%
          </span>
        </div>

        {chunkHistory.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.72rem', fontStyle: 'italic', textAlign: 'center', padding: '0.8rem 0' }}>
            Listening to call audio... Tap <strong>"Live Mic 🎤"</strong> to speak, or toggle <strong>"Voice ON 🔊"</strong> to hear call aloud.
          </div>
        ) : (
          chunkHistory.map((chunk, idx) => (
            <div 
              key={idx} 
              className={`transcript-chunk-bubble ${chunk.chunkScore >= 0.75 ? 'high-risk' : ''}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '0.15rem' }}>
                <span style={{ color: '#94a3b8' }}>Chunk #{idx + 1} (3s)</span>
                <span style={{ fontWeight: 700, color: chunk.chunkScore >= 0.75 ? '#ef4444' : '#10b981' }}>
                  Risk: {(chunk.chunkScore * 100).toFixed(0)}%
                </span>
              </div>
              <div>"{chunk.text}"</div>
            </div>
          ))
        )}
      </div>

      {/* Live Custom Text / Speech Input Field */}
      <form onSubmit={handleSendCustomText} style={{ display: 'flex', gap: '0.35rem', width: '100%', marginTop: '0.4rem' }}>
        <input 
          type="text"
          className="upi-text-input"
          style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
          placeholder={`Speak or test in ${activeLanguage?.nativeName || 'any language'}...`}
          value={customInputText}
          onChange={(e) => setCustomInputText(e.target.value)}
          id="input-live-speech-text"
        />
        <button 
          type="submit" 
          className="btn-primary" 
          style={{ padding: '0.4rem 0.7rem' }}
          title="Inject real-time speech chunk"
        >
          <Send size={13} />
        </button>
      </form>

      {/* Call Actions */}
      <div className="call-actions-row">
        {/* Toggle Real Microphone */}
        <button 
          className={`call-btn-circle ${isMicListening ? 'call-btn-end' : 'call-btn-mute'}`} 
          onClick={toggleMicListening}
          id="btn-toggle-live-mic"
          title={isMicListening ? 'Stop live microphone' : 'Start live microphone recognition'}
        >
          {isMicListening ? <Mic size={22} color="#ffffff" /> : <MicOff size={20} />}
        </button>

        <button 
          className="call-btn-circle call-btn-end" 
          onClick={onEndCall}
          id="btn-call-end"
          title="Disconnect call"
        >
          <PhoneOff size={22} />
        </button>

        <button 
          className="call-btn-circle call-btn-upi" 
          onClick={onOpenUPI}
          id="btn-open-upi-payment"
          title="Open UPI payment"
        >
          <CreditCard size={16} />
          <span>Pay via UPI</span>
        </button>
      </div>
    </div>
  );
}
