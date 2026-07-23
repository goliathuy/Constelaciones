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
