import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmComponent } from './confirm.component';

describe('ConfirmComponent', () => {
  let component: ConfirmComponent;
  let fixture: ComponentFixture<ConfirmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('informs with one OK button and show restores Yes and No', () => {
    spyOn(component.modal!, 'show');

    component.inform(
      'Your exported vault snapshot is secured with your vault password. When you import the vault snapshot later, you still need the vault password to access your vault.',
      () => undefined,
      'Export',
    );
    expect(component.message).toContain('secured with your vault password');
    expect(component.title).toBe('Export');
    expect(component.yesLabel).toBe('OK');
    expect(component.showNo).toBe(false);

    component.show('Do you really want to sign out?', () => undefined);
    expect(component.title).toBe('Please confirm');
    expect(component.yesLabel).toBe('Yes');
    expect(component.showNo).toBe(true);
  });
});
