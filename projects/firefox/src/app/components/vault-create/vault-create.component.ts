import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-vault-create',
  imports: [RouterOutlet],
  templateUrl: './vault-create.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './vault-create.component.scss',
})
export class VaultCreateComponent {}
