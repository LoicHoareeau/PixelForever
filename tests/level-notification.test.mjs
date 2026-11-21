import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainingCombat } from '../public/game/combat.js';
import { updateLevelUpBannerUi } from '../public/game/combat-ui.js';

test('les notifications de niveau se succèdent sans écraser celles déjà affichées', () => {
    const toast = { hidden: true, textContent: '' };
    const combat = Object.create(TrainingCombat.prototype);
    combat.levelUpBanner = toast;
    combat.showLevelUpBanner(0, 2);
    combat.showLevelUpBanner(1000, 1);
    for (let i = 0; i < 3; i++) {
        assert.equal(toast.hidden, false);
        assert.equal(toast.textContent, 'Vous avez prit un niveau');
        updateLevelUpBannerUi(combat, i * 3150 + 2999);
        assert.equal(toast.hidden, false);
        updateLevelUpBannerUi(combat, i * 3150 + 3000);
        assert.equal(toast.hidden, true);
        updateLevelUpBannerUi(combat, i * 3150 + 3149);
        assert.equal(toast.hidden, true);
        updateLevelUpBannerUi(combat, (i + 1) * 3150);
    }
    assert.equal(toast.hidden, true);
    assert.equal(combat.levelNotifications, 0);
    assert.equal(combat.levelUpBannerUntil, undefined);
});
