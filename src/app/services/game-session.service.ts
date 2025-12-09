import { Injectable } from '@angular/core';

export interface GameSession {
  joinCode: string;
  hostName: string;
  createdAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class GameSessionService {
  private _currentSession: GameSession | null = null;

  get currentSession(): GameSession | null {
    return this._currentSession;
  }

  createHostSession(hostName: string): GameSession {
    const joinCode = this.generateJoinCode();

    this._currentSession = {
      joinCode,
      hostName,
      createdAt: new Date(),
    };

    console.log('Ny session opprettet:', this._currentSession);
    return this._currentSession;
  }

  private generateJoinCode(length: number = 4): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';

    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
  }
}
      