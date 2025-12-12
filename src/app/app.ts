import { Component } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  standalone: true,
  // VIKTIG: legg til RouterLink og NgIf her
  imports: [RouterOutlet, RouterLink, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  showHomeButton = true;

  constructor(private router: Router, private supabase: SupabaseService) {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const url = event.urlAfterRedirects;
        const isHome = url === '/';
        const isRound = url.startsWith('/round/');

        this.showHomeButton = !(isHome || isRound);
      }
    });
  }

  async ngOnInit() {}
}
