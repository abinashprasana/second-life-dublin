"""Export decorative SVG linework from the already projected local scene."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    scene = json.loads((ROOT / 'web/public/data/dublin_scene.json').read_text(encoding='utf-8'))
    target = ROOT / 'web/public/art'
    target.mkdir(exist_ok=True)
    x0, y0, x1, y1 = scene['bounds']
    scale = 1000 / (x1-x0)
    height = (y1-y0)*scale
    for layer in ('outline', 'areas'):
        paths = []
        for polygon in scene[layer]:
            rings = []
            for ring in polygon:
                rings.append('M' + ' L'.join(f'{(x-x0)*scale:.2f},{(y-y0)*scale:.2f}' for x,y in ring) + ' Z')
            paths.append('<path d="' + ' '.join(rings) + '"/>')
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 1004 {height+4:.2f}" fill="none" stroke="#B9D8F0" stroke-width="{1.6 if layer=="outline" else .55}" fill-rule="evenodd"><!-- Decorative Dublin geography; source attribution remains in the product footer. -->' + ''.join(paths) + '</svg>'
        (target / f'dublin-{layer}.svg').write_text(svg, encoding='utf-8')

if __name__ == '__main__':
    main()
