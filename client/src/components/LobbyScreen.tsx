type LobbyScreenProps = {
  isConnected: boolean;
  roomIdInput: string;
  lobbyMessage: string | null;
  shareMessage: string | null;
  onRoomIdChange: (value: string) => void;
  onJoinRoom: () => void;
  onCreateRoom: () => void;
  onShareInvite: () => void;
  onCopyInvite: () => void;
};

export function LobbyScreen({
  isConnected,
  roomIdInput,
  lobbyMessage,
  shareMessage,
  onRoomIdChange,
  onJoinRoom,
  onCreateRoom,
  onShareInvite,
  onCopyInvite,
}: LobbyScreenProps) {
  return (
    <div className="lobby-shell">
      <div className="lobby-card">
        <p className={`connection-pill ${isConnected ? 'online' : 'offline'}`}>
          {isConnected ? 'Połączono z serwerem' : 'Brak połączenia z serwerem'}
        </p>
        <h1>Smoki</h1>
        {lobbyMessage ? <p className="lobby-message">{lobbyMessage}</p> : null}
        {shareMessage ? <p className="lobby-message success">{shareMessage}</p> : null}
        <div className="join-form">
          <label htmlFor="roomId">Kod pokoju</label>
          <div className="join-row">
            <input
              id="roomId"
              type="text"
              placeholder="Wpisz kod pokoju"
              value={roomIdInput}
              onChange={(event) => onRoomIdChange(event.target.value)}
            />
            <button type="button" onClick={onJoinRoom}>
              Wejdź do gry
            </button>
          </div>
          <div className="join-row secondary-actions">
            <button type="button" className="secondary-button" onClick={onCreateRoom}>
              Stwórz pokój
            </button>
            <button type="button" className="secondary-button" onClick={onShareInvite}>
              Udostępnij
            </button>
            <button type="button" className="secondary-button" onClick={onCopyInvite}>
              Kopiuj zaproszenie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
