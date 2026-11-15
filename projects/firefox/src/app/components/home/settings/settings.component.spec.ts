import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StorageService } from '@common';

import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    // A locked session: no vault password, so the backup panel shows its locked phase.
    const storageStub = {
      getBrowserSessionHandler: () => ({ browserSessionData: undefined }),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [{ provide: StorageService, useValue: storageStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows "Use an existing backup" on the first render of an unlocked vault without sync', () => {
    // An unlocked session that has no backup yet: the backup panel is in its offer phase.
    const unlocked = {
      getBrowserSessionHandler: () => ({ browserSessionData: { vaultPassword: 'secret' } }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [{ provide: StorageService, useValue: unlocked }],
    });

    const first = TestBed.createComponent(SettingsComponent);
    // One change-detection pass only, like the first time the page opens.
    first.detectChanges();

    const buttons = Array.from(
      (first.nativeElement as HTMLElement).querySelectorAll('button'),
    ).map((button) => button.textContent?.trim());
    expect(buttons).toContain('Use an existing backup');
  });
});
