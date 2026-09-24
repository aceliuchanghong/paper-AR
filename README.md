# Paper AR

A browser based paper tracking experiment. Point a camera at a sheet of paper and a 3D cube follows its detected corners.

## Run locally

Requires Node.js 20.19+.

```bash
npm ci
npm run dev
```

Open the local URL shown by Vite. Camera access requires HTTPS or localhost.

## How it works

- `getUserMedia` opens the camera after a user click.
- `quadscan` detects the paper quadrilateral from cropped video frames.
- Corner smoothing and Three.js draw a cube over the paper.
- Detection and rendering run in separate loops; detection errors trigger automatic recovery.

Everything runs in the browser. The first scan may download the detector model and its runtime. This is a visual AR prototype based on 2D corners, not a calibrated 3D pose estimate.

## Build

```bash
npm run build
```
