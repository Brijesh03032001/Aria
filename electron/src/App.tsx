import { VoiceAgent } from './components/VoiceAgent';

export default function App() {
  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
    }}>
      {/* Diffuse ambient glow behind the panel */}
      <div style={{
        position: 'absolute',
        width: '820px', height: '480px',
        borderRadius: '40px',
        background: `
          radial-gradient(ellipse 55% 40% at 30% 10%, rgba(109,114,255,0.18) 0%, transparent 70%),
          radial-gradient(ellipse 40% 30% at 80% 90%, rgba(167,139,250,0.1) 0%, transparent 70%)
        `,
        filter: 'blur(32px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* ── Glass Panel ────────────────────────────────────── */}
      <div style={{
        width: '760px', height: '440px',
        position: 'relative', zIndex: 1,
        borderRadius: '18px',
        /* Frosted glass */
        background: 'rgba(11, 12, 24, 0.84)',
        backdropFilter: 'blur(48px) saturate(200%) brightness(1.05)',
        WebkitBackdropFilter: 'blur(48px) saturate(200%) brightness(1.05)',
        /* Layered border: gradient stroke + inner highlight */
        border: '1px solid transparent',
        backgroundClip: 'padding-box',
        outline: '1px solid rgba(109,114,255,0.2)',
        outlineOffset: '-1px',
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.1),
          inset 0 -1px 0 rgba(0,0,0,0.3),
          0 4px 6px rgba(0,0,0,0.1),
          0 24px 48px rgba(0,0,0,0.55),
          0 48px 96px rgba(0,0,0,0.35),
          0 0 0 0.5px rgba(255,255,255,0.05) inset
        `,
        overflow: 'hidden',
      }}>
        {/* Sheen — very subtle, top edge light refraction */}
        <div style={{
          position: 'absolute', top: 0, left: '8%', right: '8%', height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 40%, rgba(255,255,255,0.22) 60%, transparent 100%)',
          pointerEvents: 'none', zIndex: 10,
        }} />

        {/* Vignette corners */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.25) 100%)',
          pointerEvents: 'none', zIndex: 2, borderRadius: '18px',
        }} />

        <VoiceAgent />
      </div>
    </div>
  );
}
