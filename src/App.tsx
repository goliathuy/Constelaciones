/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { 
  Activity, 
  RotateCcw, 
  Sparkles, 
  Zap, 
  Anchor, 
  Info, 
  Volume2, 
  VolumeX, 
  Play, 
  HelpCircle, 
  X,
  Compass,
  TrendingUp,
  Award,
  Cpu,
  Smartphone
} from 'lucide-react';
import { 
  GameNode, 
  GameMetrics, 
  GameEvent, 
  EventType, 
  PHYSICS_CONFIG, 
  SystemZone 
} from './types';
import { 
  generateInitialNodes, 
  generateIncomingNode, 
  updatePhysics, 
  calculateGameMetrics 
} from './lib/physics';
import { ambientSynth } from './lib/audio';

export default function App() {
  // Canvas and sizing refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Core Game Loop State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(true);
  const [audioActive, setAudioActive] = useState<boolean>(false);

  // Mobile / Performance Mode State
  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    }
    return false;
  });

  const toggleMobileMode = () => {
    setIsMobileMode(prev => {
      const nextVal = !prev;
      // If we are turning mobile/low-perf mode ON, trim excess nodes immediately to prevent lag
      if (nextVal && nodesRef.current.length > 55) {
        let activeCount = 0;
        nodesRef.current.forEach(node => {
          if (!node.isGhost) {
            activeCount++;
            if (activeCount > 55) {
              node.isGhost = true;
              node.ghostProgress = 1.0;
            }
          }
        });
      }
      return nextVal;
    });
  };
  
  // Scoring & Metrics (synchronized to React State for UI HUD)
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('constelaciones_high_score');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  
  const [metrics, setMetrics] = useState<GameMetrics>({
    crowding: 0,
    isolation: 0,
    health: 50,
    clusterQuality: 0,
    connectivity: 0,
    clusterCount: 0
  });

  // Timers & Cooldowns
  const [criticalSecondsLeft, setCriticalSecondsLeft] = useState<number>(10.0);
  const [pulseCooldown, setPulseCooldown] = useState<number>(0); // seconds left
  const [resonanceCooldown, setResonanceCooldown] = useState<number>(0); // seconds left
  const [resonanceDurationLeft, setResonanceDurationLeft] = useState<number>(0); // seconds active
  
  // Interaction Settings
  const [interactionMode, setInteractionMode] = useState<'attract' | 'repel'>('repel');

  // Active Environmental Event State
  const [activeEvent, setActiveEvent] = useState<GameEvent>({
    type: 'NONE',
    name: 'Estable',
    description: 'La red social se comporta de forma orgánica.',
    durationLeft: 0,
    totalDuration: 0
  });

  // Refs for high-frequency physics variables to avoid React render lags
  const nodesRef = useRef<GameNode[]>([]);
  const metricsRef = useRef<GameMetrics>({
    crowding: 0,
    isolation: 0,
    health: 50,
    clusterQuality: 0,
    connectivity: 0,
    clusterCount: 0
  });
  
  // Input tracking
  const anchorPosRef = useRef<{ x: number; y: number } | null>(null);
  const pulseRef = useRef<{ x: number; y: number; time: number; type: 'attract' | 'repel' } | null>(null);
  const resonanceActiveRef = useRef<boolean>(false);
  
  // Game timings
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const eventChangeTimerRef = useRef<number>(0);
  const criticalTimerRef = useRef<number | null>(null); // holds interval timestamp
  
  // Ripple animation rings for visual feedback on Pulse/Anchor
  const ripplesRef = useRef<Array<{ x: number; y: number; r: number; maxR: number; opacity: number; color: string }>>([]);

  // Read High Score on Init
  useEffect(() => {
    try {
      const saved = localStorage.getItem('constelaciones_high_score');
      if (saved) setHighScore(parseInt(saved, 10));
    } catch (e) {
      console.warn('Unable to access localStorage:', e);
    }
  }, []);

  // Set up audio activation helper
  const toggleAudio = () => {
    if (audioActive) {
      ambientSynth.stop();
      setAudioActive(false);
    } else {
      ambientSynth.start();
      ambientSynth.updateHealth(metricsRef.current.health);
      setAudioActive(true);
    }
  };

  // Start / Reset Game
  const handleStartGame = () => {
    setIsGameOver(false);
    setIsPlaying(true);
    setScore(0);
    setCriticalSecondsLeft(10.0);
    setPulseCooldown(0);
    setResonanceCooldown(0);
    setResonanceDurationLeft(0);
    
    // Create baseline nodes
    const width = canvasRef.current?.width || window.innerWidth;
    const height = canvasRef.current?.height || window.innerHeight;
    nodesRef.current = generateInitialNodes(isMobileMode ? 25 : PHYSICS_CONFIG.INITIAL_NODES, width, height);
    
    // Clear interactive inputs
    anchorPosRef.current = null;
    pulseRef.current = null;
    resonanceActiveRef.current = false;
    ripplesRef.current = [];
    
    // Initialize timing
    lastTimeRef.current = performance.now();
    spawnTimerRef.current = 0;
    // Set next event countdown
    eventChangeTimerRef.current = 10.0 + Math.random() * 10.0;
    
    setActiveEvent({
      type: 'NONE',
      name: 'Estable',
      description: 'La red social se comporta de forma orgánica.',
      durationLeft: 0,
      totalDuration: 0
    });

    if (audioActive) {
      ambientSynth.updateHealth(50);
    }
  };

  // Trigger global Pulse action
  const triggerPulse = (x: number, y: number) => {
    if (pulseCooldown > 0) return;
    
    // Set active pulse config
    pulseRef.current = {
      x,
      y,
      time: Date.now(),
      type: interactionMode
    };

    // Add glowing wave visual ripples
    const ringColor = interactionMode === 'attract' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(239, 68, 68, 0.5)';
    ripplesRef.current.push({
      x,
      y,
      r: 10,
      maxR: 120,
      opacity: 0.8,
      color: ringColor
    });

    // Pulse feedback ripple secondary
    setTimeout(() => {
      ripplesRef.current.push({
        x,
        y,
        r: 5,
        maxR: 80,
        opacity: 0.6,
        color: ringColor
      });
    }, 100);

    // Apply cooldown (2 seconds as per specifications)
    setPulseCooldown(2.0);
  };

  // Trigger Resonance action
  const triggerResonance = () => {
    if (resonanceCooldown > 0 || resonanceDurationLeft > 0) return;

    resonanceActiveRef.current = true;
    setResonanceDurationLeft(5.0); // Active for 5s
    
    // Add multiple visual shock ripples
    const width = canvasRef.current?.width || window.innerWidth;
    const height = canvasRef.current?.height || window.innerHeight;
    
    ripplesRef.current.push({
      x: width / 2,
      y: height / 2,
      r: 10,
      maxR: Math.max(width, height) * 0.7,
      opacity: 0.9,
      color: 'rgba(168, 85, 247, 0.6)' // glowing purple resonance wave
    });

    // Visual feedback energy burst on all nodes
    nodesRef.current.forEach(n => {
      n.energy = 1.0;
    });
  };

  // Handles Canvas Mouse Down (Triggers Pulse and begins Anchor Gravitational Hold)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying || isGameOver) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Trigger pulse on primary click
    if (pulseCooldown <= 0) {
      triggerPulse(x, y);
    }

    // Set position of gravity Anchor
    anchorPosRef.current = { x, y };

    // Set visual Anchor ring feedback
    ripplesRef.current.push({
      x,
      y,
      r: 20,
      maxR: 180,
      opacity: 0.4,
      color: 'rgba(56, 189, 248, 0.2)'
    });
  };

  // Updates Gravity Anchor position
  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPlaying || isGameOver || !anchorPosRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    anchorPosRef.current = { x, y };
  };

  // Releases Gravity Anchor hold
  const handleCanvasPointerUp = () => {
    anchorPosRef.current = null;
  };

  // Handles Spacebar trigger for Resonance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPlaying && !isGameOver) {
        e.preventDefault();
        triggerResonance();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isGameOver, resonanceCooldown, resonanceDurationLeft]);

  // Handle Event Scheduler and continuous Game loops
  useEffect(() => {
    let animationFrameId: number;
    let secondsTimerInterval: number;

    // Separate interval for timers updating every 0.1s to maintain high clock accuracy
    if (isPlaying && !isGameOver) {
      secondsTimerInterval = window.setInterval(() => {
        // Cooldown tickdowns
        setPulseCooldown(prev => Math.max(0, parseFloat((prev - 0.1).toFixed(1))));
        
        setResonanceDurationLeft(prev => {
          const nextVal = Math.max(0, parseFloat((prev - 0.1).toFixed(1)));
          if (nextVal === 0 && resonanceActiveRef.current) {
            resonanceActiveRef.current = false;
            // Resonance over, trigger full 15s cooldown
            setResonanceCooldown(15.0);
          }
          return nextVal;
        });

        setResonanceCooldown(prev => {
          if (resonanceDurationLeft > 0) return 0;
          return Math.max(0, parseFloat((prev - 0.1).toFixed(1)));
        });

        // Current Event timer tickdown
        setActiveEvent(prev => {
          if (prev.type === 'NONE') return prev;
          const nextDur = parseFloat((prev.durationLeft - 0.1).toFixed(1));
          if (nextDur <= 0) {
            // Event expired, return to NONE state
            eventChangeTimerRef.current = 15.0 + Math.random() * 10.0; // wait 15-25s for next event
            return {
              type: 'NONE',
              name: 'Estable',
              description: 'La red social se comporta de forma orgánica.',
              durationLeft: 0,
              totalDuration: 0
            };
          }
          return { ...prev, durationLeft: nextDur };
        });
      }, 100);
    }

    // MAIN ANIMATED LOOP
    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000; // delta time in seconds
      lastTimeRef.current = timestamp;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx && isPlaying && !isGameOver) {
        const width = canvas.width;
        const height = canvas.height;

        // 1. Environmental event manager spawning
        eventChangeTimerRef.current -= dt;
        if (eventChangeTimerRef.current <= 0) {
          // Trigger random new environmental threat
          const roll = Math.random();
          let nextType: EventType = 'NONE';
          let name = 'Estable';
          let desc = '';
          const dur = 10.0 + Math.floor(Math.random() * 6); // 10s - 15s

          if (roll < 0.35) {
            nextType = 'EUFORIA';
            name = 'Euforia Social';
            desc = 'Interacción híper-conectada. Nodos atraídos con fuerza duplicada. ¡Peligro de Saturación!';
          } else if (roll < 0.70) {
            nextType = 'FRAGMENTACION';
            name = 'Fragmentación';
            desc = 'Desconexión y apatía. Nodos se aíslan mutuamente. ¡Peligro de Aislamiento!';
          } else {
            nextType = 'CORRIENTE';
            name = 'Corriente Algorítmica';
            desc = 'Un viento direccional arrastra la atención de toda la red constantemente.';
          }

          setActiveEvent({
            type: nextType,
            name,
            description: desc,
            durationLeft: dur,
            totalDuration: dur,
            windAngle: nextType === 'CORRIENTE' ? Math.random() * Math.PI * 2 : undefined
          });

          // Reset timers
          eventChangeTimerRef.current = 999999; // event will clear itself via the interval ticks
        }

        // 2. FIFO Node continuous spawner
        spawnTimerRef.current += dt;
        if (spawnTimerRef.current >= PHYSICS_CONFIG.SPAWN_INTERVAL) {
          spawnTimerRef.current = 0;
          
          const maxAllowed = isMobileMode ? 55 : PHYSICS_CONFIG.MAX_NODES;
          const currentNodesCount = nodesRef.current.length;

          // If limit reached, convert oldest active node to a ghost state
          if (currentNodesCount >= maxAllowed) {
            // Find the oldest non-ghost node
            let oldestIndex = -1;
            let oldestLifetime = Date.now();

            for (let idx = 0; idx < nodesRef.current.length; idx++) {
              const node = nodesRef.current[idx];
              if (!node.isGhost && node.lifetime < oldestLifetime) {
                oldestLifetime = node.lifetime;
                oldestIndex = idx;
              }
            }

            if (oldestIndex !== -1) {
              nodesRef.current[oldestIndex].isGhost = true;
              nodesRef.current[oldestIndex].ghostProgress = 1.0;
            }
          }

          // Generate new node arriving from outer borders
          const newNode = generateIncomingNode(width, height);
          nodesRef.current.push(newNode);
        }

        // 3. Physical calculations updates
        nodesRef.current = updatePhysics(
          nodesRef.current,
          width,
          height,
          activeEvent,
          resonanceActiveRef.current,
          anchorPosRef.current,
          pulseRef.current
        );

        // Reset short duration single-pulse trigger after physical application
        if (pulseRef.current && (Date.now() - pulseRef.current.time > 300)) {
          pulseRef.current = null;
        }

        // 4. Calculate critical metrics and clusters
        const result = calculateGameMetrics(nodesRef.current);
        const { metrics: nextMetrics, nodeGroups } = result;
        metricsRef.current = nextMetrics;
        setMetrics(nextMetrics); // Sync for HUD panels

        // Play procedural audio fluctuations
        if (audioActive) {
          ambientSynth.updateHealth(nextMetrics.health);
        }

        // 5. Scoring Accumulator Logic (every frame proportional to delta)
        // Check "Zona Saludable (Equilibrio) [Health 35-65]: ideal scoring state"
        const isHealthy = nextMetrics.health >= 35 && nextMetrics.health <= 65;
        
        // Connectivity gate check: connectivity must be >= 20 to avoid exploiting empty networks
        const gatePassed = nextMetrics.connectivity >= 20;

        if (isHealthy && gatePassed) {
          // Score/sec = Base (10) * Multiplier (1.0 + (clusterQuality / 100))
          const scoreDelta = 10 * (1.0 + (nextMetrics.clusterQuality / 100)) * dt;
          setScore(prev => {
            const nextScore = prev + scoreDelta;
            const rounded = Math.round(nextScore);
            
            // Sync High Score
            if (rounded > highScore) {
              setHighScore(rounded);
              try {
                localStorage.setItem('constelaciones_high_score', rounded.toString());
              } catch {}
            }
            return nextScore;
          });
        }

        // 6. Defeat Critical Timers Logic
        // "Si la red permanece en cualquiera de las dos Zonas Críticas (0-15 o 85-100), se activa el criticalTimer (10s)"
        const inCriticalZone = nextMetrics.health < 15 || nextMetrics.health > 85;

        if (inCriticalZone) {
          setCriticalSecondsLeft(prev => {
            const nextVal = Math.max(0, prev - dt);
            if (nextVal <= 0) {
              setIsGameOver(true);
            }
            return nextVal;
          });
        } else {
          // Reset countdown timer when restored to safety
          setCriticalSecondsLeft(10.0);
        }

        // 7. CANVAS RENDERING
        ctx.clearRect(0, 0, width, height);

        // Draw elegant radial starry background glow
        const radialGlow = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.7);
        radialGlow.addColorStop(0, '#0a1024'); // subtle dark blue center
        radialGlow.addColorStop(1, '#02040a'); // absolute black carbon border
        ctx.fillStyle = radialGlow;
        ctx.fillRect(0, 0, width, height);

        // Render current event background hint glows
        if (activeEvent.type !== 'NONE') {
          ctx.beginPath();
          let eventGlowColor = 'rgba(0, 0, 0, 0)';
          if (activeEvent.type === 'EUFORIA') eventGlowColor = 'rgba(168, 85, 247, 0.03)';
          else if (activeEvent.type === 'FRAGMENTACION') eventGlowColor = 'rgba(239, 68, 68, 0.02)';
          else if (activeEvent.type === 'CORRIENTE') eventGlowColor = 'rgba(14, 165, 233, 0.02)';
          ctx.fillStyle = eventGlowColor;
          ctx.arc(width / 2, height / 2, Math.max(width, height) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw gravity Anchor range indicator
        if (anchorPosRef.current) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.arc(anchorPosRef.current.x, anchorPosRef.current.y, 180, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]); // reset

          // soft inner magnetic aura
          const aura = ctx.createRadialGradient(
            anchorPosRef.current.x, anchorPosRef.current.y, 5,
            anchorPosRef.current.x, anchorPosRef.current.y, 180
          );
          aura.addColorStop(0, 'rgba(14, 165, 233, 0.06)');
          aura.addColorStop(1, 'rgba(14, 165, 233, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(anchorPosRef.current.x, anchorPosRef.current.y, 180, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw visual feedback expanding ripples
        ripplesRef.current.forEach((r, idx) => {
          r.r += 3.5; // expand speed
          r.opacity -= 0.02; // fade
          if (r.opacity > 0 && r.r <= r.maxR) {
            ctx.beginPath();
            ctx.strokeStyle = r.color.replace('opacity', r.opacity.toString());
            ctx.lineWidth = 2.0;
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        // Filter dead ripples
        ripplesRef.current = ripplesRef.current.filter(r => r.opacity > 0 && r.r <= r.maxR);

        // Draw connections algorithm: lines with distance-weighted opacity
        ctx.lineWidth = 1.0;
        const rawNodes = nodesRef.current;
        for (let i = 0; i < rawNodes.length; i++) {
          if (rawNodes[i].isGhost) continue;
          for (let j = i + 1; j < rawNodes.length; j++) {
            if (rawNodes[j].isGhost) continue;

            const a = rawNodes[i];
            const b = rawNodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy);

            if (d < PHYSICS_CONFIG.CONNECT_DIST) {
              const alpha = (1 - (d / PHYSICS_CONFIG.CONNECT_DIST)) * 0.35;
              
              // If both nodes are part of the SAME cluster (groupId matches), draw bright harmonized line
              if (a.groupId !== null && b.groupId !== null && a.groupId === b.groupId) {
                ctx.strokeStyle = `rgba(52, 211, 153, ${alpha * 1.5})`; // beautiful emerald green
                ctx.lineWidth = 1.5;
              } else {
                ctx.strokeStyle = `rgba(120, 180, 255, ${alpha})`; // soft stellar blue
                ctx.lineWidth = 1.0;
              }

              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // Render cluster bounding halo backgrounds
        // Highlights grouped node clusters as physical nebulae!
        nodeGroups.forEach((clusterIndices, groupIdx) => {
          if (clusterIndices.length < 3) return;

          // Compute cluster bounding center of mass
          let sumX = 0;
          let sumY = 0;
          clusterIndices.forEach(idx => {
            const n = rawNodes[idx];
            sumX += n.x;
            sumY += n.y;
          });
          const centerX = sumX / clusterIndices.length;
          const centerY = sumY / clusterIndices.length;

          // Find maximum radius from center of mass to contain all members
          let maxR = 20;
          clusterIndices.forEach(idx => {
            const n = rawNodes[idx];
            const dist = Math.hypot(n.x - centerX, n.y - centerY);
            if (dist > maxR) maxR = dist;
          });

          // Draw warm, pulsing atmospheric cluster nebulas
          const pulseFactor = 1.0 + Math.sin(timestamp * 0.003 + groupIdx) * 0.05;
          const auraRadius = (maxR + 25) * pulseFactor;

          const nebColor = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, auraRadius);
          nebColor.addColorStop(0, 'rgba(52, 211, 153, 0.05)'); // emerald
          nebColor.addColorStop(0.7, 'rgba(16, 185, 129, 0.02)');
          nebColor.addColorStop(1, 'rgba(0,0,0,0)');

          ctx.fillStyle = nebColor;
          ctx.beginPath();
          ctx.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
          ctx.fill();
        });

        // Draw individual nodes
        rawNodes.forEach(n => {
          const isPartOfCluster = n.groupId !== null;
          
          // Determine opacity based on whether it is fading out (isGhost)
          const opacity = n.isGhost && n.ghostProgress !== undefined ? n.ghostProgress : 1.0;
          
          // Outer social field aura
          const glowRadius = n.r * (3.5 + n.energy * 2.5);
          const radGrad = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, glowRadius);
          
          let colorTheme = { r: 56, g: 189, b: 248 }; // light cyan default
          if (isPartOfCluster) {
            colorTheme = { r: 52, g: 211, b: 153 }; // emerald constellation green
          } else if (n.energy > 0.5) {
            colorTheme = { r: 168, g: 85, b: 247 }; // glowing resonance violet
          } else {
            // cycle colors softly based on node ID hash or index
            const colors = [
              { r: 56, g: 189, b: 248 }, // cyan
              { r: 14, g: 165, b: 233 }, // blue
              { r: 129, g: 140, b: 248 }, // indigo
              { r: 99, g: 102, b: 241 }, // purple
              { r: 244, g: 63, b: 94 } // rose
            ];
            colorTheme = colors[n.colorIndex % colors.length];
          }

          radGrad.addColorStop(0, `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, ${opacity * 0.9})`);
          radGrad.addColorStop(0.3, `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, ${opacity * 0.4})`);
          radGrad.addColorStop(1, `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, 0)`);

          ctx.fillStyle = radGrad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          // Hard Core dot
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * (0.8 + n.energy * 0.2)})`;
          ctx.arc(n.x, n.y, n.r * 0.9, 0, Math.PI * 2);
          ctx.fill();

          // Neon thin ring stroke
          ctx.strokeStyle = `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, ${opacity * 0.8})`;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        });

        // 8. If Resonance is active, draw cinematic violet border vignette overlay
        if (resonanceDurationLeft > 0) {
          const resVignette = ctx.createRadialGradient(
            width / 2, height / 2, Math.max(width, height) * 0.5,
            width / 2, height / 2, Math.max(width, height) * 0.8
          );
          resVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
          resVignette.addColorStop(1, 'rgba(147, 51, 234, 0.15)'); // violet cosmic bounds
          ctx.fillStyle = resVignette;
          ctx.fillRect(0, 0, width, height);

          // Active feedback lines on screen edge
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
          ctx.lineWidth = 2.0;
          ctx.strokeRect(5, 5, width - 10, height - 10);
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(secondsTimerInterval);
    };
  }, [isPlaying, isGameOver, activeEvent, audioActive, interactionMode, pulseCooldown, resonanceCooldown, resonanceDurationLeft, highScore]);

  // Handle Resize triggers
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    // run once immediately
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Determine System Zone based on health
  const getSystemZone = (h: number): SystemZone => {
    if (h < 15) return SystemZone.AISLAMIENTO;
    if (h < 35) return SystemZone.DISPERSION;
    if (h < 65) return SystemZone.EQUILIBRIO;
    if (h < 85) return SystemZone.CONGESTION;
    return SystemZone.SATURACION;
  };

  const activeZone = getSystemZone(metrics.health);

  // Return formatted zone metadata for display
  const getZoneDisplayDetails = (zone: SystemZone) => {
    switch (zone) {
      case SystemZone.AISLAMIENTO:
        return {
          title: 'Zona Crítica (Aislamiento)',
          textColor: 'text-red-500',
          bgColor: 'bg-red-500/10 border-red-500/30',
          glow: 'glow-danger',
          desc: 'Nodos dispersados y fríos. ¡Sincroniza urgentemente!'
        };
      case SystemZone.DISPERSION:
        return {
          title: 'Zona Inestable (Dispersión)',
          textColor: 'text-amber-500',
          bgColor: 'bg-amber-500/10 border-amber-500/30',
          glow: 'glow-warning',
          desc: 'Conexión débil. Atráelos para formar constelaciones.'
        };
      case SystemZone.EQUILIBRIO:
        return {
          title: 'Zona Saludable (Equilibrio)',
          textColor: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10 border-emerald-500/30',
          glow: 'glow-success',
          desc: 'Respiración armónica. Sumando puntos estables.'
        };
      case SystemZone.CONGESTION:
        return {
          title: 'Zona Inestable (Congestión)',
          textColor: 'text-amber-500',
          bgColor: 'bg-amber-500/10 border-amber-500/30',
          glow: 'glow-warning',
          desc: 'Demasiada proximidad. Emplea Pulsos de Repulsión.'
        };
      case SystemZone.SATURACION:
        return {
          title: 'Zona Crítica (Saturación)',
          textColor: 'text-red-500',
          bgColor: 'bg-red-500/10 border-red-500/30',
          glow: 'glow-danger',
          desc: 'Colapso por aglomeración. ¡Dispersa la masa de inmediato!'
        };
    }
  };

  const zoneDetails = getZoneDisplayDetails(activeZone);

  return (
    <div id="constelaciones-app-root" className="relative w-screen h-screen overflow-hidden flex flex-col font-sans select-none touch-none" ref={containerRef}>
      
      {/* CRT cinematic monitor effect scanlines */}
      <div className="crt-overlay" />

      {/* Floating Canvas Area */}
      <canvas
        id="canvas-constelaciones"
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerLeave={handleCanvasPointerUp}
        className="absolute inset-0 w-full h-full block cursor-crosshair z-0 select-none touch-none"
      />

      {/* HUD HEADER PANEL (Score, HighScore, Audio, and Info Trigger) */}
      <header className="absolute top-0 inset-x-0 p-4 sm:p-6 flex justify-between items-start pointer-events-none z-10">
        
        {/* Score & Stats Card */}
        <div className="bg-slate-950/75 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-2 sm:px-4 sm:py-3 pointer-events-auto flex gap-3 sm:gap-6 items-center shadow-lg">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <TrendingUp size={11} className="text-emerald-400" /> Sincronía Actual
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white transition-all">
              {Math.round(score)}
            </span>
          </div>
          <div className="h-8 w-[1px] bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Award size={11} className="text-amber-400" /> Récord Máximo
            </span>
            <span className="text-xl sm:text-2xl font-semibold font-display tracking-tight text-amber-200">
              {highScore}
            </span>
          </div>
        </div>

        {/* Global Sound and Info Action utilities */}
        <div className="flex gap-1.5 sm:gap-2 pointer-events-auto">
          {/* Performance / Mobile toggle button */}
          <button
            id="performance-toggle-btn"
            onClick={toggleMobileMode}
            className={`p-2.5 sm:p-3 rounded-xl border backdrop-blur-md transition-all flex items-center justify-center cursor-pointer ${
              isMobileMode 
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                : 'bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
            title={isMobileMode ? "Cambiar a modo Alto Rendimiento (120 partículas)" : "Cambiar a modo Optimizado Celular (55 partículas)"}
          >
            {isMobileMode ? <Smartphone size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Cpu size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>

          {/* Audio toggle button */}
          <button
            id="audio-toggle-btn"
            onClick={toggleAudio}
            className={`p-2.5 sm:p-3 rounded-xl border backdrop-blur-md transition-all flex items-center justify-center cursor-pointer ${
              audioActive 
                ? 'bg-sky-950/60 border-sky-500/40 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]' 
                : 'bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
            title={audioActive ? "Silenciar audio" : "Activar audio atmosférico"}
          >
            {audioActive ? <Volume2 size={16} className="sm:w-[18px] sm:h-[18px]" /> : <VolumeX size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>

          {/* Info/Tutorial button */}
          <button
            id="tutorial-toggle-btn"
            onClick={() => setShowTutorial(true)}
            className="p-2.5 sm:p-3 rounded-xl border bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 backdrop-blur-md transition-all cursor-pointer"
            title="Cómo Jugar"
          >
            <HelpCircle size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </header>

      {/* CENTRALIZED DYNAMIC EQUILIBRIO ZONE HUD PANEL */}
      <div className="absolute top-20 sm:top-28 inset-x-0 flex flex-col items-center pointer-events-none z-10 px-4">
        
        {/* Main Zone Banner Gauge */}
        <div className={`transition-all duration-300 w-full max-w-sm sm:max-w-md bg-slate-950/80 backdrop-blur-md border rounded-2xl p-3 sm:p-4 flex flex-col shadow-2xl items-center text-center ${zoneDetails.bgColor} ${zoneDetails.glow}`}>
          
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full bg-current ${activeZone === SystemZone.EQUILIBRIO ? 'animate-ping' : ''} ${zoneDetails.textColor}`} />
            <h2 className={`font-display font-semibold tracking-wide text-sm ${zoneDetails.textColor}`}>
              {zoneDetails.title}
            </h2>
          </div>
          
          <p className="text-xs text-slate-300 px-2 leading-relaxed">
            {zoneDetails.desc}
          </p>

          {/* Core Equilibrium Slider / Gauge */}
          <div className="w-full mt-2.5 sm:mt-3.5 relative flex flex-col">
            
            {/* Visual Health slider line */}
            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-visible relative">
              {/* Healthy Zone boundaries background */}
              <div className="absolute left-[35%] right-[35%] top-0 bottom-0 bg-emerald-500/20 border-x border-emerald-500/30" />
              
              {/* Danger Left Aislamiento Zone */}
              <div className="absolute left-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-l-full" />
              
              {/* Danger Right Saturación Zone */}
              <div className="absolute right-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-r-full" />

              {/* Current Health slider thumb dot */}
              <div 
                className="absolute -top-1.5 w-4 h-4 rounded-full bg-white border-2 border-slate-950 -ml-2 shadow-md transition-all duration-150 flex items-center justify-center"
                style={{ left: `${metrics.health}%` }}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${
                  metrics.health < 15 || metrics.health > 85 ? 'bg-red-500' : 'bg-emerald-400'
                }`} />
              </div>
            </div>

            {/* Zone Markers / Labels */}
            <div className="flex justify-between text-[8px] font-mono uppercase tracking-wider text-slate-500 mt-2 px-1">
              <span>AISLAMIENTO (0)</span>
              <span className="text-emerald-500/80">ZONA SALUDABLE (50)</span>
              <span>SATURACIÓN (100)</span>
            </div>
          </div>
          
          {/* Critical Timer Alarm Countdowns */}
          {(metrics.health < 15 || metrics.health > 85) && (
            <div className="mt-3 bg-red-950/80 border border-red-500/30 rounded-lg px-3 py-1.5 text-center flex items-center gap-2 animate-pulse">
              <Activity size={12} className="text-red-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-red-200">
                ¡COLAPSO INMINENTE! DESVANCE: <b className="text-white text-xs">{criticalSecondsLeft.toFixed(1)}s</b>
              </span>
            </div>
          )}

          {/* Connection Score Gate Warning if connectivity < 20 */}
          {activeZone === SystemZone.EQUILIBRIO && metrics.connectivity < 20 && (
            <div className="mt-3 bg-yellow-950/40 border border-yellow-500/20 rounded-lg px-3 py-1.5 text-center flex items-center gap-1.5">
              <span className="text-yellow-400">⚠️</span>
              <span className="text-[9px] font-mono uppercase text-yellow-300">
                Candado: Conectividad <b className="text-white">{(metrics.connectivity).toFixed(0)}%</b> / 20% (Red Vacía)
              </span>
            </div>
          )}
        </div>

        {/* ACTIVE RANDOM ENVIRONMENTAL THREAT PANEL */}
        {activeEvent.type !== 'NONE' && (
          <div className="mt-3 w-full max-w-sm bg-indigo-950/70 backdrop-blur-md border border-indigo-500/30 rounded-xl p-3 flex gap-3 shadow-xl relative overflow-hidden animate-breathing">
            <div className="absolute inset-y-0 left-0 w-1 bg-indigo-400" />
            <div className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center self-start">
              <Compass size={16} className="animate-spin" style={{ animationDuration: '8s' }} />
            </div>
            <div className="flex flex-col flex-1">
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-xs font-semibold text-indigo-100">{activeEvent.name}</span>
                <span className="text-[10px] font-mono text-indigo-300">Quedan {activeEvent.durationLeft.toFixed(1)}s</span>
              </div>
              <p className="text-[10px] text-indigo-200/80 leading-relaxed leading-snug">
                {activeEvent.description}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM CONTROL ACTIONS / UTILITY FOOTER DOCK */}
      <footer className="absolute bottom-0 inset-x-0 p-2 sm:p-6 pointer-events-none z-10 flex flex-col items-center">
        
        {/* Interaction controls HUD bar */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pointer-events-auto bg-slate-950/80 backdrop-blur-lg border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-2xl items-center max-w-lg w-full">
          
          {/* Interaction mode toggle: PUSH vs PULL */}
          <div className="flex items-center bg-slate-900 rounded-xl p-1 w-full sm:w-auto border border-slate-800/80">
            <button
              id="mode-repel-btn"
              onClick={() => setInteractionMode('repel')}
              className={`flex-1 sm:flex-initial text-center px-2 py-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                interactionMode === 'repel' 
                  ? 'bg-red-500/15 text-red-400 border border-red-500/20 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap size={13} />
              Pulso: Repeler
            </button>
            <button
              id="mode-attract-btn"
              onClick={() => setInteractionMode('attract')}
              className={`flex-1 sm:flex-initial text-center px-2 py-1.5 sm:px-3 rounded-lg text-[11px] sm:text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                interactionMode === 'attract' 
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Anchor size={13} />
              Pulso: Atraer
            </button>
          </div>

          <div className="hidden sm:block h-6 w-[1px] bg-slate-800" />

          {/* Action Power Buttons (Pulse & Resonance) */}
          <div className="flex gap-2 w-full sm:w-auto items-center">
            {/* Pulse indicator & status */}
            <div className="flex flex-col flex-1 sm:flex-initial min-w-[70px]">
              <span className="text-[8px] font-mono uppercase text-slate-500 text-center">Pulso (Click)</span>
              <div className="text-center text-xs font-mono font-medium text-slate-300 py-1">
                {pulseCooldown > 0 ? `${pulseCooldown.toFixed(1)}s` : 'Listo'}
              </div>
            </div>

            {/* Resonance activation button */}
            <button
              id="resonance-active-btn"
              onClick={triggerResonance}
              disabled={resonanceCooldown > 0 || resonanceDurationLeft > 0}
              className={`px-4 py-2 rounded-xl border flex items-center gap-2 cursor-pointer transition-all flex-1 sm:flex-initial justify-center ${
                resonanceDurationLeft > 0 
                  ? 'bg-purple-500/20 text-purple-200 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse'
                  : resonanceCooldown > 0
                    ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-purple-950/50 border-purple-800/60 text-purple-300 hover:text-white hover:border-purple-600 shadow-md'
              }`}
              title="Resonancia: Duplica las fuerzas temporalmente (Espacio)"
            >
              <Sparkles size={14} className={resonanceDurationLeft > 0 ? 'animate-spin' : ''} />
              <span className="text-xs font-medium tracking-wide">
                {resonanceDurationLeft > 0 
                  ? `ACTIVA (${resonanceDurationLeft.toFixed(1)}s)` 
                  : resonanceCooldown > 0 
                    ? `Resonancia (${resonanceCooldown.toFixed(1)}s)`
                    : 'Resonancia [Espacio]'}
              </span>
            </button>
          </div>
        </div>

        {/* Minimal interaction hint */}
        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-2">
          Click para Pulso | Mantener presionado para Anclar Gravedad
        </p>
      </footer>

      {/* FLOATING SIDEBAR FOR TECHNICAL METRICS (Fórmula details) */}
      {isPlaying && !isGameOver && (
        <aside id="tech-metrics-sidebar" className="absolute left-4 bottom-24 bg-slate-950/70 border border-slate-800 rounded-xl p-3 w-48 shadow-xl pointer-events-none z-10 font-mono hidden md:block">
          <span className="text-[9px] uppercase tracking-wider text-sky-400 font-bold block mb-2 border-b border-slate-800 pb-1 flex items-center gap-1">
            <Activity size={10} /> Parámetros de Red
          </span>
          <div className="flex flex-col gap-2 text-[10px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Nodos:</span>
              <span className="text-slate-300">{nodesRef.current.length} / 120</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Agrupados (Clusters):</span>
              <span className="text-emerald-400 font-semibold">{metrics.clusterCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Homogeneidad:</span>
              <span className="text-slate-300">{metrics.clusterQuality.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Congestión:</span>
              <span className="text-slate-300">{metrics.crowding.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Aislamiento:</span>
              <span className="text-slate-300">{metrics.isolation.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Conectividad:</span>
              <span className={`font-semibold ${metrics.connectivity < 20 ? 'text-yellow-400' : 'text-slate-300'}`}>
                {metrics.connectivity.toFixed(0)}%
              </span>
            </div>
          </div>
        </aside>
      )}

      {/* START INSTRUCTIONS / TUTORIAL POPUP OVERLAY */}
      {showTutorial && (
        <div id="tutorial-modal-overlay" className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative flex flex-col scrollbar-thin">
            
            {/* Close button if game has been already started */}
            {isPlaying && (
              <button 
                id="close-tutorial-btn"
                onClick={() => setShowTutorial(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Sparkles size={24} className="animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-display tracking-tight text-white">Constelaciones</h1>
                <p className="text-xs text-sky-400 uppercase tracking-widest font-mono">Experiencia Interactiva de Equilibrio Dinámico</p>
              </div>
            </div>

            {isMobileMode && (
              <div className="bg-amber-950/40 border border-amber-500/20 text-amber-300 text-[11px] rounded-xl px-3 py-2 flex items-center gap-2 mb-4">
                <Smartphone size={14} className="flex-shrink-0 text-amber-400 animate-pulse" />
                <span><b>Optimización de celular activa:</b> Regulamos el simulador a 55 nodos máximos para un rendimiento suave de 60fps. Puedes cambiar a modo Alto Rendimiento tocando el icono de celular en el encabezado.</span>
              </div>
            )}

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed mb-6">
              <p>
                La red social es un sistema vivo continuo. Tu tarea es modular su tensión manteniéndola en equilibrio en la <b>Zona Saludable (Eje 35% - 65%)</b>. Si la dejas caer al aislamiento total o colapsar en saturación, el sistema se desvanecerá.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5">
                  <span className="text-[10px] font-mono text-red-400 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    ⚠️ Peligro de Aislamiento
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Ocurre si muchos nodos quedan desconectados. Suma masa atrayéndolos para formar pequeños grupos.
                  </p>
                </div>

                <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1.5">
                  <span className="text-[10px] font-mono text-amber-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    💥 Peligro de Saturación
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Ocurre si se amontonan de forma caótica. Dispersa la congestión usando Pulsos de Repulsión.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-800/60 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
                  🛠️ Herramientas de Modulación:
                </h3>
                <ul className="space-y-2 list-disc list-inside text-slate-400 text-[11px]">
                  <li>
                    <b className="text-slate-200">Ancla (Mantener Click)</b>: Crea un punto de gravedad temporal para agrupar nodos dispersos.
                  </li>
                  <li>
                    <b className="text-slate-200">Pulso (Click Instantáneo)</b>: Envía una onda expansiva. Configura abajo si deseas que el Pulso <span className="text-red-400">Repela (dispersar)</span> o <span className="text-sky-400">Atraiga (conectar)</span>.
                  </li>
                  <li>
                    <b className="text-slate-200">Resonancia (Espacio)</b>: Duplica temporalmente la fuerza de toda la red. Úsala para acelerar un reordenamiento necesario.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                id="modal-play-btn"
                onClick={() => {
                  setShowTutorial(false);
                  if (!isPlaying) {
                    handleStartGame();
                  }
                }}
                className="flex-1 px-5 py-3 rounded-xl bg-sky-500 text-slate-950 font-bold hover:bg-sky-400 flex items-center justify-center gap-2 shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer text-sm"
              >
                <Play size={16} fill="currentColor" />
                {isPlaying ? 'Reanudar Sincronización' : 'Comenzar Sincronización'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER / SYSTEM COLLAPSED OVERLAY */}
      {isGameOver && (
        <div id="gameover-modal-overlay" className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-red-500/30 rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 text-center shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center scrollbar-thin">
            
            <div className="p-3 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 mb-4 animate-pulse">
              <Activity size={32} />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white mb-1.5">
              SISTEMA COLAPSADO
            </h1>
            <p className="text-xs text-red-400 uppercase tracking-widest font-mono mb-6">
              Pérdida de Equilibrio Social
            </p>

            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 w-full flex flex-col gap-3.5 mb-6 text-left">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Sincronía Alcanzada:</span>
                <span className="text-xl font-bold font-display text-white">{Math.round(score)}</span>
              </div>
              <div className="h-[1px] bg-slate-800" />
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Récord Máximo Histórico:</span>
                <span className="text-lg font-bold font-display text-amber-300">{highScore}</span>
              </div>
              <div className="h-[1px] bg-slate-800" />
              <div className="flex justify-between items-center">
                <span className="text-slate-400 text-xs">Última Zona Crítica:</span>
                <span className="text-xs font-mono font-semibold text-red-400 uppercase tracking-wider">{activeZone}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              El delicado hilo de atracción y dispersión se rompió por más de 10 segundos continuos. Restablece la sintonía para intentarlo de nuevo.
            </p>

            <button
              id="restart-game-btn"
              onClick={handleStartGame}
              className="w-full px-5 py-3 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-100 flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer text-sm"
            >
              <RotateCcw size={16} />
              Volver a Sincronizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
