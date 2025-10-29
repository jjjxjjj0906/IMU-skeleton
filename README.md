Process Joint Web Viewer

A Next.js + Three.js viewer for the 15-sensor skeleton.

Export datasets

From repo root, export JSON from the analysis H5 files:

```bash
python export_web_dataset.py --input speed6kmh/20251006-134947_Free_Form_Analysis.h5 --output web/public/datasets/speed6kmh.json --frame-step 2
python export_web_dataset.py --input speed10kmh/20251006-135941_Free_Form_Analysis.h5 --output web/public/datasets/speed10kmh.json --frame-step 2
```

Run the web app

```bash
cd web
npm i
npm run dev
```

Open http://localhost:3000 and choose dataset. Use the slider to scrub frames, and Play/Pause to animate.

Datasets use the same centering logic as Python (lumbar/bbox with EMA, vertical lock).

