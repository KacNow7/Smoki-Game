import type { CardData, CardKind } from './gameTypes';

export const hiddenDeckImage = '/cards/rewers.webp';

const cardImageMap: Partial<Record<CardKind, string>> = {
  MIRROR: '/cards/mirror.webp',
  CIRCLE: '/cards/circle.webp',
  NEST: '/cards/nest.webp',
  ATTACK: '/cards/attack.webp',
};

export function getNumberCardImage(value?: number): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = value < 0 ? `-${Math.abs(value)}` : String(value);
  return `/cards/number${normalized}.webp`;
}

export function getCardImageSrc(card: CardData): string | undefined {
  return cardImageMap[card.kind] ?? (card.kind === 'NUMBER' ? getNumberCardImage(card.value) : undefined);
}

export function cardTitle(card: CardData): string {
  switch (card.kind) {
    case 'CIRCLE':
      return 'Kruczy krąg';
    case 'NEST':
      return 'Krucze gniazdo';
    case 'MIRROR':
      return 'Odbicie w wodzie';
    case 'ATTACK':
      return 'Atak Kurka';
    default:
      return String(card.value ?? '?');
  }
}

export function cardBadge(card: CardData): string {
  switch (card.kind) {
    case 'CIRCLE':
      return 'KRAJ';
    case 'NEST':
      return 'GNIAZDO';
    case 'MIRROR':
      return 'ODBICIE';
    case 'ATTACK':
      return 'ATAK';
    default:
      return 'LICZBA';
  }
}

export function createHiddenDeckCard(hiddenDeckCount: number): CardData {
  return {
    id: 'hidden-deck',
    isFaceUp: false,
    kind: 'NUMBER',
    value: hiddenDeckCount,
  };
}
