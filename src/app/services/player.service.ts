import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type PlayerIdentity = {
  playerId: string | null;
  sessionId: string | null;
  isHost: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private _name: string | null = null;
  private _playerId: string | null = null;
  private _sessionId: string | null = null;
  private _isHost: boolean = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (this.isBrowser()) {
      const savedName = localStorage.getItem('playerName');
      const savedPlayerId = localStorage.getItem('playerId');
      const savedSessionId = localStorage.getItem('sessionId');
      const savedIsHost = localStorage.getItem('isHost');

      if (savedName) this._name = savedName;
      if (savedPlayerId) this._playerId = savedPlayerId;
      if (savedSessionId) this._sessionId = savedSessionId;
      if (savedIsHost) this._isHost = savedIsHost === '1';
    }
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  setName(name: string) {
    this._name = name;

    if (this.isBrowser()) {
      localStorage.setItem('playerName', name);
    }
  }

  setIdentity(identity: PlayerIdentity) {
    this._playerId = identity.playerId;
    this._sessionId = identity.sessionId;
    this._isHost = identity.isHost;

    if (this.isBrowser()) {
      if (identity.playerId) localStorage.setItem('playerId', identity.playerId);
      if (identity.sessionId) localStorage.setItem('sessionId', identity.sessionId);
      localStorage.setItem('isHost', identity.isHost ? '1' : '0');
    }
  }

  getName(): string | null {
    return this._name;
  }

  hasName(): boolean {
    return this._name !== null && this._name.trim().length > 0;
  }

  getPlayerId(): string | null {
    return this._playerId;
  }

  getSessionId(): string | null {
    return this._sessionId;
  }

  isHost(): boolean {
    return this._isHost;
  }

  clearIdentity() {
    this._playerId = null;
    this._sessionId = null;
    this._isHost = false;

    if (this.isBrowser()) {
      localStorage.removeItem('playerId');
      localStorage.removeItem('sessionId');
      localStorage.removeItem('isHost');
    }
  }
}
