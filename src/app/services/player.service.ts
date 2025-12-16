import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private _name: string | null = null;
  private readonly STORAGE_KEY = 'playerName';

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (!this.isBrowser()) return;

    const saved = localStorage.getItem(this.STORAGE_KEY);
    const normalized = this.normalizeName(saved);

    if (normalized) {
      this._name = normalized;
    }
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private normalizeName(name: string | null | undefined): string | null {
    const n = (name ?? '').trim();
    return n.length ? n : null;
  }

  setName(name: string) {
    const normalized = this.normalizeName(name);
    this._name = normalized;

    if (!this.isBrowser()) return;

    if (normalized) {
      localStorage.setItem(this.STORAGE_KEY, normalized);
    } else {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  clearName() {
    this._name = null;
    if (this.isBrowser()) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  getName(): string | null {
    return this._name;
  }

  hasName(): boolean {
    return !!this._name;
  }
}
