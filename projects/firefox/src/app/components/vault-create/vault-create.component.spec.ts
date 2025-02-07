import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VaultCreateComponent } from './vault-create.component';

describe('VaultCreateComponent', () => {
  let component: VaultCreateComponent;
  let fixture: ComponentFixture<VaultCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VaultCreateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VaultCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
