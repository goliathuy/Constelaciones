import React from 'react';
import { motion } from 'motion/react';
import { Activity, RotateCcw, Trophy, Target, Shuffle, ChevronRight, Play } from 'lucide-react';
import { SystemZone, GameMode, PartidaResult } from '../types';

interface GameOverModalProps {
  score: number;
  highScore: number;
  activeZone: SystemZone;
  gameMode: GameMode;
  selectedLevel?: number;
  unlockedLevel?: number;
  partidaResult?: PartidaResult | null;
  onRestart: (mode?: GameMode) => void;
  onSwitchMode?: (mode: GameMode) => void;
  onNextLevel?: () => void;
  onContinueFreePlay?: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  highScore,
  activeZone,
  gameMode,
  selectedLevel = 1,
  unlockedLevel = 1,
  partidaResult,
  onRestart,
  onSwitchMode,
  onNextLevel,
  onContinueFreePlay,
}) => {
  const isVictory = partidaResult?.status === 'VICTORY';
  const isPartial = partidaResult?.status === 'PARTIAL';
  const isCollapse = !isVictory && !isPartial;
  const hasNextLevel = selectedLevel < 6;

  return (
    <motion.div
      id="gameover-modal-overlay"
      className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`bg-slate-900 border rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 text-center shadow-2xl flex flex-col items-center scrollbar-thin my-auto ${
          isVictory 
            ? 'border-amber-500/40 shadow-[0_0_50px_rgba(245,158,11,0.2)]' 
            : isPartial 
              ? 'border-sky-500/40 shadow-[0_0_50px_rgba(56,189,248,0.2)]'
              : 'border-red-500/40 shadow-[0_0_50px_rgba(239,68,68,0.2)]'
        }`}
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
      >
        {/* Header Icon Badge */}
        <div className={`p-3.5 rounded-2xl border mb-3 ${
          isVictory 
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
            : isPartial 
              ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
              : 'bg-red-500/10 text-red-500 border-red-500/30 animate-pulse'
        }`}>
          {isVictory ? (
            <Trophy size={36} className="animate-bounce" />
          ) : isPartial ? (
            <Target size={36} />
          ) : (
            <Activity size={36} />
          )}
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-white mb-1">
          {isVictory 
            ? `¡PARTIDA ${selectedLevel} COMPLETADA!` 
            : isPartial 
              ? 'TIEMPO AGOTADO' 
              : 'SISTEMA COLAPSADO'}
        </h1>
        <p className={`text-xs uppercase tracking-widest font-mono mb-4 ${
          isVictory ? 'text-amber-400' : isPartial ? 'text-sky-400' : 'text-red-400'
        }`}>
          {isVictory 
            ? 'Objetivo Cumplido con Éxito' 
            : isPartial 
              ? 'Fin de Tiempo de la Partida' 
              : 'Pérdida de Equilibrio Social'}
        </p>

        {/* Statistics Card */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 w-full flex flex-col gap-2.5 mb-4 text-left font-mono">
          {gameMode === 'partida' && (
            <>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Progreso del Nivel:</span>
                <span className={`font-bold font-display ${isVictory ? 'text-emerald-400' : 'text-sky-300'}`}>
                  {isVictory ? '✓ APRENDIDO' : `${partidaResult?.objectivesCompletedCount ?? 0} / ${partidaResult?.totalObjectives ?? 1}`}
                </span>
              </div>
              {isVictory && (partidaResult?.timeRemainingBonus ?? 0) > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Bonus Tiempo Restante:</span>
                  <span className="text-amber-400 font-bold">+{partidaResult?.timeRemainingBonus} PTS</span>
                </div>
              )}
              <div className="h-[1px] bg-slate-800/80" />
            </>
          )}

          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-xs font-sans">Sincronía Alcanzada:</span>
            <span className="text-xl font-bold font-display text-white">
              {Math.round(partidaResult?.score ?? score)}
            </span>
          </div>

          <div className="h-[1px] bg-slate-800/80" />

          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-xs font-sans">Récord Máximo Histórico:</span>
            <span className="text-lg font-bold font-display text-amber-300">{highScore}</span>
          </div>

          {isCollapse && (
            <>
              <div className="h-[1px] bg-slate-800/80" />
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-sans">Última Zona Crítica:</span>
                <span className="font-semibold text-red-400 uppercase tracking-wider">{activeZone}</span>
              </div>
            </>
          )}
        </div>

        {/* Descriptive Summary Paragraph */}
        <p className="text-xs text-slate-300 leading-relaxed mb-5">
          {isVictory 
            ? '¡Excelente modulación! Has dominado el concepto pedagógico de este nivel. Puedes avanzar a la siguiente partida o continuar jugando libremente.' 
            : isPartial 
              ? 'No lograste completar el objetivo antes de agotar el tiempo. Reinténtalo para desbloquear el siguiente nivel.'
              : 'El delicado hilo de atracción y dispersión se rompió por más de 10 segundos continuos. Restablece la sintonía para intentarlo de nuevo.'}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 w-full">
          {isVictory && hasNextLevel && onNextLevel && (
            <button
              id="next-level-btn"
              onClick={onNextLevel}
              className="w-full py-3.5 px-4 rounded-xl bg-sky-500 text-slate-950 font-extrabold hover:bg-sky-400 flex items-center justify-center gap-2 shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer text-xs uppercase tracking-wider font-display"
            >
              <ChevronRight size={18} />
              Siguiente Partida ({selectedLevel + 1})
            </button>
          )}

          {isVictory && onContinueFreePlay && (
            <button
              id="continue-freeplay-btn"
              onClick={onContinueFreePlay}
              className="w-full py-3 px-4 rounded-xl bg-purple-500/20 border border-purple-500/50 text-purple-200 hover:bg-purple-500/30 font-bold flex items-center justify-center gap-2 transition-all cursor-pointer text-xs"
            >
              <Play size={14} fill="currentColor" />
              Continuar en Modo Libre
            </button>
          )}

          <div className="flex gap-2 w-full pt-1">
            <button
              id="restart-game-btn"
              onClick={() => onRestart(gameMode)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-semibold border border-slate-700"
            >
              <RotateCcw size={14} />
              Reintentar Partida {selectedLevel}
            </button>

            {onSwitchMode && (
              <button
                id="switch-mode-btn"
                onClick={() => onSwitchMode(gameMode === 'partida' ? 'endless' : 'partida')}
                className="py-2.5 px-3 rounded-xl bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 flex items-center justify-center gap-1.5 transition-all cursor-pointer text-xs font-semibold border border-slate-800"
              >
                <Shuffle size={14} />
                {gameMode === 'partida' ? 'Endless' : 'Campaña'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};