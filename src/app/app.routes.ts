import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { PlayComponent } from './pages/play/play';
import { CreateUserComponent } from './pages/create-user/create-user';

export const routes: Routes = [
  { path: '', component: HomeComponent },             
  { path: 'create-user', component: CreateUserComponent }, 
  { path: 'play', component: PlayComponent },        
  { path: '**', redirectTo: '' },          
];
