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
  specialType?: 'normal' | 'influencer' | 'disruptor' | 'organizador';
  isolatedTimer?: number; // Tracks duration of continuous isolation for influencers
}

export interface DynamicObjective {
  id: string;
  title: string;
  description: string;
  type: 'MANTENER_COMUNIDADES' | 'MANTENER_SINCRONIA' | 'EVITAR_CONGESTION' | 'EVITAR_AISLAMIENTO' | 'CONECTAR_ESPECIALES';
  targetValue: number;
  currentProgress: number; // seconds completed under target
  durationToHold: number;  // total seconds required to complete
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
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
  CONNECT_DIST: 140, // Render line distance
  ATTRACT_DIST_MIN: 70, // Social gravity start
  ATTRACT_DIST_MAX: 120, // Social gravity end
  REPULSION_DIST: 22, // Anti-collision distance
  SPAWN_INTERVAL: 6.0, // Seconds between node spawns
};
