import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VaultImportComponent } from './vault-import.component';

describe('VaultImportComponent', () => {
  let component: VaultImportComponent;
  let fixture: ComponentFixture<VaultImportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VaultImportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VaultImportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
