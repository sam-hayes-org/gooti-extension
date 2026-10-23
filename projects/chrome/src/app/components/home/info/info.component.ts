import { Component, ChangeDetectionStrategy } from '@angular/core';
import { PubkeyComponent, ToastComponent } from '@common';
import packageJson from '../../../../../../../package.json';

@Component({
  selector: 'app-info',
  imports: [PubkeyComponent, ToastComponent],
  templateUrl: './info.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './info.component.scss',
})
export class InfoComponent {
  version = packageJson.custom.chrome.version;
}
