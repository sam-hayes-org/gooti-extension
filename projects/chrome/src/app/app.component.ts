import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoggerService, StartupService } from '@common';
import { getNewStorageServiceConfig } from './common/data/get-new-storage-service-config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);

  ngOnInit(): void {
    this.#logger.initialize('Gooti Chrome Extension');

    this.#startup.startOver(getNewStorageServiceConfig());
  }
}
