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
  objective: ObjectivePresetStep;
  sequenceObjectives?: ObjectivePresetStep[]; // For Level 6 full challenge
}

export const PARTIDA_CAMPAIGN_LEVELS: PartidaLevel[] = [
  {
    levelNumber: 1,
    title: 'Conectar',
    subtitle: 'Nivel 1 de 6',
    description: 'Acercá los nodos para que la atracción venza la distancia y formen enlaces.',
    conceptBadge: 'CONEXIÓN BÁSICA',
    nodeCount: 6,
    spawnRadius: 180,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 45, // 45s time limit challenge
    objective: {
      id: 'lvl_1_obj',
      title: 'CONECTÁ LOS NODOS',
      description: 'Mantené al menos 3 enlaces activos durante 3s',
      type: 'MANTENER_COMUNIDADES',
      targetValue: 3, // At least 3 links
      durationToHold: 3, // 3s hold
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 2,
    title: 'No dejes a nadie solo',
    subtitle: 'Nivel 2 de 6',
    description: 'Los nodos aislados debilitan la red. Atraé a los nodos periféricos.',
    conceptBadge: 'EVITAR AISLAMIENTO',
    nodeCount: 8,
    spawnRadius: 220,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 50, // 50s time limit challenge
    objective: {
      id: 'lvl_2_obj',
      title: 'EVITÁ EL AISLAMIENTO',
      description: 'Mantené el aislamiento por debajo del 50% durante 4s',
      type: 'EVITAR_AISLAMIENTO',
      targetValue: 50, // isolation < 50
      durationToHold: 4, // 4s hold
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 3,
    title: 'Encontrar el equilibrio',
    subtitle: 'Nivel 3 de 6',
    description: 'Ni muy dispersos, ni muy apretados. El centro de la barra verde es la zona dulce.',
    conceptBadge: 'EQUILIBRIO Y SALUD',
    nodeCount: 10,
    spawnRadius: 250,
    hasSpecialNode: false,
    hasEvents: false,
    sessionDuration: 55, // 55s time limit challenge
    objective: {
      id: 'lvl_3_obj',
      title: 'EQUILIBRIO PERFECTO',
      description: 'Mantené la salud en zona neutra (35%-65%) durante 5s',
      type: 'MANTENER_SINCRONIA',
      targetValue: 35, // 35 <= health <= 65
      durationToHold: 5, // 5s hold
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 4,
    title: 'El Nodo Especial',
    subtitle: 'Nivel 4 de 6',
    description: 'Los nodos ★ Explorador y Organizador tienen comportamientos únicos. Conéctalos a la red.',
    conceptBadge: 'NODOS ESPECIALES',
    nodeCount: 10,
    spawnRadius: 280,
    hasSpecialNode: true,
    specialNodeType: 'explorador',
    hasEvents: false,
    sessionDuration: 60, // 60s time limit challenge
    objective: {
      id: 'lvl_4_obj',
      title: 'CONECTÁ EL ESPECIAL',
      description: 'Mantené el nodo ★ explorador conectado a la red durante 5s',
      type: 'CONECTAR_ESPECIALES',
      targetValue: 1, // at least 1 link
      durationToHold: 5, // 5s hold
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 5,
    title: 'La Red Viva',
    subtitle: 'Nivel 5 de 6',
    description: 'La red está sujeta a eventos naturales como ráfagas y euforia. Adaptate.',
    conceptBadge: 'EVENTOS Y TORMENTA',
    nodeCount: 12,
    spawnRadius: 320,
    hasSpecialNode: true,
    specialNodeType: 'organizador',
    hasEvents: true,
    sessionDuration: 65, // 65s time limit challenge
    objective: {
      id: 'lvl_5_obj',
      title: 'RESISTENCIA EN TORMENTA',
      description: 'Mantené el equilibrio durante 7s mientras sopla la corriente',
      type: 'MANTENER_SINCRONIA',
      targetValue: 35,
      durationToHold: 7, // 7s hold
      windowStart: 0,
      windowEnd: 999
    }
  },
  {
    levelNumber: 6,
    title: 'El Gran Desafío',
    subtitle: 'Nivel 6 de 6 — Desafío Final',
    description: 'Demostrá tu dominio total: 75 segundos, 3 objetivos secuenciales bajo presión temporal.',
    conceptBadge: 'DESAFÍO COMPLETO',
    nodeCount: 16,
    spawnRadius: 360,
    hasSpecialNode: true,
    hasEvents: true,
    sessionDuration: 75,
    objective: {
      id: 'lvl_6_obj_1',
      title: 'CONECTA LA RED',
      description: 'Evitá que la red se disperse',
      type: 'EVITAR_AISLAMIENTO',
      targetValue: 50,
      durationToHold: 10,
      windowStart: 0,
      windowEnd: 20
    },
    sequenceObjectives: [
      {
        id: 'lvl_6_obj_1',
        title: 'CONECTA LA RED',
        description: 'Evitá que la red se disperse',
        type: 'EVITAR_AISLAMIENTO',
        targetValue: 50,
        durationToHold: 10,
        windowStart: 0,
        windowEnd: 20
      },
      {
        id: 'lvl_6_obj_2',
        title: 'MANTENÉ EL EQUILIBRIO',
        description: 'Mantené la red en zona saludable',
        type: 'MANTENER_SINCRONIA',
        targetValue: 35,
        durationToHold: 15,
        windowStart: 20,
        windowEnd: 45
      },
      {
        id: 'lvl_6_obj_3',
        title: 'CONECTÁ AL ESPECIAL',
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
