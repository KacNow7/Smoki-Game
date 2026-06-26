import { memo, useMemo } from 'react';
import type { ClientGameState } from '../gameTypes';
import { createHiddenDeckCard } from '../cardUtils';
import { PlayingCard } from './PlayingCard';

type CenterStacksProps = {
  gameState: ClientGameState;
  isMyTurn: boolean;
  onDrawCard: (source: 'HIDDEN' | 'OPEN', openPileIndex?: number) => void;
  onDiscardCard: () => void;
};

function CenterStacksBase({ gameState, isMyTurn, onDrawCard, onDiscardCard }: CenterStacksProps) {
  const currentTurnPhase = gameState.turnPhase;
  const hiddenDeckCard = useMemo(() => createHiddenDeckCard(gameState.hiddenDeckCount), [gameState.hiddenDeckCount]);
  const topOpenCard = gameState.openPiles[0]?.[gameState.openPiles[0].length - 1] ?? null;
  const drawnCard = gameState.pendingDraw ?? null;
  const drawnSource = gameState.pendingDraw?.source ?? null;
  const canDraw = isMyTurn && currentTurnPhase === 'CHOOSE_DRAW_SOURCE';
  const canDiscard = isMyTurn && currentTurnPhase === 'CHOOSE_KEEP_OR_DISCARD' && drawnCard?.kind !== 'CIRCLE';
  const mustKeepCircle = drawnCard?.kind === 'CIRCLE';

  return (
    <section className="center-stacks panel-card">
      <div className="stack-pair">
        <div className="stack-strip stack-strip-open">
          {drawnCard && drawnSource === 'OPEN' ? (
            <div className="stack-preview" key={`open-${drawnCard.id}`}>
              <PlayingCard card={drawnCard} />
            </div>
          ) : null}
          <button
            type="button"
            className="pile-button"
            onClick={() => {
              if (canDraw) {
                onDrawCard('OPEN', 0);
                return;
              }

              if (canDiscard) {
                onDiscardCard();
              }
            }}
            disabled={!canDraw && !canDiscard}
          >
            {topOpenCard ? <PlayingCard card={topOpenCard} /> : <div className="card-container ghost" />}
          </button>
        </div>

        <div className="stack-strip stack-strip-hidden">
          {drawnCard && drawnSource === 'HIDDEN' ? (
            <div className="stack-preview" key={`hidden-${drawnCard.id}`}>
              <PlayingCard card={drawnCard} />
            </div>
          ) : null}
            {/* <p className="stack-title">Stos zakryty</p> */}
          <button
            type="button"
            className="draw-stack"
            onClick={() => {
              if (canDraw) {
                onDrawCard('HIDDEN');
              }
            }}
            disabled={!canDraw}
          >
            <PlayingCard card={hiddenDeckCard} />
            <span className="sr-only">{currentTurnPhase === 'CHOOSE_DRAW_SOURCE' ? 'Dobierz z talii zakrytej' : 'Poczekaj'}</span>
          </button>
        </div>
      </div>
      {mustKeepCircle ? <p className="turn-state active">Kruczy krąg musisz zagrać do snu.</p> : null}
    </section>
  );
}

export const CenterStacks = memo(CenterStacksBase);