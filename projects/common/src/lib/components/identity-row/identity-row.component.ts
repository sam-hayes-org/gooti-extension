import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { colorForPubkey } from '../../identity/appearance';
import { IdentityAvatarComponent } from '../identity-avatar/identity-avatar.component';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-identity-row',
  imports: [IdentityAvatarComponent],
  templateUrl: './identity-row.component.html',
  styleUrl: './identity-row.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class IdentityRowComponent {
  @Input() nick = '';
  @Input() pubkey = '';
  @Input() color?: string;
  @Input() bunker = false;
  @Input() unlinked = false;
  /** Short grey text after the nick, such as when a site-only identity was last used. */
  @Input() note?: string;
  @Output() activate = new EventEmitter<void>();

  get fill(): string {
    return colorForPubkey(this.pubkey, this.color);
  }
}
