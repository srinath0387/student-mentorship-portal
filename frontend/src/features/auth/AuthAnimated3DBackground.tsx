import React, { useMemo } from 'react';

const SPHERE_DOTS_COUNT = 20;
const SPHERE_RADIUS = 420;
const DOT_COLORS = ['#8B7FFF', '#38D9E8', '#FF6B5E'];
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~2.39996323

export const AuthAnimated3DBackground: React.FC = () => {
  // Precompute 20 sphere dots using Fibonacci golden spiral distribution
  const sphereDots = useMemo(() => {
    return Array.from({ length: SPHERE_DOTS_COUNT }, (_, i) => {
      const y = 1 - (i / (SPHERE_DOTS_COUNT - 1)) * 2; // 1 to -1
      const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = GOLDEN_ANGLE * i;
      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      return {
        id: i,
        x: Math.round(x * SPHERE_RADIUS * 100) / 100,
        y: Math.round(y * SPHERE_RADIUS * 100) / 100,
        z: Math.round(z * SPHERE_RADIUS * 100) / 100,
        color: DOT_COLORS[i % DOT_COLORS.length],
        size: i % 3 === 0 ? 8 : i % 2 === 0 ? 7 : 6,
      };
    });
  }, []);

  // Precompute 50 ambient particles with deterministic positions and timings
  const ambientParticles = useMemo(() => {
    const particleColors = ['#8B7FFF', '#38D9E8', '#FF6B5E', '#FFFFFF', '#8B7FFF', '#38D9E8'];
    return Array.from({ length: 50 }, (_, i) => {
      // Deterministic pseudo-random generation based on index
      const seed1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      const seed2 = Math.cos(i * 34.1234 + 45.678) * 23421.6312;
      const seed3 = Math.sin(i * 56.7891 + 12.345) * 56789.1234;

      const left = Math.abs(seed1 % 1) * 100;
      const top = Math.abs(seed2 % 1) * 100;
      const duration = 5 + (Math.abs(seed3 % 1) * 6); // 5s to 11s
      const delay = -1 * (Math.abs(seed1 % 1) * 10); // staggered negative delay
      const opacity = 0.25 + (Math.abs(seed2 % 1) * 0.6); // 0.25 to 0.85
      const size = 2 + (Math.abs(seed3 % 1) * 3); // 2px to 5px
      const color = particleColors[i % particleColors.length];

      return {
        id: i,
        left: `${left.toFixed(2)}vw`,
        top: `${top.toFixed(2)}vh`,
        duration: `${duration.toFixed(2)}s`,
        delay: `${delay.toFixed(2)}s`,
        opacity: opacity.toFixed(2),
        size: Math.round(size),
        color,
      };
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden select-none"
      style={{
        zIndex: 0,
        background: `
          radial-gradient(circle at 20% 20%, rgba(91,79,224,0.25), transparent 55%),
          radial-gradient(circle at 80% 80%, rgba(56,217,232,0.15), transparent 50%),
          linear-gradient(160deg, #0C1128 0%, #070A17 100%)
        `,
      }}
    >
      {/* ── 1. Faint Grid-Line Texture ── */}
      <div
        className="absolute inset-0 w-full h-full opacity-100 pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.035) 0px, rgba(255, 255, 255, 0.035) 1px, transparent 1px, transparent 38px),
            repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0px, rgba(255, 255, 255, 0.035) 1px, transparent 1px, transparent 38px)
          `,
        }}
      />

      {/* ── 2. Rotating 3D Sphere & Orbit Rings Container ── */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none"
        style={{
          perspective: '1200px',
          width: '900px',
          height: '900px',
        }}
      >
        {/* Glowing Center Core */}
        <div
          className="absolute w-72 h-72 rounded-full pointer-events-none animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(139,127,255,0.3) 0%, rgba(56,217,232,0.15) 45%, transparent 70%)',
            filter: 'blur(32px)',
            animationDuration: '4s',
          }}
        />

        {/* Orbit Ring 1 (tilted 72deg X, 15deg Y) */}
        <div
          className="absolute rounded-full border border-indigo-400/20 pointer-events-none"
          style={{
            width: '860px',
            height: '860px',
            transform: 'rotateX(72deg) rotateY(15deg)',
            boxShadow: '0 0 25px rgba(139, 127, 255, 0.12), inset 0 0 20px rgba(139, 127, 255, 0.08)',
          }}
        />

        {/* Orbit Ring 2 (tilted 60deg X, -35deg Y) */}
        <div
          className="absolute rounded-full border border-cyan-400/20 pointer-events-none"
          style={{
            width: '900px',
            height: '900px',
            transform: 'rotateX(60deg) rotateY(-35deg)',
            boxShadow: '0 0 25px rgba(56, 217, 232, 0.12), inset 0 0 20px rgba(56, 217, 232, 0.08)',
          }}
        />

        {/* 3D Rotating Sphere (preserve-3d + rotateY 360deg over ~22s linear infinite) */}
        <div
          className="absolute w-full h-full flex items-center justify-center pointer-events-none"
          style={{
            transformStyle: 'preserve-3d',
            animation: 'rotateSphere3D 22s linear infinite',
          }}
        >
          {sphereDots.map((dot) => (
            <div
              key={dot.id}
              className="absolute rounded-full pointer-events-none"
              style={{
                width: `${dot.size}px`,
                height: `${dot.size}px`,
                backgroundColor: dot.color,
                boxShadow: `0 0 8px ${dot.color}, 0 0 16px ${dot.color}, 0 0 24px ${dot.color}`,
                transform: `translate3d(${dot.x}px, ${dot.y}px, ${dot.z}px)`,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── 3. ~50 Ambient Floating Particles Across Viewport ── */}
      <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden">
        {ambientParticles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.opacity,
              boxShadow: `0 0 6px ${p.color}, 0 0 12px ${p.color}`,
              animation: `floatAmbientParticle ${p.duration} ease-in-out infinite alternate`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* ── CSS Keyframe Animations Embedded ── */}
      <style>{`
        @keyframes rotateSphere3D {
          0% {
            transform: rotateY(0deg) rotateX(12deg);
          }
          100% {
            transform: rotateY(360deg) rotateX(12deg);
          }
        }
        @keyframes floatAmbientParticle {
          0% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-18px) scale(1.15);
          }
          100% {
            transform: translateY(12px) scale(0.9);
          }
        }
      `}</style>
    </div>
  );
};
