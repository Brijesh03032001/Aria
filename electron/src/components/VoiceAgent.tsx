import { useState, useCallback, useEffect, useRef } from "react";
import { useSocket } from "@/hooks/useSocket";
import { useOpenAISTT } from "@/hooks/useOpenAISTT";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import type { AgentState, TranscriptEntry } from "@/lib/types";

/* ── SVG icons ─────────────────────────────────────────────── */
const IconMic = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8"  y1="22" x2="16" y2="22"/>
  </svg>
);

const IconStop = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="5" width="14" height="14" rx="3"/>
  </svg>
);

const IconMutedMic = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="8"  y1="22" x2="16" y2="22"/>
  </svg>
);

/* ── State config ──────────────────────────────────────────── */
const S_COLOR: Record<AgentState, string> = {
  idle:      '#6d72ff',
  listening: '#34d399',
  thinking:  '#f59e0b',
  speaking:  '#a78bfa',
};
const S_LABEL: Record<AgentState, string> = {
  idle:      'Idle',
  listening: 'Listening',
  thinking:  'Thinking',
  speaking:  'Speaking',
};

/* ── Wave bars (shown while listening / speaking) ──────────── */
function WaveBars({ active, color }: { active: boolean; color: string }) {
  const bars = [0.5, 0.9, 0.6, 1.0, 0.7, 0.85, 0.5];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '3px', height: '20px',
      opacity: active ? 1 : 0.2, transition: 'opacity 0.3s',
    }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          width: '3px',
          height: `${h * 100}%`,
          borderRadius: '2px',
          background: color,
          animation: active ? `wave ${0.8 + i * 0.1}s ease-in-out infinite` : 'none',
          animationDelay: `${i * 0.08}s`,
        }} />
      ))}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────── */
export function VoiceAgent() {
  const [entries, setEntries]           = useState<TranscriptEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [agentState, setAgentState]     = useState<AgentState>('idle');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const streamingRef  = useRef('');
  const scrollRef     = useRef<HTMLDivElement>(null);
  const msgCountRef   = useRef(0);

  const {
    isConnected, sendMessage, stopAudio, serverState,
    onAssistantText, onAudioChunk, onAudioDone, onError, onConsoleLog, socketRef,
  } = useSocket();

  const { playChunk, stopPlayback, initAudio, isPlaying } = useAudioPlayer();

  const stopAudioRef    = useRef(stopAudio);
  const stopPlaybackRef = useRef(stopPlayback);
  const sendMsgRef      = useRef(sendMessage);
  const isPlayingRef    = useRef(isPlaying);
  useEffect(() => {
    stopAudioRef.current    = stopAudio;
    stopPlaybackRef.current = stopPlayback;
    sendMsgRef.current      = sendMessage;
    isPlayingRef.current    = isPlaying;
  }, [stopAudio, stopPlayback, sendMessage, isPlaying]);

  /* Barge-in */
  const handleBargeIn = useCallback(() => {
    if (!isPlayingRef.current()) return;
    stopPlaybackRef.current();
    stopAudioRef.current();
    if (streamingRef.current) {
      setEntries(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: streamingRef.current, timestamp: Date.now() }]);
      setStreamingText(''); streamingRef.current = '';
    }
  }, []);

  /* Final transcript */
  const handleFinal = useCallback((text: string) => {
    if (!text.trim()) return;
    msgCountRef.current++;
    if (msgCountRef.current === 1) { sendMsgRef.current(text.trim()); return; }
    setHasInteracted(true);
    setEntries(p => [...p, { id: crypto.randomUUID(), role: 'user', text: text.trim(), timestamp: Date.now() }]);
    sendMsgRef.current(text.trim());
  }, []);

  const { isListening, interimTranscript, startListening, stopListening, isMuted, toggleMute } =
    useOpenAISTT(handleFinal, handleBargeIn, socketRef);

  /* Socket handlers */
  useEffect(() => {
    onAssistantText((text, done) => {
      // Suppress the first (greeting) exchange
      if (msgCountRef.current <= 1) {
        if (done) { streamingRef.current = ''; setStreamingText(''); }
        return;
      }
      if (done) {
        // Commit whatever was buffered (could be empty if server sent all at once before done)
        const finalText = streamingRef.current || text;
        if (finalText) {
          setEntries(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: finalText, timestamp: Date.now() }]);
        }
        setStreamingText('');
        streamingRef.current = '';
      } else {
        // Accumulate chunks (or the full text if server sends it in one shot)
        if (text) {
          streamingRef.current += text;
          setStreamingText(streamingRef.current);
        }
      }
    });
    onAudioChunk(d => playChunk(d));
    onAudioDone(() => {});
    onError(msg => { setError(msg); setTimeout(() => setError(null), 5000); });
    onConsoleLog(msg => {
      if (msgCountRef.current <= 1) return;
      setEntries(p => [...p, { id: crypto.randomUUID(), role: 'console', text: msg, timestamp: Date.now() }]);
    });
  }, [onAssistantText, onAudioChunk, onAudioDone, onError, onConsoleLog, playChunk]);

  /* Derive state */
  useEffect(() => {
    if (serverState === 'thinking' || serverState === 'speaking') setAgentState(serverState);
    else if (isListening) setAgentState('listening');
    else setAgentState('idle');
  }, [isListening, serverState]);

  useEffect(() => {
    if (interimTranscript && !hasInteracted && msgCountRef.current >= 1) setHasInteracted(true);
  }, [interimTranscript, hasInteracted]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, streamingText]);

  const prevConnRef = useRef(false);
  useEffect(() => {
    if (isConnected && !prevConnRef.current) initAudio();
    prevConnRef.current = isConnected;
  }, [isConnected, initAudio]);

  const handleMicClick = useCallback(() => {
    initAudio();
    isListening ? stopListening() : startListening();
  }, [isListening, startListening, stopListening, initAudio]);

  const stateColor  = S_COLOR[agentState];
  const showWaves   = isListening || agentState === 'speaking';
  // Show chat log any time there is content — don't rely solely on hasInteracted
  const hasChatContent = entries.length > 0 || !!streamingText;
  const showInterim    = !!(interimTranscript && hasInteracted);
  const showWelcome    = !hasChatContent && !showInterim;

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{
      width: '760px', height: '440px',
      display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden', zIndex: 3,
    }}>

      {/* ═══ TITLE BAR ═══════════════════════════════════════ */}
      <div
        className="drag-region"
        style={{
          height: '44px', flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 14px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          gap: '0',
        }}
      >
        {/* macOS traffic-light buttons — LEFT side, native feel */}
        <div className="no-drag" style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
          <TrafficBtn color="#ff5f57" title="Hide (⌘⇧V to restore)"  onClick={() => (window as any).electron?.hideWindow?.()}    />
          <TrafficBtn color="#febc2e" title="Minimize"               onClick={() => (window as any).electron?.minimizeWindow?.()} />
          <TrafficBtn color="#28c840" title="Toggle overlay"         onClick={() => (window as any).electron?.toggleOverlay?.()}  />
        </div>

        {/* Centered brand */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', pointerEvents: 'none',
        }}>
          {/* Gradient brand mark */}
          <div style={{
            width: '18px', height: '18px', borderRadius: '5px',
            background: 'linear-gradient(135deg, #6d72ff 0%, #a78bfa 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(109,114,255,0.4)',
            flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
              <circle cx="5" cy="5" r="2" />
              <circle cx="1.5" cy="2" r="1" opacity="0.7"/>
              <circle cx="8.5" cy="2" r="1" opacity="0.7"/>
              <circle cx="1.5" cy="8" r="1" opacity="0.7"/>
              <circle cx="8.5" cy="8" r="1" opacity="0.7"/>
            </svg>
          </div>

          <span style={{
            fontSize: '13px', fontWeight: '600',
            letterSpacing: '-0.01em',
            background: 'linear-gradient(90deg, #c7c9ff, #e0d9ff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          }}>
            SynapseOS
          </span>
        </div>

        {/* Right — state indicator */}
        <div className="no-drag" style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '20px',
          padding: '3px 10px 3px 7px',
          minWidth: '100px', justifyContent: 'center',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: stateColor,
            boxShadow: `0 0 6px ${stateColor}`,
            transition: 'background 0.35s, box-shadow 0.35s',
            flexShrink: 0,
            animation: agentState !== 'idle' ? 'status-dot 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{
            fontSize: '11px', fontWeight: '500',
            color: stateColor,
            transition: 'color 0.35s',
            letterSpacing: '0.02em',
            fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
          }}>
            {S_LABEL[agentState]}
          </span>
        </div>
      </div>

      {/* ═══ CONTENT ═════════════════════════════════════════ */}
      <div
        ref={scrollRef}
        className="custom-scrollbar"
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '12px 24px 8px',
          display: 'flex', flexDirection: 'column',
          justifyContent: (showInterim || showWelcome) ? 'center' : 'flex-end',
          alignItems:     (showInterim || showWelcome) ? 'center' : 'stretch',
        }}
      >

        {/* Live speech display */}
        {showInterim ? (
          <div style={{
            textAlign: 'center',
            maxWidth: '600px',
            fontSize: '17px', fontWeight: '300',
            color: 'rgba(240,241,255,0.88)',
            lineHeight: 1.55,
            letterSpacing: '-0.01em',
            fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          }}>
            {interimTranscript}
          </div>

        ) : showWelcome ? (
          /* ── Welcome / idle screen ── */
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>

            {/* Glowing orb mic */}
            <div style={{ position: 'relative', width: '72px', height: '72px' }}>
              {/* Outer ring glow */}
              <div style={{
                position: 'absolute', inset: '-10px',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${stateColor}22 0%, transparent 70%)`,
                animation: 'orb-pulse 3s ease-in-out infinite',
              }} />
              {/* Orb */}
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: `linear-gradient(145deg, rgba(109,114,255,0.28) 0%, rgba(167,139,250,0.18) 100%)`,
                border: '1px solid rgba(109,114,255,0.35)',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(109,114,255,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(200,202,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              </div>
            </div>

            <div>
              <div style={{
                fontSize: '22px', fontWeight: '500', letterSpacing: '-0.4px',
                color: 'rgba(240,241,255,0.92)',
                marginBottom: '6px',
                fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
              }}>
                Hello, Brijesh.
              </div>
              <div style={{
                fontSize: '12.5px', color: 'rgba(170,172,220,0.45)',
                fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
              }}>
                {isConnected ? 'Press the mic button to begin' : 'Connecting to server…'}
              </div>
            </div>
          </div>

        ) : (
          /* ── Chat log ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {entries.map(entry => (
              <div key={entry.id} className="bubble-in" style={{
                display: 'flex',
                justifyContent: entry.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                {entry.role === 'console' ? (
                  <span style={{
                    fontSize: '10.5px',
                    color: 'rgba(170,172,220,0.3)',
                    fontStyle: 'italic',
                    fontFamily: '"SF Mono", "Fira Code", monospace',
                    paddingLeft: '2px',
                  }}>
                    › {entry.text}
                  </span>
                ) : (
                  <div style={{
                    padding: '9px 14px',
                    borderRadius: entry.role === 'user' ? '16px 16px 5px 16px' : '16px 16px 16px 5px',
                    maxWidth: '76%',
                    fontSize: '13.5px', lineHeight: '1.6', fontWeight: '400',
                    letterSpacing: '0.005em',
                    fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
                    ...(entry.role === 'user' ? {
                      color: 'rgba(218,220,255,0.95)',
                      background: 'rgba(109,114,255,0.18)',
                      border: '1px solid rgba(109,114,255,0.32)',
                      boxShadow: '0 2px 12px rgba(109,114,255,0.1)',
                    } : {
                      color: 'rgba(235,237,255,0.9)',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }),
                  }}>
                    {entry.text}
                  </div>
                )}
              </div>
            ))}

            {/* Streaming bubble */}
            {streamingText && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '9px 14px',
                  borderRadius: '16px 16px 16px 5px',
                  maxWidth: '76%',
                  fontSize: '13.5px', lineHeight: '1.6', fontWeight: '400',
                  color: 'rgba(235,237,255,0.9)',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif',
                }}>
                  {streamingText}
                  <span style={{
                    display: 'inline-block', width: '2px', height: '14px',
                    background: 'rgba(109,114,255,0.9)',
                    marginLeft: '3px', verticalAlign: 'middle',
                    borderRadius: '1px', animation: 'blink 1s infinite',
                  }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ BOTTOM BAR ══════════════════════════════════════ */}
      <div
        className="no-drag"
        style={{
          height: '72px', flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '14px',
          padding: '0 24px',
          position: 'relative',
        }}
      >
        {/* Mute pill — only while listening */}
        {isListening && (
          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: isMuted ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isMuted ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.1)'}`,
              color: isMuted ? '#f59e0b' : 'rgba(180,182,220,0.6)',
              fontSize: '12px', fontWeight: '500', cursor: 'pointer',
              transition: 'all 0.2s', outline: 'none',
            }}
          >
            <IconMutedMic />
            <span>{isMuted ? 'Muted' : 'Live'}</span>
          </button>
        )}

        {/* Wave bars */}
        <WaveBars active={showWaves} color={stateColor} />

        {/* ── Mic orb ── */}
        <div style={{ position: 'relative' }}>
          {/* Pulse ring when active */}
          {(isListening || agentState === 'speaking') && (
            <div style={{
              position: 'absolute', inset: '-8px', borderRadius: '50%',
              border: `1.5px solid ${stateColor}50`,
              animation: isListening ? 'orb-listen 2s ease-in-out infinite' : 'orb-pulse 2s ease-in-out infinite',
              pointerEvents: 'none',
            }} />
          )}

          <button
            onClick={isConnected ? handleMicClick : undefined}
            title={isListening ? 'Stop listening' : 'Start listening'}
            style={{
              width: '52px', height: '52px', borderRadius: '50%',
              border: `1.5px solid ${isListening ? 'rgba(52,211,153,0.5)' : 'rgba(109,114,255,0.4)'}`,
              background: isListening
                ? 'radial-gradient(circle at 35% 35%, rgba(52,211,153,0.28), rgba(52,211,153,0.14))'
                : 'radial-gradient(circle at 35% 35%, rgba(109,114,255,0.3), rgba(109,114,255,0.14))',
              backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              opacity: isConnected ? 1 : 0.35,
              color: isListening ? '#6ee7b7' : '#a5b4fc',
              transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              outline: 'none',
              boxShadow: isListening
                ? '0 0 20px rgba(52,211,153,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
                : '0 0 16px rgba(109,114,255,0.25), inset 0 1px 0 rgba(255,255,255,0.12)',
            }}
          >
            {isListening ? <IconStop /> : <IconMic />}
          </button>
        </div>

        {/* Wave bars mirror */}
        <WaveBars active={showWaves} color={stateColor} />

        {/* Keyboard hint — far right */}
        <div style={{
          position: 'absolute', right: '16px',
          fontSize: '10px',
          color: 'rgba(150,152,200,0.22)',
          fontFamily: '"SF Mono", monospace',
          letterSpacing: '0.04em',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          ⌘⇧V
        </div>
      </div>

      {/* ═══ ERROR TOAST ══════════════════════════════════════ */}
      {error && (
        <div style={{
          position: 'absolute', bottom: '80px', left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          background: 'rgba(239,68,68,0.16)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(239,68,68,0.32)',
          borderRadius: '10px',
          color: '#fca5a5', fontSize: '12px', fontWeight: '500',
          whiteSpace: 'nowrap', zIndex: 30,
        }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

/* ── Traffic-light button ───────────────────────────────────── */
function TrafficBtn({ color, title, onClick }: { color: string; title: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: '13px', height: '13px', borderRadius: '50%',
        background: hov ? color : `${color}bb`,
        border: `0.5px solid rgba(0,0,0,0.2)`,
        cursor: 'pointer',
        transition: 'background 0.15s',
        boxShadow: hov ? `0 0 6px ${color}88` : 'none',
        flexShrink: 0,
      }}
    />
  );
}
