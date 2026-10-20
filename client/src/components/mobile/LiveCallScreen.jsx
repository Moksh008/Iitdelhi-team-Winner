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
  Signal,
  AlertTriangle,
  Flame,
  Zap,
  ShieldCheck,
  Bot,
  HeartHandshake,
  BellRing
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
  onChangeCallSource,
  detectedTactics = [],
  voiceCloneScore = 0.08,
  isVoiceCloneDetected = false,
  lastDispatchedSOS = null,
  grandmaModeEnabled = false,
  onToggleGrandmaMode,
  onTriggerSOS
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

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = activeLanguage?.speechLocale || 'hi-IN';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

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
      {/* Top Multi-Platform & Control Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: '0.35rem',
        padding: '0.2rem 0.4rem',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 'var(--radius-full)'
      }}>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => onChangeCallSource && onChangeCallSource('whatsapp')}
            style={{
              background: isWhatsApp ? '#25d366' : 'transparent',
              color: isWhatsApp ? '#000000' : '#94a3b8',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '0.25rem 0.55rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <MessageCircle size={11} />
            <span>WhatsApp</span>
          </button>

          <button
            onClick={() => onChangeCallSource && onChangeCallSource('cellular')}
            style={{
              background: isCellular ? '#38bdf8' : 'transparent',
              color: isCellular ? '#000000' : '#94a3b8',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '0.25rem 0.55rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <Phone size={11} />
            <span>GSM</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {/* Grandma Mode Toggle */}
          <button
            onClick={onToggleGrandmaMode}
            style={{
              background: grandmaModeEnabled ? '#a855f7' : 'rgba(255,255,255,0.08)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '0.25rem 0.5rem',
              fontSize: '0.65rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
            title="Senior Citizen Auto-Lock Safeguard"
          >
            <HeartHandshake size={11} />
            <span>{grandmaModeEnabled ? 'Grandma Mode ON' : 'Grandma Mode'}</span>
          </button>

          {/* TTS Audio Speak Out */}
          <button
            onClick={() => setIsTTSEnabled(!isTTSEnabled)}
            style={{
              background: isTTSEnabled ? '#f59e0b' : 'rgba(255,255,255,0.08)',
              color: isTTSEnabled ? '#000000' : '#94a3b8',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '0.25rem 0.5rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem'
            }}
            title="Speak caller chunk aloud via Text-to-Speech"
          >
            {isTTSEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
            <span>{isTTSEnabled ? 'Audio' : 'Mute'}</span>
          </button>
        </div>
      </div>

      {/* Emergency Guardian SOS Bar (if dispatched) */}
      {lastDispatchedSOS && (
        <div style={{
          width: '100%',
          background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
          color: '#ffffff',
          padding: '0.4rem 0.6rem',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.68rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.35rem',
          animation: 'pulse 1.8s infinite',
          boxShadow: '0 0 15px rgba(239, 68, 68, 0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <BellRing size={13} />
            <span>EMERGENCY SOS SENT TO {lastDispatchedSOS.guardian.name.toUpperCase()}</span>
          </div>
          <span style={{ fontSize: '0.62rem', background: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
            DISPATCHED
          </span>
        </div>
      )}

      {/* Acoustic Voice Clone & Anti-Spoofing Pill (from deepfake-shield-agent) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '0.25rem 0.6rem',
        borderRadius: 'var(--radius-full)',
        fontSize: '0.65rem',
        marginBottom: '0.3rem',
        background: isVoiceCloneDetected ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.12)',
        border: `1px solid ${isVoiceCloneDetected ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.3)'}`,
        color: isVoiceCloneDetected ? '#fca5a5' : '#6ee7b7'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          {isVoiceCloneDetected ? <Bot size={12} color="#ef4444" /> : <ShieldCheck size={12} color="#10b981" />}
          <span>
            {isVoiceCloneDetected 
              ? 'WARNING: AI Synthetic Voice Clone Detected' 
              : 'Acoustic Biometrics: Natural Human Vocal Tract'}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
          {isVoiceCloneDetected ? `${(voiceCloneScore * 100).toFixed(0)}% SYNTHETIC` : 'AUTHENTIC'}
        </span>
      </div>

      {/* Caller Header */}
      <div className="call-header-pulse" style={{ marginTop: '0.3rem' }}>
        <div className={`caller-avatar ${caller.isFlagged ? 'threat-flagged' : ''}`} style={{ borderColor: isWhatsApp ? '#25d366' : undefined, width: '60px', height: '60px' }}>
          <User size={34} color="#f8fafc" />
        </div>

        <h2 className="caller-title" style={{ fontSize: '1.05rem', margin: '0.25rem 0 0.1rem' }}>{caller.name}</h2>
        <p className="caller-number" style={{ fontSize: '0.72rem', margin: 0 }}>{caller.number}</p>
        <span className="caller-timer" style={{ fontSize: '0.75rem' }}>{formatTimer(seconds)}</span>
      </div>

      {/* Psychological Tactics Radar Badges (from ScamVoice- & CallShield-AI) */}
      {detectedTactics.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.25rem',
          justifyContent: 'center',
          width: '100%',
          margin: '0.35rem 0'
        }}>
          {detectedTactics.map((tactic, i) => (
            <span 
              key={i} 
              style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                padding: '0.15rem 0.45rem',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#fca5a5',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              <Flame size={10} color="#f87171" />
              {tactic}
            </span>
          ))}
        </div>
      )}

      {/* Dynamic Sound Wave Visualizer */}
      <div className="waveform-container" style={{ margin: '0.3rem 0' }}>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
        <div className="wave-bar" style={{ background: isWhatsApp ? '#25d366' : undefined }}></div>
      </div>

      {/* Live Mic Indicator */}
      {isMicListening && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.25rem 0.5rem',
          fontSize: '0.68rem',
          color: '#fca5a5',
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginBottom: '0.25rem'
        }}>
          <Radio size={11} className="nudge-icon" />
          <span>Listening to Microphone in <strong>{activeLanguage?.nativeName || 'हिन्दी'}</strong></span>
        </div>
      )}

      {/* Streaming 3-Second Text Transcript Buffer */}
      <div className="transcript-stream-box" id="transcript-stream-box" style={{ maxHeight: '120px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Radio size={9} color={isWhatsApp ? '#25d366' : '#10b981'} />
            STREAM BUFFER ({activeLanguage?.name || 'Indic'} · {callSource.toUpperCase()})
          </span>
          <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: rollingC > 0.7 ? '#ef4444' : '#38bdf8', fontWeight: 700 }}>
            C = {(rollingC * 100).toFixed(0)}%
          </span>
        </div>

        {chunkHistory.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '0.7rem', fontStyle: 'italic', textAlign: 'center', padding: '0.6rem 0' }}>
            Listening... PII is scrubbed on-device in accordance with DPDP Act 2023.
          </div>
        ) : (
          chunkHistory.map((chunk, idx) => (
            <div 
              key={idx} 
              className={`transcript-chunk-bubble ${chunk.chunkScore >= 0.75 ? 'high-risk' : ''}`}
              style={{ fontSize: '0.72rem', padding: '0.35rem 0.5rem', marginBottom: '0.25rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', marginBottom: '0.1rem' }}>
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
      <form onSubmit={handleSendCustomText} style={{ display: 'flex', gap: '0.3rem', width: '100%', marginTop: '0.3rem' }}>
        <input 
          type="text"
          className="upi-text-input"
          style={{ fontSize: '0.72rem', padding: '0.35rem 0.55rem' }}
          placeholder={`Speak or inject speech chunk...`}
          value={customInputText}
          onChange={(e) => setCustomInputText(e.target.value)}
          id="input-live-speech-text"
        />
        <button 
          type="submit" 
          className="btn-primary" 
          style={{ padding: '0.35rem 0.65rem' }}
          title="Inject real-time speech chunk"
        >
          <Send size={12} />
        </button>
      </form>

      {/* Call Actions */}
      <div className="call-actions-row" style={{ marginTop: '0.45rem' }}>
        {/* Toggle Real Microphone */}
        <button 
          className={`call-btn-circle ${isMicListening ? 'call-btn-end' : 'call-btn-mute'}`} 
          onClick={toggleMicListening}
          id="btn-toggle-live-mic"
          title={isMicListening ? 'Stop live microphone' : 'Start live microphone recognition'}
          style={{ width: '42px', height: '42px' }}
        >
          {isMicListening ? <Mic size={18} color="#ffffff" /> : <MicOff size={18} />}
        </button>

        <button 
          className="call-btn-circle call-btn-end" 
          onClick={onEndCall}
          id="btn-call-end"
          title="Disconnect call"
          style={{ width: '48px', height: '48px' }}
        >
          <PhoneOff size={20} />
        </button>

        <button 
          className="call-btn-circle call-btn-upi" 
          onClick={onOpenUPI}
          id="btn-open-upi-payment"
          title="Open UPI payment"
          style={{ 
            opacity: grandmaModeEnabled && rollingC >= 0.6 ? 0.5 : 1.0,
            cursor: grandmaModeEnabled && rollingC >= 0.6 ? 'not-allowed' : 'pointer'
          }}
        >
          <CreditCard size={15} />
          <span>{grandmaModeEnabled && rollingC >= 0.6 ? 'UPI Locked' : 'Pay via UPI'}</span>
        </button>
      </div>
    </div>
  );
}
