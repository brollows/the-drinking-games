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

  onStartGame(playerName: string) {
    const trimmed = playerName?.trim();

    if (!trimmed) {
      alert('Skriv inn et spillernavn først 🙃');
      return;
    }

    // lagre spillernavnet både i minnet og localStorage
    this.player.setName(trimmed);

    // Opprett host-session (lokalt nå, Supabase senere)
    this.gameSession.createHostSession(trimmed);

    // Naviger til spillskjermen
    this.router.navigate(['/play']);
  }

  onJoinGame(playerName: string) {
    const trimmed = playerName?.trim();

    if (!trimmed) {
      alert('Skriv inn et spillernavn først 🙃');
      return;
    }

    // Også her lagrer vi navnet, så det er tilgjengelig videre
    this.player.setName(trimmed);

    // TODO: senere: gå til /join eller lignende
    alert('Join-spill logikken kommer senere 😄');
  }
}
