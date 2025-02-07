import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavComponent } from '@common';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent extends NavComponent {
  readonly router = inject(Router);
}
