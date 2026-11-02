// Camera shader: the screenshot on a tilted plane, depth-of-field from distance, LCD grid, light, bloom, tone, grain.
window.FS = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D T; uniform vec2 TS; uniform vec2 OUT;
uniform vec3 ROT, BGC, BGC2; uniform float BGK; /* BGK 1: a soft two-tone wash from BGC to BGC2 */ uniform float FOV, ZOOM, AP, GRID, PITCH, LIGHT, SHEEN, BLOOM, LIFT, SAT, WARM, CA, GRAIN, VIG, RAD, SHADOW;
uniform vec2 C, F, L;
uniform float SEED, EDGE, GRIT, REFL, GLOW, RIM, SOFT, SPREAD, STROKE;
uniform float EXPO, CON, MATTE, FSP; // FSP: the in-focus band's width (the focus point's spread)
uniform float FOCV; // focus view: paints what's sharp and what's feathered
uniform vec4 CR; // the crop: the part of the source that is the screen, in source uv
float A, stripeK, rowK;
mat3 R; vec3 ex, ey, n, cen, cam;

mat3 rot(vec3 a){
  a = radians(a);
  mat3 rx = mat3(1,0,0, 0,cos(a.x),sin(a.x), 0,-sin(a.x),cos(a.x));
  mat3 ry = mat3(cos(a.y),0,-sin(a.y), 0,1,0, sin(a.y),0,cos(a.y));
  mat3 rz = mat3(cos(a.z),sin(a.z),0, -sin(a.z),cos(a.z),0, 0,0,1);
  return rz*ry*rx;
}
vec3 rayDir(vec2 px){
  vec2 ndc = px/OUT*2.-1.;
  float t = tan(radians(FOV)*.5);
  return normalize(vec3(ndc.x*t*OUT.x/OUT.y, ndc.y*t, -1));
}
// returns uv (may be outside 0..1) and distance
vec3 hit(vec2 px){
  vec3 d = rayDir(px);
  float t = dot(cen-cam, n)/dot(d, n);
  vec3 p = cam + t*d - cen;
  float lx = dot(p, ex), ly = dot(p, ey);
  return vec3(lx/A + .5, .5 - ly, t);
}
float rrect(vec2 uv){ // signed distance in plane units, <0 inside
  vec2 q = abs((uv-.5)*vec2(A,1.)) - vec2(A,1.)*.5 + RAD;
  return length(max(q,0.)) + min(max(q.x,q.y),0.) - RAD;
}
vec2 src(vec2 uv){ return mix(CR.xy, CR.zw, clamp(uv, 0., 1.)); }
vec3 screenAt(vec2 uv, float lod){
  vec3 c = textureLod(T, src(uv), lod).rgb;
  // LCD subpixel grid: soft RGB bars inside a dark matrix. Each part fades to its average where it gets too small
  // to resolve (stripes first, then the rows), so it never turns into moire: far away it reads as a fine scan texture
  vec2 g = uv*vec2(PITCH*A, PITCH);
  vec2 f = fract(g);
  float sub = fract(f.x*3.);
  vec3 stripe = vec3(f.x<.333, f.x>=.333 && f.x<.666, f.x>=.666);
  stripe = mix(vec3(1.), mix(vec3(1.), stripe*2.2+.15, .55), stripeK);
  float row = mix(.8, smoothstep(0.,.2,f.y)*smoothstep(1.,.8,f.y), rowK);
  float col = mix(.86, smoothstep(0.,.14,sub)*smoothstep(1.,.86,sub), stripeK);
  // divided by its own average, so the grid adds texture without dimming the screen
  vec3 m = stripe*mix(.5,1.,row*col)/.92/mix(.9174, .8585, stripeK);
  // on bright pixels a photographed screen shows white with fine dark lines, not coloured stripes (the subpixels
  // all blow out together): the stripes go neutral there, so white isn't clipped grey
  float lum = dot(c, vec3(.299,.587,.114));
  m = mix(m, vec3(dot(m, vec3(1./3.))), .85*smoothstep(.45, .9, lum));
  return c*mix(vec3(1.), m, min(GRID, 1.)*mix(1., .6, smoothstep(.35,.9,lum)));
}
// interleaved gradient noise: a fixed, even spread of blur-tap rotations (doesn't crawl from frame to frame)
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(.06711056,.00583715)))); }
// fixed to the screen (no SEED), so a texture on the glass moves with the glass instead of crawling
float hash0(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash0(i), hash0(i+vec2(1,0)), f.x), mix(hash0(i+vec2(0,1)), hash0(i+vec2(1,1)), f.x), f.y); }
// the background at an output point: the solid colour, or a very soft wash (light from the top left, a faint glow
// low on the right), dithered so it never bands
vec3 bgAt(vec2 p){
  if (BGK < .5) return BGC;
  vec2 a = vec2(OUT.x/OUT.y, 1.);
  float g = smoothstep(.0, 1.35, length((p - vec2(.08, .98))*a));
  vec3 c = mix(BGC, BGC2, g);
  float h = 1. - smoothstep(0., .85, length((p - vec2(.92, .08))*a));
  c = mix(c, mix(BGC, BGC2, .35), h*.45);
  return c + (fract(sin(dot(p*OUT, vec2(12.9898, 78.233)))*43758.5453) - .5)/255.;
}
float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)+SEED); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }

void main(){
  A = TS.x/TS.y;
  R = rot(ROT); ex = R*vec3(1,0,0); ey = R*vec3(0,1,0); n = R*vec3(0,0,1);
  cam = vec3(0,0, .5/tan(radians(FOV)*.5)/ZOOM);
  cen = -(ex*(C.x-.5)*A + ey*(.5-C.y));
  vec3 fp = cen + ex*(F.x-.5)*A + ey*(.5-F.y);
  float fd = length(fp-cam);

  vec2 px = v*OUT; 
  vec3 h = hit(px);
  vec2 uv = h.xy; uv.y = uv.y;
  bool front = dot(rayDir(px), n) < 0.;
  // circle of confusion in output pixels
  // a lens focuses on a plane square to the camera (depth along the view), with a little field curvature kept so a
  // nearly square-on shot still softens toward its edges; the sharp band runs through the focus point
  float fz = mix(fd, cam.z - fp.z, .75), hz = mix(h.z, -rayDir(px).z*h.z, .75);
  float coc = AP * abs(1. - fz/hz) * OUT.y/1350.;
  // square-on, a flat screen is all one distance from the lens, so depth alone blurs nothing. A real macro or portrait
  // lens still softens away from where it's focused: that falloff, growing with distance from the focus point, fading
  // out as the screen tilts and real depth takes over
  float flatK = 1. - smoothstep(2., 10., abs(ROT.x) + abs(ROT.y)), dpl = length((h.xy - F)*vec2(A, 1.));
  coc += AP*.35*dpl*dpl*flatK * OUT.y/1350.;
  coc = max(coc - FSP*OUT.y/1350., 0.); // the spread: a band around the focus that stays sharp
  coc = min(coc, 90.);
  vec2 du = vec2(length(dFdx(uv)), length(dFdy(uv)));
  // how many grid cells fall in one output pixel: stripes resolve below ~1/3, rows below ~1/2
  float cpp = max(du.x*PITCH*A, du.y*PITCH);
  stripeK = 1. - smoothstep(.12, .3, cpp); rowK = 1. - smoothstep(.3, .6, cpp);
  float texPerPx = max(du.x*TS.x, du.y*TS.y);
  float lod = log2(max(texPerPx,1.)) + log2(1.+coc/5.);

  vec2 ndc = v*2.-1.;
  vec3 acc = vec3(0); float wsum = 0.; float cover = 0.;
  int N = coc < .5 ? 1 : 64; // in focus: one clean sample
  for (int i=0;i<N;i++){
    float r = N == 1 ? 0. : sqrt((float(i)+.5)/float(N))*coc;
    float a = float(i)*2.39996323 + ign(px)*6.283;
    vec2 o2 = vec2(cos(a),sin(a))*r;
    vec3 col;
    vec2 caOff = ndc*CA*(.5+coc*.02);
    for (int ch=0; ch<3; ch++){
      vec3 hh = hit(px + o2 + caOff*float(ch-1));
      vec2 u = hh.xy;
      float sd = rrect(u);
      float inside = 1.-smoothstep(-.0015, .0015, sd);
      vec3 s = screenAt(u, lod);
      // background: a layered shadow, the way real light falls: a tight contact shadow, a mid layer and a very wide,
      // faint ambient one, each thrown further from the light the softer it is. Softness widens them (up to most of
      // the screen's size); spread grows them past the screen's edge or, below zero, tucks the wide ones underneath.
      vec2 away = normalize(vec2(.5) - L + 1e-4);
      float sp = SPREAD*.05;
      float dc = max(rrect(u - away*.003), 0.);
      float dm = max(rrect(u - away*(.008 + .03*SOFT)) - sp*.5, 0.);
      float da = max(rrect(u - away*(.015 + .08*SOFT)) - sp, 0.);
      float sh = SHADOW*(.35*exp(-pow(dc/(.003 + .006*SOFT), 2.))
                       + .35*exp(-pow(dm/(.012 + .07*SOFT), 1.8))
                       + .3*exp(-pow(da/(.03 + .06*SOFT + .3*SOFT*SOFT), 1.4)));
      vec3 bg = bgAt(v)*(1. - sh*.8)*mix(vec3(1.), vec3(.96,.98,1.03), sh);
      vec3 mixc = mix(bg, s, inside);
      col[ch] = mixc[ch];
      if (ch==1) cover += inside;
    }
    acc += col; wsum += 1.;
  }
  vec3 c = acc/wsum;
  float inScreen = cover/wsum;

  // bloom: bright UI glows a little into the glass
  vec3 big = textureLod(T, src(uv), 6.).rgb;
  // (it spreads into darker neighbours like halation, so it doesn't just wash a white page out)
  c += max(big - max(c, vec3(.55)), 0.)*BLOOM*.8*inScreen;
  // light falloff over the screen (a window off to one side), plus a faint glass sheen
  float d = length((uv-L)*vec2(A,1.));
  // the light pools brighter near the window and only gently dims away from it (bright, not dingy)
  float fall = mix(1., max(.96, 1.04 - d*.1), LIGHT);
  float sheen = SHEEN*smoothstep(.35,0.,abs(dot(uv-vec2(.3,.2), normalize(vec2(1.,-.7)))));
  // (the sheen is a screen blend: it shows on darker UI and can't push a white page past white)
  c = mix(c, c*fall + sheen*(1. - clamp(c, 0., 1.)), inScreen);
  // the glass: a soft window reflected off the panel, moving as the camera moves, stronger at grazing angles
  // (Fresnel); it lifts dark UI the way a real screen does and vanishes on white
  vec3 dir = rayDir(px), rr = reflect(dir, n);
  float cosI = clamp(-dot(dir, n), 0., 1.), fres = .04 + .96*pow(1. - cosI, 5.);
  vec2 wq = rr.xy/max(rr.z, .15) - vec2(-.5, .55);
  float win = (1. - smoothstep(.15, .9, abs(wq.x)))*(1. - smoothstep(.1, .7, abs(wq.y)));
  float room = .35 + .25*rr.y;
  float lum0 = dot(c, vec3(.299,.587,.114));
  c += REFL*fres*(win*1.6 + room)*vec3(.98,.99,1.)*(1. - lum0*.85)*inScreen*1.5;
  // backlight: a faint milky glow over dark pixels toward the edges, more when seen at an angle (IPS glow)
  vec2 e2 = abs(uv - .5)*2.;
  float glow = GLOW*.06*(.35 + 1.6*(1. - cosI))*pow(max(e2.x, e2.y), 3.)*(1. - smoothstep(.0, .5, lum0));
  c += glow*vec3(.85,.88,1.)*inScreen;
  // the anti-glare coating: a fine sparkle fixed to the glass, 2 to 3 output pixels across at any distance (two
  // octaves cross-faded by scale, so it neither swims as the camera pushes in nor aliases far away), brightest on light UI
  float pu = max(du.x*A, du.y), lg = log2(max(pu*2.6, 1e-6)), o8 = floor(lg);
  vec2 gp = uv*vec2(A, 1.);
  float mt = mix(vnoise(gp/exp2(o8) + 7.1), vnoise(gp/exp2(o8 + 1.) + 3.3), lg - o8);
  c *= 1. + MATTE*.1*(mt - .5)*2.*inScreen*(.3 + .7*lum0);
  // the panel edge: pixels stop just inside the glass, a thin dark rim
  float sdc = rrect(uv);
  c *= mix(1., .55, RIM*smoothstep(-.005, -.0008, sdc)*inScreen); // only within a hair of the edge
  // Everything below belongs to the photographed screen only (weighted by inScreen), so the background stays
  // exactly the colour you set: a white page stays #ffffff, edges included.
  // tone: lifted blacks, a little desaturated, white balance
  vec3 t = c*exp2(EXPO);
  t = (t - .45)*CON + .45;
  // lift raises only the darks (black goes to LIFT, a hair cool); white stays white
  t += LIFT*vec3(1.,1.,1.12)*(1. - clamp(t, 0., 1.));
  float lum = dot(t, vec3(.2126,.7152,.0722));
  t = mix(vec3(lum), t, SAT);
  t *= vec3(1.+WARM, 1., 1.-WARM);
  // vignette
  // (kept off the highlights, so a white page doesn't go grey at the corners)
  t *= 1. - VIG*pow(length(ndc*vec2(.85,1.)), 2.4)*.5*(1. - .7*smoothstep(.7, 1., dot(t, vec3(.33))));
  // grain: fine luminance grain, strongest in the mid-tones like film, plus grit (a coarser 2px clump and a
  // touch of colour noise) so it reads as a photographed screen rather than clean pixels
  // (it stays visible in bright areas too, so a light UI still reads as photographed)
  float gl = dot(t, vec3(.2126,.7152,.0722)), mid = 1.2 - abs(gl - .5)*.9;
  float fine = hash(px+.37) - .5, clump = hash(floor(px*.5)+.71) - .5;
  vec3 chroma = vec3(hash(px+1.3), hash(px+2.9), hash(px+4.1)) - .5;
  t += (fine*(1. - .5*GRIT) + clump*GRIT)*GRAIN*mid + chroma*GRAIN*GRIT*.35*mid;
  c = mix(c, t, inScreen);
  // the stroke: a line on the screen's edge, its width in pixels of a 1080-high output (0 is off)
  if (STROKE > 0.) {
    float sE = rrect(uv), w = STROKE/1080., aa = 1./OUT.y;
    c = mix(c, vec3(1.), 1. - smoothstep(w*.5 - aa, w*.5 + aa, abs(sE)));
  }
  // the edge fade, last: a rounded-rect falloff (no crease at the corners), as wide as EDGE asks and eased twice,
  // dissolving the frame into the pure background colour
  if (EDGE > 0.) {
    vec2 hp = abs(ndc*vec2(OUT.x/OUT.y, 1.)), hs = vec2(OUT.x/OUT.y, 1.);
    float r = EDGE*.95, sd = r - length(max(hp - (hs - r), 0.));
    float m = smoothstep(0., r, sd); m = m*m*(3. - 2.*m);
    c = mix(bgAt(v), c, m);
  }
  if (FOCV > 0.) {
    // held to focus: the picture washes purple, deeper where it's out of focus, lighter where it's sharp, a line where
    // the sharp part ends, and a ring at the focus point. Let go and the real focus shows.
    float sharp = 1. - smoothstep(.75, 1.5, coc), blur = smoothstep(1.5, 12., coc);
    vec3 pur = vec3(.47, .40, 1.), wash = pur*(.55 + .45*dot(c, vec3(.33)));
    c = mix(c, wash, FOCV*(.38 + .34*blur)*(1. - .45*sharp));
    float fw = max(fwidth(coc), 1e-3), line = 1. - smoothstep(.6, 1.6, abs(coc - 1.5)/fw);
    c = mix(c, vec3(.9, .86, 1.), FOCV*.85*line);
    float df = length((uv - F)*vec2(A, 1.)), px1 = length(dFdx(uv))*1.5;
    float ring = 1. - smoothstep(px1*.6, px1*1.6, abs(df - px1*(18. + FSP*.9))), /* the ring grows with the spread */ dot0 = 1. - smoothstep(px1*1.5, px1*2.5, df);
    c = mix(c, vec3(1.), FOCV*max(ring, dot0));
  }
  o = vec4(max(c,0.), 1);
}`;