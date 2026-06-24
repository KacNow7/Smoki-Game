import express from 'express';
import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import cors from 'cors';
import { randomBytes } from 'crypto';
import {
  type Card,
  type MirrorDirection,
  type PendingDraw,
  type RoomState,
  type ScoringSubmission,
} from './types.js';
import {
  createDeck,
  buildAutoMirrorChoices,
  getFilteredGameState,
  initializeRoomIfReady,
  isDreamComplete,
  prepareNextRound,
  revealAllDreams,
  replenishDeckFromDiscard,
  setRoundResults,
  startNewRound,
} from './gameLogic.js';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const rooms: Record<string, RoomState> = {};

function recordMove(room: RoomState, message: string): void {
  room.moveHistory = [...room.moveHistory, message].slice(-8);
}

function normalizeRoomId(input: string): string | null {
  const roomId = input.trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(roomId) ? roomId : null;
}

function generateRoomId(): string {
  let roomId = '';

  do {
    roomId = randomBytes(3).toString('hex').toUpperCase();
  } while (rooms[roomId]);

  return roomId;
}

function createRoom(roomId?: string): RoomState {
  const normalizedRoomId = roomId ? normalizeRoomId(roomId) : null;
  const finalRoomId = normalizedRoomId ?? generateRoomId();

  return {
    id: finalRoomId,
    players: [],
    hiddenDeck: createDeck(),
    openPiles: [[]],
    currentTurnPlayerId: null,
    turnPhase: 'WAITING_FOR_PLAYERS',
    pendingDraw: null,
    pendingNestSlot: null,
    roundEnderPlayerId: null,
    nextStartingPlayerId: null,
    roundResults: null,
    gameWinnerPlayerId: null,
    scoringSubmissions: {},
    initialRevealSelections: {},
    statusMessage: 'Czekamy na drugiego gracza.',
    roundNumber: 0,
    moveHistory: [],
  };
}

function isRoomFull(room: RoomState): boolean {
  return room.players.length >= 2;
}

function getRoomForSocket(socket: Socket): RoomState | null {
  const roomId = typeof socket.data.roomId === 'string' ? socket.data.roomId : null;
  return roomId ? rooms[roomId] ?? null : null;
}

function getPlayer(room: RoomState, playerId: string) {
  return room.players.find((player) => player.id === playerId) ?? null;
}

function getOpponent(room: RoomState, playerId: string) {
  return room.players.find((player) => player.id !== playerId) ?? null;
}

function broadcastRoomState(room: RoomState): void {
  room.players.forEach((player) => {
    io.to(player.id).emit('gameState', getFilteredGameState(room, player.id));
  });
}

function getCurrentPlayer(room: RoomState) {
  return room.currentTurnPlayerId ? getPlayer(room, room.currentTurnPlayerId) : null;
}

function advanceTurn(room: RoomState): void {
  if (room.players.length < 2 || !room.currentTurnPlayerId) {
    room.turnPhase = 'WAITING_FOR_PLAYERS';
    room.statusMessage = 'Czekamy na drugiego gracza.';
    room.currentTurnPlayerId = null;
    return;
  }

  const currentIndex = room.players.findIndex((player) => player.id === room.currentTurnPlayerId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % room.players.length;
  room.currentTurnPlayerId = room.players[nextIndex]?.id ?? null;
  room.turnPhase = 'CHOOSE_DRAW_SOURCE';
  room.statusMessage = 'Wybierz źródło doboru karty.';
}

function swapDreamCards(room: RoomState, playerAId: string, slotA: number, playerBId: string, slotB: number): boolean {
  const playerA = getPlayer(room, playerAId);
  const playerB = getPlayer(room, playerBId);

  if (!playerA || !playerB) {
    return false;
  }

  const cardA = playerA.dream[slotA];
  const cardB = playerB.dream[slotB];

  if (!cardA || !cardB) {
    return false;
  }

  playerA.dream[slotA] = { ...cardB, isFaceUp: true };
  playerB.dream[slotB] = { ...cardA, isFaceUp: true };
  return true;
}

function findDreamCard(room: RoomState, playerId: string, slotIndex: number): Card | null {
  const player = getPlayer(room, playerId);
  return player?.dream[slotIndex] ?? null;
}

function findDreamSlotByCardId(room: RoomState, playerId: string, cardId: string): number {
  const player = getPlayer(room, playerId);
  if (!player) {
    return -1;
  }

  return player.dream.findIndex((card) => card.id === cardId);
}

function setTopOpenCard(room: RoomState, pileIndex: number, card: Card): void {
  const idx = pileIndex ?? 0;
  room.openPiles[idx] ??= [];
  room.openPiles[idx].push({ ...card, isFaceUp: true });
}

function removeTopOpenCard(room: RoomState, pileIndex: number): Card | null {
  const idx = pileIndex ?? 0;
  const pile = room.openPiles[idx];
  if (!pile || pile.length === 0) {
    return null;
  }

  return pile.pop() ?? null;
}

function drawCard(room: RoomState, source: PendingDraw['source'], openPileIndex?: number): Card | null {
  if (source === 'OPEN') {
    return removeTopOpenCard(room, 0);
  }

  replenishDeckFromDiscard(room);
  return room.hiddenDeck.pop() ?? null;
}

function placeCardInDream(room: RoomState, playerId: string, slotIndex: number, card: Card): Card | null {
  const player = getPlayer(room, playerId);
  if (!player) {
    return null;
  }

  const previousCard = player.dream[slotIndex] ?? null;
  player.dream[slotIndex] = { ...card, isFaceUp: true };
  return previousCard ? { ...previousCard, isFaceUp: true } : null;
}

function discardCardToOpenPile(room: RoomState, card: Card, pileIndex: number): void {
  setTopOpenCard(room, 0, card);
}

function handleCircleCard(room: RoomState, playerId: string, slotIndex: number, replacedCard: Card | null): void {
  const player = getPlayer(room, playerId);
  const opponent = getOpponent(room, playerId);
  if (!player || !opponent) return;

  // The replacedCard is the card that was previously in player's slot before Circle was placed.
  // It goes to the opponent's same slot, replacing opponent's card, and the opponent's replaced card
  // is sent to the bottom of the open pile.

  const ownSlot = slotIndex;
  const opponentPrev = opponent.dream[ownSlot] ?? null;

  // Put replacedCard into opponent's slot
  if (replacedCard) {
    opponent.dream[ownSlot] = { ...replacedCard, isFaceUp: true };
  }

  // If opponent had a card replaced, send it to bottom of open pile
  if (opponentPrev) {
    // bottom = unshift so pop() takes from the other end
    room.openPiles[0] ??= [];
    room.openPiles[0].unshift({ ...opponentPrev, isFaceUp: true });
  }
}

function maybeEnterScoring(room: RoomState): void {
  const completedPlayer = room.players.find((player) => isDreamComplete(player));
  if (!completedPlayer) {
    return;
  }

  room.roundEnderPlayerId = completedPlayer.id;
  room.pendingDraw = null;
  room.pendingNestSlot = null;
  room.currentTurnPlayerId = null;
  room.turnPhase = 'ROUND_SCORING';
  room.statusMessage = 'Runda zakończona. Punktowanie przebiega automatycznie.';
  revealAllDreams(room);
  recordMove(room, `Runda ${room.roundNumber}: zaczęto rozstrzyganie punktów.`);

  room.players.forEach((player) => {
    room.scoringSubmissions[player.id] = {
      choices: buildAutoMirrorChoices(room, player),
    };
  });

  finalizeScoringIfReady(room);
}

function resetRoundSelections(room: RoomState): void {
  room.initialRevealSelections = {};
  room.scoringSubmissions = {};
}

function finalizeScoringIfReady(room: RoomState): void {
  const allSubmitted = room.players.every((player) => room.scoringSubmissions[player.id] !== undefined);
  if (!allSubmitted) {
    return;
  }

  const results = setRoundResults(room);
  const winnerIds = results.filter((result) => result.roundWinner).map((result) => result.playerId);
  room.turnPhase = room.gameWinnerPlayerId ? 'GAME_OVER' : 'ROUND_RESULTS';
  room.statusMessage = room.gameWinnerPlayerId
    ? 'Gra zakończona. Ktoś zdobył 3 żetony smoka.'
    : winnerIds.length > 1
      ? 'Remis rundy. Remisujący gracze otrzymali żeton smoka.'
      : 'Runda zakończona. Zwycięzca otrzymał żeton smoka.';
  recordMove(room, room.gameWinnerPlayerId ? 'Gra zakończona.' : 'Punktacja rundy została zatwierdzona.');
}

function canCurrentPlayerAct(room: RoomState, socketId: string): boolean {
  return room.currentTurnPlayerId === socketId && room.turnPhase === 'CHOOSE_DRAW_SOURCE';
}

io.on('connection', (socket) => {
  socket.on('createRoom', (_payload: unknown, callback?: (response: { ok: boolean; roomId?: string; error?: string }) => void) => {
    if (getRoomForSocket(socket)) {
      callback?.({ ok: false, error: 'Masz już aktywny pokój.' });
      return;
    }

    const room = createRoom();
    rooms[room.id] = room;
    room.players.push({
      id: socket.id,
      dream: [],
      dragonTokens: 0,
      totalPoints: 0,
      roundPoints: 0,
    });

    socket.join(room.id);
    socket.data.roomId = room.id;
    initializeRoomIfReady(room);
    recordMove(room, `Pokój ${room.id} został utworzony.`);
    broadcastRoomState(room);
    callback?.({ ok: true, roomId: room.id });
  });

  socket.on('joinRoom', (roomIdInput: string, callback?: (response: { ok: boolean; roomId?: string; error?: string }) => void) => {
    const roomId = normalizeRoomId(roomIdInput);
    if (!roomId) {
      callback?.({ ok: false, error: 'Kod pokoju musi mieć 4-8 znaków A-Z lub 0-9.' });
      return;
    }

    const room = rooms[roomId];
    if (!room) {
      callback?.({ ok: false, error: 'Nie znaleziono pokoju. Poproś o nowe zaproszenie albo utwórz pokój.' });
      return;
    }

    if (isRoomFull(room) && !room.players.some((player) => player.id === socket.id)) {
      callback?.({ ok: false, error: 'Pokój jest już pełny.' });
      return;
    }

    if (!room.players.some((player) => player.id === socket.id) && room.players.length < 2) {
      room.players.push({
        id: socket.id,
        dream: [],
        dragonTokens: 0,
        totalPoints: 0,
        roundPoints: 0,
      });
      recordMove(room, 'Drugi gracz dołączył do pokoju.');
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    initializeRoomIfReady(room);
    if (room.turnPhase === 'CHOOSE_DRAW_SOURCE' && !room.currentTurnPlayerId) {
      room.currentTurnPlayerId = room.players[0]?.id ?? null;
    }
    broadcastRoomState(room);
    callback?.({ ok: true, roomId });
  });

  socket.on('drawCard', ({ source, openPileIndex }: { source: PendingDraw['source']; openPileIndex?: number }) => {
    const room = getRoomForSocket(socket);
    if (!room || !canCurrentPlayerAct(room, socket.id) || room.pendingDraw) {
      return;
    }

    const drawnCard = drawCard(room, source, openPileIndex);
    if (!drawnCard) {
      room.statusMessage = 'Nie udało się dobrać karty.';
      broadcastRoomState(room);
      return;
    }

    recordMove(room, source === 'OPEN' ? 'Dobrano kartę ze stosu odkrytego.' : 'Dobrano kartę z talii zakrytej.');

    room.pendingDraw = openPileIndex !== undefined
      ? { source, openPileIndex, card: { ...drawnCard, isFaceUp: true } }
      : { source, card: { ...drawnCard, isFaceUp: true } };
    room.turnPhase = 'CHOOSE_KEEP_OR_DISCARD';
    room.statusMessage = 'Zdecyduj, czy zachować kartę, czy odrzucić ją na stos odkryty.';
    broadcastRoomState(room);
  });

  socket.on('discardPendingDraw', ({ openPileIndex }: { openPileIndex: number }) => {
    const room = getRoomForSocket(socket);
    if (!room || room.currentTurnPlayerId !== socket.id || room.turnPhase !== 'CHOOSE_KEEP_OR_DISCARD' || !room.pendingDraw) {
      return;
    }

    discardCardToOpenPile(room, room.pendingDraw.card, 0);
    recordMove(room, 'Odrzucono dobraną kartę na stos odkryty.');
    room.pendingDraw = null;
    room.turnPhase = 'CHOOSE_DRAW_SOURCE';
    advanceTurn(room);
    broadcastRoomState(room);
  });

  socket.on('keepPendingDraw', ({ slotIndex }: { slotIndex: number }) => {
    const room = getRoomForSocket(socket);
    if (!room || room.currentTurnPlayerId !== socket.id || room.turnPhase !== 'CHOOSE_KEEP_OR_DISCARD' || !room.pendingDraw) {
      return;
    }

    const player = getCurrentPlayer(room);
    if (!player || slotIndex < 0 || slotIndex >= player.dream.length) {
      return;
    }

    const placedCard = room.pendingDraw.card;
    const replacedCard = placeCardInDream(room, socket.id, slotIndex, placedCard);

    if (!replacedCard) {
      room.pendingDraw = null;
      room.turnPhase = 'CHOOSE_DRAW_SOURCE';
      advanceTurn(room);
      broadcastRoomState(room);
      return;
    }

    // By default, when replacing a card in the dream, the replaced card goes on top of the open pile.
    // Circle has a custom flow (it sends the replaced card to the opponent), so skip the default in that case.
    if (placedCard.kind !== 'CIRCLE') {
      discardCardToOpenPile(room, replacedCard, 0);
    }

    room.pendingDraw = null;

    if (placedCard.kind === 'CIRCLE') {
      handleCircleCard(room, socket.id, slotIndex, replacedCard);
      recordMove(room, `Kruczy krąg: zamieniono kartę w slocie ${slotIndex + 1}.`);
      room.turnPhase = 'CHOOSE_DRAW_SOURCE';
      advanceTurn(room);
      maybeEnterScoring(room);
      broadcastRoomState(room);
      return;
    }

    if (placedCard.kind === 'NEST') {
      room.pendingNestSlot = slotIndex;
      room.turnPhase = 'CHOOSE_NEST_SWAP';
      room.statusMessage = 'Wybierz dwa dowolne sloty w swoim śnie do zamiany.';
      broadcastRoomState(room);
      return;
    }

    if (placedCard.kind === 'ATTACK') {
      room.pendingNestSlot = slotIndex;
      room.turnPhase = 'CHOOSE_REPLACE_SLOT';
      room.statusMessage = 'Wybierz slot przeciwnika, aby zamienić go z kartą ataku.';
      broadcastRoomState(room);
      return;
    }

    recordMove(room, `Włożono kartę do snu w slocie ${slotIndex + 1}.`);

    room.turnPhase = 'CHOOSE_DRAW_SOURCE';
    advanceTurn(room);
    maybeEnterScoring(room);
    broadcastRoomState(room);
  });

  socket.on('attackSwapCard', ({ ownSlotIndex, opponentSlotIndex }: { ownSlotIndex: number; opponentSlotIndex: number }) => {
    const room = getRoomForSocket(socket);
    const currentPlayer = room ? getCurrentPlayer(room) : null;
    const opponent = room ? getOpponent(room, socket.id) : null;

    if (!room || !currentPlayer || !opponent || room.currentTurnPlayerId !== socket.id || room.turnPhase !== 'CHOOSE_REPLACE_SLOT' || room.pendingNestSlot === null) {
      return;
    }

    // ownSlotIndex should NOT be the slot containing the ATTACK card
    if (ownSlotIndex === room.pendingNestSlot) {
      return;
    }

    if (!swapDreamCards(room, socket.id, ownSlotIndex, opponent.id, opponentSlotIndex)) {
      return;
    }

    recordMove(room, `Atak Kurka: zamieniono Twój slot ${ownSlotIndex + 1} z kartą przeciwnika.`);

    room.pendingNestSlot = null;
    room.turnPhase = 'CHOOSE_DRAW_SOURCE';
    advanceTurn(room);
    maybeEnterScoring(room);
    room.statusMessage = 'Atak Kurka wykonany.';
    broadcastRoomState(room);
  });

  socket.on('swapNestCards', ({ firstSlotIndex, secondSlotIndex }: { firstSlotIndex: number; secondSlotIndex: number }) => {
    const room = getRoomForSocket(socket);
    const player = getPlayer(room ?? undefined as never, socket.id);
    if (!room || !player || room.currentTurnPlayerId !== socket.id || room.turnPhase !== 'CHOOSE_NEST_SWAP' || room.pendingNestSlot === null) {
      return;
    }

    if (
      firstSlotIndex === secondSlotIndex ||
      firstSlotIndex < 0 ||
      secondSlotIndex < 0 ||
      firstSlotIndex >= player.dream.length ||
      secondSlotIndex >= player.dream.length
    ) {
      return;
    }

    // Perform swap (allow swapping including the slot where NEST was placed)
    [player.dream[firstSlotIndex], player.dream[secondSlotIndex]] = [player.dream[secondSlotIndex]!, player.dream[firstSlotIndex]!];
    recordMove(room, `Krucze gniazdo: zamieniono sloty ${firstSlotIndex + 1} i ${secondSlotIndex + 1}.`);
    room.pendingNestSlot = null;
    room.turnPhase = 'CHOOSE_DRAW_SOURCE';
    advanceTurn(room);
    maybeEnterScoring(room);
    broadcastRoomState(room);
  });

  socket.on('submitMirrorChoices', ({ choices }: { choices: Record<number, MirrorDirection> }) => {
    const room = getRoomForSocket(socket);
    if (!room || room.turnPhase !== 'ROUND_SCORING') {
      return;
    }

    room.scoringSubmissions[socket.id] = { choices };
    finalizeScoringIfReady(room);
    broadcastRoomState(room);
  });

  socket.on('chooseInitialReveal', ({ slotIndex }: { slotIndex: number }) => {
    const room = getRoomForSocket(socket);
    if (!room || room.turnPhase !== 'CHOOSE_INITIAL_REVEAL') return;

    const player = getPlayer(room, socket.id);
    if (!player || slotIndex < 0 || slotIndex >= player.dream.length) return;

    if (room.initialRevealSelections[socket.id] !== undefined) {
      return;
    }

    const alreadyFaceUp = player.dream.some((card) => card.isFaceUp);
    if (alreadyFaceUp) {
      return;
    }

    const card = player.dream[slotIndex];
    if (!card) return;
    card.isFaceUp = true;
    room.initialRevealSelections[socket.id] = slotIndex;
    recordMove(room, `Odsłonięto kartę początkową w slocie ${slotIndex + 1}.`);

    // If all players have at least one card face-up, start normal turn flow
    const allRevealed = room.players.every((p) => p.dream.some((c) => c.isFaceUp));
    if (allRevealed) {
      room.turnPhase = 'CHOOSE_DRAW_SOURCE';
      room.currentTurnPlayerId = room.nextStartingPlayerId ?? room.players[0]?.id ?? null;
      room.statusMessage = 'Wybierz źródło doboru karty.';
      room.nextStartingPlayerId = null;
      recordMove(room, 'Obaj gracze wybrali kartę startową. Rozpoczęto turę.');
    }

    broadcastRoomState(room);
  });

  socket.on('continueRound', () => {
    const room = getRoomForSocket(socket);
    if (!room || (room.turnPhase !== 'ROUND_RESULTS' && room.turnPhase !== 'GAME_OVER')) {
      return;
    }

    if (room.turnPhase === 'ROUND_RESULTS' && room.roundEnderPlayerId !== socket.id && room.nextStartingPlayerId !== socket.id) {
      return;
    }

    if (room.turnPhase === 'GAME_OVER') {
      room.players.forEach((player) => {
        player.dragonTokens = 0;
        player.totalPoints = 0;
        player.roundPoints = 0;
      });
      room.gameWinnerPlayerId = null;
      room.roundResults = null;
      room.roundEnderPlayerId = null;
      room.nextStartingPlayerId = null;
      room.statusMessage = 'Rozpoczyna się nowa gra.';
      startNewRound(room, room.players[0]?.id);
      recordMove(room, 'Rozpoczęto nową grę po zakończeniu poprzedniej.');
      broadcastRoomState(room);
      return;
    }

    prepareNextRound(room);
    recordMove(room, `Rozpoczyna się runda ${room.roundNumber}.`);
    broadcastRoomState(room);
  });

  socket.on('disconnect', () => {
    const room = getRoomForSocket(socket);
    if (!room) {
      return;
    }

    room.players = room.players.filter((player) => player.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[room.id];
      return;
    }

    resetRoundSelections(room);
    room.turnPhase = 'WAITING_FOR_PLAYERS';
    room.currentTurnPlayerId = null;
    room.pendingDraw = null;
    room.pendingNestSlot = null;
    room.roundEnderPlayerId = null;
    room.roundResults = null;
    room.statusMessage = 'Czekamy na drugiego gracza.';
    broadcastRoomState(room);
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));
