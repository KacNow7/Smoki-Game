import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameBoard } from './components/GameBoard';
import { LobbyScreen } from './components/LobbyScreen';
import type { ClientGameState, DrawSource } from './gameTypes';
import './App.css';

const VITE_SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
const socket: Socket = io(VITE_SOCKET_URL);
const roomCodePattern = /^[A-Z0-9]{4,8}$/;

function normalizeRoomCode(input: string): string | null {
  const roomCode = input.trim().toUpperCase();
  return roomCodePattern.test(roomCode) ? roomCode : null;
}

function buildInviteLink(roomCode: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [lobbyMessage, setLobbyMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedNestSlots, setSelectedNestSlots] = useState<number[]>([]);

  useEffect(() => {
    setIsConnected(socket.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onGameState = (state: ClientGameState) => {
      setGameState(state);
      setSelectedSlot(null);
      setSelectedNestSlots([]);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('gameState', onGameState);

    const roomFromUrl = new URL(window.location.href).searchParams.get('room');
    if (roomFromUrl) {
      const normalizedRoom = normalizeRoomCode(roomFromUrl);
      if (normalizedRoom) {
        setRoomIdInput(normalizedRoom);
        socket.emit('joinRoom', normalizedRoom, (response: { ok: boolean; error?: string }) => {
          if (!response?.ok) {
            setLobbyMessage(response?.error ?? 'Nie udało się dołączyć do pokoju z linku.');
          }
        });
      }
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('gameState', onGameState);
    };
  }, []);

  const me = useMemo(() => gameState?.players.find((player) => player.isMe) ?? null, [gameState]);
  const opponent = useMemo(() => gameState?.players.find((player) => !player.isMe) ?? null, [gameState]);
  const isMyTurn = gameState?.currentTurnPlayerId === me?.id;
  const currentPlayerDream = me?.dream ?? [];
  const opponentDream = opponent?.dream ?? [];
  const activeRoundResult = gameState?.roundResults ?? null;
  const continueRoundAcknowledgements = gameState?.continueRoundAcknowledgements ?? {};
  const continueRoundAcceptedCount = Object.keys(continueRoundAcknowledgements).length;
  const continueRoundTotalCount = gameState?.players.length ?? 0;
  const meAcceptedContinue = me ? Boolean(continueRoundAcknowledgements[me.id]) : false;
  
  // Zmienne sterujące widocznością okien pop-up
  const isRoundResultsOverlayVisible = gameState?.turnPhase === 'ROUND_RESULTS';
  const isGameOverOverlayVisible = gameState?.turnPhase === 'GAME_OVER';

  const joinRoom = () => {
    const roomCode = normalizeRoomCode(roomIdInput);
    if (!roomCode) {
      setLobbyMessage('Kod pokoju musi mieć 4-8 znaków A-Z lub 0-9.');
      return;
    }

    socket.emit('joinRoom', roomCode, (response: { ok: boolean; error?: string }) => {
      if (!response?.ok) {
        setLobbyMessage(response?.error ?? 'Nie udało się dołączyć do pokoju.');
        return;
      }

      setLobbyMessage(null);
      setShareMessage(null);
    });
  };

  const createRoom = () => {
    socket.emit('createRoom', null, (response: { ok: boolean; roomId?: string; error?: string }) => {
      if (!response?.ok || !response.roomId) {
        setLobbyMessage(response?.error ?? 'Nie udało się utworzyć pokoju.');
        return;
      }

      setRoomIdInput(response.roomId);
      setLobbyMessage(null);
      setShareMessage(`Pokój ${response.roomId} utworzony. Możesz wysłać zaproszenie.`);
    });
  };

  const copyInvite = async () => {
    const roomCode = gameState?.roomId ?? normalizeRoomCode(roomIdInput);
    if (!roomCode) {
      setShareMessage('Najpierw utwórz albo dołącz do pokoju.');
      return;
    }

    const inviteLink = buildInviteLink(roomCode);
    try {
      await navigator.clipboard.writeText(inviteLink);
      setShareMessage('Link zaproszenia skopiowany do schowka.');
    } catch {
      setShareMessage(`Skopiuj ręcznie: ${inviteLink}`);
    }
  };

  const shareInvite = async () => {
    const roomCode = gameState?.roomId ?? normalizeRoomCode(roomIdInput);
    if (!roomCode) {
      setShareMessage('Najpierw utwórz albo dołącz do pokoju.');
      return;
    }

    const inviteLink = buildInviteLink(roomCode);
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Smoki',
          text: `Dołącz do gry w pokoju ${roomCode}`,
          url: inviteLink,
        });
        setShareMessage('Otworzono systemowe udostępnianie zaproszenia.');
        return;
      } catch {
        // Fall back to clipboard below.
      }
    }

    await copyInvite();
  };

  const drawCard = (source: DrawSource, openPileIndex?: number) => {
    socket.emit('drawCard', { source, openPileIndex });
  };

  const chooseInitialReveal = (slotIndex: number) => {
    socket.emit('chooseInitialReveal', { slotIndex });
  };

  const keepCard = (slotIndex: number) => {
    socket.emit('keepPendingDraw', { slotIndex });
  };

  const discardCard = () => {
    socket.emit('discardPendingDraw', { openPileIndex: 0 });
  };

  const swapNest = () => {
    if (selectedNestSlots.length !== 2) {
      return;
    }
    socket.emit('swapNestCards', { firstSlotIndex: selectedNestSlots[0], secondSlotIndex: selectedNestSlots[1] });
  };

  const attackSwap = (opponentSlotIndex: number) => {
    const ownSlotIndex = selectedSlot;
    if (ownSlotIndex === null || ownSlotIndex === undefined) return;
    socket.emit('attackSwapCard', { ownSlotIndex, opponentSlotIndex });
  };

  const continueRound = () => {
    socket.emit('continueRound');
  };

  const returnToLobby = () => {
    window.location.reload();
  };

  const toggleNestSlot = (slotIndex: number) => {
    setSelectedNestSlots((current) => {
      if (current.includes(slotIndex)) {
        return current.filter((entry) => entry !== slotIndex);
      }

      if (current.length === 2) {
        return [current[1], slotIndex];
      }

      return [...current, slotIndex];
    });
  };

  if (!gameState) {
    return (
      <LobbyScreen
        isConnected={isConnected}
        roomIdInput={roomIdInput}
        lobbyMessage={lobbyMessage}
        shareMessage={shareMessage}
        onRoomIdChange={setRoomIdInput}
        onJoinRoom={joinRoom}
        onCreateRoom={createRoom}
        onShareInvite={shareInvite}
        onCopyInvite={copyInvite}
      />
    );
  }

  return (
    <div className="game-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Pokój {gameState.roomId} · Runda {gameState.roundNumber}</p>
          <h1>Smoki</h1>
        </div>
        <div className="status-stack">
          <span className={`connection-pill ${isConnected ? 'online' : 'offline'}`}>
            {isConnected ? 'Online' : 'Offline'}
          </span>
          <div className="status-actions">
            <button type="button" className="secondary-button" onClick={shareInvite}>
              Udostępnij kod gry
            </button>
            <button type="button" className="secondary-button" onClick={copyInvite}>
              Kopiuj zaproszenie
            </button>
          </div>
        </div>
      </header>

      <section className="board">
        <GameBoard
          gameState={gameState}
          isMyTurn={isMyTurn}
          me={me}
          opponent={opponent}
          selectedSlot={selectedSlot}
          selectedNestSlots={selectedNestSlots}
          onSetSelectedSlot={setSelectedSlot}
          onChooseInitialReveal={chooseInitialReveal}
          onToggleNestSlot={toggleNestSlot}
          onDrawCard={drawCard}
          onKeepCard={keepCard}
          onDiscardCard={discardCard}
          onSwapNest={swapNest}
          onAttackSwap={attackSwap}
          onContinueRound={continueRound}
          currentPlayerDream={currentPlayerDream}
          opponentDream={opponentDream}
          activeRoundResult={activeRoundResult}
        />
      </section>

      {/* OKNO: KONIEC RUNDY */}
      {isRoundResultsOverlayVisible ? (
        <div className="game-over-overlay" role="dialog" aria-modal="true" aria-labelledby="round-over-title">
          <div className="game-over-panel panel-card">
            <p className="eyebrow">Koniec rundy</p>
            <h2 id="round-over-title">Wyniki rundy {gameState.roundNumber}</h2>
            <div className="game-over-results">
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
            <div className="game-over-stats">
              {gameState.players.map((player) => (
                <div key={player.id} className="game-over-stat">
                  <span>{player.isMe ? 'Ty' : 'Przeciwnik'}</span>
                  <strong>{player.totalPoints} pkt · {player.dragonTokens} żetonów</strong>
                </div>
              ))}
            </div>
            <div className="game-over-actions">
              <div className="pending-actions">
                <button type="button" className="primary-button" onClick={continueRound} disabled={meAcceptedContinue}>
                  {meAcceptedContinue ? 'Czekasz na drugiego gracza' : 'Następna runda'}
                </button>
                <span className="badge">
                  Potwierdziło {continueRoundAcceptedCount}/{continueRoundTotalCount || 2} graczy
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* OKNO: KONIEC GRY */}
      {isGameOverOverlayVisible ? (
        <div className="game-over-overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <div className="game-over-panel panel-card">
            <p className="eyebrow">Koniec gry</p>
            <h2 id="game-over-title">Ostateczne wyniki</h2>
            <div className="game-over-stats">
              {(() => {
                const minPoints = Math.min(...gameState.players.map(p => p.totalPoints));
                
                return gameState.players.map((player) => {
                  // Wygrywa ten, kogo punkty są równe najniższemu wynikowi (działa też przy remisie)
                  const isWinner = player.totalPoints === minPoints;
                  
                  return (
                    <div key={player.id} className={`game-over-stat ${isWinner ? 'winner' : ''}`}>
                      <span>{player.isMe ? 'Ty' : 'Przeciwnik'} {isWinner && ' 🏆'}</span>
                      <strong>{player.totalPoints} pkt · {player.dragonTokens} żetonów</strong>
                    </div>
                  )
                });
              })()}
            </div>
            <div className="game-over-actions">
              <div className="pending-actions">
                <button type="button" className="primary-button" onClick={continueRound} disabled={meAcceptedContinue}>
                  {meAcceptedContinue ? 'Czekasz na drugiego gracza' : 'Nowa gra'}
                </button>
                <button type="button" className="secondary-button" onClick={returnToLobby}>
                  Wróć do lobby
                </button>
                <span className="badge">
                  Potwierdziło {continueRoundAcceptedCount}/{continueRoundTotalCount || 2} graczy
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;