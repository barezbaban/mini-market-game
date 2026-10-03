import {
  BUSINESS_MILESTONES,
  CHAPTERS,
  currentChapter,
  nextBusinessGoal,
  REGULARS,
  SHOP_STYLES,
} from '../data/career';
import { MACHINES } from '../data/machines';
import { PRODUCTS } from '../data/products';
import { businessInsight } from '../systems/BusinessInsights';
import { contractProgress } from '../systems/CareerSystem';
import type { GameState } from '../types';
import { icon, productIcon } from './icons';

export function insightPanel(state: GameState): string {
  const insight = businessInsight(state);
  return `<section class="business-insight" aria-label="Shop advice"><strong>${insight.title}</strong><p>${insight.detail}</p></section>`;
}

export function goalsPanel(state: GameState): string {
  const chapter = currentChapter(state),
    goal = nextBusinessGoal(state),
    contract = state.career.contract;
  const milestones = BUSINESS_MILESTONES.filter((m) => !state.career.claimed.includes(m.id));
  const cards = milestones.map(
    (m, index) =>
      `<article class="goal-card ${index > 2 ? 'later-goal' : ''}"><div><h3>${m.title}</h3><p>${m.description}</p><progress max="1" value="${Math.min(1, m.progress(state))}" aria-label="${m.title} progress"></progress><small>$${m.rewardMoney} + ${m.rewardXp} XP</small></div><button class="secondary-button" data-claim-goal="${m.id}" ${m.progress(state) >= 1 ? '' : 'disabled'}>${m.progress(state) >= 1 ? 'Claim reward' : `${Math.floor(Math.min(1, m.progress(state)) * 100)}% complete`}</button></article>`,
  );
  const requirements = contract
    ? PRODUCTS.filter((p) => contract.goals[p.id] > 0)
        .map(
          (p) =>
            `${Math.min(contract.goals[p.id], state.career.sold[p.id] - contract.baseline[p.id])}/${contract.goals[p.id]} ${p.plural}`,
        )
        .join(' · ')
    : '';
  return `<section class="chapter-card"><span class="eyebrow">CHAPTER ${chapter + 1} OF 5</span><h3>${CHAPTERS[chapter].name}</h3><p>${CHAPTERS[chapter].goal}</p><strong>${goal.title}</strong><p>${goal.detail}</p><details><summary>Your business journey</summary><ol>${CHAPTERS.map((c, i) => `<li ${i === chapter ? 'aria-current="step"' : ''}>${c.name}${i < chapter ? ' · reached' : ''}</li>`).join('')}</ol></details></section>
    <h3>Business milestones</h3>${cards.slice(0, 3).join('')}${cards.length > 3 ? `<details class="future-upgrades"><summary>Later milestones (${cards.length - 3})</summary>${cards.slice(3).join('')}</details>` : ''}
    <section class="contract-panel"><h3>Choose your next contract</h3><p>Optional, no expiry and no daily streak. Only sales made after accepting count. Rewards are claimed here.</p>${contract ? `<strong>${contract.kind === 'drive' ? `${Math.min(contract.targetOrders, state.driveThroughServed - contract.ordersAtStart)}/${contract.targetOrders} drive-through orders` : requirements}</strong><progress max="1" value="${contractProgress(state)}" aria-label="Contract progress"></progress><p>Reward: $${contract.rewardMoney} + ${contract.rewardXp} XP</p><div class="dialog-actions"><button class="primary-button" id="claim-contract" ${contractProgress(state) >= 1 ? '' : 'disabled'}>Claim contract</button><button class="secondary-button" id="cancel-contract">Abandon contract</button></div>` : `<div class="contract-options"><button class="secondary-button" data-contract="produce" ${state.totalServed < 10 ? 'disabled' : ''}>Fresh produce<br><small>Sell 24 of one crop</small></button><button class="secondary-button" data-contract="variety" ${state.totalServed < 10 ? 'disabled' : ''}>Mixed shopping<br><small>Sell 10 each of up to 3 products</small></button><button class="secondary-button" data-contract="drive" ${state.totalServed < 10 || !state.upgrades.driveThrough ? 'disabled' : ''}>Delivery round<br><small>Complete 8 drive-through orders</small></button></div>${state.totalServed < 10 ? '<small>Contracts open after 10 paid orders.</small>' : ''}`}</section>
    <section class="regulars-panel"><h3>Your regulars</h3><p>A familiar face arrives every eight shoppers after your first 10 sales. Serve their favorite product; every fifth successful visit earns 25 XP.</p>${REGULARS.map((r) => `<article class="regular-card"><span class="regular-avatar" style="background:#${r.color.toString(16)}">${r.name[0]}</span><div><strong>${r.name}</strong><p>${r.story}</p><small>${state.career.regularVisits[r.id] ?? 0} happy visits${state.unlockedProducts.includes(r.product) ? '' : ' · unlock their favorite product to meet them'}</small></div></article>`).join('')}</section>
    <section class="style-panel"><h3>Make it yours</h3><p>${state.career.contractsCompleted} contracts completed. Earn shop-sign themes without spending your upgrade money.</p><div class="contract-options">${SHOP_STYLES.map((s) => `<button class="secondary-button" data-style="${s.id}" ${state.career.contractsCompleted < s.contracts ? 'disabled' : ''} aria-pressed="${state.career.style === s.id}">${s.name}<small>${s.contracts ? `${s.contracts} contracts` : 'Available from the start'}</small></button>`).join('')}</div></section>
    <section class="shop-report"><h3>Business report</h3><p>${state.totalServed} paid orders · ${state.totalWalkouts} walkouts · $${state.totalEarned.toLocaleString()} lifetime earnings</p><details><summary>Product sales since this update</summary><div class="sales-grid">${PRODUCTS.filter(
      (p) => state.unlockedProducts.includes(p.id),
    )
      .map((p) => `<span>${p.plural}<b>${state.career.sold[p.id]}</b></span>`)
      .join(
        '',
      )}</div></details><small>This report stays on your device. No analytics are uploaded.</small></section>`;
}

export function staffPanel(state: GameState): string {
  if (!state.workers.length) return '';
  const tasks = [
    {
      id: 'balanced',
      name: 'Balanced',
      image: icon('worker'),
      detail: 'Help wherever work is needed.',
    },
    {
      id: 'shelves',
      name: 'Restock shelves',
      image: icon('shelf'),
      detail: 'Prioritize products that shoppers are waiting for.',
    },
    {
      id: 'machines',
      name: 'Machines',
      image: icon('machine'),
      detail: 'Prioritize loading machines and collecting finished goods.',
    },
  ];
  const products = PRODUCTS.filter((p) => state.unlockedProducts.includes(p.id)).map((p) => ({
    id: p.id,
    name: p.plural,
    image: productIcon(p.id),
    detail: `Keep the ${p.plural.toLowerCase()} shelf supplied.`,
  }));
  return `<section class="staff-priorities"><h3>Team focus</h3><p>Choose what each helper does first. They finish their current delivery and help elsewhere when their focus is covered.</p>${state.workers
    .map((worker) => {
      const selected = worker.priority ?? 'balanced';
      const choice = (option: (typeof tasks)[number]) =>
        `<label class="staff-focus-option"><input type="radio" id="helper-${worker.id}-priority-${option.id}" name="helper-${worker.id}-priority" value="${option.id}" data-worker-priority="${worker.id}" data-focus-description="${option.detail}" aria-label="${option.name}" aria-describedby="helper-${worker.id}-focus-note" ${selected === option.id ? 'checked' : ''}><span class="staff-focus-tile">${option.image}<span>${option.name}</span><span class="staff-focus-check">${icon('check', 14)}</span></span></label>`;
      const description =
        [...tasks, ...products].find((option) => option.id === selected)?.detail ?? tasks[0].detail;
      return `<fieldset class="staff-focus-card"><legend>Helper ${worker.id} focus</legend><div class="staff-focus-tasks">${tasks.map(choice).join('')}</div><p class="staff-focus-divider">Or focus on a product</p><div class="staff-focus-products">${products.map(choice).join('')}</div><p class="staff-focus-note" id="helper-${worker.id}-focus-note">${description}</p></fieldset>`;
    })
    .join('')}</section>`;
}

export function productionPanel(state: GameState): string {
  const machines = MACHINES.filter((m) => state.upgrades[m.upgrade]);
  if (!machines.length) return '';
  return `<section class="production-plans"><h3>Fresh shelves or finished goods?</h3><p>These are helper priorities. You can still carry ingredients manually. Paused machines finish their current batch.</p>${machines
    .map(
      (m) =>
        `<article class="production-plan"><strong>${m.name}</strong><label class="management-control">Helper allocation<select data-machine-policy="${m.id}" aria-label="${m.name} helper allocation">${[
          ['balanced', 'Balanced rounds'],
          ['shelf-first', 'Fill fresh shelf, then process'],
          ['processing-first', 'Prioritize finished products'],
          ['paused', 'Pause new batches'],
        ]
          .map(
            ([id, label]) =>
              `<option value="${id}" ${state.career.machinePolicies[m.id] === id ? 'selected' : ''}>${label}</option>`,
          )
          .join(
            '',
          )}</select></label><label class="management-control">Fresh shelf target<input type="number" min="0" max="${state.shelfCapacities[m.input]}" step="1" value="${state.career.stockTargets[m.input]}" data-stock-target="${m.input}" aria-label="${m.name} fresh shelf target"></label><label class="management-control">Batch strategy<select data-batch-mode="${m.id}" aria-label="${m.name} batch strategy"><option value="quick" ${state.career.batchModes[m.id] === 'quick' ? 'selected' : ''}>Quick: start with available ingredients</option><option value="full" ${state.career.batchModes[m.id] === 'full' ? 'selected' : ''}>Efficient: wait for a full ${state.upgrades[m.upgrade] * 2}-item batch</option></select></label></article>`,
    )
    .join('')}</section>`;
}
