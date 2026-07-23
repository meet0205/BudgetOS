import type { Adapter } from '../adapter.js';
import type { Profile } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import type { UUID } from '../ids.js';

export const PROFILES = 'profiles';

export interface NewProfileInput {
  id: UUID; // the auth user id
  display_name?: string | null;
  base_currency?: string;
  country?: string;
  province?: string;
  month_start_day?: number;
  ocr_review_threshold?: number;
}

export class ProfileRepository {
  constructor(
    private readonly adapter: Adapter,
    private readonly clock: Clock = systemClock,
  ) {}

  async get(userId: UUID): Promise<Profile | null> {
    return this.adapter.get<Profile>(PROFILES, userId);
  }

  async create(input: NewProfileInput): Promise<Profile> {
    const now = this.clock.now();
    const profile: Profile = {
      id: input.id,
      display_name: input.display_name ?? null,
      base_currency: input.base_currency ?? 'CAD',
      country: input.country ?? 'CA',
      province: input.province ?? 'NS',
      month_start_day: input.month_start_day ?? 1,
      ocr_review_threshold: input.ocr_review_threshold ?? 0.8,
      created_at: now,
      updated_at: now,
    };
    if (profile.month_start_day < 1 || profile.month_start_day > 28) {
      throw new RangeError('month_start_day must be between 1 and 28');
    }
    await this.adapter.insert(PROFILES, profile);
    return profile;
  }

  async update(
    userId: UUID,
    patch: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>,
  ): Promise<Profile> {
    const existing = await this.get(userId);
    if (!existing) throw new Error(`profile ${userId} not found`);
    await this.adapter.update<Profile>(PROFILES, userId, { ...patch, updated_at: this.clock.now() });
    const updated = await this.get(userId);
    if (!updated) throw new Error('profile disappeared during update');
    return updated;
  }
}
