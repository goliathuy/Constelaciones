# Constelaciones: Experiencia Interactiva de Equilibrio Dinámico

Constelaciones es un simulador físico-matemático de una red social interactiva. El objetivo de la experiencia es modular la tensión y cohesión de un sistema orgánico dinámico de relaciones para mantenerlo dentro de la **Zona Saludable (Eje 35% - 65%)**. Si la red social cae en un aislamiento frío o colapsa por sobresaturación caótica de información, el sistema colapsará tras 10 segundos continuos en estado crítico.

Desarrollado en **React, Vite, Canvas API, Tailwind CSS y Framer Motion (motion/react)**, el juego implementa en su totalidad el documento de diseño de juego (GDD) definitivo, con una simulación de física de fluidos de alta frecuencia y renderizado optimizado de constelaciones.

---

## 🎮 Mecánicas de Modulación

Para balancear la red, cuentas con tres herramientas dinámicas de gravedad e influencia social:

1. **Ancla (Mantener Click / Presionar)**:
   - Crea un campo gravitacional temporal con radio de acción de **180px**.
   - Atrae suavemente a los nodos dispersos cercanos hacia la posición de tu cursor para acelerar la formación de grupos cohesionados (*clusters*).

2. **Pulso (Click Instantáneo)**:
   - Emite una onda expansiva de energía expansiva con radio de **120px** y un **cooldown de 2.0 segundos**.
   - Dependiendo del modo seleccionado en el menú inferior, el pulso tendrá uno de dos efectos:
     - **Repeler (Menú Rojo - Predeterminado)**: Dispersa la congestión local y reduce la saturación repeliendo nodos.
     - **Atraer (Menú Celeste)**: Atrae nodos dispersos para conectarlos rápidamente y salir del aislamiento.

3. **Resonancia (Tecla Espacio / Botón en HUD)**:
   - Multiplica temporalmente por dos la fuerza de atracción y dispersión base de toda la red durante **5 segundos**.
   - Tiene un **cooldown de 15.0 segundos** tras finalizar el efecto.
   - Ideal para acelerar reordenamientos críticos de la red.

---

## 📊 Fórmulas Críticas y Métricas de Sincronía

La salud de la red y el acumulador de sintonía se determinan en base a las siguientes fórmulas físicas y topológicas evaluadas a cada fotograma:

### 1. Salud del Sistema (`health`)
Establece la tensión social de la red, calculada en un rango continuo de `[0, 100]`:
$$\text{Health} = 50 + (\text{Crowding} \times 0.5) - (\text{Isolation} \times 0.5)$$
- **Crowding (Congestión)**: El porcentaje de nodos activos que tienen 2 o más vecinos dentro de un radio de colisión estrecho de **22px**.
- **Isolation (Aislamiento)**: El porcentaje de nodos activos que no poseen absolutamente ningún otro nodo o conexión en un radio de acción extendido de **140px**.

### 2. Conectividad de Red (`connectivity`)
Normaliza la densidad de conexiones visuales contra una densidad óptima ideal:
$$\text{Connectivity} = \min\left(100, \left(\frac{\text{Conexiones Activas}}{N_{\text{nodos}} \times 1.5}\right) \times 100\right)$$
- Una conectividad de **$\ge 20\%$** es requerida como puerta de entrada (*score gate*) para habilitar la acumulación de sintonía.

### 3. Calidad de Constelación (`clusterQuality`)
Evalúa la armonía estructural del sistema. Utiliza componentes conexas mediante una búsqueda por anchura (BFS) con radio de conexión de **80px** y tamaño mínimo de **3 nodos**:
- Si hay múltiples *clusters*, se evalúa la varianza inversa de los tamaños para premiar la homogeneidad distributiva (menos varianza = más calidad).
- Si hay un único *cluster* grande, se evalúa su proximidad a un tamaño ideal armónico de **6 nodos**.

### 4. Puerta de Sintonía e Incremento de Puntuación
La sintonía (puntuación) aumenta continuamente si se cumplen simultáneamente dos condiciones:
1. **Salud en Zona Saludable**: `health` en el rango de `[35%, 65%]`.
2. **Puerta de Conectividad aprobada**: `connectivity >= 20%`.

La sintonía acumulada por segundo se calcula proporcionalmente con la siguiente fórmula:
$$\text{Score/sec} = 10 \times \left(1.0 + \frac{\text{clusterQuality}}{100}\right)$$

---

## 🌀 Eventos Ambientales de Red (Amenazas)

A intervalos dinámicos, la red sufre eventos externos algorítmicos que alteran las fuerzas naturales de atracción:

- **Euforia Social (Color Púrpura, Multiplicador $\times 1.5$)**:
  - Interacción híper-conectada. La atracción gravitacional base se duplica, arrastrando a los nodos a colapsar rápidamente en congestión masiva.
- **Fragmentación (Color Rojo, Multiplicador $\times 0.5$)**:
  - Apatía y desconfianza. La atracción base se reduce a la mitad. Los nodos tienden a aislarse y vagar solitarios al borde del sistema.
- **Corriente Algorítmica (Color Celeste, Vector de Viento)**:
  - Un viento direccional continuo arrastra uniformemente la posición de todos los nodos en un ángulo aleatorio, exigiendo corrección manual constante con anclas.

---

## 🛠️ Optimización y Excepciones de Plataforma

Para garantizar un rendimiento fluido y libre de latencia a **60 FPS** continuos, la arquitectura del juego cuenta con adaptaciones automáticas por plataforma:

- **Límites de Nodos (FIFO Ghost System)**:
  - En **Móviles / Tablets**: El límite máximo de nodos activos simultáneos está regulado a **55 nodos** como tope para evitar saturación de la CPU móvil.
  - En **Escritorio**: El límite es de **120 nodos**.
  - Si se alcanza este límite, el sistema utiliza un algoritmo **FIFO (First In, First Out)** para degradar al nodo más antiguo. El nodo se convierte en `isGhost`, se excluye de las métricas de salud/cohesión, se desactiva de la física y realiza un desvanecimiento suave (*fade-out*) en pantalla durante 1 segundo antes de borrarse.

---

## 💻 Desarrollo y Pila Tecnológica

Este proyecto utiliza una arquitectura modular y eficiente adaptada para la plataforma **Google AI Studio**:

- **Arquitectura de Reloj Único (RAF Decoupled)**: El juego unifica todas las fuentes de temporización (cooldowns, duraciones de eventos, critical-timers, simulación de física) bajo un único reloj sincronizado con el ciclo de refresco de la pantalla a través de `requestAnimationFrame`. Esto elimina las discrepancias que producen los `setInterval` tradicionales y garantiza un comportamiento idéntico en pantallas de 60Hz, 120Hz o superiores.
- **Estructura de Datos Desacoplada (Refs & Throttled Sync)**: Las variables de alta frecuencia (física de nodos, mediciones numéricas exactas, punteros interactivos) se actualizan a nivel de memoria (`useRef`) para evitar disparar ciclos de re-renderizado masivo en React a 60-120fps. El HUD del sistema se sincroniza periódicamente con un refresco sintonizado a **100ms** (10 actualizaciones por segundo) para máxima legibilidad visual sin comprometer el rendimiento de procesamiento.
