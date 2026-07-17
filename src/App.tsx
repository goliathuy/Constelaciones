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
  Smartphone,
  Radio,
  Target
} from 'lucide-react';
import { 
  GameNode, 
  GameMetrics, 
  GameEvent, 
  EventType, 
  PHYSICS_CONFIG, 
  SystemZone,
  DynamicObjective
} from './types';
import { 
  generateInitialNodes, 
  generateIncomingNode, 
  updatePhysics, 
  calculateGameMetrics,
  findEmptyPosition
} from './lib/physics';
import { ambientSynth } from './lib/audio';
import { AnimatePresence } from 'motion/react';
import { TutorialModal } from './components/TutorialModal';
import { GameOverModal } from './components/GameOverModal';

const getTargetNodesCount = (currentScore: number, isMobile: boolean) => {
  if (currentScore < 250) {
    return isMobile ? 18 : 25; // Phase 1
  } else if (currentScore < 900) {
    return isMobile ? 28 : 40; // Phase 2
  } else if (currentScore < 1800) {
    return isMobile ? 42 : 65; // Phase 3
  } else {
    return isMobile ? 55 : 95; // Phase 4
  }
};

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
  const [graceTimer, setGraceTimer] = useState<number>(15.0); // 15s initial immunity/grace period
  
  // Interaction Settings
  const [interactionMode, setInteractionMode] = useState<'attract' | 'repel'>('repel');
  const [isHolding, setIsHolding] = useState<boolean>(false);

  // Dynamic Objectives State
  const [currentObjective, setCurrentObjective] = useState<DynamicObjective | null>(null);
  const currentObjectiveRef = useRef<DynamicObjective | null>(null);
  const objectiveSwitchTimerRef = useRef<number>(0); // timer until next objective starts

  // Dynamic Floating Text score markers for animations
  const [floatingTexts, setFloatingTexts] = useState<Array<{ id: string; x: number; y: number; text: string; opacity: number; color: string }>>([]);

  const OBJECTIVE_TEMPLATES: Array<Omit<DynamicObjective, 'id' | 'currentProgress' | 'status'>> = [
    {
      title: "Sincronía Cohesiva",
      description: "Mantén la calidad de la red superior a 65%.",
      type: "MANTENER_SINCRONIA",
      targetValue: 65,
      durationToHold: 15
    },
    {
      title: "Comunidades Activas",
      description: "Mantén 3 o más clusters de comunicación simultáneos.",
      type: "MANTENER_COMUNIDADES",
      targetValue: 3,
      durationToHold: 15
    },
    {
      title: "Estabilidad Social",
      description: "Estabiliza la red y evita la Congestión (salud <= 75).",
      type: "EVITAR_CONGESTION",
      targetValue: 75,
      durationToHold: 12
    },
    {
      title: "Vínculos Activos",
      description: "Saca a los nodos de la soledad y el Aislamiento (salud >= 25).",
      type: "EVITAR_AISLAMIENTO",
      targetValue: 25,
      durationToHold: 12
    },
    {
      title: "Red de Influencia",
      description: "Impide que los nodos Influencers queden aislados de la red.",
      type: "CONECTAR_ESPECIALES",
      targetValue: 1,
      durationToHold: 15
    }
  ];

  const rollNewObjective = () => {
    const template = OBJECTIVE_TEMPLATES[Math.floor(Math.random() * OBJECTIVE_TEMPLATES.length)];
    const newObj: DynamicObjective = {
      id: Math.random().toString(36).substring(2, 9),
      title: template.title,
      description: template.description,
      type: template.type,
      targetValue: template.targetValue,
      currentProgress: 0,
      durationToHold: template.durationToHold,
      status: 'ACTIVE'
    };
    setCurrentObjective(newObj);
    currentObjectiveRef.current = newObj;
  };

  const checkObjectiveCondition = (objectiveType: string, metrics: GameMetrics, nodes: GameNode[]): boolean => {
    switch (objectiveType) {
      case 'MANTENER_COMUNIDADES':
        return metrics.clusterCount >= 3;
      case 'MANTENER_SINCRONIA':
        return metrics.clusterQuality >= 65 && metrics.clusterCount >= 1;
      case 'EVITAR_CONGESTION':
        return metrics.health <= 75;
      case 'EVITAR_AISLAMIENTO':
        return metrics.health >= 25;
      case 'CONECTAR_ESPECIALES': {
        const influencers = nodes.filter(n => !n.isGhost && n.specialType === 'influencer');
        if (influencers.length === 0) return true; // trivially met if none
        // none of them are isolated
        return influencers.every(inf => !inf.isolatedTimer || inf.isolatedTimer < 0.5);
      }
      default:
        return false;
    }
  };

  // Active Environmental Event State
  const [activeEvent, setActiveEvent] = useState<GameEvent>({
    type: 'NONE',
    name: 'Estable',
    description: 'La red social se comporta de forma orgánica.',
    durationLeft: 0,
    totalDuration: 0
  });

  // Cooldown refs for non-blocking game loop ticks
  const pulseCooldownRef = useRef<number>(0);
  const resonanceCooldownRef = useRef<number>(0);
  const resonanceDurationLeftRef = useRef<number>(0);
  const activeEventRef = useRef<GameEvent>({
    type: 'NONE',
    name: 'Estable',
    description: 'La red social se comporta de forma orgánica.',
    durationLeft: 0,
    totalDuration: 0
  });
  const audioActiveRef = useRef<boolean>(false);
  const interactionModeRef = useRef<'attract' | 'repel'>('repel');
  const timeAccumulatorRef = useRef<number>(0);
  const highScoreRef = useRef<number>(highScore);

  // Sync state values with refs for frame-rate decoupled ticks
  useEffect(() => {
    audioActiveRef.current = audioActive;
  }, [audioActive]);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);

  // Refs for high-frequency physics variables to avoid React render lags
  const nodesRef = useRef<GameNode[]>([]);
  const scoreRef = useRef<number>(0);
  const currentPhaseRef = useRef<number>(1);
  const seedSpawnCooldownRef = useRef<number>(5.0);
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
  const cameraRef = useRef<{ x: number; y: number; zoom: number }>({
    x: PHYSICS_CONFIG.WORLD_WIDTH / 2,
    y: PHYSICS_CONFIG.WORLD_HEIGHT / 2,
    zoom: 0.4
  });
  
  // Game timings
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const eventChangeTimerRef = useRef<number>(0);
  const criticalTimerRef = useRef<number | null>(null); // holds interval timestamp
  const graceTimerRef = useRef<number>(15.0);
  
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
    scoreRef.current = 0;
    currentPhaseRef.current = 1;
    seedSpawnCooldownRef.current = 5.0;
    setCriticalSecondsLeft(10.0);
    setPulseCooldown(0);
    setResonanceCooldown(0);
    setResonanceDurationLeft(0);
    pulseCooldownRef.current = 0;
    resonanceCooldownRef.current = 0;
    resonanceDurationLeftRef.current = 0;
    timeAccumulatorRef.current = 0;
    setGraceTimer(15.0);
    graceTimerRef.current = 15.0;
    
    // Create baseline nodes in LOGICAL coordinates (correctly scaled by DPR)
    nodesRef.current = generateInitialNodes(
      getTargetNodesCount(0, isMobileMode),
      PHYSICS_CONFIG.WORLD_WIDTH,
      PHYSICS_CONFIG.WORLD_HEIGHT
    );

    // Reset camera to world center
    cameraRef.current = {
      x: PHYSICS_CONFIG.WORLD_WIDTH / 2,
      y: PHYSICS_CONFIG.WORLD_HEIGHT / 2,
      zoom: 0.4
    };
    
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
    
    const initialEvent: GameEvent = {
      type: 'NONE',
      name: 'Estable',
      description: 'La red social se comporta de forma orgánica.',
      durationLeft: 0,
      totalDuration: 0
    };
    setActiveEvent(initialEvent);
    activeEventRef.current = initialEvent;

    if (audioActive) {
      ambientSynth.updateHealth(50);
    }

    setCurrentObjective(null);
    currentObjectiveRef.current = null;
    setFloatingTexts([]);
    objectiveSwitchTimerRef.current = 0;
  };

  // Trigger global Pulse action
  const triggerPulse = (x: number, y: number) => {
    if (pulseCooldownRef.current > 0) return;
    
    // Set active pulse config
    pulseRef.current = {
      x,
      y,
      time: Date.now(),
      type: interactionModeRef.current
    };

    // Play sound if active
    if (audioActiveRef.current) {
      ambientSynth.playPulseSFX(interactionModeRef.current);
    }

    // Add glowing wave visual ripples
    const ringColor = interactionModeRef.current === 'attract' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(239, 68, 68, 0.5)';
    ripplesRef.current.push({
      x,
      y,
      r: 10,
      maxR: 250,
      opacity: 0.8,
      color: ringColor
    });

    // Pulse feedback ripple secondary
    setTimeout(() => {
      ripplesRef.current.push({
        x,
        y,
        r: 5,
        maxR: 180,
        opacity: 0.6,
        color: ringColor
      });
    }, 100);

    // Apply cooldown (2 seconds as per specifications)
    pulseCooldownRef.current = 2.0;
    setPulseCooldown(2.0);
  };

  // Trigger Resonance action
  const triggerResonance = () => {
    if (resonanceCooldownRef.current > 0 || resonanceDurationLeftRef.current > 0) return;

    resonanceActiveRef.current = true;
    resonanceDurationLeftRef.current = 5.0;
    setResonanceDurationLeft(5.0); // Active for 5s

    // Play resonance SFX if active
    if (audioActiveRef.current) {
      ambientSynth.playResonanceSFX();
    }
    
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
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Convert screen coordinates to virtual world coordinates
    const dx = screenX - width / 2;
    const dy = screenY - height / 2;
    const x = cameraRef.current.x + dx / cameraRef.current.zoom;
    const y = cameraRef.current.y + dy / cameraRef.current.zoom;

    // Trigger pulse on primary click
    if (pulseCooldownRef.current <= 0) {
      triggerPulse(x, y);
    }

    // Set position of gravity Anchor
    anchorPosRef.current = { x, y };
    setIsHolding(true);

    if (audioActiveRef.current) {
      ambientSynth.setAnchorActive(true);
    }

    // Set visual Anchor ring feedback
    ripplesRef.current.push({
      x,
      y,
      r: 20,
      maxR: 400,
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
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Convert screen coordinates to virtual world coordinates
    const dx = screenX - width / 2;
    const dy = screenY - height / 2;
    const x = cameraRef.current.x + dx / cameraRef.current.zoom;
    const y = cameraRef.current.y + dy / cameraRef.current.zoom;

    anchorPosRef.current = { x, y };
  };

  // Releases Gravity Anchor hold
  const handleCanvasPointerUp = () => {
    anchorPosRef.current = null;
    setIsHolding(false);

    if (audioActiveRef.current) {
      ambientSynth.setAnchorActive(false);
    }
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

    // MAIN ANIMATED LOOP
    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000; // delta time in seconds
      lastTimeRef.current = timestamp;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx && isPlaying && !isGameOver) {
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        // Decrease grace timer continuously
        if (graceTimerRef.current > 0) {
          graceTimerRef.current = Math.max(0, graceTimerRef.current - dt);
          setGraceTimer(graceTimerRef.current);
        }

        // Unified clock tick logic synchronized directly to requestAnimationFrame
        // Updates state precisely 10 times per second (every 100ms) using delta accumulation
        timeAccumulatorRef.current += dt;
        if (timeAccumulatorRef.current >= 0.1) {
          const intervalsPassed = Math.floor(timeAccumulatorRef.current / 0.1);
          const timeStep = intervalsPassed * 0.1;
          timeAccumulatorRef.current -= timeStep;

          // Cooldown ticks
          setPulseCooldown(prev => {
            const nextVal = Math.max(0, parseFloat((prev - timeStep).toFixed(1)));
            pulseCooldownRef.current = nextVal;
            return nextVal;
          });
          
          setResonanceDurationLeft(prev => {
            const nextVal = Math.max(0, parseFloat((prev - timeStep).toFixed(1)));
            resonanceDurationLeftRef.current = nextVal;
            if (nextVal === 0 && resonanceActiveRef.current) {
              resonanceActiveRef.current = false;
              // Resonance over, trigger full 15s cooldown
              setResonanceCooldown(15.0);
              resonanceCooldownRef.current = 15.0;
            }
            return nextVal;
          });

          setResonanceCooldown(prev => {
            if (resonanceDurationLeftRef.current > 0) return 0;
            const nextVal = Math.max(0, parseFloat((prev - timeStep).toFixed(1)));
            resonanceCooldownRef.current = nextVal;
            return nextVal;
          });

          // Current Event timer tickdown
          setActiveEvent(prev => {
            if (prev.type === 'NONE') return prev;
            const nextDur = parseFloat((prev.durationLeft - timeStep).toFixed(1));
            let nextEv: GameEvent;
            if (nextDur <= 0) {
              // Event expired, return to NONE state
              eventChangeTimerRef.current = 15.0 + Math.random() * 10.0; // wait 15-25s for next event
              nextEv = {
                type: 'NONE',
                name: 'Estable',
                description: 'La red social se comporta de forma orgánica.',
                durationLeft: 0,
                totalDuration: 0
              };
            } else {
              nextEv = { ...prev, durationLeft: nextDur };
            }
            activeEventRef.current = nextEv;
            return nextEv;
          });
        }

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

          const nextEvent: GameEvent = {
            type: nextType,
            name,
            description: desc,
            durationLeft: dur,
            totalDuration: dur,
            windAngle: nextType === 'CORRIENTE' ? Math.random() * Math.PI * 2 : undefined
          };
          setActiveEvent(nextEvent);
          activeEventRef.current = nextEvent;

          // Reset timers
          eventChangeTimerRef.current = 999999; // event will clear itself via the interval ticks
        }

        // 2. FIFO Node continuous spawner with Dynamic Density & Intelligent Placement
        spawnTimerRef.current += dt;
        const currentTarget = getTargetNodesCount(scoreRef.current, isMobileMode);
        const activeNodesCount = nodesRef.current.filter(n => !n.isGhost).length;
        
        // Spawn faster (1.5s instead of 6.0s) if the current active node count is below the dynamic phase target
        const spawnInterval = activeNodesCount < currentTarget ? 1.5 : PHYSICS_CONFIG.SPAWN_INTERVAL;

        if (spawnTimerRef.current >= spawnInterval) {
          spawnTimerRef.current = 0;
          
          const maxAllowed = currentTarget;

          // If limit reached, convert oldest active node to a ghost state
          if (activeNodesCount >= maxAllowed) {
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

          // Generate new node arriving using Phase constraints & Intelligent Placement GDD guidelines
          const currentScore = scoreRef.current;
          let forcedType: 'normal' | 'influencer' | 'disruptor' | 'organizador' | 'explorador' | 'semilla' = 'normal';
          
          const activeSpecialCount = nodesRef.current.filter(
            n => !n.isGhost && n.specialType && n.specialType !== 'normal' && n.specialType !== 'semilla'
          ).length;

          if (currentScore < 250) {
            // Phase 1: only normal nodes
            forcedType = 'normal';
          } else if (currentScore < 900) {
            // Phase 2: max 1 special node of simple type
            if (activeSpecialCount < 1 && Math.random() < 0.20) {
              forcedType = Math.random() < 0.5 ? 'explorador' : 'organizador';
            } else {
              forcedType = 'normal';
            }
          } else if (currentScore < 1800) {
            // Phase 3: max 2 special nodes of simple or power types
            if (activeSpecialCount < 2 && Math.random() < 0.25) {
              const options: Array<'explorador' | 'organizador' | 'influencer' | 'disruptor'> = [
                'explorador', 'organizador', 'influencer', 'disruptor'
              ];
              forcedType = options[Math.floor(Math.random() * options.length)];
            } else {
              forcedType = 'normal';
            }
          } else {
            // Phase 4: max 3 special nodes (excluding seeds)
            if (activeSpecialCount < 3 && Math.random() < 0.30) {
              const options: Array<'explorador' | 'organizador' | 'influencer' | 'disruptor'> = [
                'explorador', 'organizador', 'influencer', 'disruptor'
              ];
              forcedType = options[Math.floor(Math.random() * options.length)];
            } else {
              forcedType = 'normal';
            }
          }

          const newNode = generateIncomingNode(PHYSICS_CONFIG.WORLD_WIDTH, PHYSICS_CONFIG.WORLD_HEIGHT, forcedType, nodesRef.current);
          nodesRef.current.push(newNode);
        }

        // 3. Physical calculations updates (using virtual world dimensions)
        nodesRef.current = updatePhysics(
          nodesRef.current,
          PHYSICS_CONFIG.WORLD_WIDTH,
          PHYSICS_CONFIG.WORLD_HEIGHT,
          activeEventRef.current,
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
        if (audioActiveRef.current) {
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
            scoreRef.current = nextScore;
            const rounded = Math.round(nextScore);
            
            // Sync High Score
            if (rounded > highScoreRef.current) {
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
          if (graceTimerRef.current <= 0) {
            setCriticalSecondsLeft(prev => {
              const nextVal = Math.max(0, prev - dt);
              if (nextVal <= 0) {
                setIsGameOver(true);
              }
              return nextVal;
            });
          }
        } else {
          // Reset countdown timer when restored to safety
          setCriticalSecondsLeft(10.0);
        }

        // 6.2. Ecosystem Evolution Phase transition checks
        const nextScore = scoreRef.current;
        let nextPhaseLevel = 1;
        if (nextScore >= 1800) nextPhaseLevel = 4;
        else if (nextScore >= 900) nextPhaseLevel = 3;
        else if (nextScore >= 250) nextPhaseLevel = 2;

        if (nextPhaseLevel !== currentPhaseRef.current) {
          currentPhaseRef.current = nextPhaseLevel;
          
          // Spawn beautiful evolution banner in HUD floating text
          const pInfo = getEcosystemPhase(nextScore);
          setFloatingTexts(prev => [
            ...prev,
            {
              id: Math.random().toString(36).substring(2, 9),
              x: width / 2,
              y: height * 0.3,
              text: `✨ ¡EVOLUCIÓN DEL ECOSISTEMA! ✨`,
              opacity: 1.0,
              color: "rgba(251, 191, 36, opacity)" // gold
            },
            {
              id: Math.random().toString(36).substring(2, 9),
              x: width / 2,
              y: height * 0.36,
              text: pInfo.name,
              opacity: 1.0,
              color: "rgba(255, 255, 255, opacity)"
            }
          ]);

          if (audioActiveRef.current) {
            ambientSynth.playResonanceSFX();
          }
        }

        // 6.3. Seed Spawn Logic (Phase 4 only)
        if (nextPhaseLevel === 4) {
          const hasActiveSeed = nodesRef.current.some(n => !n.isGhost && n.specialType === 'semilla');
          if (!hasActiveSeed) {
            seedSpawnCooldownRef.current -= dt;
            if (seedSpawnCooldownRef.current <= 0) {
              // Spawn a community seed
              const { x, y } = findEmptyPosition(nodesRef.current, PHYSICS_CONFIG.WORLD_WIDTH, PHYSICS_CONFIG.WORLD_HEIGHT);
              const seedNode: GameNode = {
                id: Math.random().toString(36).substring(2, 9),
                x,
                y,
                vx: 0,
                vy: 0,
                r: 8.5,
                energy: 1.0,
                groupId: null,
                lifetime: Date.now(),
                isGhost: false,
                colorIndex: Math.floor(Math.random() * 4),
                specialType: 'semilla',
                seedTimer: 0
              };
              nodesRef.current.push(seedNode);
              seedSpawnCooldownRef.current = 999999; // stay inactive until seed completes or is removed
              
              setFloatingTexts(prev => [
                ...prev,
                {
                  id: Math.random().toString(36).substring(2, 9),
                  x: width / 2,
                  y: height * 0.45,
                  text: "🌱 ¡Apareció una Semilla de Comunidad! 🌱",
                  opacity: 1.0,
                  color: "rgba(253, 224, 71, opacity)" // yellow-300
                }
              ]);

              if (audioActiveRef.current) {
                ambientSynth.playResonanceSFX();
              }
            }
          }
        }

        // 6.4. Update and check Explorers and Seeds achievements
        nodesRef.current.forEach(n => {
          if (n.isGhost) return;

          // Explorer success check (stayed connected for 20s)
          if (n.specialType === 'explorador' && n.connectedTimer !== undefined && n.connectedTimer >= 20) {
            n.specialType = 'normal';
            n.connectedTimer = undefined;
            n.r = 4 + Math.random() * 4; // return to normal size

            // Award points
            setScore(prev => {
              const val = prev + 300;
              scoreRef.current = val;
              const rounded = Math.round(val);
              if (rounded > highScoreRef.current) {
                setHighScore(rounded);
              }
              return val;
            });

            // Floating text
            setFloatingTexts(prev => [
              ...prev,
              {
                id: Math.random().toString(36).substring(2, 9),
                x: width / 2,
                y: height * 0.45,
                text: "✨ ¡Explorador Sincronizado! +300 PTS ✨",
                opacity: 1.0,
                color: "rgba(52, 211, 153, opacity)" // green-400
              }
            ]);

            // Add celebratory ripple
            ripplesRef.current.push({
              x: n.x,
              y: n.y,
              r: 15,
              maxR: 200,
              opacity: 0.8,
              color: 'rgba(52, 211, 153, 0.5)'
            });

            if (audioActiveRef.current) {
              ambientSynth.playResonanceSFX();
            }
          }

          // Seed sprouting and progress check (requires 4 connected nodes for 20s)
          if (n.specialType === 'semilla' && n.seedTimer !== undefined) {
            // Count active connections to n
            let connCount = 0;
            nodesRef.current.forEach(other => {
              if (other.id === n.id || other.isGhost) return;
              let dx = other.x - n.x;
              let dy = other.y - n.y;
              if (dx > PHYSICS_CONFIG.WORLD_WIDTH / 2) dx -= PHYSICS_CONFIG.WORLD_WIDTH;
              else if (dx < -PHYSICS_CONFIG.WORLD_WIDTH / 2) dx += PHYSICS_CONFIG.WORLD_WIDTH;
              if (dy > PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy -= PHYSICS_CONFIG.WORLD_HEIGHT;
              else if (dy < -PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy += PHYSICS_CONFIG.WORLD_HEIGHT;
              const d = Math.hypot(dx, dy);
              if (d < PHYSICS_CONFIG.CONNECT_DIST) {
                connCount++;
              }
            });

            if (connCount >= 4) {
              n.seedTimer += dt;
            } else {
              n.seedTimer = Math.max(0, n.seedTimer - dt * 0.5);
            }

            if (n.seedTimer >= 20) {
              // Sprouted!
              n.specialType = 'organizador';
              n.seedTimer = undefined;
              n.r = 6.5; // organizador size

              // Award points
              setScore(prev => {
                const val = prev + 1000;
                scoreRef.current = val;
                const rounded = Math.round(val);
                if (rounded > highScoreRef.current) {
                  setHighScore(rounded);
                }
                return val;
              });

              // Reset seed spawning cooldown
              seedSpawnCooldownRef.current = 45.0;

              // Floating text
              setFloatingTexts(prev => [
                ...prev,
                {
                  id: Math.random().toString(36).substring(2, 9),
                  x: width / 2,
                  y: height * 0.45,
                  text: "🌱 ¡Semilla Brotada! +1000 PTS 🌱",
                  opacity: 1.0,
                  color: "rgba(253, 224, 71, opacity)" // yellow-300
                }
              ]);

              // Celebratory physical ripple
              ripplesRef.current.push({
                x: n.x,
                y: n.y,
                r: 25,
                maxR: 350,
                opacity: 0.9,
                color: 'rgba(253, 224, 71, 0.7)'
              });

              // Spawn 4 normal nodes around it of different colors!
              const colors = [0, 1, 2, 3];
              for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI) / 2;
                const dist = 60;
                const rx = n.x + Math.cos(angle) * dist;
                const ry = n.y + Math.sin(angle) * dist;
                const newN: GameNode = {
                  id: Math.random().toString(36).substring(2, 9),
                  x: rx,
                  y: ry,
                  vx: Math.cos(angle) * 1.8,
                  vy: Math.sin(angle) * 1.8,
                  r: 4 + Math.random() * 4,
                  energy: 0.9,
                  groupId: null,
                  lifetime: Date.now(),
                  isGhost: false,
                  colorIndex: colors[i % colors.length],
                  specialType: 'normal'
                };
                nodesRef.current.push(newN);
              }

              if (audioActiveRef.current) {
                ambientSynth.playResonanceSFX();
              }
            }
          }
        });

        // 6.5. Update Dynamic Objectives and floating texts
        setFloatingTexts(prev => {
          return prev
            .map(ft => ({ ...ft, y: ft.y - 40 * dt, opacity: ft.opacity - 0.8 * dt }))
            .filter(ft => ft.opacity > 0);
        });

        // Only run/evaluate dynamic objectives in Phase 4+ (score >= 1800) GDD guidelines
        if (currentPhaseRef.current >= 4) {
          if (!currentObjectiveRef.current) {
            rollNewObjective();
            if (currentObjectiveRef.current) {
              const nextObjName = currentObjectiveRef.current.title;
              setFloatingTexts(prev => [
                ...prev,
                {
                  id: Math.random().toString(36).substring(2, 9),
                  x: width / 2,
                  y: height * 0.35,
                  text: `Meta Desbloqueada: ${nextObjName}`,
                  opacity: 1.0,
                  color: "rgba(251, 191, 36, opacity)" // gold
                }
              ]);
            }
          } else {
            const obj = currentObjectiveRef.current;
            if (obj.status === 'ACTIVE') {
              const isMet = checkObjectiveCondition(obj.type, nextMetrics, nodesRef.current);
              if (isMet) {
                const nextProg = obj.currentProgress + dt;
                if (nextProg >= obj.durationToHold) {
                  // Completed!
                  const updatedObj = { ...obj, currentProgress: obj.durationToHold, status: 'COMPLETED' as const };
                  setCurrentObjective(updatedObj);
                  currentObjectiveRef.current = updatedObj;

                  // Award bonus points!
                  setScore(prev => {
                    const newScore = prev + 500;
                    scoreRef.current = newScore;
                    const rounded = Math.round(newScore);
                    if (rounded > highScoreRef.current) {
                      setHighScore(rounded);
                      try {
                        localStorage.setItem('constelaciones_high_score', rounded.toString());
                      } catch {}
                    }
                    return newScore;
                  });

                  // Spawn beautiful floating text
                  setFloatingTexts(prev => [
                    ...prev,
                    {
                      id: Math.random().toString(36).substring(2, 9),
                      x: width / 2,
                      y: height * 0.35,
                      text: "✨ ¡OBJETIVO COMPLETADO! +500 PTS ✨",
                      opacity: 1.0,
                      color: "rgba(245, 158, 11, opacity)" // gold glowing color
                    }
                  ]);

                  // Play custom synthesized melody for success!
                  if (audioActiveRef.current) {
                    ambientSynth.playResonanceSFX();
                  }

                  objectiveSwitchTimerRef.current = 5.0; // 5 seconds of calm before next challenge
                } else {
                  const updatedObj = { ...obj, currentProgress: nextProg };
                  setCurrentObjective(updatedObj);
                  currentObjectiveRef.current = updatedObj;
                }
              } else {
                // Reset progress if condition is broken
                if (obj.currentProgress > 0) {
                  const updatedObj = { ...obj, currentProgress: 0 };
                  setCurrentObjective(updatedObj);
                  currentObjectiveRef.current = updatedObj;
                }
              }
            } else if (obj.status === 'COMPLETED') {
              objectiveSwitchTimerRef.current -= dt;
              if (objectiveSwitchTimerRef.current <= 0) {
                rollNewObjective();
                // Spawn starting alert text
                if (currentObjectiveRef.current) {
                  const nextObjName = currentObjectiveRef.current.title;
                  setFloatingTexts(prev => [
                    ...prev,
                    {
                      id: Math.random().toString(36).substring(2, 9),
                      x: width / 2,
                      y: height * 0.35,
                      text: `Nuevo Objetivo: ${nextObjName}`,
                      opacity: 1.0,
                      color: "rgba(168, 85, 247, opacity)" // violet
                    }
                  ]);
                }
              }
            }
          }
        }

        // 7. CAMERA INTERPOLATION LOGIC
        // Find bounding box of all active nodes to center camera and scale zoom
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        const activeNodes = nodesRef.current.filter(n => !n.isGhost);
        if (activeNodes.length > 0) {
          activeNodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
          });

          const boxWidth = (maxX - minX) || 100;
          const boxHeight = (maxY - minY) || 100;
          const centerX = minX + boxWidth / 2;
          const centerY = minY + boxHeight / 2;

          const pad = 120; // safe padding around viewport
          const targetZoomX = (width - pad * 2) / boxWidth;
          const targetZoomY = (height - pad * 2) / boxHeight;
          let targetZoom = Math.min(targetZoomX, targetZoomY);

          // Clamping keeps zoom range balanced (highly professional look)
          targetZoom = Math.max(0.35, Math.min(1.0, targetZoom));

          const lerpVal = 0.04; // ultra smooth delay
          cameraRef.current.x += (centerX - cameraRef.current.x) * lerpVal;
          cameraRef.current.y += (centerY - cameraRef.current.y) * lerpVal;
          cameraRef.current.zoom += (targetZoom - cameraRef.current.zoom) * lerpVal;
        } else {
          // Centered camera fallback
          const lerpVal = 0.04;
          cameraRef.current.x += (PHYSICS_CONFIG.WORLD_WIDTH / 2 - cameraRef.current.x) * lerpVal;
          cameraRef.current.y += (PHYSICS_CONFIG.WORLD_HEIGHT / 2 - cameraRef.current.y) * lerpVal;
          cameraRef.current.zoom += (0.4 - cameraRef.current.zoom) * lerpVal;
        }

        // 7.5. CANVAS RENDERING
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);

        // A. Draw screen-space background
        const radialGlow = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, Math.max(width, height) * 0.7);
        radialGlow.addColorStop(0, '#0a1024'); // subtle dark blue center
        radialGlow.addColorStop(1, '#02040a'); // absolute black carbon border
        ctx.fillStyle = radialGlow;
        ctx.fillRect(0, 0, width, height);

        // Render current event background hint glows in screen-space
        if (activeEventRef.current.type !== 'NONE') {
          ctx.beginPath();
          let eventGlowColor = 'rgba(0, 0, 0, 0)';
          if (activeEventRef.current.type === 'EUFORIA') eventGlowColor = 'rgba(168, 85, 247, 0.03)';
          else if (activeEventRef.current.type === 'FRAGMENTACION') eventGlowColor = 'rgba(239, 68, 68, 0.02)';
          else if (activeEventRef.current.type === 'CORRIENTE') eventGlowColor = 'rgba(14, 165, 233, 0.02)';
          ctx.fillStyle = eventGlowColor;
          ctx.arc(width / 2, height / 2, Math.max(width, height) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // B. Apply Camera Transforms
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);
        ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

        // B1. Draw grid lines in virtual space
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.lineWidth = 1.0;
        const gridSpacing = 150;
        ctx.beginPath();
        for (let gx = 0; gx <= PHYSICS_CONFIG.WORLD_WIDTH; gx += gridSpacing) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, PHYSICS_CONFIG.WORLD_HEIGHT);
        }
        for (let gy = 0; gy <= PHYSICS_CONFIG.WORLD_HEIGHT; gy += gridSpacing) {
          ctx.moveTo(0, gy);
          ctx.lineTo(PHYSICS_CONFIG.WORLD_WIDTH, gy);
        }
        ctx.stroke();

        // Draw boundaries
        ctx.strokeStyle = 'rgba(147, 51, 234, 0.06)';
        ctx.lineWidth = 2.0;
        ctx.strokeRect(0, 0, PHYSICS_CONFIG.WORLD_WIDTH, PHYSICS_CONFIG.WORLD_HEIGHT);

        // Draw gravity Anchor range indicator
        if (anchorPosRef.current) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.arc(anchorPosRef.current.x, anchorPosRef.current.y, 400, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]); // reset

          // soft inner magnetic aura
          const aura = ctx.createRadialGradient(
            anchorPosRef.current.x, anchorPosRef.current.y, 5,
            anchorPosRef.current.x, anchorPosRef.current.y, 400
          );
          aura.addColorStop(0, 'rgba(14, 165, 233, 0.06)');
          aura.addColorStop(1, 'rgba(14, 165, 233, 0)');
          ctx.fillStyle = aura;
          ctx.beginPath();
          ctx.arc(anchorPosRef.current.x, anchorPosRef.current.y, 400, 0, Math.PI * 2);
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
            
            // Check if distance on torus is less than CONNECT_DIST
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            if (dx > PHYSICS_CONFIG.WORLD_WIDTH / 2) dx -= PHYSICS_CONFIG.WORLD_WIDTH;
            else if (dx < -PHYSICS_CONFIG.WORLD_WIDTH / 2) dx += PHYSICS_CONFIG.WORLD_WIDTH;
            if (dy > PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy -= PHYSICS_CONFIG.WORLD_HEIGHT;
            else if (dy < -PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy += PHYSICS_CONFIG.WORLD_HEIGHT;
            
            const toroidalD = Math.hypot(dx, dy);

            // Visual line: only draw if physically within CONNECT_DIST, AND not wrapped around borders
            // (drawing wrapped lines would stretch them across the screen, so we only draw if screen distance matches)
            const screenD = Math.hypot(b.x - a.x, b.y - a.y);

            if (toroidalD < PHYSICS_CONFIG.CONNECT_DIST && screenD < PHYSICS_CONFIG.CONNECT_DIST * 1.5) {
               const alpha = (1 - (toroidalD / PHYSICS_CONFIG.CONNECT_DIST)) * 0.35;
               
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
            let dx = n.x - centerX;
            let dy = n.y - centerY;
            if (dx > PHYSICS_CONFIG.WORLD_WIDTH / 2) dx -= PHYSICS_CONFIG.WORLD_WIDTH;
            else if (dx < -PHYSICS_CONFIG.WORLD_WIDTH / 2) dx += PHYSICS_CONFIG.WORLD_WIDTH;
            if (dy > PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy -= PHYSICS_CONFIG.WORLD_HEIGHT;
            else if (dy < -PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy += PHYSICS_CONFIG.WORLD_HEIGHT;
            
            const dist = Math.hypot(dx, dy);
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
          
          // 4 distinct affinity group colors
          const affinityColors = [
            { r: 56, g: 189, b: 248 }, // 0: Blue (Azul)
            { r: 34, g: 197, b: 94 },  // 1: Green (Verde)
            { r: 249, g: 115, b: 22 }, // 2: Orange (Naranja)
            { r: 168, g: 85, b: 247 }  // 3: Purple (Violeta)
          ];

          let colorTheme = affinityColors[n.colorIndex % affinityColors.length];
          
          // Outer social field aura (custom sizing for specials)
          let auraScale = 3.5;
          if (n.specialType === 'influencer') {
            auraScale = 4.8;
            colorTheme = { r: 234, g: 179, b: 8 }; // Gold
          } else if (n.specialType === 'disruptor') {
            auraScale = 3.8;
            colorTheme = { r: 239, g: 68, b: 68 }; // Red
          } else if (n.specialType === 'organizador') {
            auraScale = 4.0;
            colorTheme = { r: 34, g: 211, b: 238 }; // Cyan/Teal
          } else if (n.specialType === 'explorador') {
            auraScale = 3.6;
            colorTheme = { r: 52, g: 211, b: 153 }; // Emerald/Green
          } else if (n.specialType === 'semilla') {
            auraScale = 5.0;
            colorTheme = { r: 251, g: 191, b: 36 }; // Amber/Gold
          }

          const glowRadius = n.r * (auraScale + n.energy * 2.5);
          const radGrad = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, glowRadius);
          
          radGrad.addColorStop(0, `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, ${opacity * 0.9})`);
          radGrad.addColorStop(0.3, `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, ${opacity * 0.4})`);
          radGrad.addColorStop(1, `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, 0)`);

          ctx.fillStyle = radGrad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          // Draw Special Node visual geometric indicators
          if (n.specialType === 'influencer') {
            const isFlashingRed = n.isolatedTimer && n.isolatedTimer > 4.0 && Math.floor(Date.now() / 250) % 2 === 0;
            const ringColor = isFlashingRed ? { r: 239, g: 68, b: 68 } : { r: 234, g: 179, b: 8 };
            
            ctx.strokeStyle = `rgba(${ringColor.r}, ${ringColor.g}, ${ringColor.b}, ${opacity * 0.85})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * (2.1 + Math.sin(timestamp * 0.007) * 0.3), 0, Math.PI * 2);
            ctx.stroke();
          } else if (n.specialType === 'disruptor') {
            ctx.strokeStyle = `rgba(239, 68, 68, ${opacity * 0.8})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const angle = timestamp * 0.0025;
            for (let k = 0; k < 4; k++) {
              const xOffset = Math.cos(angle + k * Math.PI / 2) * n.r * 1.8;
              const yOffset = Math.sin(angle + k * Math.PI / 2) * n.r * 1.8;
              if (k === 0) ctx.moveTo(n.x + xOffset, n.y + yOffset);
              else ctx.lineTo(n.x + xOffset, n.y + yOffset);
            }
            ctx.closePath();
            ctx.stroke();
          } else if (n.specialType === 'organizador') {
            ctx.strokeStyle = `rgba(34, 211, 238, ${opacity * 0.8})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const rot = timestamp * -0.0015;
            for (let k = 0; k < 6; k++) {
              const xOffset = Math.cos(rot + k * Math.PI / 3) * n.r * 1.6;
              const yOffset = Math.sin(rot + k * Math.PI / 3) * n.r * 1.6;
              if (k === 0) ctx.moveTo(n.x + xOffset, n.y + yOffset);
              else ctx.lineTo(n.x + xOffset, n.y + yOffset);
            }
            ctx.closePath();
            ctx.stroke();
          } else if (n.specialType === 'explorador') {
            // Elegant outer tracking ring that fills as connection holds
            ctx.strokeStyle = `rgba(52, 211, 153, ${opacity * 0.4})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 2.0, 0, Math.PI * 2);
            ctx.stroke();

            if (n.connectedTimer && n.connectedTimer > 0) {
              ctx.strokeStyle = `rgba(52, 211, 153, ${opacity * 0.85})`;
              ctx.lineWidth = 2.0;
              ctx.beginPath();
              const angle = (n.connectedTimer / 20) * Math.PI * 2;
              ctx.arc(n.x, n.y, n.r * 2.0, -Math.PI / 2, -Math.PI / 2 + angle);
              ctx.stroke();
            }
          } else if (n.specialType === 'semilla') {
            // Dashed visual limit boundary for connections (CONNECT_DIST = 140px)
            ctx.strokeStyle = `rgba(251, 191, 36, ${opacity * (0.2 + Math.sin(timestamp * 0.005) * 0.08)})`;
            ctx.lineWidth = 1.0;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.arc(n.x, n.y, PHYSICS_CONFIG.CONNECT_DIST, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]); // reset

            // Glowing gold progress ring
            ctx.strokeStyle = `rgba(251, 191, 36, ${opacity * 0.35})`;
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 2.2, 0, Math.PI * 2);
            ctx.stroke();

            if (n.seedTimer && n.seedTimer > 0) {
              ctx.strokeStyle = `rgba(251, 191, 36, ${opacity * 0.9})`;
              ctx.lineWidth = 3.0;
              ctx.beginPath();
              const angle = (n.seedTimer / 20) * Math.PI * 2;
              ctx.arc(n.x, n.y, n.r * 2.2, -Math.PI / 2, -Math.PI / 2 + angle);
              ctx.stroke();
            }
          }

          // Hard Core dot
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * (0.8 + n.energy * 0.2)})`;
          ctx.arc(n.x, n.y, n.r * 0.9, 0, Math.PI * 2);
          ctx.fill();

          // Neon thin ring stroke
          ctx.strokeStyle = `rgba(${colorTheme.r}, ${colorTheme.g}, ${colorTheme.b}, ${opacity * 0.8})`;
          ctx.lineWidth = 1.0;
          ctx.stroke();

          // Draw Special Type character symbol
          if (n.specialType && n.specialType !== 'normal') {
            ctx.fillStyle = `rgba(15, 23, 42, ${opacity * 0.9})`; // dark slate contrasting center
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let sym = '';
            if (n.specialType === 'influencer') sym = '★';
            else if (n.specialType === 'disruptor') sym = '⚡';
            else if (n.specialType === 'organizador') sym = '♦';
            else if (n.specialType === 'explorador') sym = '▲';
            else if (n.specialType === 'semilla') sym = '🌱';
            ctx.fillText(sym, n.x, n.y);
          }
        });

        // Render floating score / update labels on canvas (in camera space)
        floatingTexts.forEach(ft => {
          ctx.save();
          ctx.font = 'bold 12px "Space Grotesk", "Inter", sans-serif';
          ctx.fillStyle = ft.color.replace('opacity', ft.opacity.toFixed(2));
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
          ctx.shadowBlur = 4;
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
        });

        ctx.restore(); // Restore camera translation/scale

        // C. Screen-space overlays (vignettes, borders)
        if (resonanceDurationLeftRef.current > 0) {
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

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, isGameOver]);

  // Handle Resize triggers using a high-fidelity ResizeObserver on the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && container) {
        const dpr = window.devicePixelRatio || 1;
        // Use clientWidth/Height with full window fallbacks to avoid 0px iframe glitches
        const w = container.clientWidth || window.innerWidth || 800;
        const h = container.clientHeight || window.innerHeight || 600;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        // Update isMobileMode dynamically on window resize or rotation
        const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        setIsMobileMode(w < 768 || touch);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);
    
    // run once immediately
    handleResize();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Determine System Zone based on health
  const getSystemZone = (h: number): SystemZone => {
    if (h < 15) return SystemZone.AISLAMIENTO;
    if (h < 35) return SystemZone.DISPERSION;
    if (h < 65) return SystemZone.EQUILIBRIO;
    if (h < 85) return SystemZone.CONGESTION;
    return SystemZone.SATURACION;
  };

  const getEcosystemPhase = (s: number) => {
    if (s < 250) {
      return {
        level: 1,
        name: "Fase 1: Aprendizaje",
        description: "Solo nodos normales. Conoce la atracción, la repulsión, el ancla y la resonancia.",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 border-blue-500/30",
        accentColor: "rgba(59, 130, 246, 0.4)",
        nextThreshold: 250
      };
    } else if (s < 900) {
      return {
        level: 2,
        name: "Fase 2: Diferenciación",
        description: "Partículas simples: surgieron Exploradores (▲) que se alejan y Catalizadores (♦) que estabilizan.",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 border-emerald-500/30",
        accentColor: "rgba(16, 185, 129, 0.4)",
        nextThreshold: 900
      };
    } else if (s < 1800) {
      return {
        level: 3,
        name: "Fase 3: Complejidad Social",
        description: "Fuerzas de poder: nacieron Influencers (★) de atracción masiva y Disruptores (⚡) de rechazo.",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 border-purple-500/30",
        accentColor: "rgba(168, 85, 247, 0.4)",
        nextThreshold: 1800
      };
    } else {
      return {
        level: 4,
        name: "Fase 4: Crisis y Metas",
        description: "Ecosistema maduro: ¡Aparecen Semillas de Comunidad (🌱) doradas y eventos de alta presión!",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 border-amber-500/30",
        accentColor: "rgba(245, 158, 11, 0.4)",
        nextThreshold: Infinity
      };
    }
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
    <div id="constelaciones-app-root" className="relative w-dvw h-dvh overflow-hidden flex flex-col font-sans select-none touch-none" ref={containerRef}>
      
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
      <header className={`absolute top-0 inset-x-0 px-4 sm:px-6 safe-pt flex justify-between items-start pointer-events-none z-10 transition-all duration-300 ${isHolding ? 'opacity-20' : 'opacity-100'}`}>
        
        {/* Score & Stats Card */}
        <div className="bg-slate-950/75 backdrop-blur-md border border-slate-800 rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-3 pointer-events-auto flex gap-2.5 sm:gap-6 items-center shadow-lg">
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <TrendingUp size={11} className="text-emerald-400" /> {isMobileMode ? 'Sincronía' : 'Sincronía Actual'}
            </span>
            <span className="text-xl sm:text-3xl font-bold font-display tracking-tight text-white transition-all">
              {Math.round(score)}
            </span>
          </div>
          <div className="h-8 w-[1px] bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <Award size={11} className="text-amber-400" /> {isMobileMode ? 'Récord' : 'Récord Máximo'}
            </span>
            <span className="text-lg sm:text-2xl font-semibold font-display tracking-tight text-amber-200">
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
            className={`p-3 sm:p-3 rounded-xl border backdrop-blur-md transition-all flex items-center justify-center cursor-pointer ${
              isMobileMode 
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                : 'bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
            title={isMobileMode ? "Cambiar a modo Alto Rendimiento (120 partículas)" : "Cambiar a modo Optimizado Celular (55 partículas)"}
          >
            {isMobileMode ? <Smartphone size={18} className="sm:w-[18px] sm:h-[18px]" /> : <Cpu size={18} className="sm:w-[18px] sm:h-[18px]" />}
          </button>

          {/* Audio toggle button */}
          <button
            id="audio-toggle-btn"
            onClick={toggleAudio}
            className={`p-3 sm:p-3 rounded-xl border backdrop-blur-md transition-all flex items-center justify-center cursor-pointer ${
              audioActive 
                ? 'bg-sky-950/60 border-sky-500/40 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.2)]' 
                : 'bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
            title={audioActive ? "Silenciar audio" : "Activar audio atmosférico"}
          >
            {audioActive ? <Volume2 size={18} className="sm:w-[18px] sm:h-[18px]" /> : <VolumeX size={18} className="sm:w-[18px] sm:h-[18px]" />}
          </button>

          {/* Info/Tutorial button */}
          <button
            id="tutorial-toggle-btn"
            onClick={() => setShowTutorial(true)}
            className="p-3 sm:p-3 rounded-xl border bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 backdrop-blur-md transition-all cursor-pointer"
            title="Cómo Jugar"
          >
            <HelpCircle size={18} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </header>

      {/* CENTRALIZED DYNAMIC EQUILIBRIO ZONE HUD PANEL */}
      <div className={`absolute top-[calc(5.5rem+env(safe-area-inset-top,0px))] sm:top-28 inset-x-0 flex flex-col items-center pointer-events-none z-10 px-4 transition-all duration-300 ${isHolding ? 'opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
        
        {/* Ecosystem Phase Capsule */}
        <div className={`mb-3 flex flex-col items-center max-w-xs sm:max-w-sm w-full px-3 py-1.5 rounded-xl border backdrop-blur-md transition-all duration-500 bg-slate-950/60 pointer-events-auto cursor-help group relative ${getEcosystemPhase(score).bgColor}`}>
          <div className="flex items-center justify-between w-full gap-2 text-[10px] sm:text-xs">
            <span className="font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
              🧬 ECOSISTEMA
            </span>
            <span className={`font-semibold tracking-wide font-display ${getEcosystemPhase(score).color}`}>
              {getEcosystemPhase(score).name}
            </span>
          </div>
          {/* Progress bar to next phase */}
          {getEcosystemPhase(score).nextThreshold !== Infinity && (
            <div className="w-full bg-slate-800 h-1 sm:h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  score >= 1800 ? 'bg-amber-500' : score >= 900 ? 'bg-purple-500' : score >= 250 ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{
                  width: `${Math.min(100, (score / getEcosystemPhase(score).nextThreshold) * 100)}%`
                }}
              />
            </div>
          )}
          {/* Elegant Tooltip describing Phase features on hover */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 sm:w-80 bg-slate-950/95 border border-slate-800 rounded-lg p-2.5 shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 z-50 text-left">
            <h4 className={`text-xs font-semibold font-display mb-1 ${getEcosystemPhase(score).color}`}>
              {getEcosystemPhase(score).name}
            </h4>
            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
              {getEcosystemPhase(score).description}
            </p>
            {getEcosystemPhase(score).nextThreshold !== Infinity && (
              <div className="mt-2 pt-2 border-t border-slate-900 flex justify-between items-center text-[9px] font-mono text-slate-400">
                <span>PROGRESO</span>
                <span>{Math.round(score)} / {getEcosystemPhase(score).nextThreshold} PTS</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Zone Banner Gauge */}
        <div className={`transition-all duration-300 w-full max-w-xs sm:max-w-md bg-slate-950/60 backdrop-blur-md border rounded-2xl p-2 sm:p-4 flex flex-col shadow-2xl items-center text-center pointer-events-none ${zoneDetails.bgColor} ${zoneDetails.glow}`}>
          
          <div className="flex items-center gap-1.5 mb-0.5 sm:mb-1">
            <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-current ${activeZone === SystemZone.EQUILIBRIO ? 'animate-ping' : ''} ${zoneDetails.textColor}`} />
            <h2 className={`font-display font-semibold tracking-wide text-xs sm:text-sm ${zoneDetails.textColor}`}>
              {zoneDetails.title}
            </h2>
          </div>
          
          {!isMobileMode && (
            <p className="text-xs text-slate-300 px-2 leading-relaxed mb-1">
              {zoneDetails.desc}
            </p>
          )}
  
          {/* Core Equilibrium Slider / Gauge */}
          <div className="w-full mt-1.5 sm:mt-3 relative flex flex-col">
            
            {/* Visual Health slider line */}
            <div className="h-1 sm:h-1.5 w-full bg-slate-900 rounded-full overflow-visible relative">
              {/* Healthy Zone boundaries background */}
              <div className="absolute left-[35%] right-[35%] top-0 bottom-0 bg-emerald-500/20 border-x border-emerald-500/30" />
              
              {/* Danger Left Aislamiento Zone */}
              <div className="absolute left-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-l-full" />
              
              {/* Danger Right Saturación Zone */}
              <div className="absolute right-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-r-full" />
  
              {/* Current Health slider thumb dot */}
              <div 
                className="absolute -top-1 sm:-top-1.5 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-white border-2 border-slate-950 -ml-1.5 sm:-ml-2 shadow-md transition-all duration-150 flex items-center justify-center"
                style={{ left: `${metrics.health}%` }}
              >
                <div className={`w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full ${
                  metrics.health < 15 || metrics.health > 85 ? 'bg-red-500' : 'bg-emerald-400'
                }`} />
              </div>
            </div>
  
            {/* Zone Markers / Labels (Visible on both Mobile and Desktop with highly intuitive alignment highlights) */}
            <div className="flex justify-between text-[8px] sm:text-[11px] font-mono uppercase tracking-wider mt-1.5 px-0.5">
              <span className={`transition-all duration-300 ${
                metrics.health < 35 
                  ? 'text-sky-400 font-bold drop-shadow-[0_0_8px_rgba(56,189,248,0.6)] scale-105' 
                  : 'text-slate-500/80'
              }`}>
                Aislamiento
              </span>
              <span className={`transition-all duration-300 ${
                metrics.health >= 35 && metrics.health <= 65 
                  ? 'text-emerald-400 font-bold drop-shadow-[0_0_8px_rgba(52,211,153,0.6)] scale-105' 
                  : 'text-slate-500/80'
              }`}>
                Equilibrio
              </span>
              <span className={`transition-all duration-300 ${
                metrics.health > 65 
                  ? 'text-rose-500 font-bold drop-shadow-[0_0_8px_rgba(244,63,94,0.6)] scale-105' 
                  : 'text-slate-500/80'
              }`}>
                Congestión
              </span>
            </div>
          </div>
          
          {/* Critical Timer Alarm Countdowns or Grace Period Stabilization */}
          {graceTimer > 0 ? (
            <div className="mt-2 bg-sky-950/85 border border-sky-500/30 rounded-lg px-2.5 py-1 text-center flex items-center gap-1.5 animate-pulse pointer-events-none">
              <Activity size={10} className="text-sky-400" />
              <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-sky-200">
                ESTABILIZANDO RED (Inmune): <b className="text-white">{graceTimer.toFixed(1)}s</b>
              </span>
            </div>
          ) : (
            (metrics.health < 15 || metrics.health > 85) && (
              <div className="mt-2 bg-red-950/85 border border-red-500/30 rounded-lg px-2.5 py-1 text-center flex items-center gap-1.5 animate-pulse pointer-events-none">
                <Activity size={10} className="text-red-500" />
                <span className="text-[10px] sm:text-xs font-mono uppercase tracking-widest text-red-200">
                  COLAPSO: <b className="text-white">{criticalSecondsLeft.toFixed(1)}s</b>
                </span>
              </div>
            )
          )}
  
          {/* Connection Score Gate Warning if connectivity < 20 */}
          {activeZone === SystemZone.EQUILIBRIO && metrics.connectivity < 20 && (
            <div className="mt-2 bg-yellow-950/45 border border-yellow-500/20 rounded-lg px-2.5 py-1 text-center flex items-center gap-1 pointer-events-none">
              <span className="text-[10px] sm:text-xs font-mono uppercase text-yellow-300">
                ⚠️ Candado: Conectividad {metrics.connectivity.toFixed(0)}% / 20%
              </span>
            </div>
          )}
        </div>

        {/* OBJECTIVE HUD CARD */}
        {currentObjective && (
          <div className="mt-2.5 w-full max-w-xs sm:max-w-md bg-slate-950/85 backdrop-blur-md border border-purple-900/40 rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 shadow-xl pointer-events-auto transition-all animate-fade-in">
            <div className="flex flex-col flex-1 min-w-0 text-left">
              <span className="text-[9px] font-mono uppercase tracking-widest text-purple-400 font-bold flex items-center gap-1">
                <Target size={11} className="text-purple-400 animate-pulse shrink-0" /> OBJETIVO DINÁMICO
              </span>
              <span className="text-xs sm:text-sm font-bold text-white tracking-tight truncate mt-0.5">
                {currentObjective.title}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-300 leading-tight mt-0.5">
                {currentObjective.description}
              </span>
            </div>
            
            {/* Progress countdown bar */}
            <div className="flex flex-col items-end shrink-0">
              <span className="text-xs font-mono font-bold text-purple-300">
                {currentObjective.currentProgress.toFixed(1)}s / {currentObjective.durationToHold.toFixed(0)}s
              </span>
              <div className="w-16 sm:w-20 h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1 border border-slate-800">
                <div 
                  className={`h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-100 ${
                    currentObjective.currentProgress > 0 ? 'animate-pulse bg-purple-400' : 'bg-purple-600'
                  }`} 
                  style={{ width: `${(currentObjective.currentProgress / currentObjective.durationToHold) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
  
        {/* ACTIVE RANDOM ENVIRONMENTAL THREAT PANEL (Desktop Only) */}
        {!isMobileMode && activeEvent.type !== 'NONE' && (
          <div className="mt-3 w-full max-w-sm bg-indigo-950/70 backdrop-blur-md border border-indigo-500/30 rounded-xl p-3 flex gap-3 shadow-xl relative overflow-hidden animate-breathing pointer-events-none">
            <div className="absolute inset-y-0 left-0 w-1 bg-indigo-400" />
            <div className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center self-start">
              <Compass size={16} className="animate-spin" style={{ animationDuration: '8s' }} />
            </div>
            <div className="flex flex-col flex-1">
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-xs font-semibold text-indigo-100">{activeEvent.name}</span>
                <span className="text-[11px] sm:text-xs font-mono text-indigo-300">Quedan {activeEvent.durationLeft.toFixed(1)}s</span>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-200/80 leading-relaxed leading-snug">
                {activeEvent.description}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ACTIVE RANDOM ENVIRONMENTAL THREAT PANEL (Mobile Floating Pill Toast) */}
      {isMobileMode && activeEvent.type !== 'NONE' && (
        <div className="absolute top-[calc(4.5rem+env(safe-area-inset-top,0px))] right-4 z-10 max-w-[160px] bg-indigo-950/85 backdrop-blur-md border border-indigo-500/30 rounded-xl px-2.5 py-1.5 flex gap-2 shadow-xl items-center pointer-events-none animate-pulse">
          <div className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
            <Compass size={12} className="animate-spin" style={{ animationDuration: '6s' }} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-bold text-indigo-100 truncate leading-none mb-0.5">{activeEvent.name}</span>
            <span className="text-[9px] font-mono text-indigo-300/90 leading-none">Quedan {activeEvent.durationLeft.toFixed(0)}s</span>
          </div>
        </div>
      )}

      {/* BOTTOM CONTROL ACTIONS / UTILITY FOOTER DOCK */}
      {isMobileMode ? (
        /* MOBILE HUD: Ergonomic split controls for thumb play */
        <div className={`absolute bottom-0 inset-x-0 p-4 safe-pb pointer-events-none z-10 flex justify-between items-end transition-all duration-300 ${isHolding ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
          
          {/* Bottom Left: Repel / Attract Pill */}
          <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-1 flex gap-1 shadow-lg">
            <button
              id="mode-repel-btn-mob"
              onClick={() => setInteractionMode('repel')}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-1 ${
                interactionMode === 'repel'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/25 shadow-sm'
                  : 'text-slate-400'
              }`}
              title="Modo Repeler"
            >
              <Zap size={14} />
              <span>Repeler</span>
            </button>
            <button
              id="mode-attract-btn-mob"
              onClick={() => setInteractionMode('attract')}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-1 ${
                interactionMode === 'attract'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25 shadow-sm'
                  : 'text-slate-400'
              }`}
              title="Modo Atraer"
            >
              <Anchor size={14} />
              <span>Atraer</span>
            </button>
          </div>

          {/* Bottom Right: Resonance circular FAB + Pulse Status */}
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            {/* Pulse Cooldown Badge */}
            <div className="bg-slate-950/85 backdrop-blur-sm border border-slate-800 rounded-lg px-2 py-0.5 text-[9px] font-mono text-slate-400 shadow-md">
              PULSO: {pulseCooldown > 0 ? `${pulseCooldown.toFixed(1)}s` : 'Listo'}
            </div>
            
            {/* Resonance FAB Button */}
            <button
              id="resonance-active-btn-mob"
              onClick={triggerResonance}
              disabled={resonanceCooldown > 0 || resonanceDurationLeft > 0}
              className={`w-14 h-14 rounded-full border flex flex-col items-center justify-center cursor-pointer transition-all shadow-2xl relative ${
                resonanceDurationLeft > 0
                  ? 'bg-purple-500/25 text-purple-200 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-pulse'
                  : resonanceCooldown > 0
                    ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-purple-950/70 border-purple-800/80 text-purple-300 hover:text-white hover:border-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
              }`}
              title="Resonancia: Duplica fuerzas temporalmente"
            >
              <Radio size={18} className={resonanceDurationLeft > 0 ? 'animate-pulse' : ''} />
              {resonanceDurationLeft > 0 ? (
                <span className="text-[9px] font-mono font-bold mt-0.5 text-purple-200">
                  {resonanceDurationLeft.toFixed(0)}s
                </span>
              ) : resonanceCooldown > 0 ? (
                <span className="text-[9px] font-mono font-bold mt-0.5 text-slate-500">
                  {resonanceCooldown.toFixed(0)}s
                </span>
              ) : (
                <span className="text-[7px] font-mono font-bold tracking-tighter uppercase mt-0.5 opacity-85">
                  RESONAR
                </span>
              )}
            </button>
          </div>

          {/* Bottom Center text hint floating (fully transparent/non-blocking) */}
          <div className="absolute bottom-1 px-4 inset-x-0 flex justify-center pointer-events-none pb-safe">
            <p className="text-[9px] text-slate-500/60 font-mono uppercase tracking-widest text-center">
              Toca para Pulso · Mantén para Gravedad
            </p>
          </div>
        </div>
      ) : (
        /* DESKTOP HUD: Sleek centralized control dock */
        <footer className={`absolute bottom-0 inset-x-0 px-4 sm:px-6 safe-pb pointer-events-none z-10 flex flex-col items-center transition-all duration-300 ${isHolding ? 'opacity-20' : 'opacity-100'}`}>
          
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
                <span className="text-[10px] sm:text-xs font-mono uppercase text-slate-500 text-center">
                  Pulso (Click)
                </span>
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
                <Radio size={14} className={resonanceDurationLeft > 0 ? 'animate-pulse' : ''} />
                <span className="text-xs font-medium tracking-wide uppercase">
                  {resonanceDurationLeft > 0 
                    ? `RESONANDO (${resonanceDurationLeft.toFixed(1)}s)` 
                    : resonanceCooldown > 0 
                      ? `RESONAR (${resonanceCooldown.toFixed(1)}s)`
                      : 'RESONAR [Espacio]'}
                </span>
              </button>
            </div>
          </div>
  
          {/* Minimal interaction hint */}
          <p className="text-[11px] sm:text-xs text-slate-500 font-mono uppercase tracking-widest mt-2 text-center px-4">
            Click para Pulso | Mantener presionado para Anclar Gravedad
          </p>
        </footer>
      )}

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
      <AnimatePresence>
        {showTutorial && (
          <TutorialModal
            isPlaying={isPlaying}
            isMobileMode={isMobileMode}
            onClose={() => setShowTutorial(false)}
            onPlay={() => {
              setShowTutorial(false);
              if (!isPlaying) {
                handleStartGame();
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* GAME OVER / SYSTEM COLLAPSED OVERLAY */}
      <AnimatePresence>
        {isGameOver && (
          <GameOverModal
            score={score}
            highScore={highScore}
            activeZone={activeZone}
            onRestart={handleStartGame}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
