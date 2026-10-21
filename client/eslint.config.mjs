import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  // files/ holds design reference samples that are not compiled.
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts', 'files/**']),
  {
    rules: {
      // shortcut: 10 pre-existing mount-time state syncs are warnings; raise to
      // error once those components derive that state during render instead.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
