import sys, numpy as np, json
from faster_whisper import WhisperModel
m=WhisperModel('models/large-v3', device='cpu', compute_type='int8')
b=np.fromfile('src/a16.f32',dtype=np.float32)
for s,e in json.loads(sys.argv[1]):
  segs,_=m.transcribe(b[int(s*16000):int(e*16000)], language='ar', beam_size=8, temperature=0.0, condition_on_previous_text=False, word_timestamps=True)
  ws=[f"{w.word.strip()}[{w.start+s:.2f}-{w.end+s:.2f}]" for z in segs for w in z.words]
  print(f'{s}-{e}:', ' '.join(ws), flush=True)
