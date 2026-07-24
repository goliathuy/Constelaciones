/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameNode, GameMetrics, PHYSICS_CONFIG, EventType, GameEvent } from '../types';

// Generates a random node entering from the screen borders
export function generateIncomingNode(
  width: number, 
  height: number,
  forcedType?: 'normal' | 'influencer' | 'disruptor' | 'organizador' | 'explorador' | 'semilla',
  currentNodes?: GameNode[]
): GameNode {
  const id = Math.random().toString(36).substring(2, 9);
  
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  
  let usedIntelligentSpawn = false;

  if (currentNodes && currentNodes.length > 0) {
    const clusteredNodes = currentNodes.filter(n => !n.isGhost && n.groupId !== null);
    
    // 70% chance to spawn near an existing cluster, 30% to spawn in a remote/empty area
    if (clusteredNodes.length > 0 && Math.random() < 0.70) {
      const targetNode = clusteredNodes[Math.floor(Math.random() * clusteredNodes.length)];
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 150; // 100 to 250 px
      
      x = (targetNode.x + Math.cos(angle) * dist + width) % width;
      y = (targetNode.y + Math.sin(angle) * dist + height) % height;
      
      // Gentle drift velocity
      vx = (Math.random() - 0.5) * 1.0;
      vy = (Math.random() - 0.5) * 1.0;
      
      usedIntelligentSpawn = true;
    } else {
      // 30% chance, or no clusters: spawn in a remote empty zone
      const pos = findEmptyPosition(currentNodes, width, height);
      x = pos.x;
      y = pos.y;
      
      // Random velocity
      vx = (Math.random() - 0.5) * 1.5;
      vy = (Math.random() - 0.5) * 1.5;
      
      usedIntelligentSpawn = true;
    }
  }

  if (!usedIntelligentSpawn) {
    // Choose a random border: 0 = Top, 1 = Right, 2 = Bottom, 3 = Left
    const border = Math.floor(Math.random() * 4);
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
  }

  let specialType: 'normal' | 'influencer' | 'disruptor' | 'organizador' | 'explorador' | 'semilla' = 'normal';
  let size = 4 + Math.random() * 4;

  if (forcedType) {
    specialType = forcedType;
  } else {
    // Default fallback rolls
    const typeRoll = Math.random();
    if (typeRoll < 0.05) {
      specialType = 'influencer';
    } else if (typeRoll < 0.10) {
      specialType = 'disruptor';
    } else if (typeRoll < 0.15) {
      specialType = 'organizador';
    } else if (typeRoll < 0.20) {
      specialType = 'explorador';
    }
  }

  // Sizing by type
  if (specialType === 'influencer') size = 7.5;
  else if (specialType === 'disruptor') size = 6.0;
  else if (specialType === 'organizador') size = 6.5;
  else if (specialType === 'explorador') size = 5.5;
  else if (specialType === 'semilla') size = 8.0;

  return {
    id,
    x,
    y,
    vx,
    vy,
    r: size,
    energy: 0.1, // starts cool, gets energized when interacting
    groupId: null,
    lifetime: Date.now(),
    isGhost: false,
    colorIndex: Math.floor(Math.random() * 4), // 4 distinct affinity groups
    specialType,
    isolatedTimer: specialType === 'influencer' ? 0 : undefined,
    connectedTimer: specialType === 'explorador' ? 0 : undefined,
    seedTimer: specialType === 'semilla' ? 0 : undefined
  };
}

// Generate the initial batch of nodes inside the bounds (all normal initially for learning phase)
export function generateInitialNodes(count: number, width: number, height: number, spawnRadius: number = 400): GameNode[] {
  const nodes: GameNode[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  
  for (let i = 0; i < count; i++) {
    const size = 4 + Math.random() * 4;

    // Group initial nodes in a cluster of specified radius at the center of the virtual world
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * spawnRadius; // Uniform distribution in specified radius circle
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;

    nodes.push({
      id: Math.random().toString(36).substring(2, 9),
      x,
      y,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      r: size,
      energy: 0.2,
      groupId: null,
      lifetime: Date.now() - Math.random() * 50000, // staggered initial lifetimes
      isGhost: false,
      colorIndex: Math.floor(Math.random() * 4), // 4 distinct affinity groups
      specialType: 'normal',
      isolatedTimer: undefined,
      connectedTimer: undefined,
      seedTimer: undefined
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

      let dx = b.x - a.x;
      let dy = b.y - a.y;

      // Periodic Boundary Conditions (Toroidal distance)
      if (dx > width / 2) dx -= width;
      else if (dx < -width / 2) dx += width;

      if (dy > height / 2) dy -= height;
      else if (dy < -height / 2) dy += height;

      const dist = Math.hypot(dx, dy);

      if (dist < 0.5) continue;

      // 1. Repulsion force (anti-collision): distance < REPULSION_DIST
      if (dist < PHYSICS_CONFIG.REPULSION_DIST) {
        // Stronger repulsion at extremely close range (< 10px)
        const closeFactor = dist < 10 ? 2.0 : 1.0;
        const force = (PHYSICS_CONFIG.REPULSION_DIST - dist) / PHYSICS_CONFIG.REPULSION_DIST * 0.5 * closeFactor * resonanceMultiplier;
        // Push apart
        fx -= (dx / dist) * force;
        fy -= (dy / dist) * force;
        a.energy = Math.min(1.0, a.energy + 0.1); // energize on collision
        neighborCount++;
      }

      // 2. Special Node: Disruptor repulsion (if nearby)
      if (b.specialType === 'disruptor' && dist < 80) {
        const force = (80 - dist) / 80 * 0.06 * resonanceMultiplier;
        fx -= (dx / dist) * force;
        fy -= (dy / dist) * force;
        a.energy = Math.min(1.0, a.energy + 0.02);
      }

      // 3. Special Node: Influencer strong attraction (regardless of affinity)
      else if (b.specialType === 'influencer' && dist >= 30 && dist <= 135) {
        const force = (dist - 30) / 105 * baseAttraction * 1.8 * resonanceMultiplier;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        neighborCount++;
      }

      // 4. Special Node: Organizador gentle attraction & stabilization
      else if (b.specialType === 'organizador' && dist >= 18 && dist <= 100) {
        const force = (dist - 18) / 82 * baseAttraction * 1.3 * resonanceMultiplier;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        neighborCount++;
        // Apply velocity damping to stabilize
        a.vx *= 0.96;
        a.vy *= 0.96;
      }

      // 4.5. Special Node: Explorador gentle repulsion from any node belonging to a cluster
      else if (a.specialType === 'explorador' && dist < 220) {
        if (b.groupId !== null || b.specialType === 'influencer' || b.specialType === 'organizador' || b.specialType === 'semilla') {
          const force = (220 - dist) / 220 * 0.04 * resonanceMultiplier;
          fx -= (dx / dist) * force;
          fy -= (dy / dist) * force;
        }
      }

      // 4.8. Special Node: Semilla gentle gravitational pull (like an organizing beacon)
      else if (b.specialType === 'semilla' && dist >= 20 && dist <= 160) {
        const force = (dist - 20) / 140 * baseAttraction * 1.2 * resonanceMultiplier;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        neighborCount++;
      }

      // 5. Standard node attraction (social gravity with Affinity Rules)
      else if (dist >= PHYSICS_CONFIG.ATTRACT_DIST_MIN && dist <= PHYSICS_CONFIG.ATTRACT_DIST_MAX) {
        // Affinity rules:
        // Same affinity (colorIndex matches): attraction x1.0, fragmentation x0.8
        // Different affinity: attraction x0.3, fragmentation x0.0
        const isSameAffinity = a.colorIndex === b.colorIndex;
        let affinityMult = isSameAffinity ? 1.0 : 0.3;
        
        if (activeEvent.type === 'FRAGMENTACION') {
          affinityMult = isSameAffinity ? 0.8 : 0.0;
        }

        if (affinityMult > 0) {
          const force = (dist - PHYSICS_CONFIG.ATTRACT_DIST_MIN) / (PHYSICS_CONFIG.ATTRACT_DIST_MAX - PHYSICS_CONFIG.ATTRACT_DIST_MIN) * baseAttraction * resonanceMultiplier * affinityMult;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
          neighborCount++;
        }
      }

      // 1.5. Dynamic orbital/swirling force inside clusters to make congestion feel alive
      if (dist < 50 && dist > 12) {
        // Perpendicular vector: (-dy, dx)
        // Alternate swirl direction based on colorIndex so they elegantly weave through each other
        const swirlDirection = (a.colorIndex % 2 === 0 ? 1 : -1);
        const swirlStrength = 0.0075 * (1.0 - (dist / 50)) * resonanceMultiplier;
        fx += (-dy / dist) * swirlStrength * swirlDirection;
        fy += (dx / dist) * swirlStrength * swirlDirection;
        // Energize slightly from active cluster micro-dynamics
        a.energy = Math.min(1.0, a.energy + 0.01);
      }
    }

    // Add a gentle, natural breathing oscillation (wobble) to all nodes
    const timeSec = now * 0.001;
    const phase = (a.lifetime % 10000) / 1000 * Math.PI * 2;
    const wobbleFreq = 1.0 + (a.colorIndex * 0.15);
    // High energy nodes (under collision/congestion) vibrate with higher speed and intensity
    const wobbleAmt = 0.015 * (1.0 + a.energy * 2.5);
    fx += Math.sin(timeSec * wobbleFreq + phase) * wobbleAmt;
    fy += Math.cos(timeSec * wobbleFreq + phase) * wobbleAmt;

    // 3. User interaction - Ancla (Hold): temporary gravitational center (black hole)
    // Radius 400px. Sin cooldown, activo mientras se pulsa.
    if (userAnchor) {
      const dx = userAnchor.x - a.x;
      const dy = userAnchor.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 400 && dist > 2) {
        // Stronger gravity pull towards anchor
        const force = (400 - dist) / 400 * 0.15;
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
        a.energy = Math.min(1.0, a.energy + 0.03);
      }
    }

    // 4. User interaction - Pulso (Click/Tap): instantaneous shockwave
    // Radius 250px. Pulls or repels based on pulse type!
    if (userPulse) {
      const elapsed = now - userPulse.time;
      if (elapsed < 300) { // pulse lasts 300ms
        const dx = a.x - userPulse.x;
        const dy = a.y - userPulse.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 250 && dist > 5) {
          // Calculate propagation wave effect
          const pct = 1.0 - (elapsed / 300);
          const force = (250 - dist) / 250 * 2.2 * pct;
          
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

    // Move (Semilla stays stationary, others move)
    if (a.specialType === 'semilla') {
      a.vx = 0;
      a.vy = 0;
    } else {
      a.x += a.vx;
      a.y += a.vy;
    }

    // Decay energy gradually
    a.energy = Math.max(0.1, a.energy - 0.015);

    // Track isolation time for influencers with toroidal math
    if (a.specialType === 'influencer') {
      let isIsolated = true;
      for (let j = 0; j < nodes.length; j++) {
        if (nodes[j].id === a.id || nodes[j].isGhost) continue;
        let dx = nodes[j].x - a.x;
        let dy = nodes[j].y - a.y;
        if (dx > width / 2) dx -= width;
        else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height;
        else if (dy < -height / 2) dy += height;
        const dist = Math.hypot(dx, dy);
        if (dist < PHYSICS_CONFIG.CONNECT_DIST) {
          isIsolated = false;
          break;
        }
      }
      if (isIsolated) {
        a.isolatedTimer = (a.isolatedTimer || 0) + 0.016; // approx seconds at 60fps
        a.energy = Math.min(1.0, a.energy + 0.04);
      } else {
        a.isolatedTimer = 0;
      }
    }

    // Track connection time for explorers with toroidal math, and add random walk
    if (a.specialType === 'explorador') {
      let isConnected = false;
      for (let j = 0; j < nodes.length; j++) {
        if (nodes[j].id === a.id || nodes[j].isGhost) continue;
        let dx = nodes[j].x - a.x;
        let dy = nodes[j].y - a.y;
        if (dx > width / 2) dx -= width;
        else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height;
        else if (dy < -height / 2) dy += height;
        const dist = Math.hypot(dx, dy);
        if (dist < PHYSICS_CONFIG.CONNECT_DIST) {
          isConnected = true;
          break;
        }
      }
      if (isConnected) {
        a.connectedTimer = (a.connectedTimer || 0) + 0.016; // approx seconds at 60fps
        a.energy = Math.min(1.0, a.energy + 0.02);
      } else {
        a.connectedTimer = 0;
      }

      // Wander around randomly
      a.vx += (Math.random() - 0.5) * 0.35;
      a.vy += (Math.random() - 0.5) * 0.35;
    }

    // Toroidal Pac-Man wrap-around boundaries
    if (a.x < 0) {
      a.x += width;
    } else if (a.x > width) {
      a.x -= width;
    }

    if (a.y < 0) {
      a.y += height;
    } else if (a.y > height) {
      a.y -= height;
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
        activeLinks: 0,
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
      
      let dx = b.x - a.x;
      let dy = b.y - a.y;

      const width = PHYSICS_CONFIG.WORLD_WIDTH;
      const height = PHYSICS_CONFIG.WORLD_HEIGHT;

      if (dx > width / 2) dx -= width;
      else if (dx < -width / 2) dx += width;

      if (dy > height / 2) dy -= height;
      else if (dy < -height / 2) dy += height;

      const dist = Math.hypot(dx, dy);

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
      activeLinks: activeConnections,
    },
    // Map cluster node indices to original nodes IDs for reference
    nodeGroups: clusters.map(clusterIndices => clusterIndices.map(idx => idx)),
  };
}

/**
 * Finds an empty position inside the virtual map by testing several random candidates
 * and picking the one furthest away from any existing active nodes.
 */
export function findEmptyPosition(nodes: GameNode[], width: number, height: number): { x: number; y: number } {
  let bestX = width / 2;
  let bestY = height / 2;
  let maxMinDistance = -1;

  for (let i = 0; i < 8; i++) {
    const rx = 300 + Math.random() * (width - 600);
    const ry = 300 + Math.random() * (height - 600);
    
    let minDistance = Infinity;
    nodes.forEach(n => {
      if (!n.isGhost) {
        // Toroidal distance to node n
        let dx = n.x - rx;
        let dy = n.y - ry;
        if (dx > width / 2) dx -= width;
        else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height;
        else if (dy < -height / 2) dy += height;
        
        const d = Math.hypot(dx, dy);
        if (d < minDistance) {
          minDistance = d;
        }
      }
    });

    if (minDistance > maxMinDistance) {
      maxMinDistance = minDistance;
      bestX = rx;
      bestY = ry;
    }
  }

  return { x: bestX, y: bestY };
}
