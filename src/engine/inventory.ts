import type { EntityId, InventoryStack } from "../shared/types";

export const MAX_STACK_QUANTITY = 99;

export function inventoryQuantity(inventory: readonly InventoryStack[], itemId: EntityId): number {
  return inventory.find((stack) => stack.itemId === itemId)?.quantity ?? 0;
}

export function addItem(
  inventory: readonly InventoryStack[],
  itemId: EntityId,
  quantity = 1,
  maximumStack = MAX_STACK_QUANTITY
): InventoryStack[] {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("Item quantity must be a positive integer");
  }
  const existing = inventoryQuantity(inventory, itemId);
  if (existing + quantity > maximumStack) {
    throw new RangeError(`Adding '${itemId}' would exceed its stack limit`);
  }
  const found = inventory.some((stack) => stack.itemId === itemId);
  return found
    ? inventory.map((stack) => stack.itemId === itemId ? { ...stack, quantity: stack.quantity + quantity } : { ...stack })
    : [...inventory.map((stack) => ({ ...stack })), { itemId, quantity }];
}

export function removeItem(inventory: readonly InventoryStack[], itemId: EntityId, quantity = 1): InventoryStack[] {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("Item quantity must be a positive integer");
  }
  const existing = inventoryQuantity(inventory, itemId);
  if (existing < quantity) {
    throw new RangeError(`Inventory does not contain ${quantity} of '${itemId}'`);
  }
  return inventory.flatMap((stack) => {
    if (stack.itemId !== itemId) {
      return [{ ...stack }];
    }
    const nextQuantity = stack.quantity - quantity;
    return nextQuantity > 0 ? [{ ...stack, quantity: nextQuantity }] : [];
  });
}

export function hasItems(
  inventory: readonly InventoryStack[],
  requirements: readonly InventoryStack[]
): boolean {
  return requirements.every((required) => inventoryQuantity(inventory, required.itemId) >= required.quantity);
}

