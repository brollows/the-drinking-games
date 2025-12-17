import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameSession, GameSessionService, Player } from '../../services/game-session.service';
import { PlayerService } from '../../services/player.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './play.html',
  styleUrl: './play.css',
})
export class PlayComponent implements OnInit, OnDestroy {
  session: GameSession | null = null;
  playerName: string | null = null;
  players: Player[] = [];

  showSettingsModal = false;

  startLivesDraft: number = 40;
  startLivesMin = 1;
  startLivesMax = 200;

  private unsubPlayers: (() => void) | null = null;
  private unsubSession: (() => void) | null = null;

  private safetyResyncTimer: any = null;
  private lastLoadAt = 0;

  constructor(
    private router: Router,
    private gameSession: GameSessionService,
    private player: PlayerService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.session = this.gameSession.currentSession;
    this.playerName = this.player.getName();

    if (!this.session) return;

    this.loadPlayersAndSession();

    this.unsubPlayers = this.gameSession.subscribeToPlayers(this.session.id, () => {
      this.loadPlayersAndSessionThrottled(150);
    });

    this.unsubSession = this.gameSession.subscribeToSession(this.session.id, () => {
      this.loadPlayersAndSessionThrottled(150);
    });

    this.safetyResyncTimer = setInterval(() => {
      this.loadPlayersAndSessionThrottled(0);
    }, 7000);
  }

  ngOnDestroy(): void {
    if (this.unsubPlayers) this.unsubPlayers();
    if (this.unsubSession) this.unsubSession();
    if (this.safetyResyncTimer) clearInterval(this.safetyResyncTimer);
  }

  private loadPlayersAndSessionThrottled(minDelayMs: number) {
    const now = Date.now();
    if (now - this.lastLoadAt < minDelayMs) return;
    this.loadPlayersAndSession();
  }

  private async loadPlayersAndSession() {
    if (!this.session) return;

    this.lastLoadAt = Date.now();

    try {
      const [players, session] = await Promise.all([
        this.gameSession.getPlayersForSession(this.session.id),
        this.gameSession.fetchSessionById(this.session.id),
      ]);

      if (players) this.players = players;
      if (session) this.session = session;

      if (this.session && this.session.phase === 'round') {
        try {
          await this.router.navigate(['/round', this.session.id]);
        } catch {}
      }

      try {
        this.cdr.detectChanges();
      } catch {}
    } catch (e) {
      console.error('Kunne ikke hente players/session:', e);
    }
  }

  trackPlayer(index: number, player: Player) {
    return player.id;
  }

  getSessionCode() {
    return this.session?.joinCode ?? '';
  }

  async onStartRound() {
    if (!this.session || this.showSettingsModal) return;

    try {
      await this.gameSession.setSessionPhase(this.session.id, 'round');
      await this.gameSession.applyStartLivesToPlayers(this.session.id);
      await this.gameSession.startRound(this.session.id);

      await this.router.navigate(['/round', this.session.id]);
    } catch (e) {
      console.error('Kunne ikke starte runde:', e);
    }
  }

  openSettingsModal() {
    this.startLivesDraft = this.session?.startLives ?? 40;
    this.showSettingsModal = true;
  }

  closeSettingsModal() {
    this.showSettingsModal = false;
  }

  async saveSettings() {
    if (!this.session) return;

    const v = Math.max(
      this.startLivesMin,
      Math.min(this.startLivesMax, Number(this.startLivesDraft) || 40)
    );

    try {
      await this.gameSession.setStartLives(this.session.id, v);
      this.session = await this.gameSession.fetchSessionById(this.session.id);
      this.showSettingsModal = false;
    } catch (e) {
      console.error('Kunne ikke lagre settings:', e);
    }
  }
}
