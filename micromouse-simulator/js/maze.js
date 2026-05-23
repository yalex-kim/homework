class Maze {
    constructor(width = 16, height = 16) {
        this.width = width;
        this.height = height;
        this.reset();
        this.generate();
    }

    reset() {
        // walls[y][x] = {n, e, s, w} — true means wall exists
        this.walls = Array.from({ length: this.height }, () =>
            Array.from({ length: this.width }, () => ({ n: true, e: true, s: true, w: true }))
        );
        this.explored = Array.from({ length: this.height }, () =>
            Array(this.width).fill(false)
        );
    }

    generate() {
        this.reset();
        const seen = Array.from({ length: this.height }, () =>
            Array(this.width).fill(false)
        );
        const stack = [[0, this.height - 1]];
        seen[this.height - 1][0] = true;

        // [dx, dy, wallFrom, wallTo]
        const DIRS = [
            [0, -1, 'n', 's'],
            [1,  0, 'e', 'w'],
            [0,  1, 's', 'n'],
            [-1, 0, 'w', 'e'],
        ];

        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const nbrs = DIRS
                .map(([dx, dy, f, t]) => [x + dx, y + dy, f, t])
                .filter(([nx, ny]) =>
                    nx >= 0 && nx < this.width &&
                    ny >= 0 && ny < this.height &&
                    !seen[ny][nx]
                );

            if (!nbrs.length) { stack.pop(); continue; }

            const [nx, ny, from, to] = nbrs[Math.floor(Math.random() * nbrs.length)];
            this.walls[y][x][from] = false;
            this.walls[ny][nx][to] = false;
            seen[ny][nx] = true;
            stack.push([nx, ny]);
        }

        this._openGoalArea();
        this._applyFixedWalls();
    }

    // Fixed wall constraints applied after every generation
    _applyFixedWalls() {
        // Cell (1,1): east wall always blocked, north wall always open
        this.walls[1][1].e = true;
        this.walls[1][2].w = true;   // mirror on east neighbor
        this.walls[1][1].n = false;
        this.walls[0][1].s = false;  // mirror on north neighbor
    }

    _openGoalArea() {
        // Remove internal walls between center 2×2 cells (7,7)~(8,8)
        const gx = 7, gy = 7;
        this.walls[gy][gx].e       = false;
        this.walls[gy][gx + 1].w   = false;
        this.walls[gy + 1][gx].e   = false;
        this.walls[gy + 1][gx + 1].w = false;
        this.walls[gy][gx].s       = false;
        this.walls[gy + 1][gx].n   = false;
        this.walls[gy][gx + 1].s   = false;
        this.walls[gy + 1][gx + 1].n = false;
    }

    loadPreset(wallsData) {
        this.explored = Array.from({ length: this.height }, () =>
            Array(this.width).fill(false)
        );
        for (let y = 0; y < this.height; y++)
            for (let x = 0; x < this.width; x++)
                this.walls[y][x] = {...wallsData[y][x]};
    }

    hasWall(x, y, dir) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
        return this.walls[y][x][dir];
    }

    isGoal(x, y) {
        return (x === 7 || x === 8) && (y === 7 || y === 8);
    }
}
