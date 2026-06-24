import {} from './types.js';
function shuffleDeck(deck) {
    const shuffledDeck = [...deck];
    for (let index = shuffledDeck.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffledDeck[index], shuffledDeck[randomIndex]] = [shuffledDeck[randomIndex], shuffledDeck[index]];
    }
    return shuffledDeck;
}
function createCard(kind, value, id) {
    return {
        id,
        kind,
        value,
        isFaceUp: false,
    };
}
export function createDeck() {
    const deck = [];
    let idCounter = 1;
    for (const value of [-2, 0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        for (let copy = 0; copy < 4; copy += 1) {
            deck.push(createCard('NUMBER', value, `card-${idCounter++}`));
        }
    }
    for (let copy = 0; copy < 3; copy += 1) {
        deck.push(createCard('MIRROR', 0, `card-${idCounter++}`));
        deck.push(createCard('CIRCLE', 10, `card-${idCounter++}`));
        deck.push(createCard('NEST', 9, `card-${idCounter++}`));
        deck.push(createCard('ATTACK', 9, `card-${idCounter++}`));
    }
    return shuffleDeck(deck);
}
function cloneCard(card) {
    return { ...card };
}
function serializePendingDraw(pendingDraw) {
    if (!pendingDraw) {
        return null;
    }
    return {
        source: pendingDraw.source,
        ...(pendingDraw.openPileIndex !== undefined ? { openPileIndex: pendingDraw.openPileIndex } : {}),
        id: pendingDraw.card.id,
        isFaceUp: true,
        kind: pendingDraw.card.kind,
        value: pendingDraw.card.value,
    };
}
export function replenishDeckFromDiscard(room) {
    if (room.hiddenDeck.length > 0) {
        return;
    }
    const collectedCards = room.openPiles.flat();
    if (collectedCards.length === 0) {
        return;
    }
    room.hiddenDeck = shuffleDeck(collectedCards.map((card) => ({ ...card, isFaceUp: false })));
    room.openPiles = [[]];
    const firstOpen = room.hiddenDeck.pop();
    if (firstOpen) {
        firstOpen.isFaceUp = true;
        room.openPiles[0] = [firstOpen];
    }
}
function dealDream(player, deck) {
    player.dream = deck.splice(0, 6).map(cloneCard);
}
export function startNewRound(room, startingPlayerId) {
    room.hiddenDeck = createDeck();
    room.openPiles = [[]];
    room.pendingDraw = null;
    room.pendingNestSlot = null;
    room.roundEnderPlayerId = null;
    room.roundResults = null;
    room.scoringSubmissions = {};
    room.initialRevealSelections = {};
    room.gameWinnerPlayerId = null;
    room.turnPhase = room.players.length < 2 ? 'WAITING_FOR_PLAYERS' : 'CHOOSE_INITIAL_REVEAL';
    room.statusMessage = room.players.length < 2 ? 'Czekamy na drugiego gracza.' : 'Wybierz kartę, którą odsłonisz na początku rundy.';
    room.players.forEach((player) => {
        dealDream(player, room.hiddenDeck);
        player.roundPoints = 0;
    });
    const firstOpen = room.hiddenDeck.pop();
    if (firstOpen) {
        firstOpen.isFaceUp = true;
        room.openPiles[0] = [firstOpen];
    }
    room.currentTurnPlayerId = null;
    room.nextStartingPlayerId = startingPlayerId ?? room.players[0]?.id ?? null;
    room.roundNumber += 1;
}
export function initializeRoomIfReady(room) {
    if (room.players.length !== 2 || room.currentTurnPlayerId !== null) {
        return;
    }
    startNewRound(room, room.players[0]?.id);
}
function getPlayerScore(room, player, choices) {
    const effectiveValues = player.dream.map((card, index) => {
        if (card.kind !== 'MIRROR') {
            return card.value;
        }
        const direction = choices?.choices[index] ?? inferMirrorDirection(player.dream, index);
        const neighborIndex = direction === 'LEFT' ? index - 1 : index + 1;
        const neighbor = player.dream[neighborIndex];
        if (!neighbor) {
            return 0;
        }
        if (neighbor.kind === 'MIRROR') {
            return getMirrorValue(player.dream, neighborIndex, choices, new Set([index]));
        }
        return neighbor.value;
    });
    const zeroed = new Set();
    for (let column = 0; column < 3; column += 1) {
        const topIndex = column;
        const bottomIndex = column + 3;
        const topCard = player.dream[topIndex];
        const bottomCard = player.dream[bottomIndex];
        if (!topCard || !bottomCard) {
            continue;
        }
        const topValue = effectiveValues[topIndex];
        const bottomValue = effectiveValues[bottomIndex];
        if (topValue === bottomValue) {
            if (topCard.kind !== 'MIRROR') {
                zeroed.add(topIndex);
            }
            if (bottomCard.kind !== 'MIRROR') {
                zeroed.add(bottomIndex);
            }
        }
    }
    return effectiveValues.reduce((sum, value, index) => sum + (zeroed.has(index) ? 0 : value), 0);
}
function inferMirrorDirection(dream, slotIndex) {
    const rowStart = slotIndex < 3 ? 0 : 3;
    const col = slotIndex % 3;
    const leftIndex = col > 0 ? slotIndex - 1 : null;
    const rightIndex = col < 2 ? slotIndex + 1 : null;
    if (leftIndex !== null && dream[leftIndex])
        return 'LEFT';
    if (rightIndex !== null && dream[rightIndex])
        return 'RIGHT';
    return 'LEFT';
}
function getMirrorValue(dream, slotIndex, choices, visiting) {
    if (visiting.has(slotIndex)) {
        return 0;
    }
    const card = dream[slotIndex];
    if (!card) {
        return 0;
    }
    if (card.kind !== 'MIRROR') {
        return card.value;
    }
    visiting.add(slotIndex);
    // Prefer vertical neighbor in the same column (top<->bottom) — mirrors should copy the
    // card in the same column when available. This fixes cases where both bottom mirrors
    // should copy the top card (e.g. -2) in the same column.
    const verticalIndex = slotIndex < 3 ? slotIndex + 3 : slotIndex - 3;
    const verticalNeighbor = dream[verticalIndex];
    if (verticalNeighbor) {
        const value = verticalNeighbor.kind === 'MIRROR'
            ? getMirrorValue(dream, verticalIndex, choices, visiting)
            : verticalNeighbor.value;
        visiting.delete(slotIndex);
        return value;
    }
    // Fallback to horizontal choice (LEFT/RIGHT) when no vertical neighbor exists.
    let direction = choices?.choices[slotIndex];
    const col = slotIndex % 3;
    const leftIndex = col > 0 ? slotIndex - 1 : null;
    const rightIndex = col < 2 ? slotIndex + 1 : null;
    if (direction === 'LEFT' && leftIndex === null) {
        direction = rightIndex !== null ? 'RIGHT' : inferMirrorDirection(dream, slotIndex);
    }
    if (direction === 'RIGHT' && rightIndex === null) {
        direction = leftIndex !== null ? 'LEFT' : inferMirrorDirection(dream, slotIndex);
    }
    if (!direction) {
        direction = inferMirrorDirection(dream, slotIndex);
    }
    const neighborIndex = direction === 'LEFT' ? slotIndex - 1 : slotIndex + 1;
    const neighbor = dream[neighborIndex];
    if (!neighbor) {
        visiting.delete(slotIndex);
        return 0;
    }
    const value = neighbor.kind === 'MIRROR'
        ? getMirrorValue(dream, neighborIndex, choices, visiting)
        : neighbor.value;
    visiting.delete(slotIndex);
    return value;
}
export function calculateRoundResults(room) {
    return room.players.map((player) => {
        const score = getPlayerScore(room, player, room.scoringSubmissions[player.id]);
        return {
            playerId: player.id,
            points: score,
            roundWinner: false,
            dragonTokens: player.dragonTokens,
            totalPoints: player.totalPoints,
        };
    });
}
export function revealAllDreams(room) {
    room.players.forEach((player) => {
        player.dream.forEach((card) => {
            card.isFaceUp = true;
        });
    });
}
export function isDreamComplete(player) {
    return player.dream.every((card) => card.isFaceUp);
}
export function getNextPlayerId(room, currentPlayerId) {
    const index = room.players.findIndex((player) => player.id === currentPlayerId);
    if (index === -1 || room.players.length === 0) {
        return null;
    }
    return room.players[(index + 1) % room.players.length]?.id ?? null;
}
export function setRoundResults(room) {
    const results = calculateRoundResults(room);
    const minPoints = Math.min(...results.map((result) => result.points));
    const winners = results.filter((result) => result.points === minPoints);
    results.forEach((result) => {
        const player = room.players.find((entry) => entry.id === result.playerId);
        if (!player) {
            return;
        }
        player.roundPoints = result.points;
        player.totalPoints += result.points;
        if (result.points === minPoints) {
            player.dragonTokens += 1;
        }
    });
    room.roundResults = results.map((result) => ({
        ...result,
        roundWinner: result.points === minPoints,
        dragonTokens: room.players.find((player) => player.id === result.playerId)?.dragonTokens ?? result.dragonTokens,
        totalPoints: room.players.find((player) => player.id === result.playerId)?.totalPoints ?? result.totalPoints,
    }));
    const gameWinner = room.players.find((player) => player.dragonTokens >= 3) ?? null;
    room.gameWinnerPlayerId = gameWinner?.id ?? null;
    room.turnPhase = gameWinner ? 'GAME_OVER' : 'ROUND_RESULTS';
    room.statusMessage = gameWinner
        ? 'Ktoś zdobył 3 żetony smoka. Gra zakończona.'
        : winners.length > 1
            ? 'Remis w rundzie. Remisujący gracze otrzymują żeton smoka.'
            : 'Runda zakończona. Zwycięzca bierze żeton smoka.';
    return room.roundResults;
}
export function prepareNextRound(room) {
    if (room.turnPhase !== 'ROUND_RESULTS' || !room.roundEnderPlayerId) {
        return;
    }
    const nextStarterId = getNextPlayerId(room, room.roundEnderPlayerId) ?? room.players[0]?.id ?? null;
    room.nextStartingPlayerId = nextStarterId;
    startNewRound(room, nextStarterId ?? undefined);
}
export function getFilteredGameState(room, targetPlayerId) {
    return {
        roomId: room.id,
        hiddenDeckCount: room.hiddenDeck.length,
        openPiles: room.openPiles,
        currentTurnPlayerId: room.currentTurnPlayerId,
        turnPhase: room.turnPhase,
        pendingDraw: room.currentTurnPlayerId === targetPlayerId ? serializePendingDraw(room.pendingDraw) : null,
        pendingNestSlot: room.currentTurnPlayerId === targetPlayerId ? room.pendingNestSlot : null,
        roundEnderPlayerId: room.roundEnderPlayerId,
        roundResults: room.roundResults,
        gameWinnerPlayerId: room.gameWinnerPlayerId,
        roundNumber: room.roundNumber,
        statusMessage: room.statusMessage,
        initialRevealSelections: room.initialRevealSelections,
        moveHistory: room.moveHistory,
        players: room.players.map((p) => ({
            id: p.id,
            isMe: p.id === targetPlayerId,
            dragonTokens: p.dragonTokens,
            totalPoints: p.totalPoints,
            roundPoints: p.roundPoints,
            dream: p.dream.map((card) => {
                if (card.isFaceUp) {
                    return { id: card.id, isFaceUp: card.isFaceUp, kind: card.kind, value: card.value };
                }
                return { id: card.id, isFaceUp: card.isFaceUp, kind: card.kind };
            }),
        })),
    };
}
//# sourceMappingURL=gameLogic.js.map