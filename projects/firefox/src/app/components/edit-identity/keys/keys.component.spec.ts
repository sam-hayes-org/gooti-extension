import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KeysComponent } from './keys.component';

describe('KeysComponent', () => {
  let component: KeysComponent;
  let fixture: ComponentFixture<KeysComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeysComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(KeysComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
