import type { ProductDefinition } from '../types';

export const PRODUCTS: ProductDefinition[] = [
  {
    id: 'tomato',
    name: 'Tomato',
    plural: 'Tomatoes',
    icon: 'tomato',
    productionTime: 5000,
    sellingPrice: 5,
    shelfCapacity: 8,
    unlockCost: 0,
    sprite: 'tomato',
    color: 0xe96850,
    shelf: { x: 265, y: 240 },
    farm: { x: 265, y: 590 },
  },
  {
    id: 'egg',
    name: 'Egg',
    plural: 'Eggs',
    icon: 'egg',
    productionTime: 7000,
    sellingPrice: 7,
    shelfCapacity: 8,
    unlockCost: 0,
    sprite: 'egg',
    color: 0xe8b94d,
    shelf: { x: 475, y: 240 },
    farm: { x: 475, y: 590 },
  },
  {
    id: 'corn',
    name: 'Corn',
    plural: 'Corn',
    icon: 'corn',
    productionTime: 10000,
    sellingPrice: 10,
    shelfCapacity: 8,
    unlockCost: 150,
    sprite: 'corn',
    color: 0xe3b443,
    shelf: { x: 685, y: 240 },
    farm: { x: 685, y: 590 },
  },
];
export const productById = (id: string): ProductDefinition | undefined =>
  PRODUCTS.find((product) => product.id === id);
export const emptyItems = () => ({ tomato: 0, egg: 0, corn: 0 });
