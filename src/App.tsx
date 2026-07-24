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
  Target,
  Clock,
  Lock
} from 'lucide-react';
import { 
  GameNode, 
  GameMetrics, 
  GameEvent, 
  EventType, 
  PHYSICS_CONFIG, 
  SystemZone,
  DynamicObjective,
  GameMode,
  GamePreset,
  PartidaResult,
  PRESET_ESTANDAR,
  PARTIDA_CAMPAIGN_LEVELS,
  PartidaLevel
} from './types';
import { 
  generateInitialNodes, 
  generateIncomingNode, 
  updatePhysics, 
  calculateGameMetrics,
  findEmptyPosition,
  getMaxConnectedComponentSize
} from './lib/physics';
import { ambientSynth } from './lib/audio';
import { AnimatePresence } from 'motion/react';
import { TutorialModal } from './components/TutorialModal';
import { GameOverModal } from './components/GameOverModal';

const getTargetNodesCount = (
  currentScore: number, 
  isMobile: boolean, 
  mode: GameMode = 'endless', 
  selectedLevel: number = 1
) => {
  if (mode === 'partida') {
    const lvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
    return lvlCfg.nodeCount;
  }
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
  // Campaign Progression State
  const [unlockedLevel, setUnlockedLevel] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('constelaciones_unlocked_level');
      return saved ? parseInt(saved, 10) : 1;
    } catch {
      return 1;
    }
  });
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const selectedLevelRef = useRef<number>(1);

  // Game Mode State & Refs
  const [gameMode, setGameMode] = useState<GameMode>('partida');
  const gameModeRef = useRef<GameMode>('partida');

  const [selectedPreset, setSelectedPreset] = useState<GamePreset>(PRESET_ESTANDAR);
  const selectedPresetRef = useRef<GamePreset>(PRESET_ESTANDAR);

  const [partidaTimeLeft, setPartidaTimeLeft] = useState<number>(75.0);
  const partidaTimeLeftRef = useRef<number>(75.0);

  const [partidaObjectiveIndex, setPartidaObjectiveIndex] = useState<number>(0);
  const partidaObjectiveIndexRef = useRef<number>(0);

  const [partidaTransitionMessage, setPartidaTransitionMessage] = useState<string | null>(null);
  const partidaTransitionTimerRef = useRef<number>(0);

  const [partidaResult, setPartidaResult] = useState<PartidaResult | null>(null);

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
  const [highScoreEndless, setHighScoreEndless] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('constelaciones_high_score');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [highScorePartida, setHighScorePartida] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('constelaciones_partida_high_score');
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const highScore = gameMode === 'partida' ? highScorePartida : highScoreEndless;
  const highScoreEndlessRef = useRef<number>(highScoreEndless);
  const highScorePartidaRef = useRef<number>(highScorePartida);
  highScoreEndlessRef.current = highScoreEndless;
  highScorePartidaRef.current = highScorePartida;
  const highScoreRef = useRef<number>(highScore);
  highScoreRef.current = highScore;
  
  const [metrics, setMetrics] = useState<GameMetrics>({
    crowding: 0,
    isolation: 0,
    health: 50,
    clusterQuality: 0,
    connectivity: 0,
    clusterCount: 0,
    activeLinks: 0
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
  const [isFreePlay, setIsFreePlay] = useState<boolean>(false);
  const isFreePlayRef = useRef<boolean>(false);

  // Dynamic Objectives State
  const [currentObjective, setCurrentObjective] = useState<DynamicObjective | null>(null);
  const currentObjectiveRef = useRef<DynamicObjective | null>(null);
  const objectiveSwitchTimerRef = useRef<number>(0); // timer until next objective starts
  const targetSpecialNodeIdRef = useRef<string | null>(null);
  const completedObjectivesCountRef = useRef<number>(0);

  // Dynamic Floating Text score markers for animations
  const [floatingTexts, setFloatingTexts] = useState<Array<{ id: string; x: number; y: number; text: string; opacity: number; color: string }>>([]);

  const OBJECTIVE_TEMPLATES: Array<Omit<DynamicObjective, 'id' | 'currentProgress' | 'status'>> = [
    {
      title: "Sincronía Cohesiva",
      description: "Mantén la salud de la red en equilibrio (35% - 65%).",
      type: "MANTENER_SINCRONIA",
      targetValue: 35,
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
      description: "Mantené el aislamiento por debajo del 50%.",
      type: "EVITAR_AISLAMIENTO",
      targetValue: 50,
      durationToHold: 10
    },
    {
      title: "Conexión Especial",
      description: "Mantené el nodo ★ conectado a la red.",
      type: "CONECTAR_ESPECIALES",
      targetValue: 1,
      durationToHold: 10
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

  const checkObjectiveCondition = (
    objectiveType: string, 
    metricsVal: GameMetrics, 
    nodes: GameNode[],
    targetSpecialId?: string | null
  ): boolean => {
    switch (objectiveType) {
      case 'MANTENER_COMUNIDADES': {
        const targetVal = currentObjectiveRef.current?.targetValue || 2;
        const maxCompSize = getMaxConnectedComponentSize(nodes);
        return metricsVal.activeLinks >= targetVal || maxCompSize >= (targetVal + 1) || metricsVal.clusterCount >= 1;
      }
      case 'MANTENER_SINCRONIA':
        // Spec v1.3 Obj 2: 35 <= health <= 65
        return metricsVal.health >= 35 && metricsVal.health <= 65;
      case 'EVITAR_CONGESTION':
        return metricsVal.health <= 75;
      case 'EVITAR_AISLAMIENTO':
        // Spec v1.3 Obj 1: isolation < 50
        return metricsVal.isolation < 50;
      case 'CONECTAR_ESPECIALES': {
        // Spec v1.3 Obj 3: target special node has at least 1 active neighbor within 100px (CONNECT_DIST)
        let specialNode: GameNode | undefined;
        if (targetSpecialId) {
          specialNode = nodes.find(n => !n.isGhost && n.id === targetSpecialId);
        }
        if (!specialNode) {
          specialNode = nodes.find(n => !n.isGhost && (n.specialType === 'explorador' || n.specialType === 'organizador'));
        }
        if (!specialNode) return false;

        // Check if specialNode has at least 1 active neighbor within CONNECT_DIST (100px)
        let hasNeighbor = false;
        for (let j = 0; j < nodes.length; j++) {
          const other = nodes[j];
          if (other.id === specialNode.id || other.isGhost) continue;
          let dx = other.x - specialNode.x;
          let dy = other.y - specialNode.y;
          if (dx > PHYSICS_CONFIG.WORLD_WIDTH / 2) dx -= PHYSICS_CONFIG.WORLD_WIDTH;
          else if (dx < -PHYSICS_CONFIG.WORLD_WIDTH / 2) dx += PHYSICS_CONFIG.WORLD_WIDTH;
          if (dy > PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy -= PHYSICS_CONFIG.WORLD_HEIGHT;
          else if (dy < -PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy += PHYSICS_CONFIG.WORLD_HEIGHT;
          if (Math.hypot(dx, dy) < PHYSICS_CONFIG.CONNECT_DIST) {
            hasNeighbor = true;
            break;
          }
        }
        return hasNeighbor;
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

  // High Score helper for both game modes
  const updateHighScore = (roundedScore: number) => {
    if (gameModeRef.current === 'partida') {
      if (roundedScore > highScorePartidaRef.current) {
        setHighScorePartida(roundedScore);
        highScorePartidaRef.current = roundedScore;
        try { localStorage.setItem('constelaciones_partida_high_score', roundedScore.toString()); } catch {}
      }
    } else {
      if (roundedScore > highScoreEndlessRef.current) {
        setHighScoreEndless(roundedScore);
        highScoreEndlessRef.current = roundedScore;
        try { localStorage.setItem('constelaciones_high_score', roundedScore.toString()); } catch {}
      }
    }
  };

  // Read High Scores on Init
  useEffect(() => {
    try {
      const savedEndless = localStorage.getItem('constelaciones_high_score');
      if (savedEndless) setHighScoreEndless(parseInt(savedEndless, 10));
      const savedPartida = localStorage.getItem('constelaciones_partida_high_score');
      if (savedPartida) setHighScorePartida(parseInt(savedPartida, 10));
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
  const handleStartGame = (mode: GameMode = gameMode, levelNum: number = selectedLevel) => {
    setGameMode(mode);
    gameModeRef.current = mode;
    setSelectedLevel(levelNum);
    selectedLevelRef.current = levelNum;

    setIsGameOver(false);
    setIsPlaying(true);
    setPartidaResult(null);
    setIsFreePlay(false);
    isFreePlayRef.current = false;

    setScore(0);
    scoreRef.current = 0;
    
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
    
    targetSpecialNodeIdRef.current = null;
    completedObjectivesCountRef.current = 0;

    const currentLevelConfig: PartidaLevel = PARTIDA_CAMPAIGN_LEVELS[levelNum - 1] || PARTIDA_CAMPAIGN_LEVELS[0];

    if (mode === 'partida') {
      currentPhaseRef.current = Math.min(levelNum, 2);
      partidaTimeLeftRef.current = currentLevelConfig.sessionDuration;
      setPartidaTimeLeft(currentLevelConfig.sessionDuration);

      partidaObjectiveIndexRef.current = 0;
      setPartidaObjectiveIndex(0);
      partidaTransitionTimerRef.current = 0;
      setPartidaTransitionMessage(null);

      if (currentLevelConfig.sequenceObjectives && currentLevelConfig.sequenceObjectives.length > 0) {
        const firstStep = currentLevelConfig.sequenceObjectives[0];
        const firstObj: DynamicObjective = {
          id: firstStep.id,
          title: firstStep.title,
          description: firstStep.description,
          type: firstStep.type,
          targetValue: firstStep.targetValue,
          currentProgress: 0,
          durationToHold: firstStep.durationToHold,
          status: 'ACTIVE',
          windowStart: firstStep.windowStart,
          windowEnd: firstStep.windowEnd
        };
        setCurrentObjective(firstObj);
        currentObjectiveRef.current = firstObj;
      } else {
        const singleObj: DynamicObjective = {
          id: currentLevelConfig.objective.id,
          title: currentLevelConfig.objective.title,
          description: currentLevelConfig.objective.description,
          type: currentLevelConfig.objective.type,
          targetValue: currentLevelConfig.objective.targetValue,
          currentProgress: 0,
          durationToHold: currentLevelConfig.objective.durationToHold,
          status: 'ACTIVE'
        };
        setCurrentObjective(singleObj);
        currentObjectiveRef.current = singleObj;
      }
    } else {
      currentPhaseRef.current = 1;
      setCurrentObjective(null);
      currentObjectiveRef.current = null;
    }

    // Create baseline nodes in LOGICAL coordinates
    const normalCount = mode === 'partida' 
      ? Math.max(1, currentLevelConfig.nodeCount - (currentLevelConfig.hasSpecialNode ? 1 : 0))
      : getTargetNodesCount(0, isMobileMode, mode, 1);

    const spawnRadius = mode === 'partida' ? currentLevelConfig.spawnRadius : 400;

    nodesRef.current = generateInitialNodes(
      normalCount,
      PHYSICS_CONFIG.WORLD_WIDTH,
      PHYSICS_CONFIG.WORLD_HEIGHT,
      spawnRadius
    );

    // If level has special node (Level 4, 5, 6), spawn one inside the cluster
    if (mode === 'partida' && currentLevelConfig.hasSpecialNode) {
      const specialType = currentLevelConfig.specialNodeType || (Math.random() < 0.5 ? 'explorador' : 'organizador');
      const angle = Math.random() * Math.PI * 2;
      const dist = spawnRadius * 0.7;
      const centerX = PHYSICS_CONFIG.WORLD_WIDTH / 2;
      const centerY = PHYSICS_CONFIG.WORLD_HEIGHT / 2;
      const specialNode: GameNode = {
        id: Math.random().toString(36).substring(2, 9),
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        r: specialType === 'organizador' ? 6.5 : 5.5,
        energy: 0.3,
        groupId: null,
        lifetime: Date.now(),
        isGhost: false,
        colorIndex: Math.floor(Math.random() * 4),
        specialType,
        connectedTimer: specialType === 'explorador' ? 0 : undefined
      };
      nodesRef.current.push(specialNode);
      targetSpecialNodeIdRef.current = specialNode.id;
    }

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
    const currentLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
    const allowedActions = gameModeRef.current === 'endless' ? ['pulso', 'ancla', 'resonancia'] : (currentLvlCfg.allowedActions || ['pulso', 'ancla', 'resonancia']);

    if (!allowedActions.includes('resonancia')) {
      setFloatingTexts(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.4,
          text: "🔒 La Resonancia se desbloquea en el Nivel 3",
          opacity: 1.0,
          color: "rgba(244, 63, 94, 0.9)"
        }
      ]);
      return;
    }

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
    const currentLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
    const allowedActions = gameModeRef.current === 'endless' ? ['pulso', 'ancla', 'resonancia'] : (currentLvlCfg.allowedActions || ['pulso', 'ancla', 'resonancia']);

    if (allowedActions.includes('ancla')) {
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
    } else if (interactionModeRef.current === 'attract') {
      setFloatingTexts(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.4,
          text: "🔒 El Ancla (Gravedad) se desbloquea en el Nivel 2",
          opacity: 1.0,
          color: "rgba(244, 63, 94, 0.9)"
        }
      ]);
    }
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
        const currentLvlConfig = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
        const canTriggerEvents = gameModeRef.current === 'endless' || (gameModeRef.current === 'partida' && currentLvlConfig.hasEvents);

        if (canTriggerEvents) {
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
        }

        // 2. FIFO Node continuous spawner with Dynamic Density & Intelligent Placement
        spawnTimerRef.current += dt;
        const currentTarget = getTargetNodesCount(
          scoreRef.current, 
          isMobileMode, 
          gameModeRef.current, 
          selectedLevelRef.current
        );
        const activeNodesCount = nodesRef.current.filter(n => !n.isGhost).length;

        // Session Timer Countdown for Partida Mode
        const currentLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
        if (gameModeRef.current === 'partida' && currentLvlCfg.sessionDuration > 0 && !isFreePlayRef.current) {
          partidaTimeLeftRef.current = Math.max(0, partidaTimeLeftRef.current - dt);
          setPartidaTimeLeft(partidaTimeLeftRef.current);

          if (partidaTimeLeftRef.current <= 0 && !isGameOver) {
            const completedCount = completedObjectivesCountRef.current;
            const seqObjs = currentLvlCfg.sequenceObjectives || [];
            const totalObjs = seqObjs.length > 0 ? seqObjs.length : 1;
            const isWin = completedCount >= totalObjs;

            setPartidaResult({
              status: isWin ? 'VICTORY' : 'PARTIAL',
              objectivesCompletedCount: completedCount,
              totalObjectives: totalObjs,
              timeRemainingBonus: 0,
              score: Math.round(scoreRef.current),
              timeElapsed: currentLvlCfg.sessionDuration
            });
            setIsGameOver(true);
          }
        }
        
        // Spawning logic:
        // In Partida mode, do NOT continuously spawn new nodes or ghost existing nodes once max target is reached!
        const shouldSpawnInPartida = gameModeRef.current === 'partida' && activeNodesCount < currentTarget;
        const shouldSpawnInEndless = gameModeRef.current === 'endless';

        if (shouldSpawnInPartida || shouldSpawnInEndless) {
          const spawnInterval = activeNodesCount < currentTarget ? 1.5 : PHYSICS_CONFIG.SPAWN_INTERVAL;

          if (spawnTimerRef.current >= spawnInterval) {
            spawnTimerRef.current = 0;
            
            const maxAllowed = currentTarget;

            // In endless mode, if limit reached, convert oldest active node to a ghost state
            if (shouldSpawnInEndless && activeNodesCount >= maxAllowed) {
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

            // Generate new node arriving
            const currentScore = scoreRef.current;
            let forcedType: 'normal' | 'influencer' | 'disruptor' | 'organizador' | 'explorador' | 'semilla' = 'normal';
            
            const activeSpecialCount = nodesRef.current.filter(
              n => !n.isGhost && n.specialType && n.specialType !== 'normal' && n.specialType !== 'semilla'
            ).length;

            if (gameModeRef.current === 'partida') {
              if (currentObjectiveRef.current?.type === 'CONECTAR_ESPECIALES' && activeSpecialCount === 0) {
                forcedType = Math.random() < 0.5 ? 'explorador' : 'organizador';
              } else {
                forcedType = 'normal';
              }
            } else if (currentScore < 250) {
              forcedType = 'normal';
            } else if (currentScore < 900) {
              if (activeSpecialCount < 1 && Math.random() < 0.20) {
                forcedType = Math.random() < 0.5 ? 'explorador' : 'organizador';
              } else {
                forcedType = 'normal';
              }
            } else if (currentScore < 1800) {
              if (activeSpecialCount < 2 && Math.random() < 0.25) {
                const options: Array<'explorador' | 'organizador' | 'influencer' | 'disruptor'> = [
                  'explorador', 'organizador', 'influencer', 'disruptor'
                ];
                forcedType = options[Math.floor(Math.random() * options.length)];
              } else {
                forcedType = 'normal';
              }
            } else {
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
              updateHighScore(rounded);
            }
            return nextScore;
          });
        }

        // 6. Defeat Critical Timers Logic
        // "Si la red permanece en cualquiera de las dos Zonas Críticas (0-15 o 85-100), se activa el criticalTimer (10s)"
        const inCriticalZone = nextMetrics.health < 15 || nextMetrics.health > 85;

        if (inCriticalZone && !isFreePlayRef.current) {
          if (graceTimerRef.current <= 0) {
            setCriticalSecondsLeft(prev => {
              const nextVal = Math.max(0, prev - dt);
              if (nextVal <= 0) {
                if (gameModeRef.current === 'partida') {
                  const currentLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
                  const seqObjs = currentLvlCfg.sequenceObjectives || [];
                  const totalObjs = seqObjs.length > 0 ? seqObjs.length : 1;
                  setPartidaResult({
                    status: 'GAME_OVER',
                    objectivesCompletedCount: completedObjectivesCountRef.current,
                    totalObjectives: totalObjs,
                    timeRemainingBonus: 0,
                    score: Math.round(scoreRef.current),
                    timeElapsed: currentLvlCfg.sessionDuration > 0 ? currentLvlCfg.sessionDuration - partidaTimeLeftRef.current : 0
                  });
                }
                setIsGameOver(true);
              }
              return nextVal;
            });
          }
        } else {
          // Reset countdown timer when restored to safety
          setCriticalSecondsLeft(10.0);
        }

        // 6.2. Ecosystem Evolution Phase transition checks (Endless Mode)
        if (gameModeRef.current === 'endless') {
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
        }

        // 6.3. Seed Spawn Logic (Phase 4 only)
        if (currentPhaseRef.current === 4) {
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
                updateHighScore(rounded);
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
                  updateHighScore(rounded);
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

        // Dynamic Objectives evaluation
        if (gameModeRef.current === 'partida') {
          const currentLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
          const sequence = currentLvlCfg.sequenceObjectives || [];

          if (sequence.length > 0) {
            const timeElapsed = currentLvlCfg.sessionDuration - partidaTimeLeftRef.current;

            // Determine expected window index based on absolute timeElapsed:
            let targetWindowIdx = 0;
            if (timeElapsed >= 70) {
              targetWindowIdx = 3;
            } else if (timeElapsed >= 45) {
              targetWindowIdx = 2;
            } else if (timeElapsed >= 20) {
              targetWindowIdx = 1;
            } else {
              targetWindowIdx = 0;
            }

            // Window transition trigger
            if (targetWindowIdx !== partidaObjectiveIndexRef.current) {
              if (currentObjectiveRef.current && currentObjectiveRef.current.status === 'ACTIVE') {
                const failedObj = { ...currentObjectiveRef.current, status: 'FAILED' as const };
                currentObjectiveRef.current = failedObj;
                setCurrentObjective(failedObj);
              }

              partidaObjectiveIndexRef.current = targetWindowIdx;
              setPartidaObjectiveIndex(targetWindowIdx);

              if (targetWindowIdx < sequence.length) {
                const nextStep = sequence[targetWindowIdx];
                if (nextStep) {
                  let targetNodeId: string | undefined = undefined;

                  if (nextStep.type === 'CONECTAR_ESPECIALES') {
                    let targetNode = nodesRef.current.find(n => !n.isGhost && (n.specialType === 'explorador' || n.specialType === 'organizador'));
                    if (!targetNode) {
                      const forcedType = Math.random() < 0.5 ? 'explorador' : 'organizador';
                      targetNode = generateIncomingNode(PHYSICS_CONFIG.WORLD_WIDTH, PHYSICS_CONFIG.WORLD_HEIGHT, forcedType, nodesRef.current);
                      nodesRef.current.push(targetNode);
                    }
                    targetNodeId = targetNode.id;
                    targetSpecialNodeIdRef.current = targetNode.id;
                  }

                  const newObj: DynamicObjective = {
                    id: nextStep.id,
                    title: nextStep.title,
                    description: nextStep.description,
                    type: nextStep.type,
                    targetValue: nextStep.targetValue,
                    currentProgress: 0,
                    durationToHold: nextStep.durationToHold,
                    status: 'ACTIVE',
                    targetSpecialNodeId: targetNodeId,
                    windowStart: nextStep.windowStart,
                    windowEnd: nextStep.windowEnd
                  };
                  currentObjectiveRef.current = newObj;
                  setCurrentObjective(newObj);
                }
              } else {
                currentObjectiveRef.current = null;
                setCurrentObjective(null);
                targetSpecialNodeIdRef.current = null;
              }
            }
          }

          // Evaluate current ACTIVE objective
          if (currentObjectiveRef.current && currentObjectiveRef.current.status === 'ACTIVE') {
            const obj = currentObjectiveRef.current;

            // Safety check for Objective 3
            if (obj.type === 'CONECTAR_ESPECIALES') {
              let targetNode = nodesRef.current.find(n => !n.isGhost && n.id === targetSpecialNodeIdRef.current);
              if (!targetNode) {
                targetNode = nodesRef.current.find(n => !n.isGhost && (n.specialType === 'explorador' || n.specialType === 'organizador'));
                if (!targetNode) {
                  const forcedType = Math.random() < 0.5 ? 'explorador' : 'organizador';
                  targetNode = generateIncomingNode(PHYSICS_CONFIG.WORLD_WIDTH, PHYSICS_CONFIG.WORLD_HEIGHT, forcedType, nodesRef.current);
                  nodesRef.current.push(targetNode);
                }
                targetSpecialNodeIdRef.current = targetNode.id;
              }
            }

            const isMet = checkObjectiveCondition(obj.type, nextMetrics, nodesRef.current, targetSpecialNodeIdRef.current);

            if (isMet) {
              const nextProg = obj.currentProgress + dt;
              if (nextProg >= obj.durationToHold) {
                // Step completed!
                const updatedObj = { ...obj, currentProgress: obj.durationToHold, status: 'COMPLETED' as const };
                setCurrentObjective(updatedObj);
                currentObjectiveRef.current = updatedObj;

                completedObjectivesCountRef.current += 1;

                // Award bonus +500
                setScore(prev => {
                  const newScore = prev + 500;
                  scoreRef.current = newScore;
                  const rounded = Math.round(newScore);
                  updateHighScore(rounded);
                  return newScore;
                });

                // Unlock next campaign level
                setUnlockedLevel(prev => {
                  const nextLvl = Math.max(prev, selectedLevelRef.current + 1);
                  try {
                    localStorage.setItem('constelaciones_unlocked_level', nextLvl.toString());
                  } catch {
                    // ignore localstorage errors
                  }
                  return nextLvl;
                });

                const currentLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevelRef.current - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
                const seqObjectives = currentLvlCfg.sequenceObjectives || [];

                setFloatingTexts(prev => [
                  ...prev,
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    x: width / 2,
                    y: height * 0.35,
                    text: seqObjectives.length > 0 
                      ? `✨ ¡OBJETIVO ${partidaObjectiveIndexRef.current + 1}/${seqObjectives.length} CUMPLIDO! (+500 PTS) ✨`
                      : `✨ ¡PARTIDA ${selectedLevelRef.current} COMPLETADA! (+500 PTS) ✨`,
                    opacity: 1.0,
                    color: "rgba(245, 158, 11, opacity)"
                  }
                ]);

                if (audioActiveRef.current) {
                  ambientSynth.playResonanceSFX();
                }

                if (seqObjectives.length > 0) {
                  // Sequence level (e.g. Level 6)
                  if (partidaObjectiveIndexRef.current === seqObjectives.length - 1) {
                    const timeRemaining = partidaTimeLeftRef.current;
                    const timeBonus = isFinite(timeRemaining) ? Math.round(timeRemaining * 10) : 0;
                    const finalScore = Math.round(scoreRef.current + timeBonus);

                    scoreRef.current = finalScore;
                    setScore(finalScore);
                    updateHighScore(finalScore);

                    setIsFreePlay(true);
                    isFreePlayRef.current = true;

                    setPartidaResult({
                      status: 'VICTORY',
                      objectivesCompletedCount: completedObjectivesCountRef.current,
                      totalObjectives: seqObjectives.length,
                      timeRemainingBonus: timeBonus,
                      score: finalScore,
                      timeElapsed: currentLvlCfg.sessionDuration - timeRemaining
                    });
                  } else {
                    setPartidaTransitionMessage(`✓ OBJETIVO ${partidaObjectiveIndexRef.current + 1}/${seqObjectives.length} COMPLETADO`);
                    setTimeout(() => setPartidaTransitionMessage(null), 1200);
                  }
                } else {
                  // Single objective level victory (Levels 1..12)
                  const timeRemaining = partidaTimeLeftRef.current;
                  const timeBonus = isFinite(timeRemaining) ? Math.round(timeRemaining * 10) : 0;
                  const finalScore = Math.round(scoreRef.current + timeBonus);

                  scoreRef.current = finalScore;
                  setScore(finalScore);
                  updateHighScore(finalScore);

                  setIsFreePlay(true);
                  isFreePlayRef.current = true;

                  setPartidaResult({
                    status: 'VICTORY',
                    objectivesCompletedCount: 1,
                    totalObjectives: 1,
                    timeRemainingBonus: timeBonus,
                    score: finalScore,
                    timeElapsed: 0
                  });
                }
              } else {
                const updatedObj = { ...obj, currentProgress: nextProg };
                setCurrentObjective(updatedObj);
                currentObjectiveRef.current = updatedObj;
              }
            } else {
              // STRICT CONTINUOUS RESET TO 0 IF CONDITION BROKEN
              if (obj.currentProgress !== 0) {
                const updatedObj = { ...obj, currentProgress: 0 };
                setCurrentObjective(updatedObj);
                currentObjectiveRef.current = updatedObj;
              }
            }
          }
        } else if (currentPhaseRef.current >= 4) {
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
                      updateHighScore(rounded);
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

        // Objective Visual Signal Overlay: EVITAR_AISLAMIENTO halos
        if (currentObjectiveRef.current?.type === 'EVITAR_AISLAMIENTO' && currentObjectiveRef.current?.status === 'ACTIVE') {
          rawNodes.forEach(n => {
            if (n.isGhost) return;
            let isIsolated = true;
            for (let j = 0; j < rawNodes.length; j++) {
              if (rawNodes[j].id === n.id || rawNodes[j].isGhost) continue;
              let dx = rawNodes[j].x - n.x;
              let dy = rawNodes[j].y - n.y;
              if (dx > PHYSICS_CONFIG.WORLD_WIDTH / 2) dx -= PHYSICS_CONFIG.WORLD_WIDTH;
              else if (dx < -PHYSICS_CONFIG.WORLD_WIDTH / 2) dx += PHYSICS_CONFIG.WORLD_WIDTH;
              if (dy > PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy -= PHYSICS_CONFIG.WORLD_HEIGHT;
              else if (dy < -PHYSICS_CONFIG.WORLD_HEIGHT / 2) dy += PHYSICS_CONFIG.WORLD_HEIGHT;
              if (Math.hypot(dx, dy) < PHYSICS_CONFIG.CONNECT_DIST) {
                isIsolated = false;
                break;
              }
            }
            if (isIsolated) {
              const pulse = 1.0 + Math.sin(timestamp * 0.008) * 0.2;
              ctx.strokeStyle = `rgba(245, 158, 11, ${0.4 + Math.sin(timestamp * 0.008) * 0.25})`; // Amber
              ctx.lineWidth = 1.5;
              ctx.setLineDash([4, 4]);
              ctx.beginPath();
              ctx.arc(n.x, n.y, n.r * 2.8 * pulse, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          });
        }

        // Objective Visual Signal Overlay: CONECTAR_ESPECIALES target ring & 100px boundary
        if (currentObjectiveRef.current?.type === 'CONECTAR_ESPECIALES' && currentObjectiveRef.current?.status === 'ACTIVE') {
          const targetNode = rawNodes.find(n => !n.isGhost && n.id === targetSpecialNodeIdRef.current) 
            || rawNodes.find(n => !n.isGhost && (n.specialType === 'explorador' || n.specialType === 'organizador'));
          if (targetNode) {
            targetSpecialNodeIdRef.current = targetNode.id;

            // 100px connection boundary guide ring
            const pulse = 1.0 + Math.sin(timestamp * 0.006) * 0.04;
            ctx.strokeStyle = `rgba(168, 85, 247, ${0.35 + Math.sin(timestamp * 0.006) * 0.15})`; // Purple
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(targetNode.x, targetNode.y, PHYSICS_CONFIG.CONNECT_DIST * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Target ring glow around node
            ctx.strokeStyle = `rgba(236, 72, 153, 0.85)`; // Magenta/Pink
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.arc(targetNode.x, targetNode.y, targetNode.r * 2.5, 0, Math.PI * 2);
            ctx.stroke();

            // Floating indicator star badge
            ctx.fillStyle = `rgba(251, 191, 36, 0.95)`;
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('★ ESPECIAL', targetNode.x, targetNode.y - targetNode.r * 3.2);
          }
        }

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
      <header className={`absolute top-0 inset-x-0 px-2 sm:px-6 py-2 sm:py-4 safe-pt flex justify-between items-center pointer-events-none z-10 transition-all duration-300 ${isHolding ? 'opacity-20' : 'opacity-100'}`}>
        
        {/* Score & Stats Card */}
        <div className="bg-slate-950/75 backdrop-blur-md border border-slate-800 rounded-xl px-2 py-1 sm:px-4 sm:py-3 pointer-events-auto flex gap-2 sm:gap-5 items-center shadow-lg">
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <TrendingUp size={10} className="text-emerald-400" /> {isMobileMode ? 'Pts' : 'Sincronía Actual'}
            </span>
            <span className="text-lg sm:text-3xl font-bold font-display tracking-tight text-white transition-all">
              {Math.round(score)}
            </span>
          </div>
          <div className="h-6 sm:h-8 w-[1px] bg-slate-800" />
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-xs font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1">
              <Award size={10} className="text-amber-400" /> {isMobileMode ? 'Máx' : 'Récord Máximo'}
            </span>
            <span className="text-base sm:text-2xl font-semibold font-display tracking-tight text-amber-200">
              {highScore}
            </span>
          </div>
          {gameMode === 'partida' && (
            <>
              <div className="h-6 sm:h-8 w-[1px] bg-slate-800" />
              <div className="flex flex-col">
                <span className="text-[9px] sm:text-xs font-mono uppercase tracking-widest text-cyan-400 flex items-center gap-1 font-bold">
                  <Clock size={10} className="text-cyan-400 animate-pulse" /> Tiempo
                </span>
                <span className={`text-base sm:text-2xl font-bold font-mono tracking-tight ${partidaTimeLeft > 0 && partidaTimeLeft < 30 ? 'text-rose-400 animate-pulse' : 'text-cyan-200'}`}>
                  {(PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1] || PARTIDA_CAMPAIGN_LEVELS[0]).sessionDuration > 0
                    ? `${Math.floor(partidaTimeLeft / 60)}:${(Math.floor(partidaTimeLeft) % 60).toString().padStart(2, '0')}`
                    : '∞'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Center: Ecosystem Phase & Compact Zone Banner Gauge (Desktop Only) */}
        {!isMobileMode && (
          <div className="hidden md:flex items-center gap-4 pointer-events-auto max-w-[50%] lg:max-w-[60%] shrink-0">
            {/* Ecosystem Phase Badge (Compact) / Partida Mode Badge */}
            {gameMode === 'partida' ? (
              <div className="flex flex-col px-3 py-1.5 rounded-xl border backdrop-blur-md bg-purple-950/60 border-purple-500/40 shrink-0">
                <span className="font-mono text-[8px] text-purple-300 uppercase tracking-widest">🏆 NIVEL {selectedLevel} DE 12</span>
                <span className="font-bold tracking-wide font-display text-xs text-purple-200">
                  {(PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1] || PARTIDA_CAMPAIGN_LEVELS[0]).title}
                </span>
              </div>
            ) : (
              <div className={`flex flex-col px-3 py-1.5 rounded-xl border backdrop-blur-md bg-slate-950/60 cursor-help group relative shrink-0 ${getEcosystemPhase(score).bgColor}`}>
                <div className="flex flex-col text-left">
                  <span className="font-mono text-[8px] text-slate-400 uppercase tracking-widest">🧬 Ecosistema</span>
                  <span className={`font-bold tracking-wide font-display text-xs ${getEcosystemPhase(score).color}`}>
                    {getEcosystemPhase(score).name}
                  </span>
                </div>
                {/* Elegant Tooltip describing Phase features on hover */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-slate-950/95 border border-slate-800 rounded-lg p-2.5 shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 z-50 text-left">
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
            )}

            {/* Compact Zone Banner Gauge */}
            <div className={`flex items-center gap-4 bg-slate-950/60 backdrop-blur-md border rounded-xl px-4 py-2.5 shadow-xl pointer-events-auto w-[320px] lg:w-[380px] shrink-0 transition-all ${zoneDetails.bgColor} ${zoneDetails.glow}`}>
              <div className="flex flex-col items-start shrink-0 text-left min-w-[100px] lg:min-w-[120px]">
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full bg-current ${activeZone === SystemZone.EQUILIBRIO ? 'animate-ping' : ''} ${zoneDetails.textColor}`} />
                  <h2 className={`font-display font-semibold tracking-wide text-[11px] lg:text-xs truncate ${zoneDetails.textColor}`}>
                    {zoneDetails.title}
                  </h2>
                </div>
                {/* Critical Timer alarm countdown or Grace Period */}
                {graceTimer > 0 ? (
                  <span className="text-[8px] font-mono uppercase tracking-widest text-sky-400 font-semibold animate-pulse mt-0.5">
                    INMUNE: {graceTimer.toFixed(0)}s
                  </span>
                ) : (
                  (metrics.health < 15 || metrics.health > 85) && (
                    <span className="text-[8px] font-mono uppercase tracking-widest text-red-500 font-semibold animate-pulse mt-0.5">
                      COLAPSO: {criticalSecondsLeft.toFixed(1)}s
                    </span>
                  )
                )}
              </div>

              {/* Slider / Gauge */}
              <div className="flex-1 relative flex flex-col justify-center">
                {/* Slider bar */}
                <div className="h-1 w-full bg-slate-900 rounded-full overflow-visible relative">
                  <div className={`absolute left-[35%] right-[35%] top-0 bottom-0 ${currentObjective?.type === 'MANTENER_SINCRONIA' ? 'bg-emerald-400/40 border-x border-emerald-400 animate-pulse' : 'bg-emerald-500/20 border-x border-emerald-500/30'}`} />
                  <div className="absolute left-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-l-full" />
                  <div className="absolute right-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-r-full" />
                  
                  {/* Thumb dot */}
                  <div 
                    className="absolute -top-1 w-2.5 h-2.5 rounded-full bg-white border border-slate-950 -ml-1.25 shadow-md transition-all duration-150 flex items-center justify-center"
                    style={{ left: `${metrics.health}%` }}
                  >
                    <div className={`w-1 h-1 rounded-full ${
                      metrics.health < 15 || metrics.health > 85 ? 'bg-red-500' : 'bg-emerald-400'
                    }`} />
                  </div>
                </div>
                
                {/* Compact labels */}
                <div className="flex justify-between text-[8px] font-mono uppercase tracking-wider mt-1">
                  <span className={metrics.health < 35 ? 'text-sky-400 font-bold' : 'text-slate-500/80'}>AISLAMIENTO</span>
                  <span className={metrics.health >= 35 && metrics.health <= 65 ? 'text-emerald-400 font-bold' : 'text-slate-500/80'}>EQUILIBRIO</span>
                  <span className={metrics.health > 65 ? 'text-rose-500 font-bold' : 'text-slate-500/80'}>CONGESTIÓN</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Sound and Info Action utilities */}
        <div className="flex gap-1 sm:gap-2 pointer-events-auto">
          {/* Performance / Mobile toggle button */}
          <button
            id="performance-toggle-btn"
            onClick={toggleMobileMode}
            className={`p-2 sm:p-3 rounded-xl border backdrop-blur-md transition-all flex items-center justify-center cursor-pointer ${
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
            className={`p-2 sm:p-3 rounded-xl border backdrop-blur-md transition-all flex items-center justify-center cursor-pointer ${
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
            className="p-2 sm:p-3 rounded-xl border bg-slate-950/65 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 backdrop-blur-md transition-all cursor-pointer"
            title="Cómo Jugar"
          >
            <HelpCircle size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </header>

      {/* CENTRALIZED DYNAMIC EQUILIBRIO ZONE HUD PANEL (Ultra-compact floating bar on Mobile) */}
      <div className={`absolute top-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:top-28 inset-x-0 flex flex-col items-center pointer-events-none z-10 px-2 sm:px-4 transition-all duration-300 ${isHolding ? 'opacity-20 scale-95' : 'opacity-100 scale-100'}`}>
        
        {/* Mobile Compact Zone Bar (Replaces huge vertical card on mobile) */}
        {isMobileMode && (
          <div className={`w-full max-w-xs sm:max-w-md bg-slate-950/85 backdrop-blur-md border rounded-xl px-2.5 py-1 flex items-center justify-between gap-2 shadow-lg pointer-events-auto text-[10px] ${zoneDetails.bgColor}`}>
            {/* Left: Zone Title */}
            <div className="flex items-center gap-1 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${activeZone === SystemZone.EQUILIBRIO ? 'animate-ping' : ''} ${zoneDetails.textColor}`} />
              <span className={`font-display font-semibold ${zoneDetails.textColor}`}>
                {zoneDetails.title}
              </span>
            </div>

            {/* Center: Slim Slider Gauge */}
            <div className="flex-1 h-1 bg-slate-900 rounded-full overflow-visible relative mx-1">
              <div className={`absolute left-[35%] right-[35%] top-0 bottom-0 ${currentObjective?.type === 'MANTENER_SINCRONIA' ? 'bg-emerald-400/40 border-x border-emerald-400 animate-pulse' : 'bg-emerald-500/20 border-x border-emerald-500/30'}`} />
              <div className="absolute left-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-l-full" />
              <div className="absolute right-0 w-[15%] top-0 bottom-0 bg-red-500/10 rounded-r-full" />
              <div 
                className="absolute -top-0.5 w-2 h-2 rounded-full bg-white border border-slate-950 -ml-1 shadow transition-all duration-150 flex items-center justify-center"
                style={{ left: `${metrics.health}%` }}
              >
                <div className={`w-0.5 h-0.5 rounded-full ${
                  metrics.health < 15 || metrics.health > 85 ? 'bg-red-500' : 'bg-emerald-400'
                }`} />
              </div>
            </div>

            {/* Right: Alarm / Immune status badge */}
            <div className="shrink-0 font-mono text-[9px]">
              {graceTimer > 0 ? (
                <span className="text-sky-400 font-bold animate-pulse">Inmune {graceTimer.toFixed(0)}s</span>
              ) : metrics.health < 15 || metrics.health > 85 ? (
                <span className="text-red-400 font-bold animate-pulse">Colapso {criticalSecondsLeft.toFixed(1)}s</span>
              ) : (
                <span className="text-slate-400">{metrics.health.toFixed(0)}%</span>
              )}
            </div>
          </div>
        )}

        {/* ACTIVE RANDOM ENVIRONMENTAL THREAT PANEL (Integrated in vertical HUD stack) */}
        {activeEvent.type !== 'NONE' && (
          <div className="mt-1 w-full max-w-xs sm:max-w-md bg-indigo-950/85 backdrop-blur-md border border-indigo-500/40 rounded-xl px-2.5 py-1 flex items-center justify-between gap-2 shadow-xl relative overflow-hidden pointer-events-none animate-pulse">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                <Compass size={12} className="animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-[8px] font-mono uppercase tracking-widest text-indigo-400 font-bold">EVENTO</span>
                <span className="text-[11px] font-bold text-indigo-100 truncate">{activeEvent.name}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold text-indigo-300 shrink-0">
              {activeEvent.durationLeft.toFixed(1)}s
            </span>
          </div>
        )}

        {/* OBJECTIVE HUD CARD */}
        {gameMode === 'partida' && partidaTransitionMessage && (
          <div className="mt-1 w-full max-w-xs sm:max-w-md bg-purple-950/90 backdrop-blur-md border border-amber-500/50 rounded-xl px-2.5 py-1 text-center shadow-xl animate-bounce pointer-events-auto">
            <span className="text-xs font-bold text-amber-300 font-display">
              {partidaTransitionMessage}
            </span>
          </div>
        )}
        
        {currentObjective && (
          <div className="mt-1 w-full max-w-xs sm:max-w-md bg-slate-950/85 backdrop-blur-md border border-purple-900/40 rounded-xl px-2.5 py-1.5 flex flex-col gap-0.5 shadow-xl pointer-events-auto transition-all animate-fade-in text-left">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-mono uppercase tracking-widest text-purple-400 font-bold flex items-center gap-1 shrink-0">
                  <Target size={10} className="text-purple-400 animate-pulse shrink-0" /> 
                  {gameMode === 'partida' 
                    ? (PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1]?.sequenceObjectives 
                        ? `OBJ ${partidaObjectiveIndex + 1}/${PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1].sequenceObjectives!.length}` 
                        : `PARTIDA ${selectedLevel}`)
                    : 'OBJ'
                  }
                </span>
                {gameMode === 'partida' && currentObjective.windowStart !== undefined && currentObjective.windowEnd !== undefined && (
                  <span className="text-[8px] font-mono px-1 py-0.1 rounded bg-purple-950 border border-purple-800 text-purple-300 font-bold shrink-0">
                    [{currentObjective.windowStart}-{currentObjective.windowEnd}s]
                  </span>
                )}
                <span className="text-xs font-bold text-white tracking-tight truncate">
                  {currentObjective.title}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-purple-300 shrink-0">
                {currentObjective.currentProgress.toFixed(1)}s / {currentObjective.durationToHold.toFixed(0)}s
              </span>
            </div>

            {/* Metric Tracker Line + Progress Bar */}
            <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-purple-300/90 font-semibold mt-0.5">
              <span className="truncate">
                {currentObjective.type === 'MANTENER_COMUNIDADES' && (
                  <>Enlaces activos: <b className={metrics.activeLinks >= currentObjective.targetValue ? 'text-emerald-400' : 'text-amber-400'}>{metrics.activeLinks}</b> (≥{currentObjective.targetValue})</>
                )}
                {currentObjective.type === 'EVITAR_AISLAMIENTO' && (
                  <>Aislamiento: <b className={metrics.isolation < 50 ? 'text-emerald-400' : 'text-amber-400'}>{metrics.isolation.toFixed(0)}%</b> (&lt;50%)</>
                )}
                {currentObjective.type === 'MANTENER_SINCRONIA' && (
                  <>Salud: <b className={metrics.health >= 35 && metrics.health <= 65 ? 'text-emerald-400' : 'text-amber-400'}>{metrics.health.toFixed(0)}%</b> (35-65%)</>
                )}
                {currentObjective.type === 'CONECTAR_ESPECIALES' && (
                  <>Nodo ★: <b className={checkObjectiveCondition('CONECTAR_ESPECIALES', metrics, nodesRef.current, targetSpecialNodeIdRef.current) ? 'text-emerald-400' : 'text-rose-400'}>
                    {checkObjectiveCondition('CONECTAR_ESPECIALES', metrics, nodesRef.current, targetSpecialNodeIdRef.current) ? 'CONECTADO (≤100px)' : 'DESCONECTADO'}
                  </b></>
                )}
              </span>
              
              {/* Progress Countdown Bar */}
              <div className="w-14 sm:w-20 h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shrink-0">
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

        {/* MARGEN FINAL (70s - 75s) HUD CARD */}
        {gameMode === 'partida' && partidaObjectiveIndex >= 3 && !isGameOver && (
          <div className="mt-1 w-full max-w-xs sm:max-w-md bg-slate-950/85 backdrop-blur-md border border-amber-500/40 rounded-xl px-2.5 py-1.5 flex items-center justify-between shadow-xl pointer-events-auto transition-all animate-fade-in text-left">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1">
                <Clock size={10} className="text-amber-400 animate-pulse" /> MARGEN FINAL [70-75s]
              </span>
              <span className="text-xs font-semibold text-slate-200 truncate">
                Consolidando red... ({completedObjectivesCountRef.current}/3 cumplidos)
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-amber-300 shrink-0">
              {partidaTimeLeft.toFixed(1)}s
            </span>
          </div>
        )}

        {/* FREE PLAY COMPLETION HUD CARD */}
        {gameMode === 'partida' && isFreePlay && (
          <div className="mt-1 w-full max-w-xs sm:max-w-md bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 rounded-xl px-3 py-2 flex items-center justify-between shadow-xl pointer-events-auto transition-all animate-fade-in text-left">
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 font-bold flex items-center gap-1">
                <Sparkles size={11} className="text-emerald-400 animate-spin" /> ¡NIVEL {selectedLevel} COMPLETADO!
              </span>
              <span className="text-[11px] font-semibold text-emerald-100 truncate">
                Modo Libre activo — Experimentá sin presión
              </span>
            </div>
            {selectedLevel < PARTIDA_CAMPAIGN_LEVELS.length ? (
              <button
                onClick={() => handleStartGame('partida', selectedLevel + 1)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span>Siguiente ({selectedLevel + 1})</span>
                <Play size={12} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={() => setIsGameOver(true)}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all shrink-0 cursor-pointer"
              >
                Ver Resumen
              </button>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM CONTROL ACTIONS / UTILITY FOOTER DOCK */}
      {(() => {
        const activeLvlCfg = PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1] || PARTIDA_CAMPAIGN_LEVELS[0];
        const activeAllowedActions = gameMode === 'endless' ? ['pulso', 'ancla', 'resonancia'] : (activeLvlCfg.allowedActions || ['pulso', 'ancla', 'resonancia']);
        const isAnclaUnlocked = activeAllowedActions.includes('ancla');
        const isResonanciaUnlocked = activeAllowedActions.includes('resonancia');

        return isMobileMode ? (
        /* MOBILE HUD: Ergonomic split controls for thumb play */
        <div className={`absolute bottom-0 inset-x-0 p-2.5 sm:p-4 safe-pb pointer-events-none z-10 flex justify-between items-end transition-all duration-300 ${isHolding ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
          
          {/* Bottom Left: Repel / Attract Pill */}
          <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-xl p-0.5 flex gap-0.5 shadow-lg">
            <button
              id="mode-repel-btn-mob"
              onClick={() => setInteractionMode('repel')}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all flex items-center justify-center gap-1 ${
                interactionMode === 'repel'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/25 shadow-sm'
                  : 'text-slate-400'
              }`}
              title="Modo Repeler"
            >
              <Zap size={13} />
              <span>Repeler</span>
            </button>
            <button
              id="mode-attract-btn-mob"
              onClick={() => {
                if (isAnclaUnlocked) setInteractionMode('attract');
                else triggerResonance();
              }}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                !isAnclaUnlocked
                  ? 'text-slate-600 bg-slate-900/50 cursor-not-allowed'
                  : interactionMode === 'attract'
                    ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25 shadow-sm cursor-pointer'
                    : 'text-slate-400 cursor-pointer'
              }`}
              title={isAnclaUnlocked ? "Modo Atraer" : "Bloqueado en este nivel"}
            >
              {!isAnclaUnlocked ? <Lock size={12} className="text-slate-600" /> : <Anchor size={13} />}
              <span>Atraer</span>
            </button>
          </div>

          {/* Bottom Right: Resonance circular FAB + Pulse Status */}
          <div className="pointer-events-auto flex flex-col items-center gap-1">
            {/* Pulse Cooldown Badge */}
            <div className="bg-slate-950/85 backdrop-blur-sm border border-slate-800 rounded-lg px-1.5 py-0.5 text-[8px] font-mono text-slate-400 shadow-md">
              PULSO: {pulseCooldown > 0 ? `${pulseCooldown.toFixed(1)}s` : 'Listo'}
            </div>
            
            {/* Resonance FAB Button */}
            <button
              id="resonance-active-btn-mob"
              onClick={triggerResonance}
              disabled={resonanceCooldown > 0 || resonanceDurationLeft > 0}
              className={`w-12 h-12 rounded-full border flex flex-col items-center justify-center cursor-pointer transition-all shadow-2xl relative ${
                resonanceDurationLeft > 0
                  ? 'bg-purple-500/25 text-purple-200 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] animate-pulse'
                  : resonanceCooldown > 0
                    ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-purple-950/70 border-purple-800/80 text-purple-300 hover:text-white hover:border-purple-600 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
              }`}
              title="Resonancia: Duplica fuerzas temporalmente"
            >
              <Radio size={16} className={resonanceDurationLeft > 0 ? 'animate-pulse' : ''} />
              {resonanceDurationLeft > 0 ? (
                <span className="text-[8px] font-mono font-bold mt-0.5 text-purple-200">
                  {resonanceDurationLeft.toFixed(0)}s
                </span>
              ) : resonanceCooldown > 0 ? (
                <span className="text-[8px] font-mono font-bold mt-0.5 text-slate-500">
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
          <div className="absolute bottom-0.5 px-4 inset-x-0 flex justify-center pointer-events-none pb-safe">
            <p className="text-[8px] text-slate-500/50 font-mono uppercase tracking-widest text-center">
              Toca para Pulso · Mantén para Gravedad
            </p>
          </div>
        </div>
      ) : (
        /* DESKTOP HUD: Sleek full-width unified dashboard */
        <footer className={`absolute bottom-0 inset-x-0 bg-slate-950/85 backdrop-blur-xl border-t border-slate-800/90 py-3.5 px-6 shadow-2xl pointer-events-auto z-10 transition-all duration-300 ${isHolding ? 'opacity-20' : 'opacity-100'} hidden md:flex items-center justify-between`}>
          
          {/* Left Side: Consolidated Network Parameters (Parámetros de Red) */}
          <div className="flex flex-col min-w-[280px] text-left">
            <span className="text-[9px] uppercase tracking-wider text-sky-400 font-bold font-mono flex items-center gap-1.5 mb-1.5">
              <Activity size={11} className="animate-pulse" /> Parámetros de Red
            </span>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] font-mono text-slate-400">
              <div className="flex justify-between gap-1.5">
                <span className="text-slate-500">Nodos:</span>
                <span className="text-slate-300 font-semibold">{nodesRef.current.length}/120</span>
              </div>
              <div className="flex justify-between gap-1.5">
                <span className="text-slate-500">Clusters:</span>
                <span className="text-emerald-400 font-semibold">{metrics.clusterCount}</span>
              </div>
              <div className="flex justify-between gap-1.5">
                <span className="text-slate-500">Homog.:</span>
                <span className="text-slate-300 font-semibold">{metrics.clusterQuality.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between gap-1.5">
                <span className="text-slate-500">Congestión:</span>
                <span className="text-slate-300 font-semibold">{metrics.crowding.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between gap-1.5">
                <span className="text-slate-500">Aislam.:</span>
                <span className="text-slate-300 font-semibold">{metrics.isolation.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between gap-1.5">
                <span className="text-slate-500">Conect.:</span>
                <span className={`font-semibold ${metrics.connectivity < 20 ? 'text-yellow-400' : 'text-slate-300'}`}>
                  {metrics.connectivity.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Center Side: Interaction controls */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 max-w-md">
            <div className="flex items-center gap-3">
              {/* Interaction mode toggle */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
                <button
                  id="mode-repel-btn"
                  onClick={() => setInteractionMode('repel')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                    interactionMode === 'repel' 
                      ? 'bg-red-500/15 text-red-400 border border-red-500/20 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap size={13} />
                  <span>Pulso: Repeler</span>
                </button>
                <button
                  id="mode-attract-btn"
                  onClick={() => {
                    if (isAnclaUnlocked) setInteractionMode('attract');
                    else triggerResonance();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                    !isAnclaUnlocked
                      ? 'text-slate-600 bg-slate-950/40 cursor-not-allowed'
                      : interactionMode === 'attract' 
                        ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20 shadow-sm cursor-pointer' 
                        : 'text-slate-400 hover:text-slate-200 cursor-pointer'
                  }`}
                  title={isAnclaUnlocked ? "Modo Atraer" : "Bloqueado en este nivel"}
                >
                  {!isAnclaUnlocked ? <Lock size={13} className="text-slate-600" /> : <Anchor size={13} />}
                  <span>Pulso: Atraer {!isAnclaUnlocked && '(Nivel 2)'}</span>
                </button>
              </div>

              <div className="h-6 w-[1px] bg-slate-800" />

              {/* Pulse status indicator */}
              <div className="flex flex-col items-center min-w-[70px]">
                <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
                  PULSO
                </span>
                <div className="text-xs font-mono font-medium text-slate-300">
                  {pulseCooldown > 0 ? `${pulseCooldown.toFixed(1)}s` : 'LISTO'}
                </div>
              </div>

              <div className="h-6 w-[1px] bg-slate-800" />

              {/* Resonance active button */}
              <button
                id="resonance-active-btn"
                onClick={triggerResonance}
                disabled={!isResonanciaUnlocked || resonanceCooldown > 0 || resonanceDurationLeft > 0}
                className={`px-4 py-1.5 rounded-xl border flex items-center gap-2 transition-all justify-center shrink-0 ${
                  !isResonanciaUnlocked
                    ? 'bg-slate-950 border-slate-900 text-slate-600 cursor-not-allowed'
                    : resonanceDurationLeft > 0 
                      ? 'bg-purple-500/20 text-purple-200 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] animate-pulse cursor-pointer'
                      : resonanceCooldown > 0
                        ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-purple-950/50 border-purple-800/60 text-purple-300 hover:text-white hover:border-purple-600 shadow-md cursor-pointer'
                }`}
                title={isResonanciaUnlocked ? "Resonancia: Duplica las fuerzas temporalmente (Espacio)" : "Bloqueado en este nivel"}
              >
                {!isResonanciaUnlocked ? <Lock size={13} className="text-slate-600" /> : <Radio size={13} className={resonanceDurationLeft > 0 ? 'animate-pulse' : ''} />}
                <span className="text-xs font-semibold tracking-wide uppercase">
                  {!isResonanciaUnlocked
                    ? 'RESONAR (Nivel 3)'
                    : resonanceDurationLeft > 0 
                      ? `RESONANDO (${resonanceDurationLeft.toFixed(1)}s)` 
                      : resonanceCooldown > 0 
                        ? `RESONAR (${resonanceCooldown.toFixed(1)}s)`
                        : 'RESONAR [Espacio]'}
                </span>
              </button>
            </div>

            {/* Integrated help/interaction text inside container */}
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest text-center">
              Click para Pulso | Mantener presionado para Anclar Gravedad
            </p>
          </div>

          {/* Right Side: Additional branding / game status context */}
          <div className="flex flex-col items-end min-w-[200px] text-right">
            <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
              SISTEMA DE EQUILIBRIO DE CONSTELACIONES
            </span>
            <span className="text-[10px] font-sans font-medium text-slate-400 flex items-center gap-1.5 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado con Nodo Central
            </span>
          </div>
        </footer>
      );
      })()}

      {/* START INSTRUCTIONS / TUTORIAL POPUP OVERLAY */}
      <AnimatePresence>
        {showTutorial && (
          <TutorialModal
            isPlaying={isPlaying}
            isMobileMode={isMobileMode}
            selectedMode={gameMode}
            unlockedLevel={unlockedLevel}
            selectedLevel={selectedLevel}
            onSelectLevel={(lvl) => {
              setSelectedLevel(lvl);
              selectedLevelRef.current = lvl;
            }}
            onSelectMode={(mode) => setGameMode(mode)}
            onClose={() => setShowTutorial(false)}
            onPlay={() => {
              setShowTutorial(false);
              handleStartGame(gameMode, selectedLevel);
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
            gameMode={gameMode}
            selectedLevel={selectedLevel}
            unlockedLevel={unlockedLevel}
            partidaResult={partidaResult}
            onRestart={(m) => handleStartGame(m || gameMode, selectedLevel)}
            onSwitchMode={(newMode) => handleStartGame(newMode, selectedLevel)}
            onNextLevel={() => {
              const next = selectedLevel + 1;
              setSelectedLevel(next);
              selectedLevelRef.current = next;
              handleStartGame('partida', next);
            }}
            onContinueFreePlay={() => {
              setIsGameOver(false);
              setGameMode('endless');
              gameModeRef.current = 'endless';
              setGraceTimer(999999);
              graceTimerRef.current = 999999;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
