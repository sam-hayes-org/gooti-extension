import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  AvatarCell,
  avatarCells,
  colorForPubkey,
} from '../../identity/appearance';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-identity-avatar',
  imports: [],
  templateUrl: './identity-avatar.component.html',
  styleUrl: './identity-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: {
    '[style.width.px]': 'size',
    '[style.height.px]': 'size',
    '[style.--identity-color]': 'fill',
  },
})
export class IdentityAvatarComponent {
  @Input() pubkey = '';
  @Input() color?: string;
  @Input() size = 28;

  get fill(): string {
    return colorForPubkey(this.pubkey, this.color);
  }

  get cells(): AvatarCell[] {
    return avatarCells(this.pubkey);
  }
}
