import type { Adapter } from '../adapter.js';
import type { AllocationBucket, AllocationMode } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import type { Minor } from '../../money/minor.js';
import { TAX_RESERVE_KIND } from '../../budget/allocate.js';

export const ALLOCATION_BUCKETS = 'allocation_buckets';

export interface NewBucketInput {
  name: string;
  mode: AllocationMode;
  target_minor?: Minor | null;
  percent?: number | null;
  weight?: number;
  priority?: number;
  linked_account_id?: UUID | null;
  is_system?: boolean;
  system_kind?: string | null;
}

export class BucketRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  async create(userId: UUID, input: NewBucketInput): Promise<AllocationBucket> {
    const bucket: AllocationBucket = {
      id: this.newId(),
      user_id: userId,
      name: input.name,
      mode: input.mode,
      target_minor: input.target_minor ?? null,
      percent: input.percent ?? null,
      weight: input.weight ?? 1,
      priority: input.priority ?? 100,
      linked_account_id: input.linked_account_id ?? null,
      is_system: input.is_system ?? false,
      system_kind: input.system_kind ?? null,
      is_archived: false,
      created_at: this.clock.now(),
    };
    await this.adapter.insert(ALLOCATION_BUCKETS, bucket);
    return bucket;
  }

  async list(userId: UUID, includeArchived = false): Promise<AllocationBucket[]> {
    return (await this.adapter.all<AllocationBucket>(ALLOCATION_BUCKETS))
      .filter((b) => b.user_id === userId)
      .filter((b) => (includeArchived ? true : !b.is_archived))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  async update(userId: UUID, id: UUID, patch: Partial<NewBucketInput>): Promise<void> {
    const bucket = await this.adapter.get<AllocationBucket>(ALLOCATION_BUCKETS, id);
    if (!bucket || bucket.user_id !== userId) throw new Error(`bucket ${id} not found`);
    await this.adapter.update<AllocationBucket>(ALLOCATION_BUCKETS, id, patch);
  }

  async setArchived(userId: UUID, id: UUID, archived: boolean): Promise<void> {
    const bucket = await this.adapter.get<AllocationBucket>(ALLOCATION_BUCKETS, id);
    if (!bucket || bucket.user_id !== userId) throw new Error(`bucket ${id} not found`);
    await this.adapter.update<AllocationBucket>(ALLOCATION_BUCKETS, id, { is_archived: archived });
  }

  /**
   * Delete a bucket. Callers must check canDeleteBucket() first — the tax
   * reserve cannot be removed while self-employment income exists.
   */
  async remove(userId: UUID, id: UUID): Promise<void> {
    const bucket = await this.adapter.get<AllocationBucket>(ALLOCATION_BUCKETS, id);
    if (!bucket || bucket.user_id !== userId) throw new Error(`bucket ${id} not found`);
    await this.adapter.remove(ALLOCATION_BUCKETS, id);
  }

  /**
   * Ensure the system tax-reserve bucket exists. Idempotent — returns the
   * existing bucket if present. Created after fixed/percent buckets by priority.
   */
  async ensureReserveBucket(userId: UUID): Promise<AllocationBucket> {
    const existing = (await this.list(userId, true)).find((b) => b.system_kind === TAX_RESERVE_KIND);
    if (existing) return existing;
    return this.create(userId, {
      name: 'Tax reserve',
      mode: 'fixed',
      target_minor: 0 as Minor, // populated by Feature 05's estimate
      priority: 50,
      is_system: true,
      system_kind: TAX_RESERVE_KIND,
    });
  }
}
