import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { VaultLoginComponent } from './components/vault-login/vault-login.component';
import { VaultCreateComponent } from './components/vault-create/vault-create.component';
import { HomeComponent as VaultCreateHomeComponent } from './components/vault-create/home/home.component';
import { NewComponent as VaultCreateNewComponent } from './components/vault-create/new/new.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { IdentitiesComponent } from './components/home/identities/identities.component';
import { IdentityComponent } from './components/home/identity/identity.component';
import { InfoComponent } from './components/home/info/info.component';
import { SettingsComponent } from './components/home/settings/settings.component';
import { NewIdentityComponent } from './components/new-identity/new-identity.component';
import { EditIdentityComponent } from './components/edit-identity/edit-identity.component';
import { HomeComponent as EditIdentityHomeComponent } from './components/edit-identity/home/home.component';
import { KeysComponent as EditIdentityKeysComponent } from './components/edit-identity/keys/keys.component';
import { PermissionsComponent as EditIdentityPermissionsComponent } from './components/edit-identity/permissions/permissions.component';
import { RelaysComponent as EditIdentityRelaysComponent } from './components/edit-identity/relays/relays.component';
import { VaultImportComponent } from './components/vault-import/vault-import.component';

export const routes: Routes = [
  {
    path: 'welcome',
    component: WelcomeComponent,
  },
  {
    path: 'vault-login',
    component: VaultLoginComponent,
  },
  {
    path: 'vault-create',
    component: VaultCreateComponent,
    children: [
      {
        path: 'home',
        component: VaultCreateHomeComponent,
      },
      {
        path: 'new',
        component: VaultCreateNewComponent,
      },
    ],
  },
  {
    path: 'vault-import',
    component: VaultImportComponent,
  },
  {
    path: 'home',
    component: HomeComponent,
    children: [
      {
        path: 'identities',
        component: IdentitiesComponent,
      },
      {
        path: 'identity',
        component: IdentityComponent,
      },
      {
        path: 'info',
        component: InfoComponent,
      },
      {
        path: 'settings',
        component: SettingsComponent,
      },
    ],
  },
  {
    path: 'new-identity',
    component: NewIdentityComponent,
  },
  {
    path: 'edit-identity/:id',
    component: EditIdentityComponent,
    children: [
      {
        path: 'home',
        component: EditIdentityHomeComponent,
      },
      {
        path: 'keys',
        component: EditIdentityKeysComponent,
      },
      {
        path: 'permissions',
        component: EditIdentityPermissionsComponent,
      },
      {
        path: 'relays',
        component: EditIdentityRelaysComponent,
      },
    ],
  },
];
