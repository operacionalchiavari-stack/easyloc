"""Vetoriza o monograma da logo cadastrada, preservando o desenho da CH."""
from pathlib import Path
from PIL import Image
from collections import defaultdict
import math

root = Path(__file__).resolve().parents[1]
image = Image.open(root / 'android/branding/chiavari-logo-original.png').convert('RGBA')
pixels = image.load()
columns = [any(pixels[x, y][3] >= 128 for y in range(image.height)) for x in range(image.width)]
left = columns.index(True)
gap = 0
for x in range(left, image.width):
    gap = 0 if columns[x] else gap + 1
    if gap >= max(2, round(image.width * .005)):
        right = x - gap
        break
ink = {(x, y) for x in range(left, right + 1) for y in range(image.height) if pixels[x, y][3] >= 128}
top, bottom = min(y for x, y in ink), max(y for x, y in ink)
edges = defaultdict(list)
for x, y in ink:
    if (x, y-1) not in ink: edges[(x, y)].append((x+1, y))
    if (x+1, y) not in ink: edges[(x+1, y)].append((x+1, y+1))
    if (x, y+1) not in ink: edges[(x+1, y+1)].append((x, y+1))
    if (x-1, y) not in ink: edges[(x, y+1)].append((x, y))

def simplify(points, tolerance=.65):
    if len(points) < 3: return points
    a, b = points[0], points[-1]
    length = math.hypot(b[0]-a[0], b[1]-a[1]) or 1
    distances = [abs((b[0]-a[0])*(a[1]-p[1])-(a[0]-p[0])*(b[1]-a[1]))/length for p in points[1:-1]]
    distance = max(distances, default=0)
    if distance <= tolerance: return [a, b]
    index = distances.index(distance)+1
    return simplify(points[:index+1], tolerance)[:-1] + simplify(points[index:], tolerance)

scale = 64 / max(right-left+1, bottom-top+1)
offset_x = (108-(right-left+1)*scale)/2
offset_y = (108-(bottom-top+1)*scale)/2
paths = []
while edges:
    start = next(iter(edges))
    contour, current = [start], start
    while True:
        nxt = edges[current].pop()
        if not edges[current]: del edges[current]
        current = nxt
        if current == start: break
        contour.append(current)
    area = abs(sum(contour[i][0]*contour[(i+1)%len(contour)][1]-contour[(i+1)%len(contour)][0]*contour[i][1] for i in range(len(contour))))/2
    if area < 8: continue
    middle = max(range(len(contour)), key=lambda i: math.dist(start, contour[i]))
    contour = simplify(contour[:middle+1])[:-1] + simplify(contour[middle:]+[start])[:-1]
    points = [(offset_x+(x-left)*scale, offset_y+(y-top)*scale) for x, y in contour]
    paths.append('M'+'L'.join(f'{x:.3f},{y:.3f}' for x, y in points)+'Z')
path = ''.join(paths)
res = root/'android/app/src/main/res'
def vector(background=False):
    bg = '<path android:fillColor="#5a5a55" android:pathData="M0,0h108v108H0z"/>' if background else ''
    return f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">{bg}<path android:fillColor="#FFFFFF" android:fillType="evenOdd" android:pathData="{path}"/></vector>\n'
for name, bg in [('ic_ch_foreground',False),('ic_ch_legacy',True),('ic_notification',False)]:
    (res/'drawable'/f'{name}.xml').write_text(vector(bg), encoding='utf-8')
for version in [26, 33]:
    folder=res/f'mipmap-anydpi-v{version}';folder.mkdir(parents=True,exist_ok=True)
    monochrome='<monochrome android:drawable="@drawable/ic_ch_foreground"/>' if version >=33 else ''
    (folder/'ic_launcher.xml').write_text(f'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ch_background"/><foreground android:drawable="@drawable/ic_ch_foreground"/>{monochrome}</adaptive-icon>\n',encoding='utf-8')
(res/'values').mkdir(exist_ok=True)
(res/'values/colors.xml').write_text('<resources><color name="ch_background">#5a5a55</color></resources>\n',encoding='utf-8')
(root/'android/branding/ch-monograma.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><path fill="#5a5a55" d="M0 0h108v108H0z"/><path fill="#fff" fill-rule="evenodd" d="{path}"/></svg>\n',encoding='utf-8')
print(f'Monograma original convertido em {len(paths)} contornos vetoriais; variantes adaptativa e monocromática prontas.')
