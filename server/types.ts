export type CardKind = 'NUMBER' | 'MIRROR' | 'CIRCLE' | 'NEST' | 'ATTACK';
export type DrawSource = 'HIDDEN' | 'OPEN';
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
export type MirrorDirection = 'LEFT' | 'RIGHT';

export interface Card {
    id: string;
    kind: CardKind;
    value: number;
    isFaceUp: boolean;
}

export interface Player {
    id: string;
    dream: Card[];
    dragonTokens: number;
    totalPoints: number;
    roundPoints: number;
}

export interface PendingDraw {
    source: DrawSource;
    openPileIndex?: number;
    card: Card;
}

export interface RoundResult {
    playerId: string;
    points: number;
    roundWinner: boolean;
    dragonTokens: number;
    totalPoints: number;
}

export interface ScoringSubmission {
    choices: Record<number, MirrorDirection>;
}

export interface RoomState {
    id: string;
    players: Player[];
    hiddenDeck: Card[];
    openPiles: Card[][];
    currentTurnPlayerId: string | null;
    turnPhase: TurnPhase;
    pendingDraw: PendingDraw | null;
    pendingNestSlot: number | null;
    roundEnderPlayerId: string | null;
    nextStartingPlayerId: string | null;
    roundResults: RoundResult[] | null;
    gameWinnerPlayerId: string | null;
    scoringSubmissions: Record<string, ScoringSubmission>;
    continueRoundAcknowledgements: Record<string, true>;
    initialRevealSelections: Record<string, number>;
    statusMessage: string;
    roundNumber: number;
    moveHistory: string[];
}

export interface ClientGameState {
    roomId: string;
    hiddenDeckCount: number;
    openPiles: Card[][];
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
    continueRoundAcknowledgements: Record<string, true>;
    roundNumber: number;
    statusMessage: string;
    initialRevealSelections: Record<string, number>;
    moveHistory: string[];
    players: {
        id: string;
        isMe: boolean;
        dragonTokens: number;
        totalPoints: number;
        roundPoints: number;
        dream: {
            id: string;
            isFaceUp: boolean;
            kind: CardKind;
            value?: number;
        }[];
    }[];
}