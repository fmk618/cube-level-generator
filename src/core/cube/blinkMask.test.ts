import { describe, expect, it } from 'vitest';
import {
    createEmptyBlinkMaskMatrix,
    hasAnyBlinkMask,
    sanitizeBlinkMaskMatrix,
} from '@/core/cube';

describe('blinkMaskMatrix', () => {
    it('returns false for empty mask', () => {
        expect(hasAnyBlinkMask(undefined)).toBe(false);
        expect(hasAnyBlinkMask(createEmptyBlinkMaskMatrix())).toBe(false);
    });

    it('drops blink bits outside brightness mask', () => {
        const brightness = createEmptyBlinkMaskMatrix().map((face) =>
            face.map((row) => row.map(() => 0)),
        );
        brightness[2][1][1] = 8;
        const blink = createEmptyBlinkMaskMatrix();
        blink[2][1][1] = 1;
        blink[0][0][0] = 1;
        const sanitized = sanitizeBlinkMaskMatrix(blink, brightness);
        expect(sanitized?.[2][1][1]).toBe(1);
        expect(sanitized?.[0][0][0]).toBe(0);
    });
});
