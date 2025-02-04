import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VaultLoginComponent } from './vault-login.component';

describe('VaultLoginComponent', () => {
  let component: VaultLoginComponent;
  let fixture: ComponentFixture<VaultLoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VaultLoginComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VaultLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
