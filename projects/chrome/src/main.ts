import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import './app/common/extensions/array';

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);

// declare global {
//   interface Window {
//     nostr: any;
//   }
// }
