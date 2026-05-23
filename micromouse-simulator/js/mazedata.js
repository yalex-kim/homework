// Historical All Japan Micromouse contest mazes
// Source: github.com/micromouseonline/mazefiles (MIT licence)
// Format: o=post  ---=h-wall  |=v-wall  space=open

function parseMazeText(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    const padded = lines.map(l => l.padEnd(65, ' '));
    const N = 16;
    const walls = Array.from({length: N}, () =>
        Array.from({length: N}, () => ({n: true, e: true, s: true, w: true}))
    );
    // Interior horizontal walls (post rows k=1..15)
    for (let k = 1; k < N; k++) {
        const line = padded[2 * k] || '';
        for (let j = 0; j < N; j++) {
            if (line[j * 4 + 1] !== '-') {
                walls[k - 1][j].s = false;
                walls[k][j].n     = false;
            }
        }
    }
    // Interior vertical walls (cell rows, j=1..15)
    for (let k = 0; k < N; k++) {
        const line = padded[2 * k + 1] || '';
        for (let j = 1; j < N; j++) {
            if (line[j * 4] !== '|') {
                walls[k][j - 1].e = false;
                walls[k][j].w     = false;
            }
        }
    }
    return walls;
}

const MAZE_PRESETS = [
{
    id: '2025',
    label: '2025 全日本 第46回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|   |                                               |           |
o   o---o   o   o---o---o   o   o   o---o---o   o---o---o   o   o
|   |       |       |       |   |       |                   |   |
o   o   o---o---o   o   o---o   o---o   o   o---o---o   o---o   o
|                   |       |   |       |       |           |   |
o   o   o---o---o   o---o   o   o   o---o---o   o---o   o   o   o
|   |       |       |                   |       |       |       |
o   o---o   o   o   o   o---o---o   o   o   o   o   o---o---o   o
|   |           |           |       |   |   |           |       |
o   o   o   o---o---o   o   o---o---o---o   o---o   o   o   o   o
|       |       |       |   |       |       |       |       |   |
o   o---o---o   o   o---o   o---o   o   o   o   o---o   o---o   o
|               |       |   |           |           |       |   |
o   o   o   o---o---o   o   o   o---o   o---o   o   o   o   o   o
|   |   |                   | G   G |   |       |       |       |
o---o   o---o   o---o---o   o   o   o   o   o   o---o   o---o   o
|   |   |           |   |   | G   G |       |   |       |       |
o   o   o   o---o---o   o---o---o---o   o---o---o---o---o   o   o
|               |       |       |       |   |       |       |   |
o   o---o---o   o   o---o---o   o---o---o   o   o   o   o---o---o
|       |                           |   |       |               |
o---o   o   o   o---o---o   o   o---o   o---o   o---o---o   o   o
|   |       |       |       |       |   |       |   |       |   |
o   o---o   o---o   o   o---o---o   o   o   o---o   o   o---o   o
|   |       |               |                   |           |   |
o   o   o   o   o---o---o   o   o---o---o---o   o---o---o   o   o
|       |           |               |       |                   |
o   o   o---o   o   o---o---o   o   o   o---o---o   o   o   o   o
|   |   |       |       |       |                   |   |   |   |
o   o   o   o---o---o   o   o---o---o   o---o---o   o---o---o   o
| S |                                       |                   |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '2024',
    label: '2024 全日本 第45回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|   |   |   |   |                                           |
o   o   o   o   o   o   o---o   o---o---o   o---o---o---o   o
|   |                   |       |               |               |
o   o   o   o   o   o   o---o   o   o---o---o---o   o---o   o   o
|       |   |   |   |           |   |       |               |   |
o   o---o---o   o---o---o---o   o   o   o   o   o---o   o   o   o
|   |       |       |       |       |   |   |   |       |   |   |
o   o   o   o---o   o   o   o---o---o   o   o   o   o   o   o   o
|       |       |   |   |               |   |       |   |       |
o   o   o---o   o   o   o   o---o   o   o   o   o---o   o   o   o
|   |       |   |   |   |   |       |   |   |   |   |   |   |   |
o   o---o   o   o   o   o   o   o---o   o   o   o   o   o   o   o
|               |   |   |               |   |   |   |   |   |   |
o---o---o---o   o   o   o   o---o---o   o   o   o   o   o   o---o
|               |   |   |   | G   G |   |       |   |   |   |   |
o   o---o   o---o   o   o   o   o   o   o---o---o   o   o   o   o
|   |           |   |   |   | G   G |   |               |   |   |
o   o   o   o   o   o   o   o   o---o   o---o   o   o   o   o   o
|       |   |   |   |   |               |       |   |   |   |   |
o   o---o   o   o   o   o---o---o---o---o   o---o   o   o   o   o
|           |       |                               |           |
o   o   o   o---o---o---o---o---o---o---o---o---o---o   o---o   o
|   |   |           |                               |       |   |
o   o---o   o---o   o   o---o---o---o---o---o---o   o---o   o   o
|       |   |       |                   |           |           |
o   o   o   o---o   o   o---o   o---o   o   o---o---o---o---o   o
|   |   |           |       |   |       |                       |
o   o   o   o---o---o   o---o   o   o---o   o---o   o   o   o   o
|   |   |               |   |   |               |   |   |   |   |
o   o   o---o---o---o   o   o   o---o---o   o---o   o---o---o   o
| S |                   |                       |               |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '2023',
    label: '2023 全日本 第44回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|       |                                                       |
o   o   o   o---o---o---o---o---o   o---o   o---o---o---o---o   o
|   |       |                   |       |   |               |   |
o   o---o---o   o---o---o---o   o---o   o   o   o---o---o   o   o
|               |           |       |   |           |   |   |   |
o   o---o---o---o   o---o   o   o---o   o   o---o   o   o   o   o
|   |       |               |       |   |           |   |   |   |
o   o   o   o   o---o---o---o---o   o   o---o---o---o   o   o   o
|   |   |   |   |               |   |   |               |   |   |
o   o   o   o   o   o---o---o---o   o   o   o---o   o   o   o   o
|   |   |   |   |   |                   |   |       |   |   |   |
o   o   o   o   o   o---o---o---o---o---o---o   o---o   o   o   o
|   |   |   |       |                   |       |       |   |   |
o   o---o   o---o   o   o---o---o---o   o   o---o   o   o   o   o
|   |   |   |   |   |   |   | G   G |       |       |       |   |
o   o   o   o   o   o   o   o   o   o   o---o---o---o---o   o   o
|           |   |   |   |   | G   G     |               |   |   |
o   o   o   o   o   o   o   o   o---o---o   o---o   o   o   o   o
|   |   |   |   |   |   |               |   |       |   |   |   |
o   o   o   o   o   o   o---o---o---o   o   o   o   o   o   o   o
|   |   |           |               |   |       |   |   |       |
o   o---o---o---o---o---o---o---o   o   o   o---o   o   o   o   o
|                   |               |           |   |       |   |
o   o   o---o---o   o   o---o---o---o---o---o---o   o---o   o   o
|   |   |       |   |                   |       |           |   |
o   o   o   o   o   o---o---o---o---o   o   o---o---o---o---o   o
|       |   |       |                   |                       |
o   o   o   o---o---o   o---o---o---o---o---o---o   o   o   o   o
|   |   |       |                                   |   |   |   |
o   o---o   o---o---o---o---o---o---o---o---o   o   o---o---o   o
| S |                                           |               |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '2012',
    label: '2012 全日本 第33回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|       |                                       |       |       |
o   o   o   o---o---o---o   o---o---o---o---o   o   o   o   o   o
|   |   |   |       |       |                   |   |   |   |   |
o   o   o   o   o   o   o---o   o---o---o---o---o   o   o   o   o
|   |       |   |           |                   |   |       |   |
o   o---o---o   o   o---o---o---o---o---o---o   o   o---o---o   o
|               |   |                           |           |   |
o   o---o---o---o   o   o---o---o---o---o---o   o---o---o   o   o
|   |               |   |               |       |           |   |
o   o   o---o   o---o   o   o   o---o   o   o---o   o---o   o   o
|       |       |   |   |   |       |   |       |   |       |   |
o   o---o   o---o   o   o   o   o   o   o---o   o   o   o---o   o
|   |               |   |       |   |   |       |           |   |
o   o   o---o---o   o   o   o   o---o   o   o---o   o---o   o   o
|       |           |   |   | G   G |   |   |               |   |
o   o---o   o---o   o   o   o   o   o   o   o   o---o   o---o   o
|               |   |   |   | G   G |   |       |           |   |
o   o   o---o   o   o   o   o   o---o   o   o---o   o---o---o   o
|   |       |       |   |   |       |       |           |       |
o   o---o   o---o   o   o   o   o   o---o---o   o---o---o   o   o
|                   |       |   |   |           |           |   |
o---o---o---o---o   o   o   o   o   o   o---o   o---o   o   o   o
|                   |   |   |       |           |       |   |   |
o   o---o---o---o   o   o   o   o   o   o---o---o   o---o   o   o
|           |       |           |       |       |   |       |   |
o---o---o   o---o   o---o---o   o---o   o   o   o   o   o---o   o
|       |       |           |           |   |   |   |           |
o   o   o   o   o   o---o   o---o---o---o   o   o   o   o---o---o
|   |   |   |   |   |                       |       |           |
o   o   o   o   o   o---o---o---o---o---o---o---o---o---o---o   o
| S |       |                                                   |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '2011',
    label: '2011 全日本 第32回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|                                                               |
o   o---o---o---o---o---o   o   o---o---o---o   o   o   o   o   o
|       |               |   |       |       |   |   |   |   |   |
o   o   o   o   o---o---o   o   o   o   o   o---o---o   o   o   o
|   |   |   |           |       |       |                   |   |
o   o   o   o---o---o   o   o   o   o---o   o   o---o   o   o   o
|   |   |           |   |   |       |       |           |   |   |
o   o   o---o   o---o   o   o   o---o   o---o   o   o---o   o   o
|   |       |   |       |               |       |   |       |   |
o   o   o---o   o---o   o---o---o---o---o   o   o   o   o---o   o
|           |       |   |                   |   |       |       |
o---o   o---o---o   o---o   o---o---o   o   o   o   o---o   o---o
|                   |                   |           |       |   |
o---o   o---o---o---o   o---o---o---o   o---o   o   o---o   o---o
|           |       |       | G   G |   |       |   |           |
o---o   o---o   o   o   o   o   o   o---o   o   o---o---o---o   o
|           |   |   |   |   | G   G |       |   |       |       |
o---o   o---o   o   o   o   o   o---o   o   o---o   o   o   o   o
|   |       |   |   |           |       |   |       |       |   |
o   o---o   o   o   o---o   o---o   o   o---o   o   o---o---o   o
|   |           |       |           |   |       |   |           |
o   o---o---o   o   o   o---o---o---o---o   o   o---o---o---o   o
|   |       |       |   |   |   |       |   |   |               |
o   o   o---o---o   o   o   o   o   o   o   o   o   o   o---o   o
|   |       |       |       |   |   |       |       |   |       |
o   o   o---o   o   o---o   o   o   o---o---o   o   o---o---o   o
|       |       |   |   |       |   |   |       |       |       |
o   o---o   o---o   o   o   o---o   o   o   o---o---o   o---o   o
|               |   |   |   |       |   |       |               |
o   o   o---o---o   o   o   o   o---o   o---o   o   o---o   o---o
| S |                                                           |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '2009',
    label: '2009 全日本 第30回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|                                                               |
o   o---o---o---o---o---o---o---o---o---o---o---o---o---o---o   o
|                           |                                   |
o---o   o---o---o---o---o   o   o---o---o---o---o---o---o---o---o
|           |               |               |                   |
o---o   o---o   o---o---o---o---o---o---o   o   o   o---o---o   o
|           |   |               |           |   |           |   |
o---o   o---o   o   o---o   o---o   o---o---o   o---o   o---o   o
|           |   |       |       |       |       |       |       |
o---o   o---o   o---o   o---o   o---o   o   o---o   o   o   o---o
|           |       |       |   |           |       |   |       |
o---o   o---o---o   o---o   o   o   o---o---o   o   o   o---o   o
|           |           |   |       |   |       |       |       |
o---o   o---o---o---o   o   o---o---o   o   o   o   o---o   o---o
|       |           |   |   | G   G |       |   |   |           |
o   o   o   o---o   o   o   o   o   o   o---o   o   o   o---o   o
|   |   |       |   |       | G   G                 |           |
o   o   o---o   o   o---o---o---o---o---o---o---o---o---o   o---o
|               |   |           |           |       |           |
o   o   o---o---o   o   o---o   o   o---o   o   o   o---o---o   o
|   |       |       |   |       |   |   |   |   |           |   |
o   o   o   o   o   o   o   o---o   o   o   o   o---o---o   o   o
|       |       |   |   |       |       |   |       |       |   |
o   o   o   o---o   o   o---o   o---o---o   o---o   o   o---o   o
|   |                   |           |               |           |
o   o   o---o---o   o---o   o---o   o---o   o---o---o---o---o   o
|       |           |       |               |       |           |
o   o---o   o---o---o   o---o   o---o   o---o   o   o   o---o---o
|       |       |       |           |           |               |
o   o   o   o   o   o   o---o---o   o   o---o---o---o---o---o   o
| S |       |       |               |                           |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '1998',
    label: '1998 全日本 第19回 Expert 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|           |               |       |                           |
o   o   o---o   o---o---o   o   o   o   o---o---o---o---o---o   o
|   |       |           |       |       |                       |
o   o   o   o---o---o   o---o---o   o---o   o---o---o---o---o   o
|   |   |       |       |           |       |       |       |   |
o   o---o---o   o   o---o---o   o---o   o---o   o---o   o---o   o
|   |       |       |           |       |   |   |           |   |
o   o   o   o---o---o   o---o---o   o---o   o   o   o---o   o---o
|   |   |                   |       |               |       |   |
o   o   o---o---o---o---o---o   o---o   o---o   o---o   o---o   o
|   |       |       |       |   |       |       |       |       |
o   o---o   o   o   o   o   o   o   o---o   o---o   o---o   o   o
|   |       |   |   |   |   |       |       |       |       |   |
o   o   o---o   o   o   o   o---o---o   o---o   o---o   o---o   o
|   |       |   |   |   |   | G   G |   |       |       |       |
o   o---o   o   o   o   o   o   o   o   o   o---o   o---o   o---o
|   |       |   |   |   |   | G   G     |       |       |       |
o   o   o---o   o   o   o   o   o---o---o   o   o---o   o---o   o
|   |           |       |       |           |       |       |   |
o   o---o---o---o---o---o---o---o---o---o   o---o   o---o   o   o
|   |   |       |       |       |       |       |       |   |   |
o   o   o   o   o   o   o   o   o   o   o---o   o---o   o   o   o
|   |       |       |       |       |               |       |   |
o   o   o---o---o---o---o---o---o---o---o---o---o---o---o---o   o
|   |   |   |   |   |   |   |   |   |       |       |       |   |
o   o   o   o   o   o   o   o   o   o   o   o   o   o   o   o   o
|   |                                   |       |       |   |   |
o   o---o   o   o   o   o   o   o   o   o   o---o---o---o   o   o
|       |   |   |   |   |   |   |   |       |       |       |   |
o   o   o---o---o---o---o---o---o---o---o   o   o   o   o   o   o
| S |                                           |       |       |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
{
    id: '1985',
    label: '1985 全日本 第6回 決勝',
    text:
`o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o
|                       |       |                               |
o   o---o---o---o---o---o   o   o   o---o---o---o---o   o---o   o
|                           |   |                       |   |   |
o   o---o---o---o---o---o---o   o---o---o---o---o---o   o   o   o
|   |                                               |   |   |   |
o   o   o---o---o---o---o---o---o---o---o---o---o   o   o   o   o
|       |                                       |   |   |       |
o---o   o   o---o   o---o---o   o---o---o---o   o   o   o---o   o
|       |                                   |   |   |   |   |   |
o   o   o---o---o   o---o---o---o---o   o   o   o   o   o   o   o
|   |   |       |                       |   |   |       |   |   |
o   o---o---o   o   o---o---o   o---o   o   o   o---o---o   o   o
|               |                   |   |   |   |               |
o   o   o---o   o   o---o---o   o---o   o   o   o   o   o   o   o
|   |       |   |   |       | G   G |   |   |   |   |   |   |   |
o   o   o   o   o   o   o   o   o   o   o   o   o   o   o   o   o
|   |   |   |   |   |   |   | G   G |           |   |   |   |   |
o   o   o   o   o   o   o   o---o---o---o   o---o   o   o   o   o
|           |   |   |                               |   |   |   |
o---o---o---o   o---o   o---o---o---o---o---o---o---o   o   o   o
|                   |                                   |   |   |
o   o---o---o---o   o---o---o---o---o---o---o---o---o---o   o   o
|   |           |   |                                           |
o   o   o---o   o   o---o---o   o   o---o---o---o---o---o---o---o
|   |   |       |           |   |       |                       |
o   o   o   o---o   o---o   o   o---o   o---o---o---o   o   o   o
|   |               |   |   |                       |   |   |   |
o   o   o---o---o---o   o---o---o---o---o---o---o   o   o   o   o
|   |                                           |   |   |   |   |
o   o   o---o---o---o   o---o---o---o   o---o---o   o   o   o   o
| S |                               |                           |
o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o---o`
},
];
