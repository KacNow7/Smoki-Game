export type CardKind = 'NUMBER' | 'MIRROR' | 'CIRCLE' | 'NEST' | 'ATTACK';
export type TurnPhase =
  | 'WAITING_FOR_PLAYERS'
  | 'CHOOSE_INITIAL_REVEAL'
  | 'CHOOSE_DRAW_SOURCE'
  | 'CHOOSE_KEEP_OR_DISCARD'
  | 'CHOOSE_REPLACE_SLOT'
  | 'CHOOSE_NEST_SWAP'
  | 'ROUND_SCORING'
  | 'ROUND_RESULTS'
  | 'GAME_OVER';
export type DrawSource = 'HIDDEN' | 'OPEN';
export type MirrorDirection = 'LEFT' | 'RIGHT';

export type CardData = {
  id: string;
  isFaceUp: boolean;
  kind: CardKind;
  value?: number;
};

export type PlayerData = {
  id: string;
  isMe: boolean;
  dragonTokens: number;
  totalPoints: number;
  roundPoints: number;
  dream: CardData[];
};

export type RoundResult = {
  playerId: string;
  points: number;
  roundWinner: boolean;
  dragonTokens: number;
  totalPoints: number;
};

export type ClientGameState = {
  roomId: string;
  hiddenDeckCount: number;
  openPiles: CardData[][];
  currentTurnPlayerId: string | null;
  turnPhase: TurnPhase;
  pendingDraw: {
    source: DrawSource;
    openPileIndex?: number;
    id: string;
    isFaceUp: true;
    kind: CardKind;
    value: number;
  } | null;
  pendingNestSlot: number | null;
  roundEnderPlayerId: string | null;
  roundResults: RoundResult[] | null;
  gameWinnerPlayerId: string | null;
  roundNumber: number;
  statusMessage: string;
  initialRevealSelections: Record<string, number>;
  moveHistory: string[];
  players: PlayerData[];
};
