import { Component, Input, OnInit } from '@angular/core';
import { NostrHelper } from '@common';
import { IconButtonComponent } from "../icon-button/icon-button.component";

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-pubkey',
  imports: [IconButtonComponent],
  templateUrl: './pubkey.component.html',
  styleUrl: './pubkey.component.scss',
})
export class PubkeyComponent implements OnInit {
  @Input({ required: true }) value!: string;
  @Input() first = 9;
  @Input() last = 5;
  @Input() color = '#dee2e6bf';

  npub: string | undefined;
  npubString: string | undefined;

  ngOnInit(): void {
    const pubkeyObject = NostrHelper.getNostrPubkeyObject(this.value);
    this.npub = pubkeyObject.npub;
    this.npubString = NostrHelper.splitKey(
      pubkeyObject.npub,
      this.first,
      this.last
    );
  }

  copyToClipboard() {
    if (!this.npub) {
      return;
    }

    navigator.clipboard.writeText(this.npub);
  }
}
