import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameSession, GameSessionService, Player } from '../../services/game-session.service';
import { PlayerService } from '../../services/player.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

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

  private rtChannel: RealtimeChannel | null = null;

  // debounce
  private loadTimer: any = null;

  // optional failsafe (lav frekvens)
  private failsafeInterval: any = null;

  constructor(
    private router: Router,
    private gameSession: GameSessionService,
    private player: PlayerService,
    private cdr: ChangeDetectorRef,
    private supabase: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    this.session = this.gameSession.currentSession;
    this.playerName = this.player.getName();

    if (!this.session) return;

    await this.loadPlayers();

    this.setupRealtime();

    // failsafe: hvis realtime skulle dø i gratisoppsett/nettverk
    this.failsafeInterval = setInterval(() => {
      this.scheduleLoad(0);
    }, 20000);
  }

  async ngOnDestroy(): Promise<void> {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    if (this.failsafeInterval) clearInterval(this.failsafeInterval);
    await this.supabase.removeChannel(this.rtChannel);
    this.rtChannel = null;
  }

  private setupRealtime() {
    if (!this.session) return;

    const sessionId = this.session.id;

    // Én channel med flere "postgres_changes"
    this.rtChannel = this.supabase
      .createChannel(`play:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => this.scheduleLoad(50)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
        () => this.scheduleLoad(50)
      )
      .subscribe((status) => {
        console.log('[Realtime][play] status:', status);
      });
  }

  private scheduleLoad(ms: number = 80) {
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      this.loadTimer = null;
      this.loadPlayers();
    }, ms);
  }

  private async loadPlayers() {
    if (!this.session) return;

    try {
      const [players, session] = await Promise.all([
        this.gameSession.getPlayersForSession(this.session.id),
        this.gameSession.fetchSessionById(this.session.id),
      ]);

      // Oppdatér spillere hvis endret
      if (JSON.stringify(players) !== JSON.stringify(this.players)) {
        this.players = players;
        console.log('Players oppdatert:', this.players);
      }

      // Oppdatér session-lokalt
      if (session) this.session = session;

      // Hvis phase er 'round' -> naviger
      if (this.session && this.session.phase === 'round') {
        try {
          await this.router.navigate(['/round', this.session.id]);
        } catch {
          // ignore
        }
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

  showSettingsModal = false;

  startLivesDraft: number = 40;
  startLivesMin = 1;
  startLivesMax = 200;

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
