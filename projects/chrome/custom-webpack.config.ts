import type { Configuration } from 'webpack';

module.exports = {
  entry: {
    background: {
      import: 'src/background.ts',
      runtime: false,
    },
    'gooti-extension': {
      import: 'src/gooti-extension.ts',
      runtime: false,
    },
    'gooti-content-script': {
      import: 'src/gooti-content-script.ts',
      runtime: false,
    },
    prompt: {
      import: 'src/prompt.ts',
      runtime: false,
    },
  },
} as Configuration;
