import React from 'react';
import { motion } from 'motion/react';
import { Sparkles, Smartphone, Play, X } from 'lucide-react';

interface TutorialModalProps {
  isPlaying: boolean;
  isMobileMode: boolean;
  onClose: () => void;
  onPlay: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isPlaying,
  isMobileMode,
  onClose,
  onPlay,
}) => {
  return (
    <motion.div
      id="tutorial-modal-overlay"
      className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl relative flex flex-col scrollbar-thin"
        initial={{ scale: 0.92, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 15, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
      >
        {/* Close button if game has been already started */}
        {isPlaying && (
          <button 
            id="close-tutorial-btn"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
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
              🎨 Afinidades Sociales y Objetivos Dinámicos:
            </h3>
            <p className="text-[11px] text-slate-400 mb-2">
              Los nodos se dividen en 4 colores de afinidad. La atracción entre la misma afinidad es potente (<span className="text-sky-300">x1.0</span>) pero débil con afinidades ajenas (<span className="text-pink-300">x0.3</span>). Durante eventos de <b>Fragmentación</b>, la atracción interracial cae a <span className="text-red-400">x0.0</span>, formando colonias aisladas de forma orgánica.
            </p>
            <p className="text-[11px] text-slate-400 mb-3">
              Completa los <b>Objetivos Dinámicos</b> en pantalla (mantener un rango o evitar acumulación durante unos segundos) para reclamar recompensas de <b>+500 puntos</b> de sincronía.
            </p>
          </div>

          <div className="border-t border-slate-800/60 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
              🌟 Nodos Especiales:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="bg-slate-950/50 p-2 rounded-lg border border-yellow-500/20">
                <span className="text-yellow-400 font-bold">★ Influencer</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Atracción masiva. Si pasa más de 5s aislado de su grupo, el sistema entra en caída libre.</p>
              </div>
              <div className="bg-slate-950/50 p-2 rounded-lg border border-red-500/20">
                <span className="text-red-400 font-bold">⚡ Disruptor</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Empuja a todos a su alrededor. Ideal para aliviar zonas sobrecargadas.</p>
              </div>
              <div className="bg-slate-950/50 p-2 rounded-lg border border-cyan-500/20">
                <span className="text-cyan-400 font-bold">♦ Organizador</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Incrementa la estabilidad de conexión del grupo, previniendo dispersiones bruscas.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/60 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
              🛠️ Herramientas de Modulación:
            </h3>
            <ul className="space-y-1.5 list-disc list-inside text-slate-400 text-[11px]">
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
            onClick={onPlay}
            className="flex-1 px-5 py-3 rounded-xl bg-sky-500 text-slate-950 font-bold hover:bg-sky-400 flex items-center justify-center gap-2 shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer text-sm"
          >
            <Play size={16} fill="currentColor" />
            {isPlaying ? 'Reanudar Sincronización' : 'Comenzar Sincronización'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
