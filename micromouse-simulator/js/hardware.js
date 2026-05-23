// Trapezoidal velocity profile: time (seconds) to travel `dist` from v0 to v1
function trapezoidalTime(dist, v0, v1, vMax, accel, decel) {
    if (dist <= 0) return 0;
    v0 = Math.min(v0, vMax);
    v1 = Math.min(v1, vMax);

    const dAccel = (vMax * vMax - v0 * v0) / (2 * accel);
    const dDecel = (vMax * vMax - v1 * v1) / (2 * decel);

    if (dAccel + dDecel <= dist) {
        // Trapezoidal: accel → cruise → decel
        return (vMax - v0) / accel
             + (dist - dAccel - dDecel) / vMax
             + (vMax - v1) / decel;
    }
    // Triangular: no cruise phase
    const vPeak = Math.sqrt(
        (2 * accel * decel * dist + accel * v1 * v1 + decel * v0 * v0) / (accel + decel)
    );
    return (vPeak - v0) / accel + (vPeak - v1) / decel;
}

class HardwareProfile {
    constructor(opts = {}) {
        this.maxSpeed     = opts.maxSpeed     ?? 2.3;    // m/s
        this.accel        = opts.accel        ?? 7.5;    // m/s²
        this.decel        = opts.decel        ?? 7.5;    // m/s²
        this.maxOmega     = opts.maxOmega     ?? 360;    // deg/s  (pivot turn)
        this.alphaOmega   = opts.alphaOmega   ?? 720;    // deg/s² (pivot angular accel)
        this.turnType     = opts.turnType     ?? 'smooth'; // 'pivot' | 'smooth'
        this.smoothRadius = opts.smoothRadius ?? 0.015;  // m
        this.cellSize     = opts.cellSize     ?? 0.180;  // m (standard 180 mm)
        this.treadWidth   = opts.treadWidth   ?? 0.086;  // m (86 mm default)
    }

    // Physical time (s) for a straight move of n cells
    straightCellTime(n = 1, v0 = 0, v1 = 0) {
        return trapezoidalTime(
            n * this.cellSize, v0, v1,
            this.maxSpeed, this.accel, this.decel
        );
    }

    // Physical time (s) for a pivot turn of deg degrees
    pivotTurnTime(deg = 90) {
        return trapezoidalTime(
            Math.abs(deg), 0, 0,
            this.maxOmega, this.alphaOmega, this.alphaOmega
        );
    }

    // Physical time (s) for a smooth 90° arc turn
    smoothTurnTime() {
        const r = Math.min(this.smoothRadius, this.cellSize * 0.45);
        // Max speed limited by lateral acceleration (1 g ≈ 9.8 m/s²)
        const vTurn = Math.min(Math.sqrt(9.8 * r), this.maxSpeed);
        return (r * Math.PI / 2) / vTurn;
    }

    // Ratio: pivot_turn_time / straight_cell_time  (for animation scaling)
    get pivotRatio() {
        return this.pivotTurnTime(90) / Math.max(this.straightCellTime(), 1e-6);
    }

    // Ratio: smooth_turn_time / straight_cell_time  (for animation scaling)
    get smoothRatio() {
        return this.smoothTurnTime() / Math.max(this.straightCellTime(), 1e-6);
    }
}
