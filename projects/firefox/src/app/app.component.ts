import { Component, inject, OnInit } from '@angular/core';
import { LoggerService, StartupService } from '@common';
import { getNewStorageServiceConfig } from './common/data/get-new-storage-service-config';
import { RouterOutlet } from '@angular/router';

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
    this.#logger.initialize('Gooti Firefox Extension');

    this.#startup.startOver(getNewStorageServiceConfig());
  }
}
