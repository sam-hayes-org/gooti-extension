import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { colorForPubkey } from '../../identity/appearance';
import { IdentityAvatarComponent } from '../identity-avatar/identity-avatar.component';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-identity-current',
  imports: [IdentityAvatarComponent],
  templateUrl: './identity-current.component.html',
  styleUrl: './identity-current.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class IdentityCurrentComponent {
  @Input() nick = '';
  @Input() pubkey = '';
  @Input() color?: string;
  @Input() bunker = false;
  @Input() unlinked = false;
  @Output() activate = new EventEmitter<void>();

  get fill(): string {
    return colorForPubkey(this.pubkey, this.color);
  }
}
