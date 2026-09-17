// D-2 — the live principal, the boundary half (GATES-PLAN-V11 P-PRINCIPAL).
//
// This is the ONE widget file that calls an identity owner. Everything it does is a call into a
// mechanism that already exists:
//   - `C9Authority.current(T)` resolves the principal (K1, C11:2536-2539). It is the same resolver the
//     orchestrator uses, taking the same `FOR SHARE` locks on the same `Membership` and `User` rows,
//     inside the caller's transaction;
//   - `MembershipsService.activeMembershipInTransaction(T, …)` reads the LIVE role from the tenancy
//     owner, inside the same transaction and under `FOR SHARE` (B-02, C11:7189-7191);
//   - `c9PrincipalHash(authority)` is the owner's own digest (K3, C11:2544), so what Gate 3 compares is
//     what the minter wrote and not a local look-alike. The layer's previous hash
//     (`principal.util.ts`) was a sha256 over four JWT fields — a different function over different
//     terms, which is why K4's "recomputes `c9PrincipalHash` for the live principal" was not satisfied.
//
// K5 (C11:2548) — this adapter CONSTRUCTS no principal. It never builds a `C9Principal` literal, never
// selects a `Membership` or a `ClientChannelLink` to make one from, and never resurrects a revoked
// binding: it asks the resolver and uses the answer, or has no principal. `k5-principal.architecture.spec.ts`
// holds that at the source over the whole widget layer.
//
// FAIL-CLOSED, and the difference between a denial and a fault (D-2, D-16, R3.9.3 C11:4902-4903):
//   - a DENIAL — the owner refused to resolve a principal for this session — is `null`. The transport
//     chain admitted the request (row 2, C11:4721), so slot 2 is not the refusal point; with no live
//     principal there is no live proof hash, so Gate 3 has nothing equal to compare and refuses
//     `widget_principal_mismatch` at slot 3;
//   - a FAULT — the store failed, the transaction was aborted, an invariant broke — is re-thrown. The
//     gateway rolls `T` back and answers as a fault. Swallowing it would make a broken store look like
//     a foreign principal, which is the one thing R3.9.3 says may not happen.

import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { C9Principal } from '../../orchestration/c9.contract';
import { C9Authority } from '../../orchestration/c9.authority';
import { c9PrincipalHash } from '../../orchestration/c9.identity';
import { MembershipsService } from '../../tenancy/memberships.service';
import {
  principalView,
  type PrincipalResolver,
  type RequestTx,
} from '../authority/principal-view';
import type { PrincipalView } from '../gate.types';

/**
 * K3's digest, re-exported at the boundary so the rest of the widget layer has exactly one import site
 * for it (the minter and the fixtures switch to it). The function itself is the owner's; nothing here
 * re-implements or wraps it, because a wrapper is a place where the terms could quietly differ.
 */
export { c9PrincipalHash } from '../../orchestration/c9.identity';

/**
 * An authorization DENIAL, told from a fault by its type alone.
 *
 * `C9Authority.current` denies with `ForbiddenException('c9_current_principal_required')`;
 * `TenantContextService.requireTenantId` and `ClientChannelRuntimeService.resolve` deny with a
 * `ForbiddenException` of their own. Nest's `UnauthorizedException` is admitted for the same reason.
 * Every other error is a fault, including a Prisma error: a query that failed is not a statement that
 * this caller has no authority.
 */
const isDenial = (error: unknown): boolean =>
  error instanceof ForbiddenException || error instanceof UnauthorizedException;

@Injectable()
export class PrincipalAdapter implements PrincipalResolver {
  constructor(
    private readonly authority: C9Authority,
    private readonly memberships: MembershipsService,
  ) {}

  /**
   * Resolve the live principal inside `T` (D-1). Two store reads and no more: the resolver's own, and
   * the tenancy owner's role read. Both take their locks in `T`, and `T` is committed by the gateway at
   * the first non-pass verdict up to slot 10 or after slot 10, so nothing is held while owners run at
   * slots 11–13 (PR-9).
   *
   * `channelProof` exists for the CLIENT_CHANNEL branch of K1. The JWT widget route never has one — it
   * passes nothing — so on that route this is always the USER branch. The branch is reachable here only
   * because K4's client-link half is stated over it (C11:2546), and the G3-c2 U-proof exercises it.
   */
  async resolve(
    tx: RequestTx,
    channelProof?: string,
  ): Promise<PrincipalView | null> {
    let authority: C9Principal;
    try {
      authority = await this.authority.current(tx, channelProof);
    } catch (error) {
      if (isDenial(error)) return null;
      throw error;
    }

    const role = await this.liveRole(tx, authority);
    // A USER principal whose membership the tenancy owner cannot read inside `T` has no live role. That
    // is not a role of `null`: it is a principal that stopped resolving between the resolver's read and
    // this one, so it is a denial, which Gate 3 refuses.
    if (authority.kind === 'USER' && role === null) return null;

    return principalView({
      authority,
      role,
      proofHash: c9PrincipalHash(authority),
    });
  }

  /**
   * B-02: the live role, `m.id === authority.membershipId`, under `FOR SHARE`, in `T`.
   *
   * A CLIENT_CHANNEL principal has no membership (`membershipId` and `userId` are both null), and a role
   * read for one would be an invention. It has no role, and `presentationMode` is `client` for it by
   * B-02's first clause.
   */
  private async liveRole(
    tx: RequestTx,
    authority: C9Principal,
  ): Promise<string | null> {
    if (authority.membershipId === null || authority.userId === null)
      return null;
    const membership = await this.memberships.activeMembershipInTransaction(
      tx,
      authority.membershipId,
      authority.userId,
      authority.tenantId,
    );
    return membership?.role ?? null;
  }
}
