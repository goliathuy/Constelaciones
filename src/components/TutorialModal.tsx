import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Smartphone, Play, X, Target, TrendingUp, CheckCircle2, Lock, ChevronRight, HelpCircle } from 'lucide-react';
import { GameMode, PARTIDA_CAMPAIGN_LEVELS, PartidaLevel } from '../types';

interface TutorialModalProps {
  isPlaying: boolean;
  isMobileMode: boolean;
  selectedMode: GameMode;
  unlockedLevel: number;
  selectedLevel: number;
  onSelectLevel: (levelNum: number) => void;
  onSelectMode: (mode: GameMode) => void;
  onClose: () => void;
  onPlay: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isPlaying,
  isMobileMode,
  selectedMode,
  unlockedLevel,
  selectedLevel,
  onSelectLevel,
  onSelectMode,
  onClose,
  onPlay,
}) => {
  const [activeTab, setActiveTab] = useState<'campaign' | 'rules'>('campaign');
  const currentLevelConfig: PartidaLevel = PARTIDA_CAMPAIGN_LEVELS[selectedLevel - 1] || PARTIDA_CAMPAIGN_LEVELS[0];

  return (
    <motion.div
      id="tutorial-modal-overlay"
      className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl relative flex flex-col scrollbar-thin my-auto"
        initial={{ scale: 0.94, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 10, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
      >
        {/* Close button if game is already active */}
        {isPlaying && (
          <button 
            id="close-tutorial-btn"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer transition-colors z-10"
          >
            <X size={18} />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
            <Sparkles size={24} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-white">Constelaciones</h1>
            <p className="text-[11px] text-sky-400 font-mono uppercase tracking-wider">Aprende y domina el equilibrio de redes complejas</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('campaign')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === 'campaign'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target size={14} />
            <span>Campaña de Partidas (1 - 6)</span>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <HelpCircle size={14} />
            <span>Reglas y Mecánicas</span>
          </button>
        </div>

        {activeTab === 'campaign' ? (
          <div className="space-y-4">
            {/* Active Selected Level Focus Card */}
            {selectedMode === 'partida' && (
              <div className="bg-gradient-to-br from-sky-950/60 to-slate-950/80 border border-sky-500/40 rounded-2xl p-4 shadow-xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-extrabold text-[10px] uppercase tracking-wider font-mono">
                      {currentLevelConfig.subtitle}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-300 font-mono font-bold text-[10px]">
                      {currentLevelConfig.conceptBadge}
                    </span>
                  </div>

                  {selectedLevel <= unlockedLevel ? (
                    <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> {selectedLevel < unlockedLevel ? 'Completado' : 'Desbloqueado'}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold text-slate-500 flex items-center gap-1">
                      <Lock size={12} /> Bloqueado
                    </span>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-bold text-white font-display">
                    Partida {currentLevelConfig.levelNumber}: {currentLevelConfig.title}
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {currentLevelConfig.description}
                  </p>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400 font-semibold">Meta:</span>
                  <span className="text-amber-300 font-bold">{currentLevelConfig.objective.title}</span>
                </div>
              </div>
            )}

            {/* Campaign 12-Level Grid Picker grouped by Acts */}
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block mb-2">
                SELECCIONÁ NIVEL DE PARTIDA (1 - 12):
              </span>

              {/* Group levels into Acts */}
              {[
                { title: "ACTO I: DESCUBRIMIENTO", desc: "Sistemas simples, acciones básicas", range: [1, 4] },
                { title: "ACTO II: COMPRENSIÓN", desc: "Nodos especiales y equilibrio", range: [5, 8] },
                { title: "ACTO III: MAESTRÍA", desc: "Eventos, dinámicas y colapso", range: [9, 12] }
              ].map((act, actIdx) => {
                const actLevels = PARTIDA_CAMPAIGN_LEVELS.filter(
                  l => l.levelNumber >= act.range[0] && l.levelNumber <= act.range[1]
                );

                return (
                  <div key={actIdx} className="mb-3">
                    <div className="flex justify-between items-center mb-1.5 px-1">
                      <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                        {act.title}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">
                        {act.desc}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {actLevels.map((lvl) => {
                        const isUnlocked = lvl.levelNumber <= unlockedLevel;
                        const isCompleted = lvl.levelNumber < unlockedLevel;
                        const isSelected = selectedMode === 'partida' && selectedLevel === lvl.levelNumber;

                        return (
                          <button
                            key={lvl.levelNumber}
                            disabled={!isUnlocked}
                            onClick={() => {
                              onSelectMode('partida');
                              onSelectLevel(lvl.levelNumber);
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 ${
                              !isUnlocked
                                ? 'bg-slate-950/40 border-slate-800/60 opacity-50 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-sky-500/20 border-sky-400 text-white ring-1 ring-sky-500/40 shadow-md cursor-pointer'
                                  : 'bg-slate-900/90 border-slate-800/90 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                                isCompleted
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : isSelected
                                    ? 'bg-sky-500 text-slate-950'
                                    : isUnlocked
                                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                      : 'bg-slate-950 text-slate-600 border border-slate-900'
                              }`}>
                                {lvl.levelNumber}
                              </div>

                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold font-display truncate text-white">
                                  {lvl.title}
                                </span>
                                <span className="text-[9px] font-mono text-slate-400 truncate">
                                  {lvl.conceptBadge}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 font-mono text-[10px]">
                              {!isUnlocked ? (
                                <Lock size={13} className="text-slate-600" />
                              ) : isCompleted ? (
                                <CheckCircle2 size={14} className="text-emerald-400" />
                              ) : (
                                <ChevronRight size={14} className={isSelected ? 'text-sky-400' : 'text-slate-500'} />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>


            {/* Endless / Free Play Option */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold block mb-2">
                O MODO SANDBOX LIBRE:
              </span>

              <button
                type="button"
                id="select-mode-endless-btn"
                onClick={() => onSelectMode('endless')}
                className={`w-full p-3.5 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  selectedMode === 'endless'
                    ? 'bg-purple-500/20 border-purple-500/60 text-white ring-1 ring-purple-500/40 shadow-md'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold font-display flex items-center gap-1.5 text-purple-300">
                      Modo Libre (Endless)
                    </span>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Exploración continua sin límites de tiempo con hasta 120 nodos y 4 Fases de evolución.
                    </p>
                  </div>
                </div>

                {selectedMode === 'endless' && (
                  <span className="text-[9px] bg-purple-500 text-slate-950 font-extrabold px-2 py-0.5 rounded uppercase shrink-0">
                    Seleccionado
                  </span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Rules & Mechanics Tab */
          <div className="space-y-4 text-xs text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
            <p>
              La red social es un sistema vivo continuo. Tu tarea es modular su tensión manteniéndola en equilibrio en la <b>Zona Saludable (Eje 35% - 65%)</b>. Si la dejas caer al aislamiento total o colapsar en saturación, el sistema colapsará.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[10px] font-mono text-red-400 uppercase font-bold tracking-wider flex items-center gap-1">
                  ⚠️ Peligro de Aislamiento (&lt;15%)
                </span>
                <p className="text-[11px] text-slate-400">
                  Ocurre si muchos nodos quedan desconectados o solitarios. Suma masa atrayéndolos para formar pequeños grupos.
                </p>
              </div>

              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-1">
                <span className="text-[10px] font-mono text-amber-500 uppercase font-bold tracking-wider flex items-center gap-1">
                  💥 Peligro de Saturación (&gt;85%)
                </span>
                <p className="text-[11px] text-slate-400">
                  Ocurre si se amontonan de forma caótica. Dispersa la congestión usando Pulsos de Repulsión.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white mb-2">
                🛠️ Herramientas de Modulación:
              </h3>
              <ul className="space-y-1.5 list-disc list-inside text-slate-400 text-[11px]">
                <li>
                  <b className="text-slate-200">Ancla (Mantener Click / Tocar):</b> Crea un punto de gravedad temporal para agrupar nodos.
                </li>
                <li>
                  <b className="text-slate-200">Pulso (Click Instantáneo):</b> Envía una onda expansiva. Configura si deseas que el Pulso <span className="text-red-400">Repela</span> o <span className="text-sky-400">Atraiga</span>.
                </li>
                <li>
                  <b className="text-slate-200">Resonancia (Espacio / Botón Resonar):</b> Duplica temporalmente la fuerza de toda la red. Úsala para reordenar grupos.
                </li>
              </ul>
            </div>
          </div>
        )}

        {isMobileMode && (
          <div className="bg-amber-950/40 border border-amber-500/20 text-amber-300 text-[10px] rounded-xl px-3 py-1.5 flex items-center gap-2 mt-3">
            <Smartphone size={13} className="shrink-0 text-amber-400 animate-pulse" />
            <span><b>Optimización celular:</b> Modo ergónomico activo a 60fps.</span>
          </div>
        )}

        {/* Action Play Button */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-2.5">
          <button
            id="modal-play-btn"
            onClick={onPlay}
            className="flex-1 px-5 py-3 rounded-xl bg-sky-500 text-slate-950 font-extrabold hover:bg-sky-400 flex items-center justify-center gap-2 shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer text-sm font-display"
          >
            <Play size={16} fill="currentColor" />
            {selectedMode === 'partida'
              ? `JUGAR PARTIDA ${selectedLevel}: ${currentLevelConfig.title.toUpperCase()}`
              : 'COMENZAR MODO LIBRE'
            }
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
