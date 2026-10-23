import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { IconButtonComponent } from '../icon-button/icon-button.component';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-nav-item',
  imports: [IconButtonComponent],
  templateUrl: './nav-item.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './nav-item.component.scss',
})
export class NavItemComponent {
  @Input({ required: true }) text!: string;
}
