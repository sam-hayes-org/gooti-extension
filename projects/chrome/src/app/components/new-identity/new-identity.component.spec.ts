import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewIdentityComponent } from './new-identity.component';

describe('NewIdentityComponent', () => {
  let component: NewIdentityComponent;
  let fixture: ComponentFixture<NewIdentityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewIdentityComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewIdentityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
