import {
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
} from '@angular/core';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-relay-rw',
  imports: [],
  templateUrl: './relay-rw.component.html',
  styleUrl: './relay-rw.component.scss',
})
export class RelayRwComponent {
  @Input({ required: true }) type!: 'read' | 'write';
  @Input({ required: true }) model!: boolean;
  @Output() modelChange = new EventEmitter<boolean>();

  @HostBinding('class.read') get isRead() {
    return this.type === 'read';
  }

  @HostBinding('class.is-selected') get isSelected() {
    return this.model;
  }

  @HostListener('click') onClick() {
    this.model = !this.model;
    this.modelChange.emit(this.model);
  }
}
