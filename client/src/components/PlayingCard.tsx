import { memo } from 'react';
import type { CardData } from '../gameTypes';
import { cardBadge, cardTitle, getCardImageSrc, hiddenDeckImage } from '../cardUtils';

type PlayingCardProps = {
  card?: CardData | null;
  onClick?: () => void;
  selected?: boolean;
  highlight?: string;
  legal?: boolean;
};

function PlayingCardBase({ card, onClick, selected, highlight, legal }: PlayingCardProps) {
  if (!card) {
    return <div className="card-container ghost" />;
  }

  const faceUp = card.isFaceUp;
  const isSpecial = card.kind !== 'NUMBER';
  const kindClass = card.kind.toLowerCase();
  const imageSrc = faceUp ? getCardImageSrc(card) : hiddenDeckImage;
  const showText = faceUp && !imageSrc;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      className={`card-container ${faceUp ? 'face-up' : ''} ${selected ? 'selected' : ''} ${legal ? 'legal' : ''} ${onClick ? 'interactive' : ''}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className={`card-inner ${kindClass}`}>
        <div className="card-back">
          <img className="card-back-art" src={hiddenDeckImage} alt="" aria-hidden="true" />
          {/* <span className="card-back-symbol">🐉</span>
          <span className="card-back-text">SMOKI</span> */}
        </div>
        <div className={`card-front ${isSpecial ? kindClass : ''}`}>
          {imageSrc ? <img className="card-art" src={imageSrc} alt="" aria-hidden="true" /> : null}
          {showText ? <span className="card-value">{card.value ?? '?'}</span> : null}
          {showText ? <span className="card-title">{cardTitle(card)}</span> : null}
          {showText ? <span className="card-badge">{cardBadge(card)}</span> : null}
          {highlight ? <span className="card-highlight">{highlight}</span> : null}
        </div>
      </div>
    </div>
  );
}

function arePlayingCardPropsEqual(previousProps: PlayingCardProps, nextProps: PlayingCardProps): boolean {
  const previousCard = previousProps.card;
  const nextCard = nextProps.card;

  if (previousCard === nextCard) {
    return previousProps.selected === nextProps.selected
      && previousProps.highlight === nextProps.highlight
      && previousProps.legal === nextProps.legal;
  }

  if (!previousCard || !nextCard) {
    return false;
  }

  return previousCard.id === nextCard.id
    && previousCard.kind === nextCard.kind
    && previousCard.value === nextCard.value
    && previousCard.isFaceUp === nextCard.isFaceUp
    && previousProps.selected === nextProps.selected
    && previousProps.highlight === nextProps.highlight
    && previousProps.legal === nextProps.legal;
}

export const PlayingCard = memo(PlayingCardBase, arePlayingCardPropsEqual);
