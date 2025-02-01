import { Component, Input } from '@angular/core';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-icon-button',
  imports: [],
  templateUrl: './icon-button.component.html',
  styleUrl: './icon-button.component.scss',
})
export class IconButtonComponent {
  @Input({ required: true }) icon!: string;
}
