import { type Card, type ClientGameState, type Player, type RoomState, type RoundResult } from './types.js';
export declare function createDeck(): Card[];
export declare function replenishDeckFromDiscard(room: RoomState): void;
export declare function startNewRound(room: RoomState, startingPlayerId?: string): void;
export declare function initializeRoomIfReady(room: RoomState): void;
export declare function calculateRoundResults(room: RoomState): RoundResult[];
export declare function revealAllDreams(room: RoomState): void;
export declare function isDreamComplete(player: Player): boolean;
export declare function getNextPlayerId(room: RoomState, currentPlayerId: string): string | null;
export declare function setRoundResults(room: RoomState): RoundResult[];
export declare function prepareNextRound(room: RoomState): void;
export declare function getFilteredGameState(room: RoomState, targetPlayerId: string): ClientGameState;
//# sourceMappingURL=gameLogic.d.ts.map