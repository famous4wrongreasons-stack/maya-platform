// K3 — the lowering-source reader: the one read of what Gate 9 lowers (plan §2.5, D-2).
//
// A SKELETON (U0, D-6). It has no method, on purpose. `read(tenantId, intentTokenHash)` lands with
// U8a: slot 8 calls it once, lazily, after Gate 8's validation passes, and emits the J-1 fact
// `loweringSource`. Slot 8 is a refusing `pending('8')` stub until then, so nothing reads the
// template, the labels or the turn join yet, and no C-class column is loaded on the gateway path.

import { PrismaService } from '../../prisma/prisma.service';

export class LoweringSourceReader {
  constructor(private readonly prisma: PrismaService) {}
}
