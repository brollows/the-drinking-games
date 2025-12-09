import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private _name: string | null = null;

  constructor() {
    const saved = localStorage.getItem('playerName');
    if (saved) {
      this._name = saved;
    }
  }

  setName(name: string) {
    this._name = name;
    localStorage.setItem('playerName', name);
  }

  getName(): string | null {
    return this._name;
  }

  hasName(): boolean {
    return this._name !== null;
  }
}
