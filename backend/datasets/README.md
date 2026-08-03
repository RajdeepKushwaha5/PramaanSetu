# Detection evaluation dataset

Drop a **held-out** labelled set here to measure real detection performance:

```
backend/datasets/detection/
  authentic/   real photographs, scanned circulars, genuine screenshots
  synthetic/   real AI-generated / deepfake images (e.g. thispersondoesnotexist)
```

Then run:

```bash
npm run benchmark:detection -- --ai     # vision model + forensics
```

This writes `backend/data/detection-metrics.json`, served at
`GET /api/detection/metrics` and shown on the SupTech dashboard.

If these folders are empty, the harness falls back to a built-in **illustrative**
set (clearly labelled) so it still runs. Image files you add here are gitignored
so the repo stays small.
