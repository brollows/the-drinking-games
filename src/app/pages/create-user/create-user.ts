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
    const trimmedName = (playerName ?? '').trim();
    if (!trimmedName) {
      alert('Skriv inn et spillernavn først 🙃');
      return;
    }

    try {
      this.player.setName(trimmedName);

      const session = await this.gameSession.createHostSession(trimmedName);

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
      alert('Mangler kode eller navn');
      return;
    }

    try {
      const session = await this.gameSession.joinSession(normalizedCode, trimmedName);

      this.player.setName(trimmedName);

      console.log('Joinet session:', session);

      this.router.navigate(['/play']);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? 'Kunne ikke bli med på spillet 🥲');
    }
  }

  getPlayerName() {
    if (!this.player.hasName()) return '';
    return this.player.getName();
  }
}
