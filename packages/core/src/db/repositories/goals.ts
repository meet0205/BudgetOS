import type { Adapter } from '../adapter.js';
import type { Goal, GoalContribution } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import type { Minor } from '../../money/minor.js';

export const GOALS = 'goals';
export const GOAL_CONTRIBUTIONS = 'goal_contributions';

export interface NewGoalInput {
  name: string;
  target_minor: Minor;
  current_minor?: Minor;
  target_date?: string | null;
  monthly_contribution_minor?: Minor | null;
  priority?: number;
  bucket_id?: UUID | null;
}

export class GoalRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  async create(userId: UUID, input: NewGoalInput): Promise<Goal> {
    const current = input.current_minor ?? (0 as Minor);
    const goal: Goal = {
      id: this.newId(),
      user_id: userId,
      name: input.name,
      target_minor: input.target_minor,
      current_minor: current,
      target_date: input.target_date ?? null,
      monthly_contribution_minor: input.monthly_contribution_minor ?? null,
      priority: input.priority ?? 100,
      bucket_id: input.bucket_id ?? null,
      achieved_at: current >= input.target_minor ? this.clock.now() : null,
      created_at: this.clock.now(),
    };
    await this.adapter.insert(GOALS, goal);
    return goal;
  }

  async list(userId: UUID): Promise<Goal[]> {
    return (await this.adapter.all<Goal>(GOALS))
      .filter((g) => g.user_id === userId)
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  }

  async update(userId: UUID, id: UUID, patch: Partial<NewGoalInput>): Promise<void> {
    const goal = await this.adapter.get<Goal>(GOALS, id);
    if (!goal || goal.user_id !== userId) throw new Error(`goal ${id} not found`);
    await this.adapter.update<Goal>(GOALS, id, patch);
  }

  /**
   * Record a contribution and advance the goal's balance atomically. Sets
   * achieved_at once the target is reached (and clears it if a correction drops
   * the balance back below target).
   */
  async contribute(userId: UUID, id: UUID, amount: Minor, occurredOn: string, source = 'manual'): Promise<Goal> {
    const goal = await this.adapter.get<Goal>(GOALS, id);
    if (!goal || goal.user_id !== userId) throw new Error(`goal ${id} not found`);

    const next = (goal.current_minor + amount) as Minor;
    const achieved = next >= goal.target_minor ? (goal.achieved_at ?? this.clock.now()) : null;

    return this.adapter.tx(async (a) => {
      await a.insert<GoalContribution>(GOAL_CONTRIBUTIONS, {
        id: this.newId(),
        user_id: userId,
        goal_id: id,
        amount_minor: amount,
        occurred_at: occurredOn,
        source,
      });
      await a.update<Goal>(GOALS, id, { current_minor: next, achieved_at: achieved });
      return { ...goal, current_minor: next, achieved_at: achieved };
    });
  }

  async remove(userId: UUID, id: UUID): Promise<void> {
    const goal = await this.adapter.get<Goal>(GOALS, id);
    if (!goal || goal.user_id !== userId) throw new Error(`goal ${id} not found`);
    await this.adapter.remove(GOALS, id);
  }
}
