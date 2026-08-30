const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]';

export function isCardInteractiveTarget(target) {
    return Boolean(target?.closest?.(INTERACTIVE_SELECTOR));
}
