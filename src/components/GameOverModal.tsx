import React from 'react';
import { motion } from 'motion/react';
import { Activity, RotateCcw } from 'lucide-react';
import { SystemZone } from '../types';

interface GameOverModalProps {
  score: number;
  highScore: number;
  activeZone: SystemZone;
  onRestart: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  highScore,
  activeZone,
  onRestart,
}) => {
  return (
    <motion.div
      id="gameover-modal-overlay"
      className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="bg-slate-900 border border-red-500/30 rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 text-center shadow-[0_0_50px_rgba(239,68,68,0.15)] flex flex-col items-center scrollbar-thin"
        initial={{ scale: 0.9, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 30, opacity: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        <div className="p-3 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 mb-4 animate-pulse">
          <Activity size={32} />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white mb-1.5">
          SISTEMA COLAPSADO
        </h1>
        <p className="text-xs text-red-400 uppercase tracking-widest font-mono mb-6">
          Pérdida de Equilibrio Social
        </p>

        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 w-full flex flex-col gap-3.5 mb-6 text-left">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-xs">Sincronía Alcanzada:</span>
            <span className="text-xl font-bold font-display text-white">{Math.round(score)}</span>
          </div>
          <div className="h-[1px] bg-slate-800" />
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-xs">Récord Máximo Histórico:</span>
            <span className="text-lg font-bold font-display text-amber-300">{highScore}</span>
          </div>
          <div className="h-[1px] bg-slate-800" />
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-xs">Última Zona Crítica:</span>
            <span className="text-xs font-mono font-semibold text-red-400 uppercase tracking-wider">{activeZone}</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed mb-6">
          El delicado hilo de atracción y dispersión se rompió por más de 10 segundos continuos. Restablece la sintonía para intentarlo de nuevo.
        </p>

        <button
          id="restart-game-btn"
          onClick={onRestart}
          className="w-full px-5 py-3 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-100 flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer text-sm font-sans"
        >
          <RotateCcw size={16} />
          Volver a Sincronizar
        </button>
      </motion.div>
    </motion.div>
  );
};
