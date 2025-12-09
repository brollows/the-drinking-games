import { Component } from '@angular/core';
import { NgIf, DatePipe } from '@angular/common';
import { GameSession, GameSessionService } from '../../services/game-session.service';
import { PlayerService } from '../../services/player.service';

@Component({
  selector: 'app-play',
  standalone: true,
  imports: [NgIf, DatePipe],
  templateUrl: './play.html',
  styleUrl: './play.css',
})
export class PlayComponent {
  session: GameSession | null = null;
  playerName: string | null = null;

  constructor(
    private gameSession: GameSessionService,
    private player: PlayerService
  ) {
    this.session = this.gameSession.currentSession;
    this.playerName = this.player.getName();
  }
}
