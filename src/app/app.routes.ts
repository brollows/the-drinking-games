import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { PlayComponent } from './pages/play/play';

export const routes: Routes = [
  { path: '', component: HomeComponent },     
  { path: 'play', component: PlayComponent },  
  { path: '**', redirectTo: '' },              
];
