/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GameNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  energy: number; // For visual intensity/glow (0 to 1)
  groupId: number | null;
  lifetime: number; // Timestamp of creation (for FIFO limit tracking)
  isGhost: boolean; // True during fade-out state
  ghostProgress?: number; // 1.0 down to 0.0 during fade-out
  colorIndex: number; // For aesthetic grouping or diversity
  specialType?: 'normal' | 'influencer' | 'disruptor' | 'organizador' | 'explorador' | 'semilla';
  isolatedTimer?: number; // Tracks duration of continuous isolation for influencers
  connectedTimer?: number; // Tracks continuous connection duration for explorers
  seedTimer?: number; // Tracks sprouting progress for community seeds
}

export type GameMode = 'endless' | 'partida';

export interface ObjectivePresetStep {
  id: string;
  title: string;
  description: string;
  type: 'MANTENER_COMUNIDADES' | 'MANTENER_SINCRONIA' | 'EVITAR_CONGESTION' | 'EVITAR_AISLAMIENTO' | 'CONECTAR_ESPECIALES';
  targetValue: number;
  durationToHold: number;
  windowStart: number;
  windowEnd: number;
}

export interface PartidaLevel {
  levelNumber: number;
  title: string;
  subtitle: string;
  description: string;
  conceptBadge: string;
  nodeCount: number;
  spawnRadius: number; // Max distance between nodes at start
  hasSpecialNode: boolean;
  specialNodeType?: 'explorador' | 'organizador';
  hasEvents: boolean;
  sessionDuration: number; // Total level duration (0 = unlimited until completed)
  allowedActions?: ('pulso' | 'ancla' | 'resonancia')[]; // Progressive action gating per level
  objective: ObjectivePresetStep;
  sequenceObjectives?: ObjectivePresetStep[]; // For Level 12 full challenge
}

export const PARTIDA_CAMPAIGN_LEVELS: PartidaLevel[] = [
  // ACT I — DISCOVER (Niveles 1-4)
  {
    levelNumber: 1,
    title: 'Conexión Inicial',
    subtitle: 'Nivel 1 de 12 — Acto I',
    description: 'Descubrí el Pulso: usalo para acercar los nodos y formar tus primeros enlaces.',
    conceptBadge: 'ACTO I · EL PULSO',
    nodeCount: 6,
    spawnRadius: 140,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 45,
    allowedActions: ['pulso'],
    objective: {
      id: 'lvl_1_obj',
      title: 'CONECTÁ LOS NODOS',
      description: 'Acercá los nodos y mantené al menos 3 nodos unidos durante 3s',
      type: 'MANTENER_COMUNIDADES',
      targetValue: 2, // 2 active links or 3 connected nodes
      durationToHold: 3,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 2,
    title: 'Anclaje y Estabilidad',
    subtitle: 'Nivel 2 de 12 — Acto I',
    description: 'Aprendé a usar el Ancla para estabilizar un nodo y evitar que la red se desarme.',
    conceptBadge: 'ACTO I · EL ANCLA',
    nodeCount: 8,
    spawnRadius: 180,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 50,
    allowedActions: ['pulso', 'ancla'],
    objective: {
      id: 'lvl_2_obj',
      title: 'MANTENÉ LA RED UNIDA',
      description: 'Mantené la red conectada durante 4s usando Ancla',
      type: 'MANTENER_COMUNIDADES',
      targetValue: 3,
      durationToHold: 4,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 3,
    title: 'Resonancia de Red',
    subtitle: 'Nivel 3 de 12 — Acto I',
    description: 'Desbloqueá la Resonancia para amplificar tus fuerzas y reorganizar la red rápidamente.',
    conceptBadge: 'ACTO I · RESONANCIA',
    nodeCount: 10,
    spawnRadius: 220,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 55,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_3_obj',
      title: 'ENCONTRÁ LA SALUD',
      description: 'Mantené la salud de la red en zona verde (35%-65%) durante 5s',
      type: 'MANTENER_SINCRONIA',
      targetValue: 35,
      durationToHold: 5,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 4,
    title: 'Control de Aislamiento',
    subtitle: 'Nivel 4 de 12 — Acto I',
    description: 'Los nodos solitarios sufren aislamiento. Atraelos antes de que debiliten el sistema.',
    conceptBadge: 'ACTO I · AISLAMIENTO',
    nodeCount: 10,
    spawnRadius: 250,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 60,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_4_obj',
      title: 'RESCATÁ LOS NODOS',
      description: 'Mantené el aislamiento por debajo del 40% durante 4s',
      type: 'EVITAR_AISLAMIENTO',
      targetValue: 40,
      durationToHold: 4,
      windowStart: 0,
      windowEnd: 999
    }
  },

  // ACT II — UNDERSTAND (Niveles 5-8)
  {
    levelNumber: 5,
    title: 'El Nodo Explorador★',
    subtitle: 'Nivel 5 de 12 — Acto II',
    description: 'Aparece un nodo ★ Explorador. Es inquieto y busca expandirse: mantenelo conectado.',
    conceptBadge: 'ACTO II · EXPLORADOR★',
    nodeCount: 11,
    spawnRadius: 260,
    hasSpecialNode: true,
    specialNodeType: 'explorador',
    hasEvents: false,
    sessionDuration: 60,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_5_obj',
      title: 'CONECTÁ AL EXPLORADOR★',
      description: 'Mantené al nodo ★ explorador conectado a la red durante 5s',
      type: 'CONECTAR_ESPECIALES',
      targetValue: 1,
      durationToHold: 5,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 6,
    title: 'El Centro Organizador★',
    subtitle: 'Nivel 6 de 12 — Acto II',
    description: 'El nodo ★ Organizador genera cohesión local. Usalo como núcleo de la constelación.',
    conceptBadge: 'ACTO II · ORGANIZADOR★',
    nodeCount: 12,
    spawnRadius: 280,
    hasSpecialNode: true,
    specialNodeType: 'organizador',
    hasEvents: false,
    sessionDuration: 60,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_6_obj',
      title: 'ORGANIZÁ LA COMUNIDAD★',
      description: 'Mantené al nodo ★ organizador conectado durante 5s',
      type: 'CONECTAR_ESPECIALES',
      targetValue: 1,
      durationToHold: 5,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 7,
    title: 'Equilibrio Dinámico',
    subtitle: 'Nivel 7 de 12 — Acto II',
    description: 'Evitá tanto la dispersión como el hacinamiento. La clave está en el centro.',
    conceptBadge: 'ACTO II · EQUILIBRIO',
    nodeCount: 12,
    spawnRadius: 300,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 65,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_7_obj',
      title: 'MANTENÉ EL EQUILIBRIO',
      description: 'Mantené la salud de la red en zona verde (35%-65%) durante 6s',
      type: 'MANTENER_SINCRONIA',
      targetValue: 35,
      durationToHold: 6,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 8,
    title: 'Constelación Dual★',
    subtitle: 'Nivel 8 de 12 — Acto II',
    description: 'Goberná una red más amplia integrando nodos especiales y normales en armonía.',
    conceptBadge: 'ACTO II · DUALIDAD',
    nodeCount: 14,
    spawnRadius: 320,
    hasSpecialNode: true,
    specialNodeType: 'explorador',
    hasEvents: false,
    sessionDuration: 65,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_8_obj',
      title: 'INTEGRÁ EL SISTEMA★',
      description: 'Mantené al nodo ★ especial conectado durante 6s',
      type: 'CONECTAR_ESPECIALES',
      targetValue: 1,
      durationToHold: 6,
      windowStart: 0,
      windowEnd: 999
    }
  },

  // ACT III — MASTER (Niveles 9-12)
  {
    levelNumber: 9,
    title: 'Tormenta de Eventos',
    subtitle: 'Nivel 9 de 12 — Acto III',
    description: 'Soplan ráfagas ambientales sobre el cosmos. Mantené la estructura en movimiento.',
    conceptBadge: 'ACTO III · EVENTOS',
    nodeCount: 14,
    spawnRadius: 330,
    hasSpecialNode: true,
    specialNodeType: 'organizador',
    hasEvents: true,
    sessionDuration: 70,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_9_obj',
      title: 'RESISTÍ LA TORMENTA',
      description: 'Mantené la salud en zona verde durante 6s en plena turbulencia',
      type: 'MANTENER_SINCRONIA',
      targetValue: 35,
      durationToHold: 6,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 10,
    title: 'Umbral de Colapso',
    subtitle: 'Nivel 10 de 12 — Acto III',
    description: 'La inestabilidad puede activar el temporizador de colapso. Salvá la red a tiempo.',
    conceptBadge: 'ACTO III · AMENAZA COLAPSO',
    nodeCount: 15,
    spawnRadius: 340,
    hasSpecialNode: false,
    hasEvents: true,
    sessionDuration: 70,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_10_obj',
      title: 'EVITÁ EL COLAPSO',
      description: 'Mantené el aislamiento por debajo del 45% durante 7s',
      type: 'EVITAR_AISLAMIENTO',
      targetValue: 45,
      durationToHold: 7,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 11,
    title: 'Ecosistema Reactivo',
    subtitle: 'Nivel 11 de 12 — Acto III',
    description: 'Combinación de nodos especiales y perturbaciones externas. Usá todo lo aprendido.',
    conceptBadge: 'ACTO III · ECOSISTEMA VIVO',
    nodeCount: 16,
    spawnRadius: 350,
    hasSpecialNode: true,
    specialNodeType: 'explorador',
    hasEvents: true,
    sessionDuration: 70,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_11_obj',
      title: 'PROTEGÉ AL ESPECIAL★',
      description: 'Mantené el nodo ★ especial unido durante 7s bajo tormenta',
      type: 'CONECTAR_ESPECIALES',
      targetValue: 1,
      durationToHold: 7,
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 12,
    title: 'Constelación Maestra',
    subtitle: 'Nivel 12 de 12 — Desafío Final',
    description: 'El clímax del aprendizaje: 75 segundos, 3 objetivos secuenciales bajo máxima presión.',
    conceptBadge: 'ACTO III · MAESTRÍA TOTAL',
    nodeCount: 18,
    spawnRadius: 360,
    hasSpecialNode: true,
    hasEvents: true,
    sessionDuration: 75,
    allowedActions: ['pulso', 'ancla', 'resonancia'],
    objective: {
      id: 'lvl_12_obj_1',
      title: '1. CONECTA LA RED',
      description: 'Evitá que la red se disperse',
      type: 'EVITAR_AISLAMIENTO',
      targetValue: 50,
      durationToHold: 10,
      windowStart: 0,
      windowEnd: 20
    },
    sequenceObjectives: [
      {
        id: 'lvl_12_obj_1',
        title: '1. CONECTÁ LA RED',
        description: 'Evitá que la red se disperse',
        type: 'EVITAR_AISLAMIENTO',
        targetValue: 50,
        durationToHold: 10,
        windowStart: 0,
        windowEnd: 20
      },
      {
        id: 'lvl_12_obj_2',
        title: '2. EQUILIBRIO DE SALUD',
        description: 'Mantené la red en zona verde',
        type: 'MANTENER_SINCRONIA',
        targetValue: 35,
        durationToHold: 15,
        windowStart: 20,
        windowEnd: 45
      },
      {
        id: 'lvl_12_obj_3',
        title: '3. PROTEGÉ AL ESPECIAL★',
        description: 'Mantené el nodo ★ unido a la red',
        type: 'CONECTAR_ESPECIALES',
        targetValue: 1,
        durationToHold: 10,
        windowStart: 45,
        windowEnd: 70
      }
    ]
  }
];

export interface GamePreset {
  id: string;
  name: string;
  description: string;
  sessionDuration: number;
  fixedPhase: number;
  objectivesSequence: ObjectivePresetStep[];
}

export interface PartidaResult {
  status: 'VICTORY' | 'PARTIAL' | 'GAME_OVER';
  objectivesCompletedCount: number;
  totalObjectives: number;
  timeRemainingBonus: number;
  score: number;
  timeElapsed: number;
}

export const PRESET_ESTANDAR: GamePreset = {
  id: 'estandar',
  name: 'Estándar',
  description: '75s de sintonía con 3 objetivos secuenciales en Fase 2.',
  sessionDuration: 75,
  fixedPhase: 2,
  objectivesSequence: [
    {
      id: 'obj_1',
      title: 'CONECTA LA RED',
      description: 'Evitá que la red se disperse',
      type: 'EVITAR_AISLAMIENTO',
      targetValue: 50, // isolation < 50
      durationToHold: 10, // 10s continuous
      windowStart: 0,
      windowEnd: 20
    },
    {
      id: 'obj_2',
      title: 'MANTENÉ EL EQUILIBRIO',
      description: 'Evitá que la red se disperse o se sature',
      type: 'MANTENER_SINCRONIA',
      targetValue: 35, // 35 <= health <= 65
      durationToHold: 15, // 15s continuous
      windowStart: 20,
      windowEnd: 45
    },
    {
      id: 'obj_3',
      title: 'CONECTÁ AL ESPECIAL',
      description: 'Mantené el nodo ★ unido a la red',
      type: 'CONECTAR_ESPECIALES',
      targetValue: 1, // at least 1 active connection within 100px
      durationToHold: 10, // 10s continuous
      windowStart: 45,
      windowEnd: 70
    }
  ]
};

export interface DynamicObjective {
  id: string;
  title: string;
  description: string;
  type: 'MANTENER_COMUNIDADES' | 'MANTENER_SINCRONIA' | 'EVITAR_CONGESTION' | 'EVITAR_AISLAMIENTO' | 'CONECTAR_ESPECIALES';
  targetValue: number;
  currentProgress: number; // seconds completed under target
  durationToHold: number;  // total seconds required to complete
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  targetSpecialNodeId?: string;
  windowStart?: number;
  windowEnd?: number;
}

export type EventType = 'NONE' | 'EUFORIA' | 'FRAGMENTACION' | 'CORRIENTE';

export interface GameEvent {
  type: EventType;
  name: string;
  description: string;
  durationLeft: number; // seconds remaining
  totalDuration: number;
  windAngle?: number; // for CORRIENTE (radians)
}

export interface GameMetrics {
  crowding: number; // 0 - 100
  isolation: number; // 0 - 100
  health: number; // 0 - 100 (Aislamiento 0 -> Equilibrio 50 -> Saturación 100)
  clusterQuality: number; // 0 - 100
  connectivity: number; // 0 - 100
  clusterCount: number;
  activeLinks: number; // Total number of active connection edges
}

export enum SystemZone {
  AISLAMIENTO = 'AISLAMIENTO', // Critical [0-15]
  DISPERSION = 'DISPERSION',   // Unstable [15-35]
  EQUILIBRIO = 'EQUILIBRIO',   // Healthy [35-65]
  CONGESTION = 'CONGESTION',   // Unstable [65-85]
  SATURACION = 'SATURACION',   // Critical [85-100]
}

// Physical configuration constants
export const PHYSICS_CONFIG = {
  INITIAL_NODES: 50,
  MAX_NODES: 120,
  CONNECT_DIST: 100, // Reduced from 140
  ATTRACT_DIST_MIN: 50, // Reduced from 70
  ATTRACT_DIST_MAX: 90, // Reduced from 120
  REPULSION_DIST: 18, // Reduced from 22
  SPAWN_INTERVAL: 6.0, // Seconds between node spawns
  WORLD_WIDTH: 2400, // Virtual map width
  WORLD_HEIGHT: 2400, // Virtual map height
};
