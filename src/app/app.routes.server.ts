import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Runde-siden må IKKE prerendres
  {
    path: 'round/:sessionId',
    renderMode: RenderMode.Server, // eller RenderMode.Client
  },

  // Alle andre ruter kan prerendres
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  }
];
