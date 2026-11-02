# Static server for the studio, plus:
#   POST /feedback          append one JSON line to feedback.jsonl
#   POST /upload?name=x     a screen recording (any video ffmpeg reads) -> rec/x/: 30fps frames, proxy.mp4 for live play, meta.json
#   GET  /recordings        meta.json of every recording, newest first
#   GET  /stills            names of the stills in src/ (dropped images land there too)
#   GET  /bestloop?rec=x    the in/out frames where the end matches the start best (so the loop needs little or no crossfade)
#   POST /export            start rendering a shot with motion.mjs in the background (with "rec": trim + crossfade the recording first)
#   GET  /export-status?name=x   where that render is: preparing, rendering (done/total frames), encoding, done (mp4) or failed
#   GET  /activity?rec=x    where things change in each frame of a recording (cursor, typing, a lens), smoothed: [[u, v, energy], ...]
import json, os, re, shutil, subprocess, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
LOG = ROOT / 'feedback.jsonl'
REC = ROOT / 'rec'
FPS = 30
PORT = 8790  # set from argv at startup; renders talk back to this server

def ff(*args): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *map(str, args)], check=True)

def frame(d, i, ext): return d / f'{i:04d}.{ext}'

# frames (extracted here or already recorded) -> proxy, thumbnail, meta
def ingest(d, source=None):
    if source: ff('-i', source, '-vf', f'fps={FPS}', '-start_number', '0', '-q:v', '2', d / '%04d.jpg')
    ext = 'jpg' if frame(d, 0, 'jpg').exists() else 'png'
    n = len(list(d.glob(f'[0-9][0-9][0-9][0-9].{ext}')))
    ff('-framerate', FPS, '-start_number', '0', '-i', d / f'%04d.{ext}', '-vf', "scale='min(1920,iw)':-2",
       '-c:v', 'libx264', '-crf', '20', '-g', '15', '-pix_fmt', 'yuv420p', d / 'proxy.mp4')
    im = Image.open(frame(d, 0, ext)); w, h = im.size
    im.convert('RGB').resize((320, round(320 * h / w))).save(d / 'thumb.jpg', quality=85)
    meta = {'id': d.name, 'frames': n, 'fps': FPS, 'w': w, 'h': h, 'ext': ext}
    (d / 'meta.json').write_text(json.dumps(meta))
    return meta

# frames in..out of a recording, the last `xfade` of them dissolved into the first, so the clip ends where it begins
def loop_clip(rec, a, b, c, dst):
    meta = json.loads((REC / rec / 'meta.json').read_text()); ext = meta['ext']; src = REC / rec
    b = min(b, meta['frames']); c = max(0, min(c, (b - a) // 2))
    shutil.rmtree(dst, ignore_errors=True); dst.mkdir(parents=True)
    for k in range((b - a) - c):
        out = frame(dst, k, ext)
        if k < c:
            w = (k + .5) / c
            Image.blend(Image.open(frame(src, b - c + k, ext)).convert('RGB'), Image.open(frame(src, a + k, ext)).convert('RGB'), w).save(out, quality=95)
        else:
            shutil.copyfile(frame(src, a + k, ext), out)
    return ext

# a shot's segments stitched into one sequence (frames in..out of each, from any recording), the last `xfade`
# dissolved into the first when looping. Frames from a recording shaped unlike the shot's first are scaled to cover it.
def build_clip(segs, c, dst):
    base = json.loads((REC / segs[0]['rec'] / 'meta.json').read_text()); ext = base['ext']; size = (base['w'], base['h'])
    srcs = []
    for sg in segs:
        m = json.loads((REC / sg['rec'] / 'meta.json').read_text())
        srcs += [(REC / sg['rec'], k, m['ext'], (m['w'], m['h'])) for k in range(max(0, sg['in']), min(sg['out'], m['frames']))]
    n = len(srcs); c = max(0, min(c, n // 2))
    def load(i):
        d, k, e, sz = srcs[i]; im = Image.open(frame(d, k, e)).convert('RGB')
        if sz != size:
            s = max(size[0] / sz[0], size[1] / sz[1]); im = im.resize((round(sz[0]*s), round(sz[1]*s)), Image.LANCZOS)
            l, t = (im.width - size[0]) // 2, (im.height - size[1]) // 2; im = im.crop((l, t, l + size[0], t + size[1]))
        return im
    shutil.rmtree(dst, ignore_errors=True); dst.mkdir(parents=True)
    for k in range(n - c):
        out = frame(dst, k, ext)
        if k < c: Image.blend(load(n - c + k), load(k), (k + .5) / c).save(out, quality=95)
        else:
            d, kk, e, sz = srcs[k]
            if e == ext and sz == size: shutil.copyfile(frame(d, kk, e), out)
            else: load(k).save(out, quality=95)
    return ext

# compare small grey thumbnails of every frame; the best pair (i, j) plays i..j-1 and frame j looks like frame i
def best_loop(rec, min_secs=2.0):
    meta = json.loads((REC / rec / 'meta.json').read_text()); ext = meta['ext']
    th = np.stack([np.asarray(Image.open(frame(REC / rec, i, ext)).convert('L').resize((96, 60)), dtype=np.float32) for i in range(meta['frames'])])
    th = th.reshape(len(th), -1)
    gap = int(min_secs * meta['fps']); best = (1e9, 0, len(th) - 1)
    for i in range(len(th) - gap):
        d = np.abs(th[i + gap:] - th[i]).mean(axis=1)
        d -= .0004 * np.arange(len(d))  # nudge toward longer clips when matches are about equal
        k = int(d.argmin())
        if d[k] < best[0]: best = (float(d[k]), i, i + gap + k)
    return {'in': best[1], 'out': best[2], 'score': round(best[0], 2), 'fps': meta['fps']}

# the centre of change in every frame, so the camera can follow the action. Frame differences on small grey
# thumbnails, weighted by how much changed; quiet frames keep the last place; then a heavy smooth, so the camera
# drifts after the action rather than chasing the cursor. Cached beside the recording.
def activity(rec):
    d = REC / rec; cache = d / 'activity-v2.json'
    if cache.exists(): return json.loads(cache.read_text())
    meta = json.loads((d / 'meta.json').read_text()); ext = meta['ext']
    fr = np.stack([np.asarray(Image.open(frame(d, i, ext)).convert('L').resize((160, 100)), dtype=np.float32) for i in range(meta['frames'])])
    ys, xs = np.mgrid[0:100, 0:160]; out = []; last = (.5, .5)
    for i in range(len(fr)):
        diff = np.abs(fr[i] - fr[max(i - 1, 0)]); diff[diff < 12] = 0; e = float(diff.sum())
        if e > 2000: last = (float((diff * xs).sum() / e / 160), float((diff * ys).sum() / e / 100))
        out.append([last[0], last[1], min(1., e / 4e5)])
    a = np.array(out); k = np.exp(-np.arange(-90, 91) ** 2 / (2 * 30 ** 2)); k /= k.sum()  # ~1s smooth: a slow focus pull, not a chase
    for c in (0, 1): a[:, c] = np.convolve(np.pad(a[:, c], 90, mode='edge'), k, mode='valid')
    res = [[round(float(u), 4), round(float(v), 4), round(float(e), 3)] for u, v, e in a]
    cache.write_text(json.dumps(res)); return res

# background renders, so the studio can show progress instead of waiting on one long request
JOBS = {}
def run_export(job):
    st = JOBS[job['name']]; loops = ROOT / 'out/loops'
    try:
        if job.get('rec'):
            seq = loops / job['name'] / 'src'
            job['seqExt'] = build_clip(job['segs'], job.get('xfade', 0), seq) if job.get('segs') else loop_clip(job['rec'], job['in'], job['out'], job.get('xfade', 0), seq)
            job['seqDir'] = str(seq.relative_to(ROOT))
        path = loops / f"{job['name']}.json"; path.write_text(json.dumps(job))
        st['state'] = 'rendering'
        p = subprocess.Popen(['node', 'motion.mjs', str(path)], cwd=ROOT, env={**os.environ, 'ANGLES_PORT': str(PORT)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        for line in p.stdout:
            if line.startswith('progress '): _, a, b = line.split(); st.update(done=int(a), total=int(b))
            elif line.startswith('encoding'): st['state'] = 'encoding'
            elif line.startswith('{'): st.update(json.loads(line), state='done')
        p.wait()
        if p.returncode != 0 or st['state'] != 'done': st.update(state='failed', error=(p.stderr.read() or 'render failed')[-300:])
    except Exception as e: st.update(state='failed', error=str(e)[-300:])

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def reply(self, obj):
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
        self.wfile.write(json.dumps(obj).encode())
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/bestloop':
            try: return self.reply({'ok': True, **best_loop(parse_qs(url.query)['rec'][0])})
            except Exception as e: return self.reply({'ok': False, 'error': str(e)[-300:]})
        rng = self.headers.get('Range')
        if rng and url.path.endswith(('.mp4', '.webm')): return self.ranged(ROOT / url.path.lstrip('/'), rng)
        if url.path == '/export-status':
            return self.reply(JOBS.get(parse_qs(url.query)['name'][0], {'state': 'unknown'}))
        if url.path == '/activity':
            try: return self.reply({'ok': True, 'track': activity(parse_qs(url.query)['rec'][0])})
            except Exception as e: return self.reply({'ok': False, 'error': str(e)[-300:]})
        if url.path == '/stills':
            return self.reply(sorted(p.stem for p in (ROOT / 'src').glob('*.png')))
        if url.path == '/recordings':
            metas = sorted(REC.glob('*/meta.json'), key=lambda p: p.stat().st_mtime, reverse=True)
            return self.reply([json.loads(p.read_text()) for p in metas])
        super().do_GET()
    # videos need byte ranges, or the browser can't seek them (every seek snaps back to 0)
    def ranged(self, path, rng):
        if not path.is_file(): return self.send_error(404)
        size = path.stat().st_size
        m = re.match(r'bytes=(\d*)-(\d*)', rng)
        start = int(m[1]) if m and m[1] else 0
        end = min(int(m[2]) if m and m[2] else size - 1, size - 1)
        self.send_response(206)
        self.send_header('Content-Type', 'video/mp4' if path.suffix == '.mp4' else 'video/webm')
        self.send_header('Accept-Ranges', 'bytes'); self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1)); self.end_headers()
        with path.open('rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(left, 1 << 20))
                if not chunk: break
                try: self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError): break
                left -= len(chunk)
    def do_POST(self):
        url = urlparse(self.path); size = int(self.headers['Content-Length'])
        if url.path == '/upload': return self.upload(parse_qs(url.query), size)
        body = json.loads(self.rfile.read(size))
        if url.path == '/export': return self.export(body)
        if url.path != '/feedback': return self.send_error(404)
        body['ts'] = time.strftime('%Y-%m-%d %H:%M:%S')
        with LOG.open('a') as f: f.write(json.dumps(body) + '\n')
        self.send_response(204); self.end_headers()
    def upload(self, q, size):
        name = re.sub(r'[^a-z0-9-]+', '-', q.get('name', ['take'])[0].lower()).strip('-') or 'take'
        ext = q.get('ext', ['webm'])[0].lower()
        if ext in ('png', 'jpg', 'jpeg', 'webp'):  # a still: straight into src/ as a png
            from io import BytesIO
            Image.open(BytesIO(self.rfile.read(size))).convert('RGB').save(ROOT / 'src' / f'{name}.png')
            return self.reply({'ok': True, 'kind': 'image', 'id': name})
        d = REC / name; shutil.rmtree(d, ignore_errors=True); d.mkdir(parents=True)
        src = d / f'source.{ext}'
        with src.open('wb') as f:
            while size > 0:
                chunk = self.rfile.read(min(size, 1 << 20)); size -= len(chunk); f.write(chunk)
                if not chunk: break
        try: self.reply({'ok': True, **ingest(d, src)})
        except Exception as e: self.reply({'ok': False, 'error': str(e)[-300:]})
    def export(self, job):
        (ROOT / 'out/loops').mkdir(parents=True, exist_ok=True)
        JOBS[job['name']] = {'state': 'preparing', 'done': 0, 'total': 0, 'started': time.time()}
        threading.Thread(target=run_export, args=(job,), daemon=True).start()
        self.reply({'ok': True, 'name': job['name']})
    def log_message(self, *a): pass

if __name__ == '__main__':
    if sys.argv[1:2] == ['ingest']:  # python3 serve.py ingest rec/<dir>: give an existing frame folder a proxy + meta
        print(ingest(ROOT / sys.argv[2])); sys.exit()
    PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    ThreadingHTTPServer(('', PORT), H).serve_forever()
