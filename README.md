# `angles`

A small studio that turns a screen recording into a calm, photographic product shot, up close and at a real angle, with a slow camera move, a real screen look and soft focus. It runs locally, and Claude can drive it too.


<div align="center">
  
[<kbd><br>haaans.com/angles<br><br></kbd>](https://haaans.com/angles)

</div>


<p align="center">
<img src="demos/hero.png" alt="Angles" width="500">
</p>

## Features

<table>
<tr valign="top">
<td width="50%">
<h3>Get up close at a real angle</h3>
<p>Close and Raking put the camera right on the action with a wide lens, steeply angled, so the screen's edges converge and the far side falls out of focus, like a photo of a real display.</p>
</td>
<td width="50%">
<img src="demos/close.gif" alt="Get up close at a real angle">
</td>
</tr>
<tr valign="top">
<td width="50%">
<img src="demos/move.gif" alt="Get a calm camera move">
</td>
<td width="50%">
<h3>Get a calm camera move</h3>
<p>Drop in a recording and the camera drifts, angles and settles on its own, kept within a motion budget so it never feels like a ride.</p>
</td>
</tr>
<tr valign="top">
<td width="50%">
<h3>Pick a style</h3>
<p>Float, Fly-by, Push, Tilt-shift, Close and more. Each one applies to the span you're in, so one clip can move several ways.</p>
</td>
<td width="50%">
<img src="demos/styles.gif" alt="Pick a style">
</td>
</tr>
<tr valign="top">
<td width="50%">
<img src="demos/focus.gif" alt="Click to focus">
</td>
<td width="50%">
<h3>Click to focus</h3>
<p>Pick a point on the picture, then scroll to set how much stays sharp. A purple overlay shows the focus while you adjust it.</p>
</td>
</tr>
<tr valign="top">
<td width="50%">
<h3>Try a screen look</h3>
<p>Bright, glossy, pixel macro, film print. Each one adds the texture of a real display while keeping whites white.</p>
</td>
<td width="50%">
<img src="demos/looks.gif" alt="Try a screen look">
</td>
</tr>
<tr valign="top">
<td width="50%">
<img src="demos/panel.gif" alt="Make room, light or dark">
</td>
<td width="50%">
<h3>Make room, light or dark</h3>
<p>Hide the panel and the frame glides out to fill the space. Switch between light and dark from the header.</p>
</td>
</tr>
<tr valign="top">
<td width="50%">
<h3>Ask Claude for the video</h3>
<p>The repo is also a Claude skill. Claude writes a ten-line spec and runs <code>node angles.mjs make spec.json</code>, which applies it in the studio and renders it on your machine. It returns the mp4 and one small contact sheet to check, so a video costs a few hundred tokens. To install it, run <code>git clone https://github.com/HansEngebretsen/angles ~/.claude/skills/angles</code> and then <code>npm i</code> in that folder.</p>
</td>
<td width="50%">
<img src="demos/skill.png" alt="Ask Claude for the video">
</td>
</tr>
</table>
