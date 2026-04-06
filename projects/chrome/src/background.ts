import { initializeBackground } from '@common';
import { ChromeBackgroundCommon } from './background-common';

const backgroundCommon = new ChromeBackgroundCommon();
void initializeBackground(backgroundCommon);
