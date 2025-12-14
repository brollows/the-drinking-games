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

  private pollingInterval: any = null;

  constructor(
    private router: Router,
    private gameSession: GameSessionService,
    private player: PlayerService,
    private cdr: ChangeDetectorRef // 👈 ny
  ) {}

  ngOnInit(): void {
    this.session = this.gameSession.currentSession;
    this.playerName = this.player.getName();

    if (!this.session) {
      return;
    }

    this.loadPlayers();

    // 🔥 Start polling av spillere
    this.pollingInterval = setInterval(() => {
      this.loadPlayers();
    }, 500); // hvert 0.5 sekund
  }

  ngOnDestroy(): void {
    // 🧹 Rydd opp så vi ikke får memory leaks
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private async loadPlayers() {
    if (!this.session) return;

    try {
      // Hent både players og session-parallel
      const [players, session] = await Promise.all([
        this.gameSession.getPlayersForSession(this.session.id),
        this.gameSession.fetchSessionById(this.session.id),
      ]);

      // Oppdatér spillere hvis endret
      if (JSON.stringify(players) !== JSON.stringify(this.players)) {
        this.players = players;
        console.log('Players oppdatert:', this.players);
      }

      // Oppdatér session-lokalt (ny phase etc.)
      if (session) {
        this.session = session;
      }

      // Hvis phase er 'round' -> naviger til /round/:sessionId
      if (this.session && this.session.phase === 'round') {
        try {
          await this.router.navigate(['/round', this.session.id]);
        } catch {
          // ignorer navi-feil i polling
        }
      }

      // Tving rerender
      try {
        this.cdr.detectChanges();
      } catch {
        // kan feile hvis view er destroyed
      }
    } catch (e) {
      console.error('Kunne ikke hente players/session:', e);
    }
  }

  trackPlayer(index: number, player: Player) {
    return player.id;
  }

  getSessionCode() {
    if (!this.session?.joinCode) {
      return '';
    }
    return this.session.joinCode;
  }

  async onStartRound() {
    if (!this.session || this.showSettingsModal) {
      return;
    }

    try {
      // Oppdater state i databasen – dette er signalet til alle andre
      await this.gameSession.setSessionPhase(this.session.id, 'round');
      await this.gameSession.applyStartLivesToPlayers(this.session.id);
      await this.gameSession.startRound(this.session.id);

      // Host går direkte til round-siden
      await this.router.navigate(['/round', this.session.id]);
    } catch (e) {
      console.error('Kunne ikke starte runde:', e);
    }
  }

  showSettingsModal = false;

  startLivesDraft: number = 40; // default fallback
  startLivesMin = 1;
  startLivesMax = 200;

  openSettingsModal() {
    // ta verdi fra session hvis den finnes
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
      // refresh local session
      this.session = await this.gameSession.fetchSessionById(this.session.id);
      this.showSettingsModal = false;
    } catch (e) {
      console.error('Kunne ikke lagre settings:', e);
    }
  }
}
