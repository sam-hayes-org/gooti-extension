import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoggerService } from '@common';
import { StartupService } from './services/startup/startup.service';

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
    this.#startup.startOver();
  }
}
