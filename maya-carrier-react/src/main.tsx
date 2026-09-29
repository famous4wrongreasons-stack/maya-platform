// The carrier's composition root — the only module that acquires the document.
//
// M3 is the scaffold: the ratchets exist and refuse, the runtime boundary is enforced, and nothing
// of the owner's chat is here yet. The leaves arrive at M4 and AChat's presentation tail at M5.

import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

const root = document.getElementById('maya');
if (root) createRoot(root).render(<App />);
