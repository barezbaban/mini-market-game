export interface Player {
  id: string;
  email: string;
  displayName: string;
}

export interface StoredPlayer extends Player {
  passwordHash: string;
}

export interface CreatePlayer {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface CreateSession {
  id: string;
  playerId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthStore {
  createPlayer(player: CreatePlayer): Promise<Player | null>;
  findPlayerByEmail(email: string): Promise<StoredPlayer | null>;
  findPlayerBySessionHash(tokenHash: string): Promise<Player | null>;
  createSession(session: CreateSession): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
  close?(): Promise<void>;
}
