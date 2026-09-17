// K3 — the divergence store: Gate 10's audit rows (G10 §5, plan §2.6).
//
// A SKELETON (U0, D-6). It has no method, on purpose. The table it would write,
// `WidgetIntentDivergenceAudit`, does not exist: it lands only after AMB-32 (the A-STORE contract
// amendment) with its migration, and `recordDivergence` lands with U10b. Slot 10 is a refusing
// `pending('10')` stub until then, so nothing needs this store yet. A method that pretended to record
// a divergence would be counted as an audit that is not written.

import { PrismaService } from '../../prisma/prisma.service';

export class DivergenceStore {
  constructor(private readonly prisma: PrismaService) {}
}
