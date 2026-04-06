import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PubkeyComponent } from './pubkey.component';

describe('PubkeyComponent', () => {
  let component: PubkeyComponent;
  let fixture: ComponentFixture<PubkeyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PubkeyComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PubkeyComponent);
    component = fixture.componentInstance;
    component.value =
      '32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
