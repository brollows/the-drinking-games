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
  ) { }

  async onStartGame(playerName: string) {
    if (!playerName?.trim()) {
      alert('Skriv inn et spillernavn først 🙃');
      return;
    }

    try {
      this.player.setName(playerName);

      const session = await this.gameSession.createHostSession(playerName.trim());

      // Her kan du f.eks. lagre joinCode i PlayerService eller bare logge:
      console.log('Session opprettet med kode:', session.joinCode);

      this.router.navigate(['/play']);
    } catch (e) {
      console.error(e);
      alert('Klarte ikke å opprette spill. Prøv igjen 🥲');
    }
  }


  async onJoinGame(playerName: string, joinCode: string) {
    const normalizedCode = joinCode.trim().toUpperCase();
    const trimmedName = playerName.trim();

    if (!normalizedCode || !trimmedName) {
      throw new Error('Mangler kode eller navn');
    }

    try {
      const session = await this.gameSession.joinSession(normalizedCode, playerName);
      this.player.setName(playerName);
      console.log('Joinet session:', session);
      this.router.navigate(['/play']);
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? 'Kunne ikke bli med på spillet 🥲');
    }
  }

  getPlayerName() {
    if (!this.player.hasName()) {
      return '';
    }
    return this.player.getName();
  }
}
