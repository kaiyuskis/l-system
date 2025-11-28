let currentSeed = 0;

export function setSeed(seed: number) {
    currentSeed = seed;
}

export function random(): number {
    currentSeed = (currentSeed * 16807) % 2147483647;
    return (currentSeed - 1) / 2147483646;
}