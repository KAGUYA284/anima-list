import test from 'node:test';
import assert from 'node:assert/strict';
import { isCardInteractiveTarget } from '../www/js/card-interaction.js';

test('card actions do not start swipe capture or card navigation', () => {
    const plusButtonChild = { closest: selector => selector.includes('button') ? { tagName: 'BUTTON' } : null };
    const cardContent = { closest: () => null };

    assert.equal(isCardInteractiveTarget(plusButtonChild), true);
    assert.equal(isCardInteractiveTarget(cardContent), false);
    assert.equal(isCardInteractiveTarget(null), false);
});
