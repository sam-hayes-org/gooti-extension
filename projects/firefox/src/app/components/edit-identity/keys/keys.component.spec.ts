import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';

import { KeysComponent } from './keys.component';

describe('KeysComponent', () => {
  let component: KeysComponent;
  let fixture: ComponentFixture<KeysComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeysComponent],
      providers: [{ provide: ActivatedRoute, useValue: {} }],
    })
    .compileComponents();

    fixture = TestBed.createComponent(KeysComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
