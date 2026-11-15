import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';

import { EditIdentityComponent } from './edit-identity.component';

describe('EditIdentityComponent', () => {
  let component: EditIdentityComponent;
  let fixture: ComponentFixture<EditIdentityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditIdentityComponent],
      providers: [{ provide: ActivatedRoute, useValue: {} }],
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditIdentityComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
