import { ComponentFixture, TestBed } from '@angular/core/testing';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { IdentityAvatarComponent } from './identity-avatar.component';

describe('IdentityAvatarComponent', () => {
  let fixture: ComponentFixture<IdentityAvatarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IdentityAvatarComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(IdentityAvatarComponent);
  });

  it('paints the pubkey', () => {
    fixture.componentRef.setInput('pubkey', getPublicKey(generateSecretKey()));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('rect').length).toBeGreaterThan(0);
  });
});
