import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PubkeyComponent } from './pubkey.component';

describe('PubkeyComponent', () => {
  let component: PubkeyComponent;
  let fixture: ComponentFixture<PubkeyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PubkeyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PubkeyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
