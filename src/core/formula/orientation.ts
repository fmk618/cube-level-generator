import {
    DEV_CUSTOM_COLOR_VALUES,
    type DevCustomColor,
    type DevCustomOrientation,
    type DevCustomOrientationRecord,
} from './types';
import type { ColorMatrix } from '../cube/types';

type FaceName = 'U' | 'D' | 'F' | 'B' | 'L' | 'R';
type Vec3 = readonly [number, number, number];

type ColorOption = {
    value: DevCustomColor;
    label: string;
};

const COLOR_TO_VECTOR: Record<DevCustomColor, Vec3> = {
    [DEV_CUSTOM_COLOR_VALUES.white]: [0, 1, 0],
    [DEV_CUSTOM_COLOR_VALUES.yellow]: [0, -1, 0],
    [DEV_CUSTOM_COLOR_VALUES.green]: [0, 0, 1],
    [DEV_CUSTOM_COLOR_VALUES.blue]: [0, 0, -1],
    [DEV_CUSTOM_COLOR_VALUES.red]: [1, 0, 0],
    [DEV_CUSTOM_COLOR_VALUES.orange]: [-1, 0, 0],
};

const VECTOR_TO_COLOR = new Map<string, DevCustomColor>(
    Object.entries(COLOR_TO_VECTOR).map(([color, vector]) => [vector.join(','), Number(color) as DevCustomColor]),
);

export const DEV_CUSTOM_COLOR_OPTIONS: ColorOption[] = [
    { value: DEV_CUSTOM_COLOR_VALUES.white, label: 'White' },
    { value: DEV_CUSTOM_COLOR_VALUES.yellow, label: 'Yellow' },
    { value: DEV_CUSTOM_COLOR_VALUES.red, label: 'Red' },
    { value: DEV_CUSTOM_COLOR_VALUES.orange, label: 'Orange' },
    { value: DEV_CUSTOM_COLOR_VALUES.blue, label: 'Blue' },
    { value: DEV_CUSTOM_COLOR_VALUES.green, label: 'Green' },
];

export const DEV_CUSTOM_COLOR_LABELS: Record<DevCustomColor, string> = Object.fromEntries(
    DEV_CUSTOM_COLOR_OPTIONS.map((option) => [option.value, option.label]),
) as Record<DevCustomColor, string>;

export const DEV_CUSTOM_OPPOSITE_COLOR: Record<DevCustomColor, DevCustomColor> = {
    [DEV_CUSTOM_COLOR_VALUES.white]: DEV_CUSTOM_COLOR_VALUES.yellow,
    [DEV_CUSTOM_COLOR_VALUES.yellow]: DEV_CUSTOM_COLOR_VALUES.white,
    [DEV_CUSTOM_COLOR_VALUES.red]: DEV_CUSTOM_COLOR_VALUES.orange,
    [DEV_CUSTOM_COLOR_VALUES.orange]: DEV_CUSTOM_COLOR_VALUES.red,
    [DEV_CUSTOM_COLOR_VALUES.blue]: DEV_CUSTOM_COLOR_VALUES.green,
    [DEV_CUSTOM_COLOR_VALUES.green]: DEV_CUSTOM_COLOR_VALUES.blue,
} as Record<DevCustomColor, DevCustomColor>;

const cross = ([ax, ay, az]: Vec3, [bx, by, bz]: Vec3): Vec3 => [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx,
];

const negate = ([x, y, z]: Vec3): Vec3 => [-x, -y, -z];

const vectorToColor = (vector: Vec3): DevCustomColor => {
    const color = VECTOR_TO_COLOR.get(vector.join(','));
    if (!color) {
        throw new Error(`Unrecognized orientation vector: ${vector.join(',')}`);
    }
    return color;
};

const buildOrientationRecord = (topColor: DevCustomColor, frontColor: DevCustomColor): DevCustomOrientationRecord => {
    if (frontColor === topColor || frontColor === DEV_CUSTOM_OPPOSITE_COLOR[topColor]) {
        throw new Error('Front color cannot be the same as or opposite to the top color');
    }

    const up = COLOR_TO_VECTOR[topColor];
    const front = COLOR_TO_VECTOR[frontColor];
    const right = cross(up, front);
    const down = negate(up);
    const back = negate(front);
    const left = negate(right);

    const faceToColor = {
        U: topColor,
        D: vectorToColor(down),
        F: frontColor,
        B: vectorToColor(back),
        L: vectorToColor(left),
        R: vectorToColor(right),
    } satisfies Record<FaceName, DevCustomColor>;

    return {
        topColor,
        frontColor,
        faceToColor,
        colorToFace: {
            [faceToColor.U]: 'U',
            [faceToColor.D]: 'D',
            [faceToColor.F]: 'F',
            [faceToColor.B]: 'B',
            [faceToColor.L]: 'L',
            [faceToColor.R]: 'R',
        } as Record<DevCustomColor, FaceName>,
    };
};

export const DEV_CUSTOM_ORIENTATION_RECORDS: DevCustomOrientationRecord[] = DEV_CUSTOM_COLOR_OPTIONS.flatMap(
    ({ value: topColor }) =>
        DEV_CUSTOM_COLOR_OPTIONS
            .filter(({ value }) => value !== topColor && value !== DEV_CUSTOM_OPPOSITE_COLOR[topColor])
            .map(({ value: frontColor }) => buildOrientationRecord(topColor, frontColor)),
);

export const resolveOrientationRecord = (
    orientation: DevCustomOrientation,
): DevCustomOrientationRecord => {
    const record = DEV_CUSTOM_ORIENTATION_RECORDS.find(
        (item) =>
            item.topColor === orientation.topColor
            && item.frontColor === orientation.frontColor,
    );
    if (!record) {
        throw new Error('Invalid top/front face combination');
    }
    return record;
};

export const getFrontColorOptions = (topColor: DevCustomColor): ColorOption[] =>
    DEV_CUSTOM_COLOR_OPTIONS.filter(
        (option) => option.value !== topColor && option.value !== DEV_CUSTOM_OPPOSITE_COLOR[topColor],
    );

export const buildOrientationColorMatrix = (orientation: DevCustomOrientation): ColorMatrix => {
    const { faceToColor } = resolveOrientationRecord(orientation);
    const faceOrder: FaceName[] = ['U', 'L', 'F', 'R', 'B', 'D'];
    return faceOrder.map((face) =>
        Array.from({ length: 3 }, () => Array(3).fill(faceToColor[face])),
    ) as ColorMatrix;
};

export const formatOrientationFaces = (orientation: DevCustomOrientation): string => {
    const { faceToColor } = resolveOrientationRecord(orientation);
    return (['U', 'D', 'F', 'B', 'L', 'R'] as FaceName[])
        .map((face) => `${face}=${DEV_CUSTOM_COLOR_LABELS[faceToColor[face]]}`)
        .join(' ');
};
