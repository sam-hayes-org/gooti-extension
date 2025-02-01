import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RelayRwComponent } from './relay-rw.component';

describe('RelayRwComponent', () => {
  let component: RelayRwComponent;
  let fixture: ComponentFixture<RelayRwComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelayRwComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RelayRwComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
