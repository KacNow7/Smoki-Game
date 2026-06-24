import { memo, useCallback, useMemo } from 'react';
import { PlayingCard } from './PlayingCard';
import { CenterStacks } from './CenterStacks';
import type { CardData, ClientGameState, PlayerData, RoundResult } from '../gameTypes';

type GameBoardProps = {
  gameState: ClientGameState;
  isMyTurn: boolean;
  me: PlayerData | null;
  opponent: PlayerData | null;
  selectedSlot: number | null;
  selectedNestSlots: number[];
  onSetSelectedSlot: (slotIndex: number) => void;
  onChooseInitialReveal: (slotIndex: number) => void;
  onToggleNestSlot: (slotIndex: number) => void;
  onDrawCard: (source: 'HIDDEN' | 'OPEN', openPileIndex?: number) => void;
  onKeepCard: (slotIndex: number) => void;
  onDiscardCard: () => void;
  onSwapNest: () => void;
  onAttackSwap: (opponentSlotIndex: number) => void;
  onContinueRound: () => void;
  currentPlayerDream: CardData[];
  opponentDream: CardData[];
  activeRoundResult: RoundResult[] | null;
};

const dreamSlots = [0, 1, 2, 3, 4, 5];

function isInitialRevealTaken(gameState: ClientGameState, playerId: string | null): boolean {
  if (!playerId) {
    return false;
  }

  return gameState.initialRevealSelections[playerId] !== undefined;
}

function getLegalMove(
  gameState: ClientGameState,
  card: CardData | null,
  slotIndex: number,
  isOwnDream: boolean,
  selectedSlot: number | null,
  initialRevealTaken: boolean,
): boolean {
  if (!card) {
    return false;
  }

  switch (gameState.turnPhase) {
    case 'CHOOSE_INITIAL_REVEAL':
      return isOwnDream && !initialRevealTaken;
    case 'CHOOSE_KEEP_OR_DISCARD':
    case 'CHOOSE_NEST_SWAP':
      return isOwnDream;
    case 'ROUND_SCORING':
      return isOwnDream && card.kind === 'MIRROR';
    case 'CHOOSE_REPLACE_SLOT':
      return isOwnDream ? gameState.pendingNestSlot !== null && slotIndex !== gameState.pendingNestSlot : selectedSlot !== null;
    default:
      return false;
  }
}

function GameBoardBase({
  gameState,
  isMyTurn,
  me,
  opponent,
  selectedSlot,
  selectedNestSlots,
  onSetSelectedSlot,
  onChooseInitialReveal,
  onToggleNestSlot,
  onDrawCard,
  onKeepCard,
  onDiscardCard,
  onSwapNest,
  onAttackSwap,
  onContinueRound,
  currentPlayerDream,
  opponentDream,
  activeRoundResult,
}: GameBoardProps) {
  const currentTurnPhase = gameState.turnPhase;
  const initialRevealTaken = isInitialRevealTaken(gameState, me?.id ?? null);
  const canActOnOwnTurn = isMyTurn || currentTurnPhase === 'CHOOSE_INITIAL_REVEAL';
  const turnLabel = currentTurnPhase === 'CHOOSE_INITIAL_REVEAL'
    ? 'Wybierz początkową kartę'
    : isMyTurn
      ? 'Twoja tura'
      : 'Tura przeciwnika';
  const turnLabelClass = currentTurnPhase === 'CHOOSE_INITIAL_REVEAL'
    ? 'neutral'
    : isMyTurn
      ? 'positive'
      : 'negative';

  const handleDreamCardClick = useCallback(
    (slotIndex: number, isOwnDream: boolean) => {
      if (currentTurnPhase === 'CHOOSE_KEEP_OR_DISCARD' && !isMyTurn) {
        return;
      }

      if (!canActOnOwnTurn && currentTurnPhase !== 'CHOOSE_REPLACE_SLOT') {
        return;
      }

      if (currentTurnPhase === 'CHOOSE_KEEP_OR_DISCARD' && isOwnDream) {
        onSetSelectedSlot(slotIndex);
        onKeepCard(slotIndex);
        return;
      }

      if (currentTurnPhase === 'CHOOSE_NEST_SWAP' && isOwnDream) {
        onToggleNestSlot(slotIndex);
      }

      if (currentTurnPhase === 'CHOOSE_INITIAL_REVEAL' && isOwnDream && !initialRevealTaken) {
        onChooseInitialReveal(slotIndex);
      }

      if (currentTurnPhase === 'CHOOSE_REPLACE_SLOT') {
        if (isOwnDream) {
          if (gameState.pendingNestSlot !== null && slotIndex === gameState.pendingNestSlot) return;
          onSetSelectedSlot(slotIndex);
        } else if (selectedSlot !== null) {
          onAttackSwap(slotIndex);
        }
      }

    },
    [
      currentTurnPhase,
      gameState,
      initialRevealTaken,
      onSetSelectedSlot,
      onToggleNestSlot,
      onChooseInitialReveal,
      onKeepCard,
      onAttackSwap,
      selectedSlot,
      canActOnOwnTurn,
    ],
  );

  const opponentDreamGrid = useMemo(
    () =>
      dreamSlots.map((slotIndex) => {
        const card = opponentDream[slotIndex] ?? null;
        const isLegalMove = getLegalMove(gameState, card, slotIndex, false, selectedSlot, initialRevealTaken);
        const canAttackTarget = currentTurnPhase === 'CHOOSE_REPLACE_SLOT' && selectedSlot !== null;

        return (
          <div key={slotIndex} className={`dream-slot ${gameState.pendingNestSlot === slotIndex ? 'locked' : ''}`}>
            <PlayingCard
              card={card}
              legal={isMyTurn && (isLegalMove || canAttackTarget)}
              onClick={canAttackTarget ? () => onAttackSwap(slotIndex) : undefined}
            />
          </div>
        );
      }),
    [currentTurnPhase, gameState.pendingNestSlot, gameState.turnPhase, initialRevealTaken, onAttackSwap, opponentDream, selectedSlot],
  );

  const playerDreamGrid = useMemo(
    () =>
      dreamSlots.map((slotIndex) => {
        const card = currentPlayerDream[slotIndex] ?? null;
        const isSelected = selectedSlot === slotIndex;
        const isNestLocked = gameState.pendingNestSlot === slotIndex;
        const isLegalMove = getLegalMove(gameState, card, slotIndex, true, selectedSlot, initialRevealTaken);

        return (
          <div key={slotIndex} className={`dream-slot ${isNestLocked ? 'locked' : ''}`}>
            <PlayingCard
              card={card}
              selected={isSelected || selectedNestSlots.includes(slotIndex)}
              legal={canActOnOwnTurn && isLegalMove}
              onClick={() => handleDreamCardClick(slotIndex, true)}
            />
          </div>
        );
      }),
    [currentPlayerDream, gameState.pendingNestSlot, gameState.turnPhase, handleDreamCardClick, initialRevealTaken, selectedNestSlots, selectedSlot],
  );

  return (
    <main className="table-column">
      <section className="opponent-zone">
        <div className="zone-heading">
          <h3>Przeciwnik</h3>
          <span>
            {opponent?.dragonTokens ?? 0} żetonów · {opponent?.totalPoints ?? 0} pkt
          </span>
        </div>
        <div className="dream-grid opponent opponent-view">{opponentDreamGrid}</div>
      </section>

      <div className="turn-banner">
        <span className={`badge turn-banner-${turnLabelClass}`}>{turnLabel}</span>
      </div>

      <section className="center-table">
        <CenterStacks gameState={gameState} isMyTurn={isMyTurn} onDrawCard={onDrawCard} onDiscardCard={onDiscardCard} />
      </section>

      <section className="player-zone">
        <div className="zone-heading">
          <h3>Twój sen</h3>
          <span>
            {me?.dragonTokens ?? 0} żetonów · {me?.totalPoints ?? 0} pkt
          </span>
        </div>
        <div className="dream-grid own">{playerDreamGrid}</div>
        {currentTurnPhase === 'CHOOSE_NEST_SWAP' && isMyTurn ? (
          <div className="turn-cardless-panel">
            <p className="turn-state active">Kliknij dwa sloty w swoim śnie, potem zatwierdź zamianę.</p>
            <div className="selection-summary">
              <span className="badge">
                Sloty: {selectedNestSlots.length === 0 ? 'brak' : selectedNestSlots.map((slot) => slot + 1).join(', ')}
              </span>
              <button type="button" className="primary-button" onClick={onSwapNest} disabled={selectedNestSlots.length !== 2}>
                Zamień sloty
              </button>
            </div>
          </div>
        ) : null}
        {currentTurnPhase === 'CHOOSE_KEEP_OR_DISCARD' && isMyTurn ? (
          <p className="turn-state active">Kliknij kartę w swoim śnie, żeby ją zachować. Kliknij stos odkryty, żeby ją odrzucić.</p>
        ) : null}
        {currentTurnPhase === 'CHOOSE_REPLACE_SLOT' && isMyTurn ? (
          <p className="turn-state active">
            {gameState.pendingNestSlot !== null
              ? 'Kliknij slot w swoim śnie oraz slot przeciwnika, żeby wymienić kartę.'
              : 'Kliknij slot w swoim śnie, żeby wybrać kartę do wymiany.'}
          </p>
        ) : null}
        {currentTurnPhase === 'CHOOSE_INITIAL_REVEAL' && isMyTurn && !initialRevealTaken ? (
          <p className="turn-state active">Kliknij kartę w swoim śnie, żeby odsłonić ją na początku rundy.</p>
        ) : null}
      </section>

      <section className="scoring-zone">
        <div className="scoring-panel">
          {currentTurnPhase === 'ROUND_SCORING' ? <p className="turn-state active">Punktowanie przebiega automatycznie.</p> : null}
          {currentTurnPhase === 'ROUND_RESULTS' ? (
            <>
              <div className="results-list">
                {activeRoundResult?.map((result) => {
                  const player = gameState.players.find((entry) => entry.id === result.playerId);
                  return (
                    <div key={result.playerId} className={`result-row ${result.roundWinner ? 'winner' : ''}`}>
                      <span>{player?.isMe ? 'Ty' : 'Przeciwnik'}</span>
                      <span>{result.points} pkt</span>
                      <span>{result.dragonTokens} żetonów</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="primary-button" onClick={onContinueRound}>
                Następna runda
              </button>
            </>
          ) : null}
        </div>
      </section>

      {/* <section className="history-panel panel-card">
        <p className="panel-label">Historia ruchów</p>
        <ul className="history-list">
          {(gameState.moveHistory.length > 0 ? gameState.moveHistory : ['Brak jeszcze zapisanych ruchów.']).map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section> */}

    </main>
  );
}

function areGameBoardPropsEqual(previousProps: GameBoardProps, nextProps: GameBoardProps): boolean {
  return previousProps.gameState === nextProps.gameState
    && previousProps.isMyTurn === nextProps.isMyTurn
    && previousProps.me === nextProps.me
    && previousProps.opponent === nextProps.opponent
    && previousProps.selectedSlot === nextProps.selectedSlot
    && previousProps.selectedNestSlots === nextProps.selectedNestSlots
    && previousProps.currentPlayerDream === nextProps.currentPlayerDream
    && previousProps.opponentDream === nextProps.opponentDream
    && previousProps.activeRoundResult === nextProps.activeRoundResult;
}

export const GameBoard = memo(GameBoardBase, areGameBoardPropsEqual);
