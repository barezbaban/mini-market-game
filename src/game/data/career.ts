import { emptyItems, PRODUCTS } from './products';
import { MACHINES } from './machines';
import type { CareerState, GameState, ShopStyle, UpgradeId, Vec2 } from '../types';
import { GAME_CONFIG } from './gameConfig';

export const CHAPTERS = [
  { name: 'First stall', goal: 'Learn the harvest → shelf → checkout → cash loop.' },
  { name: 'Neighborhood market', goal: 'Build a dependable shop and hire your first team.' },
  { name: 'Production business', goal: 'Balance fresh produce with finished products.' },
  { name: 'Specialty shop', goal: 'Serve varied orders and build relationships with regulars.' },
  { name: 'Established supermarket', goal: 'Run dairy, delivery and a reliable team.' },
] as const;

export const REGULARS = [
  {
    id: 'ava',
    name: 'Ava',
    badge: 'Neighborhood kitchen',
    apron: 0x387e60,
    product: 'tomato',
    color: 0xe58b71,
    story: 'Fresh tomatoes for the neighborhood kitchen.',
  },
  {
    id: 'dara',
    name: 'Dara',
    badge: 'Breakfast regular',
    apron: 0x466e9b,
    product: 'egg',
    color: 0x739ebd,
    story: 'Breakfast supplies, and a familiar friendly face.',
  },
  {
    id: 'mina',
    name: 'Mina',
    badge: 'Corner bookshop',
    apron: 0x826299,
    product: 'coffee',
    color: 0xa78bb7,
    story: 'Coffee for the little bookshop next door.',
  },
] as const;

export const SHOP_STYLES: Array<{
  id: ShopStyle;
  name: string;
  contracts: number;
  color: string;
  sign: string;
}> = [
  { id: 'classic', name: 'Market green', contracts: 0, color: '#168a65', sign: 'MINI MARKET' },
  {
    id: 'sunflower',
    name: 'Sunflower market',
    contracts: 2,
    color: '#95671d',
    sign: 'SUNFLOWER MARKET',
  },
  {
    id: 'lavender',
    name: 'Lavender market',
    contracts: 5,
    color: '#7b5b95',
    sign: 'LAVENDER MARKET',
  },
];

export function createCareer(): CareerState {
  return {
    version: 1,
    sold: emptyItems(),
    claimed: [],
    contractsCompleted: 0,
    contract: null,
    regularVisits: Object.fromEntries(REGULARS.map((r) => [r.id, 0])),
    accountantCheckpoint: 0,
    cashierAwaySales: 0,
    cashierStockLesson: false,
    pinnedGoal: null,
    stockTargets: Object.fromEntries(
      PRODUCTS.map(({ id }) => [id, 6]),
    ) as CareerState['stockTargets'],
    machinePolicies: Object.fromEntries(
      MACHINES.map(({ id }) => [id, 'balanced']),
    ) as CareerState['machinePolicies'],
    batchModes: Object.fromEntries(
      MACHINES.map(({ id }) => [id, 'quick']),
    ) as CareerState['batchModes'],
    style: 'classic',
    firstActions: {},
  };
}

export interface BusinessMilestone {
  id: string;
  title: string;
  description: string;
  rewardMoney: number;
  rewardXp: number;
  progress(state: GameState): number;
}
export const BUSINESS_MILESTONES: BusinessMilestone[] = [
  {
    id: 'first-sale',
    title: 'Your first customer',
    description: 'Complete one paid order.',
    rewardMoney: 20,
    rewardXp: 25,
    progress: (s) => s.totalServed,
  },
  {
    id: 'ten-orders',
    title: 'A busy little stall',
    description: 'Complete 10 paid orders.',
    rewardMoney: 40,
    rewardXp: 75,
    progress: (s) => s.totalServed / 10,
  },
  {
    id: 'first-team',
    title: 'A helping hand',
    description: 'Hire both a cashier and a harvest helper.',
    rewardMoney: 50,
    rewardXp: 100,
    progress: (s) => Number(s.upgrades.cashier > 0 && s.upgrades.helpers > 0),
  },
  {
    id: 'first-production',
    title: 'Made in your market',
    description: 'Sell 12 tomato cans.',
    rewardMoney: 75,
    rewardXp: 150,
    progress: (s) => s.career.sold.tomatoPaste / 12,
  },
  {
    id: 'coffee-corner',
    title: 'Coffee break',
    description: 'Sell 20 coffee beans or bags.',
    rewardMoney: 100,
    rewardXp: 200,
    progress: (s) => (s.career.sold.coffee + s.career.sold.groundCoffee) / 20,
  },
  {
    id: 'garden-variety',
    title: 'Garden variety',
    description: 'Sell 30 carrots and 15 grilled corn.',
    rewardMoney: 125,
    rewardXp: 250,
    progress: (s) => Math.min(s.career.sold.carrot / 30, s.career.sold.grilledCorn / 15),
  },
  {
    id: 'dairy-day',
    title: 'A fresh dairy day',
    description: 'Sell 20 milk bottles and 12 cheese.',
    rewardMoney: 150,
    rewardXp: 300,
    progress: (s) => Math.min(s.career.sold.milk / 20, s.career.sold.cheese / 12),
  },
  {
    id: 'delivery-team',
    title: 'Beyond the front door',
    description: 'Complete 15 drive-through orders.',
    rewardMoney: 150,
    rewardXp: 250,
    progress: (s) => s.driveThroughServed / 15,
  },
  {
    id: 'community',
    title: 'A neighborhood favorite',
    description: 'Welcome regular customers on 15 paid visits.',
    rewardMoney: 100,
    rewardXp: 200,
    progress: (s) => Object.values(s.career.regularVisits).reduce((a, b) => a + b, 0) / 15,
  },
];

export function pinnedGoalView(s: GameState): { title: string; detail: string } | null {
  const id = s.career.pinnedGoal;
  if (!id) return null;
  const c = s.career.contract;
  if (id === 'contract' && c) {
    const detail =
      c.kind === 'drive'
        ? `${Math.min(c.targetOrders, s.driveThroughServed - c.ordersAtStart)}/${c.targetOrders} drive-through orders`
        : PRODUCTS.filter((p) => c.goals[p.id] > 0)
            .map(
              (p) =>
                `${Math.min(c.goals[p.id], s.career.sold[p.id] - c.baseline[p.id])}/${c.goals[p.id]} ${p.plural}`,
            )
            .join(' · ');
    return { title: 'Pinned contract', detail };
  }
  const m = BUSINESS_MILESTONES.find((entry) => entry.id === id);
  if (!m || s.career.claimed.includes(id)) return null;
  const progress = Math.min(1, m.progress(s));
  const detail =
    progress === 1
      ? 'Ready to claim in Manage → Goals.'
      : id === 'first-production'
        ? `${s.career.sold.tomatoPaste}/12 ${PRODUCTS.find((p) => p.id === 'tomatoPaste')!.plural}`
        : `${m.description} · ${Math.floor(progress * 100)}% complete`;
  return { title: m.title, detail };
}

export function currentChapter(state: GameState): number {
  if (state.upgrades.expansion >= 4) return 4;
  if (state.upgrades.expansion >= 2) return 3;
  if (state.upgrades.expansion >= 1) return 2;
  return state.totalServed >= 10 || state.upgrades.helpers || state.upgrades.cashier ? 1 : 0;
}

export function nextBusinessGoal(state: GameState): {
  title: string;
  detail: string;
  target?: Vec2;
  upgrade?: UpgradeId;
} {
  const claim = BUSINESS_MILESTONES.find(
    (m) => !state.career.claimed.includes(m.id) && m.progress(state) >= 1,
  );
  if (claim)
    return {
      title: `${claim.title} complete!`,
      detail: `Claim $${claim.rewardMoney} + ${claim.rewardXp} XP in Manage → Goals.`,
    };
  if (state.totalServed < 10)
    return {
      title: 'Build your first customer base',
      detail: `${state.totalServed}/10 paid orders · reward $40 + 75 XP.`,
    };
  if (!state.upgrades.cashier)
    return {
      title: 'Hire your first cashier',
      detail: 'Let checkout run while you harvest. Manage → Staff.',
      upgrade: 'cashier',
      target: GAME_CONFIG.cashierSpot,
    };
  if (!state.upgrades.helpers)
    return {
      title: 'Build your first team',
      detail: 'Hire a harvest helper in Manage → Staff.',
      upgrade: 'helpers',
    };
  if (!state.upgrades.expansion)
    return {
      title: 'Open your production department',
      detail: `${Math.min(20, state.totalServed)}/20 orders · reach player level 3, then buy the department in Manage → Store.`,
      upgrade: 'expansion',
    };
  if (!state.upgrades.pasteMachine)
    return {
      title: 'Build your first cannery',
      detail: 'Turn tomatoes into cans. Manage → Machines.',
      upgrade: 'pasteMachine',
    };
  if (state.upgrades.expansion === 1 && state.career.claimed.includes('first-production'))
    return {
      title: 'Make room for coffee',
      detail: `${Math.min(65, state.totalServed)}/65 orders · reach player level 6, then buy the coffee department in Manage → Store.`,
      upgrade: 'expansion',
    };
  const next = BUSINESS_MILESTONES.find((m) => !state.career.claimed.includes(m.id));
  return next
    ? { title: next.title, detail: next.description + ' See your chapter in Manage → Goals.' }
    : {
        title: 'Your neighborhood market',
        detail: 'Choose a contract, welcome regulars, or personalize your shop in Goals.',
      };
}
