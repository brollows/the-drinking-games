import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GameSessionService } from '../../services/game-session.service';
import { PlayerService } from '../../services/player.service';

@Component({
  selector: 'app-create-user',
  standalone: true,
  imports: [],
  templateUrl: './create-user.html',
  styleUrl: './create-user.css',
})
export class CreateUserComponent {
  constructor(
    private router: Router,
    private gameSession: GameSessionService,
    private player: PlayerService
  ) {}

  async onStartGame(playerName: string) {
    const trimmed = (playerName ?? '').trim();
    if (!trimmed) {
      alert('Skriv inn et spillernavn først 🙃');
      return;
    }

    try {
      this.player.setName(trimmed);

      const session = await this.gameSession.createHostSession(trimmed);

      const me = this.gameSession.currentPlayer;
      if (me) {
        this.player.setIdentity({
          playerId: me.id,
          sessionId: session.id,
          isHost: true,
        });
      }

      console.log('Session opprettet med kode:', session.joinCode);
      this.router.navigate(['/play']);
    } catch (e) {
      console.error(e);
      alert('Klarte ikke å opprette spill. Prøv igjen 🥲');
    }
  }

  async onJoinGame(playerName: string, joinCode: string) {
    const normalizedCode = (joinCode ?? '').trim().toUpperCase();
    const trimmedName = (playerName ?? '').trim();

    if (!normalizedCode || !trimmedName) {
      throw new Error('Mangler kode eller navn');
    }

    try {
      const session = await this.gameSession.joinSession(normalizedCode, trimmedName);

      this.player.setName(trimmedName);

      const me = this.gameSession.currentPlayer;
      if (me) {
        this.player.setIdentity({
          playerId: me.id,
          sessionId: session.id,
          isHost: false,
        });
      }

      console.log('Joinet session:', session);
      this.router.navigate(['/play']);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? 'Kunne ikke bli med på spillet 🥲');
    }
  }

  getPlayerName() {
    return this.player.getName() ?? '';
  }
}
