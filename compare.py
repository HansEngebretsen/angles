# Side-by-side board of a variant set: python3 compare.py <set>  (reads out/variants/<set>.json from variants.mjs)
# -> out/variants/<set>-grid.mp4 (every variant playing in sync, labelled) and <set>-stills.png (the same moment of each)
import json, subprocess, sys, math
from PIL import Image, ImageDraw, ImageFont
name = sys.argv[1]; V = [v for v in json.load(open(f'out/variants/{name}.json')) if v.get('mp4')]
cols = 3 if len(V) > 4 else 2; rows = math.ceil(len(V) / cols); W, H = 640, 360
try: font = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 22)
except OSError: font = ImageFont.load_default()
labels = []
for i, v in enumerate(V):  # a label strip per tile, overlaid by ffmpeg (no drawtext in this build)
    im = Image.new('RGBA', (W, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    tw = d.textlength(v['name'], font=font); d.rounded_rectangle((10, 8, 30 + tw, 38), 8, fill=(15, 15, 18, 200)); d.text((20, 10), v['name'], font=font, fill=(255, 255, 255, 255))
    p = f'out/variants/.label{i}.png'; im.save(p); labels.append(p)
ins = sum([['-i', v['mp4']] for v in V], []) + sum([['-i', p] for p in labels], [])
f = ''.join(f'[{i}:v]scale={W}:{H},setsar=1[s{i}];[s{i}][{len(V)+i}:v]overlay=0:0[t{i}];' for i in range(len(V)))
blank = cols*rows - len(V)
if blank: f += ''.join(f'color=c=0x0e0e10:s={W}x{H}:d=30[b{j}];' for j in range(blank))
tiles = ''.join(f'[t{i}]' for i in range(len(V))) + ''.join(f'[b{j}]' for j in range(blank))
layout = '|'.join(f'{(k % cols)*W}_{(k // cols)*H}' for k in range(cols*rows))
f += f'{tiles}xstack=inputs={cols*rows}:layout={layout}:shortest=1[out]'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *ins, '-filter_complex', f, '-map', '[out]', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', f'out/variants/{name}-grid.mp4'], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '4.5', '-i', f'out/variants/{name}-grid.mp4', '-frames:v', '1', f'out/variants/{name}-stills.png'], check=True)
print(f'out/variants/{name}-grid.mp4', f'out/variants/{name}-stills.png')
