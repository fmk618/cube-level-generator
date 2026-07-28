export type Mat3 = Float32Array & { length: 9 };
export type Vec3 = [number, number, number];

export const makeMat3 = (values?: readonly number[]): Mat3 => {
    const matrix = new Float32Array(9) as Mat3;
    if (values?.length === 9) {
        matrix.set(values);
        return matrix;
    }

    matrix[0] = 1;
    matrix[4] = 1;
    matrix[8] = 1;
    return matrix;
};

export const applyMat3ToVec3 = (
    matrix: Mat3,
    vector: readonly [number, number, number],
    output: Vec3 | Float32Array = [0, 0, 0],
): Vec3 => {
    const [x, y, z] = vector;
    output[0] = matrix[0] * x + matrix[1] * y + matrix[2] * z;
    output[1] = matrix[3] * x + matrix[4] * y + matrix[5] * z;
    output[2] = matrix[6] * x + matrix[7] * y + matrix[8] * z;
    return output as Vec3;
};
