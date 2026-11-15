import { Component, ChangeDetectionStrategy } from '@angular/core';
import { PubkeyComponent, ToastComponent } from '@common';
import browser from 'webextension-polyfill';
import packageJson from '../../../../../../../package.json';

@Component({
  selector: 'app-info',
  imports: [PubkeyComponent, ToastComponent],
  templateUrl: './info.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './info.component.scss',
})
export class InfoComponent {
  version = packageJson.custom.firefox.version;

  /** The notices Angular writes next to the bundle (3rdpartylicenses.txt). */
  openLicenses(event: Event): void {
    event.preventDefault();
    browser.tabs.create({
      url: browser.runtime.getURL('3rdpartylicenses.txt'),
    });
  }
}
