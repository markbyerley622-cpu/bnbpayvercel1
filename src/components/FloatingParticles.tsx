import { useEffect, useRef, useState } from 'react';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  wobble: number;
  wobbleSpeed: number;
}

export function FloatingParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const animationRef = useRef<number>();
  const particleIdRef = useRef(0);

  useEffect(() => {
    // Create initial particles
    const initialParticles: Particle[] = [];
    for (let i = 0; i < 25; i++) {
      initialParticles.push({
        id: particleIdRef.current++,
        x: Math.random() * 100,
        y: Math.random() * 120, // Start some above viewport
        size: Math.random() * 80 + 40,
        speed: Math.random() * 0.3 + 0.1,
        opacity: Math.random() * 0.5 + 0.3,
        wobble: 0,
        wobbleSpeed: Math.random() * 0.02 + 0.01,
      });
    }
    setParticles(initialParticles);

    // Animation loop
    let lastTime = performance.now();
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 16.67; // Normalize to ~60fps
      lastTime = currentTime;

      setParticles(prev => prev.map(particle => {
        let newY = particle.y - particle.speed * deltaTime;
        let newWobble = particle.wobble + particle.wobbleSpeed * deltaTime;

        // Reset particle when it goes off screen
        if (newY < -15) {
          return {
            ...particle,
            id: particleIdRef.current++,
            x: Math.random() * 100,
            y: 110,
            size: Math.random() * 80 + 40,
            speed: Math.random() * 0.3 + 0.1,
            opacity: Math.random() * 0.5 + 0.3,
            wobble: 0,
          };
        }

        return {
          ...particle,
          y: newY,
          wobble: newWobble,
        };
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'hidden',
      }}
    >
      {particles.map(particle => {
        const wobbleX = Math.sin(particle.wobble) * 20;
        return (
          <div
            key={particle.id}
            style={{
              position: 'absolute',
              left: `calc(${particle.x}% + ${wobbleX}px)`,
              top: `${particle.y}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(240, 185, 11, ${particle.opacity}) 0%, rgba(240, 185, 11, ${particle.opacity * 0.5}) 40%, transparent 70%)`,
              filter: 'blur(1px)',
              transform: 'translate(-50%, -50%)',
            }}
          />
        );
      })}
    </div>
  );
}

export function SparkleEffect() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const interval = setInterval(() => {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle';
      sparkle.style.left = `${Math.random() * 100}%`;
      sparkle.style.top = `${Math.random() * 100}%`;

      container.appendChild(sparkle);

      setTimeout(() => {
        if (sparkle.parentNode === container) {
          sparkle.remove();
        }
      }, 2000);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return <div ref={containerRef} className="sparkle-container" />;
}
