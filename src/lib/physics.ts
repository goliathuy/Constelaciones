/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameNode, GameMetrics, PHYSICS_CONFIG, EventType, GameEvent } from '../types';

// Generates a random node entering from the screen borders
export function generateIncomingNode(width: number, height: number): GameNode {
  const id = Math.random().toString(36).substring(2, 9);
  
  // Choose a random border: 0 = Top, 1 = Right, 2 = Bottom, 3 = Left
  const border = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  
  const speed = 0.5 + Math.random() * 1.0;
  const padding = 10;

  switch (border) {
    case 0: // Top
      x = padding + Math.random() * (width - padding * 2);
      y = -10;
      vx = (Math.random() - 0.5) * speed;
      vy = Math.random() * speed + 0.5;
      break;
    case 1: // Right
      x = width + 10;
      y = padding + Math.random() * (height - padding * 2);
      vx = -(Math.random() * speed + 0.5);
      vy = (Math.random() - 0.5) * speed;
      break;
    case 2: // Bottom
      x = padding + Math.random() * (width - padding * 2);
      y = height + 10;
      vx = (Math.random() - 0.5) * speed;
      vy = -(Math.random() * speed + 0.5);
      break;
    case 3: // Left
    default:
      x = -10;
      y = padding + Math.random() * (height - padding * 2);
      vx = Math.random() * speed + 0.5;
      vy = (Math.random() - 0.5) * speed;
      break;
  }

  return {
    id,
    x,
    y,
    vx,
    vy,
    r: 4 + Math.random() * 4, // radii between 4px and 8px
    energy: 0.1, // starts cool, gets energized when interacting
    groupId: null,
    lifetime: Date.now(),
    isGhost: false,
    colorIndex: Math.floor(Math.random() * 5),
  };
}

// Generate the initial batch of nodes inside the bounds
export function generateInitialNodes(count: number, width: number, height: number): GameNode[] {
  const nodes: GameNode[] = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: Math.random().toString(36).substring(2, 9),
      x: 50 + Math.random() * (width - 100),
      y: 50 + Math.random() * (height - 100),
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      r: 4 + Math.random() * 4,
      energy: 0.2,
      groupId: null,
      lifetime: Date.now() - Math.random() * 50000, // staggered initial lifetimes
      isGhost: false,
      colorIndex: Math.floor(Math.random() * 5),
    });
  }
  return nodes;
}

// Runs the physics simulation for one frame (60fps assumed, delta independent where appropriate)
export function updatePhysics(
  nodes: GameNode[],
  width: number,
  height: number,
  activeEvent: GameEvent,
  resonanceActive: boolean,
  userAnchor: { x: number; y: number } | null,
  userPulse: { x: number; y: number; time: number; type: 'attract' | 'repel' } | null
): GameNode[] {
  const now = Date.now();
  
  // Dynamic parameters based on Event and Resonance
  // Base social gravity attraction force: GDD details "Distancia Atracción: 70 - 120 px"
  let baseAttraction = 0.008; 
  if (activeEvent.type === 'EUFORIA') {
    baseAttraction *= 1.5; // GDD: Multiplicador 1.5x a la atracción base
  } else if (activeEvent.type === 'FRAGMENTACION') {
    baseAttraction *= 0.5; // GDD: Multiplicador 0.5x a la atracción base
  }

  // Resonance effect: "Duplica la fuerza dominante actual de cada nodo de toda la red."
  // Dominant forces are attraction/repulsion. We can scale both forces or apply double strength.
  const resonanceMultiplier = resonanceActive ? 2.0 : 1.0;

  // Attraction/Repulsion forces calculation
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (a.isGhost) {
      // Ghost fade-out logic
      if (a.ghostProgress === undefined) {
        a.ghostProgress = 1.0;
      }
      a.ghostProgress -= 0.016; // rough 60fps fade (takes about 1 second)
      if (a.ghostProgress <= 0) {
        a.ghostProgress = 0;
      }
      // Ghost drifts slowly and is unaffected by general physics
      a.x += a.vx * 0.3;
      a.y += a.vy * 0.3;
      continue;
    }

    // Accumulate force changes
    let fx = 0;
    let fy = 0;
    let neighborCount = 0;

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const b = nodes[j];
      if (b.isGhost) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.5) continue;

      // 1. Repulsion force (anti-collision): distance < 22px
      if (dist < PHYSICS_CONFIG.REPULSION_DIST) {
        const force = (PHYSICS_CONFIG.REPULSION_DIST - dist) / PHYSICS_CONFIG.REPULSION_DIST * 0.45 * resonanceMultiplier;
        // Push apart
        fx -= (dx / dist) * force;
        fy -= (dy / dist) * force;
        a.energy = Math.min(1.0, a.energy + 0.08); // energize on collision
        neighborCount++;
      }
      // 2. Attraction force (social gravity): distance between 70px and 120px
      else if (dist >= PHYSICS_CONFIG.ATTRACT_DIST_MIN && dist <= PHYSICS_CONFIG.ATTRACT_DIST_MAX) {
        // Linear ramp attraction: gets slightly stronger as they separate, or just constant force
        const force = (dist - PHYSICS_CONFIG.ATTRACT_DIST_MIN) / (PHYSICS_CONFIG.ATTRACT_DIST_MAX - PHYSICS_CONFIG.ATTRACT_DIST_MIN) * baseAttraction * resonanceMultiplier;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        neighborCount++;
      }
    }

    // 3. User interaction - Ancla (Hold): temporary gravitational center (black hole)
    // Radius 180px. Sin cooldown, activo mientras se pulsa.
    if (userAnchor) {
      const dx = userAnchor.x - a.x;
      const dy = userAnchor.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 180 && dist > 2) {
        // Stronger gravity pull towards anchor
        const force = (180 - dist) / 180 * 0.12;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        a.energy = Math.min(1.0, a.energy + 0.03);
      }
    }

    // 4. User interaction - Pulso (Click/Tap): instantaneous shockwave
    // Radius 120px. Pulls or repels based on pulse type!
    if (userPulse) {
      const elapsed = now - userPulse.time;
      if (elapsed < 300) { // pulse lasts 300ms
        const dx = a.x - userPulse.x;
        const dy = a.y - userPulse.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 120 && dist > 5) {
          // Calculate propagation wave effect
          const pct = 1.0 - (elapsed / 300);
          const force = (120 - dist) / 120 * 1.5 * pct;
          
          if (userPulse.type === 'repel') {
            // Push away
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          } else {
            // Attract/Pull in
            fx -= (dx / dist) * force;
            fy -= (dy / dist) * force;
          }
          a.energy = Math.min(1.0, a.energy + 0.4); // highly energize
        }
      }
    }

    // 5. Environmental force - Corriente (Wind vector)
    // 5 - 10s: constant directional force applied to entire network
    if (activeEvent.type === 'CORRIENTE' && activeEvent.windAngle !== undefined) {
      const windSpeed = 0.015;
      fx += Math.cos(activeEvent.windAngle) * windSpeed;
      fy += Math.sin(activeEvent.windAngle) * windSpeed;
    }

    // Apply forces to velocity with friction/damping
    const damping = 0.95; // high physical drag for fluid motion
    a.vx = (a.vx + fx) * damping;
    a.vy = (a.vy + fy) * damping;

    // Soft cap on maximum velocity to keep layout elegant
    const speed = Math.hypot(a.vx, a.vy);
    const maxSpeed = 3.5;
    if (speed > maxSpeed) {
      a.vx = (a.vx / speed) * maxSpeed;
      a.vy = (a.vy / speed) * maxSpeed;
    }

    // Move
    a.x += a.vx;
    a.y += a.vy;

    // Decay energy gradually
    a.energy = Math.max(0.1, a.energy - 0.015);

    // Wall bounces with soft restitution
    const bouncePadding = 12;
    if (a.x < bouncePadding) {
      a.x = bouncePadding;
      a.vx = Math.abs(a.vx) * 0.6;
    } else if (a.x > width - bouncePadding) {
      a.x = width - bouncePadding;
      a.vx = -Math.abs(a.vx) * 0.6;
    }

    if (a.y < bouncePadding) {
      a.y = bouncePadding;
      a.vy = Math.abs(a.vy) * 0.6;
    } else if (a.y > height - bouncePadding) {
      a.y = height - bouncePadding;
      a.vy = -Math.abs(a.vy) * 0.6;
    }
  }

  // Filter out completely dead ghosts (ghostProgress <= 0)
  return nodes.filter(n => !n.isGhost || (n.ghostProgress !== undefined && n.ghostProgress > 0));
}

/**
 * Calculates connected clusters and game metrics.
 * A Cluster is defined as: "3 o más nodos que se encuentran dentro de un radio de influencia de 80px entre sí."
 */
export function calculateGameMetrics(nodes: GameNode[]): { metrics: GameMetrics; nodeGroups: number[][] } {
  const activeNodes = nodes.filter(n => !n.isGhost);
  const nLen = activeNodes.length;

  if (nLen === 0) {
    return {
      metrics: {
        crowding: 0,
        isolation: 0,
        health: 50,
        clusterQuality: 0,
        connectivity: 0,
        clusterCount: 0,
      },
      nodeGroups: [],
    };
  }

  // Build distance grid/relationships
  // 1. Calculate crowding & isolation
  let crowdingCount = 0;
  let isolationCount = 0;
  let activeConnections = 0;

  // Track neighbors for each node
  const neighborIndices22: number[][] = Array.from({ length: nLen }, () => []);
  const neighborIndices140: number[][] = Array.from({ length: nLen }, () => []);
  const neighborIndices80: number[][] = Array.from({ length: nLen }, () => []);

  for (let i = 0; i < nLen; i++) {
    const a = activeNodes[i];
    for (let j = i + 1; j < nLen; j++) {
      const b = activeNodes[j];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);

      // Repulsion invasion threshold (22px)
      if (dist < PHYSICS_CONFIG.REPULSION_DIST) {
        neighborIndices22[i].push(j);
        neighborIndices22[j].push(i);
      }

      // Visual connection line threshold (140px)
      if (dist < PHYSICS_CONFIG.CONNECT_DIST) {
        neighborIndices140[i].push(j);
        neighborIndices140[j].push(i);
        activeConnections++; // count unique undirected edges
      }

      // Cluster influence threshold (80px)
      if (dist < 80) {
        neighborIndices80[i].push(j);
        neighborIndices80[j].push(i);
      }
    }
  }

  // Metrics details:
  // - crowding: % de nodos que tienen su radio de repulsión invadido por MÚLTIPLES (>= 2) vecinos.
  for (let i = 0; i < nLen; i++) {
    if (neighborIndices22[i].length >= 2) {
      crowdingCount++;
    }
    // - isolation: % de nodos que no tienen ninguna conexión activa (0 vecinos en 140px).
    if (neighborIndices140[i].length === 0) {
      isolationCount++;
    }
  }

  const crowding = (crowdingCount / nLen) * 100;
  const isolation = (isolationCount / nLen) * 100;

  // health formula: health = 50 + (crowding * 0.5) - (isolation * 0.5)
  let health = 50 + (crowding * 0.5) - (isolation * 0.5);
  health = Math.max(0, Math.min(100, health)); // Clamp exactly to [0, 100]

  // 2. Cluster algorithm: DFS to group nodes within 80px
  const visited = new Set<number>();
  const clusters: number[][] = []; // contains indices of activeNodes

  for (let i = 0; i < nLen; i++) {
    if (visited.has(i)) continue;

    const currentComponent: number[] = [];
    const queue: number[] = [i];
    visited.add(i);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      currentComponent.push(curr);

      for (const neighbor of neighborIndices80[curr]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // GDD: Definition of Cluster is "3 o más nodos..."
    if (currentComponent.length >= 3) {
      clusters.push(currentComponent);
    }
  }

  // Assign cluster groupId back to the nodes so we can render them beautifully!
  for (let i = 0; i < nLen; i++) {
    activeNodes[i].groupId = null;
  }
  clusters.forEach((clusterIndices, clusterIdx) => {
    clusterIndices.forEach(idx => {
      activeNodes[idx].groupId = clusterIdx;
    });
  });

  // Calculate clusterQuality: "Baja varianza en tamaños de clusters = mayor calidad."
  let clusterQuality = 0;
  const clusterSizes = clusters.map(c => c.length);

  if (clusterSizes.length === 0) {
    clusterQuality = 0;
  } else if (clusterSizes.length === 1) {
    // If only 1 cluster exists, evaluate its size closeness to optimal (5-6 nodes)
    const size = clusterSizes[0];
    const deviation = Math.abs(size - 6);
    clusterQuality = Math.max(15, 100 - deviation * 5);
  } else {
    const mean = clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length;
    const variance = clusterSizes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / clusterSizes.length;
    // Low variance translates to higher quality.
    // E.g. variance of 0 is 100 quality, variance of 20 is 100 - 20 * 4 = 20 quality.
    clusterQuality = Math.max(10, Math.min(100, 100 - variance * 4.5));
  }

  // Calculate general connectivity: level of active visual connection links
  // Max visually pleasing density is reached when activeConnections is double the node count
  const connectivity = Math.min(100, (activeConnections / Math.max(1, nLen * 1.5)) * 100);

  return {
    metrics: {
      crowding,
      isolation,
      health,
      clusterQuality,
      connectivity,
      clusterCount: clusters.length,
    },
    // Map cluster node indices to original nodes IDs for reference
    nodeGroups: clusters.map(clusterIndices => clusterIndices.map(idx => idx)),
  };
}
