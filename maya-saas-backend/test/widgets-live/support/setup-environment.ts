// Runs in every suite's environment before the suite is loaded (jest `setupFiles`): the application
// under test sees the platform-ci.yml literals, the guarded DATABASE_URL, and nothing else.

import { applyWidgetsLiveEnvironment } from './environment';

applyWidgetsLiveEnvironment(process.env);
