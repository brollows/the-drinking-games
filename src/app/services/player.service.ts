import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private _name: string | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (this.isBrowser()) {
      const saved = localStorage.getItem('playerName');
      if (saved) {
        this._name = saved;
      }
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

  getName(): string | null {
    return this._name;
  }

  hasName(): boolean {
    return this._name !== null;
  }
}
